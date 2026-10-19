/**
 * `task parse-touchpoints` op — parse the `## Areas` table out of a task
 * markdown file.
 *
 * Invoked as `sdlc task parse-touchpoints <task>` by the gate and any other
 * caller ([[D-0007-deterministic-op-substrate]] §2a).
 * The payload shape: `{ areas }`, carrying a `kind` (`table` / `prose` /
 * `missing` / `bulleted-legacy`), parsed `rows`, and section-level `errors`.
 * Parsing succeeds (exit 0) regardless of how many row errors were
 * collected; a missing/unreadable task file is an INVALID_INPUT OpError
 * (exit 1).
 *
 * v7 retired `## Today` from this op's scope entirely: Today is fully
 * free-form prose with no typed shape and no filesystem resolution, so there
 * is nothing here for it to parse. v7 also retired the old `## Files to
 * touch` table's `Kind` column and its Location five-form-grammar
 * decomposition — `## Areas` is advisory (packages/directories/modules, not
 * exact file citations resolved against the working tree), so a row is just
 * `{ area, note }`, verbatim text. Nothing here performs or feeds a
 * filesystem existence check; `gap-report` never turns an Areas shape/row
 * finding into a readiness gap (see `implementation-ready.md`'s `## Areas`
 * entry).
 *
 * SECTION + ROW SOURCING. The fence-aware H2 section split and the table's
 * header/separator/data-row split are sourced from `markdown-contract`'s
 * projection (`parse(text).root.sections`, each `SectionNode` carrying its
 * already-split `BlockNode`s) — the same gfm-fence-aware parse the rest of the
 * entity shares, giving the section boundaries and post-separator data rows
 * directly.
 *
 * The task-specific layer stays ON TOP of the tree: the four-way `kind`
 * classification (`table`/`prose`/`missing`/`bulleted-legacy`) derived from a
 * section's block kinds, plus the per-row cell-count error the projection
 * doesn't itself surface as a mismatch.
 *
 * Two cell-shape details the gfm projection does not preserve are recovered
 * from the row's source line (`BlockNode.rowPos`): the verbatim `Area` cell
 * WITH its surrounding backticks (the projection renders inline code to bare
 * text), and the literal per-row cell COUNT (needed for the cell-count
 * error, since this projection neither pads nor truncates rows to the header
 * width). The one malformed case the projection drops entirely — a `|`-row
 * before any separator, which gfm demotes to a paragraph rather than a table —
 * keeps a minimal raw-line check so the pinned `row before separator` error is
 * still surfaced.
 */

import { parse, sectionsAt, blocksOfKind } from 'markdown-contract'
import type { SectionNode } from 'markdown-contract'
import { z } from 'zod'
import { rowCellTexts } from '@osdlc/gfm-table'

import { defineOp } from '@lib/registry'
import { repr } from '@lib/util/diagnostics'
import { taskSectionLookup, taskSectionsByKey } from '@lib/model/entities/task/schema'

import { readTaskDoc } from './_task_doc.ts'

const FENCE_RE = /^(```+|~~~+)/
const TABLE_ROW_RE = /^\s*\|/
const TABLE_SEP_RE = /^\s*\|[\s:|-]+\|\s*$/

/**
 * A touchpoint section as sourced from the projection: the tree's `SectionNode`
 * (block kinds + already-split table rows) plus the full document's lines and
 * the section's absolute line span, used to recover the two cell-shape details
 * the projection drops (verbatim backticked Area, literal cell count) and the
 * one malformed case it demotes (a row before the separator).
 */
interface Section {
  node: SectionNode
  /** Every line of the source document (1-indexed via `rowPos`). */
  docLines: string[]
  /** 1-indexed absolute line of this section's heading. */
  startLine: number
  /** 1-indexed absolute line just past this section (exclusive), or docLines.length+1. */
  endLine: number
}

// The one touchpoint section, keyed by its accepted spellings (lower-cased)
// and valued by the machine key this op names its output field after. The
// spelling comes from `TASK_BODY`, the canonical section table, rather than
// being re-spelled here.
const SECTION_ALIASES = taskSectionLookup(taskSectionsByKey('areas'), (s) => s.key)

type JsonValue = string | number | boolean | null | JsonValue[] | { [k: string]: JsonValue }

/**
 * Source the touchpoint section from the projection. Walk the tree's top-level
 * H2 sections (already fence-aware: an H2 inside a fenced code block is not a
 * section), canonicalize each heading through the aliases, and key the one
 * section we care about.
 */
function splitSections(text: string): Map<string, Section> {
  const tree = parse(text)
  const docLines = text.split('\n')
  const sections = new Map<string, Section>()
  // Only `## ` (depth-2) headings open a section, matching the old `^##\s+`
  // walk (which appended an H1/H3 line to the current section's body rather
  // than starting a new one). `sectionsAt` absorbs the depth-2 filter.
  const tops = sectionsAt(tree.root, 2)
  for (let i = 0; i < tops.length; i++) {
    const node = tops[i] as SectionNode
    const canon = SECTION_ALIASES.get(node.name.trim().toLowerCase())
    if (canon === undefined) continue
    // Span runs from this heading to the next depth-2 section (exclusive), or
    // EOF — the same boundary the old walk used (it closed a section only on
    // the next H2).
    const next = tops[i + 1]
    const endLine = next ? next.pos.line : docLines.length + 1
    // Last duplicate heading wins (the old fence-walk re-set the map entry each
    // time it closed a matching section, so a later `## Areas` overwrote an
    // earlier one — match that with a plain forward-loop overwrite).
    sections.set(canon, { node, docLines, startLine: node.pos.line, endLine })
  }
  return sections
}

