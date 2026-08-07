(function () {
  const MAX_FILE_SIZE = 10 * 1024 * 1024;
  let selectedFile = null;
  let parsedPayload = null;
  const byId = id => document.getElementById(id);
  const setHtml = (selector, html) => { const element = document.querySelector(selector); if (element) element.innerHTML = html; };
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const uploadPanel = document.querySelector("#admin-import-page .upload-panel");
  function session() { return window.ScannerBackend?.state?.session || null; }
  function updateAuthUI() {
    const current = session(), authenticated = Boolean(current?.access_token), admin = Boolean(window.ScannerAuth?.isAdmin);
    byId("adminLoginPanel").hidden = true;
    byId("adminSessionPanel").hidden = !admin;
    uploadPanel.hidden = !admin;
    if (admin) byId("adminSessionEmail").textContent = current.user?.email || "Administrador";
  }
  function adminHeaders() { return { "Content-Type": "application/json", Authorization: `Bearer ${session()?.access_token || ""}` }; }
  function sendRequest(path, options = {}) {
    return new Promise((resolve, reject) => {
      const request = new XMLHttpRequest();
      request.open(options.method || "GET", path, true);
      Object.entries({ ...adminHeaders(), ...options.headers }).forEach(([name, value]) => request.setRequestHeader(name, value));
      request.onload = () => {
        const data = request.status === 204 ? null : (() => { try { return JSON.parse(request.responseText || "{}"); } catch (_) { return {}; } })();
        resolve({ status: request.status, ok: request.status >= 200 && request.status < 300, data });
      };
      request.onerror = () => reject(new Error("A conexão com a API foi bloqueada pelo navegador. Desative temporariamente bloqueadores de anúncios ou a proteção web para scannerday.vercel.app."));
      request.ontimeout = () => reject(new Error("A API demorou para responder. Tente novamente."));
      request.timeout = 30000;
      request.send(options.body || null);
    });
  }
  async function api(path, options = {}, retried = false) {
    await window.ScannerBackend.ensureSession();
    const response = await sendRequest(path, options);
    const data = response.data;
    if (response.status === 401 && !retried) {
      try { await window.ScannerBackend.refreshSession(); return api(path, options, true); }
      catch (_) { window.ScannerBackend.signOut(); updateAuthUI(); throw new Error("Sessão expirada. Entre novamente."); }
    }
    if (response.status === 401) { window.ScannerBackend.signOut(); updateAuthUI(); }
    if (!response.ok) throw new Error(data?.error || data?.errors?.[0]?.message || `Erro ${response.status}`);
    return data;
  }
  byId("adminLogin").onclick = async () => {
    const button=byId("adminLogin"),errorBox=byId("adminLoginError");button.disabled=true;button.textContent="Entrando…";errorBox.hidden=true;
    try { await window.ScannerBackend.signIn(byId("adminEmail").value.trim(),byId("adminPassword").value);byId("adminPassword").value="";updateAuthUI();toast("Login realizado","A área de importação está liberada."); }
    catch(error){errorBox.textContent=error.message;errorBox.hidden=false;}
    finally{button.disabled=false;button.textContent="Entrar";}
  };
  byId("adminLogout").onclick=()=>{resetImport();window.ScannerAuth?.logout?.();};
  updateAuthUI();
  function toast(title, message) {
    const element = byId("toast");
    element.querySelector("strong").textContent = title;
    element.querySelector("small").textContent = message;
    element.classList.add("show"); setTimeout(() => element.classList.remove("show"), 4000);
  }
  function setProgress(value) { byId("uploadProgress").querySelector("i").style.width = `${value}%`; }
  function resetImport() {
    selectedFile = null; parsedPayload = null; byId("analysisFile").value = "";
    byId("selectedFileName").textContent = "Nenhum arquivo selecionado";
    byId("validateAnalysisFile").disabled = true; byId("validationResult").hidden = true;
    byId("analysisPreview").hidden = true; byId("analysisPreviewGrid").innerHTML = ""; setProgress(0);
  }
  function chooseFile(file) {
    resetImport();
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".json") && file.type !== "application/json") return showValidation([{ path: "arquivo", message: "Apenas arquivos .json são aceitos" }]);
    if (file.size > MAX_FILE_SIZE) return showValidation([{ path: "arquivo", message: "O arquivo excede o limite de 10 MB" }]);
    selectedFile = file; byId("selectedFileName").textContent = `${file.name} · ${(file.size / 1024).toFixed(1)} KB`;
    byId("validateAnalysisFile").disabled = false; setProgress(15);
  }
  function showValidation(errors) {
    const box = byId("validationResult"); box.hidden = false; box.className = `panel validation-result ${errors?.length ? "error" : "success"}`;
    box.innerHTML = errors?.length ? `<h3>Arquivo com erros</h3><p>Nada foi salvo. Corrija os campos abaixo:</p><ul class="validation-errors">${errors.slice(0, 30).map(error => `<li><code>${escapeHtml(error.path)}</code> — ${escapeHtml(error.message)}${error.match ? `<small>Jogo: ${escapeHtml(error.match)}</small>` : ""}</li>`).join("")}</ul>` : `<h3>✓ Arquivo válido</h3><p>Todos os campos obrigatórios foram verificados. Revise a prévia antes de publicar.</p>`;
  }
  function renderPreview(payload) {
    byId("analysisPreviewGrid").innerHTML = payload.analyses.map(item => {
      const likely = [...item.predicted_scores].sort((a, b) => b.probability - a.probability)[0];
      return `<article class="import-preview-card"><header><div><h3>${escapeHtml(item.match.home_team)} × ${escapeHtml(item.match.away_team)}</h3><p>${escapeHtml(item.competition)} · ${escapeHtml(item.match.date)} ${escapeHtml(item.match.time)}</p></div><span class="badge grade-${item.scanner.classification === "A+" ? "ap" : item.scanner.classification.toLowerCase()}">${escapeHtml(item.scanner.classification)}</span></header><div class="preview-metrics"><div><span>SCANNERSCORE</span><strong>${item.scanner.scanner_score}</strong></div><div><span>EV</span><strong class="green-text">${item.scanner.expected_value >= 0 ? "+" : ""}${item.scanner.expected_value}%</strong></div><div><span>CONFIANÇA</span><strong>${item.scanner.confidence}%</strong></div><div><span>ENTRADA OFICIAL</span><strong class="${item.recommendation.official_entry ? "green-text" : ""}">${item.recommendation.official_entry ? "SIM" : "NÃO"}</strong></div><div><span>PLACAR PROVÁVEL</span><strong>${escapeHtml(likely?.score || "—")}</strong></div><div><span>ODD</span><strong>${Number(item.market.market_odd).toFixed(2)}</strong></div></div></article>`;
    }).join(""); byId("analysisPreview").hidden = false;
  }

  byId("selectAnalysisFile").onclick = () => byId("analysisFile").click();
  byId("analysisFile").onchange = event => chooseFile(event.target.files[0]);
  const drop = byId("analysisDropZone");
  ["dragenter", "dragover"].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add("dragging"); }));
  ["dragleave", "drop"].forEach(name => drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove("dragging"); }));
  drop.addEventListener("drop", event => chooseFile(event.dataTransfer.files[0]));
  byId("cancelAnalysisImport").onclick = resetImport;
  byId("validateAnalysisFile").onclick = async () => {
    try {
      setProgress(35); parsedPayload = JSON.parse(await selectedFile.text()); setProgress(60);
      const result = await api("/api/validate-analysis", { method: "POST", body: JSON.stringify({ file_name: selectedFile.name, payload: parsedPayload }) });
      showValidation(result.errors); renderPreview(parsedPayload); setProgress(100);
    } catch (error) { parsedPayload = null; showValidation([{ path: "arquivo", message: error.message }]); setProgress(0); }
  };
  byId("publishAnalyses").onclick = async () => {
    const button = byId("publishAnalyses"); button.disabled = true; button.textContent = "Publicando…";
    try {
      const result = await api("/api/import-analysis", { method: "POST", body: JSON.stringify({ file_name: selectedFile.name, payload: parsedPayload }) });
      toast("Importação concluída", `${result.analyses} análises · ${result.official_entries} oficiais · ${result.monitoring} monitoramento · ${result.rejected} descartadas`);
      resetImport(); await syncEditorialAnalyses();
    } catch (error) { showValidation([{ path: "publicação", message: error.message }]); }
    finally { button.disabled = false; button.textContent = "Publicar"; }
  };

  async function loadImports() {
    const table = byId("importsTable"); table.innerHTML = '<div class="admin-loading"><i></i><i></i><i></i></div>';
    try {
      const rows = await api("/api/imports");
      table.innerHTML = rows.length ? rows.map(row => `<div class="import-row"><span>${new Date(row.imported_at).toLocaleString("pt-BR")}</span><span><strong>${escapeHtml(row.file_name)}</strong><small>${escapeHtml(row.methodology)}</small></span><span>${row.analysis_count}</span><span>Administrador</span><span class="green-text">Publicado</span><span class="import-actions"><button data-view-import="${row.id}">Visualizar</button><button class="danger" data-delete-import="${row.id}">Excluir</button></span></div>`).join("") : '<div class="admin-empty">Nenhuma importação publicada.</div>';
      table.querySelectorAll("[data-view-import]").forEach(button => button.onclick = () => viewImport(button.dataset.viewImport));
      table.querySelectorAll("[data-delete-import]").forEach(button => button.onclick = () => deleteImport(button.dataset.deleteImport));
    } catch (error) { table.innerHTML = `<div class="admin-empty">${escapeHtml(error.message)}</div>`; }
  }
  async function viewImport(id) {
    try { const row = await api(`/api/imports/${id}`); parsedPayload = row.raw_json; renderPreview(parsedPayload); navigate("admin-import"); }
    catch (error) { toast("Falha ao abrir", error.message); }
  }
  async function deleteImport(id) {
    if (!window.confirm("Excluir esta importação e todas as análises vinculadas? Esta ação não pode ser desfeita.")) return;
    try { await api(`/api/imports/${id}`, { method: "DELETE" }); toast("Importação excluída", "O lote e seus registros vinculados foram removidos."); await loadImports(); await syncEditorialAnalyses(); }
    catch (error) { toast("Falha ao excluir", error.message); }
  }
  byId("refreshImports").onclick = loadImports;
  document.querySelector('[data-page="admin-imports"]').addEventListener("click", () => {
    if (!session()?.access_token) { navigate("admin-import"); byId("adminLoginError").textContent="Entre como administrador para acessar o histórico."; byId("adminLoginError").hidden=false; return; }
    loadImports();
  });

  async function syncEditorialAnalyses() {
    try {
      const rows = await api("/api/analyses");
      if (!rows.length) { games.splice(0, games.length); renderScanner(); renderWatchlist(); return; }
      const mapped = rows.map(row => ({ id: row.id, home: escapeHtml(row.home_team), away: escapeHtml(row.away_team), league: escapeHtml(row.competition),
        matchDate: String(row.match_date || ""), matchTime: String(row.match_time || "").slice(0,5), date: `${escapeHtml(row.match_date)} · ${escapeHtml(String(row.match_time || "").slice(0,5))}`, odd: Number(row.market_odd), prob: Number(row.scanner_probability),
        score: Number(row.scanner_score), classification: row.classification, book: escapeHtml(row.market || "Mercado"), form: "Editorial", xg: 0, xga: 0, move: 0,
        implied: Number(row.market_probability), ev: Number(row.expected_value), fair: Number(row.fair_odd), confidence: Number(row.confidence_index),
        explanation: escapeHtml(row.scanner_explain), selection: escapeHtml(row.selection || row.market || ""), officialEntry: row.official_entry, stake: Number(row.stake), instruction: escapeHtml(row.instruction), scannerResult: (Array.isArray(row.results) ? row.results[0]?.result : row.results?.result) || "pending" }));
      games.splice(0, games.length, ...mapped);
      setHtml("#topGames", games.slice(0, 4).map(topRow).join(""));
      setHtml("#podium", [games[1], games[0], games[2]].filter(Boolean).map((g, i) => { const place = [2, 1, 3][i]; return `<article class="podium-card ${place === 1 ? "first" : ""}"><span class="place">${place}°</span>${badge(g)}<h3>${g.home} × ${g.away}</h3><p>${g.league} · Odd ${g.odd.toFixed(2)}</p><strong>${g.ev >= 0 ? "+" : ""}${g.ev.toFixed(1)}% EV</strong></article>`; }).join(""));
      setHtml("#rankTable", games.map((g, i) => `<div class="rank-row"><b>${String(i + 1).padStart(2, "0")}</b><span>${g.home} × ${g.away}<small>${g.league}</small></span><span>${g.odd.toFixed(2)}</span><span>${g.prob.toFixed(1)}%</span>${ev(g)}<strong>${g.score}</strong>${badge(g)}</div>`).join(""));
      renderAnalysisHistory();
      const dashboardKpis = document.querySelectorAll("#dashboard-page .kpi strong");
      if (dashboardKpis.length >= 4) { const maxEv = Math.max(...games.map(g => g.ev)); dashboardKpis[0].textContent = String(games.length).padStart(2, "0"); dashboardKpis[1].textContent = String(games.filter(g => g.officialEntry).length).padStart(2, "0"); dashboardKpis[2].textContent = String(games.filter(g => grade(g) === "Reprovado").length).padStart(2, "0"); dashboardKpis[3].textContent = `${maxEv >= 0 ? "+" : ""}${maxEv.toFixed(1)}%`; const bestLabel=dashboardKpis[3].nextElementSibling;if(bestLabel){const best=games.reduce((a,b)=>b.ev>a.ev?b:a);bestLabel.textContent=`EV • ${best.home} × ${best.away}`;} }
      const marketNumbers=document.querySelectorAll('.market-numbers strong');
      if(marketNumbers.length===3){marketNumbers[0].textContent=games.length;marketNumbers[1].textContent=new Set(games.map(g=>g.league)).size;marketNumbers[2].textContent='agora';}
      const scoreAverage=Math.round(games.reduce((sum,g)=>sum+g.score,0)/games.length),scoreCard=document.querySelector('.score-card');
      if(scoreCard){scoreCard.querySelector('.gauge-inner strong').textContent=scoreAverage;scoreCard.querySelector('.gauge-inner small').textContent='DADOS REAIS';scoreCard.querySelector('.trend').textContent='Importado';const counts={'A+':0,A:0,B:0,C:0};games.forEach(g=>{if(counts[grade(g)]!==undefined)counts[grade(g)]++;});scoreCard.querySelectorAll('.score-legend b').forEach((node,index)=>node.textContent=[counts['A+'],counts.A,counts.B,counts.C][index]);}
      const leaguePanel=document.querySelector('.league-panel');
      if(leaguePanel){const leagueCounts=Object.entries(games.reduce((acc,g)=>{acc[g.league]=(acc[g.league]||0)+1;return acc;},{})).sort((a,b)=>b[1]-a[1]);leaguePanel.innerHTML=`<div class="panel-head"><div><h2>Distribuição por liga</h2><p>Análises publicadas</p></div></div><div class="league-list">${leagueCounts.map(([league,count])=>`<span><i style="--c:#755cf5"></i>${league} <b>${count}</b></span>`).join('')}</div>`;}
      const scannerBadge = document.querySelector('[data-page="scanner"] b'); if (scannerBadge) scannerBadge.textContent = activeGames().length;
      const best = games[0]; if (best) setHtml("#aiAnswer", `<span>SCANNER AI</span><h2>${best.home} × ${best.away}</h2><p>${best.explanation || "Análise editorial publicada."}</p><p><strong>Orientação:</strong> ${best.instruction || "Acompanhar o mercado."}</p><small>Análise estatística e informativa. Não constitui garantia de resultado.</small>`);
      renderScanner(); renderWatchlist(); bindGames();
    } catch (error) { console.warn("Análises editoriais indisponíveis:", error.message); }
  }
  window.addEventListener("scannerday:authenticated", event => { updateAuthUI(); if (event.detail?.isAdmin) loadImports(); syncEditorialAnalyses(); });
  if (session()?.access_token) syncEditorialAnalyses();
  window.ScannerAdminResultUpdater = async (analysisId, result) => {
    const response = await api("/api/admin-analysis-result", { method: "PATCH", body: JSON.stringify({ analysis_id: analysisId, result }) });
    const game = games.find(item => item.id === analysisId);
    if (game) game.scannerResult = response.result;
    renderAnalysisHistory();
    toast("Resultado atualizado", `Análise classificada como ${response.result === "green" ? "Green" : "Red"}.`);
  };
})();
