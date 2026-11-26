import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import backendApi from './vite-plugin-api.js';

const calculations = fileURLToPath(new URL('../calculations/src/index.js', import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss(), backendApi()],
  resolve: {
    // Motor de calculos compartido con el backend (paquete independiente en /calculations).
    alias: { '@calc': calculations },
  },
  server: {
    port: 5173,
    fs: { allow: ['..'] },
    // En desarrollo /api se redirige al backend: mismo origen, cookies SameSite=Strict funcionan.
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    sourcemap: false,
  },
});
