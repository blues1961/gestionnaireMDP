import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const target = 'http://backend:8000' // service Docker "backend"

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,          // (déjà le cas souvent en conteneur)
    port: 5173,
    proxy: {
      '/api':   { target, changeOrigin: true, secure: false },
      '/admin': { target, changeOrigin: true, secure: false },
      '/static': { target },
      '/media':  { target },
    }
  }
})
