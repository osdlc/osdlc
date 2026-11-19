/**
 * The sweep: repo-cleaner's, with the active adapters' `annotate`s chained
 * into it, then each adapter's own rows.
 */

import { realpathSync } from 'node:fs'

import { KINDS, sweep, type Annotate, type Sweep, type SweepOptions } from '@osdlc/repo-cleaner'

import { HostCleanerError, type HostAdapter, type HostContext, type HostRow } from './adapter.ts'
import type { HostOptions } from './options.ts'
import { chainAnnotate, makeContext, resolveAdapters, type AdapterReport } from './registry.ts'

export type HostSweepOptions = SweepOptions &
  HostOptions & {
    /** Add the repositories the adapters know to the targets. Default true. */
    discover?: boolean | undefined
  }

export interface HostSweep {
  /** repo-cleaner's sweep, annotated. With no adapter active it is what `repo-cleaner` reports. */
  repo: Sweep
  adapters: AdapterReport[]
  rows: HostRow[]
}

/** Run `first`, then `second`, over the rows. */
export function both(
  first: Annotate | undefined,
  second: Annotate | undefined,
): Annotate | undefined {
  if (first === undefined || second === undefined) return first ?? second
  return (repo, rows) => second(repo, first(repo, rows))
}

function checkRow(adapter: string, row: HostRow): void {
  const bad = (why: string): never => {
    throw new HostCleanerError('bad-row', `adapter ${adapter}: row ${row.id}: ${why}`)
  }
  if (row.adapter !== adapter) bad(`it names adapter ${row.adapter}`)
  if ((KINDS as readonly string[]).includes(row.kind)) bad(`kind ${row.kind} is repo-cleaner's`)
  if (row.name === '' || row.id !== `${row.kind}:${row.name}`) bad('id is not <kind>:<name>')
}

/**
 * The rows the active adapters own now. An adapter whose `gather` throws adds
 * no rows and has the error set on its report; a malformed row or an id two
 * adapters share is refused, since an adapter cannot be trusted to name rows
 * it does not own.
 *
 * @throws HostCleanerError (`bad-row`)
 */
export function gatherHostRows(
  active: readonly HostAdapter[],
  reports: AdapterReport[],
  ctx: HostContext,
): HostRow[] {
  const rows: HostRow[] = []
  const seen = new Map<string, string>()
  for (const adapter of active) {
    if (adapter.gather === undefined) continue
    let gathered: HostRow[]
    try {
      gathered = adapter.gather(ctx)
    } catch (err) {
      const report = reports.find((r) => r.name === adapter.name)
      if (report !== undefined) report.error = err instanceof Error ? err.message : String(err)
      continue
    }
    for (const row of gathered) {
      checkRow(adapter.name, row)
      const owner = seen.get(row.id)
      if (owner !== undefined) {
        throw new HostCleanerError(
          'bad-row',
          `row ${row.id} is gathered by ${owner} and ${adapter.name}`,
        )
      }
      seen.set(row.id, adapter.name)
      rows.push(row)
    }
  }
  return rows
}

/** The repositories the active adapters know, which an adapter that fails names none of. */
function discovered(active: readonly HostAdapter[], ctx: HostContext): string[] {
  return active.flatMap((adapter) => {
    try {
      return adapter.discover?.(ctx) ?? []
    } catch {
      return []
    }
  })
}

/** `paths` once each, by real path, in order. */
function dedupe(paths: readonly string[]): string[] {
  const seen = new Set<string>()
  return paths.filter((p) => {
    let key = p
    try {
      key = realpathSync(p)
    } catch {
      // A path that does not resolve is its own key; the sweep reports it.
    }
    return !seen.has(key) && seen.add(key) !== undefined
  })
}

/** The roots of the repositories a sweep read. */
export function rootsOf(sweepResult: Sweep): string[] {
  return sweepResult.repos.flatMap((r) => (r.repo === null ? [] : [r.repo.root]))
}

/**
 * Sweep `targets` as repo-cleaner does, with the adapters' verdicts chained
 * into it, and gather the adapters' own rows. Deletes nothing.
 *
 * @throws RepoCleanerError for options repo-cleaner refuses, and
 *   HostCleanerError for an unknown adapter name or a malformed host row.
 */
export function hostSweep(targets: readonly string[], opts: HostSweepOptions = {}): HostSweep {
  const { active, reports } = resolveAdapters(opts.adapters ?? [], makeContext(opts, targets), opts)
  const known = opts.discover === false ? [] : discovered(active, makeContext(opts, targets))
  const all = [...targets, ...known]
  const repo = sweep(
    dedupe(targets.length === 0 && known.length > 0 ? [opts.cwd ?? process.cwd(), ...known] : all),
    {
      ...opts,
      annotate: both(opts.annotate, chainAnnotate(active)),
    },
  )
  const rows = gatherHostRows(active, reports, makeContext(opts, rootsOf(repo)))
  return { repo, adapters: reports, rows }
}
