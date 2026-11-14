/**
 * Story selection and page settling, shared by the baseline check and the
 * host-side helpers. Imports nothing but Playwright types: the container that
 * runs the baseline check installs only Playwright.
 */
import type { Page } from '@playwright/test'

export type Theme = 'light' | 'dark'
export const THEMES: readonly Theme[] = ['light', 'dark']

export const VIEWPORT = { width: 1440, height: 900 }
export const NARROW_VIEWPORT = { width: 1024, height: 720 }

/** Default wait after the story's `play` finishes, for fixture reads with simulated latency. */
export const DEFAULT_SETTLE_MS = 1500

/**
 * `parameters.screenshot` on a story or its meta.
 *
 * - `narrow`: also shoot at {@link NARROW_VIEWPORT}.
 * - `skip`: leave the story out of the baseline check; the string says why.
 * - `settleMs`: override the wait after `play`.
 */
export interface ShotParameters {
  narrow?: boolean
  skip?: string
  settleMs?: number
}

/** The part of a built Storybook's `index.json` that story selection reads. */
export interface StoryIndex {
  entries: Record<string, { type: string }>
}

export interface StoryFilter {
  /** Id prefixes to keep; empty keeps every story. */
  include?: readonly string[]
  /** Id prefixes to drop, applied after `include`. */
  exclude?: readonly string[]
  /** Substring the id must contain. */
  contains?: string | undefined
}

/**
 * Story ids from a built `index.json`, in index order. Docs entries are
 * dropped, then `include`, `exclude` and `contains` apply in that order.
 */
export function selectStories(index: StoryIndex, filter: StoryFilter = {}): string[] {
  const include = filter.include ?? []
  const exclude = filter.exclude ?? []
  return Object.entries(index.entries)
    .filter(([, entry]) => entry.type === 'story')
    .map(([id]) => id)
    .filter((id) => include.length === 0 || include.some((p) => id.startsWith(p)))
    .filter((id) => !exclude.some((p) => id.startsWith(p)))
    .filter((id) => !filter.contains || id.includes(filter.contains))
}

/** Splits a comma-separated list, dropping empty items. */
export function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * A story id ending in `-narrow` is shot at the narrow viewport only;
 * `parameters.screenshot.narrow` means "wide and narrow".
 */
export function isNarrowOnly(id: string): boolean {
  return id.endsWith('-narrow')
}

export function storyUrl(baseURL: string, id: string, theme: Theme): string {
  return `${baseURL}/iframe.html?id=${id}&viewMode=story&globals=theme:${theme}`
}

/** The clock's start for every story, so relative dates render the same on every run. */
export const START_TIME = new Date('2026-09-28T12:00:00Z')

export interface PreparePageOptions {
  /**
   * Install Playwright's clock at {@link START_TIME}. Default `true`. Perf
   * specs pass `false`: the clock also fakes `performance.now()`, timers and
   * `requestAnimationFrame`.
   */
  clock?: boolean
}

/**
 * Once per page, before the first navigation:
 *
 * - start the clock at {@link START_TIME} (it keeps running) unless
 *   `clock: false`, and seed `Math.random`, so relative dates, generated ids
 *   and random fixture latency render the same on every run;
 * - under the clock, rethrow an error from a timer callback so it is still a
 *   page error: the clock catches it and only logs it to the console;
 * - record Storybook's `storyFinished` event and its error events. A `play`
 *   that throws is only logged: the story still finishes with status
 *   `success`, so the error events are the only reliable signal.
 */
