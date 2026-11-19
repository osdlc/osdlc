import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (file: string): string => fileURLToPath(new URL(`./src/${file}`, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: [
      { find: /^@osdlc\/agent-router\/config$/, replacement: src('config/index.ts') },
      { find: /^@osdlc\/agent-router$/, replacement: src('index.ts') },
    ],
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
