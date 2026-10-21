import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: {
      // The subpaths first: a key also matches its subpaths, and the first match wins.
      '@osdlc/path-guard/lexical': fileURLToPath(
        new URL('./src/lexical-entry.ts', import.meta.url),
      ),
      '@osdlc/path-guard/node': fileURLToPath(new URL('./src/node.ts', import.meta.url)),
      '@osdlc/path-guard': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
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
