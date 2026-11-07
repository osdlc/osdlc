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
      { find: /^@osdlc\/story-harness\/browser$/, replacement: entry('./src/browser/index.ts') },
      {
        find: /^@osdlc\/story-harness\/playwright$/,
        replacement: entry('./src/playwright/index.ts'),
      },
      { find: /^@osdlc\/story-harness\/runner$/, replacement: entry('./src/runner/index.ts') },
    ],
  },
  test: {
    include: browser
      ? ['tests/**/*.browser.test.ts', 'examples/**/*.browser.test.ts']
      : ['tests/**/*.test.ts', 'examples/**/*.test.ts'],
    exclude: browser ? [] : ['**/*.browser.test.ts', '**/node_modules/**'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text'],
    },
  },
})
