import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source, so they
    // need no build. The subpaths first, then the bare name.
    alias: [
      { find: /^@osdlc\/command-seam\/testing$/, replacement: src('./testing.ts') },
      { find: /^@osdlc\/command-seam$/, replacement: src('./index.ts') },
    ],
  },
  test: {
    // Real git, sh and gh spawns on a loaded machine can pass the 5 s default.
    testTimeout: 20000,
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['*.ts'],
      exclude: ['vitest.config.ts'],
      reporter: ['text'],
    },
  },
})
