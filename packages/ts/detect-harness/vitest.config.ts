import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const here = (file: string): string => fileURLToPath(new URL(`./${file}`, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: [
      { find: /^@osdlc\/detect-harness\/locations$/, replacement: here('locations.ts') },
      { find: /^@osdlc\/detect-harness\/model$/, replacement: here('model/index.ts') },
      { find: /^@osdlc\/detect-harness$/, replacement: here('index.ts') },
    ],
  },
  test: {
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['**/*.ts'],
      exclude: ['tests/**', 'examples/**', 'dist/**', 'vitest.config.ts'],
      reporter: ['text'],
    },
  },
})
