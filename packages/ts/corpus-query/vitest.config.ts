import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name. Point each entry at the source so
    // they need no build.
    alias: [
      { find: /^@osdlc\/corpus-query$/, replacement: src('./src/index.ts') },
      { find: /^@osdlc\/corpus-query\/(node|rest|mcp|cli)$/, replacement: src('./src/$1.ts') },
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
