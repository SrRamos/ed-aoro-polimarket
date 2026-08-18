/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  // Opt-in CORS contingency (NFR-SVC-2): set VITE_GAMMA_BASE_URL=/gamma-api to
  // route Gamma reads through this dev proxy — zero service-layer changes.
  server: {
    proxy: {
      '/gamma-api': {
        target: 'https://gamma-api.polymarket.com',
        changeOrigin: true,
        secure: true,
        rewrite: (path) => path.replace(/^\/gamma-api/, ''),
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/unit/**/*.{test,spec}.{ts,tsx}', 'src/**/*.{test,spec}.{ts,tsx}'],
  },
})
