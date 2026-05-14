import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
// PWA: vite-plugin-pwa (Workbox) precaches the shell; peer range may lag Vite majors — use npm --legacy-peer-deps until upstream widens peers.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'logo.svg', 'pwa-192.png', 'pwa-512.png'],
      manifest: {
        name: 'Disc Golf Social',
        short_name: 'Disco',
        description: 'Mobile-first disc golf social PWA',
        theme_color: '#1f8a4d',
        background_color: '#13161e',
        display: 'standalone',
        orientation: 'portrait-primary',
        start_url: '/',
        icons: [
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pwa-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@common': fileURLToPath(new URL('./src/common', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
    },
  },
})
