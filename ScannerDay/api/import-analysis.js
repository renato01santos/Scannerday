const { requireAdmin } = require("./_lib/admin-auth");
const { parseBody, validatePayload } = require("./_lib/analysis-validator");
const { supabase } = require("./_lib/supabase");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Método não permitido" });
  try {
    const admin = await requireAdmin(request);
    const body = parseBody(request);
    const payload = body?.payload || body;
    payload.methodology = payload.methodology || payload.methodology_version || "ScannerDay";
    const validation = validatePayload(payload);
    if (!validation.valid) return response.status(422).json(validation);
    const premiumClassifications = new Map();
    for (const item of payload.analyses) {
      const matchKey = `${item.match.home_team}|${item.match.away_team}|${item.match.date}`;
      premiumClassifications.set(matchKey, item.scanner.classification);
      if (item.scanner.classification === "B+") item.scanner.classification = "B";
      item.recommendation.stake = item.recommendation.official_entry ? 1 : 0;
      if (!item.score_breakdown) continue;
      const fields = ["squad_strength", "recent_form", "home_away", "expected_value", "xg", "injuries", "motivation", "head_to_head"];
      const breakdownTotal = fields.reduce((sum, field) => sum + Number(item.score_breakdown[field] || 0), 0);
      const adjustment = Number(item.scanner.scanner_score) - breakdownTotal;
      if (adjustment) item.score_breakdown.calibration_adjustment = adjustment;
    }
    const result = await supabase("rpc/publish_analysis_import", {
      method: "POST",
      body: JSON.stringify({ payload, source_file_name: body?.file_name || "scannerday.json", importing_user: admin.id })
    });
    const importedRows = await supabase(`analyses?import_id=eq.${encodeURIComponent(result.import_id)}&select=id,home_team,away_team,match_date&limit=500`);
    for (const item of payload.analyses) {
      const row = importedRows.find(candidate => candidate.home_team === item.match.home_team && candidate.away_team === item.match.away_team && candidate.match_date === item.match.date);
      if (!row) continue;
      const premium = {
        risk_score: item.scanner?.risk_score ?? null,
        risk_level: item.scanner?.risk_level ?? null,
        consensus_score: item.scanner?.consensus_score ?? null,
        score_breakdown: item.score_breakdown ?? null,
        classification: premiumClassifications.get(`${item.match.home_team}|${item.match.away_team}|${item.match.date}`) || item.scanner.classification,
        stake: item.recommendation.official_entry ? 1 : 0,
        suggested_stake: item.recommendation.official_entry ? 1 : 0,
        methodology_version: payload.methodology_version || payload.methodology || null
      };
      await supabase(`analyses?id=eq.${encodeURIComponent(row.id)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(premium) });
    }
    return response.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ error: "JSON inválido" });
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
};
