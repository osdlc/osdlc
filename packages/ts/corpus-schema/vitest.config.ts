import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The examples import the package by name. Point the name at the source.
    alias: { '@osdlc/corpus-schema': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    // One test loads every conformance corpus three times; on a loaded machine it can pass the 5 s
    // default.
    testTimeout: 20000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
