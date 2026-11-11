import { loadEnvFile } from 'node:process';
import { existsSync } from 'node:fs';
import { openDatabase } from './database.js';
import { createApp } from './app.js';
import { readServerConfig } from './config.js';
import { serveSite } from './site.js';

if (existsSync('.env')) loadEnvFile('.env');
const { production, port, host, origins, proxyHops, databaseUrl, databaseDirectory } = readServerConfig();

// Проверяем наличие сборки до открытия базы, чтобы ошибка запуска не оставляла пул.
if (production && !existsSync('dist/index.html')) throw new Error('Frontend build is missing. Run pnpm build before starting production.');
const db = await openDatabase({ url: databaseUrl, directory: databaseDirectory });
const app = createApp({ db, origins, secureCookies: production, trustProxy: proxyHops || false });
serveSite(app, { required: production });
const server = app.listen(port, host, () => console.log(`Lumo API: http://${host}:${port} (${databaseUrl ? 'PostgreSQL' : 'local PGlite'})`));
const cleanup = setInterval(() => db.query('DELETE FROM lumo_sessions WHERE expires_at <= now()').catch(() => console.error('Session cleanup failed.')), 60 * 60 * 1000);
cleanup.unref();
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  clearInterval(cleanup);
  server.close(async () => { await db.close(); process.exit(0); });
}
process.on('SIGINT', close);
process.on('SIGTERM', close);
