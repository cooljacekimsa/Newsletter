'use strict';

(function () {
  const GH_PAT_KEY  = 'gh_pat_africa';
  const GH_OWNER    = 'shaunyoo-ao';
  const GH_REPO     = 'africa';
  const GH_WORKFLOW = 'crawl.yml';
  const GH_BRANCH   = 'claude/deploy-firebase-MxySo';

  function getPat() {
    return localStorage.getItem(GH_PAT_KEY) || '';
  }

  async function trigger(hoursBack, onResult) {
    const pat = getPat();
    if (!pat) {
      onResult('설정에서 GitHub PAT를 먼저 저장해주세요.', 'error');
      return;
    }
    onResult('수집 요청 중...', 'info');
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
          body: JSON.stringify({ ref: GH_BRANCH, inputs: { hours_back: String(hoursBack) } }),
        }
      );
      if (resp.status === 204) {
        onResult(`✓ 수집 시작 (${hoursBack}시간) — 완료 후 새로고침하세요.`, 'success');
      } else {
        const body = await resp.json().catch(() => ({}));
        const msg = body.message || `HTTP ${resp.status}`;
        onResult(resp.status === 401 ? `인증 실패: PAT를 확인하세요. ${msg}` : `오류: ${msg}`, 'error');
      }
    } catch (e) {
      onResult(`네트워크 오류: ${e.message}`, 'error');
    }
  }

  window.crawlView = { getPat, trigger };
})();
