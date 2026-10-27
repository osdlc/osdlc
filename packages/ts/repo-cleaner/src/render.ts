/**
 * Rendering a sweep for a terminal, and for a program.
 *
 * The text report is columnar because it is read by eye across repositories:
 * the eye finds a column, and a line-per-item paragraph gives it nothing to
 * find. JSON carries everything the text report elides, including the facts
 * behind every verdict.
 */

import type { Receipt } from './receipt.ts'
import {
  emptyBucket,
  isUnfetched,
  summarize,
  type DuplicateCheckout,
  type RepoSweep,
  type SummaryBucket,
  type SweepItem,
  type SweepResult,
} from './types.ts'
import { hasBlockers } from './worktrees.ts'

/** Order categories consistently, whatever order they were gathered in. */
const CATEGORY_ORDER = ['local_branch', 'worktree', 'remote_branch'] as const

/** Delete first: it is what a reader is looking for. */
const CLASSIFICATION_ORDER = ['safe-to-delete', 'needs-investigation', 'safe-to-keep'] as const

const ACTION_LABEL: Record<string, string> = {
  'safe-to-delete': 'delete',
  'needs-investigation': 'review',
  'safe-to-keep': 'keep',
}

function pad(s: string, width: number): string {
  return s.length >= width ? s : s + ' '.repeat(width - s.length)
}

/** Shorten from the left, so the distinguishing tail of a path survives. */
function ellipsize(s: string, max: number): string {
  return s.length <= max ? s : '…' + s.slice(s.length - (max - 1))
}

/**
 * A row's authorizations for a report, e.g. `requires abandon-unmerged (drops 3
 * commits), confirm-open-pr`. Empty when the row needs none.
 */
export function requiresNote(item: Pick<SweepItem, 'requires' | 'facts'>): string {
  if (item.requires.length === 0) return ''
  const count = item.facts['unique_commits']
  const names = item.requires.map((name) =>
    name === 'abandon-unmerged' && typeof count === 'number'
      ? `${name} (drops ${count} commit${count === 1 ? '' : 's'})`
      : name,
  )
  return `requires ${names.join(', ')}`
}

function sortItems(items: readonly SweepItem[]): SweepItem[] {
  const categoryRank = (item: SweepItem): number => CATEGORY_ORDER.indexOf(item.category)
  const classRank = (item: SweepItem): number =>
    (CLASSIFICATION_ORDER as readonly string[]).indexOf(item.classification)
  return [...items].sort(
    (a, b) =>
      categoryRank(a) - categoryRank(b) || classRank(a) - classRank(b) || a.id.localeCompare(b.id),
  )
}

function repoHeader(sweep: RepoSweep): string {
  const name = sweep.repo?.root ?? sweep.path
  if (sweep.repo === null) return name
  const bits = [
    sweep.repo.slug,
    `default ${sweep.repo.mainBranch}`,
    sweep.repo.remote ?? 'no remote',
    isUnfetched(sweep.repo) ? 'not fetched' : null,
  ]
  return `${name}  (${bits.filter((b) => b !== null).join(', ')})`
}

/** One repository's rows, indented under its header. */
export function renderRepo(sweep: RepoSweep, opts: { keep?: boolean } = {}): string {
  const lines = [repoHeader(sweep)]
  if (sweep.error !== null) {
    lines.push(`  error: ${sweep.error}`)
    return lines.join('\n')
  }

  const shown = sortItems(sweep.items).filter(
    (item) => opts.keep === true || item.classification !== 'safe-to-keep',
  )
  if (shown.length === 0) {
    lines.push('  nothing to clean up')
    return lines.join('\n')
  }

  const idWidth = Math.min(38, Math.max(...shown.map((item) => ellipsize(item.id, 38).length)))
  const categoryWidth = Math.max(...shown.map((item) => item.category.length))
  for (const item of shown) {
    const action = ACTION_LABEL[item.classification] ?? item.classification
    const note = requiresNote(item)
    lines.push(
      `  ${pad(item.category, categoryWidth)}  ${pad(ellipsize(item.id, 38), idWidth)}  ${pad(action, 6)}  ${item.reason}${note ? `; ${note}` : ''}`,
    )
    // A blocked row has no commands; what to do about each blocker goes there instead.
    const detail = hasBlockers(item) ? item.investigationParts : item.commands
    for (const line of detail) lines.push(`  ${' '.repeat(categoryWidth)}  ${line}`)
  }
  return lines.join('\n')
}

function totals(result: SweepResult): SummaryBucket {
  const out = emptyBucket()
  for (const sweep of result.repos) {
    for (const bucket of Object.values(summarize(sweep.items))) {
      out.total += bucket.total
      out['safe-to-delete'] += bucket['safe-to-delete']
      out['safe-to-keep'] += bucket['safe-to-keep']
      out['needs-investigation'] += bucket['needs-investigation']
    }
  }
  return out
}

/** Thousands separators, fixed to one locale so the output does not move. */
function count(n: number): string {
  return n.toLocaleString('en-US')
}

/**
 * What the search cost, or null when nothing was searched — every entry
 * named a checkout outright.
 *
 * Worth a line because the numbers are how a person catches an entry
 * pointing at the wrong directory: thousands of directories read for three
 * repositories says the entry is a home directory, not a workspace.
 */
