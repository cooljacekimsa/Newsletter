'use strict';

(function () {
  const kwInclude    = document.getElementById('kw-include');
  const kwExclude    = document.getElementById('kw-exclude');
  const publishersEl = document.getElementById('publishers');
  const seedUrlsEl   = document.getElementById('seed-urls');
  const noiseEl      = document.getElementById('noise-phrases');
  const hoursBackEl  = document.getElementById('hours-back');
  const thresholdEl  = document.getElementById('similarity-threshold');
  const btnSave      = document.getElementById('btn-save-settings');
  const msgEl        = document.getElementById('settings-msg');

  // Keyword groups
  const kwGroupSelect  = document.getElementById('kw-group-select');
  const btnLoadGroup   = document.getElementById('btn-load-group');
  const btnSaveGroup   = document.getElementById('btn-save-group');
  const btnDeleteGroup = document.getElementById('btn-delete-group');

  // Recommended seed URLs button
  const btnAddUrls = document.getElementById('btn-add-recommended-urls');

  // PAT
  const patInput   = document.getElementById('gh-pat-input');
  const btnSavePat = document.getElementById('btn-save-pat');
  const patStatus  = document.getElementById('pat-status');

  const GH_PAT_KEY = 'gh_pat_africa';

  const DEFAULT_NOISE = [
    '제보는 카카오톡',
    '저작권자',
    '무단 전재',
    '재판매 및 DB 금지',
    'AI 학습 및 활용 금지',
    '송고',
  ];

  const RECOMMENDED_SEED_URLS = [
    'https://www.yna.co.kr/ubuntu/index',
    'https://www.yna.co.kr/international/index',
    'https://www.hani.co.kr/arti/international/',
    'https://www.khan.co.kr/world/',
  ];

  let loaded = false;
  let kwGroups = [];

  async function load() {
    if (loaded) return;
    loaded = true;
    try {
      const [settingsDoc, groupsDoc] = await Promise.all([
        window.db.collection('settings').doc('global').get(),
        window.db.collection('settings').doc('keyword-groups').get(),
      ]);
      if (settingsDoc.exists) applySettings(settingsDoc.data());
      else applyDefaults();

      kwGroups = (groupsDoc.exists ? groupsDoc.data().groups : []) || [];
      renderGroups();
    } catch (e) {
      showMsg('설정을 불러오지 못했습니다: ' + e.message, 'error');
    }
    loadPat();
  }

  function applyDefaults() {
    publishersEl.value = [
      '연합뉴스', 'KBS', 'MBC', 'SBS', '중앙일보',
      '한겨레', '한국일보', '조선일보', '동아일보', '경향신문',
    ].join('\n');
    seedUrlsEl.value  = RECOMMENDED_SEED_URLS.join('\n');
    noiseEl.value     = DEFAULT_NOISE.join('\n');
    hoursBackEl.value = '24';
    thresholdEl.value = '0.75';
  }

  function applySettings(s) {
    const kw = s.keywords || {};
    kwInclude.value = (kw.include || []).join(', ');
    kwExclude.value = (kw.exclude || []).join(', ');
    const modeEl = document.querySelector(`input[name="kw-mode"][value="${kw.mode || 'AND'}"]`);
    if (modeEl) modeEl.checked = true;

    publishersEl.value = (s.publishers  || []).join('\n');
    seedUrlsEl.value   = (s.seedUrls    || []).join('\n');
    noiseEl.value      = (s.noisePhrases && s.noisePhrases.length)
      ? s.noisePhrases.join('\n')
      : DEFAULT_NOISE.join('\n');
    hoursBackEl.value  = s.hoursBack ?? 24;
    thresholdEl.value  = s.similarityThreshold ?? 0.75;
  }

  function readSettings() {
    const mode = document.querySelector('input[name="kw-mode"]:checked')?.value || 'AND';
    return {
      keywords: {
        include: kwInclude.value.split(',').map(s => s.trim()).filter(Boolean),
        exclude: kwExclude.value.split(',').map(s => s.trim()).filter(Boolean),
        mode,
      },
      publishers:   publishersEl.value.split('\n').map(s => s.trim()).filter(Boolean),
      seedUrls:     seedUrlsEl.value.split('\n').map(s => s.trim()).filter(Boolean),
      noisePhrases: noiseEl.value.split('\n').map(s => s.trim()).filter(Boolean),
      hoursBack:    parseInt(hoursBackEl.value) || 24,
      similarityThreshold: parseFloat(thresholdEl.value) || 0.75,
    };
  }

  // ── Keyword Groups ──────────────────────────────────────

  function renderGroups() {
    kwGroupSelect.innerHTML = '<option value="">그룹 선택...</option>';
    kwGroups.forEach(g => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.name;
      kwGroupSelect.appendChild(opt);
    });
  }

  function loadGroup() {
    const id = kwGroupSelect.value;
    if (!id) { showMsg('불러올 그룹을 선택하세요.', 'error'); return; }
    const g = kwGroups.find(g => g.id === id);
    if (!g) return;
    kwInclude.value = (g.include || []).join(', ');
    kwExclude.value = (g.exclude || []).join(', ');
    const modeEl = document.querySelector(`input[name="kw-mode"][value="${g.mode || 'AND'}"]`);
    if (modeEl) modeEl.checked = true;
    showMsg(`"${g.name}" 그룹을 불러왔습니다.`, 'success');
  }

  async function saveGroup() {
    const name = prompt('그룹 이름을 입력하세요:');
    if (!name || !name.trim()) return;
    const mode = document.querySelector('input[name="kw-mode"]:checked')?.value || 'AND';
    const newGroup = {
      id: Date.now().toString(),
      name: name.trim(),
      include: kwInclude.value.split(',').map(s => s.trim()).filter(Boolean),
      exclude: kwExclude.value.split(',').map(s => s.trim()).filter(Boolean),
      mode,
    };
    kwGroups.push(newGroup);
    try {
      await window.db.collection('settings').doc('keyword-groups').set({ groups: kwGroups });
      renderGroups();
      kwGroupSelect.value = newGroup.id;
      showMsg(`"${newGroup.name}" 그룹으로 저장되었습니다.`, 'success');
    } catch (e) {
      kwGroups.pop();
      showMsg('그룹 저장 실패: ' + e.message, 'error');
    }
  }

  async function deleteGroup() {
    const id = kwGroupSelect.value;
    if (!id) { showMsg('삭제할 그룹을 선택하세요.', 'error'); return; }
    const g = kwGroups.find(g => g.id === id);
    if (!g) return;
    if (!confirm(`"${g.name}" 그룹을 삭제하시겠습니까?`)) return;
    const prev = kwGroups.slice();
    kwGroups = kwGroups.filter(g => g.id !== id);
    try {
      await window.db.collection('settings').doc('keyword-groups').set({ groups: kwGroups });
      renderGroups();
      showMsg('그룹이 삭제되었습니다.', 'success');
    } catch (e) {
      kwGroups = prev;
      showMsg('그룹 삭제 실패: ' + e.message, 'error');
    }
  }

  btnLoadGroup.addEventListener('click', loadGroup);
  btnSaveGroup.addEventListener('click', saveGroup);
  btnDeleteGroup.addEventListener('click', deleteGroup);

  // ── Recommended Seed URLs ───────────────────────────────

  btnAddUrls.addEventListener('click', () => {
    const current = seedUrlsEl.value.split('\n').map(s => s.trim()).filter(Boolean);
    const toAdd = RECOMMENDED_SEED_URLS.filter(u => !current.includes(u));
    if (!toAdd.length) {
      showMsg('추천 URL이 이미 모두 포함되어 있습니다.', 'success');
      return;
    }
    seedUrlsEl.value = [...current, ...toAdd].join('\n');
    showMsg(`추천 URL ${toAdd.length}개 추가됨. "저장" 버튼을 눌러 적용하세요.`, 'success');
  });

  // ── Save Settings ───────────────────────────────────────

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

  // ── PAT Management ──────────────────────────────────────

  function loadPat() {
    const pat = localStorage.getItem(GH_PAT_KEY) || '';
    if (pat) {
      patInput.value = pat;
      patStatus.textContent = '✓ PAT 저장됨 (이 기기 전용)';
      patStatus.style.color = 'var(--success)';
    }
  }

  btnSavePat.addEventListener('click', () => {
    const val = patInput.value.trim();
    if (!val) {
      localStorage.removeItem(GH_PAT_KEY);
      patStatus.textContent = 'PAT가 삭제되었습니다.';
      patStatus.style.color = '#9aa0a6';
      return;
    }
    localStorage.setItem(GH_PAT_KEY, val);
    patStatus.textContent = '✓ PAT 저장됨 (이 기기 전용)';
    patStatus.style.color = 'var(--success)';
  });

  // ── Helpers ─────────────────────────────────────────────

  function showMsg(text, type) {
    msgEl.textContent = text;
    msgEl.className = 'msg ' + type;
    msgEl.classList.remove('hidden');
    setTimeout(() => msgEl.classList.add('hidden'), 4000);
  }

  window.settingsView = { load };
})();
