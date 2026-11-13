/**
 * In-page helpers for stories. They run in the Storybook iframe: the perf
 * metrics hook and a seeded PRNG for fixture generators.
 */

export const MOUNT_MARK = 'story:mount'
export const FIRST_ROWS_MARK = 'story:first-rows'
/** Marks whose name starts with this are the story's metrics. */
export const MARK_PREFIX = 'story:'

/**
 * A deterministic PRNG (mulberry32): the same seed gives the same sequence of
 * floats in [0, 1) on every run.
 */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface StoryMark {
  name: string
  startTime: number
}

/** What a perf story exposes as `window.__storyHarness`. */
export interface StoryHarness {
  /** Rows the component has mounted now. */
  rows(): number
  /** Settles with the {@link FIRST_ROWS_MARK} mark's start time. */
  ready: Promise<number>
  /** Every mark whose name starts with {@link MARK_PREFIX}, in time order. */
  marks(): StoryMark[]
}

declare global {
  interface Window {
    __storyHarness?: StoryHarness
  }
}

export interface StoryMetricsOptions {
  /** A CSS selector for one row, or a function that counts mounted rows. */
  rows: string | (() => number)
}

/** The pending frame of the latest call's first-rows loop. */
let pendingFrame: number | undefined

/**
 * Call once in a perf story's setup. Marks `story:mount` now and
 * {@link FIRST_ROWS_MARK} on the first painted frame with rows (double
 * `requestAnimationFrame`), and exposes {@link StoryHarness} on `window`.
 * A second call stops the first call's loop; its `ready` never settles.
 */
export function storyMetrics(options: StoryMetricsOptions): StoryHarness {
  const { rows } = options
  const count = typeof rows === 'string' ? () => document.querySelectorAll(rows).length : rows

  // A re-rendered story measures afresh.
  if (pendingFrame !== undefined) cancelAnimationFrame(pendingFrame)
  pendingFrame = undefined
  performance.clearMarks(MOUNT_MARK)
  performance.clearMarks(FIRST_ROWS_MARK)
  performance.mark(MOUNT_MARK)

  const ready = new Promise<number>((resolve) => {
    const onFrame = () => {
      if (count() === 0) {
        pendingFrame = requestAnimationFrame(onFrame)
        return
      }
      pendingFrame = requestAnimationFrame(() => {
        pendingFrame = undefined
        resolve(performance.mark(FIRST_ROWS_MARK).startTime)
      })
    }
    pendingFrame = requestAnimationFrame(onFrame)
  })

  const harness: StoryHarness = {
    rows: count,
    ready,
    marks: () =>
      performance
        .getEntriesByType('mark')
        .filter((m) => m.name.startsWith(MARK_PREFIX))
        .map((m) => ({ name: m.name, startTime: m.startTime })),
  }
  window.__storyHarness = harness
  return harness
}
