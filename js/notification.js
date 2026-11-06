/**
 * notification.js — Deadlinify
 * Sistem notifikasi Web Notification API native + fallback toast dalam aplikasi.
 * Ekspor: window.Notif
 *
 * Langkah 4: izin, penjadwal pengingat (1×/milestone/tugas), log terkirim,
 *             kartu izin kaca, chip status navbar, tombol tes.
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     KONSTANTA & STORAGE KEYS
  ══════════════════════════════════════════════════════════ */
  var SENT_LOG_KEY    = 'deadlinify_notif_sent';   // Set<"taskId:milestone">
  var ASKED_KEY       = 'deadlinify_notif_asked';  // flag kartu izin pernah ditampilkan
  var CHECK_INTERVAL  = 45 * 1000;                  // periksa tiap 45 detik
  var MILESTONES_MS   = [
    { key: '24h', ms: 24 * 60 * 60 * 1000, label: '24 jam lagi!' },
    { key: '1h',  ms:      60 * 60 * 1000, label: '1 jam lagi!'  }
  ];

  /* Ikon Deadlinify sebagai data URI (SVG kecil 32×32) */
  var ICON_URI = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" width="32" height="32">' +
    '<rect width="32" height="32" rx="8" fill="#6366f1"/>' +
    '<path d="M8 8h16v14H8z" fill="none" stroke="#fff" stroke-width="1.5" rx="2"/>' +
    '<line x1="16" y1="8" x2="16" y2="22" stroke="#fff" stroke-width="1.5"/>' +
    '<path d="M11 12 L21 12 L17.5 16 L21 20 L11 20 L14.5 16 Z" fill="rgba(253,230,138,0.85)"/>' +
    '</svg>'
  );

  /* ══════════════════════════════════════════════════════════
     SENTLOG — conjunto de notifikasi yang sudah terkirim
     Format item: "taskId:milestoneKey"
  ══════════════════════════════════════════════════════════ */
  function _loadSentLog() {
    try {
      var raw = localStorage.getItem(SENT_LOG_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function _saveSentLog(log) {
    try { localStorage.setItem(SENT_LOG_KEY, JSON.stringify(log)); } catch (e) {}
  }

  function _isSent(taskId, milestoneKey) {
    return _loadSentLog().indexOf(taskId + ':' + milestoneKey) !== -1;
  }

  function _markSent(taskId, milestoneKey) {
    var log = _loadSentLog();
    var key = taskId + ':' + milestoneKey;
    if (log.indexOf(key) === -1) {
      log.push(key);
      _saveSentLog(log);
    }
  }

  /** Hapus entri log untuk task yang sudah dihapus (housekeeping) */
  function _pruneLog(activeTasks) {
    var ids = activeTasks.map(function (t) { return t.id; });
    var log = _loadSentLog().filter(function (entry) {
      var taskId = entry.split(':')[0];
      return ids.indexOf(taskId) !== -1;
    });
    _saveSentLog(log);
  }

  /* ══════════════════════════════════════════════════════════
     STATUS IZIN
  ══════════════════════════════════════════════════════════ */
  function isSupported() {
    return typeof Notification !== 'undefined';
  }

  function getPermission() {
    if (!isSupported()) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  }

  /**
   * Minta izin notifikasi — HANYA dipanggil dari klik tombol pengguna.
   * @param {Function} callback(granted: boolean)
   */
  function requestPermission(callback) {
    if (!isSupported()) { callback(false); return; }
    try {
      var result = Notification.requestPermission(function (perm) {
        callback(perm === 'granted');
        _updateNavChip();
      });
      // requestPermission kadang mengembalikan Promise (Chrome)
      if (result && typeof result.then === 'function') {
        result.then(function (perm) {
          callback(perm === 'granted');
          _updateNavChip();
        }).catch(function () { callback(false); });
      }
    } catch (e) {
      console.warn('[Notif] requestPermission gagal:', e);
      callback(false);
    }
  }

  /* ══════════════════════════════════════════════════════════
     KIRIM NOTIFIKASI NATIVE
  ══════════════════════════════════════════════════════════ */
  /**
   * Kirim satu Web Notification.
   * Bila izin belum granted, gunakan toast in-app sebagai fallback.
   * @param {string} title
   * @param {string} body
   * @param {string} [tag]   - tag unik agar tidak double
   */
  function send(title, body, tag) {
    if (!isSupported() || getPermission() !== 'granted') {
      // Fallback ke toast in-app
      if (typeof window.showToast === 'function') {
        window.showToast(title + ' — ' + body, 'warning', 6000);
      }
      return;
    }
    try {
      var opts = {
        body:               body,
        icon:               ICON_URI,
        tag:                tag || ('deadlinify-' + Date.now()),
        renotify:           false,
        requireInteraction: false
      };
      var n = new Notification(title, opts);
      // Saat notifikasi diklik, fokuskan jendela aplikasi
      n.onclick = function () {
        try {
          if (window.focus) window.focus();
          if (window.parent && window.parent.focus) window.parent.focus();
        } catch (ex) {}
        n.close();
      };
    } catch (e) {
      console.warn('[Notif] Gagal mengirim notifikasi:', e);
      if (typeof window.showToast === 'function') {
        window.showToast(title + ' — ' + body, 'warning', 6000);
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     PENJADWAL PENGINGAT
  ══════════════════════════════════════════════════════════ */
  var _schedulerHandle = null;

  /** Mulai pengecekan berkala tiap CHECK_INTERVAL ms. */
  function startScheduler() {
    if (_schedulerHandle) return;
    _schedulerHandle = setInterval(_checkReminders, CHECK_INTERVAL);
    // Jalankan sekali sekarang juga
    _checkReminders();
  }

  /** Hentikan penjadwal. */
  function stopScheduler() {
    if (_schedulerHandle) {
      clearInterval(_schedulerHandle);
      _schedulerHandle = null;
    }
  }

  /**
   * Periksa semua tugas aktif dan kirim pengingat bila mendekati milestone.
   * Dipanggil tiap CHECK_INTERVAL dan saat tasks:changed.
   */
  function _checkReminders() {
    if (!isSupported() || getPermission() !== 'granted') return;

    var tasks = (typeof Storage !== 'undefined' && Storage.loadTasks)
      ? Storage.loadTasks()
      : [];

    // Housekeeping: bersihkan log untuk tugas yang sudah dihapus
    _pruneLog(tasks);

    var now = Date.now();

    tasks.forEach(function (task) {
      // Lewati tugas selesai
      if (task.completed) return;

      var deadlineMs = new Date(task.deadline).getTime();

      MILESTONES_MS.forEach(function (milestone) {
        // Jangan kirim ulang yang sudah terkirim
        if (_isSent(task.id, milestone.key)) return;

        var diff = deadlineMs - now;

        /*
          Kirim bila sisa waktu berada dalam jendela:
            milestone.ms — 1,5× CHECK_INTERVAL  s/d  milestone.ms + 1,5× CHECK_INTERVAL
          Jendela lebih besar dari CHECK_INTERVAL agar tidak terlewat di antara tick.
        */
        var window_ms = CHECK_INTERVAL * 1.5;
        if (diff > 0 && diff >= (milestone.ms - window_ms) && diff <= (milestone.ms + window_ms)) {
          _markSent(task.id, milestone.key);
          send(
            '⏰ Deadline ' + milestone.label,
            task.title + ' · ' + task.course,
            'deadlinify-' + task.id + '-' + milestone.key
          );
        }
      });
    });
  }

  /* ══════════════════════════════════════════════════════════
     CHIP STATUS NAVBAR
  ══════════════════════════════════════════════════════════ */
  function _updateNavChip() {
    var chip = document.getElementById('notif-nav-chip');
    if (!chip) return;

    var perm = getPermission();
    var configs = {
      granted: {
        text:        'Notif Aktif',
        ariaLabel:   'Notifikasi aktif — klik untuk pengaturan',
        bgClass:     'bg-emerald-50/70 border-emerald-200/70 text-emerald-800',
        dotClass:    'bg-emerald-500',
        pulseClass:  'bg-emerald-400'
      },
      default: {
        text:        '3 Notif',
        ariaLabel:   '3 notifikasi belum dibaca — klik untuk mengaktifkan',
        bgClass:     'bg-amber-50/70 border-amber-200/70 text-amber-800',
        dotClass:    'bg-amber-500',
        pulseClass:  'bg-amber-400'
      },
      denied: {
        text:        'Notif Blokir',
        ariaLabel:   'Notifikasi diblokir — klik untuk panduan',
        bgClass:     'bg-rose-50/70 border-rose-200/70 text-rose-800',
        dotClass:    'bg-rose-500',
        pulseClass:  'bg-rose-400'
      },
      unsupported: {
        text:        'Notif N/A',
        ariaLabel:   'Notifikasi tidak didukung browser ini',
        bgClass:     'bg-slate-100/70 border-slate-200/70 text-slate-500',
        dotClass:    'bg-slate-400',
        pulseClass:  'bg-slate-300'
      }
    };

    var cfg = configs[perm] || configs.default;

    // Ganti semua class warna
    chip.className = [
      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full',
      'border text-xs font-semibold',
      'hover:opacity-90 transition-opacity cursor-pointer',
      cfg.bgClass
    ].join(' ');
    chip.setAttribute('aria-label', cfg.ariaLabel);

    var dotEl   = chip.querySelector('.notif-dot');
    var pulseEl = chip.querySelector('.notif-dot-pulse');
    var textEl  = chip.querySelector('.notif-chip-text');

    if (dotEl)   dotEl.className   = 'relative inline-flex rounded-full h-2.5 w-2.5 ' + cfg.dotClass;
    if (pulseEl) pulseEl.className = 'notif-pulse notif-dot-pulse absolute inline-flex h-full w-full rounded-full opacity-75 ' + cfg.pulseClass;
    if (textEl)  textEl.textContent = cfg.text;
  }

  /* ══════════════════════════════════════════════════════════
     KARTU IZIN (muncul satu kali, bisa ditutup)
  ══════════════════════════════════════════════════════════ */
  function _showPermissionCard() {
    if (localStorage.getItem(ASKED_KEY)) return;    // sudah pernah muncul
    if (getPermission() !== 'default') return;       // sudah ada keputusan
    var card = document.getElementById('notif-permission-card');
    if (!card) return;
    card.removeAttribute('hidden');
    card.classList.remove('notif-card-hidden');
    card.classList.add('notif-card-visible');
    // Fokus ke tombol "Aktifkan" untuk aksesibilitas keyboard
    setTimeout(function () {
      var btn = card.querySelector('#btn-notif-enable');
      if (btn) btn.focus();
    }, 320);
  }

  function _hidePermissionCard() {
    var card = document.getElementById('notif-permission-card');
    if (!card) return;
    card.classList.remove('notif-card-visible');
    card.classList.add('notif-card-hidden');
    card.addEventListener('transitionend', function () {
      card.setAttribute('hidden', '');
    }, { once: true });
    localStorage.setItem(ASKED_KEY, '1');
  }

  /* ══════════════════════════════════════════════════════════
     POPOVER PENGATURAN NOTIFIKASI (dari chip navbar)
  ══════════════════════════════════════════════════════════ */
  function _toggleSettingsPopover() {
    var popover = document.getElementById('notif-settings-popover');
    if (!popover) return;
    var isVisible = !popover.hasAttribute('hidden');
    if (isVisible) {
      _closeSettingsPopover();
    } else {
      _openSettingsPopover();
    }
  }

  function _openSettingsPopover() {
    var popover = document.getElementById('notif-settings-popover');
    if (!popover) return;
    _refreshSettingsContent();
    popover.removeAttribute('hidden');
    popover.classList.remove('notif-card-hidden');
    popover.classList.add('notif-card-visible');
    // Fokus ke tombol pertama di dalam popover
    setTimeout(function () {
      var first = popover.querySelector('button:not([disabled])');
      if (first) first.focus();
    }, 50);
  }

  function _closeSettingsPopover() {
    var popover = document.getElementById('notif-settings-popover');
    if (!popover) return;
    popover.classList.remove('notif-card-visible');
    popover.classList.add('notif-card-hidden');
    popover.addEventListener('transitionend', function () {
      popover.setAttribute('hidden', '');
    }, { once: true });
  }

  /** Perbarui konten popover sesuai status izin saat ini */
  function _refreshSettingsContent() {
    var popover = document.getElementById('notif-settings-popover');
    if (!popover) return;
    var perm = getPermission();

    var statusEl = popover.querySelector('#notif-settings-status');
    var guideEl  = popover.querySelector('#notif-settings-guide');
    var btnEl    = popover.querySelector('#btn-notif-settings-toggle');

    var statusMap = {
      granted:     '<span class="text-emerald-700 font-semibold">✅ Aktif</span>',
      default:     '<span class="text-amber-700 font-semibold">⏳ Belum diizinkan</span>',
      denied:      '<span class="text-rose-700 font-semibold">🚫 Diblokir</span>',
      unsupported: '<span class="text-slate-500 font-semibold">❌ Tidak didukung</span>'
    };
    if (statusEl) statusEl.innerHTML = statusMap[perm] || statusMap.default;

    if (guideEl) {
      if (perm === 'denied') {
        guideEl.textContent = 'Untuk mengaktifkan: klik ikon kunci/info di bilah alamat browser → Notifikasi → Izinkan, lalu muat ulang halaman.';
        guideEl.removeAttribute('hidden');
      } else {
        guideEl.setAttribute('hidden', '');
      }
    }

    if (btnEl) {
      if (perm === 'default') {
        btnEl.textContent = 'Aktifkan Notifikasi';
        btnEl.removeAttribute('disabled');
      } else if (perm === 'granted') {
        btnEl.textContent = 'Notifikasi Sudah Aktif';
        btnEl.setAttribute('disabled', '');
      } else {
        btnEl.textContent = 'Tidak Dapat Diaktifkan';
        btnEl.setAttribute('disabled', '');
      }
    }
  }

  /* ══════════════════════════════════════════════════════════
     TES NOTIFIKASI (tombol demo)
  ══════════════════════════════════════════════════════════ */
  function sendTest() {
    send(
      '🧪 Tes Notifikasi Deadlinify',
      'Notifikasi berjalan dengan baik!',
      'deadlinify-test-' + Date.now()
    );
    _closeSettingsPopover();
    if (typeof window.showToast === 'function') {
      window.showToast('Notifikasi tes dikirim!', 'info', 2500);
    }
  }

  /* ══════════════════════════════════════════════════════════
     INISIALISASI — dipanggil dari app.js saat DOM siap
  ══════════════════════════════════════════════════════════ */
  function init() {
    _updateNavChip();

    // Tampilkan kartu izin bila belum pernah ditampilkan & status masih default
    _showPermissionCard();

    /* ── Tombol "Aktifkan" di kartu izin ── */
    var btnEnable = document.getElementById('btn-notif-enable');
    if (btnEnable) {
      btnEnable.addEventListener('click', function () {
        requestPermission(function (granted) {
          _hidePermissionCard();
          _updateNavChip();
          if (granted) {
            if (typeof window.showToast === 'function') {
              window.showToast('Notifikasi diaktifkan!', 'success', 3000);
            }
            startScheduler();
          } else {
            if (typeof window.showToast === 'function') {
              window.showToast('Notifikasi ditolak. Peringatan akan muncul di dalam aplikasi.', 'warning', 5000);
            }
          }
        });
      });
    }

    /* ── Tombol "Nanti" di kartu izin ── */
    var btnLater = document.getElementById('btn-notif-later');
    if (btnLater) {
      btnLater.addEventListener('click', function () {
        _hidePermissionCard();
      });
    }

    /* ── Tombol chip notifikasi di navbar ── */
    var navChip = document.getElementById('notif-nav-chip');
    if (navChip) {
      navChip.addEventListener('click', function () {
        _toggleSettingsPopover();
      });
    }

    /* ── Tombol di dalam settings popover ── */
    var btnSettingsToggle = document.getElementById('btn-notif-settings-toggle');
    if (btnSettingsToggle) {
      btnSettingsToggle.addEventListener('click', function () {
        requestPermission(function (granted) {
          _updateNavChip();
          _refreshSettingsContent();
          if (granted) {
            startScheduler();
            if (typeof window.showToast === 'function') {
              window.showToast('Notifikasi diaktifkan!', 'success', 3000);
            }
          }
        });
      });
    }

    /* ── Tombol Tes Notifikasi ── */
    var btnTest = document.getElementById('btn-notif-test');
    if (btnTest) {
      btnTest.addEventListener('click', function () {
        sendTest();
      });
    }

    /* ── Tombol tutup popover ── */
    var btnClosePopover = document.getElementById('btn-notif-settings-close');
    if (btnClosePopover) {
      btnClosePopover.addEventListener('click', function () {
        _closeSettingsPopover();
      });
    }

    /* ── Tutup popover saat klik di luar ── */
    document.addEventListener('click', function (e) {
      var popover = document.getElementById('notif-settings-popover');
      var chip    = document.getElementById('notif-nav-chip');
      if (!popover || popover.hasAttribute('hidden')) return;
      if (!popover.contains(e.target) && chip && !chip.contains(e.target)) {
        _closeSettingsPopover();
      }
    });

    /* ── Tutup popover & kartu dengan Escape ── */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      _closeSettingsPopover();
      _hidePermissionCard();
    });

    /* ── Mulai penjadwal jika sudah granted ── */
    if (getPermission() === 'granted') {
      startScheduler();
    }
  }

  /* ══════════════════════════════════════════════════════════
     EKSPOR API
  ══════════════════════════════════════════════════════════ */
  window.Notif = {
    init:              init,
    send:              send,
    sendTest:          sendTest,
    requestPermission: requestPermission,
    getPermission:     getPermission,
    isSupported:       isSupported,
    startScheduler:    startScheduler,
    stopScheduler:     stopScheduler,
    checkReminders:    _checkReminders,   // untuk evaluasi ulang saat tasks:changed
    updateNavChip:     _updateNavChip
  };

})();
