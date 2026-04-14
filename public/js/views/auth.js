'use strict';

(function () {
  const overlay   = document.getElementById('login-overlay');
  const btnSignIn = document.getElementById('btn-google-signin');
  const errorEl   = document.getElementById('login-error');

  // 세션 영구 유지 (브라우저 재시작 후에도 로그인 상태 유지)
  window.auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

  const provider = new firebase.auth.GoogleAuthProvider();

  btnSignIn.addEventListener('click', async () => {
    btnSignIn.disabled = true;
    btnSignIn.textContent = '로그인 중...';
    errorEl.classList.add('hidden');
    try {
      await window.auth.signInWithPopup(provider);
      // onAuthStateChanged in app.js will handle the rest
    } catch (e) {
      showError(e.code === 'auth/popup-closed-by-user'
        ? '로그인이 취소되었습니다.'
        : `로그인 오류: ${e.message}`);
      btnSignIn.disabled = false;
      btnSignIn.textContent = 'Google로 로그인';
    }
  });

  function showError(msg) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }

  function showOverlay() {
    overlay.classList.remove('hidden');
    document.getElementById('header-status').textContent = '';
  }

  function hideOverlay() {
    overlay.classList.add('hidden');
  }

  window.authView = { showOverlay, hideOverlay };
})();
