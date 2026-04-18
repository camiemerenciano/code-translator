const btnTraduzir   = document.getElementById("btnTraduzir");
const btnLimpar     = document.getElementById("btnLimpar");
const btnExemplo    = document.getElementById("btnExemplo");
const btnCopiar     = document.getElementById("btnCopiar");
const btnSalvarKey  = document.getElementById("btnSalvarKey");
const btnEditar     = document.getElementById("btnEditar");
const inputCodigo   = document.getElementById("inputCodigo");
const codeColored   = document.getElementById("codeColored");
const codeColoredContent = document.getElementById("codeColoredContent");
const outputEl      = document.getElementById("outputTraducao");
const statusEl      = document.getElementById("status");
const apiKeyInput   = document.getElementById("apiKey");

const COLORS = [
  { bg: "#2a3556", text: "#89b4fa", border: "#89b4fa" },
  { bg: "#1e3328", text: "#a6e3a1", border: "#a6e3a1" },
  { bg: "#38321a", text: "#f9e2af", border: "#f9e2af" },
  { bg: "#38251a", text: "#fab387", border: "#fab387" },
  { bg: "#381a23", text: "#f38ba8", border: "#f38ba8" },
  { bg: "#2a1e3b", text: "#cba6f7", border: "#cba6f7" },
  { bg: "#1a3030", text: "#94e2d5", border: "#94e2d5" },
  { bg: "#38202a", text: "#eba0ac", border: "#eba0ac" },
];

// Recupera key salva
const savedKey = localStorage.getItem("openai_api_key");
if (savedKey) {
  apiKeyInput.value = savedKey;
  apiKeyInput.style.color = "#a6e3a1";
}

btnSalvarKey.addEventListener("click", () => {
  const key = apiKeyInput.value.trim();
  if (!key) return setStatus("Digite uma API Key", "err");
  localStorage.setItem("openai_api_key", key);
  apiKeyInput.style.color = "#a6e3a1";
  setStatus("✓ API Key salva", "ok");
});

btnTraduzir.addEventListener("click", traduzir);
btnLimpar.addEventListener("click", limpar);
btnCopiar.addEventListener("click", copiar);
btnExemplo.addEventListener("click", carregarExemplo);
btnEditar.addEventListener("click", voltarParaEditar);

inputCodigo.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") traduzir();
});

async function traduzir() {
  const codigo = inputCodigo.value.trim();
  const linguagem = document.getElementById("linguagem").value;
  const apiKey = apiKeyInput.value.trim() || localStorage.getItem("openai_api_key") || "";

  if (!codigo) return setStatus("⚠ Cole um código primeiro", "err");
  if (!apiKey)  return setStatus("⚠ Informe a API Key", "err");

  setStatus("Traduzindo...", "loading");
  btnTraduzir.disabled = true;
  btnTraduzir.textContent = "Traduzindo...";
  outputEl.innerHTML = `<div class="loading-msg">⏳ Analisando o código...</div>`;

  try {
    const res = await fetch("/api/traduzir", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo, linguagem, apiKey }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.parts?.length) throw new Error("Nenhuma parte retornada. Tente novamente.");

    renderResultado(codigo, data.parts);
    setStatus("✓ Tradução concluída", "ok");
  } catch (err) {
    outputEl.innerHTML = "";
    setStatus("✗ " + err.message, "err");
  } finally {
    btnTraduzir.disabled = false;
    btnTraduzir.textContent = "▶ Traduzir";
  }
}

function renderResultado(codigoOriginal, parts) {
  // --- Painel esquerdo: código colorido ---
  let html = esc(codigoOriginal);
  parts.forEach((part, i) => {
    const cor = COLORS[i % COLORS.length];
    const escaped = esc(part.code);
    // substitui a primeira ocorrência do trecho no HTML já escapado
    html = html.replace(
      escaped,
      `<mark class="cm" style="background:${cor.bg};color:${cor.text};outline:1px solid ${cor.border}22">${escaped}</mark>`
    );
  });
  codeColoredContent.innerHTML = html;

  // Troca textarea pelo painel colorido
  inputCodigo.classList.add("hidden");
  codeColored.classList.remove("hidden");

  // --- Painel direito: traduções ---
  outputEl.innerHTML = parts.map((part, i) => {
    const cor = COLORS[i % COLORS.length];
    return `
      <div class="translation-part">
        <div class="part-code" style="background:${cor.bg};color:${cor.text}">
          ${esc(part.code)}
        </div>
        <div class="part-translation" style="border-left:3px solid ${cor.border}">
          <span class="part-arrow" style="color:${cor.border}">→</span>
          ${esc(part.translation)}
        </div>
      </div>`;
  }).join("");
}

function voltarParaEditar() {
  inputCodigo.classList.remove("hidden");
  codeColored.classList.add("hidden");
  outputEl.innerHTML = "";
  setStatus("", "");
  inputCodigo.focus();
}

function limpar() {
  inputCodigo.value = "";
  inputCodigo.classList.remove("hidden");
  codeColored.classList.add("hidden");
  codeColoredContent.innerHTML = "";
  outputEl.innerHTML = "";
  setStatus("", "");
  inputCodigo.focus();
}

function copiar() {
  const partes = [...outputEl.querySelectorAll(".part-translation")]
    .map((el) => el.textContent.replace("→", "").trim())
    .join(" ");
  if (!partes) return setStatus("Nada para copiar", "err");
  navigator.clipboard.writeText(partes).then(() => setStatus("✓ Copiado!", "ok"));
}

function carregarExemplo() {
  voltarParaEditar();
  document.getElementById("linguagem").value = "SQL";
  inputCodigo.value =
    "SELECT p.nome, p.preco, c.descricao\n" +
    "FROM Produto p\n" +
    "INNER JOIN Categoria c ON p.categoria_id = c.id\n" +
    "WHERE p.preco > 100\n" +
    "ORDER BY p.preco DESC\n" +
    "LIMIT 10;";
  inputCodigo.focus();
}

function setStatus(msg, type) {
  statusEl.textContent = msg;
  statusEl.className = "status " + (type || "");
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
