import { defineConfig } from 'vitest/config'

export default defineConfig({
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
