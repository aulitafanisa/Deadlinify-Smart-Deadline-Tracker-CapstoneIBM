<?php
/**
 * session.php — Deadlinify Backend
 *
 * Konfigurasi dan inisialisasi PHP Session.
 * Wajib di-include sebelum session_start() dipanggil di file mana pun.
 *
 * Fitur keamanan:
 *   - Cookie HttpOnly: JavaScript tidak dapat membaca cookie session
 *   - SameSite=Lax: melindungi dari serangan CSRF lintas situs
 *   - Secure: cookie hanya dikirim melalui HTTPS (diaktifkan otomatis jika HTTPS terdeteksi)
 *   - session_regenerate_id(): dipanggil setelah login untuk mencegah session fixation
 *
 * Cara penggunaan:
 *   require_once __DIR__ . '/session.php';
 *   // session sudah aktif, $_SESSION tersedia
 */

declare(strict_types=1);

/* ──────────────────────────────────────────────────────────
   DETEKSI HTTPS
   Di balik reverse proxy (hosting), gunakan header X-Forwarded-Proto.
────────────────────────────────────────────────────────── */
$isHttps = (
    (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
    || (!empty($_SERVER['HTTP_X_FORWARDED_PROTO']) && $_SERVER['HTTP_X_FORWARDED_PROTO'] === 'https')
    || (!empty($_SERVER['SERVER_PORT']) && (int)$_SERVER['SERVER_PORT'] === 443)
);

/* ──────────────────────────────────────────────────────────
   KONFIGURASI SESSION (sebelum session_start)
────────────────────────────────────────────────────────── */
ini_set('session.cookie_httponly', '1');          // Blokir akses JavaScript ke cookie
ini_set('session.cookie_samesite', 'Lax');        // Lax: aman untuk navigasi biasa, blokir CSRF
ini_set('session.cookie_secure', $isHttps ? '1' : '0'); // Secure hanya jika HTTPS
ini_set('session.use_strict_mode', '1');          // Tolak session ID yang tidak dikenal
ini_set('session.cookie_lifetime', '0');          // Cookie hilang saat browser ditutup (bukan persistent)
ini_set('session.gc_maxlifetime', '7200');        // Session expired setelah 2 jam tidak aktif
ini_set('session.use_only_cookies', '1');         // Jangan terima session ID via URL

session_name('deadlinify_session');               // Nama cookie custom (bukan PHPSESSID)

/* Mulai session jika belum aktif */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

/* ──────────────────────────────────────────────────────────
   FUNGSI HELPER SESSION
────────────────────────────────────────────────────────── */

/**
 * Membuat session baru setelah login berhasil.
 * Regenerasi ID mencegah session fixation attack.
 *
 * @param array $user Data pengguna dari database (id, name, email)
 */
function sessionLogin(array $user): void
{
    /* Hapus data session lama sebelum regenerasi */
    $_SESSION = [];

    /* Regenerasi ID session — ini yang mencegah session fixation */
    session_regenerate_id(true);

    /* Simpan data pengguna ke session */
    $_SESSION['user_id']    = (int) $user['id'];
    $_SESSION['user_name']  = $user['name'];
    $_SESSION['user_email'] = $user['email'];
    $_SESSION['logged_in']  = true;
    $_SESSION['login_time'] = time();
}

/**
 * Menghapus session sepenuhnya saat logout.
 * Menghapus cookie session dari browser pengguna.
 */
function sessionLogout(): void
{
    /* Kosongkan data session */
    $_SESSION = [];

    /* Hapus cookie session dari browser */
    if (ini_get('session.use_cookies')) {
        $params = session_get_cookie_params();
        setcookie(
            session_name(),
            '',
            [
                'expires'  => time() - 42000,
                'path'     => $params['path'],
                'domain'   => $params['domain'],
                'secure'   => $params['secure'],
                'httponly' => $params['httponly'],
                'samesite' => 'Lax',
            ]
        );
    }

    /* Hancurkan session di server */
    session_destroy();
}

/**
 * Memeriksa apakah pengguna sedang login.
 *
 * @return bool
 */
function isLoggedIn(): bool
{
    return !empty($_SESSION['logged_in'])
        && !empty($_SESSION['user_id'])
        && $_SESSION['logged_in'] === true;
}

/**
 * Mengembalikan user_id dari session yang aktif.
 * Kembalikan null jika belum login.
 *
 * @return int|null
 */
function getSessionUserId(): ?int
{
    return isLoggedIn() ? (int) $_SESSION['user_id'] : null;
}
