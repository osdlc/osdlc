import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type PlaywrightTestConfig } from '@playwright/test'
import { VIEWPORT } from '../runner/story.ts'

export interface StoryConfigOptions {
  /** The static server's port on `127.0.0.1`. */
  port: number
  /** `e2e` runs `*.e2e.ts` in parallel; `perf` runs `*.perf.ts` on one worker. */
  mode: 'e2e' | 'perf'
  /** The built Storybook, relative to the config file's directory. Default `storybook-static`. */
  storybookDir?: string
  /** Where the specs live. Default `tests-stories`. */
  testDir?: string
  /** The config file's directory, which Playwright resolves `outputDir` against. Default the working directory. */
  configDir?: string
}

// The package runs as TypeScript from source and as JavaScript once built.
const ext = import.meta.url.endsWith('.ts') ? 'ts' : 'js'
const serveStatic = fileURLToPath(new URL(`../runner/serve-static.${ext}`, import.meta.url))

/**
 * A Playwright config for host specs against a static Storybook build, served
 * by the runner's `serveStatic`. No retries in either mode. Sets
 * `STORY_PERF_FILE` (unless already set) to `<configDir>/test-results/story-perf.json`,
 * the perf report path every worker's `budget` writes to.
 */
export function defineStoryConfig(options: StoryConfigOptions): PlaywrightTestConfig {
  const {
    port,
    mode,
    storybookDir = 'storybook-static',
    testDir = 'tests-stories',
    configDir = process.cwd(),
  } = options
  const perf = mode === 'perf'
  // Workers inherit the runner's environment.
  process.env.STORY_PERF_FILE ??= resolve(configDir, 'test-results', 'story-perf.json')
  return defineConfig({
    testDir,
    testMatch: perf ? '**/*.perf.ts' : '**/*.e2e.ts',
    // Its own folder: Playwright empties outputDir, and story-perf.json sits in its parent.
    outputDir: `test-results/playwright-${mode}`,
    fullyParallel: !perf,
    ...(perf ? { workers: 1 } : {}),
    retries: 0,
    reporter: [['line']],
    use: {
      baseURL: `http://127.0.0.1:${port}`,
      browserName: 'chromium',
      viewport: VIEWPORT,
      locale: 'en-US',
      timezoneId: 'UTC',
    },
    webServer: {
      command: `node ${JSON.stringify(serveStatic)} ${JSON.stringify(storybookDir)} ${port}`,
      url: `http://127.0.0.1:${port}/index.json`,
      reuseExistingServer: false,
    },
  })
}
