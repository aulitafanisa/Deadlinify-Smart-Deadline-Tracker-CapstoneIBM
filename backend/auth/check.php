<?php
/**
 * check.php — Deadlinify Auth
 *
 * Endpoint: GET /backend/auth/check.php
 *
 * Memeriksa apakah pengguna memiliki session PHP yang aktif.
 * Dipanggil oleh layout.js saat setiap halaman dimuat.
 *
 * Response authenticated (200):
 *   {
 *     "authenticated": true,
 *     "user":          { "id", "name", "email" },
 *     "csrf_token":    string
 *   }
 *
 * Response tidak login (200):
 *   {
 *     "authenticated": false,
 *     "csrf_token":    string
 *   }
 *
 * CATATAN:
 *   HTTP 200 digunakan di kedua kasus agar frontend dapat membedakan
 *   berdasarkan field "authenticated", bukan kode status HTTP.
 *   Token CSRF selalu disertakan agar frontend dapat menggunakannya
 *   untuk request login/register.
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/session.php';
require_once __DIR__ . '/../middleware/csrf.php';

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
/* Mencegah browser meng-cache status autentikasi */
header('Cache-Control: no-store, no-cache, must-revalidate');
header('Pragma: no-cache');

/* Hanya terima GET */
if ($_SERVER['REQUEST_METHOD'] !== 'GET') {
    http_response_code(405);
    header('Allow: GET');
    echo json_encode(['success' => false, 'message' => 'Metode tidak diizinkan.']);
    exit;
}

$csrfToken = getCsrfToken();

if (isLoggedIn()) {
    echo json_encode([
        'authenticated' => true,
        'user'          => [
            'id'    => $_SESSION['user_id'],
            'name'  => $_SESSION['user_name'],
            'email' => $_SESSION['user_email'],
        ],
        'csrf_token'    => $csrfToken,
    ]);
} else {
    echo json_encode([
        'authenticated' => false,
        'csrf_token'    => $csrfToken,
    ]);
}
exit;
