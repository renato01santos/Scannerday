const { requireAdmin } = require("./_lib/admin-auth");
const { parseBody, validatePayload } = require("./_lib/analysis-validator");
const { supabase } = require("./_lib/supabase");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Método não permitido" });
  try {
    const admin = await requireAdmin(request);
    const body = parseBody(request);
    const payload = body?.payload || body;
    const validation = validatePayload(payload);
    if (!validation.valid) return response.status(422).json(validation);
    const result = await supabase("rpc/publish_analysis_import", {
      method: "POST",
      body: JSON.stringify({ payload, source_file_name: body?.file_name || "scannerday.json", importing_user: admin.id })
    });
    return response.status(201).json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ error: "JSON inválido" });
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
};
