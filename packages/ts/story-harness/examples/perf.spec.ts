// A perf spec and an interaction spec against a static Storybook build. In a
// package they sit in `tests-stories/*.perf.ts` and `*.e2e.ts`, run by a
// defineStoryConfig config. Here the build is the fixture, served by a route.
import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import {
  budget,
  holdKey,
  longTasks,
  maxMountedRows,
  mountedRows,
  noLongTasks,
  observeLongTasks,
  openPerfStory,
  openStory,
  paintedAt,
  preparePage,
  record,
  recordBrowser,
  responseEnd,
  scrollSteps,
  type LongTask,
  type Theme,
} from '@osdlc/story-harness/playwright'

const BASE = 'http://storybook.test'
const IFRAME = readFileSync(
  new URL('../tests/fixtures/storybook-static/iframe.html', import.meta.url),
  'utf8',
)

// A perf story: a scrolling list of rows, with the metrics hook's globals set
// the way storyMetrics sets them.
const PERF = IFRAME.replace(
  '</body>',
  `<div id="list" style="height:200px;overflow:auto"><div style="height:4000px"></div></div>
  <input id="filter" />
  <script>
    window.__storyHarness = {
      rows: () => document.querySelectorAll('#list > div').length,
      ready: new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => {
        performance.mark('story:first-rows'); resolve(performance.now())
      }))),
      marks: () => [],
    }
    performance.mark('story:mount')
  </script></body>`,
)

test.beforeEach(async ({ page }) => {
  await page.route(`${BASE}/iframe.html*`, (route) =>
    route.fulfill({ contentType: 'text/html', body: PERF }),
  )
  await page.route(`${BASE}/data.json`, (route) => route.fulfill({ body: '[]' }))
})

test('a perf story: first rows, long tasks, scrolling and a held key', async ({ page }) => {
  // Real time: the fixed clock would fake performance.now() and frames.
  await preparePage(page, { clock: false })
  await observeLongTasks(page)
  await openPerfStory(page, BASE, 'demo-card--perf')
  await recordBrowser(page)

  const rows = await mountedRows(page)
  record('rows mounted', rows)
  const peak = await maxMountedRows(page, () => scrollSteps(page, '#list', 5, 200))
  budget('rows mounted while scrolling', peak, 10)

  await page.locator('#filter').focus()
  await holdKey(page, 'a', 5, 30)
  await expect(page.locator('#filter')).toHaveValue('aaaaa')

  const tasks: LongTask[] = await longTasks(page, 'story:mount')
  record('long tasks after mount', tasks.length)
  await noLongTasks(page, 'first rows', 'story:mount', 'story:first-rows')
})

test('reply to paint, measured in the page', async ({ page }) => {
  await preparePage(page, { clock: false })
  await openPerfStory(page, BASE, 'demo-card--perf')
  const painted = paintedAt(page, '#filter.loaded')
  await page.evaluate(async () => {
    await (await fetch('/data.json')).text()
    document.getElementById('filter')!.classList.add('loaded')
  })
  const span = (await painted) - (await responseEnd(page, '/data.json'))
  expect(span).toBeGreaterThanOrEqual(0)
})

test('an interaction spec opens a story in each theme', async ({ page }) => {
  await preparePage(page)
  for (const theme of ['light', 'dark'] satisfies Theme[]) {
    const params = await openStory(page, BASE, 'demo-card--plain', theme, { settleMs: 0 })
    expect(params.skip).toBeUndefined()
    await expect(page.locator('#card')).toHaveText('Card')
  }
})
