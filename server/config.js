// Отдельная функция позволяет проверить настройки до подключения к базе.
// Ошибки намеренно не содержат пароли и строки подключения.
export function readServerConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  const port = Number(env.PORT || 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be an integer from 1 to 65535.');
  const proxyHops = Number(env.TRUST_PROXY_HOPS || 0);
  if (!Number.isInteger(proxyHops) || proxyHops < 0 || proxyHops > 5) throw new Error('TRUST_PROXY_HOPS must be an integer from 0 to 5.');

  // Render сам сообщает публичный HTTPS-адрес. Его не нужно угадывать
  // или заменять небезопасным разрешением любого Origin.
  const publicOrigin = env.APP_ORIGINS || (env.RENDER === 'true' ? env.RENDER_EXTERNAL_URL : '');
  if (production && (!env.DATABASE_URL || !publicOrigin)) throw new Error('Production requires DATABASE_URL and APP_ORIGINS (or Render external URL).');
  const origins = (publicOrigin || 'http://127.0.0.1:5173,http://localhost:5173,http://127.0.0.1:4173').split(',').map(value => value.trim());
  if (origins.some(origin => {
    try { const url = new URL(origin); return url.origin !== origin || !['http:', 'https:'].includes(url.protocol) || (production && url.protocol !== 'https:'); }
    catch { return true; }
  })) throw new Error('APP_ORIGINS must contain exact HTTP origins; HTTPS is required in production.');
  if (env.DATABASE_URL) {
    try {
      const url = new URL(env.DATABASE_URL);
      if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.pathname.slice(1)) throw new Error();
    } catch { throw new Error('DATABASE_URL must be a PostgreSQL connection URL with a database name.'); }
  }
  return {
    production, port, proxyHops, origins: [...new Set(origins)],
    host: env.HOST || (production ? '0.0.0.0' : '127.0.0.1'),
    databaseUrl: env.DATABASE_URL,
    databaseDirectory: env.DATABASE_DIR || './.data/lumo',
  };
}
