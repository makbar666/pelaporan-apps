# Sistem Pelaporan Bencana Pusdalops PB

Antarmuka HTML/CSS/JavaScript native, backend Netlify Functions (Node.js 22), database Postgres di Neon, dan Managed Neon Auth. PHP 8.2 dipakai untuk merender template menjadi HTML statis sebelum commit. Tidak memakai framework UI, MySQL, atau Composer.

## Fitur dan akses

Antarmuka dan alur dirombak berdasarkan analisis lokal `analisis-rea/sistem-pelaporan-bpbd/ANALISIS.md`: input kejadian, rekapitulasi, dan laporan resmi. Cakupan meliputi 35 kabupaten/kota Jawa Tengah, kecamatan/desa, jenis bencana, korban (jiwa), rumah terdampak (unit), fasilitas umum, estimasi kerugian, upaya, status penanganan, sumber informasi, dan petugas.

- Statistik dan grafik batang mengikuti seluruh filter: kepemilikan, wilayah, jenis, status, periode, dan pencarian. Grafik dibuat dengan HTML/CSS lokal tanpa Chart.js/CDN. Jumlah penduduk adalah akumulasi laporan, bukan penduduk unik.
- Detail kejadian, perubahan status cepat khusus pemilik, dan foto terkompresi tersedia. Foto maksimal 3 per laporan; sumber PNG/JPEG/WebP maksimal 10 MB dan 40 megapiksel, lalu diubah ke JPEG maksimal sekitar 135 KB per foto.
- Foto disimpan online dalam JSONB Neon dengan batas ukuran, bukan di Local Storage sebagai arsip utama. Daftar API tidak mengirim foto; endpoint detail mengambil foto saat diperlukan. Kapasitas foto ikut mengurangi kuota database Neon. Untuk volume foto besar, pindahkan ke object storage melalui pekerjaan terpisah.
- Dokumen A4 tersedia per kejadian, gabungan pilihan, atau rekap hasil filter. Tersedia salin teks untuk WhatsApp, CSV dengan pengutipan semua sel dan perlindungan formula, serta JSON lengkap termasuk foto.
- Cadangan JSON mengikuti hasil filter atau pilihan checkbox. Impor tetap maksimal 4 MB / 1.000 laporan dan mengganti seluruh laporan akun aktif. Bila cadangan terlalu besar, pilih lebih sedikit laporan; CSV tidak mencakup foto dan bukan backup lengkap.
- Laporan lama tetap tersimpan dengan ID, pemilik, dan versi yang sama; kolom bencana yang belum tersedia ditampilkan kosong/0 tanpa mengubah isi database. Draf lama tetap dapat dipulihkan sebagai rekaman legacy. Tidak perlu migrasi SQL baru untuk perombakan ini: kolom `data` yang ada memakai JSONB.
- Tidak ada data contoh otomatis atau tombol yang mengganti arsip dengan data dummy.

- Login email/password; akses aplikasi hanya untuk akun dalam `incident_members` yang aktif.
- Rekap awal **Laporan saya**. Pilihan **Semua laporan** menampilkan laporan seluruh tim yang diizinkan. Ringkasan/badge mengikuti pilihan ini.
- Semua anggota dapat membaca, mencetak, menyalin, dan mengekspor laporan tim. Hanya pemilik dapat mengedit/menghapus; pemeriksaan dilakukan di backend.
- Impor JSON mengganti laporan akun yang sedang masuk, bukan laporan anggota lain. Pemilik/ID dalam cadangan diabaikan; ID baru dibuat server. Konflik nomor membatalkan seluruh impor.
- Nomor laporan unik di seluruh tim. Versi laporan mencegah edit lama menimpa perubahan baru.

## Aktivasi Neon dan Netlify

Panduan lengkap: [database/README.md](database/README.md). Aplikasi tidak dapat login sampai konfigurasi dan tabel tersedia.

