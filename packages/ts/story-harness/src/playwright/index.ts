/**
 * Host-side helpers for interaction and perf specs against a static Storybook
 * build. Perf specs call `preparePage(page, { clock: false })`: Playwright's
 * fixed clock also fakes `performance.now()`, timers and
 * `requestAnimationFrame`.
 */
import { setTimeout as sleep } from 'node:timers/promises'
import type { Page } from '@playwright/test'
import { createPerfRecorder, type PerfRecorder } from './budget.ts'
import { openStory } from '../runner/story.ts'

export {
  DEFAULT_SETTLE_MS,
  NARROW_VIEWPORT,
  openStory,
  preparePage,
  START_TIME,
  storyUrl,
  THEMES,
  VIEWPORT,
  type OpenStoryOptions,
  type PreparePageOptions,
  type ShotParameters,
  type Theme,
} from '../runner/story.ts'
export type { PerfReport, Verdict } from './budget.ts'
export { defineStoryConfig, type StoryConfigOptions } from './config.ts'

export interface LongTask {
  startTime: number
  duration: number
}

/**
 * Install a buffered `PerformanceObserver` for `longtask` before any page
 * script. Call before the first navigation. Chromium reports the page's own
 * tasks (input, timers, frames), not work run by `page.evaluate`.
 */
export async function observeLongTasks(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const tasks: { startTime: number; duration: number }[] = []
    ;(window as any).__storyHarnessLongTasks = tasks
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries())
          tasks.push({ startTime: e.startTime, duration: e.duration })
      }).observe({ type: 'longtask', buffered: true })
    } catch {
      // No longtask support: the list stays empty.
    }
  })
}

/**
 * Long tasks that overlap the span from the latest `fromMark` to the latest
 * `toMark`, so a task that sets a mark counts. An omitted mark leaves that
 * end open.
 */
export async function longTasks(
  page: Page,
  fromMark?: string,
  toMark?: string,
): Promise<LongTask[]> {
  return page.evaluate(
    ([from, to]) => {
      const tasks = (window as any).__storyHarnessLongTasks as LongTask[] | undefined
      if (!tasks) throw new Error('observeLongTasks was not called before navigation')
      const at = (name: string | undefined, open: number) => {
        if (!name) return open
        const marks = performance.getEntriesByName(name, 'mark')
        if (marks.length === 0) throw new Error(`no performance mark ${name}`)
        return marks[marks.length - 1]!.startTime
      }
      const lo = at(from, 0)
      const hi = at(to, Infinity)
      return tasks.filter((t) => t.startTime + t.duration >= lo && t.startTime <= hi)
    },
    [fromMark, toMark] as const,
  )
}

/**
 * Rows mounted now: `window.__storyHarness.rows()` in a story, or the count of
 * `selector` in an app page, which has no hook.
 */
export async function mountedRows(page: Page, selector?: string): Promise<number> {
  return page.evaluate((sel) => {
    const hook = (window as any).__storyHarness
    if (sel) return document.querySelectorAll(sel).length
    if (!hook) throw new Error('no window.__storyHarness and no selector')
    return hook.rows() as number
  }, selector)
}

/** The most rows mounted at once, sampled every frame while `run` executes. */
export async function maxMountedRows(
  page: Page,
  run: () => Promise<unknown>,
  selector?: string,
): Promise<number> {
  await page.evaluate((sel) => {
    const w = window as any
    const count = sel
      ? () => document.querySelectorAll(sel).length
      : () => {
          if (!w.__storyHarness) throw new Error('no window.__storyHarness and no selector')
          return w.__storyHarness.rows() as number
        }
    const sampler = { count, max: count(), on: true }
    w.__storyHarnessSampler = sampler
    const tick = () => {
      if (!sampler.on) return
      sampler.max = Math.max(sampler.max, count())
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }, selector)
  // Read the count once more, in case `run` ended mid-frame.
  const stop = () =>
    page.evaluate(() => {
      const sampler = (window as any).__storyHarnessSampler
      if (!sampler) throw new Error('maxMountedRows: the sampler is gone (did run navigate?)')
      sampler.on = false
      return Math.max(sampler.max, sampler.count()) as number
    })
  try {
    await run()
  } catch (error) {
    await stop().catch(() => {})
    throw error
  }
  return stop()
}

/** Press `key` `presses` times, `intervalMs` apart start to start, as a held key repeats. */
export async function holdKey(
  page: Page,
  key: string,
  presses: number,
  intervalMs: number,
): Promise<void> {
  for (let i = 0; i < presses; i++) {
    const start = Date.now()
    await page.keyboard.press(key)
    const rest = intervalMs - (Date.now() - start)
    if (rest > 0 && i < presses - 1) await sleep(rest)
  }
}

/** Scroll the first `selector` match down by `px`, `steps` times, one frame apart. */
export async function scrollSteps(
  page: Page,
  selector: string,
  steps: number,
  px: number,
): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await page.evaluate(
      ([sel, by]) =>
        new Promise<void>((resolve) => {
          const el = document.querySelector(sel)
          if (!el) throw new Error(`no element matches ${sel}`)
          el.scrollBy(0, by)
          requestAnimationFrame(() => resolve())
        }),
      [selector, px] as const,
    )
  }
}

