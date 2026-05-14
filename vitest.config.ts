import { defineConfig } from 'vitest/config'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@common': fileURLToPath(new URL('./src/common', import.meta.url)),
      '@modules': fileURLToPath(new URL('./src/modules', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    env: {
      VITE_FIREBASE_API_KEY: 'vitest-placeholder',
      VITE_FIREBASE_AUTH_DOMAIN: 'vitest-placeholder.firebaseapp.com',
      VITE_FIREBASE_PROJECT_ID: 'vitest-placeholder',
      VITE_FIREBASE_STORAGE_BUCKET: 'vitest-placeholder.appspot.com',
      VITE_FIREBASE_MESSAGING_SENDER_ID: '000000000000',
      VITE_FIREBASE_APP_ID: '1:000000000000:web:vitestplaceholder00',
    },
  },
})
