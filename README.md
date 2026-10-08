# Sistem Pengelolaan Dokumen Administrasi Siswa
**SMP Muhammadiyah 1 Negara Batin**

Aplikasi Pengelolaan Dokumen Administrasi Siswa terintegrasi dengan Database MySQL **`arsip_siswa`** dan antarmuka UI/UX Prototipe Tata Usaha.

---

## 🗄️ Persiapan Database MySQL (`arsip_siswa`)

1. Buka **XAMPP Control Panel** (atau MySQL Server Anda) dan pastikan service **MySQL** sudah berjalan (**Running**).
2. Buka **phpMyAdmin** (`http://localhost/phpmyadmin`) atau MySQL Workbench / Navicat / DBeaver.
3. Jalankan query berikut:
   ```sql
   CREATE DATABASE IF NOT EXISTS arsip_siswa;
   ```
4. Impor struktur tabel & data awal dengan mengimpor file `schema.sql` di phpMyAdmin (terdapat 100 data siswa terdaftar per kelas VII A - IX B), atau biarkan `server.js` membuat tabel & memasukkan data otomatis saat pertama kali dijalankan.

Skema mencakup entitas pada ERD pengelolaan arsip serta backup/sinkronisasi. Saat server dijalankan, kolom dan tabel ERD yang belum ada ditambahkan tanpa menghapus kolom lama; data kelas dan kategori dari tabel lama juga dinormalisasi ke tabel relasinya.
Nama primary key lama (`id`) pada tabel siswa, dokumen, dan log dipertahankan agar endpoint dan data yang sudah ada tetap kompatibel; kolom foreign key dan relasi ERD ditambahkan.

---

## 🚀 Cara Menjalankan Backend API

### 1. Install Dependensi (Node.js)
Buka Terminal / Command Prompt pada folder proyek ini (`c:\Users\ANY\OneDrive\Attachments\proto type`), lalu jalankan:

```bash
npm install
```

### 2. Pengaturan Koneksi Database (`.env`)
Sesuaikan nama database, username, dan password MySQL Anda pada file `.env` (atau buat dari file `.env.example`):

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=arsip_siswa
DB_PORT=3306
PORT=3000
GOOGLE_DRIVE_FOLDER_ID=your_google_drive_folder_id
GOOGLE_SERVICE_ACCOUNT_FILE=C:\path\to\service-account.json
```

### 3. Hubungkan folder Google Drive
1. Aktifkan Google Drive API pada proyek Google Cloud sekolah dan buat service account.
2. Buat kunci JSON service account dan simpan di luar folder proyek. Jangan masukkan file kunci ke Git atau bagikan lewat chat.
3. Bagikan folder Drive sekolah dengan ID di atas ke alamat email service account dengan peran **Editor**. Folder/file tidak perlu dibuat publik.
4. Salin `.env.example` menjadi `.env`, lalu atur ID folder dan lokasi file kunci. Alternatifnya, atur `GOOGLE_SERVICE_ACCOUNT_JSON` sebagai environment variable di server.
5. Jalankan `npm install`, lalu `npm start`. Backend otomatis menambahkan kolom referensi Drive pada tabel dokumen yang sudah ada.

Unggahan PDF/JPG/PNG (maksimal 5 MB) disimpan di folder Drive tersebut. MySQL menyimpan metadata, ID file Drive, dan tipe file; file dialirkan melalui backend tanpa menjadikan file publik. Jika konfigurasi atau izin Drive belum benar, unggahan akan gagal dengan pesan error.

**Keamanan:** formulir login saat ini hanya tampilan prototipe dan endpoint API belum memiliki autentikasi/otorisasi backend. Gunakan hanya di lingkungan lokal/jaringan tepercaya selama pengembangan. Sebelum dipublikasikan ke internet atau dipakai untuk dokumen siswa sungguhan, autentikasi dan pemeriksaan hak akses backend wajib diterapkan.

### 4. Jalankan Server
```bash
npm start
```

Server backend REST API akan berjalan di **`http://localhost:3000`** dan terhubung langsung dengan database MySQL **`arsip_siswa`**.

---

## 📡 Endpoint API REST MySQL (`arsip_siswa`)

| Method | Endpoint | Deskripsi |
| ------ | -------- | --------- |
| **GET** | `/api/siswa` | Mengambil data 100 siswa dari DB MySQL (`arsip_siswa.siswa`) |
| **POST** | `/api/siswa` | Menyimpan data siswa baru ke DB MySQL |
| **PUT** | `/api/siswa/:id` | Memperbarui/edit data siswa (nama, nisn, kelas) di DB MySQL |
| **DELETE** | `/api/siswa/:id` | Menghapus siswa dari DB MySQL |
| **GET** | `/api/dokumen` | Mengambil daftar dokumen dari DB MySQL (`arsip_siswa.dokumen`) |
| **POST** | `/api/dokumen` | Simpan metadata ke MySQL dan file ke Google Drive |
| **PUT** | `/api/dokumen/:id` | Memperbarui metadata dan/atau mengganti file di Drive |
| **GET** | `/api/dokumen/:id/file` | Pratinjau/unduh file melalui backend |
| **DELETE** | `/api/dokumen/:id` | Menghapus metadata dan file Drive terkait |
| **GET** | `/api/backup/logs` | Mengambil log aktivitas dari MySQL (`arsip_siswa.log_aktivitas`) |
| **GET** | `/api/kelas`, `/api/kategori-dokumen`, `/api/pengguna-tu` | Mengambil data referensi ERD (tanpa mengembalikan kata sandi pengguna) |
| **GET, POST** | `/api/surat-legalisir` | Melihat dan mencatat surat legalisir |
| **GET, POST, PUT** | `/api/backup/jadwal` | Membaca dan mengelola jadwal backup |
| **GET, POST** | `/api/titik-penyimpanan` | Membaca dan menambah titik penyimpanan |
| **GET** | `/api/backup` | Mengambil catatan permintaan backup |
| **GET, POST** | `/api/backup/:id/detail-sinkron` | Membaca dan mencatat status sinkronisasi per titik penyimpanan |
| **POST** | `/api/backup/trigger` | Mencatat permintaan backup dan status titik tujuan |

**Batasan backup:** endpoint pemicu saat ini baru mencatat permintaan dengan status `menunggu`; endpoint tersebut belum membuat salinan database atau menyinkronkan file secara otomatis. UI tidak lagi melaporkan permintaan itu sebagai backup yang berhasil dijalankan.

---

## 📁 File Penting Proyek

- [index.html](./index.html) — Frontend UI/UX prototipe pengelolaan dokumen siswa dengan data contoh
- [server.js](./server.js) — Server Backend REST API yang terhubung ke MySQL `arsip_siswa`
- [schema.sql](./schema.sql) — Struktur database MySQL dan data contoh
- [.env.example](./.env.example) — Contoh pengaturan koneksi MySQL dan Google Drive
- [package.json](./package.json) — Manifest dependensi backend
