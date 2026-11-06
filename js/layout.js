/**
 * layout.js — Deadlinify
 * Menyuntikkan komponen bersama ke semua halaman:
 *   - Latar belakang pemandangan (langit + awan + bukit SVG)
 *   - Navbar pill melayang (logo, menu, chip notifikasi, user menu + popover)
 *   - Dock bawah melayang (4 tombol navigasi antar-halaman)
 *   - Wadah toast
 *   - Kartu izin notifikasi
 *   - Mini-widget Pomodoro (tampil di semua halaman kecuali fokus.html)
 * Menentukan menu aktif berdasarkan data-page attribute pada <body>.
 * Menginisialisasi Notif di semua halaman.
 * Mendengarkan storage event untuk sinkronisasi lintas tab.
 *
 * Phase 2 — Autentikasi:
 *   Memanggil Auth.checkSession() saat init.
 *   Jika belum login → redirect ke login.html.
 *   Jika sudah login → tampilkan nama pengguna + tombol logout di navbar.
 *
 * BATASAN KEAMANAN:
 *   Redirect JavaScript di sini HANYA untuk UX.
 *   Semua endpoint data PHP memvalidasi session secara mandiri.
 *   Halaman HTML statis tidak dapat "dijaga" sepenuhnya oleh JavaScript.
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     KONFIGURASI NAVIGASI
  ══════════════════════════════════════════════════════════ */
  var NAV_ITEMS = [
    { page: 'dashboard', href: 'dashboard.html', label: 'Dashboard' },
    { page: 'tugas',     href: 'tugas.html',    label: 'Tugas'     },
    { page: 'fokus',     href: 'fokus.html',    label: 'Fokus'     },
    { page: 'analitik',  href: 'analitik.html', label: 'Analitik'  }
  ];

  var DOCK_ITEMS = [
    {
      page: 'dashboard', href: 'dashboard.html', label: 'Pergi ke Dashboard',
      svg: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'
    },
    {
      page: 'tugas', href: 'tugas.html', label: 'Pergi ke Daftar Tugas',
      svg: '<path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12l2 2 4-4"/>'
    },
    {
      page: 'fokus', href: 'fokus.html', label: 'Pergi ke Mode Fokus',
      svg: '<circle cx="12" cy="12" r="8"/><path stroke-linecap="round" d="M12 7v5l3 3"/>'
    },
    {
      page: 'analitik', href: 'analitik.html', label: 'Pergi ke Analitik',
      svg: '<path stroke-linecap="round" d="M3 20h18M7 20V10M12 20V4M17 20v-7"/>'
    }
  ];

  /* ══════════════════════════════════════════════════════════
     INJEKSI LATAR BELAKANG PEMANDANGAN
  ══════════════════════════════════════════════════════════ */
  function _injectBackground() {
    if (document.querySelector('.scene-background')) return; // sudah ada
    var bg = document.createElement('div');
    bg.className = 'scene-background';
    bg.setAttribute('role', 'presentation');
    bg.setAttribute('aria-hidden', 'true');
    /* IMAGE SLOT: meadow-background, ukuran ideal 1920×1080px */
    /* Path: assets/meadow-bg.jpg | Fallback: gradien CSS di style.css */
    bg.innerHTML =
      '<div class="cloud-layer"></div>' +
      /* IMAGE SLOT: hill-far, ukuran ideal 1920×400px | Path: assets/hill-far.svg */
      '<div class="hill-far">' +
        '<svg viewBox="0 0 1440 200" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">' +
          '<path d="M0,120 C200,60 400,160 600,100 C800,40 1000,140 1200,80 C1320,50 1380,90 1440,80 L1440,200 L0,200 Z" fill="rgba(134,239,172,0.6)"/>' +
        '</svg>' +
      '</div>' +
      /* IMAGE SLOT: hill-mid, ukuran ideal 1920×300px | Path: assets/hill-mid.svg */
      '<div class="hill-mid">' +
        '<svg viewBox="0 0 1440 160" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">' +
          '<path d="M0,100 C180,40 360,130 540,70 C720,10 900,100 1080,60 C1260,20 1380,80 1440,60 L1440,160 L0,160 Z" fill="rgba(74,222,128,0.65)"/>' +
        '</svg>' +
      '</div>' +
      /* IMAGE SLOT: hill-near, ukuran ideal 1920×200px | Path: assets/hill-near.svg */
      '<div class="hill-near">' +
        '<svg viewBox="0 0 1440 120" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" width="100%" height="100%" aria-hidden="true">' +
          '<path d="M0,70 C120,30 300,100 480,50 C660,0 820,80 1000,45 C1160,15 1320,65 1440,45 L1440,120 L0,120 Z" fill="rgba(34,197,94,0.75)"/>' +
        '</svg>' +
      '</div>';
    document.body.insertBefore(bg, document.body.firstChild);
  }

  /* ══════════════════════════════════════════════════════════
     INJEKSI NAVBAR
  ══════════════════════════════════════════════════════════ */
  function _injectNavbar(currentPage) {
    if (document.querySelector('header[role="banner"]')) return;

    var navLinksHTML = NAV_ITEMS.map(function (item) {
      var isCurrent = item.page === currentPage;
      return (
        '<a href="' + item.href + '"' +
        '   class="px-3 py-1.5 rounded-full text-sm font-medium text-slate-600' +
        '          hover:bg-white/60 transition-colors duration-200' +
        (isCurrent ? ' nav-active' : '') + '"' +
        (isCurrent ? ' aria-current="page"' : '') +
        '   role="listitem">' +
          item.label +
        '</a>'
      );
    }).join('');

    var header = document.createElement('header');
    header.setAttribute('role', 'banner');
    header.innerHTML =
      '<nav class="glass-pill fixed top-4 left-1/2 -translate-x-1/2 z-50' +
      '            flex items-center gap-1 px-4 py-2 w-[calc(100%-2rem)] max-w-2xl"' +
      '     aria-label="Navigasi utama">' +

      /* Logo */
      '  <a href="index.html" class="flex items-center gap-2 mr-3 shrink-0' +
      '                               text-slate-800 font-bold text-base no-underline' +
      '                               hover:opacity-80 transition-opacity"' +
      '     aria-label="Deadlinify — Beranda">' +
      '    <svg class="w-7 h-7 shrink-0" viewBox="0 0 32 32" fill="none"' +
      '         xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '      <rect x="4" y="6" width="24" height="18" rx="3" fill="rgba(99,102,241,0.2)" stroke="#6366f1" stroke-width="1.5"/>' +
      '      <line x1="16" y1="6" x2="16" y2="24" stroke="#6366f1" stroke-width="1.5"/>' +
      '      <path d="M11 10 L21 10 L17.5 15 L21 20 L11 20 L14.5 15 Z" fill="rgba(245,158,11,0.3)" stroke="#f59e0b" stroke-width="1.2"/>' +
      '    </svg>' +
      '    <span class="hidden sm:inline">Deadlinify</span>' +
      '  </a>' +

      /* Pemisah */
      '  <div class="hidden sm:block w-px h-5 bg-slate-300/60 mx-1" aria-hidden="true"></div>' +

      /* Tautan menu */
      '  <div class="flex items-center gap-0.5 flex-1" role="list">' +
           navLinksHTML +
      '  </div>' +

      /* Chip notifikasi */
      '  <div class="relative shrink-0 ml-1">' +
      '    <button id="notif-nav-chip" type="button"' +
      '            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border' +
      '                   bg-amber-50/70 border-amber-200/70 text-amber-800 text-xs font-semibold' +
      '                   hover:opacity-90 transition-opacity cursor-pointer"' +
      '            aria-label="3 notifikasi belum dibaca — klik untuk mengaktifkan"' +
      '            aria-haspopup="dialog">' +
      '      <span class="relative flex h-2.5 w-2.5" aria-hidden="true">' +
      '        <span class="notif-pulse notif-dot-pulse absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75"></span>' +
      '        <span class="notif-dot relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500"></span>' +
      '      </span>' +
      '      <span class="notif-chip-text hidden sm:inline">3 Notif</span>' +
      '    </button>' +
      /* Popover pengaturan notifikasi */
      '    <div id="notif-settings-popover"' +
      '         class="notif-settings-popover glass-card notif-card-hidden"' +
      '         role="dialog" aria-modal="true" aria-labelledby="notif-settings-heading" hidden>' +
      '      <div class="flex items-center justify-between mb-3">' +
      '        <h4 id="notif-settings-heading"' +
      '            class="text-sm font-semibold text-slate-700 flex items-center gap-1.5">' +
      '          <svg class="w-4 h-4 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '            <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>' +
      '          </svg>' +
      '          Notifikasi' +
      '        </h4>' +
      '        <button id="btn-notif-settings-close" type="button" class="card-action-btn"' +
      '                aria-label="Tutup pengaturan notifikasi">' +
      '          <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">' +
      '            <path stroke-linecap="round" d="M6 18L18 6M6 6l12 12"/>' +
      '          </svg>' +
      '        </button>' +
      '      </div>' +
      '      <div class="flex items-center gap-2 mb-3 text-sm">' +
      '        <span class="text-slate-500">Status:</span>' +
      '        <span id="notif-settings-status" aria-live="polite">…</span>' +
      '      </div>' +
      '      <p id="notif-settings-guide"' +
      '         class="text-xs text-slate-500 bg-slate-50/60 rounded-xl p-2.5 mb-3 leading-relaxed"' +
      '         hidden></p>' +
      '      <button id="btn-notif-settings-toggle" type="button"' +
      '              class="btn-submit w-full text-xs py-2 mb-2">Aktifkan Notifikasi</button>' +
      '      <button id="btn-notif-test" type="button"' +
      '              class="w-full glass-pill py-1.5 text-xs font-medium text-slate-600' +
      '                     hover:bg-white/80 transition-colors">🧪 Tes Notifikasi</button>' +
      '    </div>' +
      '  </div>' +

      /* User slot — diisi oleh _updateNavbarUser() setelah session check */
      '  <div id="nav-user-slot" class="shrink-0 ml-1"' +
      '       aria-live="polite" aria-label="Status pengguna">' +
      '    <!-- Akan diisi setelah Auth.checkSession() → _updateNavbarUser() -->' +
      '  </div>' +

      '</nav>';

    /* Sisipkan setelah skip-link jika ada, atau di awal body */
    var skipLink = document.querySelector('.skip-link');
    if (skipLink && skipLink.nextSibling) {
      document.body.insertBefore(header, skipLink.nextSibling);
    } else {
      document.body.insertBefore(header, document.body.firstChild);
    }
  }

  /* ══════════════════════════════════════════════════════════
     INJEKSI DOCK
  ══════════════════════════════════════════════════════════ */
  function _injectDock(currentPage) {
    if (document.querySelector('.dock-floating')) return;

    var buttonsHTML = DOCK_ITEMS.map(function (item) {
      var isCurrent = item.page === currentPage;
      return (
        '<a href="' + item.href + '"' +
        '   class="dock-btn' + (isCurrent ? ' dock-btn-active' : '') + '"' +
        '   aria-label="' + item.label + '"' +
        (isCurrent ? ' aria-current="page"' : '') + '>' +
        '  <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24"' +
        '       stroke="currentColor" stroke-width="2" aria-hidden="true">' +
             item.svg +
        '  </svg>' +
        '</a>'
      );
    }).join('');

    var dock = document.createElement('nav');
    dock.className = 'dock-floating glass-pill';
    dock.setAttribute('aria-label', 'Navigasi cepat dock');
    dock.innerHTML = buttonsHTML;
    document.body.appendChild(dock);
  }

  /* ══════════════════════════════════════════════════════════
     INJEKSI TOAST CONTAINER & KARTU IZIN NOTIFIKASI
  ══════════════════════════════════════════════════════════ */
  function _injectToastAndPermissionCard() {
    /* Toast container */
    if (!document.getElementById('toast-container')) {
      var toastEl = document.createElement('div');
      toastEl.id = 'toast-container';
      toastEl.setAttribute('role', 'status');
      toastEl.setAttribute('aria-live', 'polite');
      toastEl.setAttribute('aria-atomic', 'true');
      document.body.appendChild(toastEl);
    }

    /* Kartu izin notifikasi (muncul hanya satu kali, satu per sesi) */
    if (!document.getElementById('notif-permission-card')) {
      var cardEl = document.createElement('div');
      cardEl.id = 'notif-permission-card';
      cardEl.className = 'notif-permission-card glass-card notif-card-hidden';
      cardEl.setAttribute('role', 'dialog');
      cardEl.setAttribute('aria-modal', 'true');
      cardEl.setAttribute('aria-labelledby', 'notif-card-heading');
      cardEl.setAttribute('hidden', '');
      cardEl.innerHTML =
        '<div class="flex justify-center mb-3" aria-hidden="true">' +
        '  <div class="w-12 h-12 rounded-2xl bg-indigo-100/70 flex items-center justify-center">' +
        '    <svg class="w-6 h-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">' +
        '      <path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>' +
        '    </svg>' +
        '  </div>' +
        '</div>' +
        '<h4 id="notif-card-heading" class="text-center text-sm font-semibold text-slate-700 mb-1">Aktifkan Pengingat Deadline</h4>' +
        '<p class="text-center text-xs text-slate-500 mb-4 leading-relaxed">' +
        '  Deadlinify akan mengirim pengingat <strong>24 jam</strong> dan <strong>1 jam</strong> sebelum setiap deadline.' +
        '</p>' +
        '<div class="flex gap-2">' +
        '  <button id="btn-notif-enable" type="button"' +
        '          class="btn-submit flex-1 text-sm py-2"' +
        '          aria-describedby="notif-card-heading">Aktifkan</button>' +
        '  <button id="btn-notif-later" type="button"' +
        '          class="glass-pill flex-1 py-2 text-sm font-medium text-slate-600 hover:bg-white/80 transition-colors">Nanti</button>' +
        '</div>';
      /* Letak dialog langsung di root dokumen agar position:fixed selalu mengikuti viewport. */
      document.documentElement.appendChild(cardEl);
    }
  }

  /* ══════════════════════════════════════════════════════════
     TRANSISI HALAMAN (fade singkat)
  ══════════════════════════════════════════════════════════ */
  function _initPageTransition() {
    /* Fade-in dinonaktifkan untuk mengurangi kerja rendering saat pindah halaman. */
    var main = document.getElementById('main-content');
    if (main) main.classList.remove('page-fade-in');

    /* Biarkan browser mengikuti tautan secara native; tidak ada jeda setTimeout,
       blur filter, atau intersepsi klik yang membuat navigasi terasa tersendat. */
  }

  /* ══════════════════════════════════════════════════════════
     SINKRONISASI LINTAS TAB via storage event
  ══════════════════════════════════════════════════════════ */
  function _initStorageSync() {
    window.addEventListener('storage', function (e) {
      if (e.key !== 'deadlinify_tasks') return;
      /* Kirim custom event lokal agar page-script bisa merespons */
      document.dispatchEvent(new CustomEvent('tasks:sync', {
        detail: { source: 'storage-event' }
      }));
    });
  }

  /* ══════════════════════════════════════════════════════════
     INJEKSI MINI-WIDGET POMODORO
     Tampil di semua halaman KECUALI fokus.html.
     Menempel ke window.Pomodoro.onStateChange setelah Pomodoro
     diinisialisasi (dipanggil dari halaman masing-masing).
  ══════════════════════════════════════════════════════════ */
  function _injectPomoWidget(currentPage) {
    /* Widget tidak dirender di halaman fokus — sudah ada UI penuh di sana */
    if (currentPage === 'fokus') return;
    if (document.getElementById('pomo-mini-widget')) return;

    /*
      IMAGE SLOT: pomodoro-float-bg, ukuran ideal 220×280px
      Path: assets/pomodoro-float-bg.png | Fallback: glass-card
    */
    var widget = document.createElement('aside');
    widget.id        = 'pomo-mini-widget';
    widget.className = 'pomo-mini-widget glass-card';
    widget.setAttribute('role', 'complementary');
    widget.setAttribute('aria-label', 'Widget Pomodoro mini');
    widget.setAttribute('aria-hidden', 'true'); /* tersembunyi sampai ada sesi */

    widget.innerHTML =
      /* Header: label mode + tombol minimize */
      '<div class="pomo-mini-header">' +
      '  <span id="pomo-mini-mode" class="text-xs font-semibold flex items-center gap-1.5 text-rose-600">' +
      '    <svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">' +
      '      <circle cx="8" cy="9" r="5.5"/>' +
      '      <path d="M8 3.5 C8 3.5 9.5 2 11 2.5" stroke="currentColor" stroke-width="1" fill="none" stroke-linecap="round"/>' +
      '    </svg>' +
      '    Pomodoro' +
      '  </span>' +
      '  <button id="pomo-mini-minimize" type="button"' +
      '          class="card-action-btn w-6 h-6"' +
      '          aria-label="Ciutkan widget Pomodoro">' +
      '    <svg class="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">' +
      '      <path stroke-linecap="round" d="M19 9l-7 7-7-7"/>' +
      '    </svg>' +
      '  </button>' +
      '</div>' +

      /* Waktu + progress */
      '<p id="pomo-mini-time"' +
      '   class="text-2xl font-mono font-bold text-slate-700 text-center my-1"' +
      '   aria-label="Sisa waktu Pomodoro">--:--</p>' +
      '<div class="w-full h-1.5 rounded-full bg-slate-200/70 overflow-hidden mb-2"' +
      '     role="progressbar" aria-valuemin="0" aria-valuemax="100"' +
      '     id="pomo-mini-bar-wrap" aria-label="Progres sesi Pomodoro">' +
      '  <div id="pomo-mini-bar"' +
      '       class="h-full rounded-full transition-all duration-1000" style="width:0%"></div>' +
      '</div>' +

      /* Tombol Pause/Resume + link ke fokus */
      '<div class="flex gap-2">' +
      '  <button id="pomo-mini-toggle" type="button"' +
      '          class="glass-pill flex-1 py-1.5 text-xs font-semibold text-slate-700' +
      '                 hover:bg-white/80 transition-colors"' +
      '          aria-label="Jeda atau lanjutkan sesi Pomodoro">Jeda</button>' +
      '  <a href="fokus.html"' +
      '     class="glass-pill px-2.5 py-1.5 text-xs font-medium text-indigo-700' +
      '            hover:bg-white/80 transition-colors"' +
      '     aria-label="Buka halaman fokus penuh">' +
      '    ↗' +
      '  </a>' +
      '</div>';

    document.body.appendChild(widget);

    /* ── Draggable (pointer events, tetap di dalam viewport) ── */
    var isDragging = false;
    var dragOffsetX = 0, dragOffsetY = 0;

    widget.addEventListener('pointerdown', function (e) {
      /* Hanya drag dari header, bukan dari tombol/link */
      if (e.target.closest('button,a')) return;
      isDragging  = true;
      dragOffsetX = e.clientX - widget.getBoundingClientRect().left;
      dragOffsetY = e.clientY - widget.getBoundingClientRect().top;
      widget.style.userSelect = 'none';
      widget.setPointerCapture(e.pointerId);
    });

    widget.addEventListener('pointermove', function (e) {
      if (!isDragging) return;
      var x = e.clientX - dragOffsetX;
      var y = e.clientY - dragOffsetY;
      /* Batasi dalam viewport */
      var maxX = window.innerWidth  - widget.offsetWidth;
      var maxY = window.innerHeight - widget.offsetHeight;
      x = Math.max(0, Math.min(x, maxX));
      y = Math.max(0, Math.min(y, maxY));
      widget.style.right  = 'auto';
      widget.style.bottom = 'auto';
      widget.style.left   = x + 'px';
      widget.style.top    = y + 'px';
    });

    widget.addEventListener('pointerup', function () {
      isDragging = false;
      widget.style.userSelect = '';
    });

    /* ── Minimize/expand ── */
    var isMinimized = false;
    var elMinBtn = document.getElementById('pomo-mini-minimize');
    if (elMinBtn) {
      elMinBtn.addEventListener('click', function () {
        isMinimized = !isMinimized;
        widget.classList.toggle('pomo-mini-collapsed', isMinimized);
        elMinBtn.setAttribute('aria-label',
          isMinimized ? 'Perluas widget Pomodoro' : 'Ciutkan widget Pomodoro');
        /* Putar ikon panah */
        var svg = elMinBtn.querySelector('svg path');
        if (svg) {
          svg.setAttribute('d', isMinimized ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7');
        }
      });
    }

    /* ── Tombol pause/resume ── */
    var elToggle = document.getElementById('pomo-mini-toggle');
    if (elToggle) {
      elToggle.addEventListener('click', function () {
        if (typeof Pomodoro === 'undefined') return;
        var st = Pomodoro.getState();
        if (st.status === 'running') { Pomodoro.pause(); } else { Pomodoro.start(); }
      });
    }

    /* ── Update tampilan widget dari state ── */
    function _updateWidget(snap) {
      var elTime  = document.getElementById('pomo-mini-time');
      var elBar   = document.getElementById('pomo-mini-bar');
      var elWrap  = document.getElementById('pomo-mini-bar-wrap');
      var elMode  = document.getElementById('pomo-mini-mode');
      var elTgl   = document.getElementById('pomo-mini-toggle');
      var el      = document.getElementById('pomo-mini-widget');
      if (!el) return;

      var isActive  = snap.status === 'running' || snap.status === 'paused';
      var isFocus   = snap.mode   === 'focus';
      var isRunning = snap.status === 'running';

      /* Tampilkan / sembunyikan widget */
      el.setAttribute('aria-hidden', isActive ? 'false' : 'true');
      el.classList.toggle('pomo-mini-visible', isActive);

      if (!isActive) return;

      /* Waktu */
      if (elTime) {
        elTime.textContent = snap.formatted;
        elTime.setAttribute('aria-label', 'Sisa waktu: ' + snap.formatted);
      }

      /* Bar progress */
      if (elBar) {
        var pct = Math.round(snap.progress * 100);
        elBar.style.width = pct + '%';
        elBar.style.background = isFocus
          ? 'rgba(99,102,241,0.7)'
          : 'rgba(16,185,129,0.75)';
      }
      if (elWrap) elWrap.setAttribute('aria-valuenow', Math.round(snap.progress * 100));

      /* Label mode */
      if (elMode) {
        elMode.innerHTML =
          '<svg class="w-3.5 h-3.5 shrink-0" fill="currentColor" viewBox="0 0 16 16" aria-hidden="true">' +
          '<circle cx="8" cy="9" r="5.5"/>' +
          '<path d="M8 3.5 C8 3.5 9.5 2 11 2.5" stroke="currentColor" stroke-width="1" fill="none" stroke-linecap="round"/>' +
          '</svg>' + (isFocus ? '🍅 Fokus' : '☕ Istirahat');
        elMode.style.color = isFocus ? '#be123c' : '#065f46';
      }

      /* Teks tombol toggle */
      if (elTgl) {
        elTgl.textContent = isRunning ? 'Jeda' : 'Lanjut';
        elTgl.setAttribute('aria-label',
          isRunning ? 'Jeda sesi Pomodoro' : 'Lanjutkan sesi Pomodoro');
      }
    }

    /* Daftarkan listener — Pomodoro mungkin belum ada (halaman tanpa pomodoro.js) */
    function _tryAttach() {
      if (typeof Pomodoro !== 'undefined') {
        Pomodoro.onStateChange(_updateWidget);
        Pomodoro.init(); /* inisialisasi engine (idempotent) */
      }
      /* Script defer sudah dimuat berurutan sebelum DOMContentLoaded.
         Hindari retry loop berkala jika Pomodoro tidak tersedia. */
    }
    _tryAttach();
  }

  /* ══════════════════════════════════════════════════════════
     ENTRY POINT — dipanggil saat DOMContentLoaded
  ══════════════════════════════════════════════════════════ */
  /* ══════════════════════════════════════════════════════════
     INTEGRASI AUTENTIKASI — Phase 2
  ══════════════════════════════════════════════════════════ */

  /**
   * Perbarui area user di navbar setelah session check selesai.
   * Jika login: tampilkan nama + tombol logout.
   * Jika tidak login: tidak ada tindakan di sini (redirect sudah dilakukan).
   *
   * @param {object} user - { id, name, email } dari Auth.checkSession()
   */
  function _updateNavbarUser(user) {
    /* Cari elemen user slot di navbar (disuntikkan oleh _injectNavbar) */
    var slot = document.getElementById('nav-user-slot');
    if (!slot) return;

    var initial = (user.name || 'U').charAt(0).toUpperCase();
    var shortName = user.name ? user.name.split(' ')[0] : 'Pengguna';

    slot.innerHTML =
      /* Avatar + nama */
      '<div class="relative">' +
      '  <button id="btn-user-menu" type="button"' +
      '          class="flex items-center gap-2 pl-1.5 pr-2.5 py-1 rounded-full' +
      '                 bg-white/40 border border-white/60' +
      '                 hover:bg-white/65 transition-colors text-slate-700"' +
      '          aria-label="Menu pengguna ' + _escAttr(user.name) + '"' +
      '          aria-haspopup="true" aria-expanded="false">' +
      '    <span class="w-6 h-6 rounded-full bg-indigo-500 text-white' +
      '                 text-xs font-bold flex items-center justify-center shrink-0"' +
      '          aria-hidden="true">' + _escHtml(initial) + '</span>' +
      '    <span class="hidden sm:inline text-xs font-semibold max-w-[80px] truncate">' +
               _escHtml(shortName) +
      '    </span>' +
      '    <svg class="w-3 h-3 text-slate-500 shrink-0" fill="none" viewBox="0 0 24 24"' +
      '         stroke="currentColor" stroke-width="2.5" aria-hidden="true">' +
      '      <path stroke-linecap="round" d="M19 9l-7 7-7-7"/>' +
      '    </svg>' +
      '  </button>' +
      /* Dropdown menu user */
      '  <div id="user-menu-popover"' +
      '       class="absolute right-0 top-full mt-2 w-52 glass-card p-3 z-50 hidden"' +
      '       role="menu" aria-label="Menu pengguna">' +
      '    <p class="text-xs text-slate-500 mb-1 truncate px-1">' + _escHtml(user.email) + '</p>' +
      '    <p class="text-sm font-semibold text-slate-800 mb-3 truncate px-1">' + _escHtml(user.name) + '</p>' +
      '    <hr class="border-slate-200/60 mb-3"/>' +
      '    <button id="btn-logout" type="button"' +
      '            class="w-full flex items-center gap-2 px-2.5 py-2 rounded-xl' +
      '                   text-sm text-rose-600 font-medium' +
      '                   hover:bg-rose-50/70 transition-colors"' +
      '            role="menuitem"' +
      '            aria-label="Keluar dari akun Deadlinify">' +
      '      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"' +
      '           stroke-width="2" aria-hidden="true">' +
      '        <path stroke-linecap="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>' +
      '      </svg>' +
      '      Keluar' +
      '    </button>' +
      '  </div>' +
      '</div>';

    /* ── Toggle dropdown menu ── */
    var btnMenu    = document.getElementById('btn-user-menu');
    var popover    = document.getElementById('user-menu-popover');
    var btnLogout  = document.getElementById('btn-logout');

    if (btnMenu && popover) {
      btnMenu.addEventListener('click', function (e) {
        e.stopPropagation();
        var isOpen = !popover.classList.contains('hidden');
        popover.classList.toggle('hidden', isOpen);
        btnMenu.setAttribute('aria-expanded', isOpen ? 'false' : 'true');
      });

      /* Tutup saat klik di luar */
      document.addEventListener('click', function () {
        popover.classList.add('hidden');
        btnMenu.setAttribute('aria-expanded', 'false');
      });

      /* Tutup saat Escape */
      document.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          popover.classList.add('hidden');
          btnMenu.setAttribute('aria-expanded', 'false');
        }
      });
    }

    /* ── Tombol logout ── */
    if (btnLogout) {
      btnLogout.addEventListener('click', function () {
        if (typeof Auth !== 'undefined') {
          Auth.logout();
        } else {
          /* Fallback jika auth.js tidak dimuat */
          window.location.href = 'login.html';
        }
      });
    }
  }

  /**
   * Helper escape untuk menjaga keamanan HTML di innerHTML.
   */
  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _escAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  }

  /* ══════════════════════════════════════════════════════════
     ENTRY POINT
  ══════════════════════════════════════════════════════════ */
  function init() {
    var currentPage = document.body.dataset.page || 'dashboard';

    _injectBackground();
    _injectNavbar(currentPage);
    _injectDock(currentPage);
    _injectToastAndPermissionCard();
    _injectPomoWidget(currentPage);
    _initPageTransition();
    _initStorageSync();

    /* ── Pemeriksaan Session (Phase 2) ──
     * Auth.checkSession() memanggil backend/auth/check.php.
     * Jika backend belum aktif (buka dari file://), checkSession() menangkap
     * error fetch dan mengembalikan { authenticated: false }.
     * Dalam mode pengembangan tanpa backend, fitur lama tetap berjalan normal
     * karena redirect ke login hanya terjadi jika Auth tersedia DAN response
     * jelas menyatakan tidak terautentikasi.
     *
     * BATASAN: JavaScript redirect bukan perlindungan keamanan.
     * PHP endpoint memvalidasi session secara mandiri (lihat auth_check.php).
     */
    if (typeof Auth !== 'undefined') {
      Auth.checkSession().then(function (data) {
        if (data.csrf_token) {
          /* Simpan CSRF token di memori untuk digunakan request berikutnya */
          window._csrfToken = data.csrf_token;
        }

        if (data.authenticated && data.user) {
          window._authUser = data.user;
          _updateNavbarUser(data.user);
        } else if (data.authenticated === false) {
          /* Backend merespons dan menyatakan tidak login → redirect */
          window.location.href = 'login.html';
        }
        /* Jika data.authenticated tidak ada (backend offline) → tidak redirect */
      });
    }
  }

  /* Jalankan saat DOM siap */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.Layout = { init: init };

})();
