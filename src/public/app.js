const btnTraduzir        = document.getElementById("btnTraduzir");
const btnLimpar          = document.getElementById("btnLimpar");
const btnCopiar          = document.getElementById("btnCopiar");
const btnLogout          = document.getElementById("btnLogout");
const btnEditar          = document.getElementById("btnEditar");
const btnDetectar        = document.getElementById("btnDetectar");
const btnHistorico       = document.getElementById("btnHistorico");
const btnFecharHistorico = document.getElementById("btnFecharHistorico");
const btnLimparHistorico = document.getElementById("btnLimparHistorico");
const historicoPanel     = document.getElementById("historicoPanel");
const historicoOverlay   = document.getElementById("historicoOverlay");
const historicoLista     = document.getElementById("historicoLista");
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
btnLogout.addEventListener("click", logout);
btnEditar.addEventListener("click", voltarParaEditar);
btnDetectar.addEventListener("click", detectarLinguagem);
btnHistorico.addEventListener("click", abrirHistorico);
btnFecharHistorico.addEventListener("click", fecharHistorico);
btnLimparHistorico.addEventListener("click", limparHistorico);
historicoOverlay.addEventListener("click", fecharHistorico);

inputCodigo.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "Enter") traduzir();
});

async function detectarLinguagem() {
  const codigo = inputCodigo.value.trim();
  const token = getAccessToken();
  if (!codigo) return setStatus("⚠ Cole um código primeiro", "err");
  if (!token)  return setStatus("⚠ Sessão expirada, faça login novamente", "err");

  // Detecta JSON localmente sem chamar a API
  try {
    JSON.parse(codigo);
    document.getElementById("linguagem").value = "JSON";
    return setStatus("✓ Linguagem detectada: JSON", "ok");
  } catch {}

  btnDetectar.disabled = true;
  btnDetectar.textContent = "Detectando...";
  setStatus("Detectando linguagem...", "loading");

  try {
    const res = await fetch("/api/detectar", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ codigo }),
    });
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    if (!data.linguagem) return setStatus("⚠ Não foi possível detectar a linguagem", "err");

    const select = document.getElementById("linguagem");
    const option = [...select.options].find(o => o.value === data.linguagem);
    if (option) {
      select.value = data.linguagem;
      setStatus(`✓ Linguagem detectada: ${data.linguagem}`, "ok");
    } else {
      setStatus(`⚠ Linguagem detectada (${data.linguagem}) não está na lista`, "err");
    }
  } catch (err) {
    setStatus("✗ " + err.message, "err");
  } finally {
    btnDetectar.disabled = false;
    btnDetectar.textContent = "⚡ Detectar";
  }
}

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

    renderResultado(codigo, data.parts, data.boasPraticas, data.seguranca);
    salvarHistorico(codigo, linguagem, data.parts, data.boasPraticas, data.seguranca);
    setStatus("✓ Tradução concluída", "ok");
    if (data.usageCount !== null && data.usageCount !== undefined) {
      const el = document.getElementById("usageCount");
      if (el) el.textContent = `${data.usageCount} ${data.usageCount !== 1 ? "traduções" : "tradução"} hoje`;
    } else {
      atualizarContador();
    }
  } catch (err) {
    outputEl.innerHTML = "";
    setStatus("✗ " + err.message, "err");
  } finally {
    btnTraduzir.disabled = false;
    btnTraduzir.textContent = "→ Traduzir";
  }
}

function renderResultado(codigoOriginal, parts, boasPraticas, seguranca) {
  let html = esc(codigoOriginal);
  parts.forEach((part, i) => {
    const cor = COLORS[i % COLORS.length];
    const trecho = part.trecho || part.code || "";
    const escaped = esc(trecho);
    if (!escaped) return;
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
    const trecho    = part.trecho    || part.code        || "";
    const explicacao = part.explicacao || part.translation || "";
    return `
      <div class="translation-part">
        <div class="part-code" style="background:${cor.bg};color:${cor.text}">
          ${esc(trecho)}
        </div>
        <div class="part-translation" style="border-left:3px solid ${cor.border}">
          <span class="part-arrow" style="color:${cor.border}">→</span>
          ${esc(explicacao)}
        </div>
      </div>`;
  }).join("") + renderMedidores(boasPraticas, seguranca);
}

