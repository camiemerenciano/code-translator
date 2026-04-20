let supabaseClient = null;

async function init() {
  const res = await fetch("/api/config");
  const { supabaseUrl, supabaseAnonKey } = await res.json();
  supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      document.getElementById("loading").classList.add("hidden");
      document.getElementById("resetForm").classList.remove("hidden");
    }
  });

  // Aguarda um curto prazo para o evento ser disparado
  setTimeout(() => {
    const loading = document.getElementById("loading");
    if (!loading.classList.contains("hidden")) {
      loading.classList.add("hidden");
      document.getElementById("invalidView").classList.remove("hidden");
    }
  }, 3000);
}

init();

async function handleReset(e) {
  e.preventDefault();
  const password = document.getElementById("password").value;
  const confirm  = document.getElementById("confirm").value;

  if (password !== confirm) {
    return showError("As senhas não coincidem.");
  }

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
