import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The examples import the package by name. Point its entries at the source.
    alias: [
      {
        find: /^@osdlc\/wayfinder\/schema$/,
        replacement: fileURLToPath(new URL('./src/schema.ts', import.meta.url)),
      },
      {
        find: /^@osdlc\/wayfinder$/,
        replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    // Real git spawns and a served port; Windows passes the 5 s default (S-0021 tier 2).
    testTimeout: 20000,
    hookTimeout: 20000,
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    // Fails fast when a workspace library's dist/ is missing or older than its src/.
    globalSetup: ['tests/global-setup.ts'],
    setupFiles: ['tests/setup.ts'],
    // Some tests build throwaway git repositories and commit in them.
    env: {
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
