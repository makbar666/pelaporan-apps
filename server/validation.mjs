import '../assets/js/model.js';
import fields from '../assets/report-fields.json' with { type: 'json' };

export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

export function validateReport(input) {
  try { return globalThis.IncidentModel.validate(input, fields); }
  catch (error) { throw new AppError(400, error.message); }
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

export async function readJson(request, max = 1600000) {
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
