/**
 * auth.js — Deadlinify
 *
 * Menangani semua operasi autentikasi di sisi frontend:
 *   1. Injeksi latar belakang di login.html dan register.html
 *   2. Form login — validasi klien + fetch ke backend
 *   3. Form register — validasi klien + indikator kekuatan password + fetch
 *   4. Pemeriksaan session aktif (check.php)
 *   5. Redirect setelah login/register berhasil
 *   6. Integrasi logout (dipanggil juga dari layout.js)
 *
 * BATASAN KEAMANAN:
 *   Redirect JavaScript hanya pengalaman pengguna — bukan perlindungan keamanan.
 *   Semua data sensitif divalidasi dan dilindungi oleh PHP di server.
 *   File ini tidak pernah menyimpan password ke localStorage/sessionStorage.
 *
 * CSRF Token:
 *   Token diambil dari respons check.php saat halaman dimuat.
 *   Disimpan di variabel memori (window._csrfToken) — tidak di localStorage.
 *   Dikirim via header X-CSRF-Token pada setiap request mutasi.
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     KONSTANTA
  ══════════════════════════════════════════════════════════ */
  var API_BASE    = 'backend/auth/';
  var REDIRECT_AFTER_LOGIN = 'dashboard.html';    // Halaman tujuan setelah login
  var REDIRECT_LOGIN       = 'login.html';    // Halaman login untuk redirect

  /* ══════════════════════════════════════════════════════════
     INJEKSI LATAR BELAKANG (agar login/register memiliki nuansa yang sama)
  ══════════════════════════════════════════════════════════ */
  function _injectBackground() {
    if (document.querySelector('.scene-background')) return;

    var scene = document.createElement('div');
    scene.className = 'scene-background';
    scene.setAttribute('aria-hidden', 'true');
    scene.innerHTML =
      '<div class="cloud-layer"></div>' +
      '<svg class="hill-layer hill-far"  viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="M0 200 Q360 80 720 200 Q1080 320 1440 200 L1440 320 L0 320 Z" fill="#86efac"/></svg>' +
      '<svg class="hill-layer hill-mid"  viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="M0 240 Q300 120 600 200 Q900 280 1200 180 Q1320 140 1440 220 L1440 320 L0 320 Z" fill="#4ade80"/></svg>' +
      '<svg class="hill-layer hill-near" viewBox="0 0 1440 320" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none"><path d="M0 280 Q200 200 400 250 Q700 320 900 240 Q1100 160 1300 260 Q1380 290 1440 280 L1440 320 L0 320 Z" fill="#22c55e"/></svg>';

    document.body.insertBefore(scene, document.body.firstChild);
  }

  /* ══════════════════════════════════════════════════════════
     UTILITAS DOM
  ══════════════════════════════════════════════════════════ */
  function _show(id) {
    var el = document.getElementById(id);
    if (el) el.classList.remove('hidden');
  }

  function _hide(id) {
    var el = document.getElementById(id);
    if (el) el.classList.add('hidden');
  }

  function _setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  function _showFieldError(inputId, errorId, message) {
    var input = document.getElementById(inputId);
    var error = document.getElementById(errorId);
    if (input) {
      input.classList.add('border-rose-400/70');
      input.setAttribute('aria-invalid', 'true');
    }
    if (error) {
      error.textContent = message;
      error.classList.remove('hidden');
    }
  }

  function _clearFieldError(inputId, errorId) {
    var input = document.getElementById(inputId);
    var error = document.getElementById(errorId);
    if (input) {
      input.classList.remove('border-rose-400/70');
      input.removeAttribute('aria-invalid');
    }
    if (error) {
      error.textContent = '';
      error.classList.add('hidden');
    }
  }

  function _setLoading(btnId, spinnerId, textId, loadingText, isLoading) {
    var btn = document.getElementById(btnId);
    var spinner = document.getElementById(spinnerId);
    var text = document.getElementById(textId);
    if (btn) btn.disabled = isLoading;
    if (spinner) spinner.classList.toggle('hidden', !isLoading);
    if (text && loadingText) text.textContent = isLoading ? loadingText : text.dataset.original || text.textContent;
  }

  /* ══════════════════════════════════════════════════════════
     SHOW/HIDE PASSWORD
  ══════════════════════════════════════════════════════════ */
  function _initTogglePassword(btnId, inputId, iconEyeId, iconEyeOffId) {
    var btn = document.getElementById(btnId);
    var input = document.getElementById(inputId);
    var iconEye = document.getElementById(iconEyeId);
    var iconEyeOff = document.getElementById(iconEyeOffId);
    if (!btn || !input) return;

    btn.addEventListener('click', function () {
      var isHidden = input.type === 'password';
      input.type = isHidden ? 'text' : 'password';
      btn.setAttribute('aria-pressed', isHidden ? 'true' : 'false');
      btn.setAttribute('aria-label', isHidden ? 'Sembunyikan password' : 'Tampilkan password');
      if (iconEye)    iconEye.classList.toggle('hidden', isHidden);
      if (iconEyeOff) iconEyeOff.classList.toggle('hidden', !isHidden);
    });
  }

  /* ══════════════════════════════════════════════════════════
     INDIKATOR KEKUATAN PASSWORD
  ══════════════════════════════════════════════════════════ */
  var STRENGTH_COLORS = ['bg-rose-400', 'bg-amber-400', 'bg-amber-400', 'bg-emerald-500'];
  var STRENGTH_LABELS = ['Sangat Lemah', 'Lemah', 'Cukup', 'Kuat'];

  function _calcPasswordStrength(password) {
    var score = 0;
    if (password.length >= 8)  score++;
    if (password.length >= 12) score++;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return Math.min(4, Math.floor(score * 0.8));
  }

  function _updateStrengthBar(password) {
    var wrap = document.getElementById('password-strength-wrap');
    if (!wrap) return;

    if (!password) {
      wrap.classList.add('hidden');
      return;
    }
    wrap.classList.remove('hidden');

    var strength = _calcPasswordStrength(password);
    var allColors = ['bg-rose-400', 'bg-amber-400', 'bg-emerald-500', 'bg-slate-200/70'];

    for (var i = 1; i <= 4; i++) {
      var bar = document.getElementById('pstr-' + i);
      if (!bar) continue;
      /* Hapus semua warna dulu */
      allColors.forEach(function (c) { bar.classList.remove(c); });
      if (i <= strength) {
        bar.classList.add(STRENGTH_COLORS[strength - 1] || 'bg-slate-200/70');
      } else {
        bar.classList.add('bg-slate-200/70');
      }
    }
    _setText('pstr-label', strength > 0 ? STRENGTH_LABELS[strength - 1] : '');
  }

  /* ══════════════════════════════════════════════════════════
     SESSION CHECK — dipanggil dari semua halaman bertanda [protected]
     Mengembalikan Promise<object> dengan { authenticated, user?, csrf_token }
  ══════════════════════════════════════════════════════════ */
  function checkSession() {
    return fetch(API_BASE + 'check.php', {
      method: 'GET',
      credentials: 'same-origin',   /* kirim cookie session */
      headers: { 'Accept': 'application/json' }
    })
    .then(function (res) {
      if (!res.ok) throw new Error('Server tidak merespons: ' + res.status);
      return res.json();
    })
    .catch(function (err) {
      /* Jika backend belum aktif (fase dev), kembalikan status tidak login */
      console.warn('[Auth] check.php tidak dapat dijangkau:', err.message);
      return { authenticated: null, unavailable: true, csrf_token: '' };
    });
  }

  /* Pastikan token CSRF tersedia sebelum request login/register/logout. */
  function ensureCsrfToken() {
    if (window._csrfToken) return Promise.resolve(window._csrfToken);

    return checkSession().then(function (data) {
      window._csrfToken = data.csrf_token || '';
      if (!window._csrfToken) {
        throw new Error('Token keamanan belum tersedia. Muat ulang halaman.');
      }
      return window._csrfToken;
    });
  }

  /* ══════════════════════════════════════════════════════════
     LOGOUT — dipanggil dari tombol logout di navbar (layout.js)
  ══════════════════════════════════════════════════════════ */
  function logout() {
    var csrfToken = window._csrfToken || '';

    return fetch(API_BASE + 'logout.php', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-CSRF-Token': csrfToken
      }
    })
    .then(function (res) {
      return res.json().then(function (data) {
        if (!res.ok || !data.success) {
          throw new Error(data.message || 'Logout gagal.');
        }
        return data;
      });
    })
    .then(function () {
      /* Hapus data auth dari memori hanya setelah server mengonfirmasi logout. */
      window._csrfToken = null;
      window._authUser = null;
      window.location.href = REDIRECT_LOGIN;
    })
    .catch(function (err) {
      console.warn('[Auth] Logout gagal:', err.message);
      window.alert('Belum berhasil logout. Periksa koneksi server, lalu coba lagi.');
    });
  }

  /* ══════════════════════════════════════════════════════════
     HALAMAN LOGIN
  ══════════════════════════════════════════════════════════ */
  function _initLoginPage() {
    var form = document.getElementById('login-form');
    if (!form) return;

    /* Simpan teks asli tombol */
    var btnText = document.getElementById('login-btn-text');
    if (btnText) btnText.dataset.original = btnText.textContent;

    /* Toggle password */
    _initTogglePassword('btn-toggle-password', 'login-password', 'icon-eye', 'icon-eye-off');

    /* Bersihkan error saat user mengetik */
    document.getElementById('login-email') && document.getElementById('login-email')
      .addEventListener('input', function () { _clearFieldError('login-email', 'login-email-error'); });
    document.getElementById('login-password') && document.getElementById('login-password')
      .addEventListener('input', function () { _clearFieldError('login-password', 'login-password-error'); });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      _submitLogin();
    });
  }

  function _submitLogin() {
    var emailEl = document.getElementById('login-email');
    var passEl  = document.getElementById('login-password');
    var email   = emailEl ? emailEl.value.trim() : '';
    var password = passEl ? passEl.value : '';

    /* Validasi klien */
    var hasError = false;
    if (!email) {
      _showFieldError('login-email', 'login-email-error', 'Email wajib diisi.');
      hasError = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      _showFieldError('login-email', 'login-email-error', 'Format email tidak valid.');
      hasError = true;
    }
    if (!password) {
      _showFieldError('login-password', 'login-password-error', 'Password wajib diisi.');
      hasError = true;
    }
    if (hasError) return;

    /* Sembunyikan error global, tampilkan loading */
    _hide('login-error');
    _setLoading('btn-login-submit', 'login-spinner', 'login-btn-text', 'Masuk…', true);

    ensureCsrfToken()
    .then(function (csrfToken) {
      return fetch(API_BASE + 'login.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ email: email, password: password })
      });
    })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (res) {
      _setLoading('btn-login-submit', 'login-spinner', 'login-btn-text', '', false);

      if (res.data.success) {
        /* Simpan CSRF token dan info user di memori */
        window._csrfToken = res.data.csrf_token || '';
        window._authUser  = res.data.user || null;

        /* Redirect ke halaman utama */
        window.location.href = REDIRECT_AFTER_LOGIN;
      } else {
        _setText('login-error-text', res.data.message || 'Login gagal. Silakan coba lagi.');
        _show('login-error');
        /* Fokuskan ke error untuk aksesibilitas */
        var errEl = document.getElementById('login-error');
        if (errEl) errEl.focus();
      }
    })
    .catch(function (err) {
      _setLoading('btn-login-submit', 'login-spinner', 'login-btn-text', '', false);
      _setText('login-error-text', 'Tidak dapat terhubung ke server. Periksa koneksi Anda.');
      _show('login-error');
      console.warn('[Auth] Login fetch error:', err.message);
    });
  }

  /* ══════════════════════════════════════════════════════════
     HALAMAN REGISTER
  ══════════════════════════════════════════════════════════ */
  function _initRegisterPage() {
    var form = document.getElementById('register-form');
    if (!form) return;

    var btnText = document.getElementById('register-btn-text');
    if (btnText) btnText.dataset.original = btnText.textContent;

    /* Toggle password */
    _initTogglePassword('btn-toggle-reg-password', 'reg-password', 'icon-reg-eye', 'icon-reg-eye-off');

    /* Indikator kekuatan password */
    var passInput = document.getElementById('reg-password');
    if (passInput) {
      passInput.addEventListener('input', function () {
        _updateStrengthBar(passInput.value);
        _clearFieldError('reg-password', 'reg-password-error');
      });
    }

    /* Bersihkan error saat mengetik */
    ['reg-name', 'reg-email', 'reg-npm', 'reg-password-confirm'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('input', function () {
        _clearFieldError(id, id + '-error');
      });
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      _submitRegister();
    });
  }

  function _submitRegister() {
    var name     = (document.getElementById('reg-name')             || {}).value || '';
    var email    = (document.getElementById('reg-email')            || {}).value || '';
    var npm      = (document.getElementById('reg-npm')              || {}).value || '';
    var password = (document.getElementById('reg-password')         || {}).value || '';
    var confirm  = (document.getElementById('reg-password-confirm') || {}).value || '';

    name = name.trim(); email = email.trim(); npm = npm.trim();

    /* Validasi klien */
    var hasError = false;

    if (name.length < 2) {
      _showFieldError('reg-name', 'reg-name-error', 'Nama minimal 2 karakter.');
      hasError = true;
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      _showFieldError('reg-email', 'reg-email-error', 'Format email tidak valid.');
      hasError = true;
    }
    if (password.length < 8) {
      _showFieldError('reg-password', 'reg-password-error', 'Password minimal 8 karakter.');
      hasError = true;
    }
    if (password !== confirm) {
      _showFieldError('reg-password-confirm', 'reg-password-confirm-error', 'Konfirmasi password tidak cocok.');
      hasError = true;
    }
    if (hasError) return;

    _hide('register-error');
    _hide('register-success');
    _setLoading('btn-register-submit', 'register-spinner', 'register-btn-text', 'Membuat Akun…', true);

    ensureCsrfToken()
    .then(function (csrfToken) {
      return fetch(API_BASE + 'register.php', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-CSRF-Token': csrfToken
        },
        body: JSON.stringify({ name: name, email: email, password: password, npm: npm || null })
      });
    })
    .then(function (res) { return res.json().then(function (data) { return { status: res.status, data: data }; }); })
    .then(function (res) {
      _setLoading('btn-register-submit', 'register-spinner', 'register-btn-text', '', false);

      if (res.data.success) {
        /* Tampilkan pesan sukses, redirect ke login setelah 2 detik */
        _setText('register-success-text', 'Akun berhasil dibuat! Mengarahkan ke halaman login…');
        _show('register-success');
        setTimeout(function () {
          window.location.href = REDIRECT_LOGIN;
        }, 2000);
      } else {
        /* Tampilkan error per-field jika ada */
        var errors = res.data.errors || {};
        var fieldMap = {
          name:     ['reg-name',             'reg-name-error'],
          email:    ['reg-email',            'reg-email-error'],
          password: ['reg-password',         'reg-password-error'],
          npm:      ['reg-npm',              'reg-npm-error'],
        };
        var hadFieldError = false;
        Object.keys(fieldMap).forEach(function (field) {
          if (errors[field]) {
            _showFieldError(fieldMap[field][0], fieldMap[field][1], errors[field]);
            hadFieldError = true;
          }
        });
        if (!hadFieldError) {
          _setText('register-error-text', res.data.message || 'Pendaftaran gagal. Silakan coba lagi.');
          _show('register-error');
        }
      }
    })
    .catch(function (err) {
      _setLoading('btn-register-submit', 'register-spinner', 'register-btn-text', '', false);
      _setText('register-error-text', 'Tidak dapat terhubung ke server. Periksa koneksi Anda.');
      _show('register-error');
      console.warn('[Auth] Register fetch error:', err.message);
    });
  }

  /* ══════════════════════════════════════════════════════════
     INISIALISASI UTAMA
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('DOMContentLoaded', function () {
    var page = document.body.dataset.page;

    /* Injeksi latar belakang di halaman auth */
    if (page === 'login' || page === 'register') {
      _injectBackground();
      checkSession().then(function (data) {
        window._csrfToken = data.csrf_token || '';
        if (data.authenticated) {
          window._authUser = data.user || null;
          window.location.replace(REDIRECT_AFTER_LOGIN);
        }
      });
    }

    if (page === 'login') {
      _initLoginPage();
    } else if (page === 'register') {
      _initRegisterPage();
    }
  });

  /* ══════════════════════════════════════════════════════════
     EKSPOR PUBLIK
     Layout.js dan halaman lain dapat memanggil window.Auth.
  ══════════════════════════════════════════════════════════ */
  window.Auth = {
    checkSession: checkSession,
    logout:       logout
  };

})();
