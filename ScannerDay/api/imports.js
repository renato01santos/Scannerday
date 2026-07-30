const { requireAdmin } = require("./_lib/admin-auth");
const { supabase } = require("./_lib/supabase");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Método não permitido" });
  try {
    requireAdmin(request);
    const rows = await supabase("imports?select=id,schema_version,methodology,generated_at,imported_at,file_name,status,analysis_count,user_id&order=imported_at.desc&limit=100");
    return response.status(200).json(rows);
  } catch (error) { return response.status(error.statusCode || 500).json({ error: error.message }); }
};
