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
4. Buat database MySQL `arsip_siswa` dan impor struktur tabel dari `schema.sql`, atau buat database kosong bernama `arsip_siswa`; server membuat tabel saat pertama kali dijalankan.

Skema mencakup entitas pada ERD pengelolaan arsip serta backup/sinkronisasi. Saat server dijalankan, kolom dan tabel ERD yang belum ada ditambahkan tanpa menghapus kolom lama; data kelas dan kategori dari tabel lama juga dinormalisasi ke tabel relasinya.
Nama primary key lama (`id`) pada tabel siswa, dokumen, dan log dipertahankan agar endpoint dan data yang sudah ada tetap kompatibel; kolom foreign key dan relasi ERD ditambahkan.

---

## 🚀 Cara Menjalankan Backend API

### 1. Install Dependensi (Node.js)
Buka Terminal / Command Prompt pada folder proyek ini (`c:\Users\ANY\OneDrive\Attachments\proto type`), lalu jalankan:

```bash
npm install
```

### 2. Pengaturan Koneksi Database dan Login (`.env`)
Sesuaikan nama database, username, dan password MySQL Anda pada file `.env` (atau buat dari file `.env.example`):

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=
DB_NAME=arsip_siswa
DB_PORT=3306
PORT=3000
FRONTEND_ORIGINS=https://anisholikhatin23-ui.github.io,http://localhost:3000,http://127.0.0.1:3000
INITIAL_ADMIN_USERNAME=staf.tu
INITIAL_ADMIN_NAME=Administrator TU
INITIAL_ADMIN_PASSWORD=<kata-sandi-kuat>
GOOGLE_DRIVE_FOLDER_ID=your_google_drive_folder_id
GOOGLE_SERVICE_ACCOUNT_FILE=C:\path\to\service-account.json
```

Atur `INITIAL_ADMIN_PASSWORD` dengan kata sandi kuat. Saat server berjalan, akun admin di `pengguna_tu` dibuat atau diperbarui dengan hash scrypt; kata sandi tidak disimpan sebagai teks biasa. Endpoint API memerlukan sesi login yang berlaku 8 jam. Token sesi hanya disimpan di memori tab browser, sehingga setelah browser dimuat ulang staf perlu login kembali. Jangan gunakan kembali kata sandi pribadi.

### 3. Hubungkan folder Google Drive
1. Aktifkan Google Drive API pada proyek Google Cloud sekolah dan buat service account.
2. Buat kunci JSON service account dan simpan di luar folder proyek. Jangan masukkan file kunci ke Git atau bagikan lewat chat.
3. Bagikan folder Drive sekolah dengan ID di atas ke alamat email service account dengan peran **Editor**. Folder/file tidak perlu dibuat publik.
4. Salin `.env.example` menjadi `.env`, lalu atur ID folder dan lokasi file kunci. Alternatifnya, atur `GOOGLE_SERVICE_ACCOUNT_JSON` sebagai environment variable di server.
5. Jalankan `npm install`, lalu `npm start`. Backend otomatis menambahkan kolom referensi Drive pada tabel dokumen yang sudah ada.

Unggahan PDF/JPG/PNG (maksimal 5 MB) disimpan di folder Drive tersebut. MySQL menyimpan metadata, ID file Drive, dan tipe file; file dialirkan melalui backend tanpa menjadikan file publik. Pastikan Google Drive sudah dikonfigurasi sebelum menyimpan dokumen sungguhan.

### 4. Deploy online dengan Railway dan GitHub Pages

GitHub Pages hanya menyajikan frontend statis; ia tidak menjalankan Node.js atau MySQL. Agar perubahan data tersimpan dan dapat dibuka dari beberapa perangkat:

1. Buat project di Railway, tambahkan service MySQL, lalu deploy service Node.js dari repository ini. File `railway.toml` mengatur `npm start`, health check `/health`, dan restart otomatis.
2. Hubungkan service Node.js dan MySQL pada project/environment Railway yang sama. Backend memprioritaskan variabel MySQL Railway `MYSQLHOST`, `MYSQLPORT`, `MYSQLUSER`, `MYSQLPASSWORD`, dan `MYSQLDATABASE`; pasangan `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, dan `DB_NAME` menjadi fallback untuk koneksi lokal atau pengaturan manual. Jangan isi host online dengan `localhost`. Akun database harus punya izin membuat tabel di database yang dipilih.
3. Isi `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_NAME`, `INITIAL_ADMIN_PASSWORD`, dan `FRONTEND_ORIGINS` di Variables service Node.js. Untuk GitHub Pages, origin frontend adalah `https://anisholikhatin23-ui.github.io` (tanpa nama repository dan tanpa garis miring di akhir). Isi rahasia hanya di dashboard Railway, jangan di GitHub atau chat.
4. Isi `GOOGLE_DRIVE_FOLDER_ID` dan `GOOGLE_SERVICE_ACCOUNT_JSON` di Variables service Node.js. Gunakan isi JSON service account sebagai secret Railway, jangan mengunggah file kunci ke Git. Bagikan folder tujuan kepada email service account dengan izin Editor.
5. Setelah Railway menyediakan domain backend HTTPS, isi konstanta `API_BASE_URL` di `index.html` dengan origin tersebut, misalnya `https://nama-service.up.railway.app`, lalu commit/push perubahan agar GitHub Pages menerbitkan frontend.
6. Pada deploy, backend menyinkronkan 100 data siswa dari `student-data.js` (VII A/B, VIII A/B, IX A/B) ke MySQL. Baris demo `Siswa Contoh`/`DEMO-*` diperbarui; data siswa lain tidak dihapus. Backend juga membuat akun admin berdasarkan variabel `INITIAL_ADMIN_*`. Login menggunakan username dan kata sandi yang Anda atur sendiri di Railway. Endpoint `https://<domain-backend>/health` mengembalikan status MySQL dan Google Drive; pastikan `mysql` dan `googleDrive` sama-sama bernilai `connected`. File unggahan di Railway tidak dialihkan diam-diam ke disk sementara jika Drive belum tersedia.

