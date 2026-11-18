# Sistem Pembuatan Laporan Kejadian

Aplikasi PHP 8.2+, HTML/CSS, dan JavaScript native. Tidak memerlukan database, paket, build, atau instalasi tambahan.

## Menjalankan

Unggah seluruh isi folder ini ke `public_html` atau subfolder hosting PHP 8.2+. Buka `index.php` melalui HTTPS. Untuk pengembangan lokal: `php -S localhost:8080` dari folder proyek, lalu buka `http://localhost:8080`.

## Deploy ke Netlify

Versi statis siap terbit ada di `public/` dan ikut disimpan di Git. Tidak membutuhkan PHP, Node.js, NPM, atau build di Netlify. Versi PHP di root tetap dapat digunakan pada shared hosting.

1. Di Netlify, pilih impor proyek dari GitHub dan hubungkan repositori `makbar666/pelaporan-apps`.
2. Pilih branch `main`, kosongkan Build command, dan gunakan Publish directory `public`. Konfigurasi ini sudah tersedia dalam `netlify.toml`.
3. Deploy. Alternatif: unggah folder `public` melalui deploy manual Netlify.

Setelah mengubah `index.php`, `config.php`, atau aset, jalankan `php build-static.php` secara lokal, lalu commit perubahan sumber beserta folder `public`. Netlify menerbitkan hasil statis yang sudah dibuat tersebut.

Data dari localhost tidak otomatis berpindah ke domain Netlify. Ekspor JSON dari browser lama dan impor pada situs baru.

## Alur penggunaan

1. Isi laporan dan simpan. Draf dipulihkan otomatis saat halaman dibuka kembali.
2. Gunakan rekap untuk mencari, memfilter, melihat, mengedit, menghapus, atau memilih beberapa laporan.
3. Buka pratinjau pilihan. Isi nama organisasi dan logo opsional. Pilih Cetak atau Simpan PDF, lalu pilih tujuan PDF pada dialog browser. Gunakan A4, skala 100%, dan nonaktifkan header/footer bawaan browser.
4. Ekspor JSON secara berkala. Impor memvalidasi cadangan dan meminta konfirmasi sebelum mengganti semua laporan. Cadangan hanya mencakup laporan; tidak mencakup logo, pengaturan, dan draf.

## Data dan pemeliharaan

Semua data berada di Local Storage browser pada origin yang sama: `incident_reports_v1`, `report_settings_v1`, `report_draft_v1`. Data tidak dikirim ke server. Berpindah browser, perangkat, domain, atau protokol memerlukan ekspor/impor. Mode privat atau membersihkan data browser dapat menghapus arsip. Pengguna lain pada profil browser yang sama dapat mengakses data ini.

Definisi kolom dan kategori ada di `config.php`. Validasi JavaScript menggunakan definisi kolom tersebut. Format dokumen ada di `assets/js/report.js`; tata cetak di `assets/css/print.css`. Data lama yang gagal validasi tidak ditimpa otomatis. Pulihkan menggunakan cadangan yang valid. Logo maksimal 500 KB; impor maksimal 20 MB dan 10.000 laporan, tetap dibatasi kuota browser.

Pemilihan PDF dan pagination mengikuti mesin cetak browser; periksa pratinjau sebelum menyimpan. Salin teks menggunakan Clipboard API (HTTPS/localhost) dengan fallback browser. Tidak ada sinkronisasi, autentikasi, atau penyimpanan PDF di server.
