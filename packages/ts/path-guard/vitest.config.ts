import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: {
      '@osdlc/path-guard': fileURLToPath(new URL('./index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    // The tests change the working directory, which a worker thread cannot do.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      include: ['*.ts'],
      exclude: ['vitest.config.ts'],
      reporter: ['text'],
    },
  },
})
