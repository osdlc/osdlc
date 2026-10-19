/**
 * `task scan-placeholders` op — scan a task markdown body for unresolved
 * spec-drift placeholders.
 *
 * Invoked as `sdlc task scan-placeholders <task>` by the gate and any other
 * caller ([[D-0007-deterministic-op-substrate]] §2a).
 *
 * Output contract: a single JSON ARRAY of matches
 * (`{section, phrase, line, snippet}`), `[]` when none. A missing or
 * unreadable task file is an INVALID_INPUT OpError (exit 1).
 *
 * Scope: TBD, (final name ...), (or final ...), (pick one), <...>
 * angle-bracket placeholders, empty/template table cells; fenced code blocks
 * skipped; only spec-bearing sections scanned — see `TASK_BODY.specBearing`.
 *
 * SECTION + FENCE + TABLE SOURCING. The fence-aware H2 section split, the
 * fenced-code regions, and the table rows the empty-cell predicate inspects are
 * all sourced from `markdown-contract`'s projection (`parse(body)`) — the same
 * gfm-fence-aware parse `parse-touchpoints.ts` reads: the tree gives the section
 * boundaries (`root.sections`), the layer-0 `mdast` gives the code-block line
 * spans, and the projected table blocks give the row line numbers.
 *
 * The placeholder layers stay ON TOP of the tree, working over the RAW source
 * lines (NOT the projection's flattened text): the projection renders inline
 * code to bare text, which would drop the backtick masking that keeps a
 * legitimately quoted `<basename>` from being flagged — so the phrase scan still
 * runs over the raw body with `maskInlineCode` applied, preserving both the
 * inline-code masking and the verbatim matched snippets.
 */

import { parse, sectionSpans, codeBlockLines, tableRowLines } from 'markdown-contract'
import type { SectionNode } from 'markdown-contract'
import { z } from 'zod'
import { rowCellTexts } from '@osdlc/gfm-table'

import { defineOp } from '@lib/registry'
import { splitFrontmatter } from '@lib/util/frontmatter'
import { specBearingTaskSections, taskSectionLookup } from '@lib/model/entities/task/schema'

import { readTaskDoc } from './_task_doc.ts'

// Inline code spans: `...`. Mask matches inside backticks so we don't flag
// legitimate prose mentions of `<basename>` and similar. We allow at most a
// single embedded newline inside the span and forbid blank lines.
const INLINE_CODE_RE = /`[^`\n]*(?:\n[^`\n]*)?`/g

// The sections this scan covers, keyed by their accepted spellings
// (lower-cased) — sourced from `TASK_BODY`, the canonical section table, rather
// than re-spelled here. Placeholder scanning follows `specBearing`, not
// required-ness: `Proposed` is an optional section that still carries spec,
// while `Today` / `Areas` (advisory, never a readiness gate — v7) and
// `Dependencies` / `Discovery context` (narrative) all stay out.
const SPEC_SECTIONS = taskSectionLookup(specBearingTaskSections(), (s) => s.names[0])

// Phrase patterns. Each entry: (label, regex). The label is what the caller
// surfaces; the regex is matched against the line (with inline code stripped).
// All patterns are global so finditer-style iteration works.
const PHRASE_PATTERNS: Array<[string, RegExp]> = [
  // Letter/digit bounds, not `\b`: `_` is a word char, so `\b` missed `_TBD_`.
  ['TBD', /(?<![a-z0-9])TBD(?![a-z0-9])/gi],
  ['(final name ...)', /\(\s*final\s+name[^)]*\)/gi],
  ['(or final ...)', /\(\s*or\s+final[^)]*\)/gi],
  ['(pick one)', /\(\s*pick\s+one\s*\)/gi],
  ['<...>', /<[^<>\n]+>/g],
]

interface Match {
  section: string
  phrase: string
  line: number // 1-indexed line number within the file
  snippet: string // the literal matched text
}

/**
 * Return [body, lineOffset] where lineOffset is the number of lines the
 * frontmatter consumed, so line numbers can be reported against the original
 * file.
 */
function stripFrontmatter(text: string): [string, number] {
  const [fm, body] = splitFrontmatter(text)
  if (fm === null) {
    return [text, 0]
  }
  const consumed = text.slice(0, text.length - body.length)
  const offset = (consumed.match(/\n/g) || []).length
  return [body, offset]
}

/**
 * Replace every inline-code span (possibly multi-line) with a same-length
 * string of spaces (preserving newlines, so line numbers and offsets stay
 * aligned with the original body).
 */
function maskInlineCode(body: string): string {
  return body.replace(INLINE_CODE_RE, (match) =>
    Array.from(match)
      .map((ch) => (ch === '\n' ? '\n' : ' '))
      .join(''),
  )
}

