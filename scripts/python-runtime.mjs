import { createRequire } from 'node:module';
import { copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const source = dirname(require.resolve('pyodide/package.json'));
const files = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];

// Vite копирует эти файлы в dist. Во время работы сайта CDN не требуется.
export function pythonRuntimePlugin() {
  const destination = join(process.cwd(), 'public/runtime/python');
  mkdirSync(destination, { recursive: true });
  for (const file of files) {
    const target = join(destination, file);
    let same = false;
    try { same = statSync(target).size === statSync(join(source, file)).size; } catch { /* Первое создание. */ }
    if (!same) copyFileSync(join(source, file), target);
  }
  // Рамка имеет непрозрачный origin. CORS открыт только для публичных файлов Python.
  function allowRuntime(server) {
    server.middlewares.use((request, response, next) => {
      if (request.url?.split('?')[0].includes('/runtime/python/')) {
        response.setHeader('Access-Control-Allow-Origin', '*');
      }
      next();
    });
  }
  return { name: 'local-python-runtime', configureServer: allowRuntime, configurePreviewServer: allowRuntime };
}
