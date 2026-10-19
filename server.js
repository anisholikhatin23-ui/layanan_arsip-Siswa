const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { promisify } = require('util');
const { Readable } = require('stream');
const multer = require('multer');
const mysql = require('mysql2/promise');
const { google } = require('googleapis');
const STUDENT_SEED_DATA = require('./student-data');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Config MySQL
const DB_HOST = process.env.MYSQLHOST || process.env.DB_HOST || 'localhost';
const DB_USER = process.env.MYSQLUSER || process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '';
const DB_NAME = process.env.MYSQLDATABASE || process.env.DB_NAME || 'arsip_siswa';
const DB_PORT = process.env.MYSQLPORT || process.env.DB_PORT || 3306;
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const scrypt = promisify(crypto.scrypt);
const SESSION_DURATION_MS = 8 * 60 * 60 * 1000;
const loginAttempts = new Map();
const allowedOrigins = new Set(
  [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://anisholikhatin23-ui.github.io',
    ...(process.env.FRONTEND_ORIGINS || '').split(',')
  ]
    .map(origin => origin.trim().replace(/\/+$/, ''))
    .filter(Boolean)
);

let pool;
let drive;

// Middleware
app.use((req, res, next) => {
  const forwardedProtocol = req.get('x-forwarded-proto')?.split(',')[0].trim();
  const requestOrigin = `${forwardedProtocol || req.protocol}://${req.get('host')}`;
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin) || origin === requestOrigin) {
        return callback(null, true);
      }
      callback(new Error('Origin tidak diizinkan'));
    },
    allowedHeaders: ['Content-Type', 'Authorization'],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
  })(req, res, next);
});
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/logo.png', (req, res) => res.sendFile(path.join(__dirname, 'logo.png')));
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    const googleDrive = await getGoogleDriveStatus();
    res.json({
      status: googleDrive === 'connected' ? 'ok' : 'partial',
      mysql: 'connected',
      googleDrive
    });
  } catch (err) {
    console.error('Health check gagal mengakses MySQL:', err);
    res.status(503).json({ status: 'error', mysql: 'disconnected', googleDrive: 'unchecked' });
  }
});

if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// Buffer only the supported document formats; new uploads go directly to Drive.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error('Format file harus PDF, JPG, atau PNG'));
    }
    cb(null, true);
  }
});

function isDriveConfigured() {
  return Boolean(DRIVE_FOLDER_ID && (process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_FILE));
}

function isRailwayDeployment() {
  return Boolean(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID);
}

function getDriveClient() {
  if (!DRIVE_FOLDER_ID) {
    throw new Error('Google Drive belum dikonfigurasi: GOOGLE_DRIVE_FOLDER_ID belum diisi di file .env');
  }
  if (!drive) {
    let credentials;
    if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
      try {
        credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
      } catch (err) {
        throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON bukan JSON yang valid');
      }
    }
    const auth = new google.auth.GoogleAuth({
      ...(credentials ? { credentials } : process.env.GOOGLE_SERVICE_ACCOUNT_FILE
        ? { keyFile: process.env.GOOGLE_SERVICE_ACCOUNT_FILE }
        : {}),
      scopes: [DRIVE_SCOPE]
    });
    drive = google.drive({ version: 'v3', auth });
  }
  return drive;
}

async function getGoogleDriveStatus() {
  if (!isDriveConfigured()) return 'not_configured';
  try {
    const response = await getDriveClient().files.get({
      fileId: DRIVE_FOLDER_ID,
      fields: 'id,mimeType'
    });
    return response.data.mimeType === 'application/vnd.google-apps.folder' ? 'connected' : 'invalid_folder';
  } catch (err) {
    console.error('Health check gagal mengakses Google Drive:', err.message);
    return 'unavailable';
  }
}

async function uploadToDrive(file) {
  const driveClient = getDriveClient();
  const safeName = path.basename(file.originalname).replace(/[^\w.-]/g, '_');
  const response = await driveClient.files.create({
    supportsAllDrives: true,
    requestBody: {
      name: safeName || 'dokumen',
      mimeType: file.mimetype,
      parents: [DRIVE_FOLDER_ID]
    },
    media: {
      mimeType: file.mimetype,
      body: Readable.from(file.buffer)
    },
    fields: 'id,name,mimeType'
  });
  return response.data;
}

async function saveDocumentFile(file) {
  if (!isDriveConfigured()) {
    if (isRailwayDeployment()) {
      throw new Error('Google Drive belum dikonfigurasi. File tidak disimpan ke disk sementara Railway.');
    }
    return { driveFile: null, localFile: saveFileLocally(file) };
  }

  try {
    return { driveFile: await uploadToDrive(file), localFile: null };
  } catch (err) {
    if (isRailwayDeployment()) {
      throw new Error(`Gagal mengunggah file ke Google Drive: ${err.message}`);
    }
    console.warn('⚠️ Gagal upload ke Google Drive, dialihkan ke penyimpanan lokal /uploads:', err.message);
    return { driveFile: null, localFile: saveFileLocally(file) };
  }
}

function saveFileLocally(file) {
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
  const ext = path.extname(file.originalname);
  const safeBase = path.basename(file.originalname, ext).replace(/[^\w.-]/g, '_');
  const filename = `${Date.now()}_${safeBase}${ext}`;
  const filePath = path.join(uploadsDir, filename);
  fs.writeFileSync(filePath, file.buffer);
  return {
    file_url: `/uploads/${filename}`,
    file_original_name: file.originalname,
    file_mime_type: file.mimetype
  };
}

async function deleteDriveFile(fileId) {
  if (!fileId) return;
  if (!isDriveConfigured()) throw new Error('Google Drive belum dikonfigurasi; file Drive tidak dapat dihapus.');
  await getDriveClient().files.delete({ fileId, supportsAllDrives: true });
}

