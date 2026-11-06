/**
 * timer.js — Deadlinify
 * Mesin countdown terpusat: satu setInterval 1 detik memperbarui semua kartu.
 * Ekspor: window.Timer
 *
 * Langkah 3: countdown multi-kartu, urgency levels, visibilitychange.
 * Langkah 4 (mendatang): startPomodoro, pausePomodoro, resumePomodoro, resetPomodoro.
 */

(function () {
  'use strict';

  /* ── State internal ──────────────────────────────────────── */
  var _intervalId  = null;   // ID setInterval global
  var _tickListeners = [];   // callback [] yang dipanggil setiap detik

  /* ═══════════════════════════════════════════════════════════
     COUNTDOWN ENGINE — satu interval, semua kartu ikut
  ═══════════════════════════════════════════════════════════ */

  /**
   * Mulai mesin countdown global.
   * Satu setInterval memperbarui seluruh UI — tidak ada interval per kartu.
   */
  function start() {
    if (_intervalId) return; // sudah berjalan
    _intervalId = setInterval(_tick, 1000);
    // Panggil sekali langsung agar UI tidak kosong 1 detik pertama
    _tick();
  }

  /** Hentikan mesin countdown. */
  function stop() {
    if (_intervalId) {
      clearInterval(_intervalId);
      _intervalId = null;
    }
  }

  /**
   * Daftarkan listener yang dipanggil setiap detik.
   * @param {Function} fn - callback tanpa parameter
   * @returns {Function} fungsi untuk membatalkan langganan
   */
  function onTick(fn) {
    _tickListeners.push(fn);
    return function unsubscribe() {
      _tickListeners = _tickListeners.filter(function (f) { return f !== fn; });
    };
  }

  /** Dipanggil setiap detik — panggil semua listener. */
  function _tick() {
    for (var i = 0; i < _tickListeners.length; i++) {
      try { _tickListeners[i](); } catch (e) { /* jaga konsol tetap bersih */ }
    }
  }

  /* ═══════════════════════════════════════════════════════════
     UTILITAS WAKTU
  ═══════════════════════════════════════════════════════════ */

  /**
   * Hitung sisa waktu dari sekarang ke deadline (ms).
   * @param {string|Date} deadline
   * @returns {number} milidetik (negatif jika terlambat)
   */
  function msRemaining(deadline) {
    return new Date(deadline).getTime() - Date.now();
  }

  /**
   * Format milidetik menjadi string "2h 04j 15m 09d".
   * h = hari, j = jam, m = menit, d = detik
   * Jika negatif kembalikan 'Terlambat'.
   * @param {number} ms
   * @returns {string}
   */
  function formatRemaining(ms) {
    if (ms <= 0) return 'Terlambat';

    var totalSec = Math.floor(ms / 1000);
    var days     = Math.floor(totalSec / 86400);
    var hours    = Math.floor((totalSec % 86400) / 3600);
    var minutes  = Math.floor((totalSec % 3600) / 60);
    var secs     = totalSec % 60;

    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };

    if (days > 0) {
      return days + 'h ' + pad(hours) + 'j ' + pad(minutes) + 'm ' + pad(secs) + 'd';
    }
    if (hours > 0) {
      return pad(hours) + 'j ' + pad(minutes) + 'm ' + pad(secs) + 'd';
    }
    return pad(minutes) + 'm ' + pad(secs) + 'd';
  }

  /**
   * Tentukan fase urgensi berdasarkan sisa waktu.
   * @param {string|Date} deadline
   * @returns {'safe'|'warning'|'critical'|'overdue'}
   */
  function getUrgencyLevel(deadline) {
    var ms = msRemaining(deadline);
    if (ms <= 0)                     return 'overdue';
    if (ms < 24 * 3600 * 1000)       return 'critical';
    if (ms < 72 * 3600 * 1000)       return 'warning';
    return 'safe';
  }

  /* ═══════════════════════════════════════════════════════════
     VISIBILITYCHANGE — pause saat tab tersembunyi, resume saat kembali
  ═══════════════════════════════════════════════════════════ */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      stop();
    } else {
      // Sinkronkan ulang: panggil tick segera agar waktu langsung akurat
      start();
      _tick();
    }
  });

  /* ═══════════════════════════════════════════════════════════
     POMODORO — akan diimplementasikan di Langkah 4
  ═══════════════════════════════════════════════════════════ */
  //  startPomodoro(durationMinutes, onTick, onComplete)
  //  pausePomodoro()
  //  resumePomodoro()
  //  resetPomodoro()

  /* ── Ekspor API ──────────────────────────────────────────── */
  window.Timer = {
    start:           start,
    stop:            stop,
    onTick:          onTick,
    msRemaining:     msRemaining,
    formatRemaining: formatRemaining,
    getUrgencyLevel: getUrgencyLevel
  };

})();
