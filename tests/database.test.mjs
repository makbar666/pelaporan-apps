import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { database } from '../server/database.mjs';

test('Postgres: migration, ownership, versions, shared views, import isolation and rollback', async () => {
  const pg = new PGlite();
  try {
    const schema = await readFile(new URL('../database/schema.sql', import.meta.url), 'utf8');
    await pg.exec(schema); await pg.exec(schema); // migration dapat dijalankan ulang
    await pg.query("INSERT INTO incident_members (user_id, display_name) VALUES ('alice','Ayu'),('bob','Budi'),('disabled','Nonaktif')");
    await pg.query("UPDATE incident_members SET enabled=false WHERE user_id='disabled'");
    const sql = {
      query(text, params) {
        return { text, params, then(resolve, reject) { return pg.query(text, params).then(result => result.rows).then(resolve, reject); } };
      },
      transaction(queries) { return pg.transaction(async tx => {
        const results = [];
        for (const q of queries) results.push((await tx.query(q.text, q.params)).rows);
        return results;
      }); }
    };
    const db = database(null, sql);
    assert.deepEqual(await db.member('alice'), { id: 'alice', name: 'Ayu' });
    await assert.rejects(db.member('disabled'), error => error.status === 403);
    const a = await db.create('alice', { number: 'A-1', description: 'Laporan Ayu' });
    const b = await db.create('bob', { number: 'B-1', description: 'Laporan Budi' });
    assert.equal((await db.list('alice', 'mine', 0)).reports.length, 1);
    assert.equal((await db.list('alice', 'all', 0)).reports.length, 2);
    await assert.rejects(db.update('alice', b.id, 1, { number: 'HACK' }), e => e.status === 409);
    await assert.rejects(db.remove('alice', b.id, 1), e => e.status === 409);
    const updated = await db.update('alice', a.id, 1, { number: 'A-2' });
    assert.equal(updated.version, 2); assert.equal(updated.ownerId, 'alice');
    await assert.rejects(db.update('alice', a.id, 1, { number: 'STALE' }), e => e.status === 409);
    await assert.rejects(db.replaceOwn('alice', [{ number: 'b-1' }]), e => e.code === '23505');
    assert.equal((await db.list('alice', 'mine', 0)).reports[0].number, 'A-2');
    await db.replaceOwn('alice', [{ number: 'NEW-A' }]);
    let all = (await db.list('alice', 'all', 0)).reports;
    assert.equal(all.length, 2); assert.ok(all.some(r => r.id === b.id && r.number === 'B-1'));
    await db.replaceOwn('alice', []);
    all = (await db.list('bob', 'all', 0)).reports; assert.equal(all.length, 1); assert.equal(all[0].id, b.id);
    await db.remove('bob', b.id, 1); assert.equal((await db.list('bob', 'all', 0)).reports.length, 0);
  } finally { await pg.close(); }
});
