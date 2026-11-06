<?php
/**
 * logout.php — Deadlinify Auth
 *
 * Endpoint: POST /backend/auth/logout.php
 * Header wajib: X-CSRF-Token: <token>
 *
 * Menghapus PHP Session dan cookie session.
 * Menggunakan POST (bukan GET) agar tidak dapat dipanggil
 * secara tidak sengaja melalui tag <img> atau link pihak ketiga.
 *
 * Response (200):
 *   { "success": true, "message": "Berhasil logout.", "redirect": "login.html" }
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/session.php';
require_once __DIR__ . '/../middleware/csrf.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

/* Hanya terima POST */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    echo json_encode(['success' => false, 'message' => 'Metode tidak diizinkan.', 'code' => 'METHOD_NOT_ALLOWED']);
    exit;
}

/* Jika belum login, tetap kembalikan sukses (logout idempotent) */
if (!isLoggedIn()) {
    http_response_code(200);
    echo json_encode([
        'success'  => true,
        'message'  => 'Sudah logout.',
        'redirect' => 'login.html',
    ]);
    exit;
}

/* Validasi CSRF token — wajib untuk semua operasi mutasi */
verifyCsrfToken(rotate: false); // Tidak perlu rotasi karena session akan dihapus

/* ──────────────────────────────────────────────────────────
   HAPUS SESSION
────────────────────────────────────────────────────────── */
sessionLogout();

/* ──────────────────────────────────────────────────────────
   RESPONSE
────────────────────────────────────────────────────────── */
http_response_code(200);
echo json_encode([
    'success'  => true,
    'message'  => 'Berhasil logout. Sampai jumpa!',
    'redirect' => 'login.html',
]);
exit;
