import { fileURLToPath } from 'node:url'

import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

const path = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

// One config for the tests and the library build (`vite build --config vitest.config.ts`).
// Both compile the single-file components with the same plugin.
export default defineConfig({
  plugins: [vue()],
  build: {
    // One ES module and one stylesheet: dist/index.js and dist/style.css.
    // vue-tsc writes the declarations beside them afterwards.
    lib: {
      entry: path('./src/index.ts'),
      formats: ['es'],
      fileName: 'index',
      cssFileName: 'style',
    },
    rollupOptions: {
      // A consumer installs these; none is bundled.
      external: ['vue', '@osdlc/json-canvas-core', 'dompurify'],
    },
    target: 'es2022',
    minify: false,
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    // The examples import the package by name; run them on the source. The core
    // resolves to its source too, so a fresh checkout needs no build first.
    alias: [
      { find: /^@osdlc\/json-canvas-vue$/, replacement: path('./src/index.ts') },
      { find: /^@osdlc\/json-canvas-core$/, replacement: path('../json-canvas-core/src/index.ts') },
    ],
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts', 'src/**/*.vue'],
      reporter: ['text'],
    },
  },
})
