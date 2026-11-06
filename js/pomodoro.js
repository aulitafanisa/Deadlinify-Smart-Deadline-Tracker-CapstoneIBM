/**
 * pomodoro.js — Deadlinify
 * Mesin Pomodoro berbasis timestamp agar tidak drift di lintas tab/refresh.
 * Semua state tersimpan di localStorage; tab lain membaca state yang sama.
 *
 * API publik (window.Pomodoro):
 *   init(opts)          — Inisialisasi, opts: { page: 'fokus'|'widget' }
 *   start()             — Mulai / lanjutkan sesi
 *   pause()             — Jeda sesi
 *   reset()             — Reset ke awal durasi
 *   skip()              — Lewati sesi saat ini (loncat ke mode berikutnya)
 *   setDuration(min)    — Ubah durasi fokus (10 | 25 | 50 menit)
 *   getState()          — Kembalikan salinan state saat ini
 *   getStats()          — Kembalikan statistik hari ini
 *   onStateChange(fn)   — Daftarkan listener perubahan state
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     KONSTANTA
  ══════════════════════════════════════════════════════════ */
  var LS_KEY_STATE = 'deadlinify_pomo_state';
  var LS_KEY_LOG   = 'deadlinify_pomodoro_log';
  var LS_KEY_BEEP  = 'deadlinify_pomo_beep_ts';  // anti-duplikat suara lintas tab
  var BREAK_MIN    = 5;  // istirahat selalu 5 menit

  /* ══════════════════════════════════════════════════════════
     STATE (disimpan & dimuat dari localStorage)
     {
       status:    'idle' | 'running' | 'paused' | 'done'
       mode:      'focus' | 'break'
       durMin:    number          — durasi fokus saat ini (menit)
       startTs:   number | null   — Date.now() saat mulai/lanjut
       pausedMs:  number          — sisa ms saat dijeda
       sessions:  number          — jumlah sesi fokus selesai hari ini
       focusedTaskId: string|null — id tugas yang sedang difokuskan
     }
  ══════════════════════════════════════════════════════════ */
  var _state = {
    status: 'idle',
    mode: 'focus',
    durMin: 25,
    startTs: null,
    pausedMs: null,
    sessions: 0,
    focusedTaskId: null
  };

  /* Listener perubahan state (array fungsi) */
  var _listeners = [];

  /* ID requestAnimationFrame ticker */
  var _rafId = null;

  /* Simpan/muat state ─────────────────────────────────────── */
  function _saveState() {
    try {
      localStorage.setItem(LS_KEY_STATE, JSON.stringify(_state));
    } catch (e) { /* kuota penuh — abaikan */ }
  }

  function _loadState() {
    try {
      var raw = localStorage.getItem(LS_KEY_STATE);
      if (!raw) return;
      var parsed = JSON.parse(raw);
      // Pastikan semua field ada (versi lama mungkin tidak lengkap)
      _state.status        = parsed.status        || 'idle';
      _state.mode          = parsed.mode          || 'focus';
      _state.durMin        = parsed.durMin        || 25;
      _state.startTs       = parsed.startTs       || null;
      _state.pausedMs      = parsed.pausedMs      || null;
      _state.sessions      = parsed.sessions      || 0;
      _state.focusedTaskId = parsed.focusedTaskId || null;
    } catch (e) { /* data korup — reset */ }
  }

  /* Hitung sisa ms berdasarkan timestamp ─────────────────── */
  function _calcRemainingMs() {
    var totalMs = (_state.mode === 'focus' ? _state.durMin : BREAK_MIN) * 60 * 1000;
    if (_state.status === 'idle') return totalMs;
    if (_state.status === 'paused' || _state.status === 'done') {
      return _state.pausedMs !== null ? _state.pausedMs : totalMs;
    }
    if (_state.status === 'running' && _state.startTs) {
      var elapsed = Date.now() - _state.startTs;
      var base    = _state.pausedMs !== null ? _state.pausedMs : totalMs;
      return Math.max(0, base - elapsed);
    }
    return totalMs;
  }

  function _totalMs() {
    return (_state.mode === 'focus' ? _state.durMin : BREAK_MIN) * 60 * 1000;
  }

  /* Format mm:ss ─────────────────────────────────────────── */
  function _fmt(ms) {
    var s   = Math.ceil(ms / 1000);
    var min = Math.floor(s / 60);
    var sec = s % 60;
    return (min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec;
  }

  /* ══════════════════════════════════════════════════════════
     AUDIO — beep via Web Audio API (tanpa file audio)
  ══════════════════════════════════════════════════════════ */
  function _beep() {
    /* Anti-duplikat lintas tab: hanya beep jika belum ada tab lain yang beep
       dalam 2 detik terakhir */
    var now = Date.now();
    try {
      var last = parseInt(localStorage.getItem(LS_KEY_BEEP) || '0', 10);
      if (now - last < 2000) return; // tab lain sudah beep
      localStorage.setItem(LS_KEY_BEEP, String(now));
    } catch (e) { /* abaikan */ }

    /* Jangan beep jika pengguna meminta reduced motion (biasanya juga tidak suka suara mendadak) */
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    try {
      var AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      var ctx = new AudioCtx();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(440, ctx.currentTime + 0.4);
      gain.gain.setValueAtTime(0.25, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.8);
      osc.onended = function () { ctx.close(); };
    } catch (e) { /* Web Audio tidak tersedia */ }
  }

  /* ══════════════════════════════════════════════════════════
     LOG SESI
  ══════════════════════════════════════════════════════════ */
  function _addLog(entry) {
    /* entry: { type, durMin, completedAt, taskId } */
    try {
      var log = JSON.parse(localStorage.getItem(LS_KEY_LOG) || '[]');
      log.unshift(entry); // terbaru di atas
      if (log.length > 100) log = log.slice(0, 100); // batasi 100 entri
      localStorage.setItem(LS_KEY_LOG, JSON.stringify(log));
    } catch (e) { /* abaikan */ }
  }

  function _getLog() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY_LOG) || '[]');
    } catch (e) { return []; }
  }

  /* Statistik hari ini ─────────────────────────────────────── */
  function _getStats() {
    var today = new Date().toDateString();
    var log   = _getLog();
    var focusToday = log.filter(function (e) {
      return e.type === 'focus' && new Date(e.completedAt).toDateString() === today;
    });
    return {
      sessionsToday: focusToday.length,
      minutesToday:  focusToday.reduce(function (acc, e) { return acc + (e.durMin || 0); }, 0)
    };
  }

  /* ══════════════════════════════════════════════════════════
     NOTIFY LISTENERS & TITLE
  ══════════════════════════════════════════════════════════ */
  function _notify() {
    var ms  = _calcRemainingMs();
    var pct = 1 - ms / _totalMs();
    var snapshot = {
      status:    _state.status,
      mode:      _state.mode,
      durMin:    _state.durMin,
      remaining: ms,
      formatted: _fmt(ms),
      progress:  Math.min(1, Math.max(0, pct)),
      sessions:  _state.sessions
    };
    for (var i = 0; i < _listeners.length; i++) {
      try { _listeners[i](snapshot); } catch (e) { /* abaikan listener error */ }
    }
  }

  function _updateTitle(ms, status) {
    if (document.body.dataset.page !== 'fokus') return;
    if (status === 'running') {
      document.title = _fmt(ms) + ' — Deadlinify';
    } else {
      document.title = 'Fokus — Deadlinify';
    }
  }

  /* ══════════════════════════════════════════════════════════
     TICKER (rAF — berjalan di halaman fokus; setiap ~200ms)
  ══════════════════════════════════════════════════════════ */
  var _lastTick = 0;

  function _tick(now) {
    if (now - _lastTick >= 200) {
      _lastTick = now;
      var ms = _calcRemainingMs();
      _updateTitle(ms, _state.status);
      _notify();

      /* Cek apakah sesi berakhir */
      if (_state.status === 'running' && ms <= 0) {
        _onSessionEnd();
        return; // rAF akan di-restart oleh _onSessionEnd jika diperlukan
      }
    }
    if (_state.status === 'running') {
      _rafId = requestAnimationFrame(_tick);
    }
  }

  function _startTicker() {
    if (_rafId) cancelAnimationFrame(_rafId);
    _rafId = requestAnimationFrame(_tick);
  }

  function _stopTicker() {
    if (_rafId) {
      cancelAnimationFrame(_rafId);
      _rafId = null;
    }
    /* Reset judul hanya di halaman fokus */
    if (document.body.dataset.page === 'fokus') {
      document.title = 'Fokus — Deadlinify';
    }
  }

  /* ══════════════════════════════════════════════════════════
     SESI SELESAI
  ══════════════════════════════════════════════════════════ */
  function _onSessionEnd() {
    _stopTicker();

    /* Log sesi */
    var entry = {
      type:        _state.mode,
      durMin:      _state.mode === 'focus' ? _state.durMin : BREAK_MIN,
      completedAt: new Date().toISOString(),
      taskId:      _state.focusedTaskId || null
    };
    _addLog(entry);

    /* Beep + notifikasi browser */
    _beep();
    if (typeof Notif !== 'undefined') {
      var title = _state.mode === 'focus'
        ? '🍅 Sesi Fokus Selesai!'
        : '☕ Istirahat Selesai!';
      var body = _state.mode === 'focus'
        ? 'Bagus! Saatnya istirahat ' + BREAK_MIN + ' menit.'
        : 'Siap fokus lagi? Sesi berikutnya menunggu.';
      Notif.send(title, body, 'pomo-session-end');
    }

    /* Tambah hitungan sesi jika fokus */
    if (_state.mode === 'focus') {
      _state.sessions = (_state.sessions || 0) + 1;
    }

    /* Auto-switch mode */
    _state.mode    = _state.mode === 'focus' ? 'break' : 'focus';
    _state.status  = 'idle';
    _state.startTs = null;
    _state.pausedMs = null;

    _saveState();
    _notify();

    /* Auto-mulai istirahat (opsional — di sini dibiarkan idle,
       user perlu klik Start lagi) */
  }

  /* ══════════════════════════════════════════════════════════
     KONTROL PUBLIK
  ══════════════════════════════════════════════════════════ */
  function _start() {
    if (_state.status === 'running') return;

    if (_state.status === 'idle') {
      /* Mulai baru */
      _state.startTs  = Date.now();
      _state.pausedMs = null;
    } else if (_state.status === 'paused') {
      /* Lanjutkan dari jeda */
      _state.startTs  = Date.now();
      /* pausedMs tetap — digunakan sebagai basis sisa waktu */
    } else {
      return; // status 'done' — tidak dilanjutkan
    }

    _state.status = 'running';
    _saveState();
    _notify();
    _startTicker();
  }

  function _pause() {
    if (_state.status !== 'running') return;
    _stopTicker();
    _state.pausedMs = _calcRemainingMs();
    _state.startTs  = null;
    _state.status   = 'paused';
    _saveState();
    _notify();
  }

  function _reset() {
    _stopTicker();
    _state.status   = 'idle';
    _state.startTs  = null;
    _state.pausedMs = null;
    /* mode tetap — reset hanya waktu, bukan jenis sesi */
    _saveState();
    _notify();
  }

  function _skip() {
    _stopTicker();
    /* Log sesi yang dilewat (type: mode saat ini, durMin: 0 = dilewat) */
    _addLog({
      type:        _state.mode,
      durMin:      0,
      completedAt: new Date().toISOString(),
      taskId:      _state.focusedTaskId || null,
      skipped:     true
    });
    /* Ganti mode */
    _state.mode     = _state.mode === 'focus' ? 'break' : 'focus';
    _state.status   = 'idle';
    _state.startTs  = null;
    _state.pausedMs = null;
    _saveState();
    _notify();
  }

  function _setDuration(min) {
    var valid = [10, 25, 50];
    if (valid.indexOf(min) === -1) return;
    _stopTicker();
    _state.durMin   = min;
    _state.status   = 'idle';
    _state.startTs  = null;
    _state.pausedMs = null;
    _state.mode     = 'focus'; // kembali ke mode fokus
    _saveState();
    _notify();
  }

  function _setFocusedTask(taskId) {
    _state.focusedTaskId = taskId || null;
    _saveState();
  }

  /* ══════════════════════════════════════════════════════════
     SINKRONISASI LINTAS TAB
     Tab lain mengubah state → kita reload dan notify
  ══════════════════════════════════════════════════════════ */
  window.addEventListener('storage', function (e) {
    if (e.key !== LS_KEY_STATE) return;
    _loadState();
    if (_state.status === 'running') {
      _startTicker();
    } else {
      _stopTicker();
      _notify();
    }
  });

  /* ══════════════════════════════════════════════════════════
     INISIALISASI
  ══════════════════════════════════════════════════════════ */
  function init(opts) {
    opts = opts || {};
    _loadState();

    /* Jika ada sesi running yang belum kedaluwarsa, lanjutkan ticker */
    if (_state.status === 'running') {
      var ms = _calcRemainingMs();
      if (ms <= 0) {
        /* Sesi sudah selesai saat tab tidak aktif */
        _onSessionEnd();
      } else {
        _startTicker();
      }
    }

    _notify(); // render state awal
  }

  /* ══════════════════════════════════════════════════════════
     EKSPOR PUBLIK
  ══════════════════════════════════════════════════════════ */
  window.Pomodoro = {
    init:           init,
    start:          _start,
    pause:          _pause,
    reset:          _reset,
    skip:           _skip,
    setDuration:    _setDuration,
    setFocusedTask: _setFocusedTask,
    getState:       function () { return JSON.parse(JSON.stringify(_state)); },
    getStats:       _getStats,
    getLog:         _getLog,
    calcRemainingMs: _calcRemainingMs,
    fmt:            _fmt,
    onStateChange:  function (fn) {
      if (typeof fn === 'function') _listeners.push(fn);
    }
  };

})();
