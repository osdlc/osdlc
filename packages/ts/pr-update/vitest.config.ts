import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: [
      {
        find: /^@osdlc\/pr-update$/,
        replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      },
    ],
  },
  test: {
    // The tests run real git (clones, merges, rebases, worktrees) and a test
    // can make several updates in a row; on a loaded CI runner that passes the
    // 5 s default.
    testTimeout: 20000,
    // pr-update makes its own commits (merges, rebases) in the fixtures' repos.
    // A runner with no git identity configured, such as a Linux CI image,
    // would refuse them, so the tests name one.
    env: {
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
