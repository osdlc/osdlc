import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The examples import the package by name. Point the name at the source.
    alias: { '@osdlc/corpus-schema': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    // One test loads every conformance corpus three times. It took 8 s on a loaded CI runner,
    // past the default 5 s.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
