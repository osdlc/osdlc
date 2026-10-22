/**
 * `sdlc task scan-corpus-assumptions` — scan a task markdown body for
 * candidate "uniform-corpus" assumptions in the `## Approach` / `## Proposed`
 * sections.
 *
 * Ported off `bun run ${CLAUDE_PLUGIN_ROOT}/skills/task-ensure-ready/scan_corpus_assumptions.ts`
 * onto the op substrate ([[T-VAW3]] AC-2): that entry point's relative
 * `../../../../../lib/util/frontmatter.ts` / `.../fs.ts` imports resolved only
 * by accident of the in-repo layout and broke once the plugin was copied
 * outside this checkout. `CliHints.rawArgv` (this op's own `main`/`defineCli`
 * argv parsing, unchanged) is the escape hatch — see its doc comment on
 * `CliHints` in `lib/registry.ts`.
 *
 * This is a CANDIDATE-FINDER, not a verdict. The readiness gate
 * (solutions/ontological/plugin/plugins/sdlc/skills/task-ensure-ready/task-ensure-ready.md Step 3) feeds each emitted
 * candidate to its LLM evaluation, which makes the final call: whether the
 * Approach genuinely assumes a single uniform corpus shape while the corpus is
 * mid-migration (different instances carrying different shapes) without naming
 * the strictness/tolerance split an implementer would otherwise have to invent.
 * False positives are expected here and are resolved by the LLM step — a pure
 * regex cannot be the gate, because a corpus may legitimately be uniform.
 *
 * Modelled structurally on scan-placeholders.ts: the section boundaries and
 * fenced-code spans come from a single markdown-contract `parse` (the same
 * projection scan-placeholders.ts / parse-touchpoints.ts read), with the same
 * inline-code masking and the same JSON-line output contract. The one
 * behavioural difference is section scope (this scanner restricts itself to
 * Approach/Proposed) and the heuristic itself (see below).
 *
 * Output contract (byte-compatible with scan-placeholders.ts):
 *   - exit 0 with empty stdout when no candidates are found.
 *   - exit 0 with one JSON line per candidate (keys in order
 *     section/signal/line/snippet) when candidates are found.
 *   - exit 1 when the task file cannot be read, exit 2 when the command was
 *     typed wrong.
 *
 * Heuristic (auditable + tunable — edit the two pattern tables below):
 *
 *   A line in `## Approach` / `## Proposed` is a CANDIDATE when BOTH hold:
 *     1. The line carries UNIFORM-CORPUS phrasing — a claim that every
 *        instance in the corpus shares one shape (e.g. "every entity",
 *        "all instances", "all `definition.md`", "the corpus", "uniform
 *        shape", "each ... has the same", "assume ... same shape").
 *     2. The SURROUNDING SECTION contains NO tolerance/strictness signal —
 *        no acknowledgement that instances may differ or that the corpus is
 *        mid-migration (e.g. "legacy", "mid-migration", "tolerate", "strict
 *        vs", "both shapes", "pre-D0004", "discover()/from_dir()", "escape
 *        hatch", "version skew").
 *
 *   Condition 2 is evaluated at SECTION scope, not line scope: if the
 *   Approach anywhere names the split, the section as a whole has
 *   acknowledged it and no line in it is a candidate. This mirrors how a
 *   human reading the Approach would resolve the assumption — the relevant
 *   context is the whole section, not the single sentence.
 *
 * Masking matches scan-placeholders.ts: phrasing inside fenced code blocks
 * (``` / ~~~) and inline-code spans (`...`) is not a signal, so a task can
 * discuss "the corpus" as subject matter in code/examples without tripping
 * the heuristic. Both the uniform-corpus and the tolerance scans run against
 * the masked text.
 */

import { dirname, resolve } from 'node:path'

import { z } from 'zod'

import { defineCli, EXIT, type CliContext } from '@osdlc/cli-tool'

import { parse, sectionSpans, codeBlockLines } from 'markdown-contract'

import { defineOp, type OpCtx } from '@lib/registry'
import { isFile } from '@lib/util/fs'
import { pyJsonDumps } from '@lib/util/python-json'

import { legacyCliContext } from '@lib/util/legacy-cli.ts'
import { readTask } from '../read.ts'