/** The raw source lines belonging to a section's body (heading excluded). */
function sectionBodyLines(section: Section): string[] {
  // startLine is the heading; body is (heading, endLine).
  return section.docLines.slice(section.startLine, section.endLine - 1)
}

/**
 * The minimal fence-aware raw scan the migration keeps for the ONE table shape
 * gfm drops: a header row + a separator row that gfm still demotes to a
 * paragraph (e.g. a stray `|`-row sits between the header and the separator, so
 * the header is not *immediately* followed by the separator). The old
 * `detectShape` classified that as `table` (it only needed a header row and a
 * separator row anywhere), and `parseTableRows` then surfaced the pinned
 * `row before separator` error. The projection forms no table block for it, so
 * this raw scan over the section body — fence-aware, exactly as the old walk —
 * recovers that classification. Returns whether the body carries both a
 * (non-separator) `|`-row and a separator row.
 */
function rawTableShape(section: Section): { seenHeader: boolean; seenSep: boolean } {
  let seenHeader = false
  let seenSep = false
  let inFence = false
  let fenceMarker: string | null = null

  for (const rawLine of sectionBodyLines(section)) {
    const fenceHit = FENCE_RE.exec(rawLine)
    if (fenceHit) {
      const marker = fenceHit[1] as string
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (fenceMarker !== null && marker[0] === fenceMarker[0]) {
        inFence = false
        fenceMarker = null
      }
      continue
    }
    if (inFence) continue
    const stripped = rawLine.trim()
    if (!stripped) continue
    if (TABLE_SEP_RE.test(rawLine)) {
      seenSep = true
      continue
    }
    if (TABLE_ROW_RE.test(rawLine)) seenHeader = true
  }
  return { seenHeader, seenSep }
}

/** Return one of: 'missing', 'table', 'bulleted-legacy', 'prose'. */
function detectShape(section: Section | null): string {
  if (section === null) return 'missing'
  // Common path: a table block present → table. gfm only forms a table block
  // when a header row is *immediately* followed by a separator row, so this is
  // the well-formed `seenHeader && seenSep` case the old raw walk classified.
  if (blocksOfKind(section.node, 'table').length > 0) return 'table'
  // Malformed-table fallback: gfm demotes a header+separator table to a
  // paragraph when they are not adjacent (a row before the separator). The old
  // walk still classified that as `table` (header row + separator row, anywhere)
  // so `parseTableRows` could surface its `row before separator` error. Recover
  // it from the fence-aware raw scan — the one case the projection drops.
  const raw = rawTableShape(section)
  if (raw.seenHeader && raw.seenSep) return 'table'
  // No table shape: a bullet list present → bulleted-legacy, else prose.
  if (blocksOfKind(section.node, 'list').length > 0) return 'bulleted-legacy'
  return 'prose'
}

