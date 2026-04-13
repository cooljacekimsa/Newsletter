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

  const ARTICLE_SEP = '\n\n' + '─'.repeat(40) + '\n\n';
  const CHAR_LIMIT  = 2990; // 3000에서 "[N/M부]\n\n" 레이블 여유분 제외

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

  function splitContent(content) {
    if (content.length <= 3000) return [content];
    const articles = content.split(ARTICLE_SEP);
    const parts = [];
    let current = [];
    let currentLen = 0;
    for (const article of articles) {
      const addLen = (current.length > 0 ? ARTICLE_SEP.length : 0) + article.length;
      if (currentLen + addLen > CHAR_LIMIT && current.length > 0) {
        parts.push(current.join(ARTICLE_SEP));
        current = [article];
        currentLen = article.length;
      } else {
        current.push(article);
        currentLen += addLen;
      }
    }
    if (current.length > 0) parts.push(current.join(ARTICLE_SEP));
    return parts;
  }

  function renderSplitBar(barEl, parts) {
    const total = parts.length;
    barEl.innerHTML = `<span class="split-bar-label">${total}부로 나눠 복사:</span>`;
    parts.forEach((part, i) => {
      const btn = document.createElement('button');
      btn.className = 'btn btn-sm btn-split-part';
      btn.textContent = `${i + 1}부`;
      btn.title = `${part.length}자`;
      btn.addEventListener('click', async () => {
        const labeled = `[${i + 1}/${total}부]\n\n${part}`;
        try {
          await navigator.clipboard.writeText(labeled);
          btn.textContent = `${i + 1}부 ✓`;
          setTimeout(() => { btn.textContent = `${i + 1}부`; }, 2000);
        } catch {
          fallbackCopy(labeled);
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
    const parts = splitContent(content);
    if (parts.length > 1) {
      renderSplitBar(splitBarEl, parts);
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
