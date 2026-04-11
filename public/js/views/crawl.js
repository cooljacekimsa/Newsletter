'use strict';

(function () {
  const statsEl      = document.getElementById('crawl-stats');
  const btnRefresh   = document.getElementById('btn-refresh-crawl');
  const patInput     = document.getElementById('gh-pat-input');
  const btnSavePat   = document.getElementById('btn-save-pat');
  const patStatus    = document.getElementById('pat-status');
  const btn24h       = document.getElementById('btn-crawl-24h');
  const btn48h       = document.getElementById('btn-crawl-48h');
  const triggerResult = document.getElementById('trigger-result');

  const GH_PAT_KEY   = 'gh_pat_africa';
  const GH_OWNER     = 'shaunyoo-ao';
  const GH_REPO      = 'africa';
  const GH_WORKFLOW  = 'crawl.yml';
  const GH_BRANCH    = 'claude/deploy-firebase-MxySo';

  // ── PAT 관리 ─────────────────────────────────────────────────────────────────

  function loadPat() {
    const pat = localStorage.getItem(GH_PAT_KEY) || '';
    if (pat) {
      patInput.value = pat;
      patStatus.textContent = '✓ PAT 저장됨 (이 기기 전용)';
      patStatus.style.color = 'var(--success)';
    }
  }

  btnSavePat.addEventListener('click', () => {
    const val = patInput.value.trim();
    if (!val) {
      localStorage.removeItem(GH_PAT_KEY);
      patStatus.textContent = 'PAT가 삭제되었습니다.';
      patStatus.style.color = '#9aa0a6';
      return;
    }
    localStorage.setItem(GH_PAT_KEY, val);
    patStatus.textContent = '✓ PAT 저장됨 (이 기기 전용)';
    patStatus.style.color = 'var(--success)';
  });

  // ── GitHub Actions 트리거 ────────────────────────────────────────────────────

  async function triggerCrawl(hoursBack) {
    const pat = localStorage.getItem(GH_PAT_KEY);
    if (!pat) {
      showTriggerResult('먼저 GitHub PAT를 저장해주세요.', 'error');
      return;
    }

    btn24h.disabled = true;
    btn48h.disabled = true;
    showTriggerResult('수집 요청 중...', 'info');

    try {
      const resp = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${GH_WORKFLOW}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pat}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ref: GH_BRANCH,
            inputs: { hours_back: String(hoursBack) },
          }),
        }
      );

      if (resp.status === 204) {
        showTriggerResult(
          `✓ ${hoursBack}시간 수집 시작됨! GitHub Actions에서 진행 상황을 확인하세요.`,
          'success'
        );
        // Auto-refresh stats after 5s
        setTimeout(load, 5000);
      } else {
        const body = await resp.json().catch(() => ({}));
        const msg = body.message || `HTTP ${resp.status}`;
        if (resp.status === 401) {
          showTriggerResult(`인증 실패: PAT를 확인하세요 (workflow 권한 필요). ${msg}`, 'error');
        } else {
          showTriggerResult(`오류: ${msg}`, 'error');
        }
      }
    } catch (e) {
      showTriggerResult(`네트워크 오류: ${e.message}`, 'error');
    } finally {
      btn24h.disabled = false;
      btn48h.disabled = false;
    }
  }

  btn24h.addEventListener('click', () => triggerCrawl(24));
  btn48h.addEventListener('click', () => triggerCrawl(48));

  function showTriggerResult(msg, type) {
    triggerResult.textContent = msg;
    triggerResult.style.color =
      type === 'success' ? 'var(--success)' :
      type === 'error'   ? 'var(--danger)'  : 'var(--text-2)';
  }

  // ── 수집 통계 ────────────────────────────────────────────────────────────────

  async function load() {
    statsEl.innerHTML = '<p class="placeholder">불러오는 중...</p>';
    try {
      const nlSnap = await window.db
        .collection('newsletters')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (nlSnap.empty) {
        statsEl.innerHTML =
          '<p class="placeholder">아직 수집된 기사가 없습니다.<br>아래 버튼으로 첫 수집을 실행하세요.</p>';
        return;
      }

      const latest   = nlSnap.docs[0].data();
      const lastDate = latest.createdAt?.toDate?.();
      const dateStr  = lastDate ? lastDate.toLocaleString('ko-KR') : '알 수 없음';
      const allSnap  = await window.db.collection('newsletters').get();

      statsEl.innerHTML = `
        <p><strong>마지막 수집:</strong> ${dateStr}</p>
        <p><strong>최근 뉴스레터 기사:</strong> ${latest.articleCount ?? '-'}건
           (수집 원본 ${latest.totalCrawled ?? '-'}건)</p>
        <p><strong>총 뉴스레터 수:</strong> ${allSnap.size}건</p>
        <p style="font-size:12px;color:#9aa0a6;margin-top:8px;">
          수집 출처: ${latest.source === 'github-actions' ? 'GitHub Actions' : latest.source ?? '-'}
        </p>
      `;
    } catch (e) {
      statsEl.innerHTML = `<p class="result-error">오류: ${e.message}</p>`;
    }
  }

  btnRefresh?.addEventListener('click', load);
  loadPat();

  window.crawlView = { load };
})();
