import test from 'node:test';
import assert from 'node:assert/strict';
import { createHandler } from '../server/api.mjs';
import { AppError, validateReport, validateImport } from '../server/validation.mjs';
import { authFor } from '../server/auth.mjs';

const id = '31ce4ec4-f16d-4f8c-b75d-451746b32726';
const report = { number: 'LK-1', title: 'Kejadian', date: '2026-11-19', time: '12:00', location: 'Kantor', category: 'Operasional', reporter: 'Budi', division: 'Tim', description: '<script>alert(1)</script>', chronology: 'Urutan', impact: '', actions: '', recommendations: '', notes: '' };
const request = (path, method = 'GET', data, extra = {}) => new Request('https://app.example/api/' + path, {
  method, headers: { origin: 'https://app.example', 'content-type': 'application/json', 'x-actor-id': 'alice', ...extra },
  ...(data === undefined ? {} : { body: JSON.stringify(data) })
});
function setup(overrides = {}) {
  const calls = [];
  const db = {
    member: async userId => ({ id: userId, name: 'Alice' }),
    list: async (...args) => { calls.push(args); return { reports: [], nextOffset: null }; },
    create: async (userId, data) => { calls.push([userId, data]); return { id, ownerId: userId, ...data }; },
    update: async (...args) => { calls.push(args); throw new AppError(409, 'Bukan pemilik atau versi berubah.'); },
    remove: async (...args) => { calls.push(args); throw new AppError(409, 'Bukan pemilik atau versi berubah.'); },
    replaceOwn: async (...args) => { calls.push(args); }, ...overrides.db
  };
  const auth = { userId: async () => 'alice', login: async () => 'alice', logout: async () => {}, ...overrides.auth };
  return { calls, handler: createHandler({ env: {}, makeAuth: () => auth, makeDatabase: () => db }) };
}

test('unconfigured backend fails closed without disclosing configuration', async () => {
  const res = await createHandler({ env: {} })(request('session'));
  assert.equal(res.status, 503); assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.doesNotMatch(await res.text(), /postgres|password|secret/i);
});
test('unauthenticated and nonmember users cannot list reports', async () => {
  let s = setup({ auth: { userId: async () => { throw new AppError(401, 'Login diperlukan'); } } });
  assert.equal((await s.handler(request('reports'))).status, 401); assert.equal(s.calls.length, 0);
  s = setup({ db: { member: async () => { throw new AppError(403, 'Tidak diizinkan'); } } });
  assert.equal((await s.handler(request('reports?scope=all'))).status, 403); assert.equal(s.calls.length, 0);
});
test('mine and all are explicit scopes bound to the server user', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request('reports'))).status, 200);
  assert.equal((await handler(request('reports?scope=all&offset=100'))).status, 200);
  assert.deepEqual(calls, [['alice', 'mine', 0], ['alice', 'all', 100]]);
  assert.equal((await handler(request('reports?scope=evil'))).status, 400);
});
test('client cannot forge owner ID or inject unrecognized fields', async () => {
  const { handler, calls } = setup();
  const res = await handler(request('reports', 'POST', { ...report, ownerId: 'bob', admin: true }));
  assert.equal(res.status, 201); assert.equal(calls[0][0], 'alice');
  assert.equal(calls[0][1].ownerId, undefined); assert.equal(calls[0][1].admin, undefined);
});
test('edit/delete route enforces owner identity and version through repository', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request('reports/' + id, 'PUT', { ...report, version: 2, ownerId: 'bob' }))).status, 409);
  assert.deepEqual(calls[0].slice(0, 3), ['alice', id, 2]);
  assert.equal((await handler(request('reports/' + id, 'DELETE', { version: 2 }))).status, 409);
  assert.deepEqual(calls[1], ['alice', id, 2]);
});
test('CSRF, missing actor and stale account mutations are denied', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request('reports', 'POST', report, { origin: 'https://evil.example' }))).status, 403);
  assert.equal((await handler(request('reports', 'POST', report, { 'x-actor-id': 'bob' }))).status, 409);
  assert.equal(calls.length, 0);
});
test('imports strip ownership and only target current member', async () => {
  const { handler, calls } = setup();
  assert.equal((await handler(request('reports/import', 'POST', { version: 1, reports: [{ ...report, ownerId: 'bob', id }] }))).status, 200);
  assert.equal(calls[0][0], 'alice'); assert.equal(calls[0][1][0].ownerId, undefined);
  assert.equal(calls[0][1][0].id, undefined);
});
test('validation rejects impossible dates, duplicate imports and unsafe input types', () => {
  assert.throws(() => validateReport({ ...report, date: '2026-02-30' }), AppError);
  assert.throws(() => validateReport({ ...report, description: {} }), AppError);
  assert.throws(() => validateImport({ version: 1, reports: [report, report] }), AppError);
  assert.equal(validateReport(report).description, report.description);
});
test('every HH:mm value in a 24-hour day is valid, including 23:12', () => {
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute++) {
      const time = String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0');
      assert.equal(validateReport({ ...report, time }).time, time);
    }
  }
  for (const time of ['24:00', '23:60', '230:12', '200:00', '2:12', '23:1', '23:12:00', '-1:00']) {
    assert.throws(() => validateReport({ ...report, time }), AppError, time);
  }
});
test('POST reports and import accept the reported 23:12 time', async () => {
  const { handler, calls } = setup();
  const input = { ...report, time: '23:12' };
  assert.equal((await handler(request('reports', 'POST', input))).status, 201);
  assert.equal(calls[0][1].time, '23:12');
  assert.equal((await handler(request('reports/import', 'POST', { version: 1, reports: [input] }))).status, 200);
  assert.equal(calls[1][1][0].time, '23:12');
});
test('database error details never escape', async () => {
  const { handler } = setup({ db: { list: async () => { throw Error('postgres://password SQL PRIVATE'); } } });
  const res = await handler(request('reports')); assert.equal(res.status, 503); assert.doesNotMatch(await res.text(), /PRIVATE|password|postgres/);
});
test('Neon SDK verifies the live session with cookie cache disabled', async () => {
  const original = globalThis.fetch; let called = false;
  globalThis.fetch = async (url, init) => {
    called = true; assert.ok(String(url).includes('/get-session?disableCookieCache=true'));
    assert.equal(new Headers(init.headers).get('cookie'), '__Secure-neon-auth.session_token=example');
    return Response.json({ user: { id: 'alice' }, session: { id: 'session' } });
  };
  try {
    const auth = authFor(new Request('https://app.example/api/session', { headers: { cookie: '__Secure-neon-auth.session_token=example' } }), new Headers(), { DATABASE_URL: 'unused', NEON_AUTH_BASE_URL: 'https://auth.example/neondb/auth', NEON_AUTH_COOKIE_SECRET: 'x'.repeat(40) });
    assert.equal(await auth.userId(), 'alice'); assert.ok(called);
  } finally { globalThis.fetch = original; }
});
