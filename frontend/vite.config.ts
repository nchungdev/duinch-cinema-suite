import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  css: {
    // Explicitly set empty PostCSS config to prevent postcss-load-config from
    // traversing up parent directories and picking up a legacy tailwindcss v3
    // PostCSS plugin config, which conflicts with @tailwindcss/vite (v4).
    postcss: {},
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8086',
        changeOrigin: true,
      }
    }
  }
})
