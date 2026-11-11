import express from 'express';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

// Тот же Express отдаёт сборку и API: браузеру достаточно одного HTTPS-адреса.
export function serveSite(app, { directory = 'dist', required = false } = {}) {
  const dist = resolve(directory);
  const index = resolve(dist, 'index.html');
  if (required && !existsSync(index)) throw new Error('Frontend build is missing. Run pnpm build before starting production.');
  app.use('/runtime/python', (_req, res, next) => {
    // Python загружается из изолированной рамки без origin. Открываем CORS
    // только для публичных файлов интерпретатора, а не для API аккаунтов.
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Cross-Origin-Resource-Policy', 'cross-origin');
    next();
  });
  app.use(express.static(dist, {
    setHeaders(res, file) {
      // Vite меняет имя JS/CSS при изменении содержимого. HTML перепроверяется,
      // поэтому посетитель получает ссылки на актуальные файлы после публикации.
      res.set('Cache-Control', /[/\\]assets[/\\]/.test(file) ? 'public, max-age=31536000, immutable' : 'no-cache');
    },
  }));
  app.use((req, res) => {
    if (req.method === 'GET' && req.accepts('html') && !req.path.includes('.') && existsSync(index)) return res.sendFile(index, { headers: { 'Cache-Control': 'no-cache' } });
    res.status(404).send('Not found');
  });
}
