import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Expose both VITE_* and APP_* variables to import.meta.env
  envPrefix: ['VITE_', 'APP_'],
  server: {
    host: true,
    port: 5173,                  // mappé vers 5174 côté hôte (N=1)
    proxy: {
      '/api': {
        target: 'http://backend:8000',   // service Docker du backend
        changeOrigin: false,              // garde Host: localhost:5174 (déjà autorisé)
      },
      // Optionnel en dev:
      // '/admin':  { target: 'http://backend:8000', changeOrigin: false },
      // '/static': { target: 'http://backend:8000' },
      // '/media':  { target: 'http://backend:8000' },
    },
  },
})
