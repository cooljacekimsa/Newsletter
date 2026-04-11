'use strict';

(function () {
  const listEl     = document.getElementById('log-list');
  const btnCopy    = document.getElementById('btn-copy-logs');
  const btnRefresh = document.getElementById('btn-refresh-logs');
  const btnDelAll  = document.getElementById('btn-delete-all-logs');

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
      div.style.display = 'flex';
      div.style.justifyContent = 'space-between';
      div.style.alignItems = 'flex-start';
      div.style.gap = '8px';

      const ts      = log.timestamp ? new Date(log.timestamp).toLocaleString('ko-KR') : '';
      const urlPart = log.url ? `\n↳ ${log.url}` : '';

      const textSpan = document.createElement('span');
      textSpan.style.flex = '1';
      textSpan.style.minWidth = '0';
      textSpan.innerHTML = `<span class="log-time">${ts}</span>  ${escHtml(log.message)}${escHtml(urlPart)}`;

      const delBtn = document.createElement('button');
      delBtn.className = 'btn btn-sm btn-danger';
      delBtn.textContent = '삭제';
      delBtn.style.cssText = 'padding:2px 8px;font-size:11px;flex-shrink:0;';
      delBtn.addEventListener('click', () => deleteLog(log.id));

      div.appendChild(textSpan);
      div.appendChild(delBtn);
      listEl.appendChild(div);
    });
  }

  async function deleteLog(id) {
    try {
      await window.db.collection('logs').doc(id).delete();
      rawLogs = rawLogs.filter(l => l.id !== id);
      render();
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  }

  async function deleteAllLogs() {
    if (!rawLogs.length) return;
    if (!confirm(`로그 ${rawLogs.length}개를 모두 삭제하시겠습니까?`)) return;
    try {
      // Firestore batch limit is 500 — chunk if needed
      for (let i = 0; i < rawLogs.length; i += 400) {
        const batch = window.db.batch();
        rawLogs.slice(i, i + 400).forEach(log => {
          batch.delete(window.db.collection('logs').doc(log.id));
        });
        await batch.commit();
      }
      rawLogs = [];
      render();
    } catch (e) {
      alert('전체 삭제 실패: ' + e.message);
    }
  }

  btnRefresh.addEventListener('click', load);
  btnDelAll.addEventListener('click', deleteAllLogs);

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
