const MAX_BYTES = 10 * 1024 * 1024;
const ROOT_FIELDS = ["schema_version", "generated_at", "methodology", "analyses"];

function isNumber(value) { return typeof value === "number" && Number.isFinite(value); }
function add(errors, path, message, match) { errors.push({ path, message, match: match || null }); }

function validateAnalysis(item, index, errors) {
  const path = `analyses[${index}]`;
  const match = item?.match && `${item.match.home_team || "?"} x ${item.match.away_team || "?"}`;
  if (!item || typeof item !== "object" || Array.isArray(item)) return add(errors, path, "Análise deve ser um objeto", match);
  if (!item.competition) add(errors, `${path}.competition`, "competition não encontrado", match);
  for (const field of ["home_team", "away_team", "date", "time"]) {
    if (!item.match?.[field]) add(errors, `${path}.match.${field}`, `${field} não encontrado`, match);
  }
  if (item.match?.date && !/^\d{4}-\d{2}-\d{2}$/.test(item.match.date)) add(errors, `${path}.match.date`, "date deve usar YYYY-MM-DD", match);
  if (item.match?.time && !/^\d{2}:\d{2}(:\d{2})?$/.test(item.match.time)) add(errors, `${path}.match.time`, "time deve usar HH:MM", match);
  for (const field of ["selection", "market"]) if (!item.market?.[field]) add(errors, `${path}.market.${field}`, `${field} não encontrado`, match);
  for (const field of ["market_odd", "minimum_entry_odd"]) if (!isNumber(item.market?.[field]) || item.market[field] <= 1) add(errors, `${path}.market.${field}`, `${field} deve ser número maior que 1`, match);
  for (const field of ["scanner_probability", "market_probability", "fair_odd", "expected_value", "scanner_score", "confidence"]) {
    if (!isNumber(item.scanner?.[field])) add(errors, `${path}.scanner.${field}`, `${field} não encontrado ou inválido`, match);
  }
  for (const field of ["scanner_probability", "market_probability", "scanner_score", "confidence"]) {
    if (isNumber(item.scanner?.[field]) && (item.scanner[field] < 0 || item.scanner[field] > 100)) add(errors, `${path}.scanner.${field}`, `${field} deve estar entre 0 e 100`, match);
  }
  for (const field of ["risk_score", "consensus_score"]) {
    if (item.scanner?.[field] !== undefined && item.scanner[field] !== null && (!isNumber(item.scanner[field]) || item.scanner[field] < 0 || item.scanner[field] > 100)) add(errors, `${path}.scanner.${field}`, `${field} deve estar entre 0 e 100`, match);
  }
  if (item.scanner?.risk_level !== undefined && !["Low", "Medium", "High", "Very High"].includes(item.scanner.risk_level)) add(errors, `${path}.scanner.risk_level`, "risk_level deve ser Low, Medium, High ou Very High", match);
  if (item.score_breakdown !== undefined) {
    const fields = ["squad_strength", "recent_form", "home_away", "expected_value", "xg", "injuries", "motivation", "head_to_head"];
    if (!item.score_breakdown || typeof item.score_breakdown !== "object" || Array.isArray(item.score_breakdown)) add(errors, `${path}.score_breakdown`, "score_breakdown deve ser um objeto", match);
    else {
      fields.forEach(field => { if (!isNumber(item.score_breakdown[field]) || item.score_breakdown[field] < 0) add(errors, `${path}.score_breakdown.${field}`, `${field} deve ser um número positivo`, match); });
      const total = fields.reduce((sum, field) => sum + (isNumber(item.score_breakdown[field]) ? item.score_breakdown[field] : 0), 0);
      if (fields.every(field => isNumber(item.score_breakdown[field])) && total !== item.scanner?.scanner_score) add(errors, `${path}.score_breakdown`, `a soma (${total}) deve ser igual ao scanner_score (${item.scanner?.scanner_score})`, match);
    }
  }
  if (!["A+", "A", "B", "C", "Rejected", "Reprovado"].includes(item.scanner?.classification)) add(errors, `${path}.scanner.classification`, "classification deve ser A+, A, B, C ou Rejected", match);
  if (!item.scanner?.status) add(errors, `${path}.scanner.status`, "status não encontrado", match);
  if (!Array.isArray(item.predicted_scores)) add(errors, `${path}.predicted_scores`, "predicted_scores deve ser uma lista", match);
  else item.predicted_scores.forEach((score, scoreIndex) => {
    if (!score?.score || !isNumber(score?.probability)) add(errors, `${path}.predicted_scores[${scoreIndex}]`, "Placar e probabilidade são obrigatórios", match);
  });
  for (const field of ["strengths", "risks"]) if (!Array.isArray(item[field]) || item[field].some(value => typeof value !== "string")) add(errors, `${path}.${field}`, `${field} deve ser uma lista de textos`, match);
  if (!item.scanner_explain || typeof item.scanner_explain !== "string") add(errors, `${path}.scanner_explain`, "scanner_explain não encontrado", match);
  if (typeof item.recommendation?.official_entry !== "boolean") add(errors, `${path}.recommendation.official_entry`, "official_entry deve ser booleano", match);
  if (!isNumber(item.recommendation?.stake) || item.recommendation.stake < 0) add(errors, `${path}.recommendation.stake`, "stake deve ser número igual ou maior que zero", match);
  if (!item.recommendation?.instruction) add(errors, `${path}.recommendation.instruction`, "instruction não encontrado", match);
}

function validatePayload(payload) {
  const errors = [];
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return { valid: false, errors: [{ path: "$", message: "JSON raiz deve ser um objeto", match: null }] };
  ROOT_FIELDS.forEach(field => { if (payload[field] === undefined || payload[field] === null || payload[field] === "") add(errors, field, `${field} não encontrado`); });
  if (payload.schema_version && !["1.0", "2.0"].includes(String(payload.schema_version))) add(errors, "schema_version", "schema_version deve ser 1.0 ou 2.0");
  if (payload.generated_at && Number.isNaN(Date.parse(payload.generated_at))) add(errors, "generated_at", "generated_at deve ser uma data ISO válida");
  if (!Array.isArray(payload.analyses) || payload.analyses.length === 0) add(errors, "analyses", "analyses deve conter pelo menos uma análise");
  else payload.analyses.forEach((item, index) => validateAnalysis(item, index, errors));
  return { valid: errors.length === 0, errors };
}

function parseBody(request) {
  const body = typeof request.body === "string" ? JSON.parse(request.body) : request.body;
  const bytes = Buffer.byteLength(JSON.stringify(body || {}), "utf8");
  if (bytes > MAX_BYTES) { const error = new Error("Arquivo excede o limite de 10 MB"); error.statusCode = 413; throw error; }
  return body;
}

module.exports = { MAX_BYTES, validatePayload, parseBody };
