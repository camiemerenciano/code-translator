require("dotenv").config();
const express = require("express");
const { OpenAI } = require("openai");
const { createClient } = require("@supabase/supabase-js");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/login",    (req, res) => res.sendFile(path.join(__dirname, "public/login.html")));
app.get("/cadastro", (req, res) => res.sendFile(path.join(__dirname, "public/cadastro.html")));

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
Quebre o código recebido em partes lógicas e traduza cada parte para português simples,
como se explicasse para alguém que nunca programou.

Retorne SOMENTE um JSON válido, sem markdown, sem blocos de código, apenas o JSON puro:
{
  "parts": [
    { "id": 1, "code": "trecho do código", "translation": "tradução em português natural" },
    { "id": 2, "code": "próximo trecho", "translation": "tradução em português natural" }
  ]
}

Regras:
- Cada "code" deve ser copiado exatamente como está no código original
- Use no máximo 8 partes
- Traduza de forma simples e cotidiana, sem jargão técnico
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

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Linguagem: ${linguagem}\n\nCódigo:\n${codigo}` },
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
