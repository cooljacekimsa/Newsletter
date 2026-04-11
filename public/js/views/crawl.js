'use strict';

(function () {
  const btnCrawl    = document.getElementById('btn-crawl');
  const statusBox   = document.getElementById('crawl-status');
  const statusText  = document.getElementById('crawl-status-text');
  const resultBox   = document.getElementById('crawl-result');
  const hoursBtns   = document.querySelectorAll('.hours-btn');
  const customRow   = document.getElementById('custom-hours-row');
  const customInput = document.getElementById('custom-hours-input');

  let selectedHours = 24;
  let crawling = false;

  // Hours selector
  hoursBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      hoursBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (btn.dataset.hours === 'custom') {
        customRow.classList.remove('hidden');
        selectedHours = parseInt(customInput.value) || 24;
      } else {
        customRow.classList.add('hidden');
        selectedHours = parseInt(btn.dataset.hours);
      }
    });
  });
  customInput.addEventListener('input', () => {
    selectedHours = parseInt(customInput.value) || 24;
  });

  btnCrawl.addEventListener('click', async () => {
    if (crawling) return;
    crawling = true;
    btnCrawl.disabled = true;
    btnCrawl.textContent = '수집 중...';
    statusBox.classList.remove('hidden');
    resultBox.classList.add('hidden');
    statusText.textContent = `최근 ${selectedHours}시간 기사 수집 중...`;

    try {
      const fn = window.functions.httpsCallable('crawlNews');
      const { data } = await fn({ hoursBack: selectedHours });

      statusBox.classList.add('hidden');
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = `
        <p class="result-success">✓ 수집 완료</p>
        <p>수집 기사: <strong>${data.totalCrawled}건</strong></p>
        <p>중복 제거 후: <strong>${data.articleCount}건</strong></p>
        <p>뉴스레터 ID: <code>${data.newsletterId}</code></p>
      `;

      // Auto-refresh newsletter tab
      window.nlView?.load();
    } catch (e) {
      statusBox.classList.add('hidden');
      resultBox.classList.remove('hidden');
      resultBox.innerHTML = `<p class="result-error">오류: ${e.message}</p>`;
    }

    crawling = false;
    btnCrawl.disabled = false;
    btnCrawl.textContent = '수집 시작';
  });
})();
