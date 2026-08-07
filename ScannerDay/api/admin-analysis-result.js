const { supabase } = require("./_lib/supabase");
const { requireAdmin } = require("./_lib/admin-auth");

module.exports = async function handler(request, response) {
  if (request.method !== "PATCH") return response.status(405).json({ error: "Método não permitido" });
  try {
    await requireAdmin(request);
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const analysisId = String(body?.analysis_id || "").trim();
    const result = String(body?.result || "").trim().toLowerCase();
    if (!analysisId) return response.status(422).json({ error: "Análise não informada" });
    if (!["green", "red"].includes(result)) return response.status(422).json({ error: "Resultado deve ser Green ou Red" });
    const analyses = await supabase(`analyses?id=eq.${encodeURIComponent(analysisId)}&select=id&limit=1`);
    if (!analyses?.length) return response.status(404).json({ error: "Análise não encontrada" });
    const rows = await supabase("results?on_conflict=analysis_id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({ analysis_id: analysisId, result, settled_at: new Date().toISOString() })
    });
    return response.status(200).json({ ok: true, result: rows?.[0]?.result || result });
  } catch (error) {
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
};
