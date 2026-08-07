(function () {
  const config = window.SCANNERDAY_CONFIG || {};
  const state = { connected: false, session: null };

  function configured() {
    return Boolean(config.supabaseUrl && config.supabaseAnonKey);
  }

  function headers(extra = {}) {
    const token = state.session?.access_token || config.supabaseAnonKey;
    return {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...extra
    };
  }

  async function request(path, options = {}) {
    if (!configured()) throw new Error("Supabase ainda não configurado");
    const response = await fetch(`${config.supabaseUrl}${path}`, {
      ...options,
      headers: headers(options.headers)
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Backend ${response.status}: ${detail}`);
    }
    if (response.status === 204) return null;
    return response.json();
  }

  async function init() {
    if (!configured()) return state;
    try {
      await request("/rest/v1/leagues?select=id&limit=1");
      state.connected = true;
    } catch (error) {
      console.warn("ScannerDay sem conexão com o backend:", error.message);
    }
    return state;
  }

  async function signUp(email, password, name) {
    const session = await request("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data: { name } })
    });
    if (session?.access_token) {
      state.session = session;
    }
    return session;
  }

  async function signIn(email, password) {
    const session = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    state.session = session;
    return session;
  }

  async function refreshSession() {
    if (!state.session?.refresh_token) throw new Error("Sessão expirada. Entre novamente.");
    const response = await fetch(`${config.supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: state.session.refresh_token })
    });
    const refreshed = await response.json().catch(() => ({}));
    if (!response.ok) { signOut(); throw new Error(refreshed?.msg || refreshed?.error_description || "Sessão expirada. Entre novamente."); }
    state.session = refreshed;
    return refreshed;
  }

  async function ensureSession() {
    if (!state.session?.access_token) throw new Error("Faça login como administrador.");
    return state.session;
  }

  function signOut() {
    state.session = null;
    localStorage.removeItem("scannerday-session");
  }

  async function getProfile() {
    if (!state.session?.access_token) throw new Error("Faça login para continuar.");
    const rows = await request(`/rest/v1/profiles?id=eq.${encodeURIComponent(state.session.user.id)}&select=id,name,role,plan&limit=1`);
    if (!rows?.length) throw new Error("Perfil de usuário não encontrado.");
    return rows[0];
  }

  async function recoverPassword(email) {
    if (!configured()) throw new Error("Supabase ainda não configurado");
    const response = await fetch(`${config.supabaseUrl}/auth/v1/recover`, {
      method: "POST",
      headers: { apikey: config.supabaseAnonKey, "Content-Type": "application/json" },
      body: JSON.stringify({ email, redirect_to: `${location.origin}/` })
    });
    if (!response.ok) { const detail = await response.json().catch(() => ({})); throw new Error(detail?.msg || detail?.error_description || "Não foi possível enviar o link."); }
    return true;
  }

  async function listGames() {
    return request("/rest/v1/game_analysis_view?select=*&order=scanner_score.desc.nullslast");
  }

  async function listHistory(limit = 50, offset = 0) {
    return request(`/rest/v1/analyses?select=*,games(*,home_team:teams!games_home_team_id_fkey(name),away_team:teams!games_away_team_id_fkey(name),leagues(name))&order=created_at.desc&limit=${limit}&offset=${offset}`);
  }

  async function getScannerWeights() {
    return request("/rest/v1/scanner_weights?select=key,label,weight,active&order=id");
  }

  async function getServiceStatus() {
    return request("/rest/v1/service_status?select=service,health,latency_ms,message,checked_at&order=service");
  }

  async function toggleWatchlist(gameId, active) {
    if (active) {
      return request("/rest/v1/watchlist", {
        method: "POST",
        headers: { Prefer: "return=representation,resolution=merge-duplicates" },
        body: JSON.stringify({ game_id: gameId })
      });
    }
    return request(`/rest/v1/watchlist?game_id=eq.${encodeURIComponent(gameId)}`, { method: "DELETE" });
  }

  // A sessão existe somente na memória desta página. Atualizar ou reabrir exige novo login.
  localStorage.removeItem("scannerday-session");

  window.ScannerBackend = { state, configured, init, signUp, signIn, refreshSession, ensureSession, signOut, getProfile, recoverPassword, listGames, listHistory, getScannerWeights, getServiceStatus, toggleWatchlist };
})();
