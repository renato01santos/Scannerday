(function () {
  const byId = id => document.getElementById(id);
  const escapeHtml = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);
  const token = () => window.ScannerBackend?.state?.session?.access_token || "";
  function notify(title, detail) { const element=byId("toast");element.querySelector("strong").textContent=title;element.querySelector("small").textContent=detail;element.classList.add("show");setTimeout(()=>element.classList.remove("show"),4000); }

  async function loadSuggestedBets() {
    if (!token()) return;
    const grid = byId("suggestedBetsGrid");
    try {
      const response = await fetch("/api/suggested-bets", { headers: { Authorization: `Bearer ${token()}` } });
      const rows = await response.json();
      if (!response.ok) throw new Error(rows.error || "Não foi possível carregar as apostas.");
      grid.innerHTML = rows.length ? rows.map(row => `<article class="suggested-bet-card panel"><header><div><span class="suggested-label">APOSTA SUGERIDA</span><h2>${escapeHtml(row.home_team)} × ${escapeHtml(row.away_team)}</h2><p>${escapeHtml(row.competition)} · ${escapeHtml(row.match_date)} ${escapeHtml(String(row.match_time || "").slice(0,5))}</p></div><strong class="confidence-badge">${Number(row.confidence)}%</strong></header><div class="suggested-pick"><span>SELEÇÃO</span><strong>${escapeHtml(row.selection)}</strong><small>${escapeHtml(row.market)}</small></div><div class="suggested-numbers"><div><span>ODD</span><strong>${Number(row.entry_odd).toFixed(2)}</strong></div><div><span>STAKE</span><strong>${Number(row.stake).toFixed(2)}u</strong></div><div><span>PUBLICADA</span><strong>${new Date(row.published_at).toLocaleDateString("pt-BR")}</strong></div></div><section><h3>Análise</h3><p>${escapeHtml(row.analysis)}</p>${row.instruction ? `<p class="bet-instruction"><strong>Orientação:</strong> ${escapeHtml(row.instruction)}</p>` : ""}</section><footer>Conteúdo informativo. Aposte com responsabilidade.</footer></article>`).join("") : '<section class="panel premium-empty"><h2>Nenhuma aposta publicada</h2><p>As recomendações da equipe aparecerão aqui.</p></section>';
    } catch (error) { grid.innerHTML = `<section class="panel premium-empty"><h2>Não foi possível carregar</h2><p>${escapeHtml(error.message)}</p></section>`; }
  }

  function fillForm(data) {
    const value = (id, ...keys) => { const key = keys.find(item => data[item] !== undefined); if (key) byId(id).value = data[key] ?? ""; };
    value("betCompetition", "competition"); value("betHomeTeam", "home_team", "home"); value("betAwayTeam", "away_team", "away");
    value("betMatchDate", "match_date", "date"); value("betMatchTime", "match_time", "time"); value("betMarket", "market");
    value("betSelection", "selection", "pick"); value("betOdd", "entry_odd", "odd"); value("betStake", "stake");
    value("betConfidence", "confidence"); value("betAnalysis", "analysis", "explanation"); value("betInstruction", "instruction");
  }

  byId("selectSuggestedBetFile").onclick = () => byId("suggestedBetFile").click();
  byId("suggestedBetFile").onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    byId("suggestedBetFileName").textContent = file.name;
    try { fillForm(JSON.parse(await file.text())); byId("suggestedBetError").hidden = true; }
    catch (_) { byId("suggestedBetError").textContent = "JSON inválido."; byId("suggestedBetError").hidden = false; }
  };

  byId("suggestedBetForm").onsubmit = async event => {
    event.preventDefault();
    if (!window.ScannerAuth?.isAdmin) return;
    const button = event.currentTarget.querySelector('[type="submit"]'), errorBox = byId("suggestedBetError");
    button.disabled = true; button.textContent = "Publicando…"; errorBox.hidden = true;
    const payload = { competition:byId("betCompetition").value.trim(), home_team:byId("betHomeTeam").value.trim(), away_team:byId("betAwayTeam").value.trim(), match_date:byId("betMatchDate").value, match_time:byId("betMatchTime").value || null, market:byId("betMarket").value.trim(), selection:byId("betSelection").value.trim(), entry_odd:Number(byId("betOdd").value), stake:Number(byId("betStake").value), confidence:Number(byId("betConfidence").value), analysis:byId("betAnalysis").value.trim(), instruction:byId("betInstruction").value.trim() };
    try {
      const result = await new Promise((resolve, reject) => { const request=new XMLHttpRequest(); request.open("POST","/api/admin-suggested-bets"); request.setRequestHeader("Content-Type","application/json"); request.setRequestHeader("Authorization",`Bearer ${token()}`); request.onload=()=>{const data=JSON.parse(request.responseText||"{}");request.status>=200&&request.status<300?resolve(data):reject(new Error(data.error||`Erro ${request.status}`));};request.onerror=()=>reject(new Error("Não foi possível conectar à API."));request.send(JSON.stringify(payload)); });
      event.currentTarget.reset(); byId("suggestedBetFileName").textContent="Nenhum arquivo selecionado"; notify("Aposta publicada", `${result.home_team} × ${result.away_team}`); await loadSuggestedBets(); navigate("suggested-bets");
    } catch (error) { errorBox.textContent=error.message; errorBox.hidden=false; }
    finally { button.disabled=false; button.textContent="Publicar aposta sugerida"; }
  };

  document.querySelector('[data-page="suggested-bets"]').addEventListener("click", loadSuggestedBets);
  window.addEventListener("scannerday:authenticated", loadSuggestedBets);
})();
