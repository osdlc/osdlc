import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: {
      // The subpaths first: a key also matches its subpaths, and the first match wins.
      '@osdlc/path-guard/lexical': fileURLToPath(new URL('./lexical-entry.ts', import.meta.url)),
      '@osdlc/path-guard/node': fileURLToPath(new URL('./node.ts', import.meta.url)),
      '@osdlc/path-guard': fileURLToPath(new URL('./index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['*.ts'],
      exclude: ['vitest.config.ts'],
      reporter: ['text'],
    },
  },
})
