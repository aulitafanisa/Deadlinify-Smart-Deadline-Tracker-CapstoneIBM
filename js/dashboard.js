/**
 * dashboard.js — Deadlinify
 * Logika spesifik halaman Dashboard (dashboard.html).
 * Menampilkan 3 tugas aktif terdekat, statistik, dan persentase penyelesaian.
 * Merespons storage event lintas tab (tasks:sync).
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     1. INISIALISASI
  ══════════════════════════════════════════════════════════ */
  Storage.seedFromJson(function (tasks) {
    _render(tasks);
    // Inisialisasi sistem notifikasi
    Notif.init();
  });

  /* ══════════════════════════════════════════════════════════
     2. RENDER SEMUA WIDGET DASHBOARD
  ══════════════════════════════════════════════════════════ */
  function _render(tasks) {
    _renderNearestTasks(tasks);
    _updateStats(tasks);
    _updateCompletionPct(tasks);
    _updateFocusSummary();
  }

  /* ── 3 Tugas Aktif Terdekat ── */
  function _renderNearestTasks(tasks) {
    var container = document.getElementById('nearest-tasks-list');
    if (!container) return;

    // Ambil tugas aktif, urutkan deadline terdekat, ambil 3 teratas
    var active = tasks
      .filter(function (t) { return !t.completed; })
      .sort(function (a, b) { return new Date(a.deadline) - new Date(b.deadline); })
      .slice(0, 3);

    if (active.length === 0) {
      container.innerHTML =
        '<div class="countdown-empty" role="status">' +
        '  <svg width="56" height="56" viewBox="0 0 80 80" fill="none" aria-hidden="true">' +
        '    <circle cx="40" cy="40" r="36" stroke="currentColor" stroke-width="2"/>' +
        '    <path d="M40 22v20l12 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"/>' +
        '    <circle cx="40" cy="40" r="3" fill="currentColor"/>' +
        '  </svg>' +
        '  <p>Tidak ada tugas aktif. <a href="tugas.html" class="text-indigo-600 underline">Tambah tugas →</a></p>' +
        '</div>';
      return;
    }

    var html = '<div class="grid grid-cols-1 sm:grid-cols-3 gap-3">';
    active.forEach(function (task) {
      var ms    = Timer.msRemaining(task.deadline);
      var phase = Timer.getUrgencyLevel(task.deadline);
      var dlStr = new Date(task.deadline).toLocaleDateString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
      var priorityClass = (task.priority || 'Low').toLowerCase();

      html +=
        '<div class="countdown-card phase-' + phase + '"' +
        '     data-id="' + _esc(task.id) + '"' +
        '     data-deadline="' + _esc(task.deadline) + '"' +
        '     data-completed="false"' +
        '     role="listitem" aria-label="' + _esc(task.title) + '">' +
        '  <div class="priority-strip ' + priorityClass + '" aria-hidden="true"></div>' +
        '  <div class="flex flex-wrap gap-1 mb-2">' +
        '    <span class="badge-type">' + _esc(task.type) + '</span>' +
        '    <span class="badge-course">' + _esc(task.course) + '</span>' +
        '  </div>' +
        '  <h3 class="card-title text-sm font-semibold text-slate-800 mb-2 leading-snug">' + _esc(task.title) + '</h3>' +
        '  <div class="flex items-end justify-between gap-2">' +
        '    <p class="text-xs text-slate-400">' + dlStr + '</p>' +
        '    <span class="countdown-display phase-' + phase + '"' +
        '          data-id="' + _esc(task.id) + '">' +
             Timer.formatRemaining(ms) +
        '    </span>' +
        '  </div>' +
        '</div>';
    });
    html += '</div>';
    html += '<div class="mt-3 text-center">' +
            '  <a href="tugas.html" class="text-xs text-indigo-600 font-semibold hover:text-indigo-800 transition-colors">' +
            '    Lihat semua ' + tasks.filter(function(t){return !t.completed;}).length + ' tugas aktif →' +
            '  </a>' +
            '</div>';

    container.innerHTML = html;
  }

  /* ── Statistik Hero ── */
  function _updateStats(tasks) {
    var now    = Date.now();
    var active = 0, soon = 0, done = 0;
    tasks.forEach(function (t) {
      if (t.completed) { done++; return; }
      active++;
      var diff = new Date(t.deadline).getTime() - now;
      if (diff > 0 && diff < 72 * 60 * 60 * 1000) soon++;
    });
    var elA = document.getElementById('stat-active');
    var elS = document.getElementById('stat-soon');
    var elD = document.getElementById('stat-done');
    if (elA) elA.textContent = active;
    if (elS) elS.textContent = soon;
    if (elD) elD.textContent = done;
  }

  /* ── Persentase Penyelesaian (angka + progress bar) ── */
  function _updateCompletionPct(tasks) {
    var el    = document.getElementById('completion-pct');
    var bar   = document.getElementById('completion-bar');
    var wrap  = document.getElementById('completion-bar-wrap');
    var pct   = 0;
    if (tasks.length) {
      pct = Math.round((tasks.filter(function(t){return t.completed;}).length / tasks.length) * 100);
    }
    if (el)   el.textContent = pct + '%';
    if (bar)  bar.style.width = pct + '%';
    if (wrap) wrap.setAttribute('aria-valuenow', pct);
  }

  /* ── Ringkasan Fokus (statistik Pomodoro hari ini) ── */
  function _updateFocusSummary() {
    var elSessions = document.getElementById('focus-sessions-today');
    var elMinutes  = document.getElementById('focus-minutes-today');
    if (!elSessions && !elMinutes) return;
    /* Pomodoro mungkin belum terinisialisasi saat halaman pertama muat;
       ambil langsung dari localStorage jika belum ada */
    var stats = { sessionsToday: 0, minutesToday: 0 };
    if (typeof Pomodoro !== 'undefined') {
      stats = Pomodoro.getStats();
    } else {
      /* Baca langsung dari log tanpa inisialisasi penuh */
      try {
        var today = new Date().toDateString();
        var log = JSON.parse(localStorage.getItem('deadlinify_pomodoro_log') || '[]');
        var focusToday = log.filter(function (e) {
          return e.type === 'focus' && new Date(e.completedAt).toDateString() === today;
        });
        stats.sessionsToday = focusToday.length;
        stats.minutesToday  = focusToday.reduce(function (acc, e) { return acc + (e.durMin || 0); }, 0);
      } catch (e) { /* abaikan */ }
    }
    if (elSessions) elSessions.textContent = stats.sessionsToday;
    if (elMinutes)  elMinutes.textContent  = stats.minutesToday;
  }

  /* ══════════════════════════════════════════════════════════
     3. TICKER — perbarui countdown di kartu mini
  ══════════════════════════════════════════════════════════ */
  Timer.start();
  Timer.onTick(function () {
    document.querySelectorAll('.countdown-display[data-id]').forEach(function (el) {
      var card = document.querySelector('.countdown-card[data-id="' + el.dataset.id + '"]');
      if (!card) return;
      var deadline = card.dataset.deadline;
      var ms    = Timer.msRemaining(deadline);
      var phase = Timer.getUrgencyLevel(deadline);
      var text  = Timer.formatRemaining(ms);
      if (el.textContent !== text) el.textContent = text;
      /* Perbarui kelas fase jika berubah */
      var phaseClasses = ['phase-safe','phase-warning','phase-critical','phase-overdue'];
      if (!el.classList.contains('phase-' + phase)) {
        phaseClasses.forEach(function(c){ el.classList.remove(c); });
        el.classList.add('phase-' + phase);
      }
    });
  });

  /* ══════════════════════════════════════════════════════════
     4. SINKRONISASI — re-render saat tab lain mengubah data
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('tasks:sync', function () {
    var tasks = Storage.loadTasks();
    _render(tasks);
  });

  /* ══════════════════════════════════════════════════════════
     UTIL
  ══════════════════════════════════════════════════════════ */
  function _esc(str) {
    return String(str)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

});
