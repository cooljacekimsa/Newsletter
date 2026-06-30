'use strict';

(function () {
  const listEl     = document.getElementById('log-list');
  const btnCopy    = document.getElementById('btn-copy-logs');
  const btnRefresh = document.getElementById('btn-refresh-logs');
  const btnDelAll  = document.getElementById('btn-delete-all-logs');

  let rawLogs = [];
  let loaded = false;

  // ── GitHub Actions 실행 기록 패널 ─────────────────────────────
  function getGhPanel() {
    let panel = document.getElementById('gh-runs-panel');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'gh-runs-panel';
      panel.style.cssText = 'margin-bottom:16px;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;';
      const header = document.createElement('div');
      header.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:#f8fafc;border-bottom:1px solid #e2e8f0;font-weight:600;font-size:13px;';
      header.innerHTML = '<span>📋 GitHub Actions 실행 기록</span>';
      const refreshBtn = document.createElement('button');
      refreshBtn.className = 'btn btn-sm';
      refreshBtn.textContent = '새로고침';
      refreshBtn.style.cssText = 'padding:2px 10px;font-size:11px;';
      refreshBtn.addEventListener('click', () => loadGhRuns(true));
      header.appendChild(refreshBtn);
      panel.appendChild(header);
      const body = document.createElement('div');
      body.id = 'gh-runs-body';
      body.style.cssText = 'padding:10px 14px;font-size:12px;';
      body.textContent = '로딩 중...';
      panel.appendChild(body);
      listEl.parentNode.insertBefore(panel, listEl);
    }
    return document.getElementById('gh-runs-body');
  }

  async function loadGhRuns(force) {
    const pat = window.crawlView?.getPat?.();
    const body = getGhPanel();
    if (!pat) {
      body.innerHTML = '<span style="color:#888">설정 탭에서 GitHub PAT를 저장하면 Actions 실행 기록을 볼 수 있습니다.</span>';
      return;
    }
    body.textContent = '불러오는 중...';
    try {
      const GH_OWNER = 'cooljacekimsa';
      const GH_REPO  = 'Newsletter';
      const headers  = {
        'Authorization': `Bearer ${pat}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      };
      const [crawlResp, deployResp] = await Promise.all([
        fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/crawl.yml/runs?per_page=5`, { headers }),
        fetch(`https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/deploy.yml/runs?per_page=3`, { headers }),
      ]);

      if (crawlResp.status === 401 || crawlResp.status === 403) {
        body.innerHTML = `<span style="color:#e53e3e">PAT 인증 오류 (${crawlResp.status}) — 설정에서 PAT를 다시 확인하세요.</span>`;
        return;
      }
      if (!crawlResp.ok) {
        body.innerHTML = `<span style="color:#e53e3e">GitHub API 오류: HTTP ${crawlResp.status}</span>`;
        return;
      }

      const crawlData  = await crawlResp.json();
      const deployData = deployResp.ok ? await deployResp.json() : { workflow_runs: [] };
      const allRuns    = [
        ...(crawlData.workflow_runs  || []).map(r => ({ ...r, _type: '크롤링' })),
        ...(deployData.workflow_runs || []).map(r => ({ ...r, _type: '배포' })),
      ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 8);

      if (!allRuns.length) {
        body.textContent = '실행 기록이 없습니다.';
        return;
      }

      body.innerHTML = '';
      allRuns.forEach(run => {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid #f1f5f9;flex-wrap:wrap;';

        const conclusionIcon = {
          success: '✅', failure: '❌', cancelled: '⚠️', skipped: '⏭️',
        }[run.conclusion] || (run.status === 'in_progress' ? '🔄' : run.status === 'queued' ? '⏳' : '❓');

        const dt = new Date(run.created_at).toLocaleString('ko-KR', {
          month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });

        const badge = document.createElement('span');
        badge.style.cssText = `display:inline-block;padding:1px 6px;border-radius:4px;font-size:10px;font-weight:600;flex-shrink:0;background:${run._type === '크롤링' ? '#ebf8ff' : '#f0fff4'};color:${run._type === '크롤링' ? '#2b6cb0' : '#276749'};`;
        badge.textContent = run._type;

        const info = document.createElement('span');
        info.style.cssText = 'flex:1;min-width:0;color:#4a5568;';
        info.textContent = `${conclusionIcon} ${dt}  ${run.conclusion || run.status}`;

        const link = document.createElement('a');
        link.href = run.html_url;
        link.target = '_blank';
        link.rel = 'noopener';
        link.textContent = '로그 보기';
        link.style.cssText = 'font-size:11px;color:#4299e1;text-decoration:underline;flex-shrink:0;';

        row.appendChild(badge);
        row.appendChild(info);
        row.appendChild(link);
        body.appendChild(row);
      });
    } catch (e) {
      body.innerHTML = `<span style="color:#e53e3e">오류: ${e.message}</span>`;
    }
  }

  async function load() {
    if (loaded) return;
    loaded = true;
    listEl.innerHTML = '<p class="placeholder">불러오는 중...</p>';
    loadGhRuns(false);
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
      loaded = false;
      listEl.innerHTML = `<p class="placeholder result-error">오류: ${e.message}</p>`;
    }
  }

  function reload() {
    loaded = false;
    loadGhRuns(true);
    load();
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

  btnRefresh.addEventListener('click', reload);
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