1. Siapkan branch pengembangan pada proyek Neon yang sudah ada, aktifkan Managed Neon Auth jika proyek AWS dan tidak menggunakan IP Allow/Private Networking. Jangan melepas perlindungan jaringan proyek yang sudah ada.
2. Jalankan `database/schema.sql` di SQL Editor pada branch tersebut. Database dan Auth URL harus berasal dari branch yang sama. Data API tidak diperlukan.
3. Daftarkan origin aplikasi (`https://nama-situs.netlify.app`) di trusted domains Neon Auth, termasuk origin preview jika digunakan.
4. Isi environment variables Netlify pada scope **Functions**: `DATABASE_URL` (pooled), `NEON_AUTH_BASE_URL` (URL lengkap dari Auth), dan `NEON_AUTH_COOKIE_SECRET` (acak, minimal 32 karakter). Jangan masukkan credential ke Git atau direktori `public`.
5. Buat akun dan beri akses dengan script lokal pada panduan. Tidak ada halaman pendaftaran publik di aplikasi.
6. Netlify memakai build command `npm run build`, publish directory `public`, functions directory `netlify/functions`. Pengaturan ada di `netlify.toml`. Deploy ulang setelah env diubah.
7. Uji dua akun pada branch pengembangan, lalu terapkan konfigurasi dan skema yang sama ke production. Jangan reset branch production untuk mengaktifkan fitur ini.

## Pengembangan lokal

```powershell
npm.cmd ci
Copy-Item .env.example .env
# Isi .env dengan konfigurasi branch pengembangan Neon.
php build-static.php
npm.cmd run build
npm.cmd run dev
```

Buka `http://localhost:8083`. `php -S` saja hanya merender antarmuka dan tidak menjalankan backend online. Hosting PHP biasa saja tidak mencukupi untuk versi online ini; backend Netlify Functions tetap dibutuhkan. Deploy manual folder `public` saja juga tidak menyertakan backend.

Setelah mengubah markup PHP atau definisi kolom di `assets/report-fields.json`, jalankan `php build-static.php` dan commit `public/index.html`. Validasi bersama ada di `assets/js/model.js` (dipakai browser dan backend), termasuk daftar wilayah/jenis/status. `npm run build` menyalin aset lokal dan memeriksa kesesuaian definisi kolom. Tidak ada credential yang dipakai dalam build frontend.

## Migrasi data lokal dan cadangan

Data lama `incident_reports_v1` tetap dipertahankan. Pada browser/domain lama, gunakan **Ekspor data lokal lama**. Masuk ke akun tujuan pada aplikasi online, lalu **Impor laporan saya**. Impor maksimal 4 MB / 1.000 laporan. Impor mengganti seluruh laporan akun tersebut; ekspor cadangan online dahulu bila sudah berisi data. Logo, pengaturan, dan draf tidak disertakan dalam cadangan.

Draf dan pengaturan cetak disimpan dengan kunci Local Storage per ID akun; laporan online tidak dicache ke Local Storage. Pengaturan browser bukan pengganti kontrol akses perangkat: orang yang mengakses profil browser dapat membaca draf lokal. Logout mengosongkan tampilan tetapi mempertahankan draf akun tersebut untuk login berikutnya. Draf lokal versi lama belum otomatis dipindahkan ke akun.

## Cetak dan PDF

Pilih Lihat atau beberapa laporan, lalu buka pratinjau. Simpan PDF memakai tujuan PDF pada dialog cetak browser. Gunakan A4, skala 100%, dan matikan header/footer bawaan browser. Dokumen panjang dapat memakai beberapa halaman. PDF tidak disimpan di server. Logo PNG/JPG maksimal 500 KB, disimpan sebagai pengaturan lokal akun.

## Pemeriksaan

`npm test` memeriksa validasi, penolakan akses, kepemilikan dari sesi, pencegahan CSRF, versi perubahan, dan transaksi impor. Tes database memakai PostgreSQL WASM lokal (PGlite), bukan database Neon produksi. Tes login yang memakai mock bukan bukti koneksi live berhasil. Uji Neon Auth, trusted domains, cookie HTTPS, dan dua akun pada deployment setelah env diisi.

Dependensi runtime backend: SDK resmi `@neon/auth` dan driver `@neondatabase/serverless`. PGlite hanya dependensi pengujian. Tidak ada tracking/analytics. Sesi memakai cookie HttpOnly/Secure pada origin aplikasi melalui toolkit server Neon; credential database tidak pernah dikirim ke browser. Perubahan dari perangkat lain tampil setelah **Muat ulang data**; tidak ada polling atau sinkronisasi realtime.
