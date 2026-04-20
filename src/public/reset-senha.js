let supabaseClient = null;
let recoveryReady  = false;

async function init() {
  try {
    const res = await fetch("/api/config");
    const { supabaseUrl, supabaseAnonKey } = await res.json();
    supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);
  } catch {
    showInvalid("Erro ao conectar. Recarregue a página.");
    return;
  }

  // Timeout começa APÓS o cliente estar pronto
  const deadline = setTimeout(() => {
    if (!recoveryReady) showInvalid();
  }, 5000);

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      clearTimeout(deadline);
      recoveryReady = true;
      document.getElementById("loading").classList.add("hidden");
      document.getElementById("resetForm").classList.remove("hidden");
    }
  });

  // Fallback: verifica a sessão atual caso o evento já tenha disparado
  const { data } = await supabaseClient.auth.getSession();
  if (data?.session && !recoveryReady) {
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      clearTimeout(deadline);
      recoveryReady = true;
      document.getElementById("loading").classList.add("hidden");
      document.getElementById("resetForm").classList.remove("hidden");
    }
  }
}

init();

async function handleReset(e) {
  e.preventDefault();
  const password = document.getElementById("password").value;
  const confirm  = document.getElementById("confirm").value;

  if (password !== confirm) return showError("As senhas não coincidem.");
  if (password.length < 6)  return showError("A senha deve ter pelo menos 6 caracteres.");

  setLoading(true);
  const { error } = await supabaseClient.auth.updateUser({ password });
  setLoading(false);

  if (error) return showError("Erro ao redefinir senha: " + error.message);

  document.getElementById("resetForm").classList.add("hidden");
  document.getElementById("successView").classList.remove("hidden");
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

function showInvalid(msg) {
  document.getElementById("loading").classList.add("hidden");
  const view = document.getElementById("invalidView");
  if (msg) view.querySelector("p").textContent = msg;
  view.classList.remove("hidden");
}
