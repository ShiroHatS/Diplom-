import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { openDatabase } from '../database.js';
import { createApp } from '../app.js';
import { emptyProgress } from '../../shared/progress.js';

let db, server, base;
const origin = 'http://127.0.0.1:4173';
const password = 'Test only long password 2026';
const name = () => `test_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
before(async () => {
  db = await openDatabase({ directory: 'memory://' });
  server = createApp({ db, origins: [origin], authLimit: 1000 }).listen(0, '127.0.0.1');
  await new Promise(resolve => server.on('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise(resolve => server.close(resolve)); await db.close(); });

async function request(method, path, { data, session, headers = {}, endpoint = base } = {}) {
  const response = await fetch(`${endpoint}/api${path}`, { method, headers: {
    Origin: origin, 'X-Lumo-Request': '1', ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}),
    ...(session ? { Cookie: session.cookie, 'X-Lumo-Account': session.body.user.id } : {}), ...headers,
  }, ...(data !== undefined ? { body: JSON.stringify(data) } : {}) });
  return { status: response.status, body: await response.json(), headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
const register = username => request('POST', '/auth/register', { data: { username: username || name(), password } });

test('registration stores hashes, session restores, and logout revokes access', async () => {
  const account = await register();
  assert.equal(account.status, 201);
  assert.match(account.body.recoveryCode, /^lumo-[\w-]{43}$/);
  assert.match(account.headers.get('set-cookie'), /HttpOnly/);
  assert.match(account.headers.get('set-cookie'), /SameSite=Lax/);
  const stored = (await db.query('SELECT password_hash, recovery_hash FROM lumo_users WHERE id = $1', [account.body.user.id])).rows[0];
  assert.match(stored.password_hash, /^scrypt\$131072\$8\$1\$/);
  assert.notEqual(stored.recovery_hash, account.body.recoveryCode);
  const session = await request('GET', '/session', { session: account });
  assert.deepEqual(session.body.user, account.body.user);
  assert.equal((await request('POST', '/auth/logout', { session: account })).status, 200);
  assert.equal((await request('GET', '/progress', { session: account })).status, 401);
});

test('invalid credentials, duplicate names and invalid passwords get clear bounded errors', async () => {
  const username = name();
  await register(username);
  assert.equal((await register(username.toUpperCase())).status, 409);
  assert.equal((await request('POST', '/auth/login', { data: { username, password: 'wrong' } })).body.error, 'INVALID_CREDENTIALS');
  assert.equal((await request('POST', '/auth/login', { data: { username: name(), password } })).body.error, 'INVALID_CREDENTIALS');
  assert.equal((await request('POST', '/auth/register', { data: { username: name(), password: 'short' } })).body.error, 'PASSWORD_LENGTH');
  assert.equal((await register("x' OR 1=1--")).body.error, 'USERNAME_FORMAT');
  assert.equal((await request('POST', '/auth/login', { data: { username: username.toUpperCase(), password } })).status, 200);
});

test('origin and custom-header checks protect login and progress mutations', async () => {
  const account = await register();
  const data = { revision: 0, progress: emptyProgress() };
  for (const headers of [{ Origin: 'https://untrusted.example' }, { Origin: 'null' }, { Origin: '' }, { 'X-Lumo-Request': '' }]) {
    assert.equal((await request('PUT', '/progress', { session: account, data, headers })).status, 403);
  }
  assert.equal((await request('POST', '/auth/login', { data: { username: account.body.user.username, password }, headers: { Origin: 'https://untrusted.example' } })).status, 403);
});

test('accounts are isolated, including a different account signing in in another tab', async () => {
  const first = await register(), second = await register();
  const progress = emptyProgress(); progress.drafts['python-0'] = 'print("private")';
  assert.equal((await request('PUT', '/progress', { session: first, data: { revision: 0, progress } })).status, 200);
  const other = await request('GET', `/progress?userId=${first.body.user.id}`, { session: second });
  assert.deepEqual(other.body.progress.drafts, {});
  assert.equal((await request('PUT', '/progress', { session: second, headers: { 'X-Lumo-Account': first.body.user.id }, data: { revision: 0, progress } })).body.error, 'SESSION_CHANGED');
  assert.equal((await request('GET', '/progress')).status, 401);
  assert.equal((await request('POST', '/auth/logout', { session: second, headers: { 'X-Lumo-Account': first.body.user.id } })).status, 409);
  assert.equal((await request('GET', '/progress', { session: second })).status, 200);
});

test('simultaneous updates use revisions and never overwrite silently', async () => {
  const account = await register();
  const first = emptyProgress(), second = emptyProgress();
  first.drafts['python-0'] = 'print("one")'; second.drafts['python-0'] = 'print("two")';
  const results = await Promise.all([first, second].map(progress => request('PUT', '/progress', { session: account, data: { revision: 0, progress } })));
  assert.deepEqual(results.map(result => result.status).sort(), [200, 409]);
  const stale = results.find(result => result.status === 409);
  assert.equal(stale.body.error, 'VERSION_CONFLICT');
  assert.equal(stale.body.revision, 1);
  assert.deepEqual(stale.body.progress, results.find(result => result.status === 200).body.progress);
});

test('progress validation and monotonic completion protect stored learning data', async () => {
  const account = await register();
  const progress = emptyProgress(); progress.completed = ['python-0'];
  await request('PUT', '/progress', { session: account, data: { revision: 0, progress } });
  const next = await request('PUT', '/progress', { session: account, data: { revision: 1, progress: emptyProgress() } });
  assert.deepEqual(next.body.progress.completed, ['python-0']);
  for (const invalid of [{ ...progress, drafts: { 'python-0': 'x'.repeat(2001) } }, { ...progress, drafts: { 'unknown-99': 'x' } }, { ...progress, course: 'unknown' }]) {
    assert.equal((await request('PUT', '/progress', { session: account, data: { revision: 2, progress: invalid } })).status, 400);
  }
});

test('recovery codes are one-use and revoke old sessions', async () => {
  const account = await register();
  const other = await request('POST', '/auth/login', { data: { username: account.body.user.username, password } });
  const recovered = await request('POST', '/auth/recover', { data: { username: account.body.user.username, password: 'A different long password 2026', recoveryCode: account.body.recoveryCode } });
  assert.equal(recovered.status, 200);
  assert.notEqual(recovered.body.recoveryCode, account.body.recoveryCode);
  assert.equal((await request('GET', '/progress', { session: account })).status, 401);
  assert.equal((await request('GET', '/progress', { session: other })).status, 401);
  assert.equal((await request('GET', '/progress', { session: recovered })).status, 200);
  assert.equal((await request('POST', '/auth/recover', { data: { username: account.body.user.username, password, recoveryCode: account.body.recoveryCode } })).status, 401);
  assert.equal((await request('POST', '/auth/login', { data: { username: account.body.user.username, password } })).status, 401);
});

test('production cookies are secure and authentication is rate limited', async () => {
  const limited = createApp({ db, origins: [origin], secureCookies: true, authLimit: 2 }).listen(0, '127.0.0.1');
  await new Promise(resolve => limited.on('listening', resolve));
  const endpoint = `http://127.0.0.1:${limited.address().port}`;
  try {
    const account = await request('POST', '/auth/register', { endpoint, data: { username: name(), password } });
    assert.match(account.headers.get('set-cookie'), /^__Host-lumo_session=/);
    assert.match(account.headers.get('set-cookie'), /; Secure;/);
    await request('POST', '/auth/login', { endpoint, data: { username: name(), password } });
    assert.equal((await request('POST', '/auth/login', { endpoint, data: { username: name(), password } })).status, 429);
  } finally { await new Promise(resolve => limited.close(resolve)); }
});

test('local PostgreSQL data survives closing and reopening the database', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'lumo-api-test-'));
  try {
    const first = await openDatabase({ directory });
    await first.query('INSERT INTO lumo_users(id, username, password_hash, recovery_hash) VALUES ($1, $2, $3, $4)', ['persistent', name(), 'test-hash', 'test-hash']);
    await first.close();
    const second = await openDatabase({ directory });
    assert.equal((await second.query('SELECT id FROM lumo_users WHERE id=$1', ['persistent'])).rows[0].id, 'persistent');
    await second.close();
  } finally {
    assert.equal(dirname(resolve(directory)), resolve(tmpdir()));
    assert.ok(basename(directory).startsWith('lumo-api-test-'));
    await rm(directory, { recursive: true, force: true });
  }
});
