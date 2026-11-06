<?php
/**
 * register.php — Deadlinify Auth
 *
 * Endpoint: POST /backend/auth/register.php
 * Content-Type: application/json
 *
 * Request body (JSON):
 *   {
 *     "name":     string (wajib, 2–120 karakter)
 *     "email":    string (wajib, format email valid)
 *     "password": string (wajib, min. 8 karakter)
 *     "npm":      string (opsional, maks. 30 karakter)
 *   }
 *
 * Response sukses (201):
 *   { "success": true, "message": "...", "user": { "id", "name", "email" } }
 *
 * Response gagal (400/409/500):
 *   { "success": false, "message": "...", "errors": { field: message } }
 */

declare(strict_types=1);

require_once __DIR__ . '/../middleware/session.php';
require_once __DIR__ . '/../middleware/csrf.php';
require_once __DIR__ . '/../config/database.php';

/* Hanya terima POST */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    header('Allow: POST');
    jsonResponse(false, 'Metode tidak diizinkan.', code: 'METHOD_NOT_ALLOWED');
}

/* Header response */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

/* Token CSRF wajib untuk mencegah request pendaftaran lintas situs. */
verifyCsrfToken();

/* ──────────────────────────────────────────────────────────
   BACA & PARSE INPUT
────────────────────────────────────────────────────────── */
$raw = file_get_contents('php://input');
$body = json_decode($raw, true);

if (!is_array($body)) {
    jsonResponse(false, 'Format request tidak valid. Kirim JSON.', status: 400, code: 'INVALID_JSON');
}

/* ──────────────────────────────────────────────────────────
   VALIDASI INPUT
────────────────────────────────────────────────────────── */
$errors = [];

/* Nama */
$name = trim($body['name'] ?? '');
if ($name === '') {
    $errors['name'] = 'Nama wajib diisi.';
} elseif (mb_strlen($name) < 2) {
    $errors['name'] = 'Nama minimal 2 karakter.';
} elseif (mb_strlen($name) > 120) {
    $errors['name'] = 'Nama maksimal 120 karakter.';
}

/* Email */
$email = trim(mb_strtolower($body['email'] ?? ''));
if ($email === '') {
    $errors['email'] = 'Email wajib diisi.';
} elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    $errors['email'] = 'Format email tidak valid.';
} elseif (mb_strlen($email) > 180) {
    $errors['email'] = 'Email terlalu panjang.';
}

/* Password */
$password = $body['password'] ?? '';
if ($password === '') {
    $errors['password'] = 'Password wajib diisi.';
} elseif (strlen($password) < 8) {
    $errors['password'] = 'Password minimal 8 karakter.';
} elseif (strlen($password) > 255) {
    $errors['password'] = 'Password terlalu panjang.';
}

/* NPM (opsional) */
$npm = trim($body['npm'] ?? '');
if ($npm !== '' && mb_strlen($npm) > 30) {
    $errors['npm'] = 'NPM maksimal 30 karakter.';
}

if (!empty($errors)) {
    jsonResponse(false, 'Data tidak lengkap atau tidak valid.', status: 422, errors: $errors);
}

/* ──────────────────────────────────────────────────────────
   CEK DUPLIKASI EMAIL
────────────────────────────────────────────────────────── */
try {
    $db   = getDB();
    $stmt = $db->prepare('SELECT id FROM users WHERE email = ? LIMIT 1');
    $stmt->execute([$email]);

    if ($stmt->fetch()) {
        /*
         * Email sudah terdaftar.
         * Gunakan pesan yang sama agar tidak membocorkan apakah email tertentu ada di sistem.
         * Untuk UX yang lebih baik di aplikasi internal, boleh diberi pesan spesifik.
         */
        jsonResponse(false, 'Email sudah terdaftar. Silakan gunakan email lain atau login.',
            status: 409, code: 'EMAIL_EXISTS');
    }
} catch (PDOException $e) {
    error_log('[Deadlinify Register] DB error saat cek email: ' . $e->getMessage());
    jsonResponse(false, 'Terjadi kesalahan server. Silakan coba lagi.', status: 500, code: 'DB_ERROR');
}

/* ──────────────────────────────────────────────────────────
   HASH PASSWORD & SIMPAN PENGGUNA
────────────────────────────────────────────────────────── */
$hashedPassword = password_hash($password, PASSWORD_BCRYPT, ['cost' => 12]);

try {
    $stmt = $db->prepare(
        'INSERT INTO users (name, email, password, npm) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([
        $name,
        $email,
        $hashedPassword,
        $npm !== '' ? $npm : null,
    ]);

    $newUserId = (int) $db->lastInsertId();
} catch (PDOException $e) {
    error_log('[Deadlinify Register] DB error saat insert user: ' . $e->getMessage());
    jsonResponse(false, 'Gagal membuat akun. Silakan coba lagi.', status: 500, code: 'DB_ERROR');
}

/* ──────────────────────────────────────────────────────────
   RESPONSE SUKSES
   Jangan sertakan password hash atau informasi sensitif lainnya.
────────────────────────────────────────────────────────── */
http_response_code(201);
echo json_encode([
    'success' => true,
    'message' => 'Akun berhasil dibuat. Silakan login.',
    'user'    => [
        'id'    => $newUserId,
        'name'  => $name,
        'email' => $email,
    ],
]);
exit;

/* ──────────────────────────────────────────────────────────
   HELPER: Kirim respons JSON dan hentikan eksekusi
────────────────────────────────────────────────────────── */
function jsonResponse(
    bool   $success,
    string $message,
    int    $status = 400,
    string $code   = '',
    array  $errors = []
): never {
    http_response_code($status);
    $payload = ['success' => $success, 'message' => $message];
    if ($code)   $payload['code']   = $code;
    if ($errors) $payload['errors'] = $errors;
    echo json_encode($payload);
    exit;
}
