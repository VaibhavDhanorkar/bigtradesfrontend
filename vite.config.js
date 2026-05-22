import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],

  // ── Service worker files must NOT be processed by Vite ──────────────────
  // sw.js uses browser globals (self, caches, clients) that don't exist in
  // Node.js. If Vite tries to bundle sw.js as an ESM module it throws:
  //   ReferenceError: self is not defined
  // Solution: sw.js lives in /public/ (Vite copies it verbatim, no processing)
  // and is explicitly excluded from the build graph here as a safety net.
  worker: {
    format: 'es',
  },

  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },

  build: {
    outDir: 'dist',
    sourcemap: false,
    // Exclude service worker from the Rollup bundle entirely
    rollupOptions: {
      input: {
        main: './index.html',
      },
    },
  },

  // Prevent Vite from pre-bundling or touching sw.js
  optimizeDeps: {
    exclude: ['sw.js'],
  },
})
