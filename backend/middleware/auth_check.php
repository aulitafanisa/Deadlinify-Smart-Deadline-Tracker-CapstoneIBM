<?php
/**
 * auth_check.php — Deadlinify Backend
 *
 * Middleware validasi session. Di-include di awal setiap endpoint
 * yang membutuhkan pengguna sudah login.
 *
 * Cara penggunaan di endpoint yang terproteksi:
 *   require_once __DIR__ . '/../middleware/session.php';
 *   require_once __DIR__ . '/../middleware/auth_check.php';
 *   // Jika sampai baris ini, pengguna sudah terautentikasi.
 *   // $_SESSION['user_id'] tersedia dan valid.
 *
 * PENTING — Batasan Keamanan:
 *   File PHP ini adalah perlindungan sesungguhnya.
 *   Redirect JavaScript di frontend hanya pengalaman pengguna,
 *   bukan keamanan. Endpoint ini wajib mevalidasi sendiri.
 */

declare(strict_types=1);

/* Session harus sudah diinisialisasi sebelum file ini */
if (session_status() === PHP_SESSION_NONE) {
    /*
     * Jika session belum distart, ini menandakan auth_check.php
     * dipanggil tanpa session.php terlebih dahulu — ini bug di kode pemanggil.
     * Tangani dengan aman.
     */
    require_once __DIR__ . '/session.php';
}

if (!isLoggedIn()) {
    http_response_code(401);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success'  => false,
        'message'  => 'Sesi tidak ditemukan. Silakan login kembali.',
        'code'     => 'UNAUTHENTICATED',
        'redirect' => 'login.html',
    ]);
    exit;
}

/*
 * Jika sampai sini, session valid.
 * Kode pemanggil dapat menggunakan:
 *   $_SESSION['user_id']    — ID pengguna (integer)
 *   $_SESSION['user_name']  — Nama pengguna
 *   $_SESSION['user_email'] — Email pengguna
 */
