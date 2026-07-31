const RESULTS = new Set(["Won", "Lost", "Void", "Half Won", "Half Lost"]);
function invalid(message) { const error = new Error(message); error.statusCode = 422; throw error; }
function text(value) { return String(value ?? "").trim(); }
function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Number.parseFloat(text(value).replace(",", "."));
  return Number.isFinite(parsed) ? parsed : null;
}
function average(values) {
  const valid = values.map(number).filter(value => value !== null);
  return valid.length ? Math.round(valid.reduce((sum, value) => sum + value, 0) / valid.length) : null;
}
function normalizeTip(tip, index) {
  const matches = Array.isArray(tip.matches) ? tip.matches : [];
  const tipId = text(tip.tip_id || tip.id);
  if (!tipId) invalid(`tips[${index}].id é obrigatório`);
  const competition = text(tip.competition) || (matches.length === 1 ? text(matches[0].competition) : `Múltipla · ${matches.length} jogos`);
  const match = text(tip.match) || matches.map(item => `${text(item.home)} x ${text(item.away)}`).join(" + ");
  const market = text(tip.market) || matches.map(item => `${text(item.market)}: ${text(item.pick || item.selection)}`).join(" + ");
  const selection = text(tip.selection || tip.pick || tip.title) || matches.map(item => text(item.pick || item.selection)).filter(Boolean).join(" + ");
  const reason = text(tip.reason || tip.analysis) || matches.map(item => text(item.analysis)).filter(Boolean).join(" ");
  const odd = number(tip.odd ?? tip.total_odd);
  const stake = 1;
  const confidence = number(tip.confidence);
  if (!competition) invalid(`tips[${index}].competition é obrigatório`);
  if (!match) invalid(`tips[${index}].match ou matches é obrigatório`);
  if (!market) invalid(`tips[${index}].market é obrigatório`);
  if (!selection) invalid(`tips[${index}].selection, pick ou title é obrigatório`);
  if (!reason) invalid(`tips[${index}].reason ou analysis é obrigatório`);
  if (!(odd > 1)) invalid(`Odd inválida em ${tipId}`);
  if (!(confidence >= 0 && confidence <= 100)) invalid(`Confiança inválida em ${tipId}`);
  const expectedValue = number(tip.expected_value);
  return {
    ...tip, tip_id: tipId, competition, match, market, selection, reason, odd, stake, confidence,
    scanner_score: number(tip.scanner_score) ?? average(matches.map(item => item.scanner_score)),
    expected_value: expectedValue,
    instruction: text(tip.instruction || tip.summary?.recommendation) || null,
    status: "Open"
  };
}
function validateTips(payload) {
  if (text(payload?.schema_version) !== "1.0") invalid("schema_version deve ser 1.0");
  if (!Array.isArray(payload?.tips) || !payload.tips.length) invalid("O arquivo deve conter ao menos uma aposta em tips");
  const seen = new Set();
  return payload.tips.map((tip, index) => {
    const normalized = normalizeTip(tip, index);
    if (seen.has(normalized.tip_id)) invalid(`ID duplicado no arquivo: ${normalized.tip_id}`);
    seen.add(normalized.tip_id);
    return normalized;
  });
}
function validateResults(payload) {
  if (text(payload?.schema_version) !== "1.0") invalid("schema_version deve ser 1.0");
  if (!Array.isArray(payload?.results) || !payload.results.length) invalid("O arquivo deve conter ao menos um resultado em results");
  const seen = new Set();
  return payload.results.map((result, index) => {
    const tipId = text(result.tip_id || result.id), status = text(result.status);
    if (!tipId) invalid(`results[${index}].tip_id ou id é obrigatório`);
    if (seen.has(tipId)) invalid(`ID duplicado no arquivo: ${tipId}`);
    seen.add(tipId);
    if (!RESULTS.has(status)) invalid(`Status inválido para ${tipId}`);
    return { ...result, tip_id: tipId, status };
  });
}
module.exports = { validateTips, validateResults };
