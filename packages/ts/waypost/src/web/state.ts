import type { Catalog, RunnerCacheState, Task } from '@osdlc/system-model/detect'
import type { Mode } from '@osdlc/system-model/match'

export const SEP = ' › ' // the chain separator shown between segments
export const OPEN = '▾' // twisty, expanded
export const SHUT = '▸' // twisty, collapsed

/** The pseudo-runner id for the combined, all-runners tab. */
export const ALL = 'all'

/**
 * Every static element this page touches is declared in `page.html` and never
 * removed, so a lookup that fails is a bug in the markup, not a runtime case
 * to handle — the `!` reflects that invariant rather than hiding a real null.
 */
export function $(id: string): HTMLElement {
  return document.getElementById(id)!
}

/**
 * A ranked search hit, or a plain leaf under a tree group: `score`/`labelHits`
 * are meaningless (0 / null) once a query is empty, but every row carries the
 * same shape so the render path does not fork on whether one is active.
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
   * Whether the server says a trust grant is what would collect the withheld
   * runners. False when execution is off for some other reason — a config file
   * said so — in which case offering to trust the repository would be a wrong
   * instruction, since trusting it would change nothing.
   */
  trustable: boolean
  /**
   * Where each runner's rows came from, as the server read it — one entry per
   * selected runner. The server may answer the first request out of its store
   * so the page appears at once, which means a row on screen can be older than
   * the clock beside it; this is what says which, and `renderStatus` shows it.
   */
  cache: RunnerCacheState[]
  /**
   * The row keyboard focus is on inside the results list, held as the task's
   * `id` rather than its position. render() rebuilds #out wholesale on a
   * resize, a filter change and the 15s poll, so a position would name a
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
    localStorage.setItem('waypost:theme', choice)
  } catch {
    /* private window */
  }
}

/** The saved theme choice, or null when there is none — the system default stands. */
export function restoreTheme(): 'light' | 'dark' | null {
  try {
    const saved = localStorage.getItem('waypost:theme')
    if (saved === 'light' || saved === 'dark') return saved
  } catch {
    /* private window: the system default is a fine fallback */
  }
  return null
}

export function persistRunnerOrder(order: string[]): void {
  try {
    localStorage.setItem('waypost:runner-order', JSON.stringify(order))
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
    localStorage.removeItem('waypost:runner-order')
  } catch {
    /* private window */
  }
  state.runnerOrder = []
}

/** The saved runner arrangement, or `[]` when there is none — alphabetical stands. */
export function restoreRunnerOrder(): string[] {
  try {
    const savedOrder: unknown = JSON.parse(localStorage.getItem('waypost:runner-order') ?? '[]')
    if (Array.isArray(savedOrder))
      return savedOrder.filter((r): r is string => typeof r === 'string')
  } catch {
    /* private window or corrupt value: alphabetical is fine */
  }
  return []
}
