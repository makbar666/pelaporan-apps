import { AppError, readJson, validId, validateReport, validateImport } from './validation.mjs';
import { authFor } from './auth.mjs';
import { database } from './database.mjs';

export function createHandler({ env = process.env, makeAuth = authFor, makeDatabase = database } = {}) {
  return async request => {
    const headers = new Headers({ 'Cache-Control': 'no-store', 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });
    try {
      const url = new URL(request.url);
      if (!['GET', 'POST', 'PUT', 'DELETE'].includes(request.method)) throw new AppError(405, 'Metode tidak didukung.');
      if (request.method !== 'GET' && request.headers.get('origin') !== url.origin) throw new AppError(403, 'Asal permintaan tidak diizinkan.');
      const path = url.pathname.replace(/^\/api\/?/, '').replace(/\/$/, '');
      const auth = makeAuth(request, headers, env);
      if (path === 'logout' && request.method === 'POST') { await auth.logout(); return reply({ ok: true }); }
      const db = makeDatabase(env.DATABASE_URL);
      if (path === 'login' && request.method === 'POST') {
        const input = await readJson(request, 4096);
        if (typeof input?.email !== 'string' || input.email.length > 254 || !input.email.includes('@') || typeof input.password !== 'string' || !input.password || input.password.length > 128) throw new AppError(400, 'Email dan password wajib diisi. Password maksimal 128 karakter.');
        const id = await auth.login(input.email.trim(), input.password);
        try { return reply({ user: await db.member(id) }); }
        catch (error) { await auth.logout(); throw error; }
      }
      const id = await auth.userId();
      const user = await db.member(id);
      if (request.method !== 'GET' && request.headers.get('x-actor-id') !== id) throw new AppError(409, 'Akun aktif berubah. Masuk kembali sebelum menyimpan.');
      if (path === 'session' && request.method === 'GET') return reply({ user });
      if (path === 'reports' && request.method === 'GET') {
        const scope = url.searchParams.get('scope') || 'mine';
        const offset = Number(url.searchParams.get('offset') || 0);
        if (!['mine', 'all'].includes(scope) || !Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new AppError(400, 'Filter laporan tidak valid.');
        return reply(await db.list(id, scope, offset));
      }
      if (path === 'reports' && request.method === 'POST') return reply({ report: await db.create(id, validateReport(await readJson(request))) }, 201);
      if (path === 'reports/import' && request.method === 'POST') {
        const data = validateImport(await readJson(request, 4000000));
        await db.replaceOwn(id, data);
        return reply({ ok: true, count: data.length });
      }
      const match = /^reports\/([^/]+)$/.exec(path);
      if (match && request.method === 'GET') return reply({ report: await db.get(validId(match[1])) });
      if (match && ['PUT', 'DELETE'].includes(request.method)) {
        const reportId = validId(match[1]);
        const body = await readJson(request);
        if (!Number.isSafeInteger(body?.version) || body.version < 1) throw new AppError(400, 'Versi laporan tidak valid.');
        if (request.method === 'PUT') return reply({ report: await db.update(id, reportId, body.version, validateReport(body)) });
        await db.remove(id, reportId, body.version);
        return reply({ ok: true });
      }
      throw new AppError(404, 'Endpoint tidak ditemukan.');
    } catch (error) {
      if (error instanceof AppError) return reply({ error: error.message }, error.status);
      if (error?.code === '23505') return reply({ error: 'Nomor laporan sudah digunakan. Impor atau penyimpanan dibatalkan.' }, 409);
      // Jangan kirim SQL, data laporan, credential, atau pesan internal ke klien/log.
      return reply({ error: 'Layanan data sedang tidak tersedia. Data formulir tetap dipertahankan; coba lagi.' }, 503);
    }
  };
}
