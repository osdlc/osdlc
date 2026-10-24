import type { Catalog, RunnerCacheState, Task } from '@osdlc/system-model/detect'
import type { Mode } from '@osdlc/system-model/match'

export const SEP = ' › ' // the chain separator shown between segments
export const OPEN = '▾' // twisty, expanded
export const SHUT = '▸' // twisty, collapsed

/** The tab id for the combined tab that shows every runner. */
export const ALL = 'all'

/**
 * Every static element this page uses is declared in `page.html` and never
 * removed, so a failed lookup is a bug in the markup, not a case to handle at
 * runtime. The `!` states that rule rather than hiding a real null.
 */
export function $(id: string): HTMLElement {
  return document.getElementById(id)!
}

/**
 * A ranked search hit, or a plain leaf under a tree group. `score` and
 * `labelHits` are 0 and null when the query is empty, but every row has the
 * same shape so rendering does not branch on whether a query is active.
 */
export interface Row {
  entry: Task
  score: number
  labelHits: number[] | null
}

/** One level of the call-chain tree rebuilt on every render from `Row`s. */
export interface TreeNode {
  kids: Map<string, TreeNode>
  leaves: Row[]
  count: number
}

export interface AppState {
  catalog: Catalog | null
  runner: string
  query: string
  mode: Mode
  /** Show only services — tasks that run until you stop them. */
  servicesOnly: boolean
  declaredOnly: boolean
  runnerOrder: string[]
  depth: number
  // null until the first catalog arrives; then a Set of enabled runner ids.
  enabled: Set<string> | null
  collapsed: Set<string>
  allCollapsed: boolean
  fingerprint: string
  mainWidth: number
  knownRunners: Set<string>
  checkedAt: number | string
  loading: boolean
  /**
   * Whether the server says a trust grant would collect the withheld runners.
   * False when execution is off for another reason, such as a config file. Then
   * trusting the repository would change nothing, so the page does not offer it.
   */
  trustable: boolean
  /**
   * Where each runner's rows came from, as the server reports it, one entry per
   * selected runner. The server may answer the first request from its store so
   * the page appears at once, so a row on screen can be older than the clock
   * beside it. This records which rows are, and `renderStatus` shows it.
   */
  cache: RunnerCacheState[]
  /**
   * The row in the results list that has keyboard focus, held as the task's
   * `id` rather than its position. render() rebuilds all of #out on a resize,
   * a filter change and the 15s poll, so a position would point at a
   * different row after any of those.
   *
   * null means focus is not in the list, which also makes the enter-target
   * marking revert to the top hit.
   */
  focusedId: string | null
}

export const state: AppState = {
  catalog: null,
  runner: ALL,
  query: '',
  mode: 'fuzzy',
  servicesOnly: false,
  declaredOnly: false,
  runnerOrder: [],
  depth: 99,
  enabled: null,
  collapsed: new Set(),
  allCollapsed: false,
  fingerprint: '',
  mainWidth: 0,
  knownRunners: new Set(),
  checkedAt: Date.now(),
  loading: false,
  trustable: false,
  cache: [],
  focusedId: null,
}

// ------------------------------------------------------------ persistence

export function persistTheme(choice: string): void {
  try {
    localStorage.setItem('wayfinder:theme', choice)
  } catch {
    /* private window */
  }
}

/** The saved theme choice, or null when there is none — the system default stands. */
export function restoreTheme(): 'light' | 'dark' | null {
  try {
    const saved = localStorage.getItem('wayfinder:theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* private window: the system default is a fine fallback */
  }
  return null
}

export function persistRunnerOrder(order: string[]): void {
  try {
    localStorage.setItem('wayfinder:runner-order', JSON.stringify(order))
  } catch {
    /* private window */
  }
}

/**
 * Drop the saved arrangement, so the configured order applies again.
 *
 * Once a tab has been dragged, `runners.order` from the project config can
 * never take effect again in this browser. This is the way back.
 */
export function clearRunnerOrder(): void {
  try {
    localStorage.removeItem('wayfinder:runner-order')
  } catch {
    /* private window */
  }
  state.runnerOrder = []
}

/** The saved runner arrangement, or `[]` when there is none — alphabetical stands. */
export function restoreRunnerOrder(): string[] {
  try {
    const savedOrder: unknown = JSON.parse(localStorage.getItem('wayfinder:runner-order') ?? '[]')
    if (Array.isArray(savedOrder))
      return savedOrder.filter((r): r is string => typeof r === 'string')
  } catch {
    /* private window or corrupt value: alphabetical is fine */
  }
  return []
}
