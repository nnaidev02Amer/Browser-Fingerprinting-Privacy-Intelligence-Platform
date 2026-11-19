import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { readFileSync } from 'node:fs'

const readVersion = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')).version

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Recorded in research exports so a result states which app and FingerprintJS versions produced it.
  define: {
    __APP_VERSION__: JSON.stringify(readVersion('./package.json')),
    __FPJS_VERSION__: JSON.stringify(readVersion('./node_modules/@fingerprintjs/fingerprintjs/package.json')),
  },
  test: {
    // Pure-logic tests run in Node; component/integration tests opt in to
    // jsdom with a `// @vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['tests/**/*.test.{js,jsx}'],
    setupFiles: ['./tests/setup.js'],
    restoreMocks: true,
    // The jsdom UI workflows are CPU-heavy; the 5 s default fails on a busy machine without any real fault.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
