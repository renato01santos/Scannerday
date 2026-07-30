const { supabase } = require("../_lib/supabase");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Método não permitido" });
  try {
    const id = encodeURIComponent(request.query.id);
    const rows = await supabase(`analyses?id=eq.${id}&import_id=not.is.null&select=*,predicted_scores(*),strengths(*),risks(*)&limit=1`);
    if (!rows?.length) return response.status(404).json({ error: "Análise não encontrada" });
    response.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=60");
    return response.status(200).json(rows[0]);
  } catch (error) { return response.status(500).json({ error: error.message }); }
};
