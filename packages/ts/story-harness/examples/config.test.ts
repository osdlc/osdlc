// A package's Playwright configs for its story specs, and the perf report a
// spec writes. `playwright.e2e.config.ts` and `playwright.perf.config.ts` in a
// package hold only the defineStoryConfig call.
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  budget,
  DEFAULT_SETTLE_MS,
  defineStoryConfig,
  NARROW_VIEWPORT,
  record,
  START_TIME,
  storyUrl,
  THEMES,
  VIEWPORT,
  type PerfReport,
} from '@osdlc/story-harness/playwright'

test('defineStoryConfig serves the static build for e2e and perf specs', () => {
  const e2e = defineStoryConfig({ port: 6106, mode: 'e2e' })
  const perf = defineStoryConfig({ port: 6106, mode: 'perf', storybookDir: 'storybook-static' })
  expect(e2e.use?.baseURL).toBe('http://127.0.0.1:6106')
  expect(e2e.testMatch).toBe('**/*.e2e.ts')
  expect(perf.testMatch).toBe('**/*.perf.ts')
  expect(perf.workers).toBe(1)
})

test('budget and record write one report', () => {
  const dir = mkdtempSync(join(tmpdir(), 'story-perf-example-'))
  const saved = process.env.STORY_PERF_FILE
  process.env.STORY_PERF_FILE = join(dir, 'story-perf.json')
  try {
    // Record mode: a missed budget is written and fails nothing.
    budget('first rows (ms)', 180, 150)
    record('rows mounted', 42)
    const report: PerfReport = JSON.parse(readFileSync(process.env.STORY_PERF_FILE, 'utf8'))
    expect(report.verdicts['first rows (ms)']?.pass).toBe(false)
    expect(report.values['rows mounted']).toBe(42)
  } finally {
    if (saved === undefined) delete process.env.STORY_PERF_FILE
    else process.env.STORY_PERF_FILE = saved
    rmSync(dir, { recursive: true, force: true })
  }
})

test('the story URL and the fixed shooting conditions', () => {
  expect(storyUrl('http://127.0.0.1:6106', 'card--plain', 'dark')).toBe(
    'http://127.0.0.1:6106/iframe.html?id=card--plain&viewMode=story&globals=theme:dark',
  )
  expect(THEMES).toEqual(['light', 'dark'])
  expect(VIEWPORT).toEqual({ width: 1440, height: 900 })
  expect(NARROW_VIEWPORT).toEqual({ width: 1024, height: 720 })
  expect(START_TIME.toISOString()).toBe('2026-09-28T12:00:00.000Z')
  expect(DEFAULT_SETTLE_MS).toBe(1500)
})
