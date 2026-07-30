const { supabase } = require("./supabase");

function authError(message = "Não autorizado", statusCode = 401) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

async function requireAdmin(request) {
  const token = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "").trim();
  if (!token) throw authError("Faça login como administrador");

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) throw authError("Supabase não configurado no servidor", 503);

  const userResponse = await fetch(`${url}/auth/v1/user`, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${token}` }
  });
  if (!userResponse.ok) throw authError("Sessão expirada. Entre novamente.");
  const user = await userResponse.json();

  const profiles = await supabase(`profiles?id=eq.${encodeURIComponent(user.id)}&select=id,role&limit=1`);
  if (!profiles?.length || profiles[0].role !== "admin") throw authError("Esta conta não possui permissão administrativa", 403);
  return user;
}

module.exports = { requireAdmin };
