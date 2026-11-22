---
title: Perf scenes
sidebar:
  order: 4
description: Measure a big story from a Playwright spec, with budgets and one merged report.
---

A perf scene is a story that renders a large case: a list of 10,000 rows, a 50,000-line file.
A Playwright spec opens it, measures what a user would feel, and records each number against
a budget.

It has two halves:

- **In the story:** `storyMetrics` marks when the story mounted and when the first rows
  painted.
- **In the spec:** the Playwright helpers read those marks, watch for long tasks, scroll, type,
  and record the results.

## 1. The story

```ts
// stories/BigList.perf.stories.ts
import { seeded, storyMetrics } from '@osdlc/story-harness/browser'
import BigList from '../src/BigList.vue'

const random = seeded(42) // the same rows on every run
const rows = Array.from({ length: 10_000 }, (_, i) => ({ id: i, size: Math.floor(random() * 1e6) }))

export const TenThousandRows = {
  // Perf scenes are too big for screenshot baselines.
  parameters: { screenshot: { skip: 'perf scene' } },
  render: () => {
    storyMetrics({ rows: '[data-row]' })
    return { components: { BigList }, setup: () => ({ rows }), template: '<BigList :rows="rows" />' }
  },
}
```

`storyMetrics({ rows })` takes a CSS selector for one row, or a function that returns how many
rows are mounted. When called, it:

- marks `story:mount` at once;
- marks `story:first-rows` on the first painted frame that has at least one row;
- sets `window.__storyHarness`, which the spec reads.

You can add your own marks. Any `performance.mark` whose name starts with `story:` is part of
the story's metrics.

## 2. The config

```ts
// playwright.perf.config.ts
import { defineStoryConfig } from '@osdlc/story-harness/playwright'

export default defineStoryConfig({ port: 6106, mode: 'perf', configDir: import.meta.dirname })
```

Perf mode runs `tests-stories/**/*.perf.ts` on **one** worker, so tests do not compete for the
CPU. The report goes to `<configDir>/test-results/story-perf.json`.

## 3. The spec

```ts
// tests-stories/big-list.perf.ts
import { test } from '@playwright/test'
import {
  budget,
  maxMountedRows,
  noLongTasks,
  observeLongTasks,
  openPerfStory,
  preparePage,
  recordBrowser,
  scrollSteps,
} from '@osdlc/story-harness/playwright'

test('10,000 rows', async ({ page, baseURL }) => {
  await preparePage(page, { clock: false }) // real time, not the fake clock
  await observeLongTasks(page) // before the first navigation
  await openPerfStory(page, baseURL!, 'big-list--ten-thousand-rows')
  await recordBrowser(page)

  // No task over 50 ms between mount and the first painted rows.
  await noLongTasks(page, 'first rows', 'story:mount', 'story:first-rows')

  // A virtual list keeps few rows mounted, however far you scroll.
  const peak = await maxMountedRows(page, () => scrollSteps(page, '[data-list]', 20, 800))
  budget('rows mounted while scrolling', peak, 120)
})
```

## The helpers

| Helper | What it measures or does |
|---|---|
| `openPerfStory(page, baseURL, id, timeoutMs?)` | Opens the story and waits for `story:first-rows`. Throws if the story failed or no rows appear in time (default 30 s). |
| `observeLongTasks(page)` | Starts recording long tasks (main-thread work over 50 ms). Call before navigating. |
| `longTasks(page, fromMark?, toMark?)` | The long tasks between two marks, as `{ startTime, duration }`. |
| `noLongTasks(page, name, fromMark, toMark)` | Records the long tasks between two marks and budgets them at none. |
| `mountedRows(page, selector?)` | Rows mounted now. |
| `maxMountedRows(page, run, selector?)` | The most rows mounted at any frame while `run` executes. |
| `scrollSteps(page, selector, steps, px)` | Scrolls an element `steps` times by `px`, one frame apart. |
| `holdKey(page, key, presses, intervalMs)` | Presses a key repeatedly, as a held key repeats. |
| `paintedAt(page, selector)` | The time of the frame after `selector` first matches. Start it before the action, await it after. |
| `responseEnd(page, urlPart)` | When the latest matching network request finished. |

Reply-to-paint, the time from a server reply to the change on screen:

```ts
const painted = paintedAt(page, '[data-row].loaded')
await page.getByRole('button', { name: 'Load more' }).click()
const ms = (await painted) - (await responseEnd(page, '/api/rows'))
budget('reply to paint (ms)', ms, 100)
```

`openPerfStory`, `noLongTasks`, `paintedAt` and `responseEnd` are experimental: they are the
newest helpers and may change in a patch release.

## Budgets and the report

`budget(name, value, limit)` records a verdict: pass when `value <= limit`. `record(name,
value)` records a number with no budget.

By default a run **records** and fails nothing: on a busy machine, numbers vary. To make
budgets fail the test:

```sh
PW_PERF_ASSERT=1 npx playwright test -c playwright.perf.config.ts
# On a shared machine, allow twice the limit:
PW_PERF_ASSERT=1 PW_PERF_SLACK=2 npx playwright test -c playwright.perf.config.ts
```

Every run writes one report, `test-results/story-perf.json`:

```json
{
  "runId": "5f0c2a8e-3b1d-4c6e-9a7f-2d4b8e1c0a93",
  "mode": "record",
  "date": "2026-11-07T10:00:00.000Z",
  "userAgent": "Mozilla/5.0 … HeadlessChrome/140.0 …",
  "cpu": "Apple M3",
  "loadBefore": [1.2, 1.5, 1.4],
  "loadAfter": [2.1, 1.7, 1.5],
  "values": {
    "first rows: long task durations (ms)": [],
    "rows mounted while scrolling": 96
  },
  "verdicts": {
    "first rows: long tasks over 50 ms": { "value": 0, "limit": 0, "slack": 1, "pass": true },
    "rows mounted while scrolling": { "value": 96, "limit": 120, "slack": 1, "pass": true }
  }
}
```

The CPU model and the load averages before and after tell you whether the machine was busy.
Several workers and a worker restarted after a failure all merge into the same file, under a
lock. `STORY_PERF_FILE` moves it. `runId` is `STORY_PERF_RUN`, a new id that
`defineStoryConfig` sets for each run, so a new run replaces the last run's report. In
`playwright test --ui` or watch mode the runner stays up, so its reruns share one report.

Measure on a host browser, never inside the baseline container, which may be emulated.
