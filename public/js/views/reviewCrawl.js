'use strict';

(function () {
  const urlInput     = document.getElementById('rc-url-input');
  const sinceDateInput = document.getElementById('rc-since-date');
  const scopeRadios  = document.querySelectorAll('input[name="rc-scope"]');
  const listEl       = document.getElementById('rc-list');
  const modal        = document.getElementById('rc-modal');
  const modalTitle   = document.getElementById('rc-modal-title');
  const reviewListEl = document.getElementById('rc-review-list');
  const btnRefresh   = document.getElementById('btn-refresh-rc');
  const btnDelAll    = document.getElementById('btn-delete-all-rc');
  const btnClose     = document.getElementById('btn-close-rc-modal');
  const btnExport    = document.getElementById('btn-export-rc');
  const statsTextEl  = document.getElementById('rc-stats-text');
  const btnRunCrawl  = document.getElementById('btn-run-review-crawl');
  const progressEl   = document.getElementById('rc-progress');
  const progressFill = document.getElementById('rc-progress-fill');
  const progressMsg  = document.getElementById('rc-progress-msg');

  const GH_WORKFLOW = 'review-crawl.yml';

  let runs = [];
  let currentItems = [];
  let currentRun = null;
  let loaded = false;

  async function load() {
    if (loaded) return;
    loaded = true;
    listEl.innerHTML = '<p class="placeholder">불러오는 중...</p>';
    try {
      const snap = await window.db
        .collection('reviewCrawls')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      runs = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id:           doc.id,
          createdAt:    d.createdAt?.toDate?.()?.toISOString() ?? null,
          targetUrl:    d.targetUrl    ?? '',
          totalReviews: d.totalReviews ?? 0,
          newCount:     d.newCount     ?? 0,
        };
      });
      render();
      updateStatsBar();
    } catch (e) {
      loaded = false;
      listEl.innerHTML = `<p class="placeholder result-error">오류: ${e.message}</p>`;
    }
  }

  function reload() {
    loaded = false;
    load();
  }

  function formatDate(isoStr) {
    if (!isoStr) return '날짜 없음';
    return new Date(isoStr).toLocaleString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  function updateStatsBar() {
    if (!runs.length) {
      statsTextEl.textContent = '수집된 결과 없음';
      return;
    }
    const r = runs[0];
    const d = r.createdAt
      ? new Date(r.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '날짜 없음';
    statsTextEl.textContent = `마지막 수집: ${d} · ${r.totalReviews}건 (신규 ${r.newCount}건)`;
  }

  // ── 프로그레스바 헬퍼 ────────────────────────────────────
  function setProgress(pct, state, msg) {
    progressEl.classList.remove('hidden');
    progressFill.style.width = pct + '%';
    progressFill.className = 'crawl-progress-fill' + (state === 'running' ? ' running' : '');
    if (state === 'ok')  progressFill.style.background = 'var(--success)';
    if (state === 'err') progressFill.style.background = 'var(--danger)';
    if (state === 'running') progressFill.style.background = '';
    progressMsg.textContent = msg;
    progressMsg.className = 'crawl-progress-msg' + (state === 'ok' ? ' ok' : state === 'err' ? ' err' : '');
  }

  function hideProgress() { progressEl.classList.add('hidden'); }

  // ── 수집 범위 토글 (전체 / 기간 지정) ────────────────────
  scopeRadios.forEach(r => r.addEventListener('change', () => {
    const isPeriod = document.querySelector('input[name="rc-scope"]:checked')?.value === 'period';
    sinceDateInput.classList.toggle('hidden', !isPeriod);
  }));

  // ── 수집 트리거 ──────────────────────────────────────────
  btnRunCrawl.addEventListener('click', async () => {
    const targetUrl = urlInput.value.trim();
    if (!targetUrl) { alert('대상 URL을 입력하세요.'); return; }

    const scope = document.querySelector('input[name="rc-scope"]:checked')?.value || 'all';
    let sinceDate = '';
    if (scope === 'period') {
      sinceDate = sinceDateInput.value;
      if (!sinceDate) { alert('시작일을 선택하세요.'); return; }
    }

    btnRunCrawl.disabled = true;
    setProgress(15, 'running', '수집 요청 중...');

    window.crawlView?.trigger(GH_WORKFLOW, { target_url: targetUrl, since_date: sinceDate }, async (msg, type) => {
      if (type === 'error') {
        setProgress(100, 'err', msg);
        setTimeout(hideProgress, 6000);
        btnRunCrawl.disabled = false;
        return;
      }
      // type === 'success': 트리거 성공 → GitHub Actions 폴링 시작
      setProgress(30, 'running', '대기 중...');
      await window.crawlView.pollRunStatus(GH_WORKFLOW, (status, conclusion) => {
        if (status === 'queued')      setProgress(30, 'running', '대기 중...');
        if (status === 'in_progress') setProgress(65, 'running', '수집 중...');
        if (status === 'timeout')     { setProgress(100, 'err', '시간 초과 — 로그 탭 확인'); setTimeout(hideProgress, 8000); btnRunCrawl.disabled = false; }
        if (status === 'completed') {
          if (conclusion === 'success') {
            setProgress(100, 'ok', '✓ 수집 완료');
            setTimeout(() => { hideProgress(); reload(); updateStatsBar(); }, 2000);
          } else {
            setProgress(100, 'err', `수집 실패 (${conclusion}) — 로그 탭 확인`);
            setTimeout(hideProgress, 8000);
          }
          btnRunCrawl.disabled = false;
        }
      });
    });
  });

  function render() {
    if (!runs.length) {
      listEl.innerHTML = '<p class="placeholder">수집된 결과가 없습니다.</p>';
      return;
    }
    listEl.innerHTML = '';
    runs.forEach(run => {
      const div = document.createElement('div');
      div.className = 'nl-item';
      const dateStr = formatDate(run.createdAt);
      div.innerHTML = `
        <div class="nl-item-header">
          <span class="nl-item-date">${escHtml(dateStr)}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="nl-item-count">${run.totalReviews}건 · <span class="rc-item-newcount">신규 ${run.newCount}건</span></span>
            <button class="btn btn-sm btn-danger" data-del="${run.id}" style="padding:2px 8px;font-size:11px;">삭제</button>
          </div>
        </div>
        <div class="nl-item-preview">${escHtml(run.targetUrl)}</div>
      `;
      div.querySelector('[data-del]').addEventListener('click', e => {
        e.stopPropagation();
        deleteRun(run.id);
      });
      div.addEventListener('click', () => openModal(run));
      listEl.appendChild(div);
    });
  }

  async function deleteRun(id) {
    if (!confirm('이 수집 결과를 삭제하시겠습니까?')) return;
    try {
      await window.db.collection('reviewCrawls').doc(id).delete();
      runs = runs.filter(r => r.id !== id);
      render();
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  }

  async function deleteAllRuns() {
    if (!runs.length) return;
    if (!confirm(`수집 결과 ${runs.length}개를 모두 삭제하시겠습니까?`)) return;
    try {
      const batch = window.db.batch();
      runs.forEach(r => {
        batch.delete(window.db.collection('reviewCrawls').doc(r.id));
      });
      await batch.commit();
      runs = [];
      render();
    } catch (e) {
      alert('전체 삭제 실패: ' + e.message);
    }
  }

  function starString(rating) {
    if (rating == null || isNaN(rating)) return '평점 없음';
    const n = Math.max(0, Math.min(5, Math.round(rating)));
    return '★'.repeat(n) + '☆'.repeat(5 - n);
  }

  function renderReviewList(items) {
    if (!items.length) {
      reviewListEl.innerHTML = '<p class="placeholder">표시할 리뷰가 없습니다.</p>';
      return;
    }
    reviewListEl.innerHTML = '';
    items.forEach(item => {
      const div = document.createElement('div');
      div.className = 'rc-review-item';
      div.innerHTML = `
        <div class="rc-review-header">
          <span class="rc-review-author">${escHtml(item.author || '익명')}${item.isNew ? '<span class="badge-new">NEW</span>' : ''}</span>
          <span class="rc-review-stars">${escHtml(starString(item.rating))}</span>
        </div>
        <div class="rc-review-title">${escHtml(item.title || '(제목 없음)')}</div>
        <div class="rc-review-body">${escHtml(item.body || '')}</div>
      `;
      reviewListEl.appendChild(div);
    });
  }

  async function openModal(run) {
    currentRun = run;
    modalTitle.textContent = `${formatDate(run.createdAt)} · ${run.targetUrl}`;
    reviewListEl.innerHTML = '<p class="placeholder">불러오는 중...</p>';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    try {
      const snap = await window.db
        .collection('reviewItems')
        .where('runId', '==', run.id)
        .orderBy('isNew', 'desc')
        .get();
      currentItems = snap.docs.map(doc => {
        const d = doc.data();
        return {
          reviewId: d.reviewId ?? '',
          url:      d.url ?? '',
          author:   d.author ?? '',
          rating:   d.rating ?? null,
          title:    d.title ?? '',
          body:     d.body ?? '',
          postedAt: d.postedAt?.toDate?.()?.toISOString() ?? null,
          isNew:    !!d.isNew,
        };
      });
      renderReviewList(currentItems);
    } catch (e) {
      reviewListEl.innerHTML = `<p class="placeholder result-error">오류: ${e.message}</p>`;
    }
  }

  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  btnClose.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  btnRefresh.addEventListener('click', reload);
  btnDelAll.addEventListener('click', deleteAllRuns);

  // ── Excel 내보내기 ──────────────────────────────────────
  btnExport.addEventListener('click', () => {
    if (!currentItems.length || !window.XLSX) {
      alert('내보낼 리뷰가 없습니다.');
      return;
    }
    const rows = currentItems.map(item => ({
      '사용자':   item.author || '',
      '평점':     item.rating != null ? item.rating : '',
      '제목':     item.title || '',
      '내용':     item.body || '',
      '신규여부': item.isNew ? '신규' : '기존',
      '작성일':   item.postedAt ? new Date(item.postedAt).toLocaleString('ko-KR') : '',
      'URL':      item.url || '',
    }));
    const ws = window.XLSX.utils.json_to_sheet(rows);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, '리뷰');
    const dateStr = currentRun?.createdAt
      ? new Date(currentRun.createdAt).toISOString().slice(0, 10)
      : new Date().toISOString().slice(0, 10);
    window.XLSX.writeFile(wb, `reviews-${dateStr}.xlsx`);
  });

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  window.reviewCrawlView = { load };
})();
