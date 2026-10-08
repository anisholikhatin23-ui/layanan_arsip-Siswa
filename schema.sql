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
-- DATA AWAL (100 SISWA DIKELOMPOKKAN PER KELAS: VII A, VII B, VIII A, VIII B, IX A, IX B)
-- =========================================================

INSERT IGNORE INTO siswa (id, nama, nisn, kelas, status_dokumen) VALUES
-- KELAS VII A (17 Siswa)
(1, 'Siswa Contoh 001', 'DEMO-0001', 'VII A', 'ok'),
(2, 'Siswa Contoh 002', 'DEMO-0002', 'VII A', 'ok'),
(3, 'Siswa Contoh 003', 'DEMO-0003', 'VII A', 'ok'),
(4, 'Siswa Contoh 004', 'DEMO-0004', 'VII A', 'ok'),
(5, 'Siswa Contoh 005', 'DEMO-0005', 'VII A', 'ok'),
(6, 'Siswa Contoh 006', 'DEMO-0006', 'VII A', 'warn'),
(7, 'Siswa Contoh 007', 'DEMO-0007', 'VII A', 'ok'),
(8, 'Siswa Contoh 008', 'DEMO-0008', 'VII A', 'ok'),
(9, 'Siswa Contoh 009', 'DEMO-0009', 'VII A', 'bad'),
(10, 'Siswa Contoh 010', 'DEMO-0010', 'VII A', 'ok'),
(11, 'Siswa Contoh 011', 'DEMO-0011', 'VII A', 'ok'),
(12, 'Siswa Contoh 012', 'DEMO-0012', 'VII A', 'ok'),
(13, 'Siswa Contoh 013', 'DEMO-0013', 'VII A', 'warn'),
(14, 'Siswa Contoh 014', 'DEMO-0014', 'VII A', 'ok'),
(15, 'Siswa Contoh 015', 'DEMO-0015', 'VII A', 'ok'),
(16, 'Siswa Contoh 016', 'DEMO-0016', 'VII A', 'ok'),
(17, 'Siswa Contoh 017', 'DEMO-0017', 'VII A', 'ok'),

-- KELAS VII B (17 Siswa)
(18, 'Siswa Contoh 018', 'DEMO-0018', 'VII B', 'ok'),
(19, 'Siswa Contoh 019', 'DEMO-0019', 'VII B', 'ok'),
(20, 'Siswa Contoh 020', 'DEMO-0020', 'VII B', 'warn'),
(21, 'Siswa Contoh 021', 'DEMO-0021', 'VII B', 'ok'),
(22, 'Siswa Contoh 022', 'DEMO-0022', 'VII B', 'ok'),
(23, 'Siswa Contoh 023', 'DEMO-0023', 'VII B', 'ok'),
(24, 'Siswa Contoh 024', 'DEMO-0024', 'VII B', 'ok'),
(25, 'Siswa Contoh 025', 'DEMO-0025', 'VII B', 'bad'),
(26, 'Siswa Contoh 026', 'DEMO-0026', 'VII B', 'ok'),
(27, 'Siswa Contoh 027', 'DEMO-0027', 'VII B', 'ok'),
(28, 'Siswa Contoh 028', 'DEMO-0028', 'VII B', 'ok'),
(29, 'Siswa Contoh 029', 'DEMO-0029', 'VII B', 'warn'),
(30, 'Siswa Contoh 030', 'DEMO-0030', 'VII B', 'ok'),
(31, 'Siswa Contoh 031', 'DEMO-0031', 'VII B', 'ok'),
(32, 'Siswa Contoh 032', 'DEMO-0032', 'VII B', 'ok'),
(33, 'Siswa Contoh 033', 'DEMO-0033', 'VII B', 'ok'),
(34, 'Siswa Contoh 034', 'DEMO-0034', 'VII B', 'ok'),

-- KELAS VIII A (17 Siswa)
(35, 'Siswa Contoh 035', 'DEMO-0035', 'VIII A', 'ok'),
(36, 'Siswa Contoh 036', 'DEMO-0036', 'VIII A', 'ok'),
(37, 'Siswa Contoh 037', 'DEMO-0037', 'VIII A', 'ok'),
(38, 'Siswa Contoh 038', 'DEMO-0038', 'VIII A', 'warn'),
(39, 'Siswa Contoh 039', 'DEMO-0039', 'VIII A', 'ok'),
(40, 'Siswa Contoh 040', 'DEMO-0040', 'VIII A', 'ok'),
(41, 'Siswa Contoh 041', 'DEMO-0041', 'VIII A', 'ok'),
(42, 'Siswa Contoh 042', 'DEMO-0042', 'VIII A', 'bad'),
(43, 'Siswa Contoh 043', 'DEMO-0043', 'VIII A', 'ok'),
(44, 'Siswa Contoh 044', 'DEMO-0044', 'VIII A', 'ok'),
(45, 'Siswa Contoh 045', 'DEMO-0045', 'VIII A', 'ok'),
(46, 'Siswa Contoh 046', 'DEMO-0046', 'VIII A', 'warn'),
(47, 'Siswa Contoh 047', 'DEMO-0047', 'VIII A', 'ok'),
(48, 'Siswa Contoh 048', 'DEMO-0048', 'VIII A', 'ok'),
(49, 'Siswa Contoh 049', 'DEMO-0049', 'VIII A', 'ok'),
(50, 'Siswa Contoh 050', 'DEMO-0050', 'VIII A', 'ok'),
(51, 'Siswa Contoh 051', 'DEMO-0051', 'VIII A', 'ok'),

