/**
 * Which adapters run: detection in a fixed order, the selection flags, and the
 * hooks of the active ones composed into the single hook repo-cleaner takes.
 */

import { spawnRunner } from '@osdlc/command-seam'
import { defaultProcessProbe, type Annotate, type RemoveWorktree } from '@osdlc/repo-cleaner'

import { HostCleanerError, type HostAdapter, type HostConfig, type HostContext } from './adapter.ts'
import type { HostOptions } from './options.ts'

export type SkipReason = 'not-detected' | 'not-selected' | 'excluded' | 'detect-failed'

/** What happened to one adapter in a run, for the report. */
export interface AdapterReport {
  name: string
  status: 'active' | 'skipped'
  /** Why it was skipped. */
  reason?: SkipReason
  /** The detail behind `detect-failed`, or a `gather` that threw. */
  error?: string
}

const NO_CONFIG: HostConfig = { adapters: {} }

/** The context an adapter gets, from the caller's options. `targets` is what the caller knows now. */
export function makeContext(opts: HostOptions, targets: readonly string[]): HostContext {
  return {
    git: opts.git ?? spawnRunner('git'),
    command: opts.command ?? ((binary) => spawnRunner(binary)),
    probe: opts.probe ?? defaultProcessProbe(),
    now: opts.now ?? (() => new Date()),
    config: opts.config ?? NO_CONFIG,
    targets,
    harnesses: opts.harnesses ?? null,
  }
}

export interface Selection {
  /** Run only these, by name. Absent: every adapter. An empty list runs none. */
  adapter?: readonly string[] | undefined
  /** Never run these. */
  noAdapter?: readonly string[] | undefined
}

/**
 * Detect each adapter in the order given and apply the selection. An adapter
 * that is not selected, is excluded, or does not detect itself adds nothing
 * and is reported as skipped. Naming an adapter that does not exist is
 * refused, since it is a typo that would otherwise skip silently.
 *
 * @throws HostCleanerError (`bad-input`) for a duplicate adapter name or a
 *   selection naming an unknown adapter.
 */
export function resolveAdapters(
  adapters: readonly HostAdapter[],
  ctx: HostContext,
  selection: Selection = {},
): { active: HostAdapter[]; reports: AdapterReport[] } {
  const names = adapters.map((a) => a.name)
  const dup = names.find((n, i) => names.indexOf(n) !== i)
  if (dup !== undefined) throw new HostCleanerError('bad-input', `two adapters are named ${dup}`)
  for (const n of [...(selection.adapter ?? []), ...(selection.noAdapter ?? [])]) {
    if (!names.includes(n)) {
      throw new HostCleanerError(
        'bad-input',
        `no adapter named ${n}; known: ${names.join(', ') || '(none)'}`,
      )
    }
  }
  const active: HostAdapter[] = []
  const reports: AdapterReport[] = []
  for (const adapter of adapters) {
    const skip = (reason: SkipReason, error?: string): void => {
      reports.push({ name: adapter.name, status: 'skipped', reason, ...(error && { error }) })
    }
    if (selection.noAdapter?.includes(adapter.name)) skip('excluded')
    else if (selection.adapter !== undefined && !selection.adapter.includes(adapter.name)) {
      skip('not-selected')
    } else {
      let found: boolean
      try {
        found = adapter.detect(ctx)
      } catch (err) {
        skip('detect-failed', err instanceof Error ? err.message : String(err))
        continue
      }
      if (found) {
        active.push(adapter)
        reports.push({ name: adapter.name, status: 'active' })
      } else skip('not-detected')
    }
  }
  return { active, reports }
}

/** The active adapters' `annotate`s as one, applied in run order; undefined when none has one. */
export function chainAnnotate(active: readonly HostAdapter[]): Annotate | undefined {
  const hooks = active.flatMap((a) => (a.annotate === undefined ? [] : [a.annotate]))
  if (hooks.length === 0) return undefined
  return (repo, rows) => hooks.reduce((acc, hook) => hook(repo, acc), rows)
}

/** The first active adapter's `removeWorktree` that claims a worktree decides its removal. */
export function chainRemoveWorktree(active: readonly HostAdapter[]): RemoveWorktree | undefined {
  const hooks = active.flatMap((a) => (a.removeWorktree === undefined ? [] : [a.removeWorktree]))
  if (hooks.length === 0) return undefined
  return (row, ctx) => {
    for (const hook of hooks) {
      const removal = hook(row, ctx)
      if (removal !== null) return removal
    }
    return null
  }
}
