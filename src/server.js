require("dotenv").config();
const express = require("express");
const { OpenAI } = require("openai");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

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

app.get("/api/status", (req, res) => {
  res.json({ provider: "openai", model: "gpt-4o-mini", ok: true });
});

app.post("/api/traduzir", async (req, res) => {
  const { codigo, linguagem, apiKey } = req.body;

  if (!codigo || !linguagem) {
    return res.status(400).json({ error: "Campos obrigatórios: codigo, linguagem" });
  }

  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    return res.status(401).json({ error: "API Key da OpenAI não informada" });
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

    res.json({ parts: parsed.parts });
  } catch (err) {
    let msg = err.message || "Erro desconhecido";
    if (err.status === 401) msg = "API Key inválida. Verifique sua chave.";
    else if (err.status === 429) msg = "Limite de requisições atingido. Aguarde e tente novamente.";
    res.status(500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`\n🔤 Tradutor de Código rodando em http://localhost:${PORT}\n`);
});
