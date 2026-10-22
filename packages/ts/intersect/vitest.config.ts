import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string): string => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // Run tests that import the package by name on the source.
    alias: {
      '@osdlc/intersect/segments': src('./src/segments/index.ts'),
      '@osdlc/intersect/fs': src('./src/fs.ts'),
      '@osdlc/intersect': src('./src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
