const { supabase } = require("./_lib/supabase");
const { requireAdmin } = require("./_lib/admin-auth");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Método não permitido" });
  try {
    const user = await requireAdmin(request);
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const required = ["competition","home_team","away_team","match_date","market","selection","analysis"];
    const missing = required.find(key => !String(body?.[key] || "").trim());
    if (missing) return response.status(422).json({ error: `Campo obrigatório: ${missing}` });
    const odd = Number(body.entry_odd), stake = Number(body.stake), confidence = Number(body.confidence);
    if (!(odd > 1) || stake < 0 || confidence < 0 || confidence > 100) return response.status(422).json({ error: "Odd, stake ou confiança inválidos" });
    const payload = { competition:body.competition,home_team:body.home_team,away_team:body.away_team,match_date:body.match_date,match_time:body.match_time||null,market:body.market,selection:body.selection,entry_odd:odd,stake,confidence,analysis:body.analysis,instruction:body.instruction||null,status:"published",created_by:user.id,published_at:new Date().toISOString() };
    const rows = await supabase("suggested_bets", { method:"POST", headers:{Prefer:"return=representation"}, body:JSON.stringify(payload) });
    return response.status(201).json(rows[0]);
  } catch (error) { return response.status(error.statusCode || 500).json({ error: error.message }); }
};
