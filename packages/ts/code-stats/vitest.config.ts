import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

const src = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: [
      { find: /^@osdlc\/code-stats$/, replacement: src('./src/index.ts') },
      { find: /^@osdlc\/code-stats\/scan$/, replacement: src('./src/scan/index.ts') },
      { find: /^@osdlc\/code-stats\/prep$/, replacement: src('./src/prep/index.ts') },
      { find: /^@osdlc\/code-stats\/analysis$/, replacement: src('./src/analysis/index.ts') },
      { find: /^@osdlc\/code-stats\/tree-sitter$/, replacement: src('./src/tree-sitter/index.ts') },
    ],
  },
  test: {
    // Real git spawns on a loaded machine can pass the 5 s default.
    testTimeout: 20000,
    // The fixtures make their own commits. A runner with no git identity
    // configured, such as a Linux CI image, would refuse them, so the tests
    // name one.
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
