import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The tests and examples import the package by name; run them on the source.
    alias: [{ find: /^@osdlc\/ref-lease$/, replacement: src('./src/index.ts') }],
  },
  test: {
    // The recipes race real git pushes against a remote; on a loaded CI
    // runner (Windows above all) one can pass the 5 s default.
    testTimeout: 20000,
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