-- KELAS VIII B (17 Siswa)
(52, 'Siswa Contoh 052', 'DEMO-0052', 'VIII B', 'ok'),
(53, 'Siswa Contoh 053', 'DEMO-0053', 'VIII B', 'warn'),
(54, 'Siswa Contoh 054', 'DEMO-0054', 'VIII B', 'ok'),
(55, 'Siswa Contoh 055', 'DEMO-0055', 'VIII B', 'ok'),
(56, 'Siswa Contoh 056', 'DEMO-0056', 'VIII B', 'ok'),
(57, 'Siswa Contoh 057', 'DEMO-0057', 'VIII B', 'bad'),
(58, 'Siswa Contoh 058', 'DEMO-0058', 'VIII B', 'ok'),
(59, 'Siswa Contoh 059', 'DEMO-0059', 'VIII B', 'ok'),
(60, 'Siswa Contoh 060', 'DEMO-0060', 'VIII B', 'warn'),
(61, 'Siswa Contoh 061', 'DEMO-0061', 'VIII B', 'ok'),
(62, 'Siswa Contoh 062', 'DEMO-0062', 'VIII B', 'ok'),
(63, 'Siswa Contoh 063', 'DEMO-0063', 'VIII B', 'ok'),
(64, 'Siswa Contoh 064', 'DEMO-0064', 'VIII B', 'ok'),
(65, 'Siswa Contoh 065', 'DEMO-0065', 'VIII B', 'ok'),
(66, 'Siswa Contoh 066', 'DEMO-0066', 'VIII B', 'ok'),
(67, 'Siswa Contoh 067', 'DEMO-0067', 'VIII B', 'ok'),
(68, 'Siswa Contoh 068', 'DEMO-0068', 'VIII B', 'ok'),

-- KELAS IX A (16 Siswa)
(69, 'Siswa Contoh 069', 'DEMO-0069', 'IX A', 'ok'),
(70, 'Siswa Contoh 070', 'DEMO-0070', 'IX A', 'ok'),
(71, 'Siswa Contoh 071', 'DEMO-0071', 'IX A', 'warn'),
(72, 'Siswa Contoh 072', 'DEMO-0072', 'IX A', 'ok'),
(73, 'Siswa Contoh 073', 'DEMO-0073', 'IX A', 'ok'),
(74, 'Siswa Contoh 074', 'DEMO-0074', 'IX A', 'ok'),
(75, 'Siswa Contoh 075', 'DEMO-0075', 'IX A', 'ok'),
(76, 'Siswa Contoh 076', 'DEMO-0076', 'IX A', 'bad'),
(77, 'Siswa Contoh 077', 'DEMO-0077', 'IX A', 'ok'),
(78, 'Siswa Contoh 078', 'DEMO-0078', 'IX A', 'ok'),
(79, 'Siswa Contoh 079', 'DEMO-0079', 'IX A', 'ok'),
(80, 'Siswa Contoh 080', 'DEMO-0080', 'IX A', 'warn'),
(81, 'Siswa Contoh 081', 'DEMO-0081', 'IX A', 'ok'),
(82, 'Siswa Contoh 082', 'DEMO-0082', 'IX A', 'ok'),
(83, 'Siswa Contoh 083', 'DEMO-0083', 'IX A', 'ok'),
(84, 'Siswa Contoh 084', 'DEMO-0084', 'IX A', 'ok'),

-- KELAS IX B (16 Siswa)
(85, 'Siswa Contoh 085', 'DEMO-0085', 'IX B', 'ok'),
(86, 'Siswa Contoh 086', 'DEMO-0086', 'IX B', 'ok'),
(87, 'Siswa Contoh 087', 'DEMO-0087', 'IX B', 'warn'),
(88, 'Siswa Contoh 088', 'DEMO-0088', 'IX B', 'ok'),
(89, 'Siswa Contoh 089', 'DEMO-0089', 'IX B', 'ok'),
(90, 'Siswa Contoh 090', 'DEMO-0090', 'IX B', 'ok'),
(91, 'Siswa Contoh 091', 'DEMO-0091', 'IX B', 'bad'),
(92, 'Siswa Contoh 092', 'DEMO-0092', 'IX B', 'ok'),
(93, 'Siswa Contoh 093', 'DEMO-0093', 'IX B', 'ok'),
(94, 'Siswa Contoh 094', 'DEMO-0094', 'IX B', 'ok'),
(95, 'Siswa Contoh 095', 'DEMO-0095', 'IX B', 'warn'),
(96, 'Siswa Contoh 096', 'DEMO-0096', 'IX B', 'ok'),
(97, 'Siswa Contoh 097', 'DEMO-0097', 'IX B', 'ok'),
(98, 'Siswa Contoh 098', 'DEMO-0098', 'IX B', 'ok'),
(99, 'Siswa Contoh 099', 'DEMO-0099', 'IX B', 'ok'),
(100, 'Siswa Contoh 100', 'DEMO-0100', 'IX B', 'ok');

