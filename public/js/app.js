'use strict';

// ── Tab Router ────────────────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-section').forEach(s => {
      s.classList.remove('active');
      s.classList.add('hidden');
    });
    tab.classList.add('active');
    const target = document.getElementById('tab-' + tab.dataset.tab);
    target.classList.remove('hidden');
    target.classList.add('active');

    // Lazy load on first visit
    if (tab.dataset.tab === 'newsletter') window.nlView?.load();
    if (tab.dataset.tab === 'settings')   window.settingsView?.load();
    if (tab.dataset.tab === 'logs')       window.logsView?.load();
  });
});

// ── Auth Gate + Boot ─────────────────────────────────────────────────────────
let booted = false;
window.auth.onAuthStateChanged(async (user) => {
  if (!user) {
    window.authView.showOverlay();
    booted = false;
    return;
  }
  window.authView.hideOverlay();
  const statusEl = document.getElementById('header-status');
  statusEl.textContent = user.email || '';
  statusEl.style.cursor = 'pointer';
  statusEl.title = '클릭하여 로그아웃';
  statusEl.onclick = async () => {
    if (confirm('로그아웃 하시겠습니까?')) await window.auth.signOut();
  };
  if (!booted) {
    booted = true;
    await window.settingsView?.load();
    window.nlView?.load();
  }
});
