import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (file: string): string => fileURLToPath(new URL(`./src/${file}`, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: [
      { find: /^@osdlc\/markdown-vault-astro\/remark$/, replacement: src('remark-wikilinks.ts') },
      { find: /^@osdlc\/markdown-vault-astro$/, replacement: src('index.ts') },
    ],
  },
  test: {
    // Spawning the built CLI under node on a loaded machine can pass the 5 s default.
    testTimeout: 20000,
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    // Builds dist/ once: the CLI tests run the built bin.
    globalSetup: ['tests/global-setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
