import { CHANGE_CATEGORIES } from '../diff/categories.ts'
import { OPERATIONS } from '../diff/operations.ts'
import { FILE_GROUPS, type FileGroup } from '../groups.ts'
import {
  addKindCounts,
  CONTENT_KINDS,
  emptyKindCounts,
  type ContentKind,
  type KindCounts,
} from '../scan/kinds.ts'
import { bold, cell, code, codeCell, notes, signed, table } from './markdown.ts'
import type { CompareReport, CountReport, DiffReport, OperationCounts } from './schema.ts'
import { STATS_SECTION } from './splice.ts'

const KIND_LABEL: Record<ContentKind, string> = {
  logic: 'Logic',
  boilerplate: 'Boilerplate',
  comment: 'Comments',
  doc: 'Docs',
  blank: 'Blank',
}
const KIND_HEADERS = CONTENT_KINDS.map((k) => KIND_LABEL[k])
const GROUP_LABEL: Record<FileGroup, string> = {
  source: 'Source',
  tests: 'Tests',
  docs: 'Docs',
  instructions: 'Instructions',
  other: 'Other',
  generated: 'Generated',
  vendored: 'Vendored',
}

const short = (sha: string | null): string => (sha === null ? '' : ` (${sha.slice(0, 12)})`)
const kindCells = (c: KindCounts | null): string[] =>
  CONTENT_KINDS.map((k) => (c === null ? '-' : String(c[k])))

/**
 * Options for {@link renderCount} and {@link renderDiff}.
 */
export interface RenderOptions {
  /** Every row, file and mover rather than the summary. */
  detail?: boolean
}

const LANGUAGES_SHOWN = 12

function sumCounts(rows: readonly { kinds: KindCounts }[]): KindCounts {
  const sum = emptyKindCounts()
  for (const r of rows) addKindCounts(sum, r.kinds)
  return sum
}

/**
 * The `count` report as Markdown tables: totals by kind, then languages and file groups, and with
 * `detail` every file.
 */
export function renderCount(r: CountReport, options: RenderOptions = {}): string {
  const where = r.paths.length === 0 ? '' : ` under ${r.paths.map(code).join(', ')}`
  const out = [`## Lines of code: ${r.source.label}${short(r.source.commit)}${where}`, '']
  const shown = options.detail === true ? r.languages : r.languages.slice(0, LANGUAGES_SHOWN)
  const rest = r.languages.slice(shown.length)
  const files = (rows: readonly { files: number }[]) =>
    String(rows.reduce((n, l) => n + l.files, 0))
  const lines = (rows: readonly { lines: number }[]) =>
    String(rows.reduce((n, l) => n + l.lines, 0))

  const rows = shown.map((l) => [
    cell(l.language ?? '(unknown)'),
    String(l.files),
    ...kindCells(l.kinds),
    String(l.lines),
  ])
  if (rest.length > 0) {
    rows.push([
      `${rest.length} more languages`,
      files(rest),
      ...kindCells(sumCounts(rest)),
      lines(rest),
    ])
  }
  const total = CONTENT_KINDS.reduce((n, k) => n + r.kinds[k], 0)
  rows.push([bold('Total'), bold(files(r.languages)), ...kindCells(r.kinds).map(bold), bold(total)])
  out.push(...table(['Language', 'Files', ...KIND_HEADERS, 'Lines'], 'lrrrrrrr', rows))

  const groupRows = FILE_GROUPS.filter((g) => r.groups[g].files > 0).map((g) => {
    const s = r.groups[g]
    return [GROUP_LABEL[g], String(s.files), ...kindCells(s.kinds), String(s.lines)]
  })
  out.push('', ...table(['File group', 'Files', ...KIND_HEADERS, 'Lines'], 'lrrrrrrr', groupRows))
  out.push('', '_Generated and vendored files are counted by lines only._')

  if (r.fileList !== null) {
    const fileRows = r.fileList.map((f) => [
      codeCell(f.path),
      cell(f.language ?? '(unknown)'),
      f.group,
      ...kindCells(f.kinds),
      String(f.lines),
    ])
    out.push(
      '',
      ...table(['File', 'Language', 'Group', ...KIND_HEADERS, 'Lines'], 'lllrrrrrr', fileRows),
    )
  }
  if (r.skipped.length > 0) {
    const counts = new Map<string, number>()
    for (const s of r.skipped) counts.set(s.reason, (counts.get(s.reason) ?? 0) + 1)
    out.push('', `_Not read: ${[...counts].map(([why, n]) => `${n} ${why}`).join(', ')}._`)
  }
  out.push(...notes(r.notes))
  return out.join('\n')
}

/** The operations in the order the lines table shows them. */
const OPERATION_COLUMNS = ['added', 'changed', 'moved', 'removed'] as const

