import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: '.',           // looks for index.html in client/
  plugins: [react()],
  build: {
    outDir: 'dist',
  },
})