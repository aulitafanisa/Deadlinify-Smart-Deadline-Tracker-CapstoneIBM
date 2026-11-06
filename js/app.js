/**
 * app.js — Deadlinify
 * Logika spesifik halaman Tugas (tugas.html).
 * Berisi: form tambah tugas, countdown cards real-time, filter chips,
 *         toggle selesai, hapus dengan popover konfirmasi, statistik.
 *
 * Hanya berjalan di halaman dengan data-page="tugas".
 * Komponen bersama (navbar, dock, notifikasi) diinisialisasi oleh layout.js.
 */

document.addEventListener('DOMContentLoaded', function () {
  'use strict';

  /* Guard: hanya jalankan di halaman tugas */
  if (document.body.dataset.page !== 'tugas') return;

  /* ══════════════════════════════════════════════════════════
     STATE MODULE-LEVEL
  ══════════════════════════════════════════════════════════ */
  var _currentFilter = 'all';   // filter aktif saat ini

  /* ══════════════════════════════════════════════════════════
     1. INISIALISASI — Seed data, render, mulai timer
  ══════════════════════════════════════════════════════════ */
  Storage.seedFromJson(function (tasks) {
    renderCountdownCards(tasks);
    updateStats(tasks);
    // Timer hanya berjalan di halaman yang memiliki kartu countdown
    Timer.start();
    // Notifikasi diinisialisasi di layout.js; di sini hanya pastikan penjadwal jalan
    Notif.init();
  });

  /* ══════════════════════════════════════════════════════════
     2. TICKER — update hanya text node tiap detik (tidak rebuild DOM)
  ══════════════════════════════════════════════════════════ */
  Timer.onTick(function () {
    // Iterasi semua kartu yang sedang tampil
    var cards = document.querySelectorAll('.countdown-card[data-deadline]');
    cards.forEach(function (card) {
      var deadline  = card.dataset.deadline;
      var completed = card.dataset.completed === 'true';
      var displayEl = card.querySelector('.countdown-display');
      if (!displayEl) return;

      if (completed) {
        displayEl.textContent = 'Selesai';
        return;
      }

      var ms    = Timer.msRemaining(deadline);
      var phase = Timer.getUrgencyLevel(deadline);
      var text  = Timer.formatRemaining(ms);

      // Perbarui text node saja (efisien, tanpa reflow)
      if (displayEl.textContent !== text) {
        displayEl.textContent = text;
      }

      // Perbarui kelas fase kartu jika berubah (misalnya baru masuk critical)
      var phaseClasses = ['phase-safe', 'phase-warning', 'phase-critical', 'phase-overdue'];
      var targetClass  = 'phase-' + phase;
      if (!card.classList.contains(targetClass)) {
        phaseClasses.forEach(function (c) { card.classList.remove(c); });
        card.classList.add(targetClass);
        // Perbarui kelas fase pada display juga
        displayEl.className = 'countdown-display ' + (completed ? 'is-done' : targetClass);
        // Perbarui phase-badge
        var badge = card.querySelector('.phase-badge');
        if (badge) {
          badge.className = 'phase-badge ' + phase;
          badge.innerHTML = _phaseBadgeHTML(phase);
        }
      }
    });
  });

  /* ══════════════════════════════════════════════════════════
     3. FORM — Validasi & Submit (identik dengan Langkah 2)
  ══════════════════════════════════════════════════════════ */
  var form = document.getElementById('task-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (!validateForm()) return;

      var formData = collectFormData();
      var newTask  = Storage.addTask(formData);
      var allTasks = Storage.loadTasks();

      renderCountdownCards(allTasks);
      updateStats(allTasks);

      document.dispatchEvent(new CustomEvent('tasks:changed', {
        detail: { action: 'add', task: newTask, tasks: allTasks }
      }));

      showToast('Tugas berhasil ditambahkan!', 'success');
      resetForm();
    });
  }

  /* ══════════════════════════════════════════════════════════
     4. FILTER CHIPS
  ══════════════════════════════════════════════════════════ */
  var filterContainer = document.getElementById('filter-chips');
  if (filterContainer) {
    filterContainer.addEventListener('click', function (e) {
      var btn = e.target.closest('.filter-chip');
      if (!btn) return;

      _currentFilter = btn.dataset.filter;

      // Perbarui aria-pressed & class aktif
      filterContainer.querySelectorAll('.filter-chip').forEach(function (b) {
        var isActive = b.dataset.filter === _currentFilter;
        b.classList.toggle('active', isActive);
        b.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });

      // Re-render dengan filter baru
      renderCountdownCards(Storage.loadTasks());
    });
  }

  /* ══════════════════════════════════════════════════════════
     5. AKSI KARTU — Toggle Selesai & Hapus (event delegation)
  ══════════════════════════════════════════════════════════ */
  var grid = document.getElementById('countdown-grid');
  if (grid) {
    grid.addEventListener('click', function (e) {
      var checkBtn  = e.target.closest('.btn-check');
      var deleteBtn = e.target.closest('.btn-delete');
      var confirmBtn = e.target.closest('.popover-btn.confirm');
      var cancelBtn  = e.target.closest('.popover-btn.cancel');

      /* ── Konfirmasi hapus ── */
      if (confirmBtn) {
        var card = confirmBtn.closest('.countdown-card');
        if (!card) return;
        _removeCard(card.dataset.id, card);
        return;
      }

      /* ── Batal hapus ── */
      if (cancelBtn) {
        var popover = cancelBtn.closest('.delete-popover');
        if (popover) popover.remove();
        return;
      }

      /* ── Toggle selesai ── */
      if (checkBtn) {
        var card = checkBtn.closest('.countdown-card');
        if (!card) return;
        _toggleTask(card.dataset.id, card);
        return;
      }

      /* ── Tampilkan popover konfirmasi hapus ── */
      if (deleteBtn) {
        // Tutup popover lain yang mungkin terbuka
        document.querySelectorAll('.delete-popover').forEach(function (p) { p.remove(); });

        var card = deleteBtn.closest('.countdown-card');
        if (!card) return;

        var popover = document.createElement('div');
        popover.className = 'delete-popover';
        popover.setAttribute('role', 'dialog');
        popover.setAttribute('aria-modal', 'true');
        popover.setAttribute('aria-label', 'Konfirmasi hapus tugas');
        popover.innerHTML =
          '<p>Hapus tugas ini permanen?</p>' +
          '<div class="popover-actions">' +
          '  <button class="popover-btn confirm" type="button" aria-label="Ya, hapus tugas">Hapus</button>' +
          '  <button class="popover-btn cancel"  type="button" aria-label="Batal hapus">Batal</button>' +
          '</div>';

        // Kartu harus position:relative (sudah dari CSS)
        card.appendChild(popover);

        // Fokus ke tombol konfirmasi
        setTimeout(function () {
          var cf = popover.querySelector('.confirm');
          if (cf) cf.focus();
        }, 50);
        return;
      }
    });

    // Tutup popover bila klik di luar kartu
    document.addEventListener('click', function (e) {
      if (!e.target.closest('.countdown-card')) {
        document.querySelectorAll('.delete-popover').forEach(function (p) { p.remove(); });
      }
    });

    // Tutup popover dengan Escape
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        document.querySelectorAll('.delete-popover').forEach(function (p) { p.remove(); });
      }
    });
  }

  /* ══════════════════════════════════════════════════════════
     6. RENDER COUNTDOWN CARDS
  ══════════════════════════════════════════════════════════ */
  /**
   * Render semua kartu countdown ke #countdown-grid dengan animasi enter.
   * Diurutkan: tugas aktif → deadline terdekat; selesai di bawah.
   * @param {Array} tasks - array task dari Storage.loadTasks()
   */
  function renderCountdownCards(tasks) {
    var gridEl = document.getElementById('countdown-grid');
    if (!gridEl) return;

    // Terapkan filter
    var filtered = _applyFilter(tasks, _currentFilter);

    // Urutkan: aktif (deadline terdekat) dahulu, selesai di bawah
    filtered = filtered.slice().sort(function (a, b) {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.deadline) - new Date(b.deadline);
    });

    if (filtered.length === 0) {
      gridEl.innerHTML = _emptyStateHTML(_currentFilter);
      return;
    }

    gridEl.innerHTML = '';
    filtered.forEach(function (task) {
      var cardEl = _buildCard(task);
      gridEl.appendChild(cardEl);
      // Trigger animasi masuk
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          cardEl.classList.add('entering');
        });
      });
    });
  }

  /* ── Bangun elemen kartu countdown ─────────────────────── */
  function _buildCard(task) {
    var completed = task.completed;
    var ms        = Timer.msRemaining(task.deadline);
    var phase     = completed ? 'done' : Timer.getUrgencyLevel(task.deadline);

    var dl     = new Date(task.deadline);
    var dlStr  = dl.toLocaleDateString('id-ID', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    var priorityClass = (task.priority || 'Low').toLowerCase();
    var countdownText = completed ? 'Selesai' : Timer.formatRemaining(ms);
    var countdownDisplayClass = 'countdown-display ' + (completed ? 'is-done' : 'phase-' + phase);

    var card = document.createElement('article');
    card.className = 'countdown-card phase-' + phase + (completed ? ' is-done' : '');
    card.setAttribute('data-id',        task.id);
    card.setAttribute('data-deadline',  task.deadline);
    card.setAttribute('data-completed', completed ? 'true' : 'false');
    card.setAttribute('role',           'listitem');
    card.setAttribute('aria-label',     task.title + (completed ? ' — selesai' : ''));

    card.innerHTML =
      /* Strip prioritas kiri */
      '<div class="priority-strip ' + priorityClass + '" aria-hidden="true"></div>' +

      /* Baris atas: badge tipe + badge mata kuliah + tombol aksi */
      '<div class="flex items-start justify-between gap-2 mb-2">' +
      '  <div class="flex flex-wrap gap-1">' +
      '    <span class="badge-type">'   + escapeHtml(task.type)   + '</span>' +
      '    <span class="badge-course" title="' + escapeAttr(task.course) + '">' + escapeHtml(task.course) + '</span>' +
      '  </div>' +
      '  <div class="flex items-center gap-1 shrink-0">' +
      '    <button class="card-action-btn btn-check"' +
      '            type="button"' +
      '            aria-label="' + (completed ? 'Tandai belum selesai: ' : 'Tandai selesai: ') + escapeAttr(task.title) + '"' +
      '            aria-pressed="' + (completed ? 'true' : 'false') + '">' +
      '      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" aria-hidden="true">' +
      '        <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>' +
      '      </svg>' +
      '    </button>' +
      '    <button class="card-action-btn btn-delete"' +
      '            type="button"' +
      '            aria-label="Hapus tugas: ' + escapeAttr(task.title) + '">' +
      '      <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '        <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>' +
      '      </svg>' +
      '    </button>' +
      '  </div>' +
      '</div>' +

      /* Judul tugas */
      '<h4 class="card-title text-sm font-semibold text-slate-800 leading-snug mb-2">' +
        escapeHtml(task.title) +
      '</h4>' +

      /* Baris bawah: tanggal deadline + countdown + phase badge */
      '<div class="flex items-end justify-between gap-2 flex-wrap">' +
      '  <div>' +
      '    <p class="text-xs text-slate-400 mb-0.5">Deadline</p>' +
      '    <p class="text-xs font-medium text-slate-600">' + dlStr + '</p>' +
      '  </div>' +
      '  <div class="flex flex-col items-end gap-1">' +
      '    <span class="' + countdownDisplayClass + '" aria-live="off" aria-atomic="true">' + countdownText + '</span>' +
      '    <span class="phase-badge ' + phase + '">' + _phaseBadgeHTML(phase) + '</span>' +
      '  </div>' +
      '</div>';

    return card;
  }

  /* ── HTML konten badge fase (teks + ikon, BUKAN warna saja) ── */
  function _phaseBadgeHTML(phase) {
    var map = {
      safe:     '<svg class="w-3 h-3" fill="none" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path stroke-linecap="round" d="M5 8l2 2 4-3" stroke="currentColor" stroke-width="1.5"/></svg> Aman',
      warning:  '<svg class="w-3 h-3" fill="none" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2L14 13H2L8 2z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6v3M8 11v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Segera',
      critical: '<svg class="w-3 h-3" fill="none" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v3M8 10v.5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Kritis',
      overdue:  '<svg class="w-3 h-3" fill="none" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 5.5l5 5M10.5 5.5l-5 5" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg> Terlambat',
      done:     '<svg class="w-3 h-3" fill="none" viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" stroke-width="1.5"/><path stroke-linecap="round" d="M5 8l2 2 4-3" stroke="currentColor" stroke-width="1.5"/></svg> Selesai'
    };
    return map[phase] || map.safe;
  }

  /* ── Empty state HTML ─────────────────────────────────────── */
  function _emptyStateHTML(filter) {
    var messages = {
      all:    'Belum ada tugas. Tambahkan tugas baru lewat form di atas!',
      active: 'Tidak ada tugas aktif saat ini.',
      done:   'Belum ada tugas yang selesai.',
      High:   'Tidak ada tugas prioritas Tinggi.',
      Medium: 'Tidak ada tugas prioritas Sedang.',
      Low:    'Tidak ada tugas prioritas Rendah.'
    };
    var msg = messages[filter] || messages.all;
    return (
      '<div class="countdown-empty" role="status">' +
      /* IMAGE SLOT: countdown-empty-state, ukuran ideal 280×180px */
      /* Path: assets/empty-deadline.svg | Fallback: SVG inline di bawah */
      '  <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '    <circle cx="40" cy="40" r="36" stroke="currentColor" stroke-width="2"/>' +
      '    <path d="M40 22v20l12 8" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '    <circle cx="40" cy="40" r="3" fill="currentColor"/>' +
      '  </svg>' +
      '  <p>' + escapeHtml(msg) + '</p>' +
      '</div>'
    );
  }

  /* ── Filter tasks ─────────────────────────────────────────── */
  function _applyFilter(tasks, filter) {
    if (filter === 'all')    return tasks;
    if (filter === 'active') return tasks.filter(function (t) { return !t.completed; });
    if (filter === 'done')   return tasks.filter(function (t) { return t.completed; });
    // Prioritas
    return tasks.filter(function (t) { return t.priority === filter; });
  }

  /* ═══════════════════════════════════════════════════════════
     AKSI HAPUS & TOGGLE (dengan animasi exit)
  ═══════════════════════════════════════════════════════════ */

  /** Hapus tugas: animasikan keluar lalu hapus dari storage & DOM */
  function _removeCard(id, cardEl) {
    // Tutup popover
    var pop = cardEl.querySelector('.delete-popover');
    if (pop) pop.remove();

    cardEl.classList.add('exiting');
    cardEl.addEventListener('animationend', function () {
      Storage.deleteTask(id);
      cardEl.remove();
      var allTasks = Storage.loadTasks();
      updateStats(allTasks);
      // Jika grid kosong setelah hapus, tampilkan empty state
      var gridEl = document.getElementById('countdown-grid');
      if (gridEl && gridEl.children.length === 0) {
        gridEl.innerHTML = _emptyStateHTML(_currentFilter);
      }
      document.dispatchEvent(new CustomEvent('tasks:changed', {
        detail: { action: 'delete', id: id, tasks: allTasks }
      }));
      showToast('Tugas dihapus.', 'info');
    }, { once: true });
  }

  /** Toggle selesai: perbarui data, animasikan transisi kartu */
  function _toggleTask(id, cardEl) {
    var updatedTask = Storage.toggleTask(id);
    var allTasks    = Storage.loadTasks();
    updateStats(allTasks);

    // Perbarui atribut data kartu
    cardEl.dataset.completed = updatedTask.completed ? 'true' : 'false';

    var nowDone = updatedTask.completed;
    cardEl.classList.toggle('is-done', nowDone);

    // Perbarui aria-label & aria-pressed tombol
    var checkBtn = cardEl.querySelector('.btn-check');
    if (checkBtn) {
      checkBtn.setAttribute('aria-pressed', nowDone ? 'true' : 'false');
      checkBtn.setAttribute('aria-label',
        (nowDone ? 'Tandai belum selesai: ' : 'Tandai selesai: ') + (updatedTask.title || ''));
    }

    // Perbarui phase classes
    var phase = nowDone ? 'done' : Timer.getUrgencyLevel(updatedTask.deadline);
    var phaseClasses = ['phase-safe', 'phase-warning', 'phase-critical', 'phase-overdue', 'phase-done'];
    phaseClasses.forEach(function (c) { cardEl.classList.remove(c); });
    if (!nowDone) cardEl.classList.add('phase-' + phase);

    // Perbarui display teks + badge
    var displayEl = cardEl.querySelector('.countdown-display');
    if (displayEl) {
      displayEl.className = 'countdown-display ' + (nowDone ? 'is-done' : 'phase-' + phase);
      displayEl.textContent = nowDone ? 'Selesai' : Timer.formatRemaining(Timer.msRemaining(updatedTask.deadline));
    }
    var badge = cardEl.querySelector('.phase-badge');
    if (badge) {
      badge.className = 'phase-badge ' + phase;
      badge.innerHTML = _phaseBadgeHTML(phase);
    }

    // Judul dicoret/tidak
    var titleEl = cardEl.querySelector('.card-title');
    if (titleEl) {
      titleEl.style.textDecoration = nowDone ? 'line-through' : '';
    }

    document.dispatchEvent(new CustomEvent('tasks:changed', {
      detail: { action: 'toggle', task: updatedTask, tasks: allTasks }
    }));

    showToast(
      nowDone ? 'Tugas ditandai selesai!' : 'Tugas diaktifkan kembali.',
      nowDone ? 'success' : 'info'
    );
  }

  /* ══════════════════════════════════════════════════════════
     7. STATISTIK HERO (diperbarui langsung setiap perubahan)
  ══════════════════════════════════════════════════════════ */
  function updateStats(tasks) {
    if (!tasks) tasks = Storage.loadTasks();
    var now    = Date.now();
    var active = 0, soon = 0, done = 0;

    tasks.forEach(function (t) {
      if (t.completed) {
        done++;
      } else {
        active++;
        var diff = new Date(t.deadline).getTime() - now;
        if (diff > 0 && diff < 72 * 60 * 60 * 1000) { soon++; }
      }
    });

    var elActive = document.getElementById('stat-active');
    var elSoon   = document.getElementById('stat-soon');
    var elDone   = document.getElementById('stat-done');
    if (elActive) elActive.textContent = active;
    if (elSoon)   elSoon.textContent   = soon;
    if (elDone)   elDone.textContent   = done;

    /* Perbarui statistik ringkas di kartu promo analitik */
    var now2    = Date.now();
    var total   = tasks.length;
    var overdue = tasks.filter(function (t) {
      return !t.completed && new Date(t.deadline).getTime() < now2;
    }).length;
    var elT = document.getElementById('tugas-stat-total');
    var elD = document.getElementById('tugas-stat-done');
    var elO = document.getElementById('tugas-stat-overdue');
    if (elT) elT.textContent = total;
    if (elD) elD.textContent = done;
    if (elO) elO.textContent = overdue;
  }

  /* ══════════════════════════════════════════════════════════
     8. FORM — Helper Functions (sama dengan Langkah 2)
  ══════════════════════════════════════════════════════════ */
  function collectFormData() {
    return {
      title:    document.getElementById('input-title').value.trim(),
      course:   document.getElementById('input-course').value.trim(),
      type:     document.getElementById('input-type').value,
      deadline: new Date(document.getElementById('input-deadline').value).toISOString(),
      priority: (document.querySelector('input[name="priority"]:checked') || {}).value || ''
    };
  }

  function validateForm() {
    var valid = true;
    function setError(inputId, errorId, msg) {
      var input = document.getElementById(inputId);
      var span  = document.getElementById(errorId);
      if (!span) return;
      span.textContent = msg;
      if (input) {
        if (msg) { input.setAttribute('aria-invalid', 'true'); }
        else     { input.removeAttribute('aria-invalid'); }
      }
      if (msg) valid = false;
    }

    var title = document.getElementById('input-title').value.trim();
    setError('input-title', 'error-title',
      title === '' ? 'Judul tugas tidak boleh kosong.' : '');

    var course = document.getElementById('input-course').value.trim();
    setError('input-course', 'error-course',
      course === '' ? 'Nama mata kuliah tidak boleh kosong.' : '');

    var type = document.getElementById('input-type').value;
    setError('input-type', 'error-type',
      type === '' ? 'Silakan pilih tipe tugas.' : '');

    var deadlineInput = document.getElementById('input-deadline').value;
    var deadlineSpan  = document.getElementById('error-deadline');
    var deadlineEl    = document.getElementById('input-deadline');
    if (!deadlineInput) {
      deadlineSpan.textContent = 'Tanggal dan jam deadline wajib diisi.';
      deadlineEl.setAttribute('aria-invalid', 'true');
      valid = false;
    } else {
      var picked = new Date(deadlineInput);
      if (picked <= new Date()) {
        deadlineSpan.textContent = 'Deadline harus di masa mendatang.';
        deadlineEl.setAttribute('aria-invalid', 'true');
        valid = false;
      } else {
        deadlineSpan.textContent = '';
        deadlineEl.removeAttribute('aria-invalid');
      }
    }

    var checkedPriority = document.querySelector('input[name="priority"]:checked');
    var errorPriority   = document.getElementById('error-priority');
    if (!checkedPriority) {
      errorPriority.textContent = 'Pilih salah satu tingkat prioritas.';
      valid = false;
    } else {
      errorPriority.textContent = '';
    }

    return valid;
  }

  function resetForm() {
    form.reset();
    ['error-title', 'error-course', 'error-type', 'error-deadline', 'error-priority']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.textContent = '';
      });
    ['input-title', 'input-course', 'input-type', 'input-deadline']
      .forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.removeAttribute('aria-invalid');
      });
    var firstInput = document.getElementById('input-title');
    if (firstInput) firstInput.focus();
  }

  /* ══════════════════════════════════════════════════════════
     9. TOAST KACA
  ══════════════════════════════════════════════════════════ */
  function showToast(message, type, duration) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    duration = duration || 3000;
    var icons = { success: '✅', warning: '⚠️', error: '❌', info: 'ℹ️' };
    var icon  = icons[type] || icons.info;

    var toast = document.createElement('div');
    toast.className = 'toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML =
      '<span class="toast-icon" aria-hidden="true">' + icon + '</span>' +
      '<span>' + escapeHtml(message) + '</span>';
    container.appendChild(toast);

    setTimeout(function () {
      toast.classList.add('removing');
      toast.addEventListener('animationend', function () { toast.remove(); }, { once: true });
    }, duration);
  }
  window.showToast = showToast;

  /* ══════════════════════════════════════════════════════════
     10. NAVIGASI — Link aktif berdasarkan scroll
  ══════════════════════════════════════════════════════════ */
  var sections = document.querySelectorAll('section[id]');
  var navLinks = document.querySelectorAll('[data-nav-link]');
  if (sections.length && navLinks.length) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          navLinks.forEach(function (link) {
            link.classList.remove('nav-active');
            if (link.getAttribute('href') === '#' + entry.target.id) {
              link.classList.add('nav-active');
            }
          });
        }
      });
    }, { threshold: 0.4 });
    sections.forEach(function (section) { observer.observe(section); });
  }

  document.querySelectorAll('a[href^="#"]').forEach(function (anchor) {
    anchor.addEventListener('click', function (e) {
      var target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  });

  /* ══════════════════════════════════════════════════════════
     11. EVENT tasks:changed — log, update stats, re-evaluate reminders
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('tasks:changed', function (e) {
    /* Perbarui statistik dan penjadwal notifikasi */
    if (e.detail.tasks) updateStats(e.detail.tasks);
    // Beri tahu penjadwal notifikasi agar evaluasi ulang (lewati tugas selesai/dihapus)
    if (typeof Notif !== 'undefined' && Notif.checkReminders) {
      Notif.checkReminders();
    }
  });

  /* ══════════════════════════════════════════════════════════
     12. SINKRONISASI LINTAS TAB — storage event → re-render
  ══════════════════════════════════════════════════════════ */
  document.addEventListener('tasks:sync', function () {
    var tasks = Storage.loadTasks();
    renderCountdownCards(tasks);
    updateStats(tasks);
  });

  /* ══════════════════════════════════════════════════════════
     UTIL — XSS-safe escape
  ══════════════════════════════════════════════════════════ */
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
  function escapeAttr(str) {
    return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

});