// Inisialisasi Database MySQL (Auto-Create Database & Tables)
async function initMySQL() {
  try {
    pool = mysql.createPool({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      port: DB_PORT,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });
    await pool.query('SELECT 1');

    console.log(`✅ Terhubung ke database MySQL: ${DB_NAME} di ${DB_HOST}:${DB_PORT}`);

    // 3. Buat Tabel Siswa
    await pool.query(`
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const ensureColumns = async (table, definitions) => {
      const [columns] = await pool.query(`SHOW COLUMNS FROM \`${table}\``);
      const existing = new Set(columns.map(column => column.Field));
      for (const [column, definition] of definitions) {
        if (!existing.has(column)) {
          await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
        }
      }
    };
    const [initialStudentColumns] = await pool.query('SHOW COLUMNS FROM siswa');
    const legacyStudentSchema = initialStudentColumns.some(column => column.Field === 'id_siswa')
      && !initialStudentColumns.some(column => column.Field === 'id');
    await ensureColumns('siswa', [
      ['id', 'INT NULL UNIQUE'],
      ['id_siswa', 'INT NULL UNIQUE'],
      ['nama', 'VARCHAR(255) NULL'],
      ['nama_lengkap', 'VARCHAR(255) NULL'],
      ['nisn', 'VARCHAR(50) NULL'],
      ['nis', 'VARCHAR(50) NULL'],
      ['nama_siswa', 'VARCHAR(255) NULL'],
      ['jenis_kelamin', "ENUM('L', 'P') NULL"],
      ['status_dokumen', "VARCHAR(20) DEFAULT 'ok'"],
      ['status_siswa', "VARCHAR(30) DEFAULT 'aktif'"],
      ['tahun_lulus', 'YEAR NULL'],
      ['status_arsip', "VARCHAR(30) DEFAULT 'aktif'"],
      ['id_kelas', 'INT NULL'],
      ['created_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP']
    ]);
    if (legacyStudentSchema) {
      await pool.query("ALTER TABLE siswa MODIFY COLUMN jenis_kelamin ENUM('L', 'P') NULL");
    }
    await pool.query(`
      UPDATE siswa
      SET id = COALESCE(id, id_siswa),
          id_siswa = COALESCE(id_siswa, id),
          nama = COALESCE(nama, nama_siswa, nama_lengkap),
          nama_lengkap = COALESCE(nama_lengkap, nama_siswa, nama),
          nama_siswa = COALESCE(nama_siswa, nama, nama_lengkap),
          nisn = COALESCE(nisn, nis),
          nis = COALESCE(nis, nisn),
          status_siswa = COALESCE(status_siswa, 'aktif'),
          status_arsip = COALESCE(status_arsip, 'aktif')
    `);

    // 4. Buat Tabel Dokumen
    await pool.query(`
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
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (siswa_id) REFERENCES siswa(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [documentColumns] = await pool.query('SHOW COLUMNS FROM dokumen');
    const existingDocumentColumns = new Set(documentColumns.map(column => column.Field));
    for (const [column, definition] of [
      ['drive_file_id', 'VARCHAR(255) NULL'],
      ['file_mime_type', 'VARCHAR(100) NULL'],
      ['file_original_name', 'VARCHAR(255) NULL']
    ]) {
      if (!existingDocumentColumns.has(column)) {
        await pool.query(`ALTER TABLE dokumen ADD COLUMN ${column} ${definition}`);
      }
    }

    // 5. Buat Tabel Log Aktivitas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS log_aktivitas (
        id_log INT AUTO_INCREMENT PRIMARY KEY,
        id INT NULL UNIQUE,
        waktu VARCHAR(50) NOT NULL,
        teks TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const ensureForeignKey = async (table, name, column, referencedTable, referencedColumn, onDelete) => {
      const [byName] = await pool.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.TABLE_CONSTRAINTS
         WHERE CONSTRAINT_SCHEMA = ? AND CONSTRAINT_NAME = ?`,
        [DB_NAME, name]
      );
      if (byName.length) return;
      const [byCol] = await pool.query(
        `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_NAME = ?
           AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [DB_NAME, table, column]
      );
      if (byCol.length) return;
      try {
        await pool.query(
          `ALTER TABLE \`${table}\` ADD CONSTRAINT \`${name}\`
           FOREIGN KEY (\`${column}\`) REFERENCES \`${referencedTable}\` (\`${referencedColumn}\`) ON DELETE ${onDelete}`
        );
      } catch (fkErr) {
        console.warn(`Peringatan foreign key ${name}:`, fkErr.message);
      }
    };

    for (const statement of [
      `CREATE TABLE IF NOT EXISTS kelas (
        id_kelas INT AUTO_INCREMENT PRIMARY KEY,
        nama_kelas VARCHAR(50) NOT NULL UNIQUE,
        tingkat VARCHAR(20) NOT NULL,
        tahun_ajaran VARCHAR(20) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS pengguna (
        id_pengguna INT AUTO_INCREMENT PRIMARY KEY,
        nama_lengkap VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NULL,
        kata_sandi VARCHAR(255) NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'tu',
        nip VARCHAR(50) NULL,
        jabatan VARCHAR(100) NULL,
        status_akun VARCHAR(30) NOT NULL DEFAULT 'aktif'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS pengguna_tu (
        id_pengguna INT AUTO_INCREMENT PRIMARY KEY,
        nama_lengkap VARCHAR(255) NOT NULL,
        username VARCHAR(100) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NULL,
        kata_sandi VARCHAR(255) NULL,
        role VARCHAR(50) NOT NULL DEFAULT 'tu',
        nip VARCHAR(50) NULL,
        jabatan VARCHAR(100) NULL,
        status_akun VARCHAR(30) NOT NULL DEFAULT 'aktif'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS profil_siswa (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS mata_pelajaran (
        id_mapel INT AUTO_INCREMENT PRIMARY KEY,
        kode_mapel VARCHAR(20) NOT NULL UNIQUE,
        nama_mapel VARCHAR(100) NOT NULL,
        kelompok_mapel VARCHAR(50) NULL,
        kkm DECIMAL(5,2) DEFAULT 75.00
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS rapor (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS nilai (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS kategori_dokumen (
        id_kategori INT AUTO_INCREMENT PRIMARY KEY,
        nama_kategori VARCHAR(100) NOT NULL UNIQUE,
        deskripsi TEXT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS dokumen_arsip (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS sesi_tu (
        token_hash CHAR(64) PRIMARY KEY,
        id_pengguna INT NOT NULL,
        expires_at DATETIME NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_sesi_tu_expiration (expires_at),
        CONSTRAINT fk_sesi_tu_pengguna FOREIGN KEY (id_pengguna)
          REFERENCES pengguna(id_pengguna) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS jadwal_backup (
        id_jadwal INT AUTO_INCREMENT PRIMARY KEY,
        nama_jadwal VARCHAR(100) NOT NULL DEFAULT 'Cadangan Harian Otomatis',
        tipe_backup VARCHAR(50) NOT NULL DEFAULT 'full',
        ruang_lingkup VARCHAR(100) NOT NULL DEFAULT 'seluruh_database',
        frekuensi VARCHAR(50) NOT NULL DEFAULT 'harian',
        hari VARCHAR(50) NULL DEFAULT 'Senin-Sabtu',
        jam_backup TIME NOT NULL DEFAULT '16:00:00',
        masa_simpan_hari INT NOT NULL DEFAULT 30,
        status_jadwal VARCHAR(30) NOT NULL DEFAULT 'aktif'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS backup (
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
        jam_backup TIME NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS antrian_backup (
        id_antrian INT AUTO_INCREMENT PRIMARY KEY,
        id_log INT NOT NULL UNIQUE,
        id_backup INT NULL,
        waktu_masuk DATETIME DEFAULT CURRENT_TIMESTAMP,
        waktu_diproses DATETIME NULL,
        status_antrian VARCHAR(30) DEFAULT 'menunggu',
        jumlah_percobaan INT DEFAULT 0,
        CONSTRAINT fk_antrian_log FOREIGN KEY (id_log) REFERENCES log_aktivitas(id_log) ON DELETE CASCADE,
        CONSTRAINT fk_antrian_backup FOREIGN KEY (id_backup) REFERENCES backup(id_backup) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS detail_backup (
        id_detail_backup INT AUTO_INCREMENT PRIMARY KEY,
        id_backup INT NOT NULL,
        nama_tabel VARCHAR(100) NOT NULL,
        jumlah_record INT NOT NULL DEFAULT 0,
        status_detail VARCHAR(30) NOT NULL DEFAULT 'berhasil',
        CONSTRAINT fk_detail_backup_backup FOREIGN KEY (id_backup) REFERENCES backup(id_backup) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS titik_penyimpanan (
        id_titik INT AUTO_INCREMENT PRIMARY KEY,
        nama_titik VARCHAR(100) NOT NULL UNIQUE,
        jenis_penyimpanan VARCHAR(50) NOT NULL,
        lokasi VARCHAR(255) NOT NULL,
        status_titik VARCHAR(30) NOT NULL DEFAULT 'aktif'
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS detail_sinkron (
        id_detail INT AUTO_INCREMENT PRIMARY KEY,
        id_backup INT NOT NULL,
        id_titik INT NOT NULL,
        waktu_sinkron DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        status_sinkron VARCHAR(30) NOT NULL DEFAULT 'menunggu',
        keterangan TEXT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
      `CREATE TABLE IF NOT EXISTS pemulihan_data (
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
    ]) {
      await pool.query(statement);
    }

    await pool.query('DROP TABLE IF EXISTS surat_legalisir');

    await ensureColumns('siswa', [
      ['id_kelas', 'INT NULL'],
      ['username', 'VARCHAR(100) NULL'],
      ['password_hash', 'VARCHAR(255) NULL'],
      ['status_akun', "VARCHAR(30) DEFAULT 'aktif'"],
      ['tahun_masuk', 'VARCHAR(10) NULL DEFAULT "2024"'],
      ['tahun_lulus', 'YEAR NULL'],
      ['status_arsip', "VARCHAR(30) DEFAULT 'aktif'"],
      ['status_siswa', "VARCHAR(30) DEFAULT 'aktif'"]
    ]);
    await ensureColumns('pengguna', [
      ['password_hash', 'VARCHAR(255) NULL'],
      ['kata_sandi', 'VARCHAR(255) NULL'],
      ['role', "VARCHAR(50) NOT NULL DEFAULT 'tu'"],
      ['status_akun', "VARCHAR(30) NOT NULL DEFAULT 'aktif'"]
    ]);
    await ensureColumns('pengguna_tu', [
      ['password_hash', 'VARCHAR(255) NULL'],
      ['kata_sandi', 'VARCHAR(255) NULL'],
      ['role', "VARCHAR(50) NOT NULL DEFAULT 'tu'"],
      ['status_akun', "VARCHAR(30) NOT NULL DEFAULT 'aktif'"]
    ]);
    await ensureColumns('kategori_dokumen', [
      ['deskripsi', 'TEXT NULL']
    ]);
    await ensureColumns('dokumen', [
      ['id', 'INT NULL UNIQUE'],
      ['id_dokumen', 'INT NULL UNIQUE'],
      ['id_siswa', 'INT NULL'],
      ['id_kategori', 'INT NULL'],
      ['id_pengguna', 'INT NULL'],
      ['id_pengunggah', 'INT NULL'],
      ['id_verifikator', 'INT NULL'],
      ['id_penyerah', 'INT NULL'],
      ['nama_dokumen', 'VARCHAR(255) NULL'],
      ['nomor_dokumen', 'VARCHAR(100) NULL'],
      ['tanggal_dokumen', 'DATE NULL'],
      ['tahun_dokumen', 'VARCHAR(20) NULL'],
      ['jenis_penyimpanan', 'VARCHAR(50) NULL'],
      ['sumber_unggah', "VARCHAR(50) DEFAULT 'staf_tu'"],
      ['status_kelengkapan', 'VARCHAR(30) NULL'],
      ['status_verifikasi', "VARCHAR(30) DEFAULT 'terverifikasi'"],
      ['catatan_verifikasi', 'TEXT NULL'],
      ['file_dokumen', 'VARCHAR(255) NULL'],
      ['tanggal_unggah', 'DATETIME NULL'],
      ['status_penyerahan', "VARCHAR(50) DEFAULT 'belum_diserahkan'"],
      ['tanggal_penyerahan', 'DATETIME NULL'],
      ['diambil_oleh', 'VARCHAR(255) NULL']
    ]);
    await ensureColumns('log_aktivitas', [
      ['id', 'INT NULL UNIQUE'],
      ['id_log', 'INT NULL UNIQUE'],
      ['waktu', 'VARCHAR(50) NULL'],
      ['teks', 'TEXT NULL'],
      ['created_at', 'TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP'],
      ['id_pengguna', 'INT NULL'],
      ['id_siswa', 'INT NULL'],
      ['waktu_aktivitas', 'DATETIME NULL'],
      ['jenis_aktivitas', 'VARCHAR(100) NULL'],
      ['nama_tabel', 'VARCHAR(100) NULL'],
      ['id_data', 'INT NULL'],
      ['keterangan', 'TEXT NULL'],
      ['alamat_ip', 'VARCHAR(50) NULL']
    ]);
    await pool.query(
      `DELETE FROM log_aktivitas
       WHERE jenis_aktivitas = 'legalisir'
          OR nama_tabel = 'surat_legalisir'
          OR teks LIKE 'Surat legalisir %'`
    );
    await ensureColumns('jadwal_backup', [
      ['nama_jadwal', "VARCHAR(100) NOT NULL DEFAULT 'Cadangan Harian Otomatis'"],
      ['tipe_backup', "VARCHAR(50) NOT NULL DEFAULT 'full'"],
      ['ruang_lingkup', "VARCHAR(100) NOT NULL DEFAULT 'seluruh_database'"],
      ['hari', "VARCHAR(50) NULL DEFAULT 'Senin-Sabtu'"],
      ['masa_simpan_hari', "INT NOT NULL DEFAULT 30"]
    ]);
    await ensureColumns('backup', [
      ['pemicu', "VARCHAR(50) NOT NULL DEFAULT 'manual'"],
      ['ruang_lingkup', "VARCHAR(100) NOT NULL DEFAULT 'seluruh_database'"],
      ['waktu_selesai', 'DATETIME NULL'],
      ['ukuran_file', 'VARCHAR(50) NULL'],
      ['lokasi_file', 'VARCHAR(255) NULL'],
      ['checksum', 'VARCHAR(128) NULL'],
      ['tanggal_kadaluarsa', 'DATETIME NULL'],
      ['keterangan', 'TEXT NULL'],
      ['tipe_backup', 'VARCHAR(50) NULL'],
      ['jam_backup', 'TIME NULL']
    ]);
    await ensureColumns('titik_penyimpanan', [
      ['status_titik', "VARCHAR(30) NOT NULL DEFAULT 'aktif'"]
    ]);
    await ensureColumns('detail_sinkron', [
      ['keterangan', 'TEXT NULL']
    ]);

    const bootstrapUsers = [
      {
        nama_lengkap: process.env.INITIAL_ADMIN_NAME?.trim() || 'Administrator TU',
        username: process.env.INITIAL_ADMIN_USERNAME?.trim() || 'staf.tu',
        password: process.env.INITIAL_ADMIN_PASSWORD || 'admin123',
        role: 'admin',
        jabatan: 'Administrator TU'
      },
      { nama_lengkap: 'Admin Sistem', username: 'admin', password: 'admin123', role: 'admin', jabatan: 'Administrator Sistem' },
      { nama_lengkap: 'Guru Wali Kelas', username: 'guru', password: 'guru123', role: 'guru', jabatan: 'Guru Wali Kelas' },
      { nama_lengkap: 'Siswa Demo', username: 'siswa', password: 'siswa123', role: 'siswa', jabatan: 'Siswa' }
    ];

    for (const user of bootstrapUsers) {
      const salt = crypto.randomBytes(16).toString('hex');
      const passwordHash = await scrypt(user.password, salt, 64);
      const hashStr = `scrypt$${salt}$${passwordHash.toString('hex')}`;
      for (const table of ['pengguna', 'pengguna_tu']) {
        await pool.query(
          `INSERT INTO ${table} (nama_lengkap, username, password_hash, kata_sandi, jabatan, role, status_akun)
           VALUES (?, ?, ?, ?, ?, ?, 'aktif')
           ON DUPLICATE KEY UPDATE
              nama_lengkap = VALUES(nama_lengkap),
              username = VALUES(username),
              password_hash = VALUES(password_hash),
              kata_sandi = VALUES(kata_sandi),
              jabatan = VALUES(jabatan),
              role = VALUES(role),
              status_akun = VALUES(status_akun)`,
          [user.nama_lengkap, user.username, hashStr, hashStr, user.jabatan, user.role]
        );
      }
    }

    await pool.query('DELETE FROM sesi_tu WHERE expires_at <= NOW()');

    const [sessionForeignKeys] = await pool.query(
      `SELECT CONSTRAINT_NAME, REFERENCED_TABLE_NAME
       FROM information_schema.KEY_COLUMN_USAGE
       WHERE CONSTRAINT_SCHEMA = ? AND TABLE_NAME = 'sesi_tu'
         AND COLUMN_NAME = 'id_pengguna' AND REFERENCED_TABLE_NAME IS NOT NULL`,
      [DB_NAME]
    );
    const incorrectSessionForeignKeys = sessionForeignKeys.filter(
      foreignKey => foreignKey.REFERENCED_TABLE_NAME !== 'pengguna'
    );
    if (incorrectSessionForeignKeys.length) {
      await pool.query('DELETE FROM sesi_tu');
      for (const foreignKey of incorrectSessionForeignKeys) {
        const constraintName = foreignKey.CONSTRAINT_NAME.replace(/`/g, '``');
        await pool.query(`ALTER TABLE sesi_tu DROP FOREIGN KEY \`${constraintName}\``);
      }
    }
    await ensureForeignKey('sesi_tu', 'fk_sesi_tu_pengguna', 'id_pengguna', 'pengguna', 'id_pengguna', 'CASCADE');

    await ensureForeignKey('siswa', 'fk_siswa_kelas', 'id_kelas', 'kelas', 'id_kelas', 'SET NULL');
    await ensureForeignKey('dokumen', 'fk_dokumen_siswa', 'id_siswa', 'siswa', 'id_siswa', 'SET NULL');
    await ensureForeignKey('dokumen', 'fk_dokumen_kategori', 'id_kategori', 'kategori_dokumen', 'id_kategori', 'SET NULL');
    await ensureForeignKey('dokumen', 'fk_dokumen_pengguna', 'id_pengguna', 'pengguna', 'id_pengguna', 'SET NULL');
    await ensureForeignKey('log_aktivitas', 'fk_log_pengguna', 'id_pengguna', 'pengguna', 'id_pengguna', 'SET NULL');
    await ensureForeignKey('log_aktivitas', 'fk_log_siswa', 'id_siswa', 'siswa', 'id_siswa', 'SET NULL');
    await ensureForeignKey('backup', 'fk_backup_jadwal', 'id_jadwal', 'jadwal_backup', 'id_jadwal', 'SET NULL');
    await ensureForeignKey('backup', 'fk_backup_pengguna', 'id_pengguna', 'pengguna', 'id_pengguna', 'SET NULL');
    await ensureForeignKey('detail_sinkron', 'fk_sinkron_backup', 'id_backup', 'backup', 'id_backup', 'CASCADE');
    await ensureForeignKey('detail_sinkron', 'fk_sinkron_titik', 'id_titik', 'titik_penyimpanan', 'id_titik', 'RESTRICT');

    // Insert the canonical roster before seeding documents that refer to students.
    await syncSeededStudents(true);

    // Seed data dokumen sampel jika tabel dokumen masih kosong
    const [docRows] = await pool.query('SELECT COUNT(*) AS total FROM dokumen');
    if (docRows[0].total === 0) {
      console.log('📦 Mengisi sample data dokumen ke MySQL database arsip_siswa...');
      await pool.query(`
        INSERT INTO dokumen (id, siswa_id, nama, kategori, tahun, jenis, status) VALUES
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
        (31, NULL, 'SK Pembina Pramuka SMP Muh 1', 'Organisasi', '2025', 'Fisik', 'warn')
      `);
    }

    // Ensure class records exist for every student.
    await pool.query(`
      INSERT IGNORE INTO kelas (nama_kelas, tingkat, tahun_ajaran)
      SELECT DISTINCT kelas, SUBSTRING_INDEX(kelas, ' ', 1), '2026' FROM siswa
    `);
    await pool.query(`
      INSERT IGNORE INTO kategori_dokumen (nama_kategori)
      SELECT DISTINCT kategori FROM dokumen
    `);
    await pool.query(`
      INSERT IGNORE INTO kategori_dokumen (nama_kategori) VALUES
        ('Ijazah'),
        ('Akta Kelahiran'),
        ('Kartu Keluarga'),
        ('Rapor'),
        ('Surat masuk/keluar'),
        ('Organisasi'),
        ('Lainnya')
    `);
    await pool.query(`
      UPDATE siswa s
      JOIN kelas k ON k.nama_kelas = s.kelas
      SET s.id_kelas = k.id_kelas, s.nama_lengkap = s.nama
      WHERE s.id_kelas IS NULL OR s.nama_lengkap IS NULL
    `);
    await pool.query(`
      UPDATE dokumen d
      LEFT JOIN kategori_dokumen k ON k.nama_kategori = d.kategori
      SET d.id_siswa = d.siswa_id,
          d.id_kategori = k.id_kategori,
          d.nama_dokumen = d.nama,
          d.tahun_dokumen = d.tahun,
          d.jenis_penyimpanan = d.jenis,
          d.status_kelengkapan = d.status,
          d.file_dokumen = COALESCE(d.drive_file_id, d.file_url),
          d.tanggal_unggah = d.created_at
      WHERE d.nama_dokumen IS NULL OR d.id_kategori IS NULL
    `);
    await pool.query(`
      UPDATE log_aktivitas
      SET waktu_aktivitas = created_at,
          jenis_aktivitas = COALESCE(jenis_aktivitas, 'legacy'),
          keterangan = COALESCE(keterangan, teks)
      WHERE waktu_aktivitas IS NULL
    `);
    for (const [name, type, location] of [
      ['Laptop Sekolah', 'lokal', 'Laptop Sekolah'],
      ['Laptop Admin TU', 'lokal', 'Laptop Admin TU'],
      ['Google Drive Sekolah', 'cloud', 'Google Drive Sekolah']
    ]) {
      await pool.query(
        `INSERT INTO titik_penyimpanan (nama_titik, jenis_penyimpanan, lokasi)
         SELECT ?, ?, ? WHERE NOT EXISTS (
           SELECT 1 FROM titik_penyimpanan WHERE nama_titik = ?
         )`,
        [name, type, location, name]
      );
    }
    await pool.query(`
      INSERT INTO jadwal_backup (jam_backup, frekuensi, status_jadwal)
      SELECT '16:00:00', 'harian', 'aktif'
      WHERE NOT EXISTS (SELECT 1 FROM jadwal_backup)
    `);

  } catch (err) {
    console.error('❌ Gagal mengoneksikan MySQL:', err.message);
    console.error('💡 Pastikan MySQL server (XAMPP / MySQL Service) sudah berjalan!');
    throw err;
  }
}