// Inline code spans: `...`. Mask matches inside backticks so legitimate prose
// mentions wrapped in code do not count as signals. Allow at most a single
// embedded newline inside the span and forbid blank lines (matches
// scan-placeholders.ts).
const INLINE_CODE_RE = /`[^`\n]*(?:\n[^`\n]*)?`/g

// Sections this scanner inspects. Unlike scan-placeholders.ts (which walks all
// required sections), the corpus-assumption heuristic is only meaningful where
// the implementation design lives: Approach (a.k.a. Plan) and Proposed.
const SCOPED_SECTIONS: Record<string, string> = {
  approach: 'Approach',
  plan: 'Approach',
  proposed: 'Proposed',
}

// Uniform-corpus phrasing. Each entry: (label, regex). A match on a line is the
// first half of the candidate condition. Patterns are case-insensitive and
// global. Tune by editing this table; the module header documents the intent.
const UNIFORM_PATTERNS: Array<[string, RegExp]> = [
  ['every-entity', /\bevery\s+(?:entity|instance|file|doc|document|task|record)\b/gi],
  ['all-instances', /\ball\s+(?:entities|instances|files|docs|documents|tasks|records)\b/gi],
  ['each-same', /\beach\b[^.]*\b(?:has|have|share[s]?|carr(?:y|ies)|use[s]?)\b[^.]*\bsame\b/gi],
  ['the-corpus', /\bthe\s+(?:whole|entire)?\s*corpus\b/gi],
  ['uniform-shape', /\buniform\s+(?:shape|corpus|structure|schema|format|layout)\b/gi],
  ['same-shape', /\bsame\s+(?:shape|structure|schema|format|layout)\b/gi],
  ['assume-uniform', /\bassume[sd]?\b[^.]*\b(?:uniform|same|consistent|identical)\b/gi],
  ['consistent-across', /\bconsistent\s+across\s+(?:all|every|the)\b/gi],
]

// Tolerance / strictness signals. A match ANYWHERE in the section disqualifies
// every candidate line in that section — the Approach has acknowledged the
// split. Patterns are case-insensitive and global. Tune by editing this table.
const TOLERANCE_PATTERNS: RegExp[] = [
  /\blegacy\b/gi,
  /\bmid-?migration\b/gi,
  /\btolerat\w*\b/gi,
  /\bstrict(?:ness)?\s+vs\b/gi,
  /\bstrictness\b/gi,
  /\bboth\s+shapes\b/gi,
  /\bpre-?D-?\d{3,4}\b/gi,
  /\bdiscover\(\)/gi,
  /\bfrom_dir\(\)/gi,
  /\bescape\s+hatch\b/gi,
  /\bversion\s+skew\b/gi,
  /\bschema[-_\s]?version\s+skew\b/gi,
  /\bdifferent\s+(?:shapes|instances\s+carry|shape)\b/gi,
  /\bmixed\s+(?:shapes|corpus)\b/gi,
  /\bback[-\s]?compat\w*\b/gi,
  /\bgracefully\s+(?:handle|degrade|tolerate)\b/gi,
]

interface Candidate {
  section: string
  signal: string
  line: number // 1-indexed line number within the file
  snippet: string // the literal matched text
}

/** Replace every inline-code span with same-length spaces, preserving newlines. */
function maskInlineCode(body: string): string {
  return body.replace(INLINE_CODE_RE, (match) =>
    Array.from(match)
      .map((ch) => (ch === '\n' ? '\n' : ' '))
      .join(''),
  )
}

/** True if any tolerance/strictness pattern matches anywhere in the text. */
function hasToleranceSignal(text: string): boolean {
  for (const pat of TOLERANCE_PATTERNS) {
    pat.lastIndex = 0
    if (pat.test(text)) return true
  }
  return false
}

/**
 * Locate the scoped sections (Approach / Proposed) and their fenced-code spans
 * from a single markdown-contract `parse` of the whole document, then — for each
 * scoped section that carries NO tolerance signal — emit a candidate per
 * uniform-corpus match on each of its (non-fenced) body lines.
 *
 * Section boundaries come from mc's `sectionSpans` (fence-aware: a `##` inside a
 * fenced block is not a section) and fenced-code lines from `codeBlockLines`.
 * mc reports ABSOLUTE source line numbers, so the reported `line` is the file
 * line directly (no frontmatter offset recompute). A split named anywhere in
 * a section clears every candidate in it (the section-scoped
 * `hasToleranceSignal` gate).
 */
function scanBody(text: string): Candidate[] {
  // mc's parse (below) reports absolute source line numbers over the FULL
  // source (frontmatter included), so no frontmatter split or line-offset
  // recompute is needed here: a frontmatter-only (or empty) document simply
  // parses to zero section spans, and the loop below falls through to `[]`
  // on its own.
  //
  // Masking blanks inline-code spans so a legitimately quoted `the corpus`
  // mention is not a signal; it preserves newlines, so masked line N aligns with
  // source line N. Fenced code is skipped via mc's codeBlockLines (not the
  // masked text), so a fence marker swallowed by inline-code masking can never
  // leak in-fence content. The masked lines feed ONLY the phrase scans.
  const tree = parse(text)
  const maskedLines = maskInlineCode(text).split('\n')
  const lineCount = maskedLines.length
  const fenced = codeBlockLines(tree)

  const candidates: Candidate[] = []
  for (const { section, start, end } of sectionSpans(tree.root, lineCount)) {
    const canonical = SCOPED_SECTIONS[section.name.trim().toLowerCase()]
    if (canonical === undefined) continue // not a scoped section

    // This section's scannable body lines: its span (heading excluded) minus
    // fenced-code lines. Both the tolerance gate and the uniform scan see the
    // same set, so the check stays section-scoped.
    const scanned: Array<{ line: number; masked: string }> = []
    for (let l = Math.max(start, 1); l <= end && l <= lineCount; l++) {
      if (fenced.has(l)) continue // fenced code — opaque
      scanned.push({ line: l, masked: maskedLines[l - 1] ?? '' })
    }

    const sectionText = scanned.map((s) => s.masked).join('\n')
    if (hasToleranceSignal(sectionText)) continue // split acknowledged → no candidates

    for (const { line, masked } of scanned) {
      for (const [label, pattern] of UNIFORM_PATTERNS) {
        pattern.lastIndex = 0
        let hit: RegExpExecArray | null
        while ((hit = pattern.exec(masked)) !== null) {
          candidates.push({
            section: canonical,
            signal: label,
            line,
            snippet: hit[0].trim(),
          })
          if (hit[0].length === 0) pattern.lastIndex++
        }
      }
    }
  }
  return candidates
}

const cli = defineCli({
  name: 'sdlc task scan-corpus-assumptions',
  summary: 'Emit candidate uniform-corpus assumptions from a task body, one JSON line each.',
  flags: {},
  positionals: [{ name: 'task-file', required: true, help: 'The task markdown to scan.' }],
})

export function main(argv: readonly string[], ctx: CliContext): number {
  const parsed = cli.parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    ctx.io.stderr(`${parsed.message}\n`)
    return EXIT.usage
  }
  // Resolved to absolute up front so the entity read layer below never has
  // to guess a project root for a relative positional — `resolve()` against
  // the process cwd is exactly what the retired readFileSync-on-`path` call
  // did implicitly.
  const path = resolve(parsed.positionals[0] as string)

  if (!isFile(path)) {
    ctx.io.stderr(`task file not found: ${path}\n`)
    return EXIT.error
  }

  // Read through the entity read layer ([[T-N9PM]]) rather than a hand-rolled
  // readFileSync, per `solutions/ontological/lib/CLAUDE.md`. `readTask`
  // treats any read failure (not just ENOENT) as absent, so a race or
  // permission error here reports as "failed to read" rather than
  // propagating the raw exception.
  const read = readTask(path, { projectRoot: dirname(path) })
  if (read === null) {
    ctx.io.stderr(`failed to read ${path}\n`)
    return EXIT.error
  }

  for (const c of scanBody(read.text)) {
    ctx.io.stdout(jsonLine(c) + '\n')
  }
  return EXIT.ok
}

/**
 * Serialize a candidate the way Python `json.dumps` does by default — key
 * order section/signal/line/snippet, via the shared `pyJsonDumps`
 * (`@lib/util/python-json`), the single home for what used to be this
 * function's own hand-rolled `, `/`: ` string-building plus dedup-search.ts's
 * near-identical `pyJsonCompact`/`pyJsonIndent2`/`pyJson` ([[T-RFUT]]).
 */
function jsonLine(c: Candidate): string {
  return pyJsonDumps({
    section: c.section,
    signal: c.signal,
    line: c.line,
    snippet: c.snippet,
  })
}

export { scanBody, maskInlineCode, hasToleranceSignal }

// ---------------------------------------------------------------------------
// Op definition — CliHints.rawArgv (see lib/registry.ts): this op's whole CLI
// surface (flags, error text, exit codes) is `main`, above, unchanged from the
// retired standalone script.
// ---------------------------------------------------------------------------

const input = z.object({ argv: z.array(z.string()) })
const output = z.object({ exitCode: z.number().int() })

export default defineOp({
  path: ['task', 'scan-corpus-assumptions'],
  summary: 'Emit candidate uniform-corpus assumptions from a task body, one JSON line each.',
  hidden: true,
  input,
  output,
  cli: { rawArgv: true },
  handler: ({ argv }, ctx: OpCtx) => ({ exitCode: main(argv, legacyCliContext(ctx)) }),
})
