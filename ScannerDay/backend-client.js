(function () {
  const config = window.SCANNERDAY_CONFIG || {};
  const state = { connected: false, demoMode: config.demoMode !== false, session: null };

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
      state.demoMode = false;
    } catch (error) {
      console.warn("ScannerDay operando em modo demonstrativo:", error.message);
    }
    return state;
  }

  async function signUp(email, password, name) {
    const session = await request("/auth/v1/signup", {
      method: "POST",
      body: JSON.stringify({ email, password, data: { name } })
    });
    state.session = session;
    return session;
  }

  async function signIn(email, password) {
    const session = await request("/auth/v1/token?grant_type=password", {
      method: "POST",
      body: JSON.stringify({ email, password })
    });
    state.session = session;
    localStorage.setItem("scannerday-session", JSON.stringify(session));
    return session;
  }

  function signOut() {
    state.session = null;
    localStorage.removeItem("scannerday-session");
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

  const saved = localStorage.getItem("scannerday-session");
  if (saved) {
    try { state.session = JSON.parse(saved); } catch (_) { localStorage.removeItem("scannerday-session"); }
  }

  window.ScannerBackend = { state, configured, init, signUp, signIn, signOut, listGames, listHistory, getScannerWeights, getServiceStatus, toggleWatchlist };
})();
