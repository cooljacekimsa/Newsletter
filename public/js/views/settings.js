'use strict';

(function () {
  const kwInclude    = document.getElementById('kw-include');
  const kwExclude    = document.getElementById('kw-exclude');
  const publishersEl = document.getElementById('publishers');
  const seedUrlsEl   = document.getElementById('seed-urls');
  const hoursBackEl  = document.getElementById('hours-back');
  const thresholdEl  = document.getElementById('similarity-threshold');
  const scheduleEl   = document.getElementById('schedule-enabled');
  const btnSave      = document.getElementById('btn-save-settings');
  const msgEl        = document.getElementById('settings-msg');

  let loaded = false;

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const doc = await window.db.collection('settings').doc('global').get();
      if (doc.exists) applySettings(doc.data());
      else applyDefaults();
    } catch (e) {
      showMsg('설정을 불러오지 못했습니다: ' + e.message, 'error');
    }
  }

  function applyDefaults() {
    publishersEl.value = [
      '연합뉴스', 'KBS', 'MBC', 'SBS', '중앙일보',
      '한겨레', '한국일보', '조선일보', '동아일보', '경향신문',
    ].join('\n');
    seedUrlsEl.value  = 'https://www.yna.co.kr/ubuntu/index';
    hoursBackEl.value = '24';
    thresholdEl.value = '0.75';
    scheduleEl.checked = true;
  }

  function applySettings(s) {
    const kw = s.keywords || {};
    kwInclude.value = (kw.include || []).join(', ');
    kwExclude.value = (kw.exclude || []).join(', ');
    const modeEl = document.querySelector(`input[name="kw-mode"][value="${kw.mode || 'AND'}"]`);
    if (modeEl) modeEl.checked = true;

    publishersEl.value = (s.publishers || []).join('\n');
    seedUrlsEl.value   = (s.seedUrls   || []).join('\n');
    hoursBackEl.value  = s.hoursBack ?? 24;
    thresholdEl.value  = s.similarityThreshold ?? 0.75;
    scheduleEl.checked = s.scheduleEnabled !== false;
  }

  function readSettings() {
    const mode = document.querySelector('input[name="kw-mode"]:checked')?.value || 'AND';
    return {
      keywords: {
        include: kwInclude.value.split(',').map(s => s.trim()).filter(Boolean),
        exclude: kwExclude.value.split(',').map(s => s.trim()).filter(Boolean),
        mode,
      },
      publishers: publishersEl.value.split('\n').map(s => s.trim()).filter(Boolean),
      seedUrls:   seedUrlsEl.value.split('\n').map(s => s.trim()).filter(Boolean),
      hoursBack:  parseInt(hoursBackEl.value)    || 24,
      similarityThreshold: parseFloat(thresholdEl.value) || 0.75,
      scheduleEnabled: scheduleEl.checked,
    };
  }

  btnSave.addEventListener('click', async () => {
    btnSave.disabled = true;
    btnSave.textContent = '저장 중...';
    try {
      await window.db.collection('settings').doc('global').set(readSettings(), { merge: true });
      showMsg('설정이 저장되었습니다.', 'success');
    } catch (e) {
      showMsg('저장 실패: ' + e.message, 'error');
    }
    btnSave.disabled = false;
    btnSave.textContent = '저장';
  });

  function showMsg(text, type) {
    msgEl.textContent = text;
    msgEl.className = 'msg ' + type;
    msgEl.classList.remove('hidden');
    setTimeout(() => msgEl.classList.add('hidden'), 4000);
  }

  window.settingsView = { load };
})();
