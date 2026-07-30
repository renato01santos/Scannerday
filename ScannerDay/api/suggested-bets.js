const { supabase } = require("./_lib/supabase");
const { requireUser } = require("./_lib/user-auth");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Método não permitido" });
  try {
    await requireUser(request);
    const rows = await supabase("suggested_bets?status=eq.published&select=id,tip_id,competition,home_team,away_team,match_name,match_date,match_time,market,selection,entry_odd,minimum_entry_odd,stake,confidence,scanner_score,expected_value,analysis,instruction,bet_status,profit,units,closing_odd,result,final_score,published_at,settled_at&order=published_at.desc&limit=200");
    return response.status(200).json(rows);
  } catch (error) { return response.status(error.statusCode || 500).json({ error: error.message }); }
};
