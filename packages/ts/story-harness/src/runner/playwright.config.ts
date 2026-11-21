/**
 * Playwright config for the story baseline check. Read inside the Linux
 * container by the `story-shots` command (`story-shots.sh`), from the built
 * runner folder, which holds JavaScript. It reads these variables, which
 * `story-shots.sh` sets with the others the spec reads:
 *
 * - `STORYBOOK_DIR`: the mounted `storybook-static`;
 * - `BASELINE_DIR`: where the baseline PNGs are read and written;
 * - `ARTIFACTS_DIR`: where expected/actual/diff images of a failure go;
 * - `SHOT_WORKERS`: Playwright workers.
 */
import { defineConfig } from '@playwright/test'
import { VIEWPORT } from './story.ts'

// Inside the container only, so it cannot clash with a port on the host.
const PORT = 14759
const storybookDir = process.env.STORYBOOK_DIR ?? ''
const baselineDir = process.env.BASELINE_DIR ?? './baselines'

export default defineConfig({
  testDir: '.',
  testMatch: 'story-shots.e2e.js',
  outputDir: process.env.ARTIFACTS_DIR ?? './test-results',
  snapshotPathTemplate: `${baselineDir}/{arg}{ext}`,
  fullyParallel: true,
  // Most of each test is the settle wait, not CPU, so run more workers than cores.
  workers: Number(process.env.SHOT_WORKERS ?? 6),
  retries: 0,
  // Loading, `play`, the settle wait and two shots; slow under amd64 emulation on Apple silicon.
  timeout: 120_000,
  reporter: [['line']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    browserName: 'chromium',
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    locale: 'en-US',
    timezoneId: 'UTC',
    colorScheme: 'light',
  },
  expect: {
    timeout: 30_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      // The baselines and the check run in the same pinned image on
      // linux/amd64, so rendering is nearly exact. Antialiased rounded corners
      // still move by a level or two between runs; a per-pixel colour distance
      // of 0.02 absorbs that and nothing larger. Any pixel past it fails.
      threshold: 0.02,
      maxDiffPixels: 0,
    },
  },
  webServer: {
    command: `node serve-static.js ${JSON.stringify(storybookDir)} ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.json`,
    reuseExistingServer: false,
  },
})
