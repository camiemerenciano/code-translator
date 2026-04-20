require("dotenv").config();
const express = require("express");
const { OpenAI } = require("openai");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/login",       (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/cadastro",   (req, res) => res.sendFile(path.join(__dirname, "public/cadastro.html")));
app.get("/oferta",     (req, res) => res.sendFile(path.join(__dirname, "public/oferta.html")));
app.get("/reset-senha",(req, res) => res.sendFile(path.join(__dirname, "public/reset-senha.html")));

// Supabase admin client (backend only — usa a service role key)
const SUPABASE_URL      = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY      || process.env.SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_SVC_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;

if (!SUPABASE_URL || !SUPABASE_SVC_KEY) {
  console.warn("⚠  SUPABASE_URL ou service role key não definidos — autenticação desativada em dev.");
}
const supabase = (SUPABASE_URL && SUPABASE_SVC_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_SVC_KEY)
  : null;

const SYSTEM_PROMPT = `Você é um tradutor especializado em código de programação.
Agrupe o código em blocos lógicos e significativos — cada bloco deve representar uma ideia completa, não uma linha ou campo isolado.

Exemplos de agrupamento por linguagem:
- SQL: cláusulas principais (SELECT+colunas, FROM+JOINs, WHERE, ORDER BY/LIMIT)
- Python/JS/TS: funções completas, classes, blocos de lógica relacionada
- HTML/CSS: seções de layout, componentes
- Shell: comandos relacionados ao mesmo objetivo
- Qualquer linguagem: imports juntos, declarações juntas, lógica de negócio junta

Retorne SOMENTE um JSON válido, sem markdown, sem blocos de código, apenas o JSON puro:
{
  "parts": [
    { "id": 1, "code": "bloco de código completo", "translation": "tradução em português natural" },
    { "id": 2, "code": "próximo bloco", "translation": "tradução em português natural" }
  ]
}

Regras:
- Cada "code" deve ser copiado exatamente como está no código original
- Mínimo de 3 linhas por bloco sempre que possível — nunca separe campos ou linhas individuais
- Entre 3 e 10 partes no total, independente do tamanho do código
- Traduza de forma simples e cotidiana, sem jargão técnico
- Retorne apenas o JSON, sem nenhum texto antes ou depois`;

const ERROR_PROMPT = `Você é um especialista em interpretar mensagens de erro de sistemas e APIs.
Analise o JSON de erro recebido e explique em português simples, agrupando as informações por tema.

Agrupe assim:
1. O problema principal (mensagem de erro + código de status)
2. Detalhes do contexto (qual sistema, operação, versão)
3. Onde aconteceu (stack trace resumido — não liste cada linha, resuma)
4. O que provavelmente causou e como resolver

Retorne SOMENTE um JSON válido, sem markdown, sem blocos de código, apenas o JSON puro:
{
  "parts": [
    { "id": 1, "code": "trecho relevante do erro", "translation": "explicação em português simples" },
    { "id": 2, "code": "próximo trecho relevante", "translation": "explicação em português simples" }
  ]
}

Regras:
- Máximo de 5 partes — agrupe campos relacionados em um único bloco
- Em "code" coloque os campos do JSON original agrupados (não um campo por vez)
- Em "translation" explique de forma clara, como se falasse com alguém leigo
- Retorne apenas o JSON, sem nenhum texto antes ou depois`;

// ── Middleware: verifica JWT do Supabase ──────────────────────────────────────
async function requireAuth(req, res, next) {
  // Se Supabase não está configurado (dev local sem .env), permite passar
  if (!supabase) return next();

  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Não autenticado." });
  }

  const token = auth.slice(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    return res.status(401).json({ error: "Sessão inválida ou expirada." });
  }

  req.user = data.user;
  next();
}

// ── Rotas ─────────────────────────────────────────────────────────────────────
app.get("/api/status", (req, res) => {
  res.json({ provider: "openai", model: "gpt-4o-mini", ok: true });
});

// Expõe apenas as variáveis seguras para o frontend
app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl:     SUPABASE_URL,
    supabaseAnonKey: SUPABASE_ANON_KEY,
  });
});

app.post("/api/recuperar-senha", async (req, res) => {
  if (!supabase) return res.status(500).json({ error: "Supabase não configurado." });

  const { email } = req.body;
  if (!email) return res.status(400).json({ error: "E-mail obrigatório." });

  const redirectTo = process.env.APP_URL
    ? `${process.env.APP_URL}/reset-senha`
    : "http://localhost:3000/reset-senha";

  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo },
  });

  if (error) return res.status(400).json({ error: error.message });

  const link = data?.properties?.action_link;
  if (!link) return res.status(500).json({ error: "Erro ao gerar link de recuperação." });

  const RESEND_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_KEY) return res.status(500).json({ error: "Serviço de e-mail não configurado." });

  const emailRes = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "noreply@husers.com.br",
      to: email,
      subject: "Recuperação de senha — Tradutor de Código",
      html: `
        <p>Olá,</p>
        <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
        <p><a href="${link}" style="background:#C1440E;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;display:inline-block;">Redefinir senha</a></p>
        <p style="color:#888;font-size:12px;">Se você não solicitou isso, ignore este e-mail. O link expira em 1 hora.</p>
      `,
    }),
  });

  if (!emailRes.ok) {
    const err = await emailRes.json();
    return res.status(500).json({ error: "Erro ao enviar e-mail: " + (err.message || emailRes.status) });
  }

  res.json({ ok: true });
});