Jangan memasukkan data siswa sungguhan sebelum langkah-langkah tersebut selesai dan sudah diuji. Penyimpanan lokal browser bukan database bersama dan tidak tersinkron antarperangkat.

### 5. Jalankan Server lokal
```bash
npm start
```

Server backend REST API akan berjalan di **`http://localhost:3000`** dan terhubung langsung dengan database MySQL **`arsip_siswa`**. Buka frontend melalui alamat tersebut, bukan dengan membuka file HTML langsung.

---

## 📡 Endpoint API REST MySQL (`arsip_siswa`)

| Method | Endpoint | Deskripsi |
| ------ | -------- | --------- |
| **GET** | `/api/siswa` | Mengambil seluruh data siswa dari DB MySQL (`arsip_siswa.siswa`), termasuk daftar 100 siswa per kelas |
| **POST** | `/api/auth/login` | Memulai sesi staf TU |
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
| **POST** | `/api/backup/trigger` | Mencatat permintaan backup (belum membuat salinan) |

**Batasan backup:** endpoint pemicu hanya mencatat permintaan dengan status `menunggu`; endpoint tersebut belum membuat salinan database atau menyinkronkan file secara otomatis. Permintaan tidak ditampilkan sebagai backup selesai dan tidak membuat catatan sinkronisasi tujuan palsu.

---

## 📁 File Penting Proyek

- [index.html](./index.html) — Frontend pengelolaan dokumen siswa; isi `API_BASE_URL` untuk menghubungkannya ke backend online
- [server.js](./server.js) — Server Backend REST API yang terhubung ke MySQL `arsip_siswa`
- [schema.sql](./schema.sql) — Struktur database MySQL
- [.env.example](./.env.example) — Contoh pengaturan koneksi MySQL dan Google Drive
- [package.json](./package.json) — Manifest dependensi backend
