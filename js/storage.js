/**
 * storage.js — Deadlinify
 * Lapisan abstraksi penyimpanan data tugas via localStorage.
 * Strategi: saat pertama dibuka, muat dari data.json lalu simpan ke localStorage.
 * Selanjutnya selalu baca dari localStorage. Fallback inline bila fetch gagal (file://).
 */

(function () {
  'use strict';

  /* ── Konstanta ───────────────────────────────────────────── */
  var STORAGE_KEY    = 'deadlinify_tasks';
  var SEEDED_KEY     = 'deadlinify_seeded';  // flag agar seed hanya sekali
  var DATA_JSON_PATH = 'data.json';

  /* ── Data cadangan inline (digunakan bila fetch gagal di file://) ── */
  var FALLBACK_DATA = [
    {
      id: 'task-001', title: 'Laporan Praktikum Basis Data',
      course: 'Basis Data', type: 'Tugas Harian',
      deadline: '2026-11-13T23:59:00.000Z', priority: 'High',
      completed: false, createdAt: '2026-11-01T08:00:00.000Z'
    },
    {
      id: 'task-002', title: 'UTS Algoritma dan Pemrograman',
      course: 'Algoritma dan Pemrograman', type: 'UTS',
      deadline: '2026-11-09T07:00:00.000Z', priority: 'High',
      completed: false, createdAt: '2026-11-02T10:00:00.000Z'
    },
    {
      id: 'task-003', title: 'Pretest Jaringan Komputer',
      course: 'Jaringan Komputer', type: 'Pretest',
      deadline: '2026-11-07T06:30:00.000Z', priority: 'High',
      completed: false, createdAt: '2026-11-04T09:00:00.000Z'
    },
    {
      id: 'task-004', title: 'Resume Materi Sistem Operasi Bab 4',
      course: 'Sistem Operasi', type: 'Tugas Harian',
      deadline: '2026-11-08T23:59:00.000Z', priority: 'Medium',
      completed: false, createdAt: '2026-11-03T14:00:00.000Z'
    },
    {
      id: 'task-005', title: 'Makalah Etika Profesi Teknologi Informasi',
      course: 'Etika Profesi', type: 'Tugas Harian',
      deadline: '2026-11-20T23:59:00.000Z', priority: 'Medium',
      completed: false, createdAt: '2026-11-05T11:00:00.000Z'
    },
    {
      id: 'task-006', title: 'Implementasi Sorting Algorithm',
      course: 'Struktur Data', type: 'Tugas Harian',
      deadline: '2026-11-15T23:59:00.000Z', priority: 'Low',
      completed: false, createdAt: '2026-11-04T16:00:00.000Z'
    },
    {
      id: 'task-007', title: 'Kuis Kalkulus Diferensial',
      course: 'Kalkulus', type: 'UTS',
      deadline: '2026-11-03T08:00:00.000Z', priority: 'High',
      completed: true, createdAt: '2026-10-28T07:00:00.000Z'
    },
    {
      id: 'task-008', title: 'Praktikum Fisika Dasar — Gelombang',
      course: 'Fisika Dasar', type: 'Pretest',
      deadline: '2026-11-05T10:00:00.000Z', priority: 'Medium',
      completed: true, createdAt: '2026-10-30T12:00:00.000Z'
    }
  ];

  /* ── Helper: generate UUID ───────────────────────────────── */
  function generateId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    // Fallback untuk browser lama
    return 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 9);
  }

  /* ── Baca semua tugas dari localStorage ──────────────────── */
  function loadTasks() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.warn('[Storage] Gagal membaca localStorage:', e);
      return [];
    }
  }

  /* ── Tulis array tugas ke localStorage ───────────────────── */
  function saveTasks(tasks) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
    } catch (e) {
      console.warn('[Storage] Gagal menulis localStorage:', e);
    }
  }

  /* ── Tambah satu tugas baru ──────────────────────────────── */
  function addTask(taskData) {
    var tasks = loadTasks();
    var newTask = {
      id:        generateId(),
      title:     taskData.title,
      course:    taskData.course,
      type:      taskData.type,
      deadline:  taskData.deadline,
      priority:  taskData.priority,
      completed: false,
      createdAt: new Date().toISOString()
    };
    tasks.unshift(newTask); // tugas baru di depan
    saveTasks(tasks);
    return newTask;
  }

  /* ── Hapus tugas berdasarkan id ──────────────────────────── */
  function deleteTask(id) {
    var tasks = loadTasks().filter(function (t) { return t.id !== id; });
    saveTasks(tasks);
  }

  /* ── Toggle status selesai tugas ─────────────────────────── */
  function toggleTask(id) {
    var tasks = loadTasks().map(function (t) {
      if (t.id === id) {
        return Object.assign({}, t, { completed: !t.completed });
      }
      return t;
    });
    saveTasks(tasks);
    return tasks.find(function (t) { return t.id === id; });
  }

  /* ── Seed awal: muat data.json lalu simpan ke localStorage ── */
  function seedFromJson(callback) {
    // Hanya seed sekali (flag di localStorage)
    if (localStorage.getItem(SEEDED_KEY)) {
      callback(loadTasks());
      return;
    }

    fetch(DATA_JSON_PATH)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        saveTasks(data);
        localStorage.setItem(SEEDED_KEY, '1');
        callback(data);
      })
      .catch(function () {
        /* fetch gagal (misal di file://) — gunakan data cadangan inline */
        saveTasks(FALLBACK_DATA);
        localStorage.setItem(SEEDED_KEY, '1');
        callback(FALLBACK_DATA);
      });
  }

  /* ── Ekspor API ke global window.Storage ─────────────────── */
  window.Storage = {
    loadTasks:    loadTasks,
    saveTasks:    saveTasks,
    addTask:      addTask,
    deleteTask:   deleteTask,
    toggleTask:   toggleTask,
    seedFromJson: seedFromJson
  };

})();
