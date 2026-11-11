import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { readServerConfig } from '../config.js';
import { serveSite } from '../site.js';
import { createApp } from '../app.js';

test('local startup stays on loopback; production requires a database and exact HTTPS origin', () => {
  assert.equal(readServerConfig({}).host, '127.0.0.1');
  assert.equal(readServerConfig({}).port, 3001);
  const env = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:example@localhost/lumo', APP_ORIGINS: 'https://lumo.example' };
  assert.equal(readServerConfig(env).host, '0.0.0.0');
  assert.throws(() => readServerConfig({ ...env, DATABASE_URL: '' }), /Production requires/);
  assert.throws(() => readServerConfig({ ...env, APP_ORIGINS: '' }), /Production requires/);
  for (const origin of ['*', 'null', 'http://lumo.example', 'https://lumo.example/', 'https://lumo.example/path']) {
    assert.throws(() => readServerConfig({ ...env, APP_ORIGINS: origin }), /APP_ORIGINS/);
  }
});

test('Render URL supplies a validated origin; explicit custom domains take precedence', () => {
  const env = { NODE_ENV: 'production', DATABASE_URL: 'postgresql://user:example@localhost/lumo', RENDER: 'true', RENDER_EXTERNAL_URL: 'https://lumo-example.onrender.com', PORT: '10000', TRUST_PROXY_HOPS: '1' };
  const config = readServerConfig(env);
  assert.deepEqual(config.origins, ['https://lumo-example.onrender.com']);
  assert.equal(config.port, 10000);
  assert.equal(config.proxyHops, 1);
  assert.deepEqual(readServerConfig({ ...env, APP_ORIGINS: 'https://learn.example,https://lumo-example.onrender.com' }).origins, ['https://learn.example', 'https://lumo-example.onrender.com']);
  assert.throws(() => readServerConfig({ ...env, RENDER: '' }), /Production requires/);
});

test('invalid ports, proxy counts and database addresses fail without printing secrets', () => {
  for (const port of ['0', '65536', '-1', '3.5', 'abc']) assert.throws(() => readServerConfig({ PORT: port }), /PORT/);
  for (const hops of ['-1', '6', 'abc', '1.5']) assert.throws(() => readServerConfig({ TRUST_PROXY_HOPS: hops }), /TRUST_PROXY_HOPS/);
  for (const url of ['https://user:private-value@example.com/database', 'postgresql://user:private-value@example.com/']) {
    assert.throws(() => readServerConfig({ DATABASE_URL: url }), error => error.message.includes('DATABASE_URL') && !error.message.includes('private-value'));
  }
});

test('deployment serves assets, preserves sandbox headers and checks real database readiness', async t => {
  const folder = await mkdtemp(join(tmpdir(), 'lumo-deploy-'));
  let server;
  try {
    await mkdir(join(folder, 'assets'));
    await mkdir(join(folder, 'runtime', 'python'), { recursive: true });
    await writeFile(join(folder, 'index.html'), '<!doctype html><html lang="en"><title>Lumo</title><body>Learning</body></html>');
    await writeFile(join(folder, 'assets', 'app-example.js'), 'console.log("asset");');
    await writeFile(join(folder, 'runtime', 'python', 'pyodide.asm.wasm'), new Uint8Array([0, 97, 115, 109]));
    let available = true;
    const db = { query: async sql => { assert.equal(sql, 'SELECT 1'); if (!available) throw new Error('Private database address'); return { rows: [{ value: 1 }] }; } };
    const app = createApp({ db, origins: ['https://lumo.example'], secureCookies: true, trustProxy: 1 });
    serveSite(app, { directory: folder, required: true });
    server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.on('listening', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    await t.test('HTML refreshes while hashed assets are immutable', async () => {
      const html = await fetch(url);
      assert.equal(html.status, 200);
      assert.equal(html.headers.get('cache-control'), 'no-cache');
      assert.match(await html.text(), /Learning/);
      const asset = await fetch(`${url}/assets/app-example.js`);
      assert.equal(asset.status, 200);
      assert.match(asset.headers.get('cache-control'), /immutable/);
    });
    await t.test('Python files allow opaque sandbox origin, API never uses wildcard CORS', async () => {
      const runtime = await fetch(`${url}/runtime/python/pyodide.asm.wasm`, { headers: { Origin: 'null' } });
      assert.equal(runtime.status, 200);
      assert.equal(runtime.headers.get('access-control-allow-origin'), '*');
      assert.equal(runtime.headers.get('cross-origin-resource-policy'), 'cross-origin');
      assert.match(runtime.headers.get('content-type'), /application\/wasm/);
      const api = await fetch(`${url}/api/session`, { headers: { Origin: 'null' } });
      assert.equal(api.status, 403);
      assert.notEqual(api.headers.get('access-control-allow-origin'), '*');
    });
    await t.test('readiness reflects database connectivity without exposing details', async () => {
      assert.equal((await fetch(`${url}/api/ready`)).status, 200);
      available = false;
      const ready = await fetch(`${url}/api/ready`);
      assert.equal(ready.status, 503);
      assert.deepEqual(await ready.json(), { ok: false });
      assert.equal((await fetch(`${url}/api/health`)).status, 200);
    });
    await t.test('missing assets and internal paths do not turn into HTML success', async () => {
      for (const path of ['/assets/missing.js', '/.env', '/server/index.js', '/api/missing']) assert.equal((await fetch(url + path)).status, 404);
    });
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    // Удаляем только созданный этим тестом временный каталог.
    const target = resolve(folder);
    assert.equal(dirname(target), resolve(tmpdir()));
    assert.match(basename(target), /^lumo-deploy-/);
    await rm(target, { recursive: true, force: true });
  }
});
