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
```

### 3. Jalankan Server
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
| **POST** | `/api/dokumen` | Upload & simpan file dokumen baru ke MySQL |
| **PUT** | `/api/dokumen/:id` | Memperbarui/edit data & file dokumen siswa yang ada di MySQL |
| **DELETE** | `/api/dokumen/:id` | Menghapus dokumen dari MySQL |
| **GET** | `/api/backup/logs` | Mengambil log aktivitas dari MySQL (`arsip_siswa.log_aktivitas`) |
| **POST** | `/api/backup/trigger` | Menyimpan log backup manual ke MySQL |

---

## 📁 File Penting Proyek

- [index.html](file:///c:/Users/ANY/OneDrive/Attachments/proto%20type/index.html) — Frontend UI/UX Prototipe Sistem Pengelolaan Dokumen (100 Siswa per Kelas & Fitur Edit Dokumen)
- [server.js](file:///c:/Users/ANY/OneDrive/Attachments/proto%20type/server.js) — Server Backend REST API yang terhubung ke MySQL `arsip_siswa`
- [schema.sql](file:///c:/Users/ANY/OneDrive/Attachments/proto%20type/schema.sql) — File Script SQL database MySQL `arsip_siswa` (100 data siswa & dokumen sampel)
- [.env.example](file:///c:/Users/ANY/OneDrive/Attachments/proto%20type/.env.example) — Pengaturan koneksi MySQL `arsip_siswa`
- [package.json](file:///c:/Users/ANY/OneDrive/Attachments/proto%20type/package.json) — Manifest dependensi (`express`, `mysql2`, `multer`)
