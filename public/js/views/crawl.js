'use strict';

(function () {
  const GH_PAT_KEY  = 'gh_pat_africa';
  const GH_OWNER    = 'cooljacekimsa';
  const GH_REPO     = 'Newsletter';
  const GH_BRANCH   = 'claude/firebase-web-app-impl-4ail8j';

  function getPat() {
    return localStorage.getItem(GH_PAT_KEY) || '';
  }

  async function trigger(workflowFile, inputs, onResult) {
    const pat = getPat();
    if (!pat) {
      onResult('설정에서 GitHub PAT를 먼저 저장해주세요.', 'error');
      return;
    }
    onResult('수집 요청 중...', 'info');
    try {
      const resp = await fetch(
        `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${workflowFile}/dispatches`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${pat}`,
            'Accept': 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ ref: GH_BRANCH, inputs }),
        }
      );
      if (resp.status === 204) {
        onResult('✓ 수집 시작 — 완료 후 새로고침하세요.', 'success');
      } else {
        const body = await resp.json().catch(() => ({}));
        const ghMsg = body.message || '(응답 없음)';
        let detail = `HTTP ${resp.status}: ${ghMsg}`;
        if (resp.status === 401) detail = `PAT 인증 실패 — 토큰을 확인하세요. (${ghMsg})`;
        if (resp.status === 403) detail = `권한 없음 — PAT에 'workflow' 스코프가 필요합니다. (${ghMsg})`;
        if (resp.status === 404) detail = `워크플로를 찾을 수 없음 (404) — 저장소: ${GH_OWNER}/${GH_REPO}, 브랜치: ${GH_BRANCH}, 워크플로: ${workflowFile}. PAT가 올바른 계정 것인지 확인하세요.`;
        if (resp.status === 422) detail = `요청 오류 (422): ${ghMsg} — 브랜치명을 확인하세요.`;
        onResult(`오류: ${detail}`, 'error');
      }
    } catch (e) {
      onResult(`네트워크 오류: ${e.message}`, 'error');
    }
  }

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function pollRunStatus(workflowFile, onUpdate) {
    const pat = getPat();
    if (!pat) return;

    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/actions/workflows/${workflowFile}/runs?branch=${encodeURIComponent(GH_BRANCH)}&per_page=1`;
    const headers = {
      'Authorization': `Bearer ${pat}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };

    // GitHub needs a moment to register the new run
    await sleep(4000);

    for (let i = 0; i < 42; i++) {  // max ~3.5 min
      try {
        const resp = await fetch(url, { headers });
        if (resp.ok) {
          const data = await resp.json();
          const run  = data.workflow_runs?.[0];
          if (run) {
            onUpdate(run.status, run.conclusion);
            if (run.status === 'completed') return;
          }
        }
      } catch { /* retry */ }
      await sleep(5000);
    }
    onUpdate('timeout', null);
  }

  window.crawlView = { getPat, trigger, pollRunStatus };
})();
