import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { pythonRuntimePlugin } from './scripts/python-runtime.mjs';

export default defineConfig({
  plugins: [pythonRuntimePlugin(), react()],
  // Относительные пути позволяют позже разместить сборку в подпапке GitHub Pages.
  base: './',
  server: { proxy: { '/api': process.env.LUMO_API_PROXY || 'http://127.0.0.1:3001' } },
  preview: { proxy: { '/api': process.env.LUMO_API_PROXY || 'http://127.0.0.1:3001' } },
});