function kindOperationRows(counts: DiffReport['kindOperations']): string[][] {
  const total = Object.fromEntries(
    OPERATIONS.map((o) => [o, CONTENT_KINDS.reduce((n, k) => n + counts[k][o], 0)]),
  ) as OperationCounts
  const row = (c: OperationCounts) => [
    ...OPERATION_COLUMNS.map((o) => c[o]),
    signed(c.added - c.removed),
  ]
  return [
    ...CONTENT_KINDS.map((k) => [KIND_LABEL[k], ...row(counts[k]).map(String)]),
    [bold('Total'), ...row(total).map(bold)],
  ]
}

/** The summary block a PR body carries; `detail` adds every file and mover. */
export function renderDiff(r: DiffReport, options: RenderOptions = {}): string {
  const detail = options.detail === true
  const out = [STATS_SECTION.start, '']
  out.push(
    ...table(
      ['Lines', 'Added', 'Changed', 'Moved', 'Removed', 'Net'],
      'lrrrrr',
      kindOperationRows(r.kindOperations),
    ),
  )
  const groupRows = FILE_GROUPS.filter((g) => r.groups[g].files > 0).map((g) => {
    const s = r.groups[g]
    return [GROUP_LABEL[g], String(s.files), String(s.added), String(s.removed)]
  })
  if (groupRows.length === 0) groupRows.push(['_no changed files_', '0', '0', '0'])
  out.push('', ...table(['File group', 'Files', 'Added', 'Removed'], 'lrrr', groupRows))
  out.push(
    '',
    '_A changed or moved line replaces a removed one and counts once. Generated, vendored and ' +
      'non-text files are counted in the file-group table only._',
  )
  if (r.files > 0) {
    out.push('', '### Code summary', '', ...categoryTable(r, detail))
    out.push(...dependencyLines(r), ...apiLines(r, detail), ...complexityLines(r, detail))
    if (detail) out.push(...fileDetail(r))
  }
  out.push(...notes(r.notes), '', STATS_SECTION.end)
  return out.join('\n')
}

function categoryTable(r: DiffReport, detail: boolean): string[] {
  return table(
    ['Change category', 'Files', 'Added', 'Removed', 'Largest'],
    'lrrrl',
    r.categories.map((c) => [
      c.category,
      String(c.files),
      String(c.added),
      String(c.removed),
      c.top
        .slice(0, detail ? 5 : 2)
        .map(codeCell)
        .join(', '),
    ]),
  )
}

function dependencyLines(r: DiffReport): string[] {
  return r.dependencies.flatMap((d) => {
    const parts: string[] = []
    if (d.added.length > 0) {
      parts.push(`added ${d.added.map((e) => code(`${e.name}@${e.version}`)).join(', ')}`)
    }
    if (d.removed.length > 0) parts.push(`removed ${d.removed.map((e) => code(e.name)).join(', ')}`)
    if (d.bumped.length > 0) {
      parts.push(`bumped ${d.bumped.map((e) => code(`${e.name} ${e.from} -> ${e.to}`)).join(', ')}`)
    }
    return ['', `**Dependencies** ${code(d.file)}: ${parts.join('; ')}`]
  })
}

/** Why a pass was skipped, or a pointer to the report note that already says why. */
function skippedLine(r: DiffReport, note: string | null): string {
  if (note !== null && r.notes.includes(note)) return '_Skipped: see the note below._'
  return `_Skipped: ${note ?? 'unavailable'}_`
}

const API_FILES_SHOWN = 6
const API_NAMES_SHOWN = 10

function apiLines(r: DiffReport, detail: boolean): string[] {
  const out = ['', '**Exported API**', '']
  if (r.api.status === 'skipped') return [...out, skippedLine(r, r.api.note)]
  if (r.api.changes.length === 0) return [...out, '_No exported-surface changes found._']
  const cap = detail ? Infinity : API_FILES_SHOWN
  const rows = [...r.api.changes].sort((a, b) => Number(b.entry) - Number(a.entry))
  const names = (xs: string[]) => {
    const shown = detail ? xs : xs.slice(0, API_NAMES_SHOWN)
    const more = shown.length < xs.length ? ` _+${xs.length - shown.length} more_` : ''
    return shown.map(code).join(' ') + more
  }
  for (const c of rows.slice(0, cap)) {
    const bits = (
      [
        ['+', c.added],
        ['-', c.removed],
        ['~', c.changed],
      ] as const
    ).flatMap(([sign, xs]) => (xs.length > 0 ? [`${sign}${names(xs)}`] : []))
    out.push(`- ${code(c.file)}${c.entry ? ' (entry point)' : ''}: ${bits.join(' ')}`)
  }
  if (rows.length > cap) out.push(`- _… and ${rows.length - cap} more file(s)_`)
  if (r.api.note !== null) out.push('', `_${r.api.note}_`)
  return out
}

