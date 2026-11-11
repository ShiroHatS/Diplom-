// Изолированный сервер браузерных тестов: реальные локальные аккаунты не затрагиваются.
import { openDatabase } from './database.js';
import { createApp } from './app.js';
import { serveSite } from './site.js';
const db = await openDatabase({ directory: 'memory://' });
const app = createApp({ db, origins: ['http://127.0.0.1:4173'], authLimit: 1000, apiLimit: 10000 });
const port = process.env.LUMO_TEST_SERVE_SITE === '1' ? 4173 : 3002;
if (process.env.LUMO_TEST_SERVE_SITE === '1') serveSite(app, { required: true });
const server = app.listen(port, '127.0.0.1', () => console.log(`Test API: http://127.0.0.1:${port}`));
const stop = () => server.close(async () => { await db.close(); process.exit(0); });
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
