const RESULTS = new Set(["Won", "Lost", "Void", "Half Won", "Half Lost"]);
function invalid(message) { const error = new Error(message); error.statusCode = 422; throw error; }
function text(value) { return String(value ?? "").trim(); }
function validateTips(payload) {
  if (text(payload?.schema_version) !== "1.0") invalid("schema_version deve ser 1.0");
  if (!Array.isArray(payload?.tips) || !payload.tips.length) invalid("O arquivo deve conter ao menos uma aposta em tips");
  const seen = new Set();
  return payload.tips.map((tip, index) => {
    const tipId=text(tip.tip_id); if (!tipId) invalid(`tips[${index}].tip_id é obrigatório`);
    if (seen.has(tipId)) invalid(`tip_id duplicado no arquivo: ${tipId}`); seen.add(tipId);
    for (const key of ["competition","match","market","selection","reason"]) if (!text(tip[key])) invalid(`tips[${index}].${key} é obrigatório`);
    const odd=Number(tip.odd),stake=Number(tip.stake),confidence=Number(tip.confidence);
    if (!(odd>1)) invalid(`Odd inválida em ${tipId}`); if (!(stake>=0)) invalid(`Stake inválida em ${tipId}`);
    if (!(confidence>=0&&confidence<=100)) invalid(`Confiança inválida em ${tipId}`);
    if (tip.status && tip.status!=="Open") invalid(`Nova aposta ${tipId} deve ter status Open`);
    return {...tip,tip_id:tipId,odd,stake,confidence,status:"Open"};
  });
}
function validateResults(payload) {
  if (text(payload?.schema_version) !== "1.0") invalid("schema_version deve ser 1.0");
  if (!Array.isArray(payload?.results) || !payload.results.length) invalid("O arquivo deve conter ao menos um resultado em results");
  const seen=new Set(); return payload.results.map((result,index)=>{const tipId=text(result.tip_id),status=text(result.status);if(!tipId)invalid(`results[${index}].tip_id é obrigatório`);if(seen.has(tipId))invalid(`tip_id duplicado no arquivo: ${tipId}`);seen.add(tipId);if(!RESULTS.has(status))invalid(`Status inválido para ${tipId}`);return {...result,tip_id:tipId,status};});
}
module.exports={validateTips,validateResults};
