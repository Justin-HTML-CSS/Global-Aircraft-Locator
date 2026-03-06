import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  define: {
    // Define Cesium base URL for Vite
    CESIUM_BASE_URL: JSON.stringify('/cesium/'),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          cesium: ['cesium'],
        },
      },
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
  },
})
