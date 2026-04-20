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

const EXPLAIN_PROMPT = `Você receberá blocos de código numerados. Para cada bloco, faça uma TRADUÇÃO LITERAL para o português — como se estivesse traduzindo de um idioma para outro, palavra por palavra ou expressão por expressão, em linguagem do dia a dia.

Exemplos do estilo esperado:
- "SELECT * FROM Produto WHERE codigo = 2" → "Me dê todas as colunas da tabela Produto onde o código for 2"
- "if (idade >= 18)" → "Se a idade for maior ou igual a 18"
- "def calcularDesconto(preco, percentual):" → "Crie uma função chamada calcularDesconto que recebe o preço e o percentual"
- "return preco * (1 - percentual / 100)" → "Retorne o preço multiplicado por 1 menos o percentual dividido por 100"
- "import mysql.connector" → "Importe a biblioteca mysql.connector"
- "for item in lista:" → "Para cada item na lista, faça:"
- "connection.close()" → "Feche a conexão"

Regras:
- Traduza o que está escrito, não interprete ou explique o propósito
- Use linguagem natural e cotidiana
- Não copie código na resposta

Retorne SOMENTE este JSON:
{ "explicacoes": ["tradução do bloco 1", "tradução do bloco 2", ...] }`;

const EXPLAIN_JSON_PROMPT = `Você receberá um JSON de erro de sistema. Traduza cada parte importante para português simples — o que deu errado, onde aconteceu, e o que fazer. Máximo 5 frases, uma por grupo de informação. Não copie o JSON na resposta.

Retorne SOMENTE este JSON:
{ "explicacoes": ["tradução 1", "tradução 2", ...] }`;

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

function splitBlocks(code, linguagem) {
  const lines = code.split('\n');
  const blocks = [];
  let current = [];

  const isBlockStart = (line) => {
    const t = line.trim();
    if (linguagem === 'Python')
      return /^(def |class |async def )/.test(t);
    if (linguagem === 'JavaScript' || linguagem === 'TypeScript')
      return /^(function |class |const |let |var |async function |export )/.test(t);
    if (linguagem === 'SQL')
      return /^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i.test(t);
    // Para outras linguagens, divide por linhas em branco
    return !t && current.length > 0;
  };

  for (const line of lines) {
    if (isBlockStart(line)) {
      if (current.join('').trim()) blocks.push(current.join('\n').trim());
      current = line.trim() ? [line] : [];
    } else {
      current.push(line);
    }
  }
  if (current.join('').trim()) blocks.push(current.join('\n').trim());

  // Mescla blocos muito pequenos (< 2 linhas não-vazias) com o próximo
  const merged = [];
  let acc = '';
  for (let i = 0; i < blocks.length; i++) {
    acc = acc ? acc + '\n' + blocks[i] : blocks[i];
    const nonEmpty = acc.split('\n').filter(l => l.trim()).length;
    if (nonEmpty >= 2 || i === blocks.length - 1) {
      merged.push(acc);
      acc = '';
    }
  }
  if (acc) merged.push(acc);

  return merged.length ? merged : [code];
}

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

    const blocks = isJson ? [codigo] : splitBlocks(codigo, linguagem);
    const prompt = isJson ? EXPLAIN_JSON_PROMPT : EXPLAIN_PROMPT;
    const userContent = isJson
      ? `JSON:\n${codigo}`
      : blocks.map((b, i) => `Bloco ${i + 1}:\n${b}`).join('\n\n---\n\n');

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

    if (!parsed.explicacoes || !Array.isArray(parsed.explicacoes)) {
      return res.status(500).json({ error: "Resposta inesperada do modelo. Tente novamente." });
    }

    const parts = blocks.map((trecho, i) => ({
      id: i + 1,
      trecho,
      explicacao: parsed.explicacoes[i] || '',
    }));

    // Registra uso diário e retorna contagem atualizada
    let usageCount = null;
    if (supabase && req.user) {
      const today = new Date().toISOString().slice(0, 10);
      await supabase.rpc("increment_daily_usage", { uid: req.user.id, d: today });
      const { data: usage } = await supabase
        .from("daily_usage")
        .select("count")
        .eq("user_id", req.user.id)
        .eq("date", today)
        .single();
      usageCount = usage?.count ?? null;
    }

    res.json({ parts, usageCount });
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
