import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  paintedAt,
  preparePage,
  record,
  recordBrowser,
  responseEnd,
  scrollSteps,
} from '../src/playwright/index.ts'

const page_ = `data:text/html,
  <div id="box" style="height:100px;overflow:auto"><div style="height:5000px"></div></div>
  <ul id="list"></ul>
  <input id="field" />`

test.beforeEach(async ({ page }) => {
  await preparePage(page, { clock: false })
  await observeLongTasks(page)
  await page.goto(page_)
})

test('longTasks returns the tasks between two marks', async ({ page }) => {
  // A task the page runs itself: Chromium does not report CDP evaluations.
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          performance.mark('story:a')
          const end = performance.now() + 80
          while (performance.now() < end) {
            // busy: one long task
          }
          performance.mark('story:b')
          resolve()
        }),
      ),
  )
  await expect.poll(async () => (await longTasks(page, 'story:a', 'story:b')).length).toBe(1)
  const [task] = await longTasks(page, 'story:a', 'story:b')
  expect(task!.duration).toBeGreaterThan(50)
  await page.evaluate(() => performance.mark('story:c'))
  expect(await longTasks(page, 'story:c')).toEqual([])
})

test('mountedRows reads the hook, or counts a selector', async ({ page }) => {
  await page.evaluate(() => {
    document.getElementById('list')!.innerHTML = '<li></li><li></li>'
    ;(window as any).__storyHarness = { rows: () => 5 }
  })
  expect(await mountedRows(page)).toBe(5)
  expect(await mountedRows(page, '#list li')).toBe(2)
})

test('maxMountedRows keeps the peak seen while run executes', async ({ page }) => {
  const max = await maxMountedRows(
    page,
    async () => {
      await page.evaluate(
        () => (document.getElementById('list')!.innerHTML = '<li></li>'.repeat(9)),
      )
      await page.evaluate(
        () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
      )
      await page.evaluate(() => (document.getElementById('list')!.innerHTML = '<li></li>'))
    },
    '#list li',
  )
  expect(max).toBe(9)
})

test('scrollSteps scrolls by steps × px', async ({ page }) => {
  await scrollSteps(page, '#box', 4, 100)
  expect(await page.locator('#box').evaluate((el) => el.scrollTop)).toBe(400)
})

test('holdKey presses at the interval', async ({ page }) => {
  await page.locator('#field').focus()
  const start = Date.now()
  await holdKey(page, 'a', 5, 50)
  expect(Date.now() - start).toBeGreaterThanOrEqual(200)
  await expect(page.locator('#field')).toHaveValue('aaaaa')
})

test('paintedAt resolves at the frame after a selector first matches', async ({ page }) => {
  const painted = paintedAt(page, '#list li.late')
  const added = await page.evaluate(
    () =>
      new Promise<number>((resolve) =>
        setTimeout(() => {
          const at = performance.now()
          document.getElementById('list')!.innerHTML = '<li class="late"></li>'
          resolve(at)
        }, 50),
      ),
  )
  const at = await painted
  expect(at).toBeGreaterThanOrEqual(added)
  // A selector that already matches resolves at the next frame.
  expect(await paintedAt(page, '#list li.late')).toBeGreaterThan(at)
})

test('responseEnd is the latest matching request’s end, NaN when none', async ({ page }) => {
  expect(Number.isNaN(await responseEnd(page, 'nothing-here'))).toBe(true)
  await page.route('**/reply/**', (route) => route.fulfill({ body: 'ok' }))
  await page.goto('http://story-harness.test/reply/page')
  await page.evaluate(() => fetch('/reply/one').then((r) => r.text()))
  const first = await responseEnd(page, '/reply/one')
  await page.evaluate(() => fetch('/reply/one?again').then((r) => r.text()))
  expect(first).toBeGreaterThan(0)
  expect(await responseEnd(page, '/reply/one')).toBeGreaterThan(first)
})

test('longTasks throws on an unknown mark', async ({ page }) => {
  await expect(longTasks(page, 'story:missing')).rejects.toThrow(
    /no performance mark story:missing/,
  )
})

test('longTasks throws when observeLongTasks was not called', async ({ browser }) => {
  const page = await browser.newPage()
  await page.goto(page_)
  await expect(longTasks(page)).rejects.toThrow(/observeLongTasks was not called/)
  await page.close()
})

test('mountedRows and maxMountedRows throw with no hook and no selector', async ({ page }) => {
  await expect(mountedRows(page)).rejects.toThrow(/no window.__storyHarness and no selector/)
  await expect(maxMountedRows(page, async () => {})).rejects.toThrow(
    /no window.__storyHarness and no selector/,
  )
})