export async function preparePage(page: Page, options: PreparePageOptions = {}): Promise<void> {
  if (options.clock ?? true) {
    await page.clock.install({ time: START_TIME })
    await page.addInitScript(rethrowTimerErrors)
  }
  await page.addInitScript((STORY_ERROR_EVENTS) => {
    let seed = 0x2f6b1d
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed / 4294967296
    }
    let preview: any
    Object.defineProperty(window, '__STORYBOOK_PREVIEW__', {
      configurable: true,
      get: () => preview,
      set: (value) => {
        preview = value
        const errors: string[] = ((window as any).__STORY_SHOTS_ERRORS__ = [])
        value?.channel?.on('storyFinished', (event: unknown) => {
          ;(window as any).__STORY_SHOTS_FINISHED__ = event
        })
        for (const name of STORY_ERROR_EVENTS) {
          value?.channel?.on(name, (err: unknown) => {
            errors.push(`${name}: ${JSON.stringify(err).slice(0, 500)}`)
          })
        }
      },
    })
  }, STORY_ERROR_EVENTS)
}

/**
 * Init script, added after the clock's own, so it wraps the fake timers. An
 * error a callback throws is rethrown from a microtask, which the clock does
 * not fake, so it reaches the page as an uncaught error.
 */
function rethrowTimerErrors(): void {
  for (const name of ['setTimeout', 'setInterval', 'requestAnimationFrame']) {
    const timer = (window as any)[name]
    ;(window as any)[name] = (callback: unknown, ...rest: unknown[]) =>
      timer(
        typeof callback === 'function'
          ? (...args: unknown[]) => {
              try {
                callback(...args)
              } catch (err) {
                queueMicrotask(() => {
                  throw err
                })
              }
            }
          : callback,
        ...rest,
      )
  }
}

/** Storybook channel events that mean the story or its `play` failed. */
const STORY_ERROR_EVENTS = [
  'playFunctionThrewException',
  'unhandledErrorsWhilePlaying',
  'storyErrored',
  'storyThrewException',
]

interface StoryFinished {
  storyId: string
  status: 'success' | 'error'
}

/** The story's errors so far, as `preparePage` recorded them from Storybook's channel. */
export function storyErrors(page: Page): Promise<string[]> {
  return page.evaluate(() => ((window as any).__STORY_SHOTS_ERRORS__ ?? []) as string[])
}

export interface OpenStoryOptions {
  /** Wait after `play` when the story sets no `settleMs`. */
  settleMs?: number
  /** Called with the story's errors instead of throwing them. */
  onStoryError?: (message: string) => void
}

/**
 * Open one story and wait until it is ready to shoot: the story (and its
 * `play`) finished, fonts are loaded, the page's load reached network idle,
 * and the settle wait has passed. A request `play` starts after the page went
 * idle is covered only by the settle wait.
 * A failed story throws, unless `onStoryError` takes the errors.
 * Returns the story's `parameters.screenshot`; a story marked `skip` returns
 * at once, unchecked. The page must have been through {@link preparePage}.
 */
export async function openStory(
  page: Page,
  baseURL: string,
  id: string,
  theme: Theme,
  options: OpenStoryOptions = {},
): Promise<ShotParameters> {
  await page.goto(storyUrl(baseURL, id, theme))
  const finished = await page
    .waitForFunction(
      (storyId) => {
        const event = (window as any).__STORY_SHOTS_FINISHED__
        return event?.storyId === storyId ? event : false
      },
      id,
      { timeout: 60_000 },
    )
    .then((handle) => handle.jsonValue() as Promise<StoryFinished>)
  const params = await page.evaluate(
    () =>
      ((window as any).__STORYBOOK_PREVIEW__.currentRender.story?.parameters?.screenshot ??
        {}) as ShotParameters,
  )
  if (params.skip) return params
  const errors = await storyErrors(page)
  if (finished.status !== 'success' || errors.length > 0) {
    const message = `story ${id} failed:\n${errors.join('\n') || 'status ' + finished.status}`
    if (!options.onStoryError) throw new Error(message)
    options.onStoryError(message)
  }
  await page.evaluate(() => document.fonts.ready)
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(params.settleMs ?? options.settleMs ?? DEFAULT_SETTLE_MS)
  // Hover-only chrome must not depend on where the pointer was left.
  await page.mouse.move(0, 0)
  return params
}
