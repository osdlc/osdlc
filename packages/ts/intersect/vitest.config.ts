import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // Run tests that import the package by name on the source.
    alias: {
      '@osdlc/intersect/segments': src('./segments/index.ts'),
      '@osdlc/intersect/fs': src('./fs.ts'),
      '@osdlc/intersect': src('./index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['*.ts', 'segments/*.ts'],
      exclude: ['vitest.config.ts'],
      reporter: ['text'],
    },
  },
})