test('maxMountedRows reads the hook', async ({ page }) => {
  await page.evaluate(() => {
    ;(window as any).__storyHarness = { rows: () => 4 }
  })
  expect(await maxMountedRows(page, async () => {})).toBe(4)
})

test('maxMountedRows rethrows the error run throws', async ({ page }) => {
  await expect(
    maxMountedRows(
      page,
      async () => {
        throw new Error('boom')
      },
      '#list li',
    ),
  ).rejects.toThrow('boom')
})

test('maxMountedRows rethrows run’s error when run navigated away', async ({ page }) => {
  await expect(
    maxMountedRows(
      page,
      async () => {
        await page.goto(page_)
        throw new Error('boom')
      },
      '#list li',
    ),
  ).rejects.toThrow('boom')
})

test('maxMountedRows names the missing sampler after a navigation', async ({ page }) => {
  await expect(maxMountedRows(page, () => page.goto(page_), '#list li')).rejects.toThrow(
    /sampler is gone/,
  )
})

test('scrollSteps rejects when the selector matches nothing', async ({ page }) => {
  await expect(scrollSteps(page, '#nothing', 1, 10)).rejects.toThrow(/no element matches #nothing/)
})

test('budget, record, recordBrowser and noLongTasks write one report', async ({ page }) => {
  // The module's recorder is made on first use, so it reads this env var then.
  const dir = mkdtempSync(join(tmpdir(), 'story-perf-'))
  const file = join(dir, 'story-perf.json')
  const saved = process.env.STORY_PERF_FILE
  process.env.STORY_PERF_FILE = file
  try {
    budget('firstRowsMs', 10, 100)
    record('rowsMounted', 42)
    await recordBrowser(page)
    const report = JSON.parse(readFileSync(file, 'utf8'))
    expect(report.verdicts.firstRowsMs).toEqual({ value: 10, limit: 100, slack: 1, pass: true })
    expect(report.values).toEqual({ firstRowsMs: 10, rowsMounted: 42 })
    expect(report.userAgent).toMatch(/Chrome/)
    // One long task the page runs itself, between two marks.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) =>
          setTimeout(() => {
            performance.mark('story:walk-start')
            const end = performance.now() + 80
            while (performance.now() < end) {
              // busy: one long task
            }
            performance.mark('story:walk-end')
            resolve()
          }),
        ),
    )
    await expect
      .poll(async () => (await longTasks(page, 'story:walk-start', 'story:walk-end')).length)
      .toBe(1)
    await noLongTasks(page, 'walk', 'story:walk-start', 'story:walk-end')
    const after = JSON.parse(readFileSync(file, 'utf8'))
    expect(after.values['walk: long task durations (ms)']).toHaveLength(1)
    expect(after.values['walk: long task durations (ms)'][0]).toBeGreaterThan(50)
    expect(after.verdicts['walk: long tasks over 50 ms']).toEqual({
      value: 1,
      limit: 0,
      slack: 1,
      pass: false,
    })
  } finally {
    if (saved === undefined) delete process.env.STORY_PERF_FILE
    else process.env.STORY_PERF_FILE = saved
    rmSync(dir, { recursive: true, force: true })
  }
})

// A perf story in a fake static build: it finishes, is skipped by the baseline
// check, and then re-renders, so its first metrics hook is replaced.
const PERF_STORY = `<!doctype html><body><script>
const listeners = {}
window.__STORYBOOK_PREVIEW__ = {
  channel: { on: (n, f) => { (listeners[n] ||= []).push(f) } },
  currentRender: { story: { parameters: { screenshot: { skip: 'perf' } } } },
}
const id = new URLSearchParams(location.search).get('id')
setTimeout(() => (listeners.storyFinished ?? []).forEach((f) => f({ storyId: id, status: 'success' })), 10)
window.__storyHarness = { rows: () => 0, ready: new Promise(() => {}), marks: () => [] }
setTimeout(() => {
  window.__storyHarness = { rows: () => 3, ready: Promise.resolve(1), marks: () => [] }
}, 300)
</script></body>`

test('openPerfStory waits on the hook of a re-rendered story', async ({ page }) => {
  await page.route('http://story-harness.test/iframe.html*', (route) =>
    route.fulfill({ contentType: 'text/html', body: PERF_STORY }),
  )
  await openPerfStory(page, 'http://story-harness.test', 'x--perf', 5_000)
  expect(await mountedRows(page)).toBe(3)
})

test('openPerfStory throws when no story:first-rows lands in time', async ({ page }) => {
  await page.route('http://story-harness.test/iframe.html*', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: PERF_STORY.replace('Promise.resolve(1)', 'new Promise(() => {})'),
    }),
  )
  await expect(openPerfStory(page, 'http://story-harness.test', 'x--perf', 1_000)).rejects.toThrow(
    /no story:first-rows within 1 s/,
  )
})
