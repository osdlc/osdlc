import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name. Point the name at the source,
    // so the tests need no build. The subpath first, then the bare name.
    alias: [
      { find: /^@osdlc\/ecosystem\/repositories$/, replacement: src('./src/repositories.ts') },
      { find: /^@osdlc\/ecosystem$/, replacement: src('./src/index.ts') },
    ],
  },
  test: {
    // Real git spawns on a loaded machine can pass the 5 s default.
    testTimeout: 20000,
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
