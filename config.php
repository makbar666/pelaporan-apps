<?php
declare(strict_types=1);
$fields = [
 'number'=>['Nomor laporan','text',true], 'title'=>['Judul laporan','text',true],
 'date'=>['Tanggal kejadian','date',true], 'time'=>['Waktu kejadian','time',true],
 'location'=>['Lokasi kejadian','text',true], 'category'=>['Kategori kejadian','select',true],
 'reporter'=>['Nama pelapor','text',true], 'division'=>['Jabatan / divisi','text',true],
 'description'=>['Deskripsi kejadian','textarea',true], 'chronology'=>['Kronologi kejadian','textarea',true],
 'impact'=>['Dampak kejadian','textarea',false], 'actions'=>['Tindakan yang telah dilakukan','textarea',false],
 'recommendations'=>['Rekomendasi tindak lanjut','textarea',false], 'notes'=>['Catatan tambahan','textarea',false]
];
$categories = ['Keselamatan kerja','Keamanan','Operasional','Lingkungan','Lainnya'];
function e(string $value): string { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
