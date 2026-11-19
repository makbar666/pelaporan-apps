<?php
declare(strict_types=1);
$fields = json_decode(file_get_contents(__DIR__.'/assets/report-fields.json'), true, 512, JSON_THROW_ON_ERROR);
$categories = ['Keselamatan kerja','Keamanan','Operasional','Lingkungan','Lainnya'];
function e(string $value): string { return htmlspecialchars($value, ENT_QUOTES, 'UTF-8'); }
