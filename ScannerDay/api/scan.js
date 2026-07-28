// ScannerDay scanner date-query-v2
//Compatibilizar scanner com plano gratuito
const API_BASE = "https://v3.football.api-sports.io";

function dateOnly(date) {
  return date.toISOString().slice(0, 10);
}

function requireEnvironment() {
  const required = ["API_FOOTBALL_KEY", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missing = required.filter(name => !process.env[name]);
  if (missing.length) throw new Error(`Variáveis ausentes: ${missing.join(", ")}`);
}

async function football(path) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { "x-apisports-key": process.env.API_FOOTBALL_KEY }
  });
  const payload = await response.json();
  if (!response.ok || payload.errors?.length || (payload.errors && Object.keys(payload.errors).length)) {
    throw new Error(`API-Football: ${JSON.stringify(payload.errors || payload)}`);
  }
  return payload;
}

async function supabase(path, options = {}) {
  const response = await fetch(`${process.env.SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      ...options.headers
    }
  });
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${await response.text()}`);
  if (response.status === 204) return null;
  return response.json();
}

async function updateService(health, message, latencyMs) {
  return supabase("service_status?on_conflict=service", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ service: "games_api", health, message, latency_ms: latencyMs, checked_at: new Date().toISOString() })
  });
}

async function upsert(table, rows) {
  if (!rows.length) return [];
  return supabase(`${table}?on_conflict=external_id`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=representation" },
    body: JSON.stringify(rows)
  });
}

async function createRun() {
  const rows = await supabase("scanner_runs", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({ status: "running", stage: 1, started_at: new Date().toISOString() })
  });
  return rows[0];
}

async function patchRun(id, values) {
  return supabase(`scanner_runs?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify(values)
  });
}

async function handler(request, response) {
  const auth = request.headers.authorization || "";
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return response.status(401).json({ error: "Não autorizado" });
  }

  let run;
  const started = Date.now();
  try {
    requireEnvironment();
    run = await createRun();

    // A API-Football exige league ou team quando from/to são usados.
    // Para um scanner global, consultamos cada data individualmente.
    const scanDates = Array.from({ length: 4 }, (_, offset) => {
      const date = new Date();
      date.setUTCDate(date.getUTCDate() + offset);
      return dateOnly(date);
    });
    const dailyPayloads = [];
    for (const date of scanDates) {
      const query = new URLSearchParams({ date, timezone: "America/Sao_Paulo" });
      dailyPayloads.push(await football(`/fixtures?${query}`));
    }
    const fixtures = dailyPayloads.flatMap(payload => payload.response || []);

    const leaguesByExternal = new Map();
    const teamsByExternal = new Map();
    for (const item of fixtures) {
      leaguesByExternal.set(String(item.league.id), {
        external_id: String(item.league.id), name: item.league.name,
        country: item.league.country, logo_url: item.league.logo, active: true
      });
      for (const team of [item.teams.home, item.teams.away]) {
        teamsByExternal.set(String(team.id), {
          external_id: String(team.id), name: team.name, logo_url: team.logo,
          country: item.league.country
        });
      }
    }

    const savedLeagues = await upsert("leagues", [...leaguesByExternal.values()]);
    const savedTeams = await upsert("teams", [...teamsByExternal.values()]);
    const leagueIds = new Map(savedLeagues.map(row => [row.external_id, row.id]));
    const teamIds = new Map(savedTeams.map(row => [row.external_id, row.id]));

    const games = fixtures.map(item => ({
      external_id: String(item.fixture.id),
      league_id: leagueIds.get(String(item.league.id)),
      home_team_id: teamIds.get(String(item.teams.home.id)),
      away_team_id: teamIds.get(String(item.teams.away.id)),
      starts_at: item.fixture.date,
      status: item.fixture.status.short === "NS" ? "scheduled" : "scheduled",
      context: { round: item.league.round, venue: item.fixture.venue, referee: item.fixture.referee },
      raw_data: item
    })).filter(game => game.league_id && game.home_team_id && game.away_team_id);

    const savedGames = await upsert("games", games);
    const latency = Date.now() - started;
    await updateService("online", `${savedGames.length} jogos sincronizados`, latency);
    await patchRun(run.id, {
      status: "completed", stage: 2, leagues_total: savedLeagues.length,
      leagues_processed: savedLeagues.length, games_total: fixtures.length,
      games_processed: savedGames.length, completed_at: new Date().toISOString()
    });
    return response.status(200).json({
      ok: true, runId: run.id, leagues: savedLeagues.length,
      teams: savedTeams.length, games: savedGames.length, elapsedMs: latency
    });
  } catch (error) {
    await updateService("offline", error.message, Date.now() - started).catch(() => {});
    if (run) await patchRun(run.id, { status: "failed", error_message: error.message, completed_at: new Date().toISOString() }).catch(() => {});
    return response.status(500).json({ ok: false, error: error.message });
  }
}

module.exports = handler;
