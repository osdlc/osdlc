/**
 * The one search and filter every surface uses: the CLI's `list` and
 * `query`, the terminal UI's entry line and the web view's toolbar.
 *
 * Browser-safe: it imports only the matcher, so the page can use it.
 */

import { matchEntry, terms as splitTerms, type Mode } from '@osdlc/system-model/match'
import type { Task } from '@osdlc/system-model/detect'

/**
 * What to keep. Every field is optional; an empty filter keeps every task in
 * catalog order.
 */
export interface TaskFilter {
  /** The search text. Terms are ANDed; a leading `'` makes one term exact. */
  query?: string | undefined
  /** `fuzzy` (the default) matches letters in order; `exact` matches substrings. */
  mode?: Mode | undefined
  /** Only tasks that run until stopped: dev servers, watchers. */
  servicesOnly?: boolean | undefined
  /** Only tasks a file declares, not ones inferred from a convention. */
  declaredOnly?: boolean | undefined
  /**
   * Only tasks declared at most this many directories below the root (see
   * {@link sourceDepth}). The web view calls this Scope.
   */
  maxDepth?: number | undefined
  /** Only these runners. */
  runners?: readonly string[] | undefined
}

/** One kept task, with its score and the offsets the chain matched at. */
export interface TaskHit {
  task: Task
  /** 0 when there is no query. */
  score: number
  /** Offsets into `task.path.join(' ')`, when the chain is what matched. */
  labelHits: number[] | null
}

/**
 * How deep in the repository a task is declared: the number of directories
 * above its source file. `justfile` at the root is 0;
 * `apps/web/client/moon.yml` is 3.
 */
export function sourceDepth(task: Pick<Task, 'source'>): number {
  const at = task.source.lastIndexOf('/')
  return at === -1 ? 0 : task.source.slice(0, at).split('/').length
}

/** Whether `task` passes every part of `filter` except the query. */
export function keepsTask(task: Task, filter: TaskFilter): boolean {
  if (filter.servicesOnly === true && !task.persistent.value) return false
  if (filter.declaredOnly === true && task.origin !== 'declared') return false
  if (filter.maxDepth !== undefined && sourceDepth(task) > filter.maxDepth) return false
  if (filter.runners !== undefined && !filter.runners.includes(task.runner)) return false
  return true
}

/**
 * The tasks of `reports` that pass `filter`. With a query they are ranked
 * best first, and equal scores keep catalog order. Without one they stay in
 * catalog order.
 */
export function filterTasks(
  reports: readonly { tasks: readonly Task[] }[],
  filter: TaskFilter = {},
): TaskHit[] {
  const queryTerms = splitTerms(filter.query ?? '')
  const mode = filter.mode ?? 'fuzzy'
  const hits: TaskHit[] = []
  for (const report of reports) {
    for (const task of report.tasks) {
      if (!keepsTask(task, filter)) continue
      if (queryTerms.length === 0) {
        hits.push({ task, score: 0, labelHits: null })
        continue
      }
      const m = matchEntry(task, queryTerms, mode)
      if (m !== null) hits.push({ task, score: m.score, labelHits: m.labelHits })
    }
  }
  // Stable, so equal scores keep the catalog's own order.
  if (queryTerms.length > 0) hits.sort((a, b) => b.score - a.score)
  return hits
}

/** Whether `filter` has any query terms. */
export function hasQuery(filter: TaskFilter): boolean {
  return splitTerms(filter.query ?? '').length > 0
}
