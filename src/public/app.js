const btnTraduzir  = document.getElementById("btnTraduzir");
const btnLimpar    = document.getElementById("btnLimpar");
const btnExemplo   = document.getElementById("btnExemplo");
const btnCopiar    = document.getElementById("btnCopiar");
const btnLogout    = document.getElementById("btnLogout");
const btnEditar    = document.getElementById("btnEditar");
const inputCodigo  = document.getElementById("inputCodigo");
const codeColored  = document.getElementById("codeColored");
const codeColoredContent = document.getElementById("codeColoredContent");
const outputEl     = document.getElementById("outputTraducao");
const statusEl     = document.getElementById("status");

const COLORS = [
  { bg: "#3d1a0a", text: "#E8956D", border: "#C1440E" },
  { bg: "#2a1500", text: "#f9c784", border: "#d97b00" },
  { bg: "#1e1000", text: "#e0a060", border: "#b06020" },
  { bg: "#3a0e0e", text: "#f4826e", border: "#c0392b" },
  { bg: "#2e1a08", text: "#dba070", border: "#a05020" },
  { bg: "#1a1200", text: "#c8a060", border: "#906030" },
  { bg: "#3b1208", text: "#f09070", border: "#b03010" },
  { bg: "#251800", text: "#d49060", border: "#8b4513" },
];

btnTraduzir.addEventListener("click", traduzir);
btnLimpar.addEventListener("click", limpar);
btnCopiar.addEventListener("click", copiar);
btnExemplo.addEventListener("click", carregarExemplo);
btnLogout.addEventListener("click", logout);
btnEditar.addEventListener("click", voltarParaEditar);

inputCodigo.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") traduzir();
});

async function traduzir() {
  const codigo = inputCodigo.value.trim();
  const linguagem = document.getElementById("linguagem").value;
  const token = getAccessToken();

  if (!codigo) return setStatus("⚠ Cole um código primeiro", "err");
  if (!token)  return setStatus("⚠ Sessão expirada, faça login novamente", "err");

  setStatus("Traduzindo...", "loading");
  btnTraduzir.disabled = true;
  btnTraduzir.textContent = "Traduzindo...";
  outputEl.innerHTML = `<div class="loading-msg">⏳ Analisando o código...</div>`;

  try {
    const res = await fetch("/api/traduzir", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ codigo, linguagem }),
    });

    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.parts?.length) throw new Error("Nenhuma parte retornada. Tente novamente.");

    renderResultado(codigo, data.parts);
    setStatus("✓ Tradução concluída", "ok");
    atualizarContador();
  } catch (err) {
    outputEl.innerHTML = "";
    setStatus("✗ " + err.message, "err");
  } finally {
    btnTraduzir.disabled = false;
    btnTraduzir.textContent = "→ Traduzir";
  }
}

function renderResultado(codigoOriginal, parts) {
  let html = esc(codigoOriginal);
  parts.forEach((part, i) => {
    const cor = COLORS[i % COLORS.length];
    const escaped = esc(part.code);
    html = html.replace(
      escaped,
      `<mark class="cm" style="background:${cor.bg};color:${cor.text};outline:1px solid ${cor.border}33">${escaped}</mark>`
    );
  });
  codeColoredContent.innerHTML = html;

  inputCodigo.classList.add("hidden");
  codeColored.classList.remove("hidden");

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

async function atualizarContador() {
  const token = getAccessToken();
  if (!token) return;
  const res = await fetch("/api/uso", { headers: { Authorization: `Bearer ${token}` } });
  const { count } = await res.json();
  const el = document.getElementById("usageCount");
  if (el) el.textContent = `${count} ${count !== 1 ? "traduções" : "tradução"} hoje`;
}

atualizarContador();

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
