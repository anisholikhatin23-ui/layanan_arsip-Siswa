-- =========================================================
-- DATABASE SCHEMA FOR MYSQL: arsip_siswa
-- SMP Muhammadiyah 1 Negara Batin
-- Sesuai dengan:
-- 1. ERD 1: Pengelolaan Arsip Dokumen dan Data Siswa/Alumni (SI Arsip Siswa) - Revisi
-- 2. ERD 2: Backup, Sinkronisasi, dan Log Aktivitas Sistem (SI Arsip Siswa) - Revisi
-- =========================================================

CREATE DATABASE IF NOT EXISTS arsip_siswa CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE arsip_siswa;

DROP TABLE IF EXISTS surat_legalisir;

-- ---------------------------------------------------------
-- 1. TABEL KELAS (ERD 1)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS kelas (
  id_kelas INT AUTO_INCREMENT PRIMARY KEY,
  nama_kelas VARCHAR(50) NOT NULL UNIQUE,
  tingkat VARCHAR(20) NOT NULL,
  tahun_ajaran VARCHAR(20) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 2. TABEL PENGGUNA [Admin/TU/Guru] (ERD 1 & ERD 2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS pengguna (
  id_pengguna INT AUTO_INCREMENT PRIMARY KEY,
  nama_lengkap VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  kata_sandi VARCHAR(255) NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'tu',
  nip VARCHAR(50) NULL,
  jabatan VARCHAR(100) NULL,
  status_akun VARCHAR(30) NOT NULL DEFAULT 'aktif'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Kompatibilitas legacy nama pengguna_tu
CREATE TABLE IF NOT EXISTS pengguna_tu (
  id_pengguna INT AUTO_INCREMENT PRIMARY KEY,
  nama_lengkap VARCHAR(255) NOT NULL,
  username VARCHAR(100) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  kata_sandi VARCHAR(255) NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'tu',
  nip VARCHAR(50) NULL,
  jabatan VARCHAR(100) NULL,
  status_akun VARCHAR(30) NOT NULL DEFAULT 'aktif'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 3. TABEL SISWA (ERD 1 & ERD 2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS siswa (
  id_siswa INT AUTO_INCREMENT PRIMARY KEY,
  id_kelas INT NULL,
  nisn VARCHAR(50) NOT NULL UNIQUE,
  nis VARCHAR(50) NULL,
  nama_lengkap VARCHAR(255) NOT NULL,
  username VARCHAR(100) NULL UNIQUE,
  password_hash VARCHAR(255) NULL,
  status_akun VARCHAR(30) DEFAULT 'aktif',
  status_siswa VARCHAR(30) DEFAULT 'aktif',
  tahun_masuk VARCHAR(10) NULL DEFAULT '2024',
  tahun_lulus YEAR NULL,
  status_arsip VARCHAR(30) DEFAULT 'aktif',
  -- Kolom kompatibilitas legacy
  id INT NULL UNIQUE,
  nama VARCHAR(255) NULL,
  nama_siswa VARCHAR(255) NULL,
  jenis_kelamin ENUM('L', 'P') NULL,
  kelas VARCHAR(50) NULL,
  status_dokumen VARCHAR(20) DEFAULT 'ok',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_siswa_kelas FOREIGN KEY (id_kelas) REFERENCES kelas(id_kelas) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 4. TABEL PROFIL_SISWA (ERD 1 - Relasi 1:1 Unik)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS profil_siswa (
  id_profil INT AUTO_INCREMENT PRIMARY KEY,
  id_siswa INT NOT NULL UNIQUE,
  nik VARCHAR(50) NULL,
  tempat_lahir VARCHAR(100) NULL,
  tanggal_lahir DATE NULL,
  jenis_kelamin ENUM('L', 'P') NULL,
  agama VARCHAR(50) NULL DEFAULT 'Islam',
  alamat TEXT NULL,
  no_hp VARCHAR(30) NULL,
  email VARCHAR(100) NULL,
  nama_ayah VARCHAR(255) NULL,
  nama_ibu VARCHAR(255) NULL,
  foto VARCHAR(255) NULL,
  status_verifikasi_data VARCHAR(30) DEFAULT 'terverifikasi',
  diperbarui_pada DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_profil_siswa FOREIGN KEY (id_siswa) REFERENCES siswa(id_siswa) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 5. TABEL MATA_PELAJARAN (ERD 1)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS mata_pelajaran (
  id_mapel INT AUTO_INCREMENT PRIMARY KEY,
  kode_mapel VARCHAR(20) NOT NULL UNIQUE,
  nama_mapel VARCHAR(100) NOT NULL,
  kelompok_mapel VARCHAR(50) NULL,
  kkm DECIMAL(5,2) DEFAULT 75.00
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 6. TABEL RAPOR (ERD 1)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS rapor (
  id_rapor INT AUTO_INCREMENT PRIMARY KEY,
  id_siswa INT NOT NULL,
  id_kelas INT NULL,
  id_wali_kelas INT NULL,
  tahun_ajaran VARCHAR(20) NOT NULL,
  semester VARCHAR(20) NOT NULL,
  sakit INT DEFAULT 0,
  izin INT DEFAULT 0,
  alpa INT DEFAULT 0,
  catatan_wali_kelas TEXT NULL,
  status_rapor VARCHAR(30) DEFAULT 'selesai',
  file_rapor VARCHAR(255) NULL,
  tanggal_terbit DATE NULL,
  CONSTRAINT fk_rapor_siswa FOREIGN KEY (id_siswa) REFERENCES siswa(id_siswa) ON DELETE CASCADE,
  CONSTRAINT fk_rapor_kelas FOREIGN KEY (id_kelas) REFERENCES kelas(id_kelas) ON DELETE SET NULL,
  CONSTRAINT fk_rapor_wali FOREIGN KEY (id_wali_kelas) REFERENCES pengguna(id_pengguna) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 7. TABEL NILAI (ERD 1)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS nilai (
  id_nilai INT AUTO_INCREMENT PRIMARY KEY,
  id_rapor INT NOT NULL,
  id_mapel INT NOT NULL,
  id_pengisi INT NULL,
  nilai_pengetahuan DECIMAL(5,2) NULL,
  nilai_keterampilan DECIMAL(5,2) NULL,
  nilai_akhir DECIMAL(5,2) NULL,
  predikat VARCHAR(5) NULL,
  CONSTRAINT fk_nilai_rapor FOREIGN KEY (id_rapor) REFERENCES rapor(id_rapor) ON DELETE CASCADE,
  CONSTRAINT fk_nilai_mapel FOREIGN KEY (id_mapel) REFERENCES mata_pelajaran(id_mapel) ON DELETE RESTRICT,
  CONSTRAINT fk_nilai_pengisi FOREIGN KEY (id_pengisi) REFERENCES pengguna(id_pengguna) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 8. TABEL KATEGORI_DOKUMEN (ERD 1)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS kategori_dokumen (
  id_kategori INT AUTO_INCREMENT PRIMARY KEY,
  nama_kategori VARCHAR(100) NOT NULL UNIQUE,
  deskripsi TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 9. TABEL DOKUMEN_ARSIP (ERD 1)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS dokumen_arsip (
  id_dokumen INT AUTO_INCREMENT PRIMARY KEY,
  id_kategori INT NULL,
  id_siswa INT NULL,
  id_pengunggah INT NULL,
  id_verifikator INT NULL,
  id_penyerah INT NULL,
  nama_dokumen VARCHAR(255) NOT NULL,
  nomor_dokumen VARCHAR(100) NULL,
  tanggal_dokumen DATE NULL,
  tahun_dokumen VARCHAR(20) NULL,
  jenis_penyimpanan VARCHAR(50) DEFAULT 'Fisik + Digital',
  sumber_unggah VARCHAR(50) DEFAULT 'staf_tu',
  status_kelengkapan VARCHAR(30) DEFAULT 'ok',
  status_verifikasi VARCHAR(30) DEFAULT 'terverifikasi',
  catatan_verifikasi TEXT NULL,
  file_dokumen VARCHAR(255) NULL,
  tanggal_unggah DATETIME DEFAULT CURRENT_TIMESTAMP,
  status_penyerahan VARCHAR(50) DEFAULT 'belum_diserahkan',
  tanggal_penyerahan DATETIME NULL,
  diambil_oleh VARCHAR(255) NULL,
  -- Kompatibilitas legacy
  id INT NULL UNIQUE,
  siswa_id INT NULL,
  nama VARCHAR(255) NULL,
  kategori VARCHAR(100) NULL,
  tahun VARCHAR(20) NULL,
  jenis VARCHAR(50) NULL,
  file_url VARCHAR(255) NULL,
  drive_file_id VARCHAR(255) NULL,
  file_mime_type VARCHAR(100) NULL,
  file_original_name VARCHAR(255) NULL,
  status VARCHAR(20) NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_arsip_kategori FOREIGN KEY (id_kategori) REFERENCES kategori_dokumen(id_kategori) ON DELETE SET NULL,
  CONSTRAINT fk_arsip_siswa FOREIGN KEY (id_siswa) REFERENCES siswa(id_siswa) ON DELETE SET NULL,
  CONSTRAINT fk_arsip_pengunggah FOREIGN KEY (id_pengunggah) REFERENCES pengguna(id_pengguna) ON DELETE SET NULL,
  CONSTRAINT fk_arsip_verifikator FOREIGN KEY (id_verifikator) REFERENCES pengguna(id_pengguna) ON DELETE SET NULL,
  CONSTRAINT fk_arsip_penyerah FOREIGN KEY (id_penyerah) REFERENCES pengguna(id_pengguna) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Tabel dokumen legacy (tersinkron dengan dokumen_arsip)
CREATE TABLE IF NOT EXISTS dokumen (
  id_dokumen INT AUTO_INCREMENT PRIMARY KEY,
  id INT NULL UNIQUE,
  siswa_id INT NULL,
  id_siswa INT NULL,
  id_kategori INT NULL,
  id_pengguna INT NULL,
  id_pengunggah INT NULL,
  id_verifikator INT NULL,
  id_penyerah INT NULL,
  nama VARCHAR(255) NOT NULL,
  nama_dokumen VARCHAR(255) NULL,
  kategori VARCHAR(100) NOT NULL,
  nomor_dokumen VARCHAR(100) NULL,
  tanggal_dokumen DATE NULL,
  tahun VARCHAR(20) NOT NULL,
  tahun_dokumen VARCHAR(20) NULL,
  jenis VARCHAR(50) DEFAULT 'Fisik + Digital',
  jenis_penyimpanan VARCHAR(50) NULL,
  sumber_unggah VARCHAR(50) DEFAULT 'staf_tu',
  file_url VARCHAR(255) NULL,
  drive_file_id VARCHAR(255) NULL,
  file_mime_type VARCHAR(100) NULL,
  file_original_name VARCHAR(255) NULL,
  file_dokumen VARCHAR(255) NULL,
  status VARCHAR(20) DEFAULT 'ok',
  status_kelengkapan VARCHAR(30) NULL,
  status_verifikasi VARCHAR(30) DEFAULT 'terverifikasi',
  catatan_verifikasi TEXT NULL,
  tanggal_unggah DATETIME NULL,
  status_penyerahan VARCHAR(50) DEFAULT 'belum_diserahkan',
  tanggal_penyerahan DATETIME NULL,
  diambil_oleh VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (id_siswa) REFERENCES siswa(id_siswa) ON DELETE SET NULL,
  FOREIGN KEY (id_kategori) REFERENCES kategori_dokumen(id_kategori) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 10. TABEL LOG_AKTIVITAS (ERD 2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS log_aktivitas (
  id_log INT AUTO_INCREMENT PRIMARY KEY,
  id_pengguna INT NULL,
  id_siswa INT NULL,
  waktu_aktivitas DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  jenis_aktivitas VARCHAR(100) NOT NULL,
  nama_tabel VARCHAR(100) NULL,
  id_data INT NULL,
  keterangan TEXT NOT NULL,
  alamat_ip VARCHAR(50) NULL,
  -- Kompatibilitas legacy
  id INT NULL UNIQUE,
  waktu VARCHAR(50) NULL,
  teks TEXT NULL,
  created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_log_pengguna FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna) ON DELETE SET NULL,
  CONSTRAINT fk_log_siswa FOREIGN KEY (id_siswa) REFERENCES siswa(id_siswa) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 11. TABEL JADWAL_BACKUP (ERD 2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS jadwal_backup (
  id_jadwal INT AUTO_INCREMENT PRIMARY KEY,
  nama_jadwal VARCHAR(100) NOT NULL DEFAULT 'Cadangan Harian Otomatis',
  tipe_backup VARCHAR(50) NOT NULL DEFAULT 'full',
  ruang_lingkup VARCHAR(100) NOT NULL DEFAULT 'seluruh_database',
  frekuensi VARCHAR(50) NOT NULL DEFAULT 'harian',
  hari VARCHAR(50) NULL DEFAULT 'Senin-Sabtu',
  jam_backup TIME NOT NULL DEFAULT '16:00:00',
  masa_simpan_hari INT NOT NULL DEFAULT 30,
  status_jadwal VARCHAR(30) NOT NULL DEFAULT 'aktif'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 12. TABEL BACKUP (ERD 2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS backup (
  id_backup INT AUTO_INCREMENT PRIMARY KEY,
  id_jadwal INT NULL,
  id_pengguna INT NULL,
  pemicu VARCHAR(50) NOT NULL DEFAULT 'manual',
  tipe_backup VARCHAR(50) NOT NULL DEFAULT 'full',
  ruang_lingkup VARCHAR(100) NOT NULL DEFAULT 'seluruh_database',
  waktu_mulai DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  waktu_selesai DATETIME NULL,
  ukuran_file VARCHAR(50) NULL,
  lokasi_file VARCHAR(255) NULL,
  checksum VARCHAR(128) NULL,
  status_backup VARCHAR(30) NOT NULL DEFAULT 'menunggu',
  tanggal_kadaluarsa DATETIME NULL,
  keterangan TEXT NULL,
  -- Kompatibilitas legacy
  jam_backup TIME NULL,
  CONSTRAINT fk_backup_jadwal FOREIGN KEY (id_jadwal) REFERENCES jadwal_backup(id_jadwal) ON DELETE SET NULL,
  CONSTRAINT fk_backup_pengguna FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 13. TABEL ANTRIAN_BACKUP (ERD 2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS antrian_backup (
  id_antrian INT AUTO_INCREMENT PRIMARY KEY,
  id_log INT NOT NULL UNIQUE,
  id_backup INT NULL,
  waktu_masuk DATETIME DEFAULT CURRENT_TIMESTAMP,
  waktu_diproses DATETIME NULL,
  status_antrian VARCHAR(30) DEFAULT 'menunggu',
  jumlah_percobaan INT DEFAULT 0,
  CONSTRAINT fk_antrian_log FOREIGN KEY (id_log) REFERENCES log_aktivitas(id_log) ON DELETE CASCADE,
  CONSTRAINT fk_antrian_backup FOREIGN KEY (id_backup) REFERENCES backup(id_backup) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 14. TABEL DETAIL_BACKUP (ERD 2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS detail_backup (
  id_detail_backup INT AUTO_INCREMENT PRIMARY KEY,
  id_backup INT NOT NULL,
  nama_tabel VARCHAR(100) NOT NULL,
  jumlah_record INT NOT NULL DEFAULT 0,
  status_detail VARCHAR(30) NOT NULL DEFAULT 'berhasil',
  CONSTRAINT fk_detail_backup_backup FOREIGN KEY (id_backup) REFERENCES backup(id_backup) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 15. TABEL TITIK_PENYIMPANAN (ERD 2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS titik_penyimpanan (
  id_titik INT AUTO_INCREMENT PRIMARY KEY,
  nama_titik VARCHAR(100) NOT NULL UNIQUE,
  jenis_penyimpanan VARCHAR(50) NOT NULL,
  lokasi VARCHAR(255) NOT NULL,
  status_titik VARCHAR(30) NOT NULL DEFAULT 'aktif'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 16. TABEL DETAIL_SINKRON (ERD 2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS detail_sinkron (
  id_detail INT AUTO_INCREMENT PRIMARY KEY,
  id_backup INT NOT NULL,
  id_titik INT NOT NULL,
  waktu_sinkron DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status_sinkron VARCHAR(30) NOT NULL DEFAULT 'berhasil',
  keterangan TEXT NULL,
  CONSTRAINT fk_sinkron_backup FOREIGN KEY (id_backup) REFERENCES backup(id_backup) ON DELETE CASCADE,
  CONSTRAINT fk_sinkron_titik FOREIGN KEY (id_titik) REFERENCES titik_penyimpanan(id_titik) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 17. TABEL PEMULIHAN_DATA (ERD 2)
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS pemulihan_data (
  id_pemulihan INT AUTO_INCREMENT PRIMARY KEY,
  id_backup INT NOT NULL,
  id_pengguna INT NULL,
  ruang_lingkup VARCHAR(100) NOT NULL DEFAULT 'seluruh_database',
  waktu_mulai DATETIME DEFAULT CURRENT_TIMESTAMP,
  waktu_selesai DATETIME NULL,
  status_pemulihan VARCHAR(30) NOT NULL DEFAULT 'sukses',
  alasan TEXT NULL,
  CONSTRAINT fk_pemulihan_backup FOREIGN KEY (id_backup) REFERENCES backup(id_backup) ON DELETE RESTRICT,
  CONSTRAINT fk_pemulihan_pengguna FOREIGN KEY (id_pengguna) REFERENCES pengguna(id_pengguna) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- 18. TABEL TAMBAHAN: SESI_TU
-- ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS sesi_tu (
  token_hash CHAR(64) PRIMARY KEY,
  id_pengguna INT NOT NULL,
  expires_at DATETIME NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_sesi_tu_expiration (expires_at),
  CONSTRAINT fk_sesi_tu_pengguna FOREIGN KEY (id_pengguna)
    REFERENCES pengguna(id_pengguna) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------
-- SEED DATA AWAL
-- ---------------------------------------------------------
INSERT IGNORE INTO kategori_dokumen (nama_kategori, deskripsi) VALUES
  ('Ijazah', 'Arsip ijazah kelulusan dan dokumen penamat pendidikan siswa'),
  ('Akta Kelahiran', 'Arsip kutipan akta kelahiran resmi siswa'),
  ('Kartu Keluarga', 'Arsip salinan kartu keluarga orang tua/wali siswa'),
  ('Rapor', 'Buku atau lembar laporan hasil belajar semester siswa'),
  ('Surat masuk/keluar', 'Arsip surat resmi administrasi terkait mutasi atau izin'),
  ('Organisasi', 'Sertifikat dan arsip keanggotaan organisasi atau ekskul siswa'),
  ('Lainnya', 'Arsip piagam penghargaan, surat keterangan, dan dokumen pendukung');

INSERT IGNORE INTO mata_pelajaran (kode_mapel, nama_mapel, kelompok_mapel, kkm) VALUES
  ('PAI', 'Pendidikan Agama Islam & Budi Pekerti', 'Kelompok A (Wajib)', 75.00),
  ('PPKN', 'Pendidikan Pancasila dan Kewarganegaraan', 'Kelompok A (Wajib)', 75.00),
  ('BINDO', 'Bahasa Indonesia', 'Kelompok A (Wajib)', 75.00),
  ('MTK', 'Matematika', 'Kelompok A (Wajib)', 75.00),
  ('IPA', 'Ilmu Pengetahuan Alam', 'Kelompok A (Wajib)', 75.00),
  ('IPS', 'Ilmu Pengetahuan Sosial', 'Kelompok A (Wajib)', 75.00),
  ('BING', 'Bahasa Inggris', 'Kelompok A (Wajib)', 75.00),
  ('SBK', 'Seni Budaya', 'Kelompok B', 75.00),
  ('PJOK', 'Pendidikan Jasmani, Olahraga, dan Kesehatan', 'Kelompok B', 75.00),
  ('INFOR', 'Informatika / Prakarya', 'Kelompok B', 75.00);

INSERT IGNORE INTO titik_penyimpanan (nama_titik, jenis_penyimpanan, lokasi, status_titik) VALUES
  ('Laptop Sekolah', 'lokal', 'Laptop Server Tata Usaha Sekolah', 'aktif'),
  ('Laptop Admin TU', 'lokal', 'Laptop Kerja Staf Tata Usaha', 'aktif'),
  ('Google Drive Sekolah', 'cloud', 'Google Drive Arsip SMP Muh 1', 'aktif');

INSERT IGNORE INTO jadwal_backup (nama_jadwal, tipe_backup, ruang_lingkup, frekuensi, hari, jam_backup, masa_simpan_hari, status_jadwal)
VALUES ('Cadangan Harian Otomatis', 'full', 'seluruh_database', 'harian', 'Senin-Sabtu', '16:00:00', 30, 'aktif');