const MOVERS_SHOWN = 5

function complexityLines(r: DiffReport, detail: boolean): string[] {
  const out = ['', '**Complexity** (cyclomatic, per function)', '']
  const cx = r.complexity
  if (cx.status === 'skipped') return [...out, skippedLine(r, cx.note)]
  out.push(
    `Total ${cx.totalBefore} -> ${cx.totalAfter} (${signed(cx.totalAfter - cx.totalBefore)}) ` +
      `across changed files; ${cx.functionsChanged} function(s) changed. ` +
      `Analyzers: ${cx.analyzers.join(', ')}.`,
  )
  // An unnamed callback on one side only is matched by position, so it is noise in the short table.
  const pool = detail
    ? cx.movers
    : cx.movers.filter((m) => !(m.anonymous && (m.before === null || m.after === null)))
  const shown = detail ? pool : pool.slice(0, MOVERS_SHOWN)
  if (shown.length === 0) return out
  const rows = shown.map((m) => [
    codeCell(m.name),
    codeCell(m.path),
    String(m.before ?? '-'),
    String(m.after ?? '-'),
    signed(m.delta),
  ])
  return [...out, '', ...table(['Function', 'File', 'Before', 'After', 'Change'], 'llrrr', rows)]
}

function fileDetail(r: DiffReport): string[] {
  const rows = r.fileList.map((f) => [
    f.oldPath === null
      ? codeCell(f.path)
      : `${codeCell(f.oldPath)} -> ${codeCell(f.path)} (${f.similarity ?? '?'}%)`,
    f.category,
    f.group,
    cell(f.language ?? '-'),
    String(f.added),
    String(f.removed),
  ])
  return [
    '',
    '<details><summary>Per-file detail</summary>',
    '',
    ...table(['File', 'Category', 'Group', 'Language', 'Added', 'Removed'], 'llllrr', rows),
    '',
    '</details>',
  ]
}

function side(c: OperationCounts): string {
  const parts = [`+${c.added + c.changed + c.moved} −${c.removed + c.changed + c.moved}`]
  if (c.changed > 0) parts.push(`${c.changed} changed`)
  if (c.moved > 0) parts.push(`${c.moved} moved`)
  return parts.join(' · ')
}

/** Two changes side by side: lines by kind, file groups, categories, complexity and API. */
export function renderCompare(r: CompareReport): string {
  const { a, b } = r
  const columns = [`A: ${a.change.label}`, `B: ${b.change.label}`]
  const pair = (title: string, rows: string[][]) => ['', ...table([title, ...columns], 'lrr', rows)]
  const out = [`## ${a.change.label} vs ${b.change.label}`]

  out.push(
    ...pair('Lines', [
      ...CONTENT_KINDS.map((k) => [
        KIND_LABEL[k],
        side(a.kindOperations[k]),
        side(b.kindOperations[k]),
      ]),
      [
        bold('All files'),
        `+${a.lines.added} −${a.lines.removed}`,
        `+${b.lines.added} −${b.lines.removed}`,
      ],
      ['Files', String(a.files), String(b.files)],
    ]),
  )
  const groups = FILE_GROUPS.filter((g) => a.groups[g].files + b.groups[g].files > 0)
  out.push(
    ...pair(
      'File group (files)',
      groups.map((g) => [GROUP_LABEL[g], String(a.groups[g].files), String(b.groups[g].files)]),
    ),
  )
  const filesIn = (rep: DiffReport, category: string) =>
    String(rep.categories.find((c) => c.category === category)?.files ?? 0)
  const present = new Set([...a.categories, ...b.categories].map((c) => c.category))
  out.push(
    ...pair(
      'Change category (files)',
      CHANGE_CATEGORIES.filter((c) => present.has(c)).map((c) => [c, filesIn(a, c), filesIn(b, c)]),
    ),
  )
  const cx = (rep: DiffReport) =>
    rep.complexity.status === 'skipped'
      ? 'skipped'
      : `${signed(rep.complexity.totalAfter - rep.complexity.totalBefore)} in ${rep.complexity.functionsChanged} function(s)`
  const api = (rep: DiffReport) =>
    rep.api.status === 'skipped' ? 'skipped' : `${rep.api.changes.length} file(s)`
  out.push(
    ...pair('', [
      ['Complexity', cx(a), cx(b)],
      ['Exported API changes', api(a), api(b)],
    ]),
  )
  out.push(...notes(a.notes, 'Note (A)'), ...notes(b.notes, 'Note (B)'))
  return out.join('\n')
}
