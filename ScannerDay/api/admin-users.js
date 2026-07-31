const { requireAdmin } = require("./_lib/admin-auth");
const { supabase } = require("./_lib/supabase");

async function authAdmin(path, options = {}) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const result = await fetch(`${url}/auth/v1/admin/${path}`, {
    ...options,
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...options.headers }
  });
  const text = await result.text();
  if (!result.ok) throw new Error(`Supabase Auth ${result.status}: ${text}`);
  return text ? JSON.parse(text) : null;
}

module.exports = async function handler(request, response) {
  try {
    const admin = await requireAdmin(request);
    if (request.method === "GET") {
      const auth = await authAdmin("users?page=1&per_page=1000");
      const profiles = await supabase("profiles?select=id,name,plan,role,created_at");
      const byId = new Map(profiles.map(profile => [profile.id, profile]));
      return response.status(200).json((auth.users || []).map(user => ({
        ...byId.get(user.id), id: user.id, email: user.email, created_at: user.created_at,
        confirmed_at: user.confirmed_at, last_sign_in_at: user.last_sign_in_at,
        is_current_user: user.id === admin.id
      })));
    }
    const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
    const id = String(body?.id || request.query?.id || "").trim();
    if (!id) return response.status(422).json({ error: "Usuário não informado" });
    if (id === admin.id) return response.status(409).json({ error: "Sua própria conta administrativa está protegida" });
    if (request.method === "PATCH") {
      const role = body?.role === "admin" ? "admin" : body?.role === "user" ? "user" : null;
      if (!role) return response.status(422).json({ error: "Perfil inválido" });
      const rows = await supabase(`profiles?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ role }) });
      if (!rows?.length) return response.status(404).json({ error: "Perfil do usuário não encontrado" });
      return response.status(200).json({ ok: true, role });
    }
    if (request.method === "DELETE") {
      await authAdmin(`users/${encodeURIComponent(id)}`, { method: "DELETE" });
      return response.status(200).json({ ok: true });
    }
    return response.status(405).json({ error: "Método não permitido" });
  } catch (error) { return response.status(error.statusCode || 500).json({ error: error.message }); }
};
