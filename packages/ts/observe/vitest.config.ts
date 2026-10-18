import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const here = (file: string): string => fileURLToPath(new URL(`./${file}`, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: [
      { find: /^@osdlc\/observe\/session$/, replacement: here('session.ts') },
      { find: /^@osdlc\/observe$/, replacement: here('index.ts') },
    ],
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
