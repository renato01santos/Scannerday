const { supabase } = require("./_lib/supabase");
const { requireUser } = require("./_lib/user-auth");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Método não permitido" });
  try {
    await requireUser(request);
    const rows = await supabase("suggested_bets?status=eq.published&select=id,competition,home_team,away_team,match_date,match_time,market,selection,entry_odd,stake,confidence,analysis,instruction,published_at&order=published_at.desc&limit=50");
    return response.status(200).json(rows);
  } catch (error) { return response.status(error.statusCode || 500).json({ error: error.message }); }
};
