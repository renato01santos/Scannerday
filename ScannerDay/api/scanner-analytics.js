const { supabase } = require("./_lib/supabase");
const { requireUser } = require("./_lib/user-auth");

module.exports = async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "Método não permitido" });
  try {
    await requireUser(request);
    const rows = await supabase("scanner_analytics_cache?id=eq.1&select=*&limit=1");
    response.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
    return response.status(200).json(rows?.[0] || null);
  } catch (error) { return response.status(error.statusCode || 500).json({ error: error.message }); }
};
