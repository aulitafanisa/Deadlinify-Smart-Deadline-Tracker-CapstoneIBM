<?php
/**
 * login.php — Deadlinify Auth
 *
 * Endpoint: POST /backend/auth/login.php
 * Content-Type: application/json
 *
 * Request body (JSON):
 *   {
 *     "email":    string,
 *     "password": string
 *   }
 *
 * Response sukses (200):
 *   {
 *     "success":    true,
 *     "message":    "Login berhasil.",
 *     "user":       { "id", "name", "email" },
 *     "csrf_token": string
 *   }
 *
 * Response gagal (400/401/500):
 *   { "success": false, "message": "...", "code": "..." }
 *
 * KEAMANAN:
 *   Pesan error login sengaja dibuat generik agar tidak membocorkan
 *   apakah email tertentu terdaftar di sistem (user enumeration attack).
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/session.php';
require_once __DIR__ . '/../middleware/csrf.php';
require_once __DIR__ . '/../config/database.php';

/* Hanya terima POST */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'message' => 'Metode tidak diizinkan.', 'code' => 'METHOD_NOT_ALLOWED']);
    exit;
}

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

/* Validasi token CSRF yang diperoleh dari check.php sebelum login. */
verifyCsrfToken();

/* Jika sudah login, kembalikan data pengguna yang ada */
if (isLoggedIn()) {
    http_response_code(200);
    echo json_encode([
        'success'    => true,
        'message'    => 'Sudah login.',
        'user'       => [
            'id'    => $_SESSION['user_id'],
            'name'  => $_SESSION['user_name'],
            'email' => $_SESSION['user_email'],
        ],
        'csrf_token' => getCsrfToken(),
    ]);
    exit;
}

/* ──────────────────────────────────────────────────────────
   BACA & PARSE INPUT
────────────────────────────────────────────────────────── */
$raw  = file_get_contents('php://input');
$body = json_decode($raw, true);

if (!is_array($body)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Format request tidak valid.', 'code' => 'INVALID_JSON']);
    exit;
}

$email    = trim(mb_strtolower($body['email'] ?? ''));
$password = $body['password'] ?? '';

/* Validasi dasar — hindari query DB jika input jelas kosong */
if ($email === '' || $password === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'message' => 'Email dan password wajib diisi.', 'code' => 'MISSING_FIELDS']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    /* Pesan generik — jangan bocorkan detail validasi */
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Email atau password salah.', 'code' => 'INVALID_CREDENTIALS']);
    exit;
}

/* ──────────────────────────────────────────────────────────
   CARI PENGGUNA DI DATABASE
────────────────────────────────────────────────────────── */
try {
    $db   = getDB();
    $stmt = $db->prepare(
        'SELECT id, name, email, password FROM users WHERE email = ? LIMIT 1'
    );
    $stmt->execute([$email]);
    $user = $stmt->fetch();
} catch (PDOException $e) {
    error_log('[Deadlinify Login] DB error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['success' => false, 'message' => 'Terjadi kesalahan server. Silakan coba lagi.', 'code' => 'DB_ERROR']);
    exit;
}

/* ──────────────────────────────────────────────────────────
   VERIFIKASI PASSWORD
   Gunakan password_verify() — JANGAN bandingkan string langsung.
   Jika akun tidak ditemukan, tetap panggil password_verify() dengan
   hash dummy agar waktu respons konsisten (mencegah timing attack).
────────────────────────────────────────────────────────── */
$DUMMY_HASH = '$2y$12$invalidhashfortimingprotection000000000000000000000000';

$hashToVerify = $user ? $user['password'] : $DUMMY_HASH;
$passwordValid = password_verify($password, $hashToVerify);

if (!$user || !$passwordValid) {
    http_response_code(401);
    echo json_encode(['success' => false, 'message' => 'Email atau password salah.', 'code' => 'INVALID_CREDENTIALS']);
    exit;
}

/* ──────────────────────────────────────────────────────────
   LOGIN BERHASIL — BUAT SESSION
────────────────────────────────────────────────────────── */
sessionLogin($user);

/* Generate CSRF token untuk digunakan oleh frontend */
$csrfToken = generateCsrfToken();

/* ──────────────────────────────────────────────────────────
   RESPONSE
   Jangan sertakan password hash dalam respons.
────────────────────────────────────────────────────────── */
http_response_code(200);
echo json_encode([
    'success'    => true,
    'message'    => 'Login berhasil.',
    'user'       => [
        'id'    => $_SESSION['user_id'],
        'name'  => $_SESSION['user_name'],
        'email' => $_SESSION['user_email'],
    ],
    'csrf_token' => $csrfToken,
]);
exit;
