'use strict';

(function () {
  const listEl      = document.getElementById('nl-list');
  const modal       = document.getElementById('nl-modal');
  const modalTitle  = document.getElementById('modal-title');
  const contentEl   = document.getElementById('nl-content');
  const btnRefresh  = document.getElementById('btn-refresh-nl');
  const btnDelAll   = document.getElementById('btn-delete-all-nl');
  const btnClose    = document.getElementById('btn-close-modal');
  const btnCopy     = document.getElementById('btn-copy-nl');
  const btnShare    = document.getElementById('btn-share-nl');
  const statsTextEl = document.getElementById('nl-stats-text');
  const btnRunCrawl = document.getElementById('btn-run-crawl');
  const crawlMsgEl  = document.getElementById('crawl-trigger-msg');

  const ARTICLE_SEP = '\n\n' + '─'.repeat(40) + '\n\n';

  let newsletters = [];

  async function load() {
    listEl.innerHTML = '<p class="placeholder">불러오는 중...</p>';
    try {
      const snap = await window.db
        .collection('newsletters')
        .orderBy('createdAt', 'desc')
        .limit(20)
        .get();

      newsletters = snap.docs.map(doc => {
        const d = doc.data();
        return {
          id:           doc.id,
          createdAt:    d.createdAt?.toDate?.()?.toISOString() ?? null,
          articleCount: d.articleCount ?? 0,
          totalCrawled: d.totalCrawled ?? 0,
          hoursBack:    d.hoursBack    ?? 24,
          content:      d.content      ?? '',
        };
      });
      render();
      updateStatsBar();
    } catch (e) {
      listEl.innerHTML = `<p class="placeholder result-error">오류: ${e.message}</p>`;
    }
  }

  function formatDate(isoStr) {
    if (!isoStr) return '날짜 없음';
    return new Date(isoStr).toLocaleString('ko-KR', {
      year: 'numeric', month: 'long', day: 'numeric',
      weekday: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  function updateStatsBar() {
    if (!newsletters.length) {
      statsTextEl.textContent = '수집된 뉴스레터 없음';
      return;
    }
    const nl = newsletters[0];
    const d  = nl.createdAt
      ? new Date(nl.createdAt).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
      : '날짜 없음';
    statsTextEl.textContent = `마지막 수집: ${d} · ${nl.articleCount}건`;
  }

  // ── 수집 트리거 ──────────────────────────────────────────
  btnRunCrawl.addEventListener('click', async () => {
    btnRunCrawl.disabled = true;
    let hoursBack = 24;
    try {
      const doc = await window.db.collection('settings').doc('global').get();
      if (doc.exists) hoursBack = doc.data().hoursBack || 24;
    } catch { /* use default */ }

    window.crawlView?.trigger(hoursBack, (msg, type) => {
      crawlMsgEl.textContent = msg;
      crawlMsgEl.className   = `crawl-msg ${type}`;
      crawlMsgEl.classList.remove('hidden');
      if (type !== 'info') {
        setTimeout(() => crawlMsgEl.classList.add('hidden'), 6000);
        btnRunCrawl.disabled = false;
      }
    });
  });

  function render() {
    if (!newsletters.length) {
      listEl.innerHTML = '<p class="placeholder">수집된 뉴스레터가 없습니다.</p>';
      return;
    }
    listEl.innerHTML = '';
    newsletters.forEach(nl => {
      const div = document.createElement('div');
      div.className = 'nl-item';
      const dateStr = formatDate(nl.createdAt);
      const preview = (nl.content || '').split('\n')[0].slice(0, 80);
      div.innerHTML = `
        <div class="nl-item-header">
          <span class="nl-item-date">${escHtml(dateStr)}</span>
          <div style="display:flex;align-items:center;gap:8px;">
            <span class="nl-item-count">기사 ${nl.articleCount}건 (수집 ${nl.totalCrawled}건)</span>
            <button class="btn btn-sm btn-danger" data-del="${nl.id}" style="padding:2px 8px;font-size:11px;">삭제</button>
          </div>
        </div>
        <div class="nl-item-preview">${escHtml(preview)}</div>
      `;
      div.querySelector('[data-del]').addEventListener('click', e => {
        e.stopPropagation();
        deleteNewsletter(nl.id);
      });
      div.addEventListener('click', () => openModal(nl));
      listEl.appendChild(div);
    });
  }

  async function deleteNewsletter(id) {
    if (!confirm('이 뉴스레터를 삭제하시겠습니까?')) return;
    try {
      await window.db.collection('newsletters').doc(id).delete();
      newsletters = newsletters.filter(n => n.id !== id);
      render();
    } catch (e) {
      alert('삭제 실패: ' + e.message);
    }
  }

  async function deleteAllNewsletters() {
    if (!newsletters.length) return;
    if (!confirm(`뉴스레터 ${newsletters.length}개를 모두 삭제하시겠습니까?`)) return;
    try {
      const batch = window.db.batch();
      newsletters.forEach(nl => {
        batch.delete(window.db.collection('newsletters').doc(nl.id));
      });
      await batch.commit();
      newsletters = [];
      render();
    } catch (e) {
      alert('전체 삭제 실패: ' + e.message);
    }
  }

  function renderArticleBar(barEl, articles) {
    const total = articles.length;
    barEl.innerHTML = `<span class="split-bar-label">기사별 복사 (${total}건):</span>`;
    articles.forEach((article, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-split-part';
      const firstLine = article.split('\n').find(l => l.trim()) || '';
      const label = firstLine.slice(0, 14) || String(i + 1);
      btn.textContent = label;
      btn.title = `기사 ${i + 1}/${total} · ${article.length}자`;
      btn.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(article);
          btn.textContent = label + ' ✓';
          setTimeout(() => { btn.textContent = label; }, 2000);
        } catch {
          fallbackCopy(article);
        }
      });
      barEl.appendChild(btn);
    });
  }

  function openModal(nl) {
    const content = nl.content || '';
    modalTitle.textContent = `뉴스레터 ${formatDate(nl.createdAt)}`;
    contentEl.textContent  = content;

    const splitBarEl = document.getElementById('nl-split-bar');
    const articles = content.split(ARTICLE_SEP).filter(a => a.trim());
    if (articles.length > 1) {
      renderArticleBar(splitBarEl, articles);
      splitBarEl.classList.remove('hidden');
    } else {
      splitBarEl.innerHTML = '';
      splitBarEl.classList.add('hidden');
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  btnClose.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  btnRefresh.addEventListener('click', load);
  btnDelAll.addEventListener('click', deleteAllNewsletters);

  btnCopy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(contentEl.textContent);
      btnCopy.textContent = '복사됨 ✓';
      setTimeout(() => { btnCopy.textContent = '복사'; }, 2000);
    } catch {
      fallbackCopy(contentEl.textContent);
    }
  });

  btnShare.addEventListener('click', async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: '뉴스레터', text: contentEl.textContent });
      } catch { /* cancelled */ }
    } else {
      await navigator.clipboard.writeText(contentEl.textContent);
      btnShare.textContent = '클립보드 복사됨';
      setTimeout(() => { btnShare.textContent = '공유'; }, 2000);
    }
  });

  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }

  function escHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  window.nlView = { load };
})();
