// The package's own browser specs: blank pages and routed fixture builds on
// host Chromium, no Storybook. Also runs the examples' Playwright specs, which
// import the package by name, so build first.
import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: '..',
  testMatch: ['tests/*.spec.ts', 'examples/*.spec.ts'],
  outputDir: '../test-results/playwright',
  retries: 0,
  reporter: [['line']],
  use: { browserName: 'chromium' },
})
