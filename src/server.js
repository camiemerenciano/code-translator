require("dotenv").config();
const express = require("express");
const { OpenAI } = require("openai");
const { createClient } = require("@supabase/supabase-js");
const Stripe = require("stripe");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

// Webhook Stripe precisa do body RAW — deve vir ANTES do express.json()
app.post("/api/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return res.status(500).send("Webhook secret não configurado.");

  const sig = req.headers["stripe-signature"];
  let event;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("Webhook inválido:", err.message);
    return res.status(400).send(`Webhook error: ${err.message}`);
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const email = session.customer_details?.email || session.customer_email;

    if (email && supabase) {
      try {
        // Busca direta por e-mail — evita paginação de listUsers()
        const { data, error } = await supabase.auth.admin.getUserByEmail(email);
        if (error || !data?.user) {
          console.warn(`⚠ Pagamento recebido mas usuário não encontrado: ${email}`);
        } else {
          await supabase.auth.admin.updateUserById(data.user.id, {
            user_metadata: {
              ...data.user.user_metadata,
              paid: true,
              paid_at: new Date().toISOString(),
            },
          });
          console.log(`✅ Acesso liberado para: ${email}`);
        }
      } catch (err) {
        console.error(`❌ Erro ao liberar acesso para ${email}:`, err.message);
      }
    }
  }

  res.json({ received: true });
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/login",       (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/cadastro",   (req, res) => res.sendFile(path.join(__dirname, "public/cadastro.html")));
app.get("/oferta",     (req, res) => res.sendFile(path.join(__dirname, "public/oferta.html")));
app.get("/reset-senha",(req, res) => res.sendFile(path.join(__dirname, "public/reset-senha.html")));
app.get("/sucesso",    (req, res) => res.sendFile(path.join(__dirname, "public/sucesso.html")));

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

// Cliente anon reutilizável para cadastro (evita recriar a cada request)
const supabaseAnon = (SUPABASE_URL && SUPABASE_ANON_KEY)
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

const EXPLAIN_PROMPT = `Você receberá blocos de código numerados. Para cada bloco, faça uma TRADUÇÃO LITERAL e DETALHADA para o português — como se estivesse traduzindo de um idioma para outro, parte por parte, em linguagem do dia a dia. Explique cada linha ou instrução do bloco.

Exemplos do estilo esperado:

Bloco: "lista = []\ncontador = 0"
→ "Crie uma lista vazia chamada 'lista'. Crie uma variável chamada 'contador' com valor 0."

Bloco: "while contador < 5:\n    numero = int(input('Digite um número: '))\n    lista.append(numero)\n    contador += 1"
→ "Enquanto o contador for menor que 5, repita: peça ao usuário que digite um número, converta para inteiro e guarde em 'numero'. Adicione esse número à lista. Some 1 ao contador."

Regras:
- Explique cada linha ou instrução separadamente dentro da resposta
- Use linguagem natural, cotidiana, sem termos técnicos
- Não copie código na resposta

Além das explicações, avalie o código inteiro e retorne duas métricas:
- "boasPraticas": nota de 0 a 10 e um comentário curto (1 frase) explicando o ponto principal
- "seguranca": nota de 0 a 10 e um comentário curto (1 frase) sobre o principal risco ou ponto positivo de segurança

Retorne SOMENTE este JSON:
{
  "explicacoes": ["tradução detalhada do bloco 1", "tradução detalhada do bloco 2", ...],
  "boasPraticas": { "nota": 7, "comentario": "Código organizado, mas sem tratamento de erros." },
  "seguranca": { "nota": 5, "comentario": "Entrada do usuário não está sendo validada." }
}`;

const EXPLAIN_JSON_PROMPT = `Você receberá um JSON de erro de sistema. Traduza cada parte importante para português simples — o que deu errado, onde aconteceu, e o que fazer. Máximo 5 frases, uma por grupo de informação. Não copie o JSON na resposta.

Retorne SOMENTE este JSON:
{
  "explicacoes": ["tradução 1", "tradução 2", ...],
  "boasPraticas": { "nota": 0, "comentario": "Não aplicável — este é um JSON de erro, não código executável." },
  "seguranca": { "nota": 0, "comentario": "Não aplicável — este é um JSON de erro, não código executável." }
}`;

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
  if (!supabase || !supabaseAnon) return res.status(500).json({ error: "Supabase não configurado." });

  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "E-mail e senha obrigatórios." });

  const { data: signUpData, error: signUpError } = await supabaseAnon.auth.signUp({ email, password });

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

// ── Histórico ────────────────────────────────────────────────────────────────
app.get("/api/historico", requireAuth, async (req, res) => {
  if (!supabase) return res.json({ historico: [] });
  const { data, error } = await supabase
    .from("historico")
    .select("id, tipo, linguagem, linguagem_destino, codigo, codigo_convertido, parts, boas_praticas, seguranca, criado_em")
    .eq("user_id", req.user.id)
    .order("criado_em", { ascending: false })
    .limit(50);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ historico: data });
});

