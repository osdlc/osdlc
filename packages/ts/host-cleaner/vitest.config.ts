import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    // The examples import the package by name. Every entry resolves to src/,
    // so a test never mixes src/ and dist/ copies of the core.
    alias: [
      {
        find: /^@osdlc\/host-cleaner$/,
        replacement: fileURLToPath(new URL('./src/index.ts', import.meta.url)),
      },
      {
        find: /^@osdlc\/host-cleaner\/(plugin|testing)$/,
        replacement: fileURLToPath(new URL('./src/$1.ts', import.meta.url)),
      },
    ],
  },
  test: {
    server: {
      deps: {
        // The loader's fixture packages sit in a node_modules folder, which would
        // load them natively, on dist/. Through Vite they get the source too.
        inline: [/host-cleaner-fixture/],
      },
    },
    // Real git and gh spawns on a loaded machine can pass the 5 s default.
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
