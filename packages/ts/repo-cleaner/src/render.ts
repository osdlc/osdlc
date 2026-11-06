/**
 * Rendering a sweep and a run, for a terminal and for a program.
 *
 * The text report is columnar because it is read by eye across repositories:
 * the eye finds a column, and a line-per-row paragraph gives it nothing to
 * find. JSON carries everything the text report leaves out, the evidence
 * behind every verdict included.
 */

import { ansiColors, paint, stripControls } from '@osdlc/ux'

import type { Preview } from './clean.ts'
import type { Dropped, Receipt, Step } from './receipt.ts'
import {
  KINDS,
  isPrune,
  isUnfetched,
  parseRowId,
  totalOf,
  type Bucket,
  type DuplicateCheckout,
  type Kind,
  type RepoSweep,
  type Row,
  type Sweep,
} from './types.ts'
import { plural } from './util.ts'

/** Branches first, then worktrees, then remotes, whatever order they were gathered in. */
const KIND_ORDER: readonly Kind[] = ['branch', 'worktree', 'remote']

/** Delete first: it is what a reader is looking for. */
const VERDICT_ORDER = ['delete', 'review', 'blocked', 'keep'] as const

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
 * A row's risks for a report, e.g. `needs --allow abandon-unmerged (drops 3
 * commits), confirm-open-pr`. Empty when the row carries none.
 */
function risksNote(row: Pick<Row, 'risks' | 'evidence'>): string {
  if (row.risks.length === 0) return ''
  const count = row.evidence.uniqueCommits
  const names = row.risks.map((name) =>
    name === 'abandon-unmerged' && typeof count === 'number'
      ? `${name} (drops ${count} commit${count === 1 ? '' : 's'})`
      : name,
  )
  return `needs --allow ${names.join(', ')}`
}

function sortRows(rows: readonly Row[]): Row[] {
  const kindRank = (r: Row): number => KIND_ORDER.indexOf(r.kind)
  const verdictRank = (r: Row): number => VERDICT_ORDER.indexOf(r.verdict)
  return [...rows].sort(
    (a, b) =>
      kindRank(a) - kindRank(b) || verdictRank(a) - verdictRank(b) || a.name.localeCompare(b.name),
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

/** The word a report shows for a row: its verdict, or `prune` for a `delete` that only prunes. */
function verdictWord(row: Pick<Row, 'verdict' | 'action'>): string {
  return isPrune(row) ? 'prune' : row.verdict
}

/** The color of a verdict word. */
function wordStyle(style: Style, word: string): (text: string) => string {
  if (word === 'delete') return style.delete
  if (word === 'prune') return style.prune
  if (word === 'review' || word === 'blocked') return style.review
  return style.keep
}

/** One repository's rows, indented under its header. `all` shows `keep` rows too. */
export function renderRepo(sweep: RepoSweep, opts: { all?: boolean; style?: Style } = {}): string {
  const style = opts.style ?? PLAIN
  const lines = [style.strong(repoHeader(sweep))]
  if (sweep.error !== null) {
    lines.push(`  ${style.delete('error')}: ${sweep.error}`)
    return lines.join('\n')
  }

  const shown = sortRows(sweep.rows).filter((r) => opts.all === true || r.verdict !== 'keep')
  if (shown.length === 0) {
    lines.push('  nothing to clean up')
    return lines.join('\n')
  }

  const nameWidth = Math.min(38, Math.max(...shown.map((r) => ellipsize(r.name, 38).length)))
  const kindWidth = Math.max(...shown.map((r) => r.kind.length))
  for (const row of shown) {
    const word = verdictWord(row)
    const note = risksNote(row)
    lines.push(
      `  ${pad(row.kind, kindWidth)}  ${pad(ellipsize(row.name, 38), nameWidth)}  ${wordStyle(style, word)(pad(word, 7))}  ${row.why}${note ? `; ${note}` : ''}`,
    )
    // A blocked row has no commands; what to do about each blocker goes there instead.
    const detail = row.verdict === 'blocked' ? row.notes : row.commands
    for (const line of detail) lines.push(`  ${' '.repeat(kindWidth)}  ${style.muted(line)}`)
  }
  return lines.join('\n')
}

/** Thousands separators, fixed to one locale so the output does not move. */
function count(n: number): string {
  return n.toLocaleString('en-US')
}

/** `1 target`, `1,204 directories`. */
const counted = (n: number, one: string, many: string): string =>
  `${count(n)} ${n === 1 ? one : many}`

/**
 * What the search cost, or null when nothing was searched — every target
 * named a checkout outright.
 *
 * Worth a line because the numbers are how a person catches a target
 * pointing at the wrong directory: thousands of directories read for three
 * repositories says the target is a home directory, not a workspace.
 */
export function renderScan(sweep: Pick<Sweep, 'scan'>): string | null {
  const { scan } = sweep
  if (scan.containers === 0) return null
  const entries = counted(scan.containers, 'target', 'targets')
  const dirs = counted(scan.directoriesScanned, 'directory', 'directories')
  const found = counted(scan.checkoutsFound, 'checkout', 'checkouts')
  const line = `searched ${entries}: ${dirs} read, ${found} found.`
  if (scan.depthLimited === 0) return line
  return `${line} ${count(scan.depthLimited)} left unopened at the depth limit.`
}

/** The one-line verdict a person reads first, and often only. */
export function renderTotals(sweep: Sweep, style: Style = PLAIN): string {
  const t = totalOf(sweep.counts)
  const repos = counted(sweep.repos.length, 'repository', 'repositories')
  const errors = sweep.repos.filter((r) => r.error !== null).length
  const tail: string[] = []
  if (errors > 0) tail.push(`${errors} unreadable`)
  if (sweep.unresolved.length > 0) {
    tail.push(`${counted(sweep.unresolved.length, 'target', 'targets')} unresolved`)
  }
  const suffix = tail.length > 0 ? ` (${tail.join(', ')})` : ''
  const prune = t.prune > 0 ? `${style.prune(`${t.prune} to prune`)}, ` : ''
  const blocked = t.blocked > 0 ? `, ${style.review(`${t.blocked} blocked`)}` : ''
  return `${style.delete(`${t.delete} to delete`)}, ${prune}${style.review(`${t.review} to review`)}${blocked}, across ${repos}${suffix}.`
}

const KIND_LABEL: Record<Kind, string> = {
  branch: 'local branches',
  worktree: 'worktrees',
  remote: 'remote branches',
}

const COUNT_COLUMNS: ReadonlyArray<keyof Bucket> = [
  'total',
  'merged',
  'delete',
  'prune',
  'review',
  'blocked',
  'keep',
]

function renderUnresolved(sweep: Sweep): string | null {
  if (sweep.unresolved.length === 0) return null
  const lines = ['unresolved']
  const width = Math.max(...sweep.unresolved.map((row) => row.entry.length))
  for (const row of sweep.unresolved) lines.push(`  ${pad(row.entry, width)}   ${row.reason}`)
  return lines.join('\n')
}

/** `blocks`, then the unresolved targets, what the search cost and the totals, as one report. */
function report(blocks: string[], sweep: Sweep, style: Style): string {
  const unresolved = renderUnresolved(sweep)
  const scan = renderScan(sweep)
  const totals = renderTotals(sweep, style)
  return (
    [
      ...blocks,
      ...(unresolved === null ? [] : [unresolved]),
      scan === null ? totals : `${scan}\n${totals}`,
    ].join('\n\n') + '\n'
  )
}

/** The sweep as counts (`--format summary`): a table per repository, then the totals line. */
export function renderSummary(sweep: Sweep, style: Style = PLAIN): string {
  const blocks = sweep.repos.map((r) => {
    const lines = [repoHeader(r)]
    if (r.error !== null) {
      lines.push(`  error: ${r.error}`)
      return lines.join('\n')
    }
    const labelWidth = Math.max(...Object.values(KIND_LABEL).map((l) => l.length))
    const cell = (text: string, heading: string): string =>
      text.padStart(Math.max(heading.length, 5))
    lines.push(`  ${' '.repeat(labelWidth)}  ${COUNT_COLUMNS.map((h) => cell(h, h)).join('  ')}`)
    for (const kind of KIND_ORDER) {
      const bucket = r.counts[kind]
      const cells = COUNT_COLUMNS.map((h) => cell(count(bucket[h]), h))
      lines.push(`  ${pad(KIND_LABEL[kind], labelWidth)}  ${cells.join('  ')}`)
    }
    return lines.join('\n')
  })
  return report(blocks, sweep, style)
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

/** The sweep as text: duplicate checkouts, a section per repository, then the totals. */
export function renderText(sweep: Sweep, opts: { all?: boolean; style?: Style } = {}): string {
  const duplicates = renderDuplicates(sweep.duplicates)
  const blocks = [
    ...(duplicates === null ? [] : [duplicates]),
    ...sweep.repos.map((r) => renderRepo(r, opts)),
  ]
  return report(blocks, sweep, opts.style ?? PLAIN)
}

/** The sweep as JSON: every row with its evidence, the counts, and what was swept. */
export function renderJson(sweep: Sweep, extra: Record<string, unknown> = {}): string {
  return (
    JSON.stringify(
      {
        ...extra,
        options: sweep.options,
        repos: sweep.repos,
        unresolved: sweep.unresolved,
        scan: sweep.scan,
        duplicates: sweep.duplicates,
        counts: sweep.counts,
        totals: totalOf(sweep.counts),
      },
      null,
      2,
    ) + '\n'
  )
}

/** Every command of a `delete` row that carries no risk, in report order (`--format commands`). */
export function renderCommands(sweep: Sweep): string[] {
  const out: string[] = []
  for (const r of sweep.repos) {
    for (const row of sortRows(r.rows)) {
      if (row.verdict === 'delete' && row.risks.length === 0) out.push(...row.commands)
    }
  }
  return out
}

// ── a run ──────────────────────────────────────────────────────────────────

/** What a run did, or would do, counted by kind. */
export interface RunSummary {
  /** Rows deleted (or, in a preview, that would be), by kind. Pruned worktrees are counted apart. */
  deleted: Record<Kind, number>
  /** Worktrees whose stale record was pruned; their directories were gone or left alone. */
  pruned: number
  /** Dropped rows by reason. */
  dropped: Record<string, number>
  /** Steps that failed: 0 or 1, since the first failure stops the run. */
  failed: number
  /** Row steps never reached because a step failed. */
  notRun: number
}

/** Count what `steps` did and `dropped` left out. A preview's `would-run` steps count as done. */
export function summarizeRun(r: {
  steps: readonly Step[]
  dropped: readonly Dropped[]
}): RunSummary {
  const out: RunSummary = {
    deleted: { worktree: 0, branch: 0, remote: 0 },
    pruned: 0,
    dropped: {},
    failed: 0,
    notRun: 0,
  }
  for (const d of r.dropped) out.dropped[d.reason] = (out.dropped[d.reason] ?? 0) + 1
  for (const s of r.steps) {
    if (s.result === 'failed') out.failed += 1
    if (s.row === null) continue
    if (s.result === 'pending') {
      // Rows not reached are rows a run would have deleted; an unlock or a
      // tip check deletes nothing.
      if (s.action !== 'unlock-worktree' && s.action !== 'verify-remote') out.notRun += 1
      continue
    }
    if (s.result !== 'ok' && s.result !== 'would-run') continue
    if (s.action === 'remove-worktree') out.deleted.worktree += 1
    else if (s.action === 'prune-worktrees') out.pruned += 1
    else if (s.action === 'delete-branch') out.deleted.branch += 1
    else if (s.action === 'delete-remote') out.deleted.remote += 1
  }
  return out
}

/** Rows a run deletes or prunes, which is what a person is asked to approve. */
export function rowsActedOn(summary: RunSummary): number {
  return KINDS.reduce((n, k) => n + summary.deleted[k], 0) + summary.pruned
}

/**
 * How to include a dropped row next time, for the reasons a person can act
 * on. A `not-allowed` detail is `needs <risk>, <risk>`.
 */
function dropHints(dropped: readonly Dropped[]): Partial<Record<string, string>> {
  const risks = new Set<string>()
  for (const d of dropped) {
    if (d.reason !== 'not-allowed') continue
    for (const risk of d.detail.replace(/^needs /, '').split(', ')) if (risk) risks.add(risk)
  }
  return {
    'needs-pick': 'name with --pick',
    ...(risks.size > 0 ? { 'not-allowed': [...risks].map((r) => `--allow ${r}`).join(', ') } : {}),
  }
}

/** The closing lines of a run or preview: what it deleted, skipped and could not finish. */
export function renderRunSummary(
  r: { steps: readonly Step[]; dropped: readonly Dropped[] },
  opts: { preview?: boolean } = {},
): string[] {
  const s = summarizeRun(r)
  const parts = [
    s.deleted.worktree > 0 ? plural(s.deleted.worktree, 'worktree', 'worktrees') : null,
    s.deleted.branch > 0 ? plural(s.deleted.branch, 'local branch', 'local branches') : null,
    s.deleted.remote > 0 ? plural(s.deleted.remote, 'remote branch', 'remote branches') : null,
    s.pruned > 0 ? `${plural(s.pruned, 'stale worktree', 'stale worktrees')} pruned` : null,
  ].filter((p) => p !== null)
  const lines = [
    `${opts.preview === true ? 'would delete' : 'deleted'}: ${parts.length > 0 ? parts.join(', ') : 'nothing'}`,
  ]
  const dropped = Object.entries(s.dropped)
  if (dropped.length > 0) {
    const total = dropped.reduce((n, [, c]) => n + c, 0)
    const hints = dropHints(r.dropped)
    const counts = dropped.map(([reason, c]) => {
      const hint = hints[reason]
      return hint === undefined ? `${c} ${reason}` : `${c} ${reason} (${hint})`
    })
    lines.push(`skipped ${total}, not deleted: ${counts.join(', ')}`)
  }
  if (s.failed > 0)
    lines.push(`stopped at a failed step; ${plural(s.notRun, 'row', 'rows')} not run`)
  return lines
}

/** The word a preview shows for a step: what it does to the row. */
export const STEP_VERB: Record<Step['action'], string> = {
  'verify-remote': 'verify',
  'unlock-worktree': 'unlock',
  'remove-worktree': 'delete',
  'delete-branch': 'delete',
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
 * A row id for a preview line, its name shortened from the left to fit; the
 * kind in front always stays, so a long path still says what kind of row it is.
 */
function shownRow(id: string): string {
  const parsed = parseRowId(id)
  if (parsed === null) return ellipsize(stripControls(id), 70)
  return `${parsed.kind}:${ellipsize(stripControls(parsed.name), 70 - parsed.kind.length - 1)}`
}

/**
 * What a run is about to do, for the person asked to approve it: per
 * repository, each row and the command that deletes it, the rows it will skip
 * and why, the allows no row needed, then the counts. Terminal controls are
 * stripped from what it shows, so a path or name cannot hide part of what is
 * approved.
 */
export function renderPreview(
  p: Pick<Preview, 'steps' | 'dropped'> & Partial<Pick<Preview, 'unusedAllows'>>,
  style: Style = PLAIN,
): string {
  const repos = [...new Set([...p.steps.map((s) => s.repo), ...p.dropped.map((d) => d.repo)])]
  const blocks: string[] = []
  for (const repo of repos) {
    const lines = [style.strong(stripControls(repo))]
    for (const s of p.steps.filter((s) => s.repo === repo)) {
      const verb = STEP_VERB[s.action]
      const color = wordStyle(style, verb === 'unlock' || verb === 'verify' ? 'review' : verb)
      lines.push(
        s.row === null
          ? `  ${color(pad(verb, 6))}  worktree records`
          : `  ${color(pad(verb, 6))}  ${shownRow(s.row)}`,
      )
      lines.push(`          ${style.muted(stripControls(s.command))}`)
    }
    for (const d of p.dropped.filter((d) => d.repo === repo)) {
      lines.push(`  ${style.review(pad('skip', 6))}  ${shownRow(d.row)}`)
      lines.push(`          ${d.reason}: ${stripControls(d.detail)}`)
    }
    blocks.push(lines.join('\n'))
  }
  const [counts = '', ...rest] = renderRunSummary(p, { preview: true })
  const unused = (p.unusedAllows ?? []).map(
    (a) =>
      `unused: --allow ${a.risk}${a.row === null ? '' : `=${stripControls(a.row)}`} (no row that runs carries it)`,
  )
  blocks.push(
    [style.strong(counts), ...rest.map(style.review), ...unused.map(style.muted)].join('\n'),
  )
  return blocks.join('\n\n') + '\n'
}

/** Rows dropped by a run's own re-check after the preview, each with why. */
export function renderLateDrops(dropped: readonly Dropped[], style: Style = PLAIN): string {
  return dropped
    .map(
      (d) =>
        `  ${style.review('skip')}  ${shownRow(d.row)}\n      ${style.review(stripControls(`${d.reason}: ${d.detail}`))}\n`,
    )
    .join('')
}

/**
 * A failed step for a run shown live: `✗`, the row, and the error in full,
 * which the step's line on the board is too narrow to hold.
 */
export function renderStepFailure(step: Step, style: Style = PLAIN): string {
  const verb = STEP_VERB[step.action]
  const line = stripControls(
    `${pad(verb, 6)}  ${step.row === null ? '' : shownRow(step.row)}`.trimEnd(),
  )
  return `  ${style.delete('✗')} ${line}\n      ${style.delete(stripControls(step.error ?? 'failed'))}`
}

/** A run as text: dropped rows, each step, a summary, then where the receipt is. */
export function renderReceipt(
  receipt: Receipt,
  receiptPath: string | null,
  style: Style = PLAIN,
  opts: { steps?: boolean } = {},
): string {
  const lines: string[] = []
  // A run shown live has printed its dropped rows and steps already.
  for (const d of opts.steps === false ? [] : receipt.dropped) {
    lines.push(
      `${style.review('skipped  ')}${stripControls(`${d.row} — ${d.reason} (${d.detail})`)}`,
    )
  }
  for (const s of opts.steps === false ? [] : receipt.steps) {
    const what = s.row === null ? s.command : `${s.row} — ${s.command}`
    const tail = s.error ?? s.verification
    lines.push(`${resultWord(s, style)} ${stripControls(`${what}${tail ? ` (${tail})` : ''}`)}`)
  }
  if (lines.length > 0) lines.push('')
  const [counts = '', ...rest] = renderRunSummary(receipt, {
    preview: receipt.status === 'dry-run',
  })
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

/** The renderers a library user needs: the CLI's own formats. */
export const render = {
  text: renderText,
  json: renderJson,
  summary: renderSummary,
  commands: renderCommands,
  preview: renderPreview,
  receipt: renderReceipt,
}
