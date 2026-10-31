/**
 * Rendering a sweep for a terminal, and for a program.
 *
 * The text report is columnar because it is read by eye across repositories:
 * the eye finds a column, and a line-per-item paragraph gives it nothing to
 * find. JSON carries everything the text report elides, including the facts
 * behind every verdict.
 */

import { ansiColors, paint, stripControls } from '@osdlc/ux'

import type { Receipt, Step } from './receipt.ts'
import {
  emptyBucket,
  isPrune,
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

/**
 * How a report colors its words. {@link PLAIN} leaves them as they are; the
 * CLI passes {@link TERMINAL_STYLE} when the stream is a terminal that takes
 * color.
 */
export interface Style {
  /** What a run deletes. */
  delete(text: string): string
  /** A stale link a run prunes. */
  prune(text: string): string
  /** What a person has to look at: a review row, a dropped row. */
  review(text: string): string
  /** What stays, or a step that succeeded. */
  keep(text: string): string
  /** Detail under a row: commands, the receipt path. */
  muted(text: string): string
  /** A heading or the line a person is asked to approve. */
  strong(text: string): string
}

const same = (text: string): string => text

/** No color. */
export const PLAIN: Style = {
  delete: same,
  prune: same,
  review: same,
  keep: same,
  muted: same,
  strong: same,
}

// The 16 basic colors, so the terminal's own theme decides the shades.
const ANSI = ansiColors('ansi16', 'dark')

/** The basic terminal colors: red to delete, blue to prune, yellow to review, green to keep. */
export const TERMINAL_STYLE: Style = {
  delete: (t) => paint(t, ANSI['status-error']),
  prune: (t) => paint(t, ANSI.accent),
  review: (t) => paint(t, ANSI['status-warning']),
  keep: (t) => paint(t, ANSI['status-success']),
  muted: (t) => paint(t, ANSI['text-muted']),
  strong: (t) => `\x1b[1m${t}\x1b[22m`,
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

/** The color of a row's action word. */
function actionStyle(style: Style, action: string): (text: string) => string {
  if (action === 'delete') return style.delete
  if (action === 'prune') return style.prune
  if (action === 'review') return style.review
  return style.keep
}

/** One repository's rows, indented under its header. */
export function renderRepo(sweep: RepoSweep, opts: { keep?: boolean; style?: Style } = {}): string {
  const style = opts.style ?? PLAIN
  const lines = [style.strong(repoHeader(sweep))]
  if (sweep.error !== null) {
    lines.push(`  ${style.delete('error')}: ${sweep.error}`)
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
    const action = isPrune(item)
      ? 'prune'
      : (ACTION_LABEL[item.classification] ?? item.classification)
    const note = requiresNote(item)
    lines.push(
      `  ${pad(item.category, categoryWidth)}  ${pad(ellipsize(item.id, 38), idWidth)}  ${actionStyle(style, action)(pad(action, 6))}  ${item.reason}${note ? `; ${note}` : ''}`,
    )
    // A blocked row has no commands; what to do about each blocker goes there instead.
    const detail = hasBlockers(item) ? item.investigationParts : item.commands
    for (const line of detail) lines.push(`  ${' '.repeat(categoryWidth)}  ${style.muted(line)}`)
  }
  return lines.join('\n')
}

function totals(result: SweepResult): SummaryBucket {
  const out = emptyBucket()
  for (const sweep of result.repos) {
    for (const bucket of Object.values(summarize(sweep.items))) {
      out.total += bucket.total
      out.merged += bucket.merged
      out['safe-to-delete'] += bucket['safe-to-delete']
      out.prune += bucket.prune
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

/** The `safe-to-delete` rows that delete something, not the ones that only prune a stale link. */
function deleteOnly(bucket: SummaryBucket): number {
  return bucket['safe-to-delete'] - bucket.prune
}

/** The one-line verdict a person reads first, and often only. */
export function renderSummary(result: SweepResult, style: Style = PLAIN): string {
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
  const prune = counts.prune > 0 ? `${style.prune(`${counts.prune} to prune`)}, ` : ''
  const del = style.delete(`${deleteOnly(counts)} to delete`)
  const review = style.review(`${counts['needs-investigation']} to review`)
  return `${del}, ${prune}${review}, across ${repos}${suffix}.`
}

const COUNT_LABEL: Record<(typeof CATEGORY_ORDER)[number], string> = {
  local_branch: 'local branches',
  worktree: 'worktrees',
  remote_branch: 'remote branches',
}

/** A count table's columns. `delete` leaves out the rows `prune` counts, so each row is in one of delete, prune, review and keep. */
const COUNT_COLUMNS: ReadonlyArray<{ heading: string; of: (b: SummaryBucket) => number }> = [
  { heading: 'total', of: (b) => b.total },
  { heading: 'merged', of: (b) => b.merged },
  { heading: 'delete', of: deleteOnly },
  { heading: 'prune', of: (b) => b.prune },
  { heading: 'review', of: (b) => b['needs-investigation'] },
  { heading: 'keep', of: (b) => b['safe-to-keep'] },
]

/**
 * One repository as counts: a row per category with its total, how many are
 * merged, and how many the sweep would delete, prune, review or keep.
 */
export function renderCounts(sweep: RepoSweep): string {
  const lines = [repoHeader(sweep)]
  if (sweep.error !== null) {
    lines.push(`  error: ${sweep.error}`)
    return lines.join('\n')
  }
  const buckets = summarize(sweep.items)
  const labelWidth = Math.max(...Object.values(COUNT_LABEL).map((l) => l.length))
  const cell = (text: string, heading: string): string => text.padStart(Math.max(heading.length, 5))
  lines.push(
    `  ${' '.repeat(labelWidth)}  ${COUNT_COLUMNS.map(({ heading }) => cell(heading, heading)).join('  ')}`,
  )
  for (const category of CATEGORY_ORDER) {
    const bucket = buckets[category] ?? emptyBucket()
    const cells = COUNT_COLUMNS.map(({ heading, of }) => cell(count(of(bucket)), heading))
    lines.push(`  ${pad(COUNT_LABEL[category], labelWidth)}  ${cells.join('  ')}`)
  }
  return lines.join('\n')
}

/** The whole run as counts: a table per repository, then the one-line summary. */
export function renderCountsText(result: SweepResult, style: Style = PLAIN): string {
  const blocks = result.repos.map(renderCounts)
  if (result.unresolved.length > 0) {
    const lines = ['unresolved']
    const width = Math.max(...result.unresolved.map((row) => row.entry.length))
    for (const row of result.unresolved) lines.push(`  ${pad(row.entry, width)}   ${row.reason}`)
    blocks.push(lines.join('\n'))
  }
  const scan = renderScan(result)
  const summary = renderSummary(result, style)
  blocks.push(scan === null ? summary : `${scan}\n${summary}`)
  return blocks.join('\n\n') + '\n'
}

/** The whole run's counts as JSON: no rows, no facts. */
export function renderCountsJson(result: SweepResult): string {
  return (
    JSON.stringify(
      {
        repos: result.repos.map((sweep) => ({
          path: sweep.path,
          error: sweep.error,
          repo: sweep.repo,
          summary: summarize(sweep.items),
        })),
        unresolved: result.unresolved,
        scan: result.scan,
        summary: totals(result),
      },
      null,
      2,
    ) + '\n'
  )
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
export function renderText(
  result: SweepResult,
  opts: { keep?: boolean; style?: Style } = {},
): string {
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
  const summary = renderSummary(result, opts.style)
  blocks.push(scan === null ? summary : `${scan}\n${summary}`)
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

/** What an apply run did, or would do, counted by kind. */
export interface ApplySummary {
  /** Rows deleted (or, in a dry run, that would be), by category. Pruned worktrees are not counted here. */
  deleted: { worktree: number; local_branch: number; remote_branch: number }
  /** Worktrees whose stale registration was pruned; their directories were gone or left alone. */
  pruned: number
  /** Dropped rows by reason. */
  dropped: Record<string, number>
  /** Steps that failed: 0 or 1, since the first failure stops the run. */
  failed: number
  /** Row steps never reached because a step failed. */
  notRun: number
}

/** Count a receipt's outcome. A dry run's `would-run` steps count as done. */
export function summarizeReceipt(receipt: Receipt): ApplySummary {
  const out: ApplySummary = {
    deleted: { worktree: 0, local_branch: 0, remote_branch: 0 },
    pruned: 0,
    dropped: {},
    failed: 0,
    notRun: 0,
  }
  for (const d of receipt.dropped) out.dropped[d.reason] = (out.dropped[d.reason] ?? 0) + 1
  for (const s of receipt.steps) {
    if (s.result === 'failed') out.failed += 1
    if (s.row === null) continue
    if (s.result === 'pending') {
      if (s.action !== 'unlock-worktree') out.notRun += 1
      continue
    }
    if (s.result !== 'ok' && s.result !== 'would-run') continue
    if (s.action === 'remove-worktree') out.deleted.worktree += 1
    else if (s.action === 'prune-worktrees') out.pruned += 1
    else if (s.action === 'delete-local') out.deleted.local_branch += 1
    else if (s.action === 'delete-remote') out.deleted.remote_branch += 1
  }
  return out
}

/** Rows a receipt deletes or prunes, which is what a person is asked to approve. */
export function rowsActedOn(summary: ApplySummary): number {
  const d = summary.deleted
  return d.worktree + d.local_branch + d.remote_branch + summary.pruned
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** The closing lines of an apply run: what it deleted, dropped and could not finish. */
export function renderApplySummary(receipt: Receipt): string[] {
  const s = summarizeReceipt(receipt)
  const dry = receipt.status === 'dry-run'
  const parts = [
    s.deleted.worktree > 0 ? plural(s.deleted.worktree, 'worktree', 'worktrees') : null,
    s.deleted.local_branch > 0
      ? plural(s.deleted.local_branch, 'local branch', 'local branches')
      : null,
    s.deleted.remote_branch > 0
      ? plural(s.deleted.remote_branch, 'remote branch', 'remote branches')
      : null,
    s.pruned > 0 ? `${plural(s.pruned, 'stale worktree', 'stale worktrees')} pruned` : null,
  ].filter((p) => p !== null)
  const lines = [
    `${dry ? 'would delete' : 'deleted'}: ${parts.length > 0 ? parts.join(', ') : 'nothing'}`,
  ]
  const dropped = Object.entries(s.dropped)
  if (dropped.length > 0) {
    const total = dropped.reduce((n, [, c]) => n + c, 0)
    lines.push(`dropped ${total}: ${dropped.map(([reason, c]) => `${c} ${reason}`).join(', ')}`)
  }
  if (s.failed > 0) {
    lines.push(`stopped at a failed step; ${plural(s.notRun, 'row', 'rows')} not run`)
  }
  return lines
}

/** The word a preview shows for a step: what it does to the row. */
const STEP_VERB: Record<Step['action'], string> = {
  'unlock-worktree': 'unlock',
  'remove-worktree': 'delete',
  'delete-local': 'delete',
  'delete-remote': 'delete',
  'prune-worktrees': 'prune',
}

/** A step's result word, colored by what it says about the run. */
function resultWord(step: Step, style: Style): string {
  const word = step.result.padEnd(8)
  if (step.result === 'failed') return style.delete(word)
  if (step.result === 'ok') return style.keep(word)
  if (step.result === 'pending') return style.muted(word)
  return step.action === 'prune-worktrees' ? style.prune(word) : style.delete(word)
}

/**
 * What `apply` is about to do, for the person asked to approve it: per
 * repository, each row and the command that deletes it, the rows it will
 * skip and why, then the counts. Terminal controls are stripped from what it
 * shows, so a path or name cannot hide part of what is approved.
 */
export function renderPreview(receipt: Receipt, style: Style = PLAIN): string {
  const repos = [
    ...new Set([...receipt.steps.map((s) => s.repo), ...receipt.dropped.map((d) => d.repo)]),
  ]
  const rows = [
    ...receipt.steps.flatMap((s) => (s.row === null ? [] : [s.row])),
    ...receipt.dropped,
  ]
  const categoryWidth = Math.max(0, ...rows.map((r) => r.category.length))
  const row = (r: { category: string; id: string } | null): string =>
    r === null ? '' : `${pad(r.category, categoryWidth)}  ${ellipsize(stripControls(r.id), 60)}`
  const blocks: string[] = []
  for (const repo of repos) {
    const lines = [style.strong(stripControls(repo))]
    for (const s of receipt.steps.filter((s) => s.repo === repo)) {
      const verb = STEP_VERB[s.action]
      const color = actionStyle(style, verb === 'unlock' ? 'review' : verb)
      lines.push(`  ${color(pad(verb, 6))}  ${row(s.row)}`.trimEnd())
      lines.push(`          ${style.muted(stripControls(s.command))}`)
    }
    for (const d of receipt.dropped.filter((d) => d.repo === repo)) {
      lines.push(`  ${style.review(pad('skip', 6))}  ${row(d)}`)
      lines.push(`          ${d.reason}: ${stripControls(d.detail)}`)
    }
    blocks.push(lines.join('\n'))
  }
  const [counts = '', ...rest] = renderApplySummary(receipt)
  blocks.push([style.strong(counts), ...rest.map(style.review)].join('\n'))
  return blocks.join('\n\n') + '\n'
}

/** An apply run as text: dropped rows, each step, a summary, then where the receipt is. */
export function renderReceipt(
  receipt: Receipt,
  receiptPath: string | null,
  style: Style = PLAIN,
): string {
  const lines: string[] = []
  for (const d of receipt.dropped) {
    const shown = stripControls(`${d.category}:${d.id} — ${d.reason} (${d.detail})`)
    lines.push(`${style.review('dropped  ')}${shown}`)
  }
  for (const s of receipt.steps) {
    const what = s.row === null ? s.command : `${s.row.category}:${s.row.id} — ${s.command}`
    const tail = s.error ?? s.verification
    lines.push(`${resultWord(s, style)} ${stripControls(`${what}${tail ? ` (${tail})` : ''}`)}`)
  }
  if (lines.length > 0) lines.push('')
  const [counts = '', ...rest] = renderApplySummary(receipt)
  lines.push(style.strong(counts), ...rest.map(style.review))
  lines.push(
    style.muted(
      receiptPath === null
        ? `status: ${receipt.status}`
        : `receipt: ${stripControls(receiptPath)} (${receipt.status})`,
    ),
  )
  return lines.join('\n') + '\n'
}
