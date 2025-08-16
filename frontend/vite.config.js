import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const target = 'http://backend:8000' // service Docker "backend"

export default defineConfig({
  plugins: [react()],
  preview: {
    // écoute sur toutes les interfaces (on publie le port côté host via docker)
    host: true,            // équiv. '0.0.0.0'
    port: 4173,
    // autorise explicitement ton sous-domaine
    allowedHosts: ['app.mon-site.ca'], 
    // En dépannage tu peux mettre: allowedHosts: 'any'
  },
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
