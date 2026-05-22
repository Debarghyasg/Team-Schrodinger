import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: '.',
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',   // Node.js gateway — NOT FastAPI directly
        changeOrigin: true,
        // do NOT rewrite — Node keeps the /api prefix
      },
    },
  },
})