export function renderScan(result: SweepResult): string | null {
  const { scan } = result
  if (scan.containers === 0) return null
  const entries = `${scan.containers} ${scan.containers === 1 ? 'entry' : 'entries'}`
  const dirs = `${count(scan.directoriesScanned)} ${scan.directoriesScanned === 1 ? 'directory' : 'directories'}`
  const found = `${count(scan.checkoutsFound)} ${scan.checkoutsFound === 1 ? 'checkout' : 'checkouts'}`
  const line = `searched ${entries}: ${dirs} read, ${found} found.`
  if (scan.depthLimited === 0) return line
  return `${line} ${count(scan.depthLimited)} left unopened at the depth limit.`
}

/** The one-line verdict a person reads first, and often only. */
export function renderSummary(result: SweepResult): string {
  const counts = totals(result)
  const repos = `${result.repos.length} ${result.repos.length === 1 ? 'repository' : 'repositories'}`
  const errors = result.repos.filter((sweep) => sweep.error !== null).length
  const tail: string[] = []
  if (errors > 0) tail.push(`${errors} unreadable`)
  if (result.unresolved.length > 0) {
    tail.push(
      `${result.unresolved.length} ${result.unresolved.length === 1 ? 'entry' : 'entries'} unresolved`,
    )
  }
  const suffix = tail.length > 0 ? ` (${tail.join(', ')})` : ''
  return `${counts['safe-to-delete']} to delete, ${counts['needs-investigation']} to review, across ${repos}${suffix}.`
}

/** The "Duplicate checkouts" section, or null when there are none. */
function renderDuplicates(duplicates: readonly DuplicateCheckout[]): string | null {
  if (duplicates.length === 0) return null
  const lines = ['Duplicate checkouts']
  for (const { slug, roots } of duplicates) {
    lines.push(`  ${slug}`)
    for (const root of roots) lines.push(`    ${root}`)
  }
  return lines.join('\n')
}

/** The whole run as text: duplicate checkouts, a section per repository, then the summary. */
export function renderText(result: SweepResult, opts: { keep?: boolean } = {}): string {
  const duplicates = renderDuplicates(result.duplicates)
  const blocks = [
    ...(duplicates === null ? [] : [duplicates]),
    ...result.repos.map((sweep) => renderRepo(sweep, opts)),
  ]
  if (result.unresolved.length > 0) {
    const lines = ['unresolved']
    const width = Math.max(...result.unresolved.map((row) => row.entry.length))
    for (const row of result.unresolved) lines.push(`  ${pad(row.entry, width)}   ${row.reason}`)
    blocks.push(lines.join('\n'))
  }
  const scan = renderScan(result)
  blocks.push(scan === null ? renderSummary(result) : `${scan}\n${renderSummary(result)}`)
  return blocks.join('\n\n') + '\n'
}

/**
 * The whole run as JSON, facts included. `extra` adds top-level keys, such as
 * the path of a plan the run wrote.
 */
export function renderJson(result: SweepResult, extra: Record<string, unknown> = {}): string {
  return (
    JSON.stringify(
      {
        ...extra,
        repos: result.repos.map((sweep) => ({
          path: sweep.path,
          error: sweep.error,
          repo: sweep.repo,
          summary: summarize(sweep.items),
          items: sweep.items.map((item) => ({
            category: item.category,
            id: item.id,
            classification: item.classification,
            action: item.action,
            reason: item.reason,
            facts: item.facts,
            commands: item.commands,
            requires: item.requires,
            deletable: item.deletable,
            investigation_prompt:
              item.investigationParts.length > 0 ? item.investigationParts.join(' ') : null,
          })),
        })),
        unresolved: result.unresolved,
        scan: result.scan,
        duplicates: result.duplicates,
        summary: totals(result),
      },
      null,
      2,
    ) + '\n'
  )
}

/** Every command a `safe-to-delete` row that needs no authorization proposes, in report order. */
export function proposedCommands(result: SweepResult): string[] {
  const out: string[] = []
  for (const sweep of result.repos) {
    for (const item of sortItems(sweep.items)) {
      if (item.classification === 'safe-to-delete' && item.requires.length === 0)
        out.push(...item.commands)
    }
  }
  return out
}

/** An apply run as text: dropped rows, each step, then where the receipt is. */
export function renderReceipt(receipt: Receipt, receiptPath: string | null): string {
  const lines: string[] = []
  for (const d of receipt.dropped) {
    lines.push(`dropped  ${d.category}:${d.id} — ${d.reason} (${d.detail})`)
  }
  for (const s of receipt.steps) {
    const what = s.row === null ? s.command : `${s.row.category}:${s.row.id} — ${s.command}`
    const tail = s.error ?? s.verification
    lines.push(`${s.result.padEnd(8)} ${what}${tail ? ` (${tail})` : ''}`)
  }
  lines.push(
    receiptPath === null
      ? `status: ${receipt.status}`
      : `receipt: ${receiptPath} (${receipt.status})`,
  )
  return lines.join('\n') + '\n'
}
