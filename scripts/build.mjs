import { cp, mkdir, readFile } from 'node:fs/promises';

const html = await readFile('public/index.html', 'utf8');
const fields = JSON.parse(await readFile('assets/report-fields.json', 'utf8'));
const match = html.match(/<script id="field-schema" type="application\/json">(.*?)<\/script>/s);
if (!match || JSON.stringify(JSON.parse(match[1])) !== JSON.stringify(fields)) {
  throw new Error('Jalankan php build-static.php lalu commit public/index.html sebelum deploy.');
}
await mkdir('public/assets', { recursive: true });
await cp('assets', 'public/assets', { recursive: true });
console.log('Aset statis siap. Backend dijalankan oleh Netlify Functions.');
