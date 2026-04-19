let supabaseClient = null;
let currentSession = null;

async function initAuth() {
  const res = await fetch("/api/config");
  const { supabaseUrl, supabaseAnonKey } = await res.json();
  supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);

  const { data } = await supabaseClient.auth.getSession();

  if (!data?.session) {
    window.location.href = "/login";
    return;
  }

  currentSession = data.session;

  const emailEl = document.getElementById("userEmail");
  if (emailEl) emailEl.textContent = data.session.user.email;

  supabaseClient.auth.onAuthStateChange((_event, session) => {
    currentSession = session;
    if (!session) window.location.href = "/login";
  });
}

function getAccessToken() {
  return currentSession?.access_token ?? null;
}

async function logout() {
  await supabaseClient.auth.signOut();
  window.location.href = "/login";
}

initAuth();
