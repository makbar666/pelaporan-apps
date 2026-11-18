<?php
declare(strict_types=1);
// Jalankan lokal sebelum commit; Netlify hanya menerbitkan folder public.
if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit;
}
$target = __DIR__ . '/public';
if (!is_dir($target) && !mkdir($target, 0755, true)) {
    throw new RuntimeException('Gagal membuat folder public.');
}
ob_start();
require __DIR__ . '/index.php';
$html = ob_get_clean();
if (file_put_contents($target . '/index.html', $html) === false) {
    throw new RuntimeException('Gagal menulis index.html.');
}
$assets = __DIR__ . '/assets';
$files = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($assets, FilesystemIterator::SKIP_DOTS));
foreach ($files as $file) {
    if (!$file->isFile()) continue;
    $relative = substr($file->getPathname(), strlen($assets) + 1);
    $destination = $target . '/assets/' . $relative;
    if (!is_dir(dirname($destination))) mkdir(dirname($destination), 0755, true);
    if (!copy($file->getPathname(), $destination)) {
        throw new RuntimeException('Gagal menyalin aset.');
    }
}
echo "Versi statis siap di public/.\n";
