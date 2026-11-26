import { fileURLToPath } from 'node:url'

import { defineConfig } from 'vitest/config'

// `test` runs the unit tests and the examples with no browser. `test:browser`
// sets STORY_HARNESS_BROWSER=1 to run the tests that launch Chromium
// (`*.browser.test.ts`); the Playwright specs (`tests/*.spec.ts`) run under
// Playwright's own runner.
const browser = process.env.STORY_HARNESS_BROWSER === '1'
const entry = (path: string) => fileURLToPath(new URL(path, import.meta.url))

export default defineConfig({
  resolve: {
    // The examples import the package by name; run them on the source.
    alias: [
      { find: /^@osdlc\/story-harness\/a11y$/, replacement: entry('./src/runner/a11y.ts') },
      { find: /^@osdlc\/story-harness\/browser$/, replacement: entry('./src/browser/index.ts') },
      {
        find: /^@osdlc\/story-harness\/playwright$/,
        replacement: entry('./src/playwright/index.ts'),
      },
      {
        find: /^@osdlc\/story-harness\/parley-capture$/,
        replacement: entry('./src/runner/parley-capture.ts'),
      },
      { find: /^@osdlc\/story-harness\/runner$/, replacement: entry('./src/runner/index.ts') },
    ],
  },
  test: {
    include: browser
      ? ['tests/**/*.browser.test.ts', 'examples/**/*.browser.test.ts']
      : ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    exclude: browser ? [] : ['**/*.browser.test.ts', '**/node_modules/**'],
    // A browser test launches Chromium and shoots several stories; on a busy
    // CI runner the first one, which also pays the cold start, can take over
    // the 5 s default. The `--a11y` mode test runs a whole Playwright pass in
    // a `beforeAll`, which can take over the 10 s hook default the same way.
    testTimeout: browser ? 30_000 : 5_000,
    hookTimeout: browser ? 60_000 : 10_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