app.post("/api/cadastro", async (req, res) => {
  if (!supabase) return res.status(500).json({ error: "Supabase não configurado." });

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "E-mail e senha obrigatórios." });

  // signUp com cliente anon para salvar senha corretamente
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: signUpData, error: signUpError } = await anonClient.auth.signUp({ email, password });

  if (signUpError) {
    if (signUpError.message.includes("already registered")) return res.status(400).json({ error: "Este e-mail já está cadastrado." });
    return res.status(400).json({ error: signUpError.message });
  }

  const userId = signUpData.user?.id;
  if (!userId) return res.status(500).json({ error: "Erro ao criar usuário." });

  // Confirma o e-mail via admin para não precisar de verificação
  await supabase.auth.admin.updateUserById(userId, { email_confirm: true });

  res.json({ ok: true });
});

app.get("/api/uso", requireAuth, async (req, res) => {
  if (!supabase) return res.json({ count: 0 });
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase
    .from("daily_usage")
    .select("count")
    .eq("user_id", req.user.id)
    .eq("date", today)
    .single();
  res.json({ count: data?.count || 0 });
});

app.post("/api/detectar", requireAuth, async (req, res) => {
  const { codigo } = req.body;
  if (!codigo) return res.status(400).json({ error: "Campo obrigatório: codigo" });

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: "Chave OpenAI não configurada no servidor." });

  try {
    const openai = new OpenAI({ apiKey: key });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: `Você é um detector de linguagens de programação. Analise o código e retorne a linguagem correta.

Regras de prioridade (siga nesta ordem):
1. Se a estrutura raiz do conteúdo é um objeto JSON ({ }) ou array JSON ([ ]), retorne "JSON" — mesmo que strings internas contenham código de outras linguagens ou stack traces.
2. Se contém tags HTML (<html>, <div>, <p>, etc.) junto com CSS, retorne "HTML / CSS".
3. Se começa com SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, retorne "SQL".
4. Se usa indentação obrigatória, def/class sem chaves, import sem ponto e vírgula, retorne "Python".
5. TypeScript só deve ser retornado se o código contém tipos explícitos (: string, : number, interface, type X =, as X, <>).
6. Se parece JavaScript mas sem tipos explícitos, retorne "JavaScript".
7. Para Shell/Bash: linhas começando com $, #!, comandos como apt/yum/grep/awk.
8. Para Java: public class, System.out, @Override, void main.
9. Para C#: using System, Console.WriteLine, namespace, .cs patterns.
10. Para Go: package main, func , import (, :=.
11. Para Kotlin: fun , val , var , data class.
12. Para Swift: import UIKit, var , let , func  com -> tipo.
13. Para Rust: fn main(), let mut, use std::, ownership patterns.
14. Para Ruby: def/end, puts, require, símbolos com :.
15. Para PHP: <?php, echo, $variavel.
16. Para C/C++: #include, int main(), printf, ponteiros com *.

Retorne SOMENTE: { "linguagem": "valor exato" }
Valores aceitos: SQL, Python, JavaScript, TypeScript, Java, C#, C / C++, PHP, Ruby, Go, Shell / Bash, HTML / CSS, Kotlin, Swift, Rust, JSON
Se não reconhecer nenhuma, retorne: { "linguagem": null }`,
        },
        { role: "user", content: codigo },
      ],
    });
    const { linguagem } = JSON.parse(completion.choices[0].message.content);
    res.json({ linguagem });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erro desconhecido" });
  }
});

app.post("/api/traduzir", requireAuth, async (req, res) => {
  const { codigo, linguagem } = req.body;

  if (!codigo || !linguagem) {
    return res.status(400).json({ error: "Campos obrigatórios: codigo, linguagem" });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(500).json({ error: "Chave OpenAI não configurada no servidor." });
  }

  try {
    const openai = new OpenAI({ apiKey: key });

    const isJson = linguagem === "JSON";
    const prompt = isJson ? ERROR_PROMPT : SYSTEM_PROMPT;
    const userContent = isJson
      ? `Conteúdo JSON:\n${codigo}`
      : `Linguagem: ${linguagem}\n\nCódigo:\n${codigo}`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: userContent },
      ],
    });

    const raw = completion.choices[0].message.content;

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return res.status(500).json({ error: "O modelo retornou um JSON inválido. Tente novamente." });
    }

    if (!parsed.parts || !Array.isArray(parsed.parts)) {
      return res.status(500).json({ error: "Resposta inesperada do modelo. Tente novamente." });
    }

    // Registra uso diário
    if (supabase && req.user) {
      const today = new Date().toISOString().slice(0, 10);
      await supabase.rpc("increment_daily_usage", { uid: req.user.id, d: today });
    }

    res.json({ parts: parsed.parts });
  } catch (err) {
    let msg = err.message || "Erro desconhecido";
    if (err.status === 401) msg = "Chave OpenAI inválida no servidor.";
    else if (err.status === 429) msg = "Limite de requisições atingido. Aguarde e tente novamente.";
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`\n🔤 Tradutor de Código rodando em http://localhost:${PORT}\n`);
});
