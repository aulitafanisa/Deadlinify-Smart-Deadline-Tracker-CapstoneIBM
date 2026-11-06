<?php
/**
 * csrf.php — Deadlinify Backend
 *
 * Perlindungan Cross-Site Request Forgery (CSRF).
 *
 * Cara kerja:
 *   1. Frontend meminta token via GET /backend/auth/check.php
 *   2. Token disertakan dalam setiap request mutasi (POST/PATCH/DELETE)
 *      melalui header HTTP: X-CSRF-Token: <token>
 *   3. Setiap endpoint mutasi memanggil verifyCsrfToken() sebelum memproses.
 *
 * Token disimpan di $_SESSION dan dirotasi setiap kali diverifikasi
 * agar tidak dapat digunakan ulang (one-time token per request).
 *
 * CATATAN:
 *   SameSite=Lax pada cookie session sudah memberikan perlindungan dasar.
 *   CSRF token ini memberikan lapisan pertahanan kedua (defense in depth).
 */

declare(strict_types=1);

/**
 * Menghasilkan CSRF token baru dan menyimpannya di session.
 * Dipanggil sekali saat session dibuat atau token kedaluwarsa.
 *
 * @return string Token CSRF (32 byte hex = 64 karakter)
 */
function generateCsrfToken(): string
{
    $token = bin2hex(random_bytes(32));
    $_SESSION['csrf_token'] = $token;
    return $token;
}

/**
 * Mengambil CSRF token dari session yang aktif.
 * Jika belum ada, buat token baru.
 *
 * @return string
 */
function getCsrfToken(): string
{
    if (empty($_SESSION['csrf_token'])) {
        return generateCsrfToken();
    }
    return $_SESSION['csrf_token'];
}

/**
 * Memvalidasi CSRF token dari header request.
 * Token dibaca dari header X-CSRF-Token.
 *
 * @param bool $rotate Jika true, token dirotasi setelah verifikasi berhasil.
 *                     Set false untuk endpoint idempotent yang sering dipanggil.
 * @throws void — Langsung kirim respons 403 dan exit jika token tidak valid.
 */
function verifyCsrfToken(bool $rotate = true): void
{
    $headerToken = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';

    if (empty($_SESSION['csrf_token']) || empty($headerToken)) {
        _csrfFail('Token CSRF tidak ditemukan.');
    }

    /*
     * Gunakan hash_equals() untuk perbandingan yang tahan timing attack.
     * Jangan gunakan === atau == langsung untuk membandingkan token keamanan.
     */
    if (!hash_equals($_SESSION['csrf_token'], $headerToken)) {
        _csrfFail('Token CSRF tidak valid.');
    }

    /* Rotasi token agar tidak dapat digunakan ulang */
    if ($rotate) {
        generateCsrfToken();
    }
}

/**
 * Helper internal: kirim respons 403 dan hentikan eksekusi.
 *
 * @param string $reason Pesan error (untuk log server, bukan untuk client)
 */
function _csrfFail(string $reason): never
{
    error_log('[Deadlinify CSRF] Gagal: ' . $reason . ' | IP: ' . ($_SERVER['REMOTE_ADDR'] ?? 'unknown'));

    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => false,
        'message' => 'Permintaan tidak valid. Silakan muat ulang halaman.',
        'code'    => 'CSRF_INVALID',
    ]);
    exit;
}
