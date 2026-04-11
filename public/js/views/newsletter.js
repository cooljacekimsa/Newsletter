'use strict';

(function () {
  const listEl     = document.getElementById('nl-list');
  const modal      = document.getElementById('nl-modal');
  const modalTitle = document.getElementById('modal-title');
  const contentEl  = document.getElementById('nl-content');
  const btnRefresh = document.getElementById('btn-refresh-nl');
  const btnDelAll  = document.getElementById('btn-delete-all-nl');
  const btnClose   = document.getElementById('btn-close-modal');
  const btnCopy    = document.getElementById('btn-copy-nl');
  const btnShare   = document.getElementById('btn-share-nl');

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

  function openModal(nl) {
    modalTitle.textContent = `뉴스레터 ${formatDate(nl.createdAt)}`;
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
