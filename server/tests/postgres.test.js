import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { openDatabase } from '../database.js';
import { createApp } from '../app.js';
import { emptyProgress } from '../../shared/progress.js';

// В CI используется отдельный PostgreSQL service. Локальная база пользователя
// здесь не открывается. На обычном ПК без TEST_DATABASE_URL тест пропускается.
test('external PostgreSQL: migrations, transactions, accounts and revision locking', { skip: !process.env.TEST_DATABASE_URL }, async t => {
  const schema = `lumo_ci_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  let db, server;
  try {
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const scoped = new URL(process.env.TEST_DATABASE_URL);
    scoped.searchParams.set('options', `-c search_path=${schema}`);
    db = await openDatabase({ url: scoped.href });
    await t.test('schema initializes and failed transactions roll back', async () => {
      await assert.rejects(db.transaction(async connection => {
        await connection.query("INSERT INTO lumo_users(id, username, password_hash, recovery_hash) VALUES ('rollback', 'rollback', 'test', 'test')");
        throw new Error('Rollback requested');
      }), /Rollback requested/);
      assert.equal((await db.query("SELECT id FROM lumo_users WHERE id = 'rollback'")).rows.length, 0);
    });
    const origin = 'https://lumo.example';
    server = createApp({ db, origins: [origin], secureCookies: true, trustProxy: 1 }).listen(0, '127.0.0.1');
    await new Promise(resolve => server.on('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const username = `ci_${randomUUID().replaceAll('-', '').slice(0, 20)}`;
    const password = 'Only for isolated PostgreSQL CI tests';
    const registered = await fetch(`${base}/api/auth/register`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-Lumo-Request': '1', 'X-Forwarded-Proto': 'https' }, body: JSON.stringify({ username, password }) });
    assert.equal(registered.status, 201);
    assert.match(registered.headers.get('set-cookie'), /__Host-lumo_session=.*Secure/);
    const cookie = registered.headers.get('set-cookie').split(';')[0];
    const user = (await registered.json()).user;
    const headers = { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json', 'X-Lumo-Request': '1', 'X-Lumo-Account': user.id, 'X-Forwarded-Proto': 'https' };
    await t.test('real pg driver preserves JSON progress and locks concurrent revisions', async () => {
      const first = emptyProgress(), second = emptyProgress();
      first.drafts['python-0'] = 'print("first")'; second.drafts['python-0'] = 'print("second")';
      const responses = await Promise.all([first, second].map(progress => fetch(`${base}/api/progress`, { method: 'PUT', headers, body: JSON.stringify({ revision: 0, progress }) })));
      assert.deepEqual(responses.map(response => response.status).sort(), [200, 409]);
      const snapshot = await (await fetch(`${base}/api/progress`, { headers })).json();
      assert.equal(snapshot.revision, 1);
      assert.ok(['print("first")', 'print("second")'].includes(snapshot.progress.drafts['python-0']));
    });
    await t.test('session survives opening a new database pool', async () => {
      await new Promise(resolve => server.close(resolve));
      server = null;
      await db.close();
      db = await openDatabase({ url: scoped.href });
      server = createApp({ db, origins: [origin], secureCookies: true, trustProxy: 1 }).listen(0, '127.0.0.1');
      await new Promise(resolve => server.on('listening', resolve));
      const restored = await (await fetch(`http://127.0.0.1:${server.address().port}/api/session`, { headers })).json();
      assert.equal(restored.user.id, user.id);
      assert.equal(restored.snapshot.revision, 1);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    if (db) await db.close();
    // Имя схемы получено только из UUID теста, не из пользовательского ввода.
    await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await admin.end();
  }
});
