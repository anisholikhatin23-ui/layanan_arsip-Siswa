-- =========================================================
-- DATABASE SCHEMA FOR MYSQL: arsip_siswa
-- SMP Muhammadiyah 1 Negara Batin
-- =========================================================

-- 1. Buat Database jika belum ada
CREATE DATABASE IF NOT EXISTS arsip_siswa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE arsip_siswa;

-- 2. Tabel Siswa (100 Siswa Terdaftar per Kelas)
CREATE TABLE IF NOT EXISTS kelas (
  id_kelas INT AUTO_INCREMENT PRIMARY KEY,
  nama_kelas VARCHAR(50) NOT NULL UNIQUE,
  tingkat VARCHAR(20) NOT NULL,
  tahun_ajaran VARCHAR(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS siswa (
  id_siswa INT AUTO_INCREMENT PRIMARY KEY,
  id INT NULL UNIQUE,
  nama VARCHAR(255) NOT NULL,
  nama_lengkap VARCHAR(255) NULL,
  nisn VARCHAR(50) UNIQUE NOT NULL,
  nis VARCHAR(50) NULL,
  nama_siswa VARCHAR(255) NULL,
  jenis_kelamin ENUM('L', 'P') NULL,
  kelas VARCHAR(50) NOT NULL,
  status_dokumen VARCHAR(20) DEFAULT 'ok',
  status_siswa VARCHAR(30) DEFAULT 'aktif',
  tahun_lulus YEAR NULL,
  status_arsip VARCHAR(30) DEFAULT 'aktif',
  id_kelas INT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_kelas) REFERENCES kelas(id_kelas) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS kategori_dokumen (
  id_kategori INT AUTO_INCREMENT PRIMARY KEY,
  nama_kategori VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO kategori_dokumen (nama_kategori) VALUES
  ('Ijazah'),
  ('Akta Kelahiran'),
  ('Kartu Keluarga'),
  ('Rapor'),
  ('Surat masuk/keluar'),
  ('Organisasi'),
  ('Lainnya');

CREATE TABLE IF NOT EXISTS pengguna_tu (
  id_pengguna INT AUTO_INCREMENT PRIMARY KEY,
  nama_lengkap VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  kata_sandi VARCHAR(255) NULL,
  jabatan VARCHAR(100) NULL,
  nip VARCHAR(50) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sesi_tu (
  token_hash CHAR(64) PRIMARY KEY,
  id_pengguna INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sesi_tu_expiration (expires_at),
  CONSTRAINT fk_sesi_tu_pengguna FOREIGN KEY (id_pengguna)
    REFERENCES pengguna_tu(id_pengguna) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Tabel Dokumen Administrasi Siswa
CREATE TABLE IF NOT EXISTS dokumen (
  id_dokumen INT AUTO_INCREMENT PRIMARY KEY,
  id INT NULL UNIQUE,
  siswa_id INT NULL,
  nama VARCHAR(255) NOT NULL,
  kategori VARCHAR(100) NOT NULL,
  tahun VARCHAR(20) NOT NULL,
  jenis VARCHAR(50) DEFAULT 'Fisik + Digital',
  file_url VARCHAR(255) NULL,
  drive_file_id VARCHAR(255) NULL,
  file_mime_type VARCHAR(100) NULL,
  file_original_name VARCHAR(255) NULL,
  status VARCHAR(20) DEFAULT 'ok',
  id_siswa INT NULL,
  id_kategori INT NULL,
  id_pengguna INT NULL,
  nama_dokumen VARCHAR(255) NULL,
  tahun_dokumen VARCHAR(20) NULL,
  jenis_penyimpanan VARCHAR(50) NULL,
  status_kelengkapan VARCHAR(30) NULL,
  file_dokumen VARCHAR(255) NULL,
  tanggal_unggah DATETIME NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (siswa_id) REFERENCES siswa(id) ON DELETE SET NULL,
  FOREIGN KEY (id_siswa) REFERENCES siswa(id_siswa) ON DELETE SET NULL,
  FOREIGN KEY (id_kategori) REFERENCES kategori_dokumen(id_kategori) ON DELETE SET NULL,
  FOREIGN KEY (id_pengguna) REFERENCES pengguna_tu(id_pengguna) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. Tabel Log Aktivitas (Backup & System Logs)
CREATE TABLE IF NOT EXISTS log_aktivitas (
  id_log INT AUTO_INCREMENT PRIMARY KEY,
  id INT NULL UNIQUE,
  waktu VARCHAR(50) NOT NULL,
  teks TEXT NOT NULL,
  id_pengguna INT NULL,
  waktu_aktivitas DATETIME NULL,
  jenis_aktivitas VARCHAR(100) NULL,
  keterangan TEXT NULL,
  FOREIGN KEY (id_pengguna) REFERENCES pengguna_tu(id_pengguna) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS surat_legalisir (
  id_legalisir INT AUTO_INCREMENT PRIMARY KEY,
  id_siswa INT NOT NULL,
  id_pengguna INT NULL,
  nomor_surat VARCHAR(100) NOT NULL,
  tanggal_cetak DATE NOT NULL,
  status_arsip VARCHAR(30) NOT NULL DEFAULT 'aktif',
  FOREIGN KEY (id_siswa) REFERENCES siswa(id_siswa) ON DELETE CASCADE,
  FOREIGN KEY (id_pengguna) REFERENCES pengguna_tu(id_pengguna) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS jadwal_backup (
  id_jadwal INT AUTO_INCREMENT PRIMARY KEY,
  jam_backup TIME NOT NULL,
  frekuensi VARCHAR(50) NOT NULL,
  status_jadwal VARCHAR(30) NOT NULL DEFAULT 'aktif'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS backup (
  id_backup INT AUTO_INCREMENT PRIMARY KEY,
  id_jadwal INT NULL,
  id_pengguna INT NULL,
  jam_backup TIME NULL,
  tipe_backup VARCHAR(50) NOT NULL,
  waktu_mulai DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_backup VARCHAR(30) NOT NULL DEFAULT 'menunggu',
  FOREIGN KEY (id_jadwal) REFERENCES jadwal_backup(id_jadwal) ON DELETE SET NULL,
  FOREIGN KEY (id_pengguna) REFERENCES pengguna_tu(id_pengguna) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS titik_penyimpanan (
  id_titik INT AUTO_INCREMENT PRIMARY KEY,
  nama_titik VARCHAR(100) NOT NULL UNIQUE,
  jenis_penyimpanan VARCHAR(50) NOT NULL,
  lokasi VARCHAR(255) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS detail_sinkron (
  id_detail INT AUTO_INCREMENT PRIMARY KEY,
  id_backup INT NOT NULL,
  id_titik INT NOT NULL,
  waktu_sinkron DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_sinkron VARCHAR(30) NOT NULL DEFAULT 'menunggu',
  FOREIGN KEY (id_backup) REFERENCES backup(id_backup) ON DELETE CASCADE,
  FOREIGN KEY (id_titik) REFERENCES titik_penyimpanan(id_titik) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =========================================================
-- Data siswa kanonis disinkronkan server dari student-data.js saat startup.

UPDATE siswa
SET id_siswa = COALESCE(id_siswa, id),
    nama_lengkap = COALESCE(nama_lengkap, nama),
    nama_siswa = COALESCE(nama_siswa, nama),
    nis = COALESCE(nis, nisn);

-- Sampel Dokumen Administrasi Siswa
INSERT IGNORE INTO dokumen (id, siswa_id, nama, kategori, tahun, jenis, status) VALUES
(1, 1, 'Ijazah - Ahmad Fauzi', 'Ijazah', '2026', 'Fisik + Digital', 'ok'),
(2, 1, 'Akta Kelahiran - Ahmad Fauzi', 'Akta Kelahiran', '2026', 'Fisik + Digital', 'ok'),
(3, 1, 'Kartu Keluarga - Ahmad Fauzi', 'Kartu Keluarga', '2026', 'Fisik + Digital', 'ok'),
(4, 1, 'Rapor Semester 1 - Ahmad Fauzi', 'Rapor', '2026', 'Digital', 'ok'),

(5, 2, 'Ijazah - Rani Kusuma', 'Ijazah', '2026', 'Fisik + Digital', 'ok'),
(6, 2, 'Akta Kelahiran - Rani Kusuma', 'Akta Kelahiran', '2026', 'Fisik + Digital', 'ok'),
(7, 2, 'Kartu Keluarga - Rani Kusuma', 'Kartu Keluarga', '2026', 'Digital', 'ok'),
(8, 2, 'Rapor Semester 1 - Rani Kusuma', 'Rapor', '2026', 'Digital', 'ok'),

(9, 6, 'Ijazah - Annisa Rahmadani', 'Ijazah', '2026', 'Digital', 'ok'),
(10, 6, 'Kartu Keluarga - Annisa Rahmadani', 'Kartu Keluarga', '2026', 'Fisik', 'warn'),

(11, 18, 'Ijazah - Fajar Ramadhan', 'Ijazah', '2026', 'Fisik + Digital', 'ok'),
(12, 18, 'Akta Kelahiran - Fajar Ramadhan', 'Akta Kelahiran', '2026', 'Fisik + Digital', 'ok'),
(13, 18, 'Kartu Keluarga - Fajar Ramadhan', 'Kartu Keluarga', '2026', 'Fisik + Digital', 'ok'),
(14, 18, 'Rapor Semester 1 - Fajar Ramadhan', 'Rapor', '2026', 'Digital', 'ok'),

(15, 35, 'Ijazah - Nurul Hidayah', 'Ijazah', '2025', 'Fisik + Digital', 'ok'),
(16, 35, 'Akta Kelahiran - Nurul Hidayah', 'Akta Kelahiran', '2025', 'Fisik + Digital', 'ok'),
(17, 35, 'Kartu Keluarga - Nurul Hidayah', 'Kartu Keluarga', '2025', 'Digital', 'ok'),
(18, 35, 'Rapor Semester 1-3 - Nurul Hidayah', 'Rapor', '2026', 'Digital', 'ok'),

(19, 53, 'Ijazah - Dedi Firmansyah', 'Ijazah', '2025', 'Fisik', 'ok'),
(20, 53, 'Rapor Semester 1-4 - Dedi Firmansyah', 'Rapor', '2025', 'Digital', 'warn'),

(21, 69, 'Ijazah SD - Andi Pratama', 'Ijazah', '2024', 'Fisik + Digital', 'ok'),
(22, 69, 'Akta Kelahiran - Andi Pratama', 'Akta Kelahiran', '2024', 'Fisik + Digital', 'ok'),
(23, 69, 'Kartu Keluarga - Andi Pratama', 'Kartu Keluarga', '2024', 'Fisik + Digital', 'ok'),
(24, 69, 'Rapor Semester 1-5 - Andi Pratama', 'Rapor', '2026', 'Digital', 'ok'),
(25, 69, 'Sertifikat Juara 1 Olimpiade Matematika', 'Lainnya', '2025', 'Digital', 'ok'),

(26, 85, 'Ijazah SD - Budi Santoso', 'Ijazah', '2024', 'Fisik + Digital', 'ok'),
(27, 85, 'Akta Kelahiran - Budi Santoso', 'Akta Kelahiran', '2024', 'Fisik + Digital', 'ok'),
(28, 85, 'Kartu Keluarga - Budi Santoso', 'Kartu Keluarga', '2024', 'Digital', 'ok'),
(29, 85, 'Rapor Semester 1-5 - Budi Santoso', 'Rapor', '2026', 'Digital', 'ok'),

(30, NULL, 'Surat Undangan Wali Murid 2026', 'Surat masuk/keluar', '2026', 'Fisik + Digital', 'ok'),
(31, NULL, 'SK Pembina Pramuka SMP Muh 1', 'Organisasi', '2025', 'Fisik', 'warn');

UPDATE dokumen
SET id_dokumen = COALESCE(id_dokumen, id),
    id_siswa = COALESCE(id_siswa, siswa_id);

INSERT IGNORE INTO log_aktivitas (id, waktu, teks) VALUES
(1, '09:02 WIB', 'Data contoh: Google Drive tersinkronisasi otomatis'),
(2, '08:40 WIB', 'Data contoh: Laptop sekolah tersinkronisasi otomatis'),
(3, 'Kemarin', 'Data contoh: Staf TU memperbarui data 100 siswa per kelas');
UPDATE log_aktivitas
SET id = COALESCE(id, id_log),
    id_log = COALESCE(id_log, id);

-- Normalisasi data legacy ke relasi pada ERD.
INSERT IGNORE INTO kelas (nama_kelas, tingkat, tahun_ajaran)
SELECT DISTINCT kelas, SUBSTRING_INDEX(kelas, ' ', 1), '2026' FROM siswa;
INSERT IGNORE INTO kategori_dokumen (nama_kategori)
SELECT DISTINCT kategori FROM dokumen;
UPDATE siswa s
JOIN kelas k ON k.nama_kelas = s.kelas
SET s.id_kelas = k.id_kelas, s.nama_lengkap = s.nama
WHERE s.id_kelas IS NULL OR s.nama_lengkap IS NULL;
UPDATE dokumen d
JOIN kategori_dokumen k ON k.nama_kategori = d.kategori
SET d.id_siswa = d.siswa_id,
    d.id_kategori = k.id_kategori,
    d.nama_dokumen = d.nama,
    d.tahun_dokumen = d.tahun,
    d.jenis_penyimpanan = d.jenis,
    d.status_kelengkapan = d.status,
    d.file_dokumen = COALESCE(d.drive_file_id, d.file_url),
    d.tanggal_unggah = d.created_at
WHERE d.id_kategori IS NULL OR d.nama_dokumen IS NULL;
INSERT IGNORE INTO jadwal_backup (jam_backup, frekuensi, status_jadwal)
VALUES ('16:00:00', 'harian', 'aktif');
INSERT IGNORE INTO titik_penyimpanan (nama_titik, jenis_penyimpanan, lokasi) VALUES
  ('Laptop Sekolah', 'lokal', 'Laptop Sekolah'),
  ('Laptop Admin TU', 'lokal', 'Laptop Admin TU'),
  ('Google Drive Sekolah', 'cloud', 'Google Drive Sekolah');
