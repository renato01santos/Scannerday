const { requireAdmin } = require("../_lib/admin-auth");
const { supabase } = require("../_lib/supabase");

module.exports = async function handler(request, response) {
  try {
    await requireAdmin(request);
    const id = encodeURIComponent(request.query.id);
    if (request.method === "GET") {
      const rows = await supabase(`imports?id=eq.${id}&select=*,analyses(*,predicted_scores(*),strengths(*),risks(*))&limit=1`);
      if (!rows?.length) return response.status(404).json({ error: "Importação não encontrada" });
      return response.status(200).json(rows[0]);
    }
    if (request.method === "DELETE") {
      await supabase(`imports?id=eq.${id}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
      return response.status(204).end();
    }
    return response.status(405).json({ error: "Método não permitido" });
  } catch (error) { return response.status(error.statusCode || 500).json({ error: error.message }); }
};
