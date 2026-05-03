import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  css: {
    // Explicitly set empty PostCSS config to prevent postcss-load-config from
    // traversing up parent directories and picking up a legacy tailwindcss v3
    // PostCSS plugin config, which conflicts with @tailwindcss/vite (v4).
    postcss: {},
  },
  server: {
    host: true,
    fs: {
      allow: ['..']
    },
    proxy: {
      '/api': {
        target: 'https://omv-jdownloader-dashboard.onrender.com',
        changeOrigin: true,
      }
    }
  }
})
