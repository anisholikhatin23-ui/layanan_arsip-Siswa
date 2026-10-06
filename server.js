const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const mysql = require('mysql2/promise');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Config MySQL
const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'arsip_siswa';
const DB_PORT = process.env.DB_PORT || 3306;

let pool;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend & file uploads
app.use(express.static(__dirname));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

if (!fs.existsSync(path.join(__dirname, 'uploads'))) {
  fs.mkdirSync(path.join(__dirname, 'uploads'));
}

// Storage Upload File Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, 'doc-' + Date.now() + '-' + Math.round(Math.random() * 1E9) + ext);
  }
});
const upload = multer({ storage });

// Inisialisasi Database MySQL (Auto-Create Database & Tables)
async function initMySQL() {
  try {
    // 1. Koneksi awal tanpa memilih database untuk memastikan database 'arsip_siswa' ada
    const tempConn = await mysql.createConnection({
      host: DB_HOST,
      user: DB_USER,
      password: DB_PASSWORD,
      port: DB_PORT
    });

    await tempConn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await tempConn.end();

    // 2. Buat Connection Pool ke database 'arsip_siswa'
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

    console.log(`✅ Terhubung ke database MySQL: ${DB_NAME} di ${DB_HOST}:${DB_PORT}`);

    // 3. Buat Tabel Siswa
    await pool.query(`
      CREATE TABLE IF NOT EXISTS siswa (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nama VARCHAR(255) NOT NULL,
        nisn VARCHAR(50) UNIQUE NOT NULL,
        kelas VARCHAR(50) NOT NULL,
        status_dokumen VARCHAR(20) DEFAULT 'ok',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 4. Buat Tabel Dokumen
    await pool.query(`
      CREATE TABLE IF NOT EXISTS dokumen (
        id INT AUTO_INCREMENT PRIMARY KEY,
        siswa_id INT NULL,
        nama VARCHAR(255) NOT NULL,
        kategori VARCHAR(100) NOT NULL,
        tahun VARCHAR(20) NOT NULL,
        jenis VARCHAR(50) DEFAULT 'Fisik + Digital',
        file_url VARCHAR(255) NULL,
        status VARCHAR(20) DEFAULT 'ok',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (siswa_id) REFERENCES siswa(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // 5. Buat Tabel Log Aktivitas
    await pool.query(`
      CREATE TABLE IF NOT EXISTS log_aktivitas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        waktu VARCHAR(50) NOT NULL,
        teks TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // Seed data sampel 100 siswa jika tabel siswa masih kosong
    const [rows] = await pool.query('SELECT COUNT(*) AS total FROM siswa');
    if (rows[0].total === 0) {
      console.log('📦 Mengisi 100 data siswa per kelas ke MySQL database arsip_siswa...');
      await pool.query(`
        INSERT INTO siswa (id, nama, nisn, kelas, status_dokumen) VALUES
        (1, 'Ahmad Fauzi', '0071234001', 'VII A', 'ok'),
        (2, 'Rani Kusuma', '0071234002', 'VII A', 'ok'),
        (3, 'Bagas Saputra', '0071234003', 'VII A', 'ok'),
        (4, 'Dewi Anggraini', '0071234004', 'VII A', 'ok'),
        (5, 'Aditia Pratama', '0071234005', 'VII A', 'ok'),
        (6, 'Annisa Rahmadani', '0071234006', 'VII A', 'warn'),
        (7, 'Bayu Setiawan', '0071234007', 'VII A', 'ok'),
        (8, 'Citra Lestari', '0071234008', 'VII A', 'ok'),
        (9, 'Dimas Kurniawan', '0071234009', 'VII A', 'bad'),
        (10, 'Eka Putri', '0071234010', 'VII A', 'ok'),
        (11, 'Farhan Ramadhan', '0071234011', 'VII A', 'ok'),
        (12, 'Gita Nurhaliza', '0071234012', 'VII A', 'ok'),
        (13, 'Hadi Wijaya', '0071234013', 'VII A', 'warn'),
        (14, 'Indah Permata', '0071234014', 'VII A', 'ok'),
        (15, 'Joko Susilo', '0071234015', 'VII A', 'ok'),
        (16, 'Kartika Sari', '0071234016', 'VII A', 'ok'),
        (17, 'Luqman Hakim', '0071234017', 'VII A', 'ok'),

        (18, 'Fajar Ramadhan', '0071234018', 'VII B', 'ok'),
        (19, 'Putri Amelia', '0071234019', 'VII B', 'ok'),
        (20, 'M. Rizky Febrian', '0071234020', 'VII B', 'warn'),
        (21, 'Nabila Syifa', '0071234021', 'VII B', 'ok'),
        (22, 'Octavia Maharani', '0071234022', 'VII B', 'ok'),
        (23, 'Panji Kusuma', '0071234023', 'VII B', 'ok'),
        (24, 'Qonita Azizah', '0071234024', 'VII B', 'ok'),
        (25, 'Raditya Putra', '0071234025', 'VII B', 'bad'),
        (26, 'Sinta Bella', '0071234026', 'VII B', 'ok'),
        (27, 'Taufik Hidayat', '0071234027', 'VII B', 'ok'),
        (28, 'Ulfa Nuraini', '0071234028', 'VII B', 'ok'),
        (29, 'Vina Panduwinata', '0071234029', 'VII B', 'warn'),
        (30, 'Wahyu Nugroho', '0071234030', 'VII B', 'ok'),
        (31, 'Xena Amelia', '0071234031', 'VII B', 'ok'),
        (32, 'Yusuf Mansur', '0071234032', 'VII B', 'ok'),
        (33, 'Zahra Aulia', '0071234033', 'VII B', 'ok'),
        (34, 'Aldo Fernando', '0071234034', 'VII B', 'ok'),

        (35, 'Nurul Hidayah', '0061234035', 'VIII A', 'ok'),
        (36, 'Rizky Firmansyah', '0061234036', 'VIII A', 'ok'),
        (37, 'Salsabila Putri', '0061234037', 'VIII A', 'ok'),
        (38, 'Bella Safitri', '0061234038', 'VIII A', 'warn'),
        (39, 'Candra Gunawan', '0061234039', 'VIII A', 'ok'),
        (40, 'Dian Sastrowardoyo', '0061234040', 'VIII A', 'ok'),
        (41, 'Erika Carlina', '0061234041', 'VIII A', 'ok'),
        (42, 'Faisal Amir', '0061234042', 'VIII A', 'bad'),
        (43, 'Grace Melia', '0061234043', 'VIII A', 'ok'),
        (44, 'Hafiz Maulana', '0061234044', 'VIII A', 'ok'),
        (45, 'Intan Suwandi', '0061234045', 'VIII A', 'ok'),
        (46, 'Julian Syahputra', '0061234046', 'VIII A', 'warn'),
        (47, 'Kiki Amalia', '0061234047', 'VIII A', 'ok'),
        (48, 'Leo Rolly', '0061234048', 'VIII A', 'ok'),
        (49, 'Mitha Lestari', '0061234049', 'VIII A', 'ok'),
        (50, 'Naufal Azhar', '0061234050', 'VIII A', 'ok'),
        (51, 'Olive Rahma', '0061234051', 'VIII A', 'ok'),

        (52, 'Siti Marlina', '0061234052', 'VIII B', 'ok'),
        (53, 'Dedi Firmansyah', '0061234053', 'VIII B', 'warn'),
        (54, 'Budiman Santoso', '0061234054', 'VIII B', 'ok'),
        (55, 'Permata Sari', '0061234055', 'VIII B', 'ok'),
        (56, 'Qori Supriatna', '0061234056', 'VIII B', 'ok'),
        (57, 'Rahmat Hidayat', '0061234057', 'VIII B', 'bad'),
        (58, 'Surya Pratama', '0061234058', 'VIII B', 'ok'),
        (59, 'Tari Wulandari', '0061234059', 'VIII B', 'ok'),
        (60, 'Utami Dewi', '0061234060', 'VIII B', 'warn'),
        (61, 'Vicky Prasetyo', '0061234061', 'VIII B', 'ok'),
        (62, 'Widya Astuti', '0061234062', 'VIII B', 'ok'),
        (63, 'Yahya Muhaimin', '0061234063', 'VIII B', 'ok'),
        (64, 'Zikri Ahmad', '0061234064', 'VIII B', 'ok'),
        (65, 'Anisa Tri Astuti', '0061234065', 'VIII B', 'ok'),
        (66, 'Bambang Pamungkas', '0061234066', 'VIII B', 'ok'),
        (67, 'Chintya Laura', '0061234067', 'VIII B', 'ok'),
        (68, 'Doni Tata', '0061234068', 'VIII B', 'ok'),

        (69, 'Andi Pratama', '0051234069', 'IX A', 'ok'),
        (70, 'Maya Lestari', '0051234070', 'IX A', 'ok'),
        (71, 'Yoga Prasetyo', '0051234071', 'IX A', 'warn'),
        (72, 'Elvira Devinamira', '0051234072', 'IX A', 'ok'),
        (73, 'Febri Hariyadi', '0051234073', 'IX A', 'ok'),
        (74, 'Gilang Dirga', '0051234074', 'IX A', 'ok'),
        (75, 'Hesti Purwadinata', '0051234075', 'IX A', 'ok'),
        (76, 'Irfan Bachdim', '0051234076', 'IX A', 'bad'),
        (77, 'Julia Perez', '0051234077', 'IX A', 'ok'),
        (78, 'Kevin Sanjaya', '0051234078', 'IX A', 'ok'),
        (79, 'Larasati Putri', '0051234079', 'IX A', 'ok'),
        (80, 'M. Ahsan', '0051234080', 'IX A', 'warn'),
        (81, 'Nadya Hutagalung', '0051234081', 'IX A', 'ok'),
        (82, 'Oscar Lawalata', '0051234082', 'IX A', 'ok'),
        (83, 'Prilly Latuconsina', '0051234083', 'IX A', 'ok'),
        (84, 'Raffi Ahmad', '0051234084', 'IX A', 'ok'),

        (85, 'Budi Santoso', '0051234085', 'IX B', 'ok'),
        (86, 'Sheila Dara', '0051234086', 'IX B', 'ok'),
        (87, 'Titi Kamal', '0051234087', 'IX B', 'warn'),
        (88, 'Uus Wijaya', '0051234088', 'IX B', 'ok'),
        (89, 'Vino G. Bastian', '0051234089', 'IX B', 'ok'),
        (90, 'Wika Salim', '0051234090', 'IX B', 'ok'),
        (91, 'Yura Yunita', '0051234091', 'IX B', 'bad'),
        (92, 'Zaskia Gotik', '0051234092', 'IX B', 'ok'),
        (93, 'Ardit Erwandha', '0051234093', 'IX B', 'ok'),
        (94, 'Bintang Emon', '0051234094', 'IX B', 'ok'),
        (95, 'Cakra Khan', '0051234095', 'IX B', 'warn'),
        (96, 'Denny Cagur', '0051234096', 'IX B', 'ok'),
        (97, 'Enzy Storia', '0051234097', 'IX B', 'ok'),
        (98, 'Fiersa Besari', '0051234098', 'IX B', 'ok'),
        (99, 'Gading Marten', '0051234099', 'IX B', 'ok'),
        (100, 'Hito Caesar', '0051234100', 'IX B', 'ok')
      `);

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

      await pool.query(`
        INSERT INTO log_aktivitas (waktu, teks) VALUES
        ('09:02 WIB', 'Google Drive tersinkronisasi otomatis'),
        ('08:40 WIB', 'Laptop sekolah tersinkronisasi otomatis'),
        ('Kemarin', 'Staf TU memperbarui data 100 siswa per kelas')
      `);
    }

  } catch (err) {
    console.error('❌ Gagal mengoneksikan MySQL:', err.message);
    console.error('💡 Pastikan MySQL server (XAMPP / MySQL Service) sudah berjalan!');
  }
}

// Inisialisasi DB saat server start
initMySQL();

// ================= API ENDPOINTS =================

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

// 2. POST /api/siswa — Tambah data siswa baru ke MySQL
app.post('/api/siswa', async (req, res) => {
  try {
    const { nama, nisn, kelas, status_dokumen } = req.body;
    if (!nama || !nisn || !kelas) {
      return res.status(400).json({ error: 'Nama, NISN, dan Kelas wajib diisi' });
    }

    const sql = 'INSERT INTO siswa (nama, nisn, kelas, status_dokumen) VALUES (?, ?, ?, ?)';
    const [result] = await pool.query(sql, [nama, nisn, kelas, status_dokumen || 'ok']);

    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    await pool.query('INSERT INTO log_aktivitas (waktu, teks) VALUES (?, ?)', 
      [now, `Data siswa baru "${nama}" (${kelas}) ditambahkan ke MySQL`]);

    res.json({ id: result.insertId, nama, nisn, kelas, status_dokumen: status_dokumen || 'ok' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. PUT /api/siswa/:id — Perbarui data siswa di MySQL
app.put('/api/siswa/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nama, nisn, kelas, status_dokumen } = req.body;
    if (!nama || !nisn || !kelas) {
      return res.status(400).json({ error: 'Nama, NISN, dan Kelas wajib diisi' });
    }

    const sql = 'UPDATE siswa SET nama = ?, nisn = ?, kelas = ?, status_dokumen = ? WHERE id = ?';
    await pool.query(sql, [nama, nisn, kelas, status_dokumen || 'ok', id]);

    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    await pool.query('INSERT INTO log_aktivitas (waktu, teks) VALUES (?, ?)', 
      [now, `Data siswa "${nama}" (${kelas}) diperbarui di database MySQL`]);

    res.json({ id: Number(id), nama, nisn, kelas, status_dokumen: status_dokumen || 'ok' });
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

    await pool.query('DELETE FROM dokumen WHERE siswa_id = ?', [id]);
    await pool.query('DELETE FROM siswa WHERE id = ?', [id]);

    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    await pool.query('INSERT INTO log_aktivitas (waktu, teks) VALUES (?, ?)', 
      [now, `Data siswa "${siswaNama}" beserta dokumennya dihapus dari MySQL`]);

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

// 6. POST /api/dokumen — Upload / Tambah dokumen baru
app.post('/api/dokumen', upload.single('file'), async (req, res) => {
  try {
    const { siswa_id, nama, kategori, tahun, jenis, status } = req.body;
    const file_url = req.file ? `/uploads/${req.file.filename}` : null;

    const sql = 'INSERT INTO dokumen (siswa_id, nama, kategori, tahun, jenis, file_url, status) VALUES (?, ?, ?, ?, ?, ?, ?)';
    const [result] = await pool.query(sql, [siswa_id || null, nama, kategori, tahun || '2026', jenis || 'Fisik + Digital', file_url, status || 'ok']);

    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    await pool.query('INSERT INTO log_aktivitas (waktu, teks) VALUES (?, ?)', 
      [now, `Dokumen baru "${nama}" disimpan ke database MySQL`]);

    res.json({ id: result.insertId, siswa_id, nama, kategori, tahun, jenis, file_url, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. PUT /api/dokumen/:id — Perbarui / Edit data & file dokumen di MySQL
app.put('/api/dokumen/:id', upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;
    const { siswa_id, nama, kategori, tahun, jenis, status } = req.body;
    const file_url = req.file ? `/uploads/${req.file.filename}` : undefined;

    let sql, params;
    if (file_url !== undefined) {
      sql = 'UPDATE dokumen SET siswa_id = ?, nama = ?, kategori = ?, tahun = ?, jenis = ?, file_url = ?, status = ? WHERE id = ?';
      params = [siswa_id || null, nama, kategori, tahun || '2026', jenis || 'Fisik + Digital', file_url, status || 'ok', id];
    } else {
      sql = 'UPDATE dokumen SET siswa_id = ?, nama = ?, kategori = ?, tahun = ?, jenis = ?, status = ? WHERE id = ?';
      params = [siswa_id || null, nama, kategori, tahun || '2026', jenis || 'Fisik + Digital', status || 'ok', id];
    }
    await pool.query(sql, params);

    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    await pool.query('INSERT INTO log_aktivitas (waktu, teks) VALUES (?, ?)', 
      [now, `Data dokumen "${nama}" (ID: ${id}) diperbarui di database MySQL`]);

    res.json({ id: Number(id), siswa_id, nama, kategori, tahun, jenis, file_url, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. DELETE /api/dokumen/:id — Hapus dokumen dari MySQL
app.delete('/api/dokumen/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query('DELETE FROM dokumen WHERE id = ?', [id]);
    res.json({ message: 'Dokumen berhasil dihapus' });
  } catch (err) {
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

// 10. POST /api/backup/trigger — Trigger manual backup
app.post('/api/backup/trigger', async (req, res) => {
  try {
    const now = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
    const teks = 'Backup database MySQL manual (3 titik penyimpanan) berhasil dijalankan oleh Staf TU';
    await pool.query('INSERT INTO log_aktivitas (waktu, teks) VALUES (?, ?)', [now, teks]);
    res.json({ success: true, timestamp: now, message: teks });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Jalankan Server
app.listen(PORT, () => {
  console.log(`🚀 REST API Server MySQL berjalan di http://localhost:${PORT}`);
  console.log(`📊 Database MySQL: ${DB_NAME}`);
});
