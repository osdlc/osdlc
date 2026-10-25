import type { Catalog, RunnerCacheState, Task } from '@osdlc/system-model/detect'
import type { Mode } from '@osdlc/system-model/match'

import type { Unknown } from '../core/unknowns.ts'

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
 * What `way list --json` answers: the catalog, with where each runner's rows
 * came from and what could not be read.
 */
export type CatalogDocument = Catalog & {
  cache?: RunnerCacheState[]
  unknowns?: Unknown[]
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
  catalog: CatalogDocument | null
  runner: string
  query: string
  mode: Mode
  /** Show only services — tasks that run until you stop them. */
  servicesOnly: boolean
  declaredOnly: boolean
  /** `runners.order` from config, or a drag made in this page. */
  runnerOrder: string[]
  /**
   * The layer that set `runners.order`, as `way config list` names it. A
   * project's order wins over a user's.
   */
  runnerOrderSource: string
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
   * Whether a trust grant would collect the withheld runners: the catalog
   * says a runner is withheld because the repository is not trusted. False
   * when execution is off for another reason, such as `--no-exec`, where a
   * grant would change nothing.
   */
  trustable: boolean
  /**
   * Where each runner's rows came from, one entry per selected runner. The
   * first view may come from the store, so a row on screen can be older than
   * the clock beside it. `renderStatus` says so.
   */
  cache: RunnerCacheState[]
  /** What the catalog could not read, each with the label every surface shows. */
  unknowns: Unknown[]
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
  runnerOrderSource: 'default',
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
  unknowns: [],
  focusedId: null,
}

/** Every task in the catalog, in catalog order. */
export function allTasks(): Task[] {
  return (state.catalog?.reports ?? []).flatMap((r) => r.tasks)
}
