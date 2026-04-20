let supabaseClient = null;

async function init() {
  try {
    const res = await fetch("/api/config");
    const { supabaseUrl, supabaseAnonKey } = await res.json();
    supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

    const { data } = await supabaseClient.auth.getSession();
    if (data?.session) window.location.href = "/";
  } catch (err) {
    showError("Erro ao conectar. Recarregue a página.");
  }
}

init();

async function handleLogin(e) {
  e.preventDefault();
  hideError();

  if (!supabaseClient) return showError("Ainda carregando, tente novamente.");

  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  setLoading(true);
  try {
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) return showError(friendlyError(error.message));
    window.location.href = "/";
  } catch (err) {
    showError("Erro inesperado: " + err.message);
  } finally {
    setLoading(false);
  }
}

function friendlyError(msg) {
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("Email not confirmed"))       return "E-mail não confirmado.";
  return "Erro: " + msg;
}

let recoveryMode = false;

function toggleRecovery(e) {
  e.preventDefault();
  recoveryMode = !recoveryMode;
  document.getElementById("loginForm").classList.toggle("hidden", recoveryMode);
  document.getElementById("recoveryForm").classList.toggle("hidden", !recoveryMode);
  document.getElementById("linkForgot").textContent = recoveryMode ? "Voltar ao login" : "Esqueceu a senha?";
  document.getElementById("recoveryMsg").classList.add("hidden");
}

async function handleRecovery(e) {
  e.preventDefault();
  if (!supabaseClient) return;

  const email = document.getElementById("recoveryEmail").value.trim();
  const msgEl = document.getElementById("recoveryMsg");

  document.getElementById("btnRecovery").disabled = true;
  document.getElementById("btnRecoveryText").classList.add("hidden");
  document.getElementById("btnRecoveryLoader").classList.remove("hidden");

  const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
    redirectTo: window.location.origin + "/reset-senha",
  });

  document.getElementById("btnRecovery").disabled = false;
  document.getElementById("btnRecoveryText").classList.remove("hidden");
  document.getElementById("btnRecoveryLoader").classList.add("hidden");

  msgEl.className = error ? "error-msg" : "success-msg";
  msgEl.textContent = error
    ? "Erro ao enviar. Verifique o e-mail informado."
    : "Link enviado! Verifique sua caixa de entrada.";
  msgEl.classList.remove("hidden");
}

function setLoading(on) {
  document.getElementById("btnSubmit").disabled = on;
  document.getElementById("btnText").classList.toggle("hidden", on);
  document.getElementById("btnLoader").classList.toggle("hidden", !on);
}

function showError(msg) {
  const el = document.getElementById("errorMsg");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideError() {
  document.getElementById("errorMsg").classList.add("hidden");
}
