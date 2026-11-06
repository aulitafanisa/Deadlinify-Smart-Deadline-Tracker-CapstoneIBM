/**
 * charts.js — Deadlinify
 * Membungkus Chart.js untuk dua grafik di halaman analitik.html:
 *
 *   1. Doughnut Chart — Distribusi Status Tugas
 *      Selesai (emerald) vs Aktif (indigo) vs Terlambat (rose)
 *      Persentase penyelesaian ditampilkan di tengah via plugin kustom.
 *
 *   2. Bar Chart — Beban Akademis per Mata Kuliah
 *      Jumlah tugas aktif per mata kuliah; bar terpanjang diberi warna
 *      indigo sebagai sorotan, bar lain diberi warna emerald.
 *      Satu kalimat insight dalam Bahasa Indonesia ditampilkan di bawah.
 *
 * Desain:
 *   - Canvas transparan, grid lembut, tooltip popover kaca
 *   - Bar membulat (borderRadius), font dari system-ui
 *   - Warna dibaca dari CSS custom properties
 *   - maintainAspectRatio: false — grafik mengisi container tinggi tetap
 *   - Update via .update() pada instance yang sama — tanpa destroy-recreate
 *   - Tabel data tersembunyi secara visual sebagai alternatif aksesibilitas
 *   - Jika Chart.js gagal dimuat, tampilkan pesan ramah (offline fallback)
 *
 * Tidak ada dependensi selain Chart.js (CDN) dan window.Storage.
 *
 * Ekspor: window.Charts = { init, update }
 */

