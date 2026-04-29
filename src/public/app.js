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
const HISTORICO_KEY = "ct-historico";
const HISTORICO_MAX = 50;

function carregarHistorico() {
  try { return JSON.parse(localStorage.getItem(HISTORICO_KEY) || "[]"); }
  catch { return []; }
}

function salvarHistorico(codigo, linguagem, parts, boasPraticas, seguranca) {
  try {
    const lista = carregarHistorico();
    lista.unshift({
      id: Date.now().toString(),
      data: new Date().toISOString(),
      linguagem,
      codigo,
      parts,
      boasPraticas: boasPraticas ?? null,
      seguranca: seguranca ?? null,
    });
    localStorage.setItem(HISTORICO_KEY, JSON.stringify(lista.slice(0, HISTORICO_MAX)));
  } catch {
    // localStorage indisponível ou cheio — ignora silenciosamente
  }
}

function abrirHistorico() {
  renderHistorico();
  historicoPanel.classList.remove("hidden");
  historicoOverlay.classList.remove("hidden");
}

function fecharHistorico() {
  historicoPanel.classList.add("hidden");
  historicoOverlay.classList.add("hidden");
}

function limparHistorico() {
  if (!confirm("Remover todo o histórico?")) return;
  localStorage.removeItem(HISTORICO_KEY);
  renderHistorico();
}

function removerItemHistorico(id) {
  const lista = carregarHistorico().filter((h) => h.id !== id);
  localStorage.setItem(HISTORICO_KEY, JSON.stringify(lista));
  renderHistorico();
}

function restaurarHistorico(item) {
  fecharHistorico();
  // Limpa estado atual antes de restaurar
  inputCodigo.value = item.codigo;
  inputCodigo.classList.remove("hidden");
  codeColored.classList.add("hidden");
  codeColoredContent.innerHTML = "";
  outputEl.innerHTML = "";
  document.getElementById("linguagem").value = item.linguagem;
  renderResultado(item.codigo, item.parts, item.boasPraticas, item.seguranca);
  setStatus("✓ Histórico restaurado", "ok");
}

function renderHistorico() {
  const lista = carregarHistorico();

  if (!lista.length) {
    historicoLista.innerHTML = `<p class="historico-vazio">Nenhuma tradução salva ainda.</p>`;
    return;
  }

  historicoLista.innerHTML = lista.map((item) => {
    const data = new Date(item.data);
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

  // Restaurar ao clicar no item
  historicoLista.querySelectorAll(".historico-item").forEach((el) => {
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-del]")) return;
      const id = el.dataset.id;
      const item = carregarHistorico().find((h) => h.id === id);
      if (item) restaurarHistorico(item);
    });
  });

  // Remover item individual
  historicoLista.querySelectorAll("[data-del]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      removerItemHistorico(btn.dataset.del);
    });
  });
}
