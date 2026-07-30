const { supabase } = require("./_lib/supabase");
const { requireUser } = require("./_lib/user-auth");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Método não permitido" });
  try {
    await requireUser(request);
    const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 200);
    const rows = await supabase(`analyses?import_id=not.is.null&select=id,competition,home_team,away_team,match_date,match_time,stadium,selection,market,market_odd,minimum_entry_odd,scanner_probability,market_probability,fair_odd,expected_value,scanner_score,confidence_index,classification,editorial_status,official_entry,stake,instruction,scanner_explain,created_at&order=scanner_score.desc,expected_value.desc&limit=${limit}`);
    response.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return response.status(200).json(rows);
  } catch (error) { return response.status(error.statusCode || 500).json({ error: error.message }); }
};