function renderMedidores(boasPraticas, seguranca) {
  if (!boasPraticas && !seguranca) return "";

  function medidorHtml(label, icone, dados) {
    if (!dados) return "";
    const nota = Math.min(10, Math.max(0, Number(dados.nota) || 0));
    const pct  = nota * 10;
    const cor  = nota >= 7 ? "#4ade80" : nota >= 4 ? "#f9c784" : "#f4826e";
    const corBg = nota >= 7 ? "rgba(74,222,128,0.08)" : nota >= 4 ? "rgba(249,199,132,0.08)" : "rgba(244,130,110,0.08)";
    return `
      <div class="medidor">
        <div class="medidor-header">
          <span class="medidor-label">${icone} ${label}</span>
          <span class="medidor-nota" style="color:${cor}">${nota}/10</span>
        </div>
        <div class="medidor-barra-bg">
          <div class="medidor-barra" style="width:${pct}%;background:${cor}"></div>
        </div>
        <p class="medidor-comentario" style="background:${corBg};border-left:3px solid ${cor}">${esc(dados.comentario || "")}</p>
      </div>`;
  }

  return `
    <div class="medidores-wrapper">
      ${medidorHtml("Boas Práticas", "✦", boasPraticas)}
      ${medidorHtml("Segurança", "🔒", seguranca)}
    </div>`;
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
    .filter(Boolean)
    .join("\n\n");
  if (!partes) return setStatus("Nada para copiar", "err");
  navigator.clipboard.writeText(partes).then(() => setStatus("✓ Copiado!", "ok"));
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

// ── Histórico ────────────────────────────────────────────────────────────────
// Cache em memória para evitar reload desnecessário
let _historicoCache = null;

async function salvarHistorico(codigo, linguagem, parts, boasPraticas, seguranca) {
  const token = getAccessToken();
  if (!token) return;
  try {
    await fetch("/api/historico", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
      body: JSON.stringify({ codigo, linguagem, parts, boasPraticas, seguranca }),
    });
    _historicoCache = null; // invalida cache
  } catch { /* falha silenciosa — não bloqueia o fluxo */ }
}

function abrirHistorico() {
  historicoPanel.classList.remove("hidden");
  historicoOverlay.classList.remove("hidden");
  renderHistorico();
}

function fecharHistorico() {
  historicoPanel.classList.add("hidden");
  historicoOverlay.classList.add("hidden");
}

async function limparHistorico() {
  if (!confirm("Remover todo o histórico?")) return;
  const token = getAccessToken();
  if (!token) return;
  historicoLista.innerHTML = `<p class="historico-vazio">Removendo...</p>`;
  try {
    await fetch("/api/historico", {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` },
    });
    _historicoCache = null;
    renderHistorico();
  } catch {
    renderHistorico();
  }
}

async function removerItemHistorico(id) {
  const token = getAccessToken();
  if (!token) return;
  try {
    await fetch(`/api/historico/${id}`, {
      method: "DELETE",
      headers: { "Authorization": `Bearer ${token}` },
    });
    _historicoCache = null;
    renderHistorico();
  } catch {
    renderHistorico();
  }
}

function restaurarHistorico(item) {
  fecharHistorico();
  inputCodigo.value = item.codigo;
  inputCodigo.classList.remove("hidden");
  codeColored.classList.add("hidden");
  codeColoredContent.innerHTML = "";
  outputEl.innerHTML = "";
  document.getElementById("linguagem").value = item.linguagem;
  const bp = item.boas_praticas ?? item.boasPraticas ?? null;
  const seg = item.seguranca ?? null;
  renderResultado(item.codigo, item.parts, bp, seg);
  setStatus("✓ Histórico restaurado", "ok");
}

async function renderHistorico() {
  historicoLista.innerHTML = `<p class="historico-vazio">Carregando...</p>`;

  const token = getAccessToken();
  if (!token) {
    historicoLista.innerHTML = `<p class="historico-vazio">Faça login para ver o histórico.</p>`;
    return;
  }

  try {
    if (!_historicoCache) {
      const res = await fetch("/api/historico", {
        headers: { "Authorization": `Bearer ${token}` },
      });
      const data = await res.json();
      _historicoCache = data.historico || [];
    }

    const lista = _historicoCache;

    if (!lista.length) {
      historicoLista.innerHTML = `<p class="historico-vazio">Nenhuma tradução salva ainda.</p>`;
      return;
    }

    historicoLista.innerHTML = lista.map((item) => {
      const data = new Date(item.criado_em);
      const dataStr = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })
        + " " + data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const preview = item.codigo.trim().split("\n")[0].slice(0, 50);
      return `
        <div class="historico-item" data-id="${item.id}">
          <div class="historico-item-header">
            <span class="historico-item-lang">${esc(item.linguagem)}</span>
            <span class="historico-item-data">${dataStr}</span>
          </div>
          <div class="historico-item-preview">${esc(preview)}</div>
          <button class="historico-item-del" title="Remover" data-del="${item.id}">✕</button>
        </div>`;
    }).join("");

    historicoLista.querySelectorAll(".historico-item").forEach((el) => {
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-del]")) return;
        const id = el.dataset.id;
        const item = _historicoCache?.find((h) => h.id === id);
        if (item) restaurarHistorico(item);
      });
    });

    historicoLista.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removerItemHistorico(btn.dataset.del);
      });
    });
  } catch {
    historicoLista.innerHTML = `<p class="historico-vazio">Erro ao carregar histórico.</p>`;
  }
}
