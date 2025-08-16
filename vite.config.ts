import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 4200,
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://localhost:8788',
        changeOrigin: true
      },
      '/binance': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/binance/, '')
      }
    }
  },
  preview: {
    port: 4200,
    strictPort: true
  }
});

