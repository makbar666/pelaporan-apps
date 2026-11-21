import { neon } from '@neondatabase/serverless';
import { AppError } from './validation.mjs';

export function database(connectionString, sql = neon(connectionString)) {
  const columns = 'r.id, r.owner_id, r.data, r.version, m.display_name AS owner_name';
  const map = row => ({ ...row.data, id: row.id, ownerId: row.owner_id, ownerName: row.owner_name, version: row.version, photoCount: row.photo_count ?? row.data.photos?.length ?? 0 });
  return {
    async member(id) {
      const [row] = await sql.query('SELECT user_id, display_name FROM incident_members WHERE user_id = $1 AND enabled = true', [id]);
      if (!row) throw new AppError(403, 'Akun belum diberi akses oleh pengelola.');
      return { id: row.user_id, name: row.display_name };
    },
    async list(userId, scope, offset) {
      const rows = await sql.query(`SELECT r.id, r.owner_id, r.data - 'photos' AS data, r.version, m.display_name AS owner_name, jsonb_array_length(COALESCE(r.data->'photos','[]'::jsonb)) AS photo_count FROM incident_reports r JOIN incident_members m ON m.user_id = r.owner_id WHERE ($1::boolean OR r.owner_id = $2) ORDER BY r.created_at DESC, r.id LIMIT 101 OFFSET $3`, [scope === 'all', userId, offset]);
      return { reports: rows.slice(0, 100).map(map), nextOffset: rows.length > 100 ? offset + 100 : null };
    },
    async get(id) {
      const [row] = await sql.query(`SELECT ${columns} FROM incident_reports r JOIN incident_members m ON m.user_id = r.owner_id WHERE r.id = $1`, [id]);
      if (!row) throw new AppError(404, 'Laporan tidak ditemukan.');
      return map(row);
    },
    async create(userId, data) {
      const [row] = await sql.query('INSERT INTO incident_reports (id, owner_id, report_number, data) VALUES (gen_random_uuid(), $1, $2, $3::jsonb) RETURNING id, owner_id, data, version', [userId, data.number, JSON.stringify(data)]);
      return map(row);
    },
    async update(userId, id, version, data) {
      const [row] = await sql.query('UPDATE incident_reports SET report_number = $1, data = $2::jsonb, updated_at = now(), version = version + 1 WHERE id = $3 AND owner_id = $4 AND version = $5 RETURNING id, owner_id, data, version', [data.number, JSON.stringify(data), id, userId, version]);
      if (!row) throw new AppError(409, 'Laporan bukan milik Anda, sudah dihapus, atau telah berubah. Muat ulang data sebelum mengedit.');
      return map(row);
    },
    async remove(userId, id, version) {
      const rows = await sql.query('DELETE FROM incident_reports WHERE id = $1 AND owner_id = $2 AND version = $3 RETURNING id', [id, userId, version]);
      if (!rows.length) throw new AppError(409, 'Laporan bukan milik Anda, sudah dihapus, atau telah berubah. Muat ulang data.');
    },
    async replaceOwn(userId, reports) {
      // Transaksi atomik: konflik nomor dengan milik anggota lain membatalkan penghapusan.
      await sql.transaction([
        sql.query('SELECT pg_advisory_xact_lock(hashtext($1))', [userId]),
        sql.query('DELETE FROM incident_reports WHERE owner_id = $1', [userId]),
        sql.query(`INSERT INTO incident_reports (id, owner_id, report_number, data)
          SELECT gen_random_uuid(), $1, item->>'number', item
          FROM jsonb_array_elements($2::jsonb) AS item`, [userId, JSON.stringify(reports)])
      ]);
    }
  };
}
