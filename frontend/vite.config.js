// frontend/vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const target = 'http://backend:8000' // service Docker "backend"

export default defineConfig({
  plugins: [react()],
    server: {
     host: true,
     port: 5173,
     // allowedHosts: 'any', // ← optionnel. Ajoute-le si tu en as besoin.
     proxy: {
      '/api':   { target, changeOrigin: true },
      '/admin': { target, changeOrigin: true },
      '/static': { target },
      '/media':  { target },
    }
  }
  // Tu peux supprimer complètement le bloc "preview"
})