UPDATE siswa
SET id_siswa = COALESCE(id_siswa, id),
    nama_lengkap = COALESCE(nama_lengkap, nama),
    nama_siswa = COALESCE(nama_siswa, nama),
    nis = COALESCE(nis, nisn);

-- Sampel Dokumen Administrasi Siswa
INSERT IGNORE INTO dokumen (id, siswa_id, nama, kategori, tahun, jenis, status) VALUES
(1, 1, 'Ijazah - Siswa Contoh 001', 'Ijazah', '2026', 'Fisik + Digital', 'ok'),
(2, 1, 'Akta Kelahiran - Siswa Contoh 001', 'Akta Kelahiran', '2026', 'Fisik + Digital', 'ok'),
(3, 1, 'Kartu Keluarga - Siswa Contoh 001', 'Kartu Keluarga', '2026', 'Fisik + Digital', 'ok'),
(4, 1, 'Rapor Semester 1 - Siswa Contoh 001', 'Rapor', '2026', 'Digital', 'ok'),

(5, 2, 'Ijazah - Siswa Contoh 002', 'Ijazah', '2026', 'Fisik + Digital', 'ok'),
(6, 2, 'Akta Kelahiran - Siswa Contoh 002', 'Akta Kelahiran', '2026', 'Fisik + Digital', 'ok'),
(7, 2, 'Kartu Keluarga - Siswa Contoh 002', 'Kartu Keluarga', '2026', 'Digital', 'ok'),
(8, 2, 'Rapor Semester 1 - Siswa Contoh 002', 'Rapor', '2026', 'Digital', 'ok'),

(9, 6, 'Ijazah - Siswa Contoh 006', 'Ijazah', '2026', 'Digital', 'ok'),
(10, 6, 'Kartu Keluarga - Siswa Contoh 006', 'Kartu Keluarga', '2026', 'Fisik', 'warn'),

(11, 18, 'Ijazah - Siswa Contoh 018', 'Ijazah', '2026', 'Fisik + Digital', 'ok'),
(12, 18, 'Akta Kelahiran - Siswa Contoh 018', 'Akta Kelahiran', '2026', 'Fisik + Digital', 'ok'),
(13, 18, 'Kartu Keluarga - Siswa Contoh 018', 'Kartu Keluarga', '2026', 'Fisik + Digital', 'ok'),
(14, 18, 'Rapor Semester 1 - Siswa Contoh 018', 'Rapor', '2026', 'Digital', 'ok'),

(15, 35, 'Ijazah - Siswa Contoh 035', 'Ijazah', '2025', 'Fisik + Digital', 'ok'),
(16, 35, 'Akta Kelahiran - Siswa Contoh 035', 'Akta Kelahiran', '2025', 'Fisik + Digital', 'ok'),
(17, 35, 'Kartu Keluarga - Siswa Contoh 035', 'Kartu Keluarga', '2025', 'Digital', 'ok'),
(18, 35, 'Rapor Semester 1-3 - Siswa Contoh 035', 'Rapor', '2026', 'Digital', 'ok'),

(19, 53, 'Ijazah - Siswa Contoh 053', 'Ijazah', '2025', 'Fisik', 'ok'),
(20, 53, 'Rapor Semester 1-4 - Siswa Contoh 053', 'Rapor', '2025', 'Digital', 'warn'),

(21, 69, 'Ijazah SD - Siswa Contoh 069', 'Ijazah', '2024', 'Fisik + Digital', 'ok'),
(22, 69, 'Akta Kelahiran - Siswa Contoh 069', 'Akta Kelahiran', '2024', 'Fisik + Digital', 'ok'),
(23, 69, 'Kartu Keluarga - Siswa Contoh 069', 'Kartu Keluarga', '2024', 'Fisik + Digital', 'ok'),
(24, 69, 'Rapor Semester 1-5 - Siswa Contoh 069', 'Rapor', '2026', 'Digital', 'ok'),
(25, 69, 'Sertifikat Juara 1 Olimpiade Matematika', 'Lainnya', '2025', 'Digital', 'ok'),

(26, 85, 'Ijazah SD - Siswa Contoh 085', 'Ijazah', '2024', 'Fisik + Digital', 'ok'),
(27, 85, 'Akta Kelahiran - Siswa Contoh 085', 'Akta Kelahiran', '2024', 'Fisik + Digital', 'ok'),
(28, 85, 'Kartu Keluarga - Siswa Contoh 085', 'Kartu Keluarga', '2024', 'Digital', 'ok'),
(29, 85, 'Rapor Semester 1-5 - Siswa Contoh 085', 'Rapor', '2026', 'Digital', 'ok'),

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
