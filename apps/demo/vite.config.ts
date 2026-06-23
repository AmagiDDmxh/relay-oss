import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

const extraAllowedHosts = (process.env.VITE_ALLOWED_HOSTS ?? '')
  .split(',')
  .map((host) => host.trim())
  .filter(Boolean);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    globals: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@squady/whatsapp-relay': path.resolve(__dirname, '../../packages/sdk/src/index.ts'),
    },
  },
  server: {
    allowedHosts: extraAllowedHosts,
  },
  preview: {
    allowedHosts: extraAllowedHosts,
  },
});
