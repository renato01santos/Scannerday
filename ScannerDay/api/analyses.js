const { supabase } = require("./_lib/supabase");
const { requireUser } = require("./_lib/user-auth");
const { requireAdmin } = require("./_lib/admin-auth");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Método não permitido" });
  try {
    if (request.query.mode === "export") {
      await requireAdmin(request);
      const exported = await supabase("analyses?import_id=not.is.null&select=competition,home_team,away_team,match_date,match_time,stadium,selection,market,market_odd,minimum_entry_odd,scanner_probability,market_probability,fair_odd,expected_value,scanner_score,confidence_index,risk_score,risk_level,consensus_score,score_breakdown,classification,editorial_status,official_entry,instruction,scanner_explain&order=created_at.desc&limit=500");
      return response.status(200).json({ schema_version:"1.0", generated_at:new Date().toISOString(), methodology:"ScannerDay Premium 2.0", analyses:exported.map(row=>({competition:row.competition,match:{home_team:row.home_team,away_team:row.away_team,date:row.match_date,time:String(row.match_time||"").slice(0,5),stadium:row.stadium},market:{selection:row.selection,market:row.market,market_odd:Number(row.market_odd),minimum_entry_odd:Number(row.minimum_entry_odd)},scanner:{scanner_probability:Number(row.scanner_probability),market_probability:Number(row.market_probability),fair_odd:Number(row.fair_odd),expected_value:Number(row.expected_value),scanner_score:Number(row.scanner_score),confidence:Number(row.confidence_index),risk_score:row.risk_score===null?null:Number(row.risk_score),risk_level:row.risk_level,consensus_score:row.consensus_score===null?null:Number(row.consensus_score),classification:row.classification,status:row.editorial_status},score_breakdown:row.score_breakdown,recommendation:{official_entry:row.official_entry,stake:row.official_entry?1:0,instruction:row.instruction},scanner_explain:row.scanner_explain})) });
    }
    await requireUser(request);
    if (request.query.mode === "analytics") {
      const analytics = await supabase("scanner_analytics_cache?id=eq.1&select=*&limit=1");
      response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
      return response.status(200).json(analytics?.[0] || null);
    }
    const limit = Math.min(Math.max(Number(request.query.limit) || 100, 1), 200);
    const rows = await supabase(`analyses?import_id=not.is.null&select=id,competition,home_team,away_team,match_date,match_time,stadium,selection,market,market_odd,minimum_entry_odd,scanner_probability,market_probability,fair_odd,expected_value,scanner_score,confidence_index,risk_score,risk_level,consensus_score,score_breakdown,classification,editorial_status,official_entry,stake,instruction,scanner_explain,created_at,results(result,settled_at),strengths(description),risks(description)&order=scanner_score.desc,expected_value.desc&limit=${limit}`);
    response.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return response.status(200).json(rows);
  } catch (error) { return response.status(error.statusCode || 500).json({ error: error.message }); }
};
