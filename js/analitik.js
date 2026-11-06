/**
 * analitik.js — Deadlinify
 * Logika spesifik halaman Analitik (analitik.html).
 *
 * Tanggung jawab:
 *   1. Memuat data tugas dari Storage (seed dari data.json jika pertama kali).
 *   2. Mengisi baris ringkasan angka (summary-total, done, active, overdue).
 *   3. Mengisi kartu ringkasan bawah (analytics-total, completion, overdue).
 *   4. Memanggil Charts.init() untuk render dua grafik.
 *   5. Mendengarkan tasks:sync (lintas tab) dan tasks:changed (tab ini)
 *      lalu memanggil Charts.update() — tanpa recreate instance.
 *   6. Menginisialisasi Notif.
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     1. MUAT DATA & INISIALISASI
  ══════════════════════════════════════════════════════════ */
  Storage.seedFromJson(function (tasks) {
    _renderAll(tasks);
    Notif.init();
  });

  /* ══════════════════════════════════════════════════════════
     2. RENDER SEMUA KOMPONEN
  ══════════════════════════════════════════════════════════ */
  function _renderAll(tasks) {
    _renderSummaryRow(tasks);
    _renderSummaryCard(tasks);
    Charts.init(tasks);
  }

  /* ── Baris ringkasan angka (4 kartu di atas grafik) ── */
  function _renderSummaryRow(tasks) {
    var now     = Date.now();
    var total   = tasks.length;
    var done    = tasks.filter(function (t) { return t.completed; }).length;
    var overdue = tasks.filter(function (t) {
      return !t.completed && new Date(t.deadline).getTime() < now;
    }).length;
    var active  = total - done - overdue;

    _set('summary-total',   total);
    _set('summary-done',    done);
    _set('summary-active',  active < 0 ? 0 : active);
    _set('summary-overdue', overdue);
  }

  /* ── Kartu ringkasan bawah (total, tingkat penyelesaian, terlambat) ── */
  function _renderSummaryCard(tasks) {
    var now     = Date.now();
    var total   = tasks.length;
    var done    = tasks.filter(function (t) { return t.completed; }).length;
    var overdue = tasks.filter(function (t) {
      return !t.completed && new Date(t.deadline).getTime() < now;
    }).length;
    var pct = total ? Math.round((done / total) * 100) : 0;

    _set('analytics-total',      total);
    _set('analytics-completion', pct + '%');
    _set('analytics-overdue',    overdue);

    /* Perbarui timestamp update terakhir */
    var elUpdate = document.getElementById('analytics-last-update');
    if (elUpdate) {
      var now2 = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      elUpdate.textContent = 'Terakhir diperbarui: ' + now2;
    }
  }

  /* ══════════════════════════════════════════════════════════
     3. SINKRONISASI LIVE
  ══════════════════════════════════════════════════════════ */

  /**
   * tasks:sync — dikirim oleh layout.js saat localStorage berubah di tab lain.
   * tasks:changed — dikirim oleh app.js saat pengguna menambah/hapus/toggle tugas di tab ini.
   * Keduanya memicu _updateAll yang memanggil Charts.update() (bukan init ulang).
   */
  function _updateAll() {
    var tasks = Storage.loadTasks();
    _renderSummaryRow(tasks);
    _renderSummaryCard(tasks);
    Charts.update(tasks);
  }

  document.addEventListener('tasks:sync',    _updateAll);
  document.addEventListener('tasks:changed', _updateAll);

  /* ══════════════════════════════════════════════════════════
     UTIL
  ══════════════════════════════════════════════════════════ */
  function _set(id, value) {
    var el = document.getElementById(id);
    if (el) el.textContent = value;
  }

});
