'use strict';

(function () {
  const listEl      = document.getElementById('nl-list');
  const modal       = document.getElementById('nl-modal');
  const modalTitle  = document.getElementById('modal-title');
  const contentEl   = document.getElementById('nl-content');
  const btnRefresh  = document.getElementById('btn-refresh-nl');
  const btnClose    = document.getElementById('btn-close-modal');
  const btnCopy     = document.getElementById('btn-copy-nl');
  const btnShare    = document.getElementById('btn-share-nl');

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
          id: doc.id,
          createdAt:    d.createdAt?.toDate?.()?.toISOString() ?? null,
          articleCount: d.articleCount  ?? 0,
          totalCrawled: d.totalCrawled  ?? 0,
          hoursBack:    d.hoursBack     ?? 24,
          content:      d.content       ?? '',
        };
      });
      render();
    } catch (e) {
      listEl.innerHTML = `<p class="placeholder result-error">오류: ${e.message}</p>`;
    }
  }

  function render() {
    if (!newsletters.length) {
      listEl.innerHTML =
        '<p class="placeholder">수집된 뉴스레터가 없습니다.<br>GitHub Actions에서 수집을 실행하세요.</p>';
      return;
    }
    listEl.innerHTML = '';
    newsletters.forEach(nl => {
      const div = document.createElement('div');
      div.className = 'nl-item';
      const dateStr = nl.createdAt
        ? new Date(nl.createdAt).toLocaleString('ko-KR')
        : '날짜 없음';
      const preview = (nl.content || '').split('\n')[0].slice(0, 80);
      div.innerHTML = `
        <div class="nl-item-header">
          <span class="nl-item-date">${dateStr}</span>
          <span class="nl-item-count">기사 ${nl.articleCount}건 (수집 ${nl.totalCrawled}건)</span>
        </div>
        <div class="nl-item-preview">${escHtml(preview)}</div>
      `;
      div.addEventListener('click', () => openModal(nl));
      listEl.appendChild(div);
    });
  }

  function openModal(nl) {
    const dateStr = nl.createdAt
      ? new Date(nl.createdAt).toLocaleString('ko-KR')
      : '';
    modalTitle.textContent = `뉴스레터 ${dateStr}`;
    contentEl.textContent  = nl.content || '';
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
  }

  function closeModal() {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }

  btnClose.addEventListener('click', closeModal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

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

  btnRefresh.addEventListener('click', load);

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