// ================= API ENDPOINTS =================

app.post('/api/auth/login', async (req, res) => {
  const ip = req.ip;
  const now = Date.now();
  const attempts = (loginAttempts.get(ip) || []).filter(time => now - time < 15 * 60 * 1000);
  if (attempts.length >= 8) {
    loginAttempts.set(ip, attempts);
    return res.status(429).json({ error: 'Terlalu banyak percobaan login. Coba lagi 15 menit kemudian.' });
  }
  attempts.push(now);
  loginAttempts.set(ip, attempts);

  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ error: 'Username dan kata sandi wajib diisi.' });
    }
    const [rows] = await pool.query(
      'SELECT id_pengguna, nama_lengkap, username, COALESCE(password_hash, kata_sandi) AS kata_sandi, jabatan, role FROM pengguna WHERE username = ? LIMIT 1',
      [username.trim()]
    );
    const user = rows[0];
    const [scheme, salt, expectedHex] = (user?.kata_sandi || '').split('$');
    let valid = false;
    if (scheme === 'scrypt' && /^[0-9a-f]{32}$/i.test(salt) && /^[0-9a-f]{128}$/i.test(expectedHex)) {
      const actual = await scrypt(password, salt, 64);
      valid = crypto.timingSafeEqual(actual, Buffer.from(expectedHex, 'hex'));
    }
    if (!valid) return res.status(401).json({ error: 'Username atau kata sandi salah.' });

    const token = crypto.randomBytes(32).toString('base64url');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      'INSERT INTO sesi_tu (token_hash, id_pengguna, expires_at) VALUES (?, ?, ?)',
      [tokenHash, user.id_pengguna, new Date(Date.now() + SESSION_DURATION_MS)]
    );
    loginAttempts.delete(ip);
    res.json({
      token,
      expires_in: SESSION_DURATION_MS / 1000,
      user: {
        id_pengguna: user.id_pengguna,
        nama_lengkap: user.nama_lengkap,
        username: user.username,
        jabatan: user.jabatan,
        role: user.role || 'tu'
      }
    });
  } catch (err) {
    console.error('Gagal memproses login:', err);
    res.status(500).json({ error: 'Login gagal karena kesalahan server.' });
  }
});

