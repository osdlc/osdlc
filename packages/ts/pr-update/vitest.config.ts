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
    // pr-update makes its own commits (merges, rebases) in the fixtures' repos.
    // A runner with no git identity configured, such as a Linux CI image,
    // would refuse them, so the tests name one.
    //
    // git reads no global or system config, so a developer's settings (an
    // `insteadOf`, a hook path) cannot change what a test sees. The variables
    // that move a file a run reads, and that config-layers and
    // `@osdlc/ecosystem` read from `process.env` rather than the run's own
    // environment, are blanked: both read an empty value as unset. Each CLI
    // test also gives its run `isolatedEnv` (tests/support.ts).
    env: {
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
      GIT_CONFIG_GLOBAL: fileURLToPath(new URL('./tests/empty.gitconfig', import.meta.url)),
      GIT_CONFIG_NOSYSTEM: '1',
      OSDLC_REPOSITORIES: '',
      PR_UPDATE_MACHINE_CONFIG: '',
      WAYFINDER_CONFIG: '',
      PR_UPDATE_HOME: '',
    },
    include: ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
