const { requireAdmin } = require("./_lib/admin-auth");
const { parseBody, validatePayload } = require("./_lib/analysis-validator");

module.exports = async function handler(request, response) {
  if (request.method !== "POST") return response.status(405).json({ error: "Método não permitido" });
  try {
    await requireAdmin(request);
    const body = parseBody(request);
    const payload = body?.payload || body;
    const validation = validatePayload(payload);
    return response.status(validation.valid ? 200 : 422).json(validation);
  } catch (error) {
    if (error instanceof SyntaxError) return response.status(400).json({ error: "JSON inválido" });
    return response.status(error.statusCode || 500).json({ error: error.message });
  }
};
