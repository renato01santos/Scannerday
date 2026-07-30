const crypto = require("crypto");

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function requireAdmin(request) {
  const configured = process.env.ADMIN_IMPORT_SECRET;
  if (!configured) {
    const error = new Error("ADMIN_IMPORT_SECRET não configurado na Vercel");
    error.statusCode = 503;
    throw error;
  }
  const supplied = String(request.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!safeEqual(supplied, configured)) {
    const error = new Error("Não autorizado");
    error.statusCode = 401;
    throw error;
  }
}

module.exports = { requireAdmin };