/**
 * Resolves with `performance.now()` in the first animation frame after
 * `selector` matches: when a change reaches the screen, for a span measured
 * from a reply (`responseEnd`) or a mark. Call it before the action, then
 * await it. Not the frame's own timestamp, which can precede the change.
 * It never settles if `selector` never matches; the spec's timeout ends it.
 *
 * @experimental It may gain a timeout option.
 */
export function paintedAt(page: Page, selector: string): Promise<number> {
  return page.evaluate(
    (sel) =>
      new Promise<number>((resolve) => {
        const done = () => requestAnimationFrame(() => resolve(performance.now()))
        if (document.querySelector(sel)) return done()
        const mo = new MutationObserver(() => {
          if (!document.querySelector(sel)) return
          mo.disconnect()
          done()
        })
        mo.observe(document, { childList: true, subtree: true, attributes: true })
      }),
    selector,
  )
}

/**
 * `responseEnd` of the latest resource whose URL holds `urlPart`, or `NaN` when none.
 *
 * @experimental It pairs with {@link paintedAt}, whose shape may change.
 */
export async function responseEnd(page: Page, urlPart: string): Promise<number> {
  return page.evaluate((part) => {
    const hits = performance
      .getEntriesByType('resource')
      .filter((e) => e.name.includes(part)) as PerformanceResourceTiming[]
    return hits.length ? hits[hits.length - 1]!.responseEnd : NaN
  }, urlPart)
}

let recorder: PerfRecorder | undefined
const perf = () => (recorder ??= createPerfRecorder())

/**
 * Record a verdict for `value` against `limit` in `test-results/story-perf.json`.
 * Under `PW_PERF_ASSERT=1` it is also an `expect` against `limit × PW_PERF_SLACK`.
 */
export function budget(name: string, value: number, limit: number): void {
  perf().budget(name, value, limit)
}

/** Record a value with no budget in the same report. */
export function record(name: string, value: unknown): void {
  perf().record(name, value)
}

/** Write the page's browser user agent into the report. */
export async function recordBrowser(page: Page): Promise<void> {
  perf().setUserAgent(await page.evaluate(() => navigator.userAgent))
}

/**
 * Open a perf story and wait for the metrics hook's first rows. A perf story
 * sets `screenshot.skip`, so `openStory` returns without checking it; this
 * checks its errors. Throws when the story failed, or when no
 * `story:first-rows` lands within `timeoutMs`.
 *
 * @experimental New; its shape may change.
 */
export async function openPerfStory(
  page: Page,
  baseURL: string,
  id: string,
  timeoutMs = 30_000,
): Promise<void> {
  await openStory(page, baseURL, id, 'light')
  const errors = await page.evaluate(() => (window as any).__STORY_SHOTS_ERRORS__ as string[])
  if (errors.length > 0)
    throw new Error(`story ${id} is not ready, it failed:\n${errors.join('\n')}`)
  const ready = await page.evaluate(
    (ms) =>
      new Promise<boolean>((resolve) => {
        const end = Date.now() + ms
        const timer = setTimeout(() => resolve(false), ms)
        // A story that re-renders calls storyMetrics again, and the earlier
        // hook's `ready` never settles, so follow whichever hook is current.
        let waitingOn: unknown
        let done = false
        const poll = () => {
          if (done) return
          const hook = (window as any).__storyHarness
          if (hook && hook !== waitingOn) {
            waitingOn = hook
            void hook.ready.then(() => {
              if ((window as any).__storyHarness !== hook) return
              done = true
              clearTimeout(timer)
              resolve(true)
            })
          }
          if (Date.now() < end) setTimeout(poll, 50)
        }
        poll()
      }),
    timeoutMs,
  )
  if (!ready)
    throw new Error(`story ${id} is not ready: no story:first-rows within ${timeoutMs / 1000} s`)
}

/**
 * The long tasks between two marks, recorded as `<name>: long task durations
 * (ms)` and budgeted at none as `<name>: long tasks over 50 ms`.
 *
 * @experimental New; its shape may change.
 */
export async function noLongTasks(
  page: Page,
  name: string,
  fromMark: string,
  toMark: string,
): Promise<void> {
  const tasks = await longTasks(page, fromMark, toMark)
  record(
    `${name}: long task durations (ms)`,
    tasks.map((t) => Math.round(t.duration)),
  )
  budget(`${name}: long tasks over 50 ms`, tasks.length, 0)
}
