<?php
/**
 * database.php — Deadlinify Backend
 *
 * Menyediakan koneksi PDO ke MySQL/MariaDB.
 * Gunakan fungsi getDB() untuk mendapatkan instance PDO.
 *
 * Konfigurasi:
 *   Sesuaikan konstanta DB_* di bawah dengan lingkungan Anda.
 *   XAMPP default: host=localhost, user=root, pass='' (kosong)
 *   Hosting bersama: sesuaikan dengan nilai dari cPanel/panel hosting.
 *
 * KEAMANAN:
 *   - File ini TIDAK boleh dapat diakses langsung melalui browser.
 *   - Taruh di luar webroot jika memungkinkan, atau gunakan .htaccess
 *     untuk memblokir akses langsung ke folder backend/.
 *   - Jangan pernah mengirim nilai DB_PASS ke frontend/JavaScript.
 */

declare(strict_types=1);

/* ──────────────────────────────────────────────────────────
   KONFIGURASI DATABASE
   Sesuaikan nilai ini dengan lingkungan Anda.
────────────────────────────────────────────────────────── */
define('DB_HOST', 'localhost');   // Host database (biasanya localhost)
define('DB_NAME', 'deadlinify_db'); // Nama database
define('DB_USER', 'root');         // Username database
define('DB_PASS', '');             // Password database (XAMPP default: kosong)
define('DB_CHARSET', 'utf8mb4');   // Charset — jangan ubah

/* ──────────────────────────────────────────────────────────
   FUNGSI KONEKSI
────────────────────────────────────────────────────────── */

/**
 * Mengembalikan instance PDO yang sudah dikonfigurasi.
 * Menggunakan singleton sederhana agar koneksi tidak dibuat ulang
 * setiap kali getDB() dipanggil dalam satu request.
 *
 * @throws PDOException jika koneksi gagal
 * @return PDO
 */
function getDB(): PDO
{
    static $pdo = null;

    if ($pdo !== null) {
        return $pdo;
    }

    $dsn = sprintf(
        'mysql:host=%s;dbname=%s;charset=%s',
        DB_HOST,
        DB_NAME,
        DB_CHARSET
    );

    $options = [
        PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,  // Lempar exception saat error
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,        // Fetch sebagai array asosiatif
        PDO::ATTR_EMULATE_PREPARES   => false,                   // Gunakan prepared statement native
        PDO::MYSQL_ATTR_INIT_COMMAND => "SET NAMES 'utf8mb4' COLLATE 'utf8mb4_unicode_ci'",
    ];

    try {
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    } catch (PDOException $e) {
        /*
         * PENTING: Jangan pernah menampilkan pesan error PDO langsung ke browser.
         * Log error di server, kirim respons generik ke client.
         */
        error_log('[Deadlinify] Koneksi database gagal: ' . $e->getMessage());

        /*
         * Jika dipanggil dari endpoint API, kirim JSON error.
         * Jika dipanggil dari konteks lain, lempar kembali exception-nya.
         */
        if (!empty($_SERVER['HTTP_ACCEPT']) && str_contains($_SERVER['HTTP_ACCEPT'], 'application/json')) {
            http_response_code(503);
            header('Content-Type: application/json; charset=utf-8');
            echo json_encode([
                'success' => false,
                'message' => 'Layanan sementara tidak tersedia. Silakan coba lagi nanti.',
                'code'    => 'DB_UNAVAILABLE',
            ]);
            exit;
        }

        throw $e;
    }

    return $pdo;
}
