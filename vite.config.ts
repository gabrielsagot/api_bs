import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Le front vit dans web/ ; `npm run build` produit web/dist, servi par le serveur Node.
export default defineConfig({
  root: 'web',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 1500,
  },
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://127.0.0.1:4777' },
  },
});