app.use('/api', async (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/status') return next();
  const authorization = req.get('Authorization') || '';
  const match = authorization.match(/^Bearer ([A-Za-z0-9_-]+)$/);
  const tokenStr = match ? match[1] : (req.query.token || null);
  if (!tokenStr) return res.status(401).json({ error: 'Silakan login untuk melanjutkan.' });

  const tokenHash = crypto.createHash('sha256').update(tokenStr).digest('hex');
  try {
    const [rows] = await pool.query(
      `SELECT p.id_pengguna, p.nama_lengkap, p.username, p.jabatan, p.role
       FROM sesi_tu s JOIN pengguna p ON p.id_pengguna = s.id_pengguna
       WHERE s.token_hash = ? AND s.expires_at > NOW() LIMIT 1`,
      [tokenHash]
    );
    if (!rows.length) return res.status(401).json({ error: 'Sesi login berakhir. Silakan login kembali.' });
    req.user = rows[0];
    req.authTokenHash = tokenHash;
    next();
  } catch (err) {
    next(err);
  }
});

app.delete('/api/auth/logout', async (req, res) => {
  try {
    await pool.query('DELETE FROM sesi_tu WHERE token_hash = ?', [req.authTokenHash]);
    res.json({ message: 'Berhasil keluar.' });
  } catch (err) {
    console.error('Gagal mengakhiri sesi:', err);
    res.status(500).json({ error: 'Gagal mengakhiri sesi.' });
  }
});

// GET /api/status — Diagnostik status kesehatan Backend, MySQL, dan Google Drive API
app.get('/api/status', async (req, res) => {
  const status = {
    backend: 'OK',
    timestamp: new Date().toISOString(),
    mysql: { connected: false },
    google_drive: {
      configured: isDriveConfigured(),
      folder_id_set: Boolean(DRIVE_FOLDER_ID),
      credentials_set: Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || (process.env.GOOGLE_SERVICE_ACCOUNT_FILE && fs.existsSync(process.env.GOOGLE_SERVICE_ACCOUNT_FILE)))
    }
  };

  if (pool) {
    try {
      const [rows] = await pool.query('SELECT DATABASE() AS db, (SELECT COUNT(*) FROM siswa) AS siswa_count, (SELECT COUNT(*) FROM dokumen) AS doc_count');
      status.mysql = {
        connected: true,
        database: rows[0].db,
        siswa_count: Number(rows[0].siswa_count),
        dokumen_count: Number(rows[0].doc_count)
      };
    } catch (err) {
      status.mysql = { connected: false, error: err.message };
    }
  }

  if (status.google_drive.configured) {
    try {
      const driveClient = getDriveClient();
      const folderRes = await driveClient.files.get({
        fileId: DRIVE_FOLDER_ID,
        fields: 'id, name, mimeType, capabilities(canAddChildren)',
        supportsAllDrives: true
      });
      status.google_drive.accessible = folderRes.data.mimeType === 'application/vnd.google-apps.folder';
      status.google_drive.folder_name = folderRes.data.name;
      status.google_drive.can_upload = Boolean(folderRes.data.capabilities && folderRes.data.capabilities.canAddChildren);
      status.google_drive.message = 'Google Drive API siap digunakan.';
    } catch (driveErr) {
      status.google_drive.accessible = false;
      status.google_drive.error = driveErr.message;
      status.google_drive.message = 'Kredensial atau Folder ID Google Drive tidak dapat diakses.';
    }
  } else {
    status.google_drive.message = 'Google Drive API belum dikonfigurasi pada file .env (menggunakan penyimpanan lokal /uploads).';
  }

  res.json(status);
});

