import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:10000',
        changeOrigin: true,
      },
      '/socket.io': {
        target: 'http://127.0.0.1:10000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});