(function () {
  'use strict';

  /* ══════════════════════════════════════════════════════════
     KONSTANTA & PALET WARNA
  ══════════════════════════════════════════════════════════ */

  /* Baca CSS variable jika ada, fallback ke nilai hardcode */
  function _cssVar(name, fallback) {
    var val = getComputedStyle(document.documentElement)
                .getPropertyValue(name).trim();
    return val || fallback;
  }

  var COLOR = {
    emerald: 'rgba(16,185,129,0.82)',
    emeraldBorder: 'rgba(16,185,129,1)',
    indigo:  'rgba(99,102,241,0.82)',
    indigoBorder: 'rgba(99,102,241,1)',
    rose:    'rgba(244,63,94,0.78)',
    roseBorder: 'rgba(244,63,94,1)',
    slate:   'rgba(148,163,184,0.55)',
    slateBorder: 'rgba(148,163,184,0.85)',
    amber:   'rgba(245,158,11,0.82)',
    amberBorder: 'rgba(245,158,11,1)',
    text:    '#334155',    /* slate-700 */
    grid:    'rgba(148,163,184,0.18)',
    tooltip: 'rgba(255,255,255,0.88)'
  };

  /* Instance grafik (disimpan agar bisa di-update tanpa recreate) */
  var _doughnutChart = null;
  var _barChart      = null;

  /* ══════════════════════════════════════════════════════════
     HELPER: EKSTRAKSI DATA DARI ARRAY TASKS
  ══════════════════════════════════════════════════════════ */

  /**
   * Hitung distribusi status tugas.
   * @returns {{ done, active, overdue, total, pct }}
   */
  function _buildStatusData(tasks) {
    var now     = Date.now();
    var done    = 0, active = 0, overdue = 0;
    tasks.forEach(function (t) {
      if (t.completed) {
        done++;
      } else if (new Date(t.deadline).getTime() < now) {
        overdue++;
      } else {
        active++;
      }
    });
    var total = tasks.length;
    var pct   = total ? Math.round((done / total) * 100) : 0;
    return { done: done, active: active, overdue: overdue, total: total, pct: pct };
  }

  /**
   * Hitung jumlah tugas AKTIF per mata kuliah (tidak termasuk selesai).
   * @returns {{ labels: string[], counts: number[], maxIdx: number }}
   */
  function _buildCourseData(tasks) {
    var now    = Date.now();
    var map    = {}; /* course → count */
    tasks.forEach(function (t) {
      if (t.completed) return; /* lewati tugas selesai */
      var key = (t.course || 'Lainnya').trim();
      map[key] = (map[key] || 0) + 1;
    });

    /* Urutkan dari terbesar ke terkecil */
    var entries = Object.keys(map).map(function (k) {
      return { label: k, count: map[k] };
    });
    entries.sort(function (a, b) { return b.count - a.count; });

    var labels = entries.map(function (e) { return e.label; });
    var counts = entries.map(function (e) { return e.count; });
    var maxIdx = counts.length ? 0 : -1; /* indeks nilai terbesar (sudah diurutkan) */

    return { labels: labels, counts: counts, maxIdx: maxIdx };
  }

  /**
   * Buat kalimat insight dari data per mata kuliah.
   * @returns {string}
   */
  function _buildInsight(courseData, tasks) {
    if (!courseData.labels.length) return '';
    var busiest = courseData.labels[0];
    var count   = courseData.counts[0];
    /* Hitung total tugas aktif */
    var totalActive = courseData.counts.reduce(function (s, c) { return s + c; }, 0);
    if (!totalActive) return 'Semua tugas sudah selesai. Kerja bagus! 🎉';
    if (courseData.labels.length === 1) {
      return busiest + ' adalah satu-satunya mata kuliah dengan ' + count + ' tugas aktif.';
    }
    return busiest + ' paling membutuhkan perhatianmu minggu ini (' + count + ' tugas aktif).';
  }

  /* ══════════════════════════════════════════════════════════
     PLUGIN KUSTOM: TEKS PERSENTASE DI TENGAH DOUGHNUT
  ══════════════════════════════════════════════════════════ */
  var centerTextPlugin = {
    id: 'centerText',
    afterDraw: function (chart) {
      if (chart.config.type !== 'doughnut') return;
      var ctx    = chart.ctx;
      var width  = chart.width;
      var height = chart.height;
      var pct    = chart.config.data._pct || 0;

      ctx.save();
      /* Teks persen besar */
      ctx.font = 'bold ' + Math.round(width * 0.13) + 'px ui-monospace, SFMono-Regular, Consolas, monospace';
      ctx.fillStyle = COLOR.text;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(pct + '%', width / 2, height / 2 - (height * 0.04));

      /* Teks sub-label */
      ctx.font = (Math.round(width * 0.065)) + 'px -apple-system, "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#94a3b8'; /* slate-400 */
      ctx.fillText('selesai', width / 2, height / 2 + (height * 0.1));
      ctx.restore();
    }
  };

  /* Daftarkan plugin — hanya jika Chart.js sudah ada */
  function _registerPlugin() {
    if (typeof Chart !== 'undefined' && Chart.register) {
      Chart.register(centerTextPlugin);
    }
  }

  /* ══════════════════════════════════════════════════════════
     INISIALISASI DOUGHNUT CHART
  ══════════════════════════════════════════════════════════ */
  function _initDoughnut(tasks) {
    var canvas = document.getElementById('chart-doughnut');
    if (!canvas) return;

    var sd = _buildStatusData(tasks);

    /* Perbarui aria-label secara dinamis */
    canvas.setAttribute('aria-label',
      'Grafik donat: ' + sd.done + ' tugas selesai, ' +
      sd.active + ' aktif, ' + sd.overdue + ' terlambat. ' +
      'Tingkat penyelesaian: ' + sd.pct + '%.');

    var cfg = {
      type: 'doughnut',
      data: {
        _pct: sd.pct, /* digunakan plugin centerText */
        labels: ['Selesai', 'Aktif', 'Terlambat'],
        datasets: [{
          data: [sd.done, sd.active, sd.overdue],
          backgroundColor: [COLOR.emerald, COLOR.indigo, COLOR.rose],
          borderColor:     [COLOR.emeraldBorder, COLOR.indigoBorder, COLOR.roseBorder],
          borderWidth: 1.5,
          hoverOffset: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '68%',
        animation: { duration: 600, easing: 'easeInOutQuart' },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              color: COLOR.text,
              font: { family: '-apple-system, "Segoe UI", system-ui, sans-serif', size: 12 },
              padding: 16,
              usePointStyle: true,
              pointStyleWidth: 10
            }
          },
          tooltip: {
            backgroundColor: COLOR.tooltip,
            borderColor: 'rgba(255,255,255,0.75)',
            borderWidth: 1.5,
            titleColor: COLOR.text,
            bodyColor: '#64748b',
            padding: 10,
            cornerRadius: 12,
            boxPadding: 4,
            callbacks: {
              label: function (ctx) {
                var val = ctx.raw;
                var pct = sd.total ? Math.round((val / sd.total) * 100) : 0;
                return ' ' + val + ' tugas (' + pct + '%)';
              }
            }
          }
        }
      }
    };

    _doughnutChart = new Chart(canvas, cfg);
  }

  /* ══════════════════════════════════════════════════════════
     INISIALISASI BAR CHART
  ══════════════════════════════════════════════════════════ */
  function _initBar(tasks) {
    var canvas = document.getElementById('chart-bar');
    if (!canvas) return;

    var cd      = _buildCourseData(tasks);
    var insight = _buildInsight(cd, tasks);

    /* Warna bar: sorot mat.kul. terbanyak dengan indigo, lainnya emerald */
    var bgColors = cd.labels.map(function (_, i) {
      return i === cd.maxIdx ? COLOR.indigo : COLOR.emerald;
    });
    var borderColors = cd.labels.map(function (_, i) {
      return i === cd.maxIdx ? COLOR.indigoBorder : COLOR.emeraldBorder;
    });

    /* Perbarui aria-label */
    canvas.setAttribute('aria-label',
      'Grafik batang beban akademis per mata kuliah. ' +
      cd.labels.map(function (l, i) {
        return l + ': ' + cd.counts[i] + ' tugas';
      }).join(', ') + '.');

    /* Perbarui insight text */
    var insightEl = document.getElementById('chart-bar-insight');
    if (insightEl) insightEl.textContent = insight;

    var cfg = {
      type: 'bar',
      data: {
        labels: cd.labels,
        datasets: [{
          label: 'Tugas Aktif',
          data: cd.counts,
          backgroundColor: bgColors,
          borderColor: borderColors,
          borderWidth: 1.5,
          borderRadius: 10,          /* bar membulat */
          borderSkipped: false       /* agar semua sudut membulat */
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeInOutQuart' },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: COLOR.text,
              font: { family: '-apple-system, "Segoe UI", system-ui, sans-serif', size: 11 },
              /* Potong label panjang di mobile */
              callback: function (value, index) {
                var lbl = cd.labels[index] || '';
                return lbl.length > 14 ? lbl.slice(0, 13) + '…' : lbl;
              }
            },
            border: { display: false }
          },
          y: {
            beginAtZero: true,
            grid: {
              color: COLOR.grid,
              drawBorder: false
            },
            ticks: {
              color: '#94a3b8',
              stepSize: 1,
              precision: 0,
              font: { size: 11 }
            },
            border: { display: false }
          }
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: COLOR.tooltip,
            borderColor: 'rgba(255,255,255,0.75)',
            borderWidth: 1.5,
            titleColor: COLOR.text,
            bodyColor: '#64748b',
            padding: 10,
            cornerRadius: 12,
            boxPadding: 4,
            callbacks: {
              title: function (ctx) { return ctx[0].label; },
              label: function (ctx) {
                return ' ' + ctx.raw + ' tugas aktif';
              }
            }
          }
        }
      }
    };

    _barChart = new Chart(canvas, cfg);
  }

  /* ══════════════════════════════════════════════════════════
     UPDATE (tanpa destroy-recreate)
  ══════════════════════════════════════════════════════════ */

  /**
   * Perbarui kedua grafik saat data berubah.
   * Menggunakan .update() pada instance yang sudah ada — tidak ada memory leak.
   */
  function _updateCharts(tasks) {
    _updateDoughnut(tasks);
    _updateBar(tasks);
    _updateAccessibilityTables(tasks);
  }

  function _updateDoughnut(tasks) {
    if (!_doughnutChart) return;
    var sd = _buildStatusData(tasks);

    _doughnutChart.data._pct                       = sd.pct;
    _doughnutChart.data.datasets[0].data           = [sd.done, sd.active, sd.overdue];
    _doughnutChart.config.options.plugins.tooltip.callbacks.label = function (ctx) {
      var val = ctx.raw;
      var pct = sd.total ? Math.round((val / sd.total) * 100) : 0;
      return ' ' + val + ' tugas (' + pct + '%)';
    };

    var canvas = document.getElementById('chart-doughnut');
    if (canvas) {
      canvas.setAttribute('aria-label',
        'Grafik donat: ' + sd.done + ' tugas selesai, ' +
        sd.active + ' aktif, ' + sd.overdue + ' terlambat. ' +
        'Tingkat penyelesaian: ' + sd.pct + '%.');
    }
    _updateSrTable('sr-table-doughnut', [
      { label: 'Selesai', value: sd.done },
      { label: 'Aktif', value: sd.active },
      { label: 'Terlambat', value: sd.overdue }
    ]);

    _doughnutChart.update();
  }

  function _updateBar(tasks) {
    if (!_barChart) return;
    var cd      = _buildCourseData(tasks);
    var insight = _buildInsight(cd, tasks);

    var bgColors = cd.labels.map(function (_, i) {
      return i === cd.maxIdx ? COLOR.indigo : COLOR.emerald;
    });
    var borderColors = cd.labels.map(function (_, i) {
      return i === cd.maxIdx ? COLOR.indigoBorder : COLOR.emeraldBorder;
    });

    _barChart.data.labels                              = cd.labels;
    _barChart.data.datasets[0].data                   = cd.counts;
    _barChart.data.datasets[0].backgroundColor        = bgColors;
    _barChart.data.datasets[0].borderColor            = borderColors;
    _barChart.config.options.scales.x.ticks.callback  = function (value, index) {
      var lbl = cd.labels[index] || '';
      return lbl.length > 14 ? lbl.slice(0, 13) + '…' : lbl;
    };
    _barChart.config.options.plugins.tooltip.callbacks.label = function (ctx) {
      return ' ' + ctx.raw + ' tugas aktif';
    };

    var canvas = document.getElementById('chart-bar');
    if (canvas) {
      canvas.setAttribute('aria-label',
        'Grafik batang beban akademis per mata kuliah. ' +
        cd.labels.map(function (l, i) { return l + ': ' + cd.counts[i] + ' tugas'; }).join(', ') + '.');
    }
    var insightEl = document.getElementById('chart-bar-insight');
    if (insightEl) insightEl.textContent = insight;

    _updateSrTable('sr-table-bar', cd.labels.map(function (l, i) {
      return { label: l, value: cd.counts[i] + ' tugas aktif' };
    }));

    _barChart.update();
  }

  /* ══════════════════════════════════════════════════════════
     TABEL AKSESIBILITAS (tersembunyi secara visual)
  ══════════════════════════════════════════════════════════ */
  function _updateSrTable(tableId, rows) {
    var tbl = document.getElementById(tableId);
    if (!tbl) return;
    var html = '<tbody>';
    rows.forEach(function (r) {
      html += '<tr><td>' + _esc(String(r.label)) + '</td><td>' + _esc(String(r.value)) + '</td></tr>';
    });
    html += '</tbody>';
    /* Ganti hanya tbody untuk menghindari layout shift */
    var existing = tbl.querySelector('tbody');
    if (existing) {
      existing.outerHTML = html;
    } else {
      tbl.insertAdjacentHTML('beforeend', html);
    }
  }

  /* ══════════════════════════════════════════════════════════
     EMPTY STATE
  ══════════════════════════════════════════════════════════ */
  function _showEmptyState(containerId, message) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML =
      '<div class="chart-empty-state">' +
      '  <svg class="w-12 h-12 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">' +
      '    <path stroke-linecap="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" stroke-width="1.5"/>' +
      '  </svg>' +
      '  <p>' + _esc(message) + '</p>' +
      '</div>';
  }

  function _showOfflineFallback(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML =
      '<div class="chart-empty-state">' +
      '  <svg class="w-12 h-12 opacity-25" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">' +
      '    <path stroke-linecap="round" d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M6 18l12-12" stroke-width="1.5"/>' +
      '  </svg>' +
      '  <p>Grafik tidak dapat dimuat.<br><span class="text-slate-400">Periksa koneksi internet untuk memuat Chart.js.</span></p>' +
      '</div>';
  }

  /* ══════════════════════════════════════════════════════════
     UTIL
  ══════════════════════════════════════════════════════════ */
  function _esc(str) {
    return String(str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  /* Sinkronisasi tabel aksesibilitas saat init */
  function _updateAccessibilityTables(tasks) {
    var sd = _buildStatusData(tasks);
    var cd = _buildCourseData(tasks);
    _updateSrTable('sr-table-doughnut', [
      { label: 'Selesai',   value: sd.done    },
      { label: 'Aktif',     value: sd.active  },
      { label: 'Terlambat', value: sd.overdue }
    ]);
    _updateSrTable('sr-table-bar', cd.labels.map(function (l, i) {
      return { label: l, value: cd.counts[i] + ' tugas aktif' };
    }));
  }

  /* ══════════════════════════════════════════════════════════
     ENTRY POINT PUBLIK
  ══════════════════════════════════════════════════════════ */

  /**
   * init(tasks) — Inisialisasi kedua grafik.
   * Dipanggil oleh analitik.js setelah data dimuat.
   */
  function init(tasks) {
    /* Guard: harus berjalan di halaman analitik */
    if (document.body.dataset.page !== 'analitik') return;

    /* Cek apakah Chart.js tersedia */
    if (typeof Chart === 'undefined') {
      _showOfflineFallback('chart-doughnut-container');
      _showOfflineFallback('chart-bar-container');
      console.warn('[Charts] Chart.js tidak ditemukan — mode offline.');
      return;
    }

    _registerPlugin();

    /* Konfigurasi default Chart.js agar selaras tema */
    Chart.defaults.font.family = '-apple-system, "Segoe UI", system-ui, sans-serif';
    Chart.defaults.color        = COLOR.text;

    /* Empty state bila tidak ada data sama sekali */
    if (!tasks || !tasks.length) {
      _showEmptyState('chart-doughnut-container', 'Belum ada tugas. Tambahkan tugas pertamamu!');
      _showEmptyState('chart-bar-container', 'Belum ada tugas. Data akan muncul di sini.');
      return;
    }

    /* Init grafik */
    _initDoughnut(tasks);
    _initBar(tasks);
    _updateAccessibilityTables(tasks);
  }

  /**
   * update(tasks) — Perbarui kedua grafik saat data berubah.
   * Jika instance belum ada (grafik belum pernah di-init), panggil init.
   */
  function update(tasks) {
    if (document.body.dataset.page !== 'analitik') return;
    if (!_doughnutChart || !_barChart) {
      /* Instance hilang (jarang terjadi) — init ulang */
      init(tasks);
      return;
    }
    _updateCharts(tasks);
  }

  /* ══════════════════════════════════════════════════════════
     EKSPOR PUBLIK
  ══════════════════════════════════════════════════════════ */
  window.Charts = {
    init:   init,
    update: update
  };

})();