app.post("/api/historico", requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true });
  const { tipo, linguagem, linguagemDestino, codigo, codigoConvertido, parts, boasPraticas, seguranca } = req.body;
  if (!linguagem || !codigo) return res.status(400).json({ error: "Campos obrigatórios ausentes." });
  const { error } = await supabase.from("historico").insert({
    user_id:           req.user.id,
    tipo:              tipo              ?? "traducao",
    linguagem,
    linguagem_destino: linguagemDestino  ?? null,
    codigo,
    codigo_convertido: codigoConvertido  ?? null,
    parts:             parts             ?? null,
    boas_praticas:     boasPraticas      ?? null,
    seguranca:         seguranca         ?? null,
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.delete("/api/historico/:id", requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true });
  const { error } = await supabase
    .from("historico")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

app.delete("/api/historico", requireAuth, async (req, res) => {
  if (!supabase) return res.json({ ok: true });
  const { error } = await supabase
    .from("historico")
    .delete()
    .eq("user_id", req.user.id);
  if (error) return res.status(500).json({ error: error.message });
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
  if (linguagem === 'JSON') return [code];

  // SQL: agrupa por cláusula (SELECT, FROM, WHERE etc. ficam juntos com suas colunas)
  if (linguagem === 'SQL') {
    const lines = code.split('\n');
    const blocks = [];
    let current = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|FROM|WHERE|INNER JOIN|LEFT JOIN|RIGHT JOIN|JOIN|GROUP BY|ORDER BY|HAVING|SET|VALUES|LIMIT)\b/i.test(t) && current.length > 0) {
        blocks.push(current.join('\n').trim());
        current = [line];
      } else {
        current.push(line);
      }
    }
    if (current.length) blocks.push(current.join('\n').trim());
    return blocks.length ? blocks : [code];
  }

  // Todas as outras linguagens: linha por linha
  // Ignora linhas que são apenas chaves/colchetes de fechamento (sem conteúdo semântico)
  const blocks = code
    .split('\n')
    .map(l => l.trimEnd())
    .filter(l => {
      const t = l.trim();
      return t && !/^[}\]){;]+$/.test(t);
    });

  return blocks.length ? blocks : [code];
}

const MAX_CODIGO_LENGTH = 8000;

app.post("/api/traduzir", requireAuth, async (req, res) => {
  const { codigo, linguagem } = req.body;

  if (!codigo || !linguagem) {
    return res.status(400).json({ error: "Campos obrigatórios: codigo, linguagem" });
  }

  if (codigo.length > MAX_CODIGO_LENGTH) {
    return res.status(400).json({ error: `Código muito longo. Máximo permitido: ${MAX_CODIGO_LENGTH} caracteres.` });
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

    // Registra uso diário — isolado para não afetar a resposta em caso de falha
    let usageCount = null;
    if (supabase && req.user) {
      try {
        const today = new Date().toISOString().slice(0, 10);
        await supabase.rpc("increment_daily_usage", { uid: req.user.id, d: today });
        const { data: usage } = await supabase
          .from("daily_usage")
          .select("count")
          .eq("user_id", req.user.id)
          .eq("date", today)
          .single();
        usageCount = usage?.count ?? null;
      } catch (usageErr) {
        console.error("Erro ao registrar uso:", usageErr.message);
      }
    }

    const boasPraticas = parsed.boasPraticas ?? null;
    const seguranca    = parsed.seguranca    ?? null;

    res.json({ parts, usageCount, boasPraticas, seguranca });
  } catch (err) {
    let msg = err.message || "Erro desconhecido";
    if (err.status === 401) msg = "Chave OpenAI inválida no servidor.";
    else if (err.status === 429) msg = "Limite de requisições atingido. Aguarde e tente novamente.";
    res.status(500).json({ error: msg });
  }
});

app.post("/api/converter", requireAuth, async (req, res) => {
  const { codigo, linguagemOrigem, linguagemDestino } = req.body;

  if (!codigo || !linguagemOrigem || !linguagemDestino) {
    return res.status(400).json({ error: "Campos obrigatórios: codigo, linguagemOrigem, linguagemDestino" });
  }
  if (linguagemOrigem === linguagemDestino) {
    return res.status(400).json({ error: "As linguagens precisam ser diferentes." });
  }
  if (codigo.length > MAX_CODIGO_LENGTH) {
    return res.status(400).json({ error: `Código muito longo. Máximo: ${MAX_CODIGO_LENGTH} caracteres.` });
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) return res.status(500).json({ error: "Chave OpenAI não configurada." });

  try {
    const openai = new OpenAI({ apiKey: key });
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: `Você é um especialista em conversão de código entre linguagens de programação.
Converta o código de ${linguagemOrigem} para ${linguagemDestino} mantendo a mesma lógica e funcionalidade.
Retorne SOMENTE o código convertido, sem explicações, sem blocos markdown, sem comentários extras.
O código deve ser funcional e seguir as convenções e idiomas da linguagem ${linguagemDestino}.`,
        },
        {
          role: "user",
          content: `Converta de ${linguagemOrigem} para ${linguagemDestino}:\n\n${codigo}`,
        },
      ],
    });

    const codigoConvertido = completion.choices[0].message.content
      .replace(/^```[\w]*\n?/, "").replace(/\n?```$/, "").trim();

    res.json({ codigoConvertido });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erro ao converter código." });
  }
});

app.post("/api/create-checkout-session", async (req, res) => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return res.status(500).json({ error: "Stripe não configurado no servidor." });

  try {
    const stripe = new Stripe(key);
    const baseUrl = process.env.APP_URL || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [{
        price_data: {
          currency: "brl",
          product_data: { name: "Nunca Mais Trave em Código" },
          unit_amount: 1000,
        },
        quantity: 1,
      }],
      mode: "payment",
      success_url: `${baseUrl}/sucesso?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/oferta`,
    });

    res.json({ url: session.url });
  } catch (err) {
    res.status(500).json({ error: err.message || "Erro ao criar sessão de pagamento." });
  }
});

app.listen(PORT, () => {
  console.log(`\n🔤 Tradutor de Código rodando em http://localhost:${PORT}\n`);
});