/**
 * Return true if the given table-row line has at least one cell whose content
 * (between pipes, after stripping) is empty.
 */
function rowHasEmptyCell(rawLine: string): boolean {
  return rowCellTexts(rawLine.trim()).some((cell) => cell === '')
}

/**
 * Build a 1-indexed lookup (`[0]` unused, length `lineCount + 1`) mapping each
 * body line to the canonical spec-bearing-section name it belongs to, or `null`.
 * A section's body runs from the line after its `## H2` heading to the line before
 * the next top-level H2 (or EOF); the heading line itself maps to `null` and is
 * never scanned. Only depth-2 sections open a body section — matching the old
 * `^##\s+` walk, where an H1/H3 line stayed inside the enclosing H2's body.
 * Sourced from the projection via `sectionSpans` (default depth 2), so it is
 * fence-aware: a `##` inside a fenced code block is not a section.
 */
function sectionByLine(root: SectionNode, lineCount: number): Array<string | null> {
  const lineCanonical: Array<string | null> = new Array(lineCount + 1).fill(null)
  // `sectionSpans` yields each H2's body extent — `start` (line after the
  // heading) and `end` (line before the next H2, or `lineCount` at EOF), both
  // inclusive — the same next-sibling boundary math the hand-rolled walk did.
  for (const { section, start, end } of sectionSpans(root, lineCount)) {
    const canonical = SPEC_SECTIONS.get(section.name.trim().toLowerCase()) ?? null
    if (canonical === null) continue // a non-spec-bearing section's lines stay null
    for (let l = Math.max(start, 1); l <= end && l <= lineCount; l++) {
      lineCanonical[l] = canonical
    }
  }
  return lineCanonical
}

/**
 * Walk the body line-by-line — over the RAW source (so snippets are verbatim and
 * inline-code masking holds) — emitting a Match for each placeholder hit found
 * inside a required body section. Section membership, fenced-code regions, and
 * table-row lines come from the `parse(body)` projection.
 */
function scanBody(body: string, lineOffset: number): Match[] {
  const matches: Match[] = []

  const tree = parse(body)
  const docLines = body.split('\n') // 1-indexed via `docLines[line - 1]`
  const maskedLines = maskInlineCode(body).split('\n') // same length (newlines preserved)

  const lineCanonical = sectionByLine(tree.root, docLines.length)
  const fenced = codeBlockLines(tree)
  const tableLines = tableRowLines(tree.root)

  for (let bl = 1; bl <= docLines.length; bl++) {
    const canonical = lineCanonical[bl]
    if (canonical === undefined || canonical === null) continue // not in a spec-bearing section
    if (fenced.has(bl)) continue // fenced code — opaque

    const rawLine = docLines[bl - 1] as string
    const maskedLine = maskedLines[bl - 1] as string
    const absoluteLine = bl + lineOffset

    if (tableLines.has(bl) && rowHasEmptyCell(rawLine)) {
      matches.push({
        section: canonical,
        phrase: 'empty-table-cell',
        line: absoluteLine,
        snippet: rawLine.trim(),
      })
      continue
    }

    for (const [label, pattern] of PHRASE_PATTERNS) {
      pattern.lastIndex = 0
      let hit: RegExpExecArray | null
      while ((hit = pattern.exec(maskedLine)) !== null) {
        const snippet = rawLine.slice(hit.index, hit.index + hit[0].length)
        matches.push({
          section: canonical,
          phrase: label,
          line: absoluteLine,
          snippet,
        })
        if (hit[0].length === 0) pattern.lastIndex++
      }
    }
  }
  return matches
}

const input = z.object({
  projectRoot: z.string(),
  /** Task-file path (absolute or project-relative) or bare basename. */
  task: z.string(),
})

const output = z.array(
  z.object({
    section: z.string(),
    phrase: z.string(),
    line: z.number().int(),
    snippet: z.string(),
  }),
)

export default defineOp({
  noun: 'task',
  verb: 'scan-placeholders',
  summary: "Scan a task doc's spec-bearing sections for unresolved spec-drift placeholders.",
  // Hidden plumbing ([[D-H7FS-op-substrate-surface]] §2: `scan-placeholders*`).
  hidden: true,
  // Read-only: scans the task doc body and reports matches; writes nothing.
  mutating: false,
  input,
  output,
  cli: {
    positionals: ['task'],
  },
  handler: (args) => {
    const { text } = readTaskDoc(args.projectRoot, args.task)
    const [body, offset] = stripFrontmatter(text)
    return scanBody(body, offset)
  },
})

export { stripFrontmatter, scanBody, maskInlineCode, rowHasEmptyCell }
