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
