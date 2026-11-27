import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples and tests import the package by name. Point the name at the
    // source so they need no build.
    alias: [{ find: /^@osdlc\/spec-query$/, replacement: src('./src/index.ts') }],
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