/**
 * Return [rows, errors]. `rows` is a list of cell-lists with the header and
 * separator rows removed; cells carry their verbatim source text (Area keeps
 * its backticks, if any). `errors` records rows that didn't have the expected
 * column count, plus the one malformed case the projection drops (a `|`-row
 * before the separator).
 *
 * Rows are sourced from the projection's table block (its data rows are already
 * post-separator), re-split from each row's SOURCE LINE so the verbatim cell
 * text + literal cell count survive (the projection renders inline code to bare
 * text and neither pads nor truncates to the header width). When the section
 * carries `|`-rows but the projection formed NO table block (a row before any
 * separator — gfm demotes it to a paragraph), fall back to the minimal raw scan
 * that surfaces the pinned `row before separator` error.
 */
function parseTableRows(section: Section, expectedColumns: number): [string[][], string[]] {
  const rows: string[][] = []
  const errors: string[] = []

  const tableBlock = blocksOfKind(section.node, 'table')[0]
  if (tableBlock !== undefined) {
    for (let i = 0; i < tableBlock.rows.length; i++) {
      const srcLine = section.docLines[tableBlock.rowPos(i).line - 1] ?? ''
      const stripped = srcLine.trim()
      const cells = rowCellTexts(stripped)
      if (cells.length !== expectedColumns) {
        errors.push(`row has ${cells.length} cells, expected ${expectedColumns}: ${repr(stripped)}`)
        continue
      }
      rows.push(cells)
    }
    return [rows, errors]
  }

  // No table block, but `detectShape` recovered a `table` classification from a
  // header row + separator row gfm demoted to a paragraph (a row before the
  // separator). gfm gives us no rows for it, so reproduce the OLD row walk over
  // the section's raw lines — fence-aware, exactly as before — to surface the
  // pinned `row before separator` error (and a cell-count error on any
  // post-separator data row). This is the minimal raw fallback the migration
  // deliberately keeps for the one shape the projection drops.
  let headerSeen = false
  let sepSeen = false
  let inFence = false
  let fenceMarker: string | null = null
  for (const rawLine of sectionBodyLines(section)) {
    const fenceHit = FENCE_RE.exec(rawLine)
    if (fenceHit) {
      const marker = fenceHit[1] as string
      if (!inFence) {
        inFence = true
        fenceMarker = marker
      } else if (fenceMarker !== null && marker[0] === fenceMarker[0]) {
        inFence = false
        fenceMarker = null
      }
      continue
    }
    if (inFence) continue
    const stripped = rawLine.trim()
    if (!stripped) continue
    if (!TABLE_ROW_RE.test(rawLine)) continue
    if (TABLE_SEP_RE.test(rawLine)) {
      sepSeen = true
      continue
    }
    const cells = rowCellTexts(stripped)
    if (!headerSeen) {
      headerSeen = true
      continue
    }
    if (!sepSeen) {
      errors.push(`row before separator: ${repr(stripped)}`)
      continue
    }
    if (cells.length !== expectedColumns) {
      errors.push(`row has ${cells.length} cells, expected ${expectedColumns}: ${repr(stripped)}`)
      continue
    }
    rows.push(cells)
  }
  return [rows, errors]
}

function parseAreas(section: Section | null): { [k: string]: JsonValue } {
  const shape = detectShape(section)
  const out: { [k: string]: JsonValue } = { kind: shape, rows: [], errors: [] }
  if (section === null || shape !== 'table') return out

  const [rows, errs] = parseTableRows(section, 2)
  ;(out.errors as JsonValue[]).push(...errs)
  for (const cells of rows) {
    const area = cells[0] as string
    const note = cells[1] as string
    ;(out.rows as JsonValue[]).push({ area, note })
  }
  return out
}

const input = z.object({
  projectRoot: z.string(),
  /** Task-file path (absolute or project-relative) or bare basename. */
  task: z.string(),
})

// `areas` is the pinned top-level field; its inner row/error shape is the
// parser's contract (documented above) and intentionally left loose here.
const output = z.object({
  areas: z.record(z.string(), z.unknown()),
})

export default defineOp({
  noun: 'task',
  verb: 'parse-touchpoints',
  summary: 'Parse the `## Areas` table out of a task doc.',
  // Hidden plumbing ([[D-H7FS-op-substrate-surface]] §2: `parse-touchpoints*`).
  hidden: true,
  // Read-only: parses the task doc's `## Areas` table and reports its shape;
  // writes nothing.
  mutating: false,
  input,
  output,
  cli: {
    positionals: ['task'],
  },
  handler: (args) => {
    const { text } = readTaskDoc(args.projectRoot, args.task)
    const sections = splitSections(text)
    return {
      areas: parseAreas(sections.get('areas') ?? null),
    }
  },
})

export { splitSections, parseAreas }
