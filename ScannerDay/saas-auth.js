(function () {
  const byId = id => document.getElementById(id);
  const gate = byId("authGate"), shell = byId("appShell"), message = byId("authMessage");
  let profile = null;

  function showMessage(text, type = "error") { message.textContent = text; message.className = `auth-message ${type}`; message.hidden = false; }
  function clearMessage() { message.hidden = true; message.textContent = ""; }
  function showForm(name) {
    document.querySelectorAll(".auth-form").forEach(form => form.classList.toggle("active", form.id === `${name}Form`));
    document.querySelectorAll("[data-auth-tab]").forEach(button => button.classList.toggle("active", button.dataset.authTab === name));
    clearMessage();
  }
  function initials(value) { return String(value || "U").split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase(); }
  function setBusy(form, busy) { const button = form.querySelector('[type="submit"]'); button.disabled = busy; button.dataset.label ||= button.textContent; button.textContent = busy ? "Aguarde…" : button.dataset.label; }

  async function enterApplication() {
    const session = window.ScannerBackend.state.session;
    if (!session?.access_token) return showLogin();
    profile = await window.ScannerBackend.getProfile();
    const admin = profile?.role === "admin";
    document.body.classList.toggle("admin-mode", admin);
    document.querySelectorAll("[data-admin-only]").forEach(element => element.hidden = !admin);
    byId("accountName").textContent = profile?.name || session.user?.email?.split("@")[0] || "Usuário";
    byId("accountAvatar").textContent = initials(profile?.name || session.user?.email);
    byId("accountRole").textContent = admin ? "Administrador" : "Conta ScannerDay";
    byId("rolePill").textContent = admin ? "ADMINISTRADOR" : "USUÁRIO";
    byId("dashboardEyebrow").textContent = admin ? "PAINEL ADMINISTRATIVO" : "ANÁLISES SCANNERDAY";
    byId("dashboardTitle").textContent = admin ? "Visão operacional." : "Suas oportunidades.";
    byId("dashboardSubtitle").textContent = admin ? "Acompanhe dados, integrações e análises publicadas." : "Veja as análises completas e as apostas sugeridas pela equipe.";
    byId("scanBtn").textContent = admin ? "⌁ Executar scanner" : "Ver análises";
    gate.hidden = true; shell.hidden = false;
    window.ScannerAuth = { profile, isAdmin: admin, logout };
    window.dispatchEvent(new CustomEvent("scannerday:authenticated", { detail: window.ScannerAuth }));
  }
  function showLogin() { shell.hidden = true; gate.hidden = false; document.body.classList.remove("admin-mode"); showForm("login"); }
  function logout() { window.ScannerBackend.signOut(); window.ScannerAuth = null; showLogin(); }

  document.querySelectorAll("[data-auth-tab]").forEach(button => button.onclick = () => showForm(button.dataset.authTab));
  byId("showRecovery").onclick = () => showForm("recovery");
  byId("backToLogin").onclick = () => showForm("login");
  byId("sidebarLogout").onclick = logout;

  byId("loginForm").onsubmit = async event => {
    event.preventDefault(); clearMessage(); setBusy(event.currentTarget, true);
    try { await window.ScannerBackend.signIn(byId("loginEmail").value.trim(), byId("loginPassword").value); byId("loginPassword").value = ""; await enterApplication(); }
    catch (error) { showMessage(error.message.includes("Invalid login") ? "E-mail ou senha inválidos." : error.message); }
    finally { setBusy(event.currentTarget, false); }
  };
  byId("signupForm").onsubmit = async event => {
    event.preventDefault(); clearMessage(); setBusy(event.currentTarget, true);
    try {
      const result = await window.ScannerBackend.signUp(byId("signupEmail").value.trim(), byId("signupPassword").value, byId("signupName").value.trim());
      if (result?.access_token) await enterApplication(); else { showForm("login"); showMessage("Conta criada. Confira seu e-mail para confirmar o cadastro.", "success"); }
    } catch (error) { showMessage(error.message); }
    finally { setBusy(event.currentTarget, false); }
  };
  byId("recoveryForm").onsubmit = async event => {
    event.preventDefault(); clearMessage(); setBusy(event.currentTarget, true);
    try { await window.ScannerBackend.recoverPassword(byId("recoveryEmail").value.trim()); showMessage("Link de recuperação enviado. Confira sua caixa de entrada.", "success"); }
    catch (error) { showMessage(error.message); }
    finally { setBusy(event.currentTarget, false); }
  };

  (async () => {
    try {
      const saved = window.ScannerBackend.state.session;
      if (saved?.access_token && saved?.expires_at && saved.expires_at <= Math.floor(Date.now() / 1000) + 30) await window.ScannerBackend.refreshSession();
      if (window.ScannerBackend.state.session?.access_token) await enterApplication(); else showLogin();
    } catch (_) { window.ScannerBackend.signOut(); showLogin(); }
  })();
})();
