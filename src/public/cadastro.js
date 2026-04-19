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

async function handleCadastro(e) {
  e.preventDefault();
  hideMessages();

  if (!supabaseClient) return showError("Ainda carregando, tente novamente.");

  const email    = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const confirm  = document.getElementById("confirm").value;

  if (password !== confirm) return showError("As senhas não coincidem.");

  setLoading(true);
  try {
    const res = await fetch("/api/cadastro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) return showError(data.error || "Erro ao cadastrar.");
    window.location.href = "/login";
  } catch (err) {
    showError("Erro inesperado: " + err.message);
  } finally {
    setLoading(false);
  }
}

function friendlyError(msg) {
  if (msg.includes("User already registered")) return "Este e-mail já está cadastrado.";
  if (msg.includes("Password should be"))      return "A senha deve ter pelo menos 6 caracteres.";
  return msg;
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

function showSuccess(msg) {
  const el = document.getElementById("successMsg");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function hideMessages() {
  document.getElementById("errorMsg").classList.add("hidden");
  document.getElementById("successMsg").classList.add("hidden");
}
