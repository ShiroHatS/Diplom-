import { mkdir, readFile } from 'node:fs/promises';

export async function openDatabase({ url, directory = './.data/lumo' } = {}) {
  let database;
  if (url) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, max: 5, connectionTimeoutMillis: 10000, statement_timeout: 10000 });
    // Оборвавшееся простаивающее соединение удаляется из пула; следующий
    // запрос создаст новое. Не выводим данные подключения в журнал.
    pool.on('error', () => console.error('Idle PostgreSQL connection failed.'));
    database = {
      query: (sql, params) => pool.query(sql, params),
      exec: sql => pool.query(sql),
      close: () => pool.end(),
      async transaction(action) {
        const client = await pool.connect();
        try { await client.query('BEGIN'); const result = await action(client); await client.query('COMMIT'); return result; }
        catch (error) { await client.query('ROLLBACK'); throw error; }
        finally { client.release(); }
      },
    };
  } else {
    const { PGlite } = await import('@electric-sql/pglite');
    if (directory !== 'memory://') await mkdir(directory, { recursive: true });
    database = new PGlite(directory);
    await database.waitReady;
  }
  await database.exec(await readFile(new URL('./schema.sql', import.meta.url), 'utf8'));
  return database;
}
