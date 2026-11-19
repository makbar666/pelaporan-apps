# Aktivasi Neon

Proyek yang dipilih: `pelaporan-apps` (`odd-sky-05139512`). ID proyek/branch dari screenshot bukan credential koneksi.

## 1. Siapkan branch dan Auth

Buat branch pengembangan dari production untuk pengujian. Periksa bahwa proyek berada di AWS dan tidak memakai IP Allow/Private Networking sebelum mengaktifkan Managed Neon Auth. Pertahankan perlindungan jaringan yang sudah ada; jika Auth tidak tersedia, selesaikan pilihan deployment terlebih dahulu.

Pada branch pengembangan, aktifkan Managed Neon Auth. Salin **Auth URL** lengkap (termasuk path database/auth yang ditampilkan console). Tambahkan origin situs Netlify dan origin lokal di trusted domains. Gunakan Auth URL dan database dari branch yang sama. Tidak perlu mengaktifkan Data API atau Neon Functions; backend aplikasi berada di Netlify Functions.

## 2. Buat tabel

Jalankan isi `database/schema.sql` pada SQL Editor branch yang dipilih. Skema dapat dijalankan ulang. Tabel menggunakan RLS tanpa policy publik; backend menggunakan role pemilik tabel, dan akses setiap permintaan diperiksa pada server. Credential pemilik ini harus tetap di environment backend.

Tabel `incident_members` membatasi anggota aplikasi; memiliki akun Auth saja belum memberi akses laporan. Jangan mengubah tabel internal `neon_auth` secara manual.

## 3. Isi environment

Di Netlify, buka konfigurasi proyek → Environment variables. Tambahkan scope Functions:

| Nama | Nilai |
| --- | --- |
| `DATABASE_URL` | Connection string PostgreSQL **pooled** dari tombol Connect di Neon |
| `NEON_AUTH_BASE_URL` | Auth URL lengkap dari Neon Auth pada branch yang sama |
| `NEON_AUTH_COOKIE_SECRET` | Nilai acak minimal 32 karakter |

Buat secret secara lokal, lalu salin hanya ke environment; jangan commit hasilnya:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Untuk script lokal, salin `.env.example` menjadi `.env` lalu isi tiga nilai di atas. `.env` sudah dikecualikan dari Git. Tambahkan `APP_ORIGIN=https://nama-situs.netlify.app` jika localhost tidak diizinkan di Neon Auth. File `.env.example` hanya berisi placeholder.

## 4. Buat akun anggota

Jalankan secara lokal dengan akses database pengelola, bukan dari browser:

1. Tambahkan `MEMBER_PASSWORD` berisi password awal (12–128 karakter) ke `.env` lokal.
2. Jalankan:

```powershell
node scripts/add-member.mjs anggota@organisasi.id "Nama Anggota"
```

3. Hapus `MEMBER_PASSWORD` dari `.env` setelah selesai. Script membuat akun memakai SDK Neon Auth dan memasukkannya ke daftar anggota. Jika email sudah ada di Neon Auth, script hanya memberi/memperbarui akses; password lama tetap berlaku.
4. Jika verifikasi email diwajibkan pada Auth, selesaikan verifikasi sebelum login. Alur pengiriman email mengikuti konfigurasi Neon; pastikan konfigurasi email production sudah siap. UI aplikasi saat ini hanya menyediakan login dan logout, bukan reset password/verifikasi.

Tidak ada pendaftaran publik pada aplikasi. Neon dapat tetap mengekspos signup upstream; akun yang dibuat lewat upstream tidak memperoleh akses laporan tanpa baris aktif di `incident_members`.

Untuk menonaktifkan akses anggota di SQL Editor:

```sql
UPDATE incident_members SET enabled = false WHERE user_id = 'ID_PENGGUNA';
```

Pemeriksaan anggota dan sesi dilakukan pada setiap permintaan data. Tidak ada UI admin untuk manajemen akun.

## 5. Verifikasi lalu terapkan production

Uji dua akun: A membuat laporan; B melihatnya lewat Semua laporan tetapi tidak dapat mengedit/hapus. Uji juga impor pada akun B dan pastikan laporan A tetap tersedia. Setelah berhasil, jalankan skema dan konfigurasi pada production dengan credential production, lalu deploy ulang Netlify. Jangan menyalin Auth URL development ke deployment production.

Cookie sesi Secure/HttpOnly diterbitkan pada domain aplikasi menggunakan toolkit server Neon, sehingga tidak bergantung pada cookie pihak ketiga di browser. Akses data memerlukan anggota aktif. Pemilik laporan diambil dari sesi; `ownerId` dalam formulir/cadangan tidak dipercaya. SQL memakai parameter dan perubahan lama ditolak melalui kolom `version`.
