import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // pr-update makes its own commits (merges, rebases) in the fixtures' repos.
    // A runner with no git identity configured, such as a Linux CI image,
    // would refuse them, so the tests name one.
    env: {
      GIT_AUTHOR_NAME: 'Fixture',
      GIT_AUTHOR_EMAIL: 'fixture@example.invalid',
      GIT_COMMITTER_NAME: 'Fixture',
      GIT_COMMITTER_EMAIL: 'fixture@example.invalid',
    },
    include: ['tests/**/*.test.ts', 'src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts'],
      reporter: ['text'],
    },
  },
})
