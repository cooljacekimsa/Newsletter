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
    if (tab.dataset.tab === 'crawl')      window.crawlView?.load();
    if (tab.dataset.tab === 'settings')   window.settingsView?.load();
    if (tab.dataset.tab === 'logs')       window.logsView?.load();
  });
});

// ── Boot ──────────────────────────────────────────────────────────────────────
(async function boot() {
  await window.settingsView?.load();
  window.nlView?.load();
})();
