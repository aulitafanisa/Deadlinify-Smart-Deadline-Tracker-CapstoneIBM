-- ============================================================
-- Deadlinify — Schema Database Phase 2
-- Charset: utf8mb4 (mendukung emoji dan karakter Unicode penuh)
-- Engine: InnoDB (mendukung foreign key, ACID compliant)
-- Cara impor: buka phpMyAdmin → pilih database deadlinify_db → tab SQL → paste → Go
-- ============================================================

-- Pastikan database sudah dibuat sebelum menjalankan ini.
-- Jika belum, jalankan baris berikut terlebih dahulu:
-- CREATE DATABASE IF NOT EXISTS deadlinify_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE deadlinify_db;

-- ============================================================
-- Tabel: users
-- Menyimpan akun pengguna aplikasi.
-- Setiap pengguna memiliki data akademik masing-masing yang
-- terisolasi — tidak ada data bersama antar pengguna.
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id           INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    name         VARCHAR(120)    NOT NULL                  COMMENT 'Nama lengkap pengguna',
    email        VARCHAR(180)    NOT NULL                  COMMENT 'Email login — harus unik',
    password     VARCHAR(255)    NOT NULL                  COMMENT 'Hash bcrypt dari password_hash()',
    npm          VARCHAR(30)     NULL     DEFAULT NULL     COMMENT 'Nomor Pokok Mahasiswa (opsional)',
    avatar_path  VARCHAR(300)    NULL     DEFAULT NULL     COMMENT 'Path relatif foto profil (diisi saat Phase 6)',
    created_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Akun pengguna Deadlinify';

-- ============================================================
-- Indeks tambahan untuk performa pencarian email saat login
-- (sudah tercakup oleh UNIQUE KEY, tapi eksplisit lebih jelas)
-- ============================================================
-- Tidak diperlukan indeks tambahan pada fase ini.
-- email sudah diindeks melalui UNIQUE KEY uq_users_email.

-- ============================================================
-- Tabel-tabel berikutnya akan ditambahkan pada phase selanjutnya:
--   courses          — Phase 3
--   tasks            — Phase 3
--   materials        — Phase 5
--   task_attachments — Phase 5
--   pomodoro_sessions — Phase 4
--   notification_preferences — Phase 6
-- ============================================================
