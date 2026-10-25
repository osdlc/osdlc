import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The examples import the package by name, and the source imports
    // @osdlc/color. Point both names at source, so a fresh checkout tests
    // without a build.
    alias: {
      '@osdlc/ux': fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      '@osdlc/color': fileURLToPath(new URL('../color/src/index.ts', import.meta.url)),
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
