/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Used when mocks are off: the dev server forwards API calls to the local Express server.
  server: {
    proxy: { '/api': 'http://localhost:3000' },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    // Whole-page tests can be slow on a busy machine; see asyncUtilTimeout in src/test/setup.ts.
    testTimeout: 15_000,
    // Node 22+ has a built-in localStorage that shadows jsdom's; turn it off in test workers.
    execArgv: ['--no-experimental-webstorage'],
  },
})
