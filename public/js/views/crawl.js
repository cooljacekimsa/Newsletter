'use strict';

(function () {
  const statsEl    = document.getElementById('crawl-stats');
  const btnRefresh = document.getElementById('btn-refresh-crawl');

  async function load() {
    statsEl.innerHTML = '<p class="placeholder">불러오는 중...</p>';
    try {
      // Latest newsletter
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

      const latest  = nlSnap.docs[0].data();
      const lastDate = latest.createdAt?.toDate?.();
      const dateStr  = lastDate ? lastDate.toLocaleString('ko-KR') : '알 수 없음';

      // Total newsletter count
      const allSnap = await window.db.collection('newsletters').get();

      statsEl.innerHTML = `
        <p><strong>마지막 수집:</strong> ${dateStr}</p>
        <p><strong>최근 뉴스레터 기사:</strong> ${latest.articleCount ?? '-'}건
           (수집 원본 ${latest.totalCrawled ?? '-'}건)</p>
        <p><strong>총 뉴스레터 수:</strong> ${allSnap.size}건</p>
        <p style="font-size:12px;color:#9aa0a6;margin-top:8px;">
          수집 출처: ${latest.source === 'github-actions' ? 'GitHub Actions (자동/수동)' : latest.source ?? '-'}
        </p>
      `;
    } catch (e) {
      statsEl.innerHTML = `<p class="result-error">오류: ${e.message}</p>`;
    }
  }

  btnRefresh?.addEventListener('click', load);

  window.crawlView = { load };
})();
