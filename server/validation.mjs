import fields from '../assets/report-fields.json' with { type: 'json' };

export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateReport(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new AppError(400, 'Data laporan tidak valid.');
  const data = {};
  for (const [key, [label, type, required]] of Object.entries(fields)) {
    const value = input[key];
    if (typeof value !== 'string' || value.length > (type === 'textarea' ? 20000 : 300) || (required && !value.trim())) {
      throw new AppError(400, label + ' tidak valid atau belum diisi.');
    }
    data[key] = value.trim();
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || !Number.isFinite(Date.parse(data.date)) || new Date(data.date).toISOString().slice(0, 10) !== data.date) throw new AppError(400, 'Tanggal kejadian tidak valid.');
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time)) throw new AppError(400, 'Waktu kejadian tidak valid.');
  return data;
}

export function validateImport(input) {
  if (input?.version !== 1 || !Array.isArray(input.reports) || input.reports.length > 1000) throw new AppError(400, 'Cadangan harus versi 1 dan maksimal 1.000 laporan per impor.');
  const reports = input.reports.map(validateReport);
  if (new Set(reports.map(r => r.number.toLowerCase())).size !== reports.length) throw new AppError(400, 'Nomor laporan duplikat dalam cadangan.');
  return reports;
}

export function validId(id) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new AppError(400, 'Identitas laporan tidak valid.');
  return id;
}

export async function readJson(request, max = 750000) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw new AppError(415, 'Gunakan format JSON.');
  if (Number(request.headers.get('content-length')) > max) throw new AppError(413, 'Data terlalu besar.');
  const reader = request.body?.getReader();
  if (!reader) throw new AppError(400, 'Data JSON kosong.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new AppError(413, 'Data terlalu besar.'); }
    chunks.push(value);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new AppError(400, 'JSON tidak valid.'); }
}
