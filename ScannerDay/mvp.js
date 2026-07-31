(function () {
  const byId = id => document.getElementById(id);
  const token = () => window.ScannerBackend?.state?.session?.access_token || "";
  const esc = value => String(value ?? "").replace(/[&<>'"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]);

  async function api(url) {
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token()}` } });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `Erro ${response.status}`);
    return data;
  }

  function renderHome() {
    byId("dashboard-page").innerHTML = `<div class="page-heading"><div><p class="eyebrow" id="dashboardEyebrow">SCANNERDAY MVP</p><h1 id="dashboardTitle">Favoritos visitantes, analisados com método.</h1><p id="dashboardSubtitle">Análises esportivas publicadas com uma metodologia clara e objetiva.</p></div></div><div class="mvp-intro"><section class="panel mvp-hero"><span>ESTRATÉGIA EXCLUSIVA</span><h2>Somente favoritos <em>visitantes</em>.</h2><p>O ScannerDay analisa equipes visitantes favoritas na faixa de odds entre <strong>1.20 e 1.65</strong>. Cada jogo é avaliado por probabilidade, odd justa, EV, riscos e pontos fortes antes de receber uma classificação.</p></section><div class="mvp-method"><article class="panel"><strong>01</strong><h3>Filtro da estratégia</h3><p>Apenas favoritos visitantes dentro da faixa oficial de odds entram no processo.</p></article><article class="panel"><strong>02</strong><h3>ScannerScore</h3><p>Índice de 0 a 100 que resume a qualidade da oportunidade segundo os critérios importados.</p></article><article class="panel"><strong>03</strong><h3>Interpretação</h3><p>Compare probabilidade Scanner, mercado, odd justa e EV. Aprovado indica entrada qualificada; Monitor exige acompanhamento.</p></article></div><section class="panel mvp-flow"><h2>Fluxo diário</h2><p>A inteligência permanece no ChatGPT; o ScannerDay publica e organiza o conteúdo.</p><div><span>ChatGPT gera JSON</span><b>→</b><span>Admin importa</span><b>→</b><span>Scanner atualiza</span><b>→</b><span>Usuário analisa</span></div></section></div>`;
  }

  function metrics(rows) {
    const settled = rows.filter(row => row.bet_status && row.bet_status !== "Open");
    const stake = settled.reduce((sum, row) => sum + Number(row.stake || 0), 0);
    const profit = settled.reduce((sum, row) => sum + Number(row.profit || 0), 0);
    const greens = settled.filter(row => ["Won", "Half Won"].includes(row.bet_status)).length;
    const reds = settled.filter(row => ["Lost", "Half Lost"].includes(row.bet_status)).length;
    return { settled, profit, greens, reds, voids: settled.filter(row => row.bet_status === "Void").length, winRate: settled.length ? greens / settled.length * 100 : 0, roi: stake ? profit / stake * 100 : 0 };
  }

  async function renderResults() {
    const root = byId("mvpResults");
    try {
      const rows = await api("/api/suggested-bets"), value = metrics(rows);
      root.innerHTML = `<div class="mvp-result-kpis"><article class="simple-kpi"><span>TOTAL</span><strong>${rows.length}</strong></article><article class="simple-kpi"><span>GREENS / REDS</span><strong>${value.greens} / ${value.reds}</strong></article><article class="simple-kpi"><span>WIN RATE</span><strong>${value.settled.length ? value.winRate.toFixed(1) + "%" : "—"}</strong></article><article class="simple-kpi"><span>ROI / YIELD</span><strong>${value.settled.length ? value.roi.toFixed(2) + "%" : "—"}</strong></article></div><section class="panel mvp-result-history"><div class="panel-head"><div><h2>Histórico de apostas</h2><p>${value.voids} void(s) · lucro acumulado ${value.profit.toFixed(2)}u</p></div></div>${value.settled.length ? value.settled.map(row => `<div class="mvp-result-row"><div><strong>${esc(row.match_name || [row.home_team, row.away_team].filter(Boolean).join(" × "))}</strong><small>${esc(row.tip_id)}</small></div><span>${esc(row.selection)}</span><span>${Number(row.entry_odd).toFixed(2)}</span><span>${esc(row.bet_status)}</span><strong class="${Number(row.profit) >= 0 ? "green-text" : "red-text"}">${Number(row.profit || 0).toFixed(2)}u</strong></div>`).join("") : '<div class="admin-empty">Nenhuma aposta liquidada.</div>'}</section>`;
    } catch (error) { root.innerHTML = `<section class="panel admin-empty">${esc(error.message)}</section>`; }
  }

  async function renderUsers() {
    const root = byId("adminUsersTable");
    try {
      const rows = await api("/api/admin-users");
      root.innerHTML = `<div class="mvp-user-row mvp-user-head"><span>USUÁRIO</span><span>PLANO</span><span>CADASTRO</span><span>STATUS</span><span>ÚLTIMO ACESSO</span></div>${rows.map(row => `<div class="mvp-user-row"><div><strong>${esc(row.name || row.email)}</strong><small>${esc(row.email)}</small></div><span>${esc(row.plan || "free")}</span><span>${new Date(row.created_at).toLocaleDateString("pt-BR")}</span><span>${row.confirmed_at ? "Ativo" : "Pendente"}</span><span>${row.last_sign_in_at ? new Date(row.last_sign_in_at).toLocaleString("pt-BR") : "—"}</span></div>`).join("")}`;
    } catch (error) { root.innerHTML = `<div class="admin-empty">${esc(error.message)}</div>`; }
  }

  async function renderAdmin() {
    const root = byId("adminDashboardContent");
    try {
      const [users, analyses, bets, imports] = await Promise.all([api("/api/admin-users"), api("/api/analyses?limit=200"), api("/api/suggested-bets"), api("/api/imports")]);
      const last = imports[0];
      root.innerHTML = `<div class="admin-mvp-kpis"><article class="simple-kpi"><span>TOTAL DE USUÁRIOS</span><strong>${users.length}</strong></article><article class="simple-kpi"><span>USUÁRIOS ATIVOS</span><strong>${users.filter(user => user.confirmed_at).length}</strong></article><article class="simple-kpi"><span>ANÁLISES</span><strong>${analyses.length}</strong></article><article class="simple-kpi"><span>APOSTAS PUBLICADAS</span><strong>${bets.length}</strong></article></div><section class="panel admin-mvp-summary"><h2>Última importação</h2><p>${last ? `${esc(last.file_name)} · ${new Date(last.imported_at).toLocaleString("pt-BR")}` : "Nenhuma importação realizada."}</p></section>`;
    } catch (error) { root.innerHTML = `<section class="panel admin-empty">${esc(error.message)}</section>`; }
  }

  renderHome();
  window.addEventListener("scannerday:authenticated", renderHome);
  document.querySelector('[data-page="results"]')?.addEventListener("click", renderResults);
  document.querySelector('[data-page="admin-users"]')?.addEventListener("click", renderUsers);
  document.querySelector('[data-page="admin-dashboard"]')?.addEventListener("click", renderAdmin);
})();
