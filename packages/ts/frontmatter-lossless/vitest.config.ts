import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source, so they
    // need no build. The subpaths first, then the bare name.
    alias: [{ find: /^@osdlc\/frontmatter-lossless$/, replacement: src('./index.ts') }],
  },
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['index.ts'],
      exclude: ['vitest.config.ts'],
      reporter: ['text'],
    },
  },
})
