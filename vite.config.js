import { defineConfig } from 'vite';
export default defineConfig({
  base: './',
  server: {
    host: true,
    allowedHosts: ['madonna-adjustment-overview-apparel.trycloudflare.com'],
  },
  build: { chunkSizeWarningLimit: 1000 },
});