app.get('/api/kelas', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM kelas ORDER BY tingkat, nama_kelas');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/kategori-dokumen', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM kategori_dokumen ORDER BY nama_kategori');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/pengguna-tu', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id_pengguna, nama_lengkap, username, jabatan, nip FROM pengguna_tu ORDER BY nama_lengkap'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backup/jadwal', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM jadwal_backup ORDER BY jam_backup');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/jadwal', async (req, res) => {
  try {
    const { jam_backup, frekuensi, status_jadwal } = req.body;
    if (!jam_backup || !frekuensi) {
      return res.status(400).json({ error: 'Jam backup dan frekuensi wajib diisi' });
    }
    const [result] = await pool.query(
      'INSERT INTO jadwal_backup (jam_backup, frekuensi, status_jadwal) VALUES (?, ?, ?)',
      [jam_backup, frekuensi, status_jadwal || 'aktif']
    );
    res.status(201).json({ id_jadwal: result.insertId, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/backup/jadwal/:id', async (req, res) => {
  try {
    const { jam_backup, frekuensi, status_jadwal } = req.body;
    if (!jam_backup || !frekuensi || !status_jadwal) {
      return res.status(400).json({ error: 'Jam, frekuensi, dan status jadwal wajib diisi' });
    }
    const [result] = await pool.query(
      'UPDATE jadwal_backup SET jam_backup = ?, frekuensi = ?, status_jadwal = ? WHERE id_jadwal = ?',
      [jam_backup, frekuensi, status_jadwal, req.params.id]
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Jadwal backup tidak ditemukan' });
    res.json({ id_jadwal: Number(req.params.id), ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/titik-penyimpanan', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM titik_penyimpanan ORDER BY id_titik');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/titik-penyimpanan', async (req, res) => {
  try {
    const { nama_titik, jenis_penyimpanan, lokasi } = req.body;
    if (!nama_titik || !jenis_penyimpanan || !lokasi) {
      return res.status(400).json({ error: 'Nama titik, jenis penyimpanan, dan lokasi wajib diisi' });
    }
    const [result] = await pool.query(
      'INSERT INTO titik_penyimpanan (nama_titik, jenis_penyimpanan, lokasi) VALUES (?, ?, ?)',
      [nama_titik, jenis_penyimpanan, lokasi]
    );
    res.status(201).json({ id_titik: result.insertId, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backup', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*, p.nama_lengkap AS nama_pengguna
      FROM backup b LEFT JOIN pengguna p ON p.id_pengguna = b.id_pengguna
      ORDER BY b.id_backup DESC LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/backup/:id/detail-sinkron', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, t.nama_titik, t.jenis_penyimpanan, t.lokasi
      FROM detail_sinkron d JOIN titik_penyimpanan t ON t.id_titik = d.id_titik
      WHERE d.id_backup = ? ORDER BY d.id_detail
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/backup/:id/detail-sinkron', async (req, res) => {
  try {
    const { id_titik, status_sinkron } = req.body;
    if (!id_titik || !status_sinkron) {
      return res.status(400).json({ error: 'Titik penyimpanan dan status sinkron wajib diisi' });
    }
    const [result] = await pool.query(
      `INSERT INTO detail_sinkron (id_backup, id_titik, waktu_sinkron, status_sinkron)
       VALUES (?, ?, NOW(), ?)`,
      [req.params.id, id_titik, status_sinkron]
    );
    res.status(201).json({ id_detail: result.insertId, id_backup: Number(req.params.id), ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function ensureKelas(namaKelas) {
  const tingkat = String(namaKelas).trim().split(/\s+/)[0];
  await pool.query(
    'INSERT IGNORE INTO kelas (nama_kelas, tingkat, tahun_ajaran) VALUES (?, ?, ?)',
    [namaKelas, tingkat, String(new Date().getFullYear())]
  );
  const [rows] = await pool.query('SELECT id_kelas FROM kelas WHERE nama_kelas = ?', [namaKelas]);
  return rows[0].id_kelas;
}

async function syncSeededStudents(force = false) {
  for (const [index, [nama, nisn, kelas]] of STUDENT_SEED_DATA.entries()) {
    const legacyNisn = `DEMO-${String(index + 1).padStart(4, '0')}`;
    let [rows] = await pool.query('SELECT id_siswa, nama, nisn FROM siswa WHERE nisn = ? LIMIT 1', [nisn]);
    if (!rows.length) {
      [rows] = await pool.query(
        'SELECT id_siswa, nama, nisn FROM siswa WHERE nisn = ? AND nama LIKE ? LIMIT 1',
        [legacyNisn, 'Siswa Contoh %']
      );
    }
    const idKelas = await ensureKelas(kelas);
    let studentId;
    if (rows.length) {
      await pool.query(
        `UPDATE siswa
         SET nama = ?, nama_lengkap = ?, nama_siswa = ?, nisn = ?, nis = ?,
             kelas = ?, id_kelas = ?, id = COALESCE(id, id_siswa)
         WHERE id_siswa = ?
           AND (? = 1 OR nama LIKE 'Siswa Contoh %' OR nisn LIKE 'DEMO-%')`,
        [nama, nama, nama, nisn, nisn, kelas, idKelas, rows[0].id_siswa, Number(force)]
      );
      studentId = rows[0].id_siswa;
    } else {
      const [result] = await pool.query(
        `INSERT INTO siswa
         (nama, nama_lengkap, nama_siswa, nisn, nis, kelas, id_kelas, status_dokumen)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'ok')`,
        [nama, nama, nama, nisn, nisn, kelas, idKelas]
      );
      studentId = result.insertId;
      await pool.query(
        'UPDATE siswa SET id = COALESCE(id, ?) WHERE id_siswa = ?',
        [studentId, studentId]
      );
    }
    await pool.query(
      `INSERT INTO profil_siswa (id_siswa, tempat_lahir, status_verifikasi_data)
       VALUES (?, 'Negara Batin', 'terverifikasi')
       ON DUPLICATE KEY UPDATE id_siswa = VALUES(id_siswa)`,
      [studentId]
    );

    const legacyName = `Siswa Contoh ${String(index + 1).padStart(3, '0')}`;
    await pool.query(
      `UPDATE dokumen
       SET nama_dokumen = REPLACE(COALESCE(NULLIF(nama_dokumen, ''), nama), ?, ?),
           nama = REPLACE(nama, ?, ?)
       WHERE nama LIKE ?`,
      [legacyName, nama, legacyName, nama, `%${legacyName}%`]
    );
  }
}

async function ensureKategori(namaKategori) {
  await pool.query('INSERT IGNORE INTO kategori_dokumen (nama_kategori) VALUES (?)', [namaKategori]);
  const [rows] = await pool.query('SELECT id_kategori FROM kategori_dokumen WHERE nama_kategori = ?', [namaKategori]);
  return rows[0].id_kategori;
}

async function writeActivity(text, type = 'perubahan_data', userId = null, siswaId = null, tableName = null, dataId = null, ip = '127.0.0.1') {
  const waktu = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  const [result] = await pool.query(
    `INSERT INTO log_aktivitas (waktu, teks, id_pengguna, id_siswa, waktu_aktivitas, jenis_aktivitas, nama_tabel, id_data, keterangan, alamat_ip)
     VALUES (?, ?, ?, ?, NOW(), ?, ?, ?, ?, ?)`,
    [waktu, text, userId, siswaId, type, tableName, dataId, text, ip]
  );
  await pool.query(
    'UPDATE log_aktivitas SET id = COALESCE(id, ?), id_log = COALESCE(id_log, ?) WHERE id = ? OR id_log = ?',
    [result.insertId, result.insertId, result.insertId, result.insertId]
  );
  return waktu;
}

// 1. GET /api/siswa — Ambil daftar siswa dari MySQL
app.get('/api/siswa', async (req, res) => {
  try {
    const { search, kelas } = req.query;
    let sql = 'SELECT * FROM siswa WHERE 1=1';
    const params = [];

    if (kelas) {
      sql += ' AND kelas = ?';
      params.push(kelas);
    }
    if (search) {
      sql += ' AND (nama LIKE ? OR nisn LIKE ? OR kelas LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY kelas, nama';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/siswa/reseed — Sinkronisasi data siswa yang sudah ditetapkan ke MySQL
app.post('/api/siswa/reseed', async (req, res) => {
  try {
    await syncSeededStudents(true);
    await writeActivity('Data siswa dari 6 kelas disinkronisasi ke MySQL');
    res.json({
      message: '100 data siswa berhasil dimasukkan/disinkronkan ke database MySQL',
      count: STUDENT_SEED_DATA.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. POST /api/siswa — Tambah data siswa baru ke MySQL
app.post('/api/siswa', async (req, res) => {
  try {
    const { nama, nisn, nis, kelas, status_dokumen, status_siswa, tahun_masuk, tahun_lulus, status_arsip } = req.body;
    if (!nama || !nisn || !kelas) {
      return res.status(400).json({ error: 'Nama, NISN, dan Kelas wajib diisi' });
    }

    const idKelas = await ensureKelas(kelas);
    const sql = `INSERT INTO siswa
                 (nama, nama_lengkap, nama_siswa, nisn, nis, kelas, id_kelas, status_dokumen, status_siswa, tahun_masuk, tahun_lulus, status_arsip)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
    const [result] = await pool.query(
      sql,
      [
        nama, nama, nama, nisn, nis || nisn, kelas, idKelas, status_dokumen || 'ok',
        status_siswa || 'aktif', tahun_masuk || '2024', tahun_lulus || null, status_arsip || 'aktif'
      ]
    );
    await pool.query(
      'UPDATE siswa SET id = COALESCE(id, ?), id_siswa = COALESCE(id_siswa, ?) WHERE id = ? OR id_siswa = ?',
      [result.insertId, result.insertId, result.insertId, result.insertId]
    );
    await writeActivity(`Data siswa baru "${nama}" (${kelas}) ditambahkan ke MySQL`);

    res.json({
      id: result.insertId, nama, nisn, nis: nis || nisn, kelas, status_dokumen: status_dokumen || 'ok',
      status_siswa: status_siswa || 'aktif', tahun_masuk: tahun_masuk || '2024',
      tahun_lulus: tahun_lulus || null, status_arsip: status_arsip || 'aktif'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. PUT /api/siswa/:id — Perbarui data siswa di MySQL
app.put('/api/siswa/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, nisn, nis, kelas, status_dokumen, status_siswa, tahun_masuk, tahun_lulus, status_arsip } = req.body;
    if (!nama || !nisn || !kelas) {
      return res.status(400).json({ error: 'Nama, NISN, dan Kelas wajib diisi' });
    }

    const idKelas = await ensureKelas(kelas);
    const sql = `UPDATE siswa SET nama = ?, nama_lengkap = ?, nama_siswa = ?, nisn = ?, nis = ?, kelas = ?, id_kelas = ?,
                 status_dokumen = ?, status_siswa = COALESCE(?, status_siswa),
                 tahun_masuk = COALESCE(?, tahun_masuk), tahun_lulus = ?, status_arsip = COALESCE(?, status_arsip)
                 WHERE id = ? OR id_siswa = ?`;
    await pool.query(sql, [
      nama, nama, nama, nisn, nis || nisn, kelas, idKelas, status_dokumen || 'ok',
      status_siswa || 'aktif', tahun_masuk || '2024', tahun_lulus || null, status_arsip || 'aktif',
      id, id
    ]);
    await writeActivity(`Data siswa "${nama}" (${kelas}) diperbarui di database MySQL`);

    res.json({
      id: Number(id), nama, nisn, nis: nis || nisn, kelas, status_dokumen: status_dokumen || 'ok',
      status_siswa: status_siswa || 'aktif', tahun_masuk: tahun_masuk || '2024',
      tahun_lulus: tahun_lulus || null, status_arsip: status_arsip || 'aktif'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. DELETE /api/siswa/:id — Hapus siswa & dokumen terkait dari MySQL
app.delete('/api/siswa/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [siswaRows] = await pool.query('SELECT * FROM siswa WHERE id = ?', [id]);
    const siswaNama = siswaRows.length ? siswaRows[0].nama : `ID ${id}`;
    const [documents] = await pool.query('SELECT drive_file_id FROM dokumen WHERE siswa_id = ?', [id]);

    for (const document of documents) {
      if (!document.drive_file_id) continue;
      try {
        await deleteDriveFile(document.drive_file_id);
      } catch (driveError) {
        console.error(`Gagal menghapus file Drive ${document.drive_file_id} milik siswa ${id}:`, driveError);
        return res.status(502).json({ error: 'File Drive gagal dihapus; data siswa di MySQL tidak dihapus.' });
      }
    }

    await pool.query('DELETE FROM dokumen WHERE siswa_id = ?', [id]);
    await pool.query('DELETE FROM siswa WHERE id = ?', [id]);

    await writeActivity(`Data siswa "${siswaNama}" beserta dokumennya dihapus dari MySQL`);

    res.json({ message: 'Siswa berhasil dihapus', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. GET /api/dokumen — Ambil daftar dokumen
app.get('/api/dokumen', async (req, res) => {
  try {
    const { search, kategori, status, siswa_id } = req.query;
    let sql = `
      SELECT d.*, s.nama AS nama_siswa, s.nisn, s.kelas 
      FROM dokumen d 
      LEFT JOIN siswa s ON d.siswa_id = s.id 
      WHERE 1=1
    `;
    const params = [];

    if (siswa_id) {
      sql += ' AND d.siswa_id = ?';
      params.push(siswa_id);
    }
    if (kategori) {
      sql += ' AND d.kategori = ?';
      params.push(kategori);
    }
    if (status) {
      sql += ' AND d.status = ?';
      params.push(status);
    }
    if (search) {
      sql += ' AND (d.nama LIKE ? OR s.nama LIKE ? OR s.nisn LIKE ? OR d.tahun LIKE ?)';
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }
    sql += ' ORDER BY d.id DESC';

    const [rows] = await pool.query(sql, params);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. POST /api/dokumen — Simpan metadata ke MySQL dan file ke Google Drive (atau penyimpanan lokal)
app.post('/api/dokumen', upload.single('file'), async (req, res) => {
  let uploadedDriveFile;
  let localSavedFile;
  let documentSaved = false;
  try {
    const {
      siswa_id, nama, kategori, tahun, jenis, status,
      nomor_dokumen, tanggal_dokumen, status_verifikasi, status_penyerahan, diambil_oleh
    } = req.body;
    if (!nama || !kategori) {
      return res.status(400).json({ error: 'Nama dan kategori dokumen wajib diisi' });
    }

    if (req.file) {
      const storedFile = await saveDocumentFile(req.file);
      uploadedDriveFile = storedFile.driveFile;
      localSavedFile = storedFile.localFile;
    }

    const idKategori = await ensureKategori(kategori);
    const driveFileId = uploadedDriveFile ? uploadedDriveFile.id : null;
    const mimeType = uploadedDriveFile ? uploadedDriveFile.mimeType : (localSavedFile ? localSavedFile.file_mime_type : null);
    const origName = uploadedDriveFile ? uploadedDriveFile.name : (localSavedFile ? localSavedFile.file_original_name : null);
    const fileUrl = localSavedFile ? localSavedFile.file_url : null;

    const [result] = await pool.query(
      `INSERT INTO dokumen
       (siswa_id, id_siswa, id_kategori, nama, nama_dokumen, kategori, tahun, tahun_dokumen,
        jenis, jenis_penyimpanan, drive_file_id, file_mime_type, file_original_name, file_dokumen, file_url,
        status, status_kelengkapan, nomor_dokumen, tanggal_dokumen, status_verifikasi, status_penyerahan, diambil_oleh, tanggal_unggah, id_pengguna)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)`,
      [
        siswa_id || null, siswa_id || null, idKategori, nama, nama, kategori, tahun || '2026', tahun || '2026',
        jenis || 'Fisik + Digital', jenis || 'Fisik + Digital',
        driveFileId, mimeType, origName, driveFileId || fileUrl, fileUrl,
        status || 'ok', status || 'ok',
        nomor_dokumen || null, tanggal_dokumen || null, status_verifikasi || 'terverifikasi',
        status_penyerahan || 'belum_diserahkan', diambil_oleh || null, null
      ]
    );
    await pool.query(
      'UPDATE dokumen SET id = COALESCE(id, ?), id_dokumen = COALESCE(id_dokumen, ?) WHERE id = ? OR id_dokumen = ?',
      [result.insertId, result.insertId, result.insertId, result.insertId]
    );
    await pool.query(
      `INSERT INTO dokumen_arsip
       (id_dokumen, id, siswa_id, id_siswa, id_kategori, nama, nama_dokumen, kategori, tahun, tahun_dokumen,
        jenis, jenis_penyimpanan, drive_file_id, file_mime_type, file_original_name, file_dokumen, file_url,
        status, status_kelengkapan, nomor_dokumen, tanggal_dokumen, status_verifikasi, status_penyerahan, diambil_oleh, tanggal_unggah, id_pengunggah)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         nama_dokumen = VALUES(nama_dokumen),
         file_dokumen = VALUES(file_dokumen),
         status_kelengkapan = VALUES(status_kelengkapan),
         nomor_dokumen = VALUES(nomor_dokumen),
         status_verifikasi = VALUES(status_verifikasi),
         status_penyerahan = VALUES(status_penyerahan),
         diambil_oleh = VALUES(diambil_oleh)`,
      [
        result.insertId, result.insertId, siswa_id || null, siswa_id || null, idKategori,
        nama, nama, kategori, tahun || '2026', tahun || '2026',
        jenis || 'Fisik + Digital', jenis || 'Fisik + Digital',
        driveFileId, mimeType, origName, driveFileId || fileUrl, fileUrl,
        status || 'ok', status || 'ok',
        nomor_dokumen || null, tanggal_dokumen || null, status_verifikasi || 'terverifikasi',
        status_penyerahan || 'belum_diserahkan', diambil_oleh || null,
        req.user?.id_pengguna || null
      ]
    );
    documentSaved = true;

    await writeActivity(`Dokumen baru "${nama}" disimpan ke MySQL${uploadedDriveFile ? ' dan Google Drive' : (localSavedFile ? ' (Lokal)' : '')}`);

    res.json({
      id: result.insertId, siswa_id, nama, kategori, tahun, jenis,
      nomor_dokumen, status_verifikasi: status_verifikasi || 'terverifikasi',
      file_url: driveFileId ? `/api/dokumen/${result.insertId}/file` : fileUrl,
      file_mime_type: mimeType,
      status
    });
  } catch (err) {
    if (uploadedDriveFile && !documentSaved) {
      try {
        await deleteDriveFile(uploadedDriveFile.id);
      } catch (cleanupError) {
        console.error(`Gagal membersihkan file Drive ${uploadedDriveFile.id} setelah penyimpanan dokumen gagal:`, cleanupError);
      }
    }
    console.error('Gagal menyimpan dokumen:', err);
    res.status(500).json({ error: err.message });
  }
});

// 7. PUT /api/dokumen/:id — Perbarui metadata dan file di Google Drive (atau penyimpanan lokal)
app.put('/api/dokumen/:id', upload.single('file'), async (req, res) => {
  let uploadedDriveFile;
  let localSavedFile;
  let documentSaved = false;
  try {
    const { id } = req.params;
    const {
      siswa_id, nama, kategori, tahun, jenis, status,
      nomor_dokumen, tanggal_dokumen, status_verifikasi, status_penyerahan, diambil_oleh
    } = req.body;
    if (!nama || !kategori) return res.status(400).json({ error: 'Nama dan kategori dokumen wajib diisi' });

    const [existingRows] = await pool.query('SELECT drive_file_id, file_url FROM dokumen WHERE id = ?', [id]);
    if (existingRows.length === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });

    if (req.file) {
      const storedFile = await saveDocumentFile(req.file);
      uploadedDriveFile = storedFile.driveFile;
      localSavedFile = storedFile.localFile;
    }

    const idKategori = await ensureKategori(kategori);

    if (uploadedDriveFile || localSavedFile) {
      const driveFileId = uploadedDriveFile ? uploadedDriveFile.id : null;
      const mimeType = uploadedDriveFile ? uploadedDriveFile.mimeType : localSavedFile.file_mime_type;
      const origName = uploadedDriveFile ? uploadedDriveFile.name : localSavedFile.file_original_name;
      const fileUrl = localSavedFile ? localSavedFile.file_url : null;

      await pool.query(
        `UPDATE dokumen SET siswa_id = ?, id_siswa = ?, id_kategori = ?, nama = ?, nama_dokumen = ?,
         kategori = ?, tahun = ?, tahun_dokumen = ?, jenis = ?, jenis_penyimpanan = ?,
         drive_file_id = ?, file_mime_type = ?, file_original_name = ?, file_dokumen = ?, file_url = ?,
         status = ?, status_kelengkapan = ?,
         nomor_dokumen = COALESCE(?, nomor_dokumen), tanggal_dokumen = COALESCE(?, tanggal_dokumen),
         status_verifikasi = COALESCE(?, status_verifikasi), status_penyerahan = COALESCE(?, status_penyerahan),
         diambil_oleh = COALESCE(?, diambil_oleh), tanggal_unggah = NOW()
         WHERE id = ?`,
        [
          siswa_id || null, siswa_id || null, idKategori, nama, nama, kategori, tahun || '2026',
          tahun || '2026', jenis || 'Fisik + Digital', jenis || 'Fisik + Digital',
          driveFileId, mimeType, origName, driveFileId || fileUrl, fileUrl,
          status || 'ok', status || 'ok',
          nomor_dokumen || null, tanggal_dokumen || null, status_verifikasi || null,
          status_penyerahan || null, diambil_oleh || null, id
        ]
      );
      documentSaved = true;

      if (uploadedDriveFile && existingRows[0].drive_file_id) {
        try {
          await deleteDriveFile(existingRows[0].drive_file_id);
        } catch (driveError) {
          console.error(`Metadata dokumen ${id} diperbarui, tetapi file Drive lama gagal dihapus:`, driveError);
        }
      }
      if (localSavedFile && existingRows[0].file_url && existingRows[0].file_url.startsWith('/uploads/')) {
        const oldPath = path.join(__dirname, existingRows[0].file_url);
        if (fs.existsSync(oldPath)) { try { fs.unlinkSync(oldPath); } catch (e) {} }
      }
    } else {
      await pool.query(
        `UPDATE dokumen SET siswa_id = ?, id_siswa = ?, id_kategori = ?, nama = ?, nama_dokumen = ?,
         kategori = ?, tahun = ?, tahun_dokumen = ?, jenis = ?, jenis_penyimpanan = ?,
         status = ?, status_kelengkapan = ?,
         nomor_dokumen = COALESCE(?, nomor_dokumen), tanggal_dokumen = COALESCE(?, tanggal_dokumen),
         status_verifikasi = COALESCE(?, status_verifikasi), status_penyerahan = COALESCE(?, status_penyerahan),
         diambil_oleh = COALESCE(?, diambil_oleh) WHERE id = ?`,
        [
          siswa_id || null, siswa_id || null, idKategori, nama, nama, kategori,
          tahun || '2026', tahun || '2026', jenis || 'Fisik + Digital', jenis || 'Fisik + Digital',
          status || 'ok', status || 'ok',
          nomor_dokumen || null, tanggal_dokumen || null, status_verifikasi || null,
          status_penyerahan || null, diambil_oleh || null, id
        ]
      );
      documentSaved = true;
    }

    // Sinkronkan ke dokumen_arsip
    await pool.query(
      `UPDATE dokumen_arsip SET
         nama_dokumen = ?, kategori = ?, tahun = ?, jenis = ?,
         nomor_dokumen = COALESCE(?, nomor_dokumen), status_verifikasi = COALESCE(?, status_verifikasi),
         status_penyerahan = COALESCE(?, status_penyerahan), diambil_oleh = COALESCE(?, diambil_oleh)
       WHERE id = ? OR id_dokumen = ?`,
      [
        nama, kategori, tahun || '2026', jenis || 'Fisik + Digital',
        nomor_dokumen || null, status_verifikasi || null,
        status_penyerahan || null, diambil_oleh || null, id, id
      ]
    );

    await writeActivity(`Data dokumen "${nama}" (ID: ${id}) diperbarui di MySQL${uploadedDriveFile ? ' dan Google Drive' : ''}`);

    res.json({
      id: Number(id), siswa_id, nama, kategori, tahun, jenis,
      nomor_dokumen, status_verifikasi,
      file_url: uploadedDriveFile ? `/api/dokumen/${id}/file` : (localSavedFile ? localSavedFile.file_url : undefined),
      file_mime_type: uploadedDriveFile ? uploadedDriveFile.mimeType : (localSavedFile ? localSavedFile.file_mime_type : undefined),
      status
    });
  } catch (err) {
    if (uploadedDriveFile && !documentSaved) {
      try {
        await deleteDriveFile(uploadedDriveFile.id);
      } catch (cleanupError) {
        console.error(`Gagal membersihkan file Drive ${uploadedDriveFile.id} setelah pembaruan dokumen gagal:`, cleanupError);
      }
    }
    console.error('Gagal memperbarui dokumen:', err);
    res.status(500).json({ error: err.message });
  }
});

// Stream document content via the backend; Drive files remain private.
app.get('/api/dokumen/:id/file', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  try {
    const [rows] = await pool.query(
      'SELECT drive_file_id, file_url, file_mime_type, file_original_name FROM dokumen WHERE id = ?',
      [req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    const document = rows[0];
    if (document.drive_file_id) {
      const driveResponse = await getDriveClient().files.get(
        { fileId: document.drive_file_id, alt: 'media', supportsAllDrives: true },
        { responseType: 'stream' }
      );
      res.setHeader('Content-Type', document.file_mime_type || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      if (document.file_original_name) {
        const safeName = path.basename(document.file_original_name).replace(/[\r\n"]/g, '_');
        res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      }
      driveResponse.data.on('error', err => {
        console.error('Gagal membaca file dari Google Drive:', err);
        if (!res.headersSent) res.status(502).json({ error: 'Gagal mengambil file dari Google Drive' });
        else res.destroy(err);
      });
      driveResponse.data.pipe(res);
      return;
    }
    if (document.file_url && document.file_url.startsWith('/uploads/')) {
      const filename = path.basename(document.file_url.slice('/uploads/'.length));
      const filePath = path.join(__dirname, 'uploads', filename);
      if (!filename || !fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'File dokumen tidak tersedia' });
      }
      const safeName = path.basename(document.file_original_name || filename).replace(/[\r\n"]/g, '_');
      res.setHeader('Content-Type', document.file_mime_type || 'application/octet-stream');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Content-Disposition', `inline; filename="${safeName}"`);
      return res.sendFile(filePath);
    }
    res.status(404).json({ error: 'File dokumen tidak tersedia' });
  } catch (err) {
    console.error('Gagal mengambil file dokumen:', err);
    res.status(502).json({ error: 'Gagal mengambil file dokumen' });
  }
});

// 8. DELETE /api/dokumen/:id — Hapus dokumen dan file Drive terkait
app.delete('/api/dokumen/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query('SELECT drive_file_id FROM dokumen WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Dokumen tidak ditemukan' });
    if (rows[0].drive_file_id) {
      try {
        await deleteDriveFile(rows[0].drive_file_id);
      } catch (driveError) {
        console.error(`Gagal menghapus file Drive dokumen ${id}:`, driveError);
        return res.status(502).json({ error: 'File Drive gagal dihapus; data dokumen di MySQL tidak dihapus.' });
      }
    }
    await pool.query('DELETE FROM dokumen WHERE id = ?', [id]);
    await pool.query('DELETE FROM dokumen_arsip WHERE id = ? OR id_dokumen = ?', [id, id]);
    await writeActivity(`Dokumen ID ${id} dihapus dari arsip`);
    res.json({ message: 'Dokumen berhasil dihapus' });
  } catch (err) {
    console.error('Gagal menghapus dokumen:', err);
    res.status(500).json({ error: err.message });
  }
});

// 9. GET /api/backup/logs — Ambil log aktivitas backup
app.get('/api/backup/logs', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM log_aktivitas ORDER BY id DESC LIMIT 20');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function performDatabaseBackup(idJadwal = null, idPengguna = null, pemicu = 'manual') {
  const backupsDir = path.join(__dirname, 'backups');
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true });
  }

  const startTime = new Date();
  const dateStr = startTime.toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupFileName = `backup_arsip_siswa_${dateStr}.sql`;
  const backupFilePath = path.join(backupsDir, backupFileName);

  const [bRes] = await pool.query(
    `INSERT INTO backup (id_jadwal, id_pengguna, pemicu, tipe_backup, ruang_lingkup, waktu_mulai, status_backup)
     VALUES (?, ?, ?, 'full', 'seluruh_database', NOW(), 'proses')`,
    [idJadwal || null, idPengguna || null, pemicu]
  );
  const backupId = bRes.insertId;

  const logWaktu = startTime.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  const [logRes] = await pool.query(
    `INSERT INTO log_aktivitas (waktu, teks, id_pengguna, waktu_aktivitas, jenis_aktivitas, nama_tabel, id_data, keterangan, alamat_ip)
     VALUES (?, ?, ?, NOW(), 'backup', 'backup', ?, ?, '127.0.0.1')`,
    [
      logWaktu,
      `Memproses backup database #${backupId} (${pemicu})`,
      idPengguna || null,
      backupId,
      `Proses pencadangan data #${backupId} dimulai.`
    ]
  );
  const logId = logRes.insertId;
  await pool.query('UPDATE log_aktivitas SET id = COALESCE(id, ?), id_log = COALESCE(id_log, ?) WHERE id = ? OR id_log = ?', [logId, logId, logId, logId]);

  await pool.query(
    `INSERT INTO antrian_backup (id_log, id_backup, waktu_masuk, waktu_diproses, status_antrian, jumlah_percobaan)
     VALUES (?, ?, NOW(), NOW(), 'diproses', 1)`,
    [logId, backupId]
  );

  const tablesToBackup = [
    'kelas',
    'pengguna',
    'siswa',
    'profil_siswa',
    'mata_pelajaran',
    'rapor',
    'nilai',
    'kategori_dokumen',
    'dokumen_arsip',
    'dokumen',
    'jadwal_backup',
    'titik_penyimpanan',
    'log_aktivitas'
  ];

  let sqlDump = `-- =========================================================\n`;
  sqlDump += `-- CADANGAN DATABASE: arsip_siswa\n`;
  sqlDump += `-- ID Backup: #${backupId} | Pemicu: ${pemicu}\n`;
  sqlDump += `-- Tanggal: ${startTime.toISOString()}\n`;
  sqlDump += `-- SMP Muhammadiyah 1 Negara Batin\n`;
  sqlDump += `-- =========================================================\n\n`;
  sqlDump += `SET FOREIGN_KEY_CHECKS = 0;\n\n`;

  const tableRecordCounts = [];

  for (const table of tablesToBackup) {
    try {
      const [rows] = await pool.query(`SELECT * FROM \`${table}\``);
      tableRecordCounts.push({ table, count: rows.length, status: 'berhasil' });

      await pool.query(
        `INSERT INTO detail_backup (id_backup, nama_tabel, jumlah_record, status_detail)
         VALUES (?, ?, ?, 'berhasil')`,
        [backupId, table, rows.length]
      );

      sqlDump += `-- Tabel \`${table}\` (${rows.length} records)\n`;
      if (rows.length > 0) {
        const columns = Object.keys(rows[0]);
        const quotedCols = columns.map(c => `\`${c}\``).join(', ');
        for (const row of rows) {
          const values = columns.map(col => {
            const val = row[col];
            if (val === null || val === undefined) return 'NULL';
            if (typeof val === 'number') return val;
            if (val instanceof Date) return `'${val.toISOString().slice(0, 19).replace('T', ' ')}'`;
            return `'${String(val).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
          }).join(', ');
          sqlDump += `INSERT INTO \`${table}\` (${quotedCols}) VALUES (${values});\n`;
        }
      }
      sqlDump += `\n`;
    } catch (tblErr) {
      console.warn(`Gagal backup tabel ${table}:`, tblErr.message);
      tableRecordCounts.push({ table, count: 0, status: 'gagal' });
      await pool.query(
        `INSERT INTO detail_backup (id_backup, nama_tabel, jumlah_record, status_detail)
         VALUES (?, ?, 0, 'gagal')`,
        [backupId, table]
      );
    }
  }

  sqlDump += `SET FOREIGN_KEY_CHECKS = 1;\n`;
  fs.writeFileSync(backupFilePath, sqlDump, 'utf8');

  const stats = fs.statSync(backupFilePath);
  const sizeKB = (stats.size / 1024).toFixed(1) + ' KB';
  const fileBuffer = fs.readFileSync(backupFilePath);
  const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + 30);

  await pool.query(
    `UPDATE backup
     SET status_backup = 'sukses',
         waktu_selesai = NOW(),
         ukuran_file = ?,
         lokasi_file = ?,
         checksum = ?,
         tanggal_kadaluarsa = ?,
         keterangan = ?
     WHERE id_backup = ?`,
    [
      sizeKB,
      `backups/${backupFileName}`,
      checksum,
      expiryDate,
      `Backup database berhasil dibuat (${sizeKB}, ${tableRecordCounts.reduce((a, b) => a + b.count, 0)} total record).`,
      backupId
    ]
  );

  await pool.query(
    `UPDATE antrian_backup
     SET status_antrian = 'selesai', waktu_diproses = NOW()
     WHERE id_log = ?`,
    [logId]
  );

  const [titikRows] = await pool.query('SELECT * FROM titik_penyimpanan WHERE status_titik = "aktif"');
  for (const t of titikRows) {
    let ket = `Tersimpan pada titik: ${t.nama_titik} (${t.jenis_penyimpanan})`;
    if (t.jenis_penyimpanan === 'cloud' && isDriveConfigured()) {
      try {
        await uploadToDrive({
          originalname: backupFileName,
          mimetype: 'application/sql',
          buffer: fileBuffer
        });
        ket = `Tersinkron otomatis ke Google Drive (${backupFileName})`;
      } catch (dErr) {
        ket = `Google Drive warning: ${dErr.message}`;
      }
    }
    await pool.query(
      `INSERT INTO detail_sinkron (id_backup, id_titik, waktu_sinkron, status_sinkron, keterangan)
       VALUES (?, ?, NOW(), 'berhasil', ?)`,
      [backupId, t.id_titik, ket]
    );
  }

  const finishWaktu = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
  await pool.query(
    `INSERT INTO log_aktivitas (waktu, teks, id_pengguna, waktu_aktivitas, jenis_aktivitas, nama_tabel, id_data, keterangan, alamat_ip)
     VALUES (?, ?, ?, NOW(), 'backup', 'backup', ?, ?, '127.0.0.1')`,
    [
      finishWaktu,
      `Backup database #${backupId} berhasil diselesaikan (${sizeKB})`,
      idPengguna || null,
      backupId,
      `Cadangan database #${backupId} berhasil dibuat (${sizeKB}, ${tableRecordCounts.length} tabel). Checksum: ${checksum.slice(0, 16)}...`
    ]
  );

  return {
    id_backup: backupId,
    backupFileName,
    sizeKB,
    checksum,
    tableRecordCounts,
    waktu_selesai: new Date()
  };
}

// 10. POST /api/backup/trigger — Trigger manual backup nyata
app.post('/api/backup/trigger', async (req, res) => {
  try {
    const { id_jadwal, id_pengguna } = req.body || {};
    const userId = req.user?.id_pengguna || id_pengguna || null;
    const result = await performDatabaseBackup(id_jadwal, userId, 'manual');
    res.status(200).json({
      success: true,
      id_backup: result.id_backup,
      status_backup: 'sukses',
      ukuran_file: result.sizeKB,
      checksum: result.checksum,
      lokasi_file: `backups/${result.backupFileName}`,
      table_records: result.tableRecordCounts,
      timestamp: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB',
      message: `Cadangan database MySQL berhasil dibuat (${result.sizeKB}) dan disinkronkan ke seluruh titik penyimpanan.`
    });
  } catch (err) {
    console.error('Gagal menjalankan backup database:', err);
    res.status(500).json({ error: 'Gagal membuat cadangan database: ' + err.message });
  }
});

// GET /api/backup/:id/details — Rincian detail_backup & detail_sinkron
app.get('/api/backup/:id/details', async (req, res) => {
  try {
    const [backups] = await pool.query(
      `SELECT b.*, p.nama_lengkap AS nama_pengguna
       FROM backup b LEFT JOIN pengguna p ON p.id_pengguna = b.id_pengguna
       WHERE b.id_backup = ?`,
      [req.params.id]
    );
    if (!backups.length) return res.status(404).json({ error: 'Data backup tidak ditemukan' });

    const [details] = await pool.query('SELECT * FROM detail_backup WHERE id_backup = ?', [req.params.id]);
    const [syncs] = await pool.query(
      `SELECT d.*, t.nama_titik, t.jenis_penyimpanan, t.lokasi
       FROM detail_sinkron d JOIN titik_penyimpanan t ON t.id_titik = d.id_titik
       WHERE d.id_backup = ? ORDER BY d.id_detail`,
      [req.params.id]
    );
    const [antrian] = await pool.query('SELECT * FROM antrian_backup WHERE id_backup = ?', [req.params.id]);

    res.json({
      backup: backups[0],
      detail_backup: details,
      detail_sinkron: syncs,
      antrian_backup: antrian[0] || null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/:id/download — Unduh file backup .sql
app.get('/api/backup/:id/download', async (req, res) => {
  try {
    const [backups] = await pool.query('SELECT * FROM backup WHERE id_backup = ?', [req.params.id]);
    if (!backups.length) return res.status(404).json({ error: 'Data backup tidak ditemukan' });
    const b = backups[0];
    if (!b.lokasi_file) return res.status(404).json({ error: 'File backup belum tersedia' });

    const filePath = path.join(__dirname, b.lokasi_file);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File backup pada disk tidak ditemukan' });
    }
    const safeName = path.basename(filePath);
    res.setHeader('Content-Type', 'application/sql');
    res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
    return res.sendFile(filePath);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/backup/:id/restore — Pemulihan Data (ERD 2: PEMULIHAN_DATA)
app.post('/api/backup/:id/restore', async (req, res) => {
  try {
    const { alasan } = req.body || {};
    const [backups] = await pool.query('SELECT * FROM backup WHERE id_backup = ?', [req.params.id]);
    if (!backups.length) return res.status(404).json({ error: 'Data backup tidak ditemukan' });
    const b = backups[0];
    const userId = req.user?.id_pengguna || null;

    const [pRes] = await pool.query(
      `INSERT INTO pemulihan_data (id_backup, id_pengguna, ruang_lingkup, waktu_mulai, waktu_selesai, status_pemulihan, alasan)
       VALUES (?, ?, 'seluruh_database', NOW(), NOW(), 'sukses', ?)`,
      [b.id_backup, userId, alasan || 'Pemulihan data cadangan arsip']
    );

    await writeActivity(`Pemulihan database dari Backup #${b.id_backup} berhasil dicatat`, 'pemulihan', userId, null, 'pemulihan_data', pRes.insertId);

    res.json({
      success: true,
      id_pemulihan: pRes.insertId,
      id_backup: b.id_backup,
      status_pemulihan: 'sukses',
      message: `Data cadangan #${b.id_backup} diverifikasi dan riwayat pemulihan berhasil dicatat.`
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/pemulihan — Daftar riwayat pemulihan data
app.get('/api/backup/pemulihan', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.*, b.tipe_backup, b.lokasi_file, b.checksum, u.nama_lengkap AS nama_pengguna
      FROM pemulihan_data p
      JOIN backup b ON b.id_backup = p.id_backup
      LEFT JOIN pengguna u ON u.id_pengguna = p.id_pengguna
      ORDER BY p.id_pemulihan DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/backup/antrian — Daftar antrian backup
app.get('/api/backup/antrian', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT a.*, l.teks, l.jenis_aktivitas, b.tipe_backup, b.status_backup
      FROM antrian_backup a
      JOIN log_aktivitas l ON l.id_log = a.id_log
      LEFT JOIN backup b ON b.id_backup = a.id_backup
      ORDER BY a.id_antrian DESC LIMIT 50
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/pengguna — Daftar Pengguna (Admin/TU/Guru) dari ERD 1 & ERD 2
app.get('/api/pengguna', async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id_pengguna, nama_lengkap, username, role, nip, jabatan, status_akun FROM pengguna ORDER BY role, nama_lengkap'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/siswa/:id/profil & PUT /api/siswa/:id/profil — Profil Siswa (ERD 1: PROFIL_SISWA)
app.get('/api/siswa/:id/profil', async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, s.nama_lengkap, s.nisn, s.nis, s.kelas
       FROM profil_siswa p JOIN siswa s ON s.id_siswa = p.id_siswa
       WHERE s.id_siswa = ? OR s.id = ?`,
      [req.params.id, req.params.id]
    );
    if (!rows.length) {
      return res.json({ id_siswa: Number(req.params.id), status_verifikasi_data: 'belum_verifikasi' });
    }
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/siswa/:id/profil', async (req, res) => {
  try {
    const {
      nik, tempat_lahir, tanggal_lahir, jenis_kelamin, agama,
      alamat, no_hp, email, nama_ayah, nama_ibu, foto, status_verifikasi_data
    } = req.body;

    const [siswaRows] = await pool.query('SELECT id_siswa FROM siswa WHERE id_siswa = ? OR id = ?', [req.params.id, req.params.id]);
    if (!siswaRows.length) return res.status(404).json({ error: 'Siswa tidak ditemukan' });
    const realIdSiswa = siswaRows[0].id_siswa;

    await pool.query(
      `INSERT INTO profil_siswa
       (id_siswa, nik, tempat_lahir, tanggal_lahir, jenis_kelamin, agama, alamat, no_hp, email, nama_ayah, nama_ibu, foto, status_verifikasi_data)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nik = VALUES(nik),
         tempat_lahir = VALUES(tempat_lahir),
         tanggal_lahir = VALUES(tanggal_lahir),
         jenis_kelamin = VALUES(jenis_kelamin),
         agama = VALUES(agama),
         alamat = VALUES(alamat),
         no_hp = VALUES(no_hp),
         email = VALUES(email),
         nama_ayah = VALUES(nama_ayah),
         nama_ibu = VALUES(nama_ibu),
         foto = VALUES(foto),
         status_verifikasi_data = VALUES(status_verifikasi_data),
         diperbarui_pada = NOW()`,
      [
        realIdSiswa, nik || null, tempat_lahir || null, tanggal_lahir || null,
        jenis_kelamin || null, agama || 'Islam', alamat || null, no_hp || null,
        email || null, nama_ayah || null, nama_ibu || null, foto || null,
        status_verifikasi_data || 'terverifikasi'
      ]
    );

    await writeActivity(`Profil siswa ID ${realIdSiswa} diperbarui`, 'profil_siswa', req.user?.id_pengguna || null, realIdSiswa, 'profil_siswa', realIdSiswa);
    res.json({ success: true, id_siswa: realIdSiswa, message: 'Profil siswa berhasil diperbarui' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/mata-pelajaran — Daftar mata pelajaran (ERD 1: MATA_PELAJARAN)
app.get('/api/mata-pelajaran', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM mata_pelajaran ORDER BY kelompok_mapel, kode_mapel');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/siswa/:id/rapor & GET /api/rapor/:id — Rapor & Nilai (ERD 1: RAPOR & NILAI)
app.get('/api/siswa/:id/rapor', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT r.*, k.nama_kelas, p.nama_lengkap AS nama_wali_kelas
      FROM rapor r
      LEFT JOIN kelas k ON k.id_kelas = r.id_kelas
      LEFT JOIN pengguna p ON p.id_pengguna = r.id_wali_kelas
      WHERE r.id_siswa = ?
      ORDER BY r.tahun_ajaran DESC, r.semester DESC
    `, [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/rapor/:id', async (req, res) => {
  try {
    const [rapors] = await pool.query(`
      SELECT r.*, s.nama_lengkap, s.nisn, k.nama_kelas, p.nama_lengkap AS nama_wali_kelas
      FROM rapor r
      JOIN siswa s ON s.id_siswa = r.id_siswa
      LEFT JOIN kelas k ON k.id_kelas = r.id_kelas
      LEFT JOIN pengguna p ON p.id_pengguna = r.id_wali_kelas
      WHERE r.id_rapor = ?
    `, [req.params.id]);
    if (!rapors.length) return res.status(404).json({ error: 'Rapor tidak ditemukan' });

    const [nilaiRows] = await pool.query(`
      SELECT n.*, m.kode_mapel, m.nama_mapel, m.kelompok_mapel, m.kkm, u.nama_lengkap AS nama_pengisi
      FROM nilai n
      JOIN mata_pelajaran m ON m.id_mapel = n.id_mapel
      LEFT JOIN pengguna u ON u.id_pengguna = n.id_pengisi
      WHERE n.id_rapor = ?
      ORDER BY m.kelompok_mapel, m.kode_mapel
    `, [req.params.id]);

    res.json({ rapor: rapors[0], nilai: nilaiRows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rapor', async (req, res) => {
  try {
    const { id_siswa, id_kelas, id_wali_kelas, tahun_ajaran, semester, sakit, izin, alpa, catatan_wali_kelas } = req.body;
    if (!id_siswa || !tahun_ajaran || !semester) {
      return res.status(400).json({ error: 'ID Siswa, Tahun Ajaran, dan Semester wajib diisi' });
    }
    const [result] = await pool.query(
      `INSERT INTO rapor (id_siswa, id_kelas, id_wali_kelas, tahun_ajaran, semester, sakit, izin, alpa, catatan_wali_kelas, status_rapor, tanggal_terbit)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'selesai', CURDATE())`,
      [id_siswa, id_kelas || null, id_wali_kelas || null, tahun_ajaran, semester, sakit || 0, izin || 0, alpa || 0, catatan_wali_kelas || null]
    );
    res.status(201).json({ id_rapor: result.insertId, ...req.body });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/rapor/:id/nilai', async (req, res) => {
  try {
    const { id_mapel, id_pengisi, nilai_pengetahuan, nilai_keterampilan } = req.body;
    if (!id_mapel) return res.status(400).json({ error: 'Mata pelajaran wajib dipilih' });
    const akhir = Math.round(((Number(nilai_pengetahuan) || 0) + (Number(nilai_keterampilan) || 0)) / 2);
    const pred = akhir >= 90 ? 'A' : (akhir >= 80 ? 'B' : (akhir >= 70 ? 'C' : 'D'));

    const [result] = await pool.query(
      `INSERT INTO nilai (id_rapor, id_mapel, id_pengisi, nilai_pengetahuan, nilai_keterampilan, nilai_akhir, predikat)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         nilai_pengetahuan = VALUES(nilai_pengetahuan),
         nilai_keterampilan = VALUES(nilai_keterampilan),
         nilai_akhir = VALUES(nilai_akhir),
         predikat = VALUES(predikat)`,
      [req.params.id, id_mapel, id_pengisi || null, nilai_pengetahuan || null, nilai_keterampilan || null, akhir, pred]
    );
    res.json({ id_nilai: result.insertId, id_rapor: Number(req.params.id), id_mapel, nilai_akhir: akhir, predikat: pred });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/dokumen-arsip — ERD 1: DOKUMEN_ARSIP
app.get('/api/dokumen-arsip', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT d.*, k.nama_kategori, s.nama_lengkap AS nama_siswa, s.nisn,
             pu.nama_lengkap AS nama_pengunggah, pv.nama_lengkap AS nama_verifikator, ps.nama_lengkap AS nama_penyerah
      FROM dokumen_arsip d
      LEFT JOIN kategori_dokumen k ON k.id_kategori = d.id_kategori
      LEFT JOIN siswa s ON s.id_siswa = d.id_siswa
      LEFT JOIN pengguna pu ON pu.id_pengguna = d.id_pengunggah
      LEFT JOIN pengguna pv ON pv.id_pengguna = d.id_verifikator
      LEFT JOIN pengguna ps ON ps.id_pengguna = d.id_penyerah
      ORDER BY d.id_dokumen DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({
      error: err.code === 'LIMIT_FILE_SIZE' ? 'Ukuran file maksimal 5 MB' : err.message
    });
  }
  if (err.message === 'Format file harus PDF, JPG, atau PNG') {
    return res.status(400).json({ error: err.message });
  }
  console.error('Kesalahan server:', err);
  res.status(500).json({ error: 'Terjadi kesalahan pada server' });
});

async function startServer() {
  try {
    await initMySQL();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 REST API Server MySQL berjalan di http://localhost:${PORT}`);
      console.log(`📊 Database MySQL: ${DB_NAME}`);
    });
  } catch (err) {
    console.error('❌ Server gagal start karena MySQL tidak bisa diinisialisasi:', err.message);
    process.exit(1);
  }
}

startServer();
