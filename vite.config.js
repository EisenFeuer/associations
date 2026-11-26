import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5196,
    strictPort: true,
    host: "127.0.0.1",
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
