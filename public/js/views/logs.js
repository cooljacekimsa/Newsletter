'use strict';

(function () {
  const listEl     = document.getElementById('log-list');
  const btnCopy    = document.getElementById('btn-copy-logs');
  const btnRefresh = document.getElementById('btn-refresh-logs');

  let rawLogs = [];

  async function load() {
    listEl.innerHTML = '<p class="placeholder">불러오는 중...</p>';
    try {
      const snap = await window.db
        .collection('logs')
        .orderBy('timestamp', 'desc')
        .limit(200)
        .get();

      rawLogs = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id:        doc.id,
          timestamp: d.timestamp?.toDate?.()?.toISOString() ?? null,
          level:     d.level   ?? 'info',
          message:   d.message ?? '',
          url:       d.url     ?? null,
        };
      });
      render();
    } catch (e) {
      listEl.innerHTML = `<p class="placeholder result-error">오류: ${e.message}</p>`;
    }
  }

  function render() {
    if (!rawLogs.length) {
      listEl.innerHTML = '<p class="placeholder">로그가 없습니다.</p>';
      return;
    }
    listEl.innerHTML = '';
    rawLogs.forEach(log => {
      const div = document.createElement('div');
      div.className = 'log-item ' + (log.level === 'error' ? 'error' : 'info');
      const ts     = log.timestamp ? new Date(log.timestamp).toLocaleString('ko-KR') : '';
      const urlPart = log.url ? `\n↳ ${log.url}` : '';
      div.innerHTML = `<span class="log-time">${ts}</span>  ${escHtml(log.message)}${escHtml(urlPart)}`;
      listEl.appendChild(div);
    });
  }

  btnRefresh.addEventListener('click', load);

  btnCopy.addEventListener('click', async () => {
    const text = rawLogs
      .map(l => `[${l.level.toUpperCase()}] ${l.timestamp || ''} ${l.message}${l.url ? ' | ' + l.url : ''}`)
      .join('\n');
    try {
      await navigator.clipboard.writeText(text);
      btnCopy.textContent = '복사됨 ✓';
      setTimeout(() => { btnCopy.textContent = '전체 복사'; }, 2000);
    } catch {
      alert(text);
    }
  });

  function escHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  window.logsView = { load };
})();
