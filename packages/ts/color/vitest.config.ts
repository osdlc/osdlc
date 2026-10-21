import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The tests and examples import the package by name; run them on the source.
    alias: { '@osdlc/color': fileURLToPath(new URL('./src/index.ts', import.meta.url)) },
  },
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
      thresholds: { lines: 100 },
    },
  },
})
