/**
 * `sdlc task dedup-search` — spawn-from-post-mortem dedup search: keyword
 * extraction, full-body scoring against unfinished tasks, and a structured
 * search-trail block that the spawning sub-agent embeds in the new task body.
 *
 * Ported off `bun run ${CLAUDE_PLUGIN_ROOT}/skills/task-work/dedup_search.ts
 * search` onto the op substrate ([[T-VAW3]] AC-2): that entry point's relative
 * `../../../../../lib/model/read.ts` and sibling imports resolved only by
 * accident of the in-repo layout and broke once the plugin was copied outside
 * this checkout. `CliHints.rawArgv` (this op's own argv parsing, unchanged, MINUS
 * the redundant `search` subcommand literal — the op path (`task dedup-search`)
 * already names the action, so callers now pass flags directly) is the escape
 * hatch — see its doc comment on `CliHints` in `lib/registry.ts`. It is also
 * necessary here specifically: this script's own `--json` flag would collide
 * with the adapter's reserved `--json` (alias for `--output json`) under the
 * normal declarative flag derivation.
 *
 * Exit codes ([[S-0015-standalone-cli-shape]]): 0 search completed, 1 a path it
 * was pointed at could not be read, 2 the command was typed wrong.
 *
 * `--extra-candidates` folds in tasks that exist only on open PR heads, so a
 * duplicate is caught at SPAWN time rather than as a filename conflict at merge
 * time. Produce the file with the companion op, which owns the git/gh reads:
 *
 *     sdlc task list-unmerged --output json > /tmp/unmerged.json
 *     sdlc task dedup-search --bullet "…" --tasks-dir … \
 *         --extra-candidates /tmp/unmerged.json
 *
 * Unmerged candidates score on the same scale as on-disk ones and are marked
 * `[unmerged, PR #N]` in the rendered search trail.
 */

import { mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { z } from 'zod'

import { defineCli, EXIT, type CliContext } from '@osdlc/cli-tool'

import { defineOp, type OpCtx } from '@lib/registry'
import { scanEntityDir } from '@lib/model/read'
import { splitFrontmatter } from '@lib/util/frontmatter'
import { isDir } from '@lib/util/fs'
import { PyFloat, pyJsonDumps } from '@lib/util/python-json'
import { escapeRegExp } from '@lib/util/strings'

import { legacyCliContext } from '@lib/util/legacy-cli.ts'

// ---------------------------------------------------------------------------
// Stopwords — common English + task/post-mortem boilerplate.
// ---------------------------------------------------------------------------

const STOPWORDS: ReadonlySet<string> = new Set([
  'the',
  'and',
  'for',
  'with',
  'from',
  'this',
  'that',
  'into',
  'when',
  'what',
  'which',
  'would',
  'could',
  'should',
  'have',
  'been',
  'were',
  'their',
  'there',
  'they',
  'them',
  'than',
  'then',
  'also',
  'more',
  'some',
  'such',
  'very',
  'much',
  'most',
  'make',
  'made',
  'doing',
  'does',
  'done',
  // task-shape boilerplate
  'task',
  'tasks',
  'spec',
  'specs',
  'step',
  'steps',
  'section',
  'sections',
  'skill',
  'skills',
  'file',
  'files',
  'code',
  'implementation',
  'implementer',
  'implementing',
  'current',
  'currently',
  'already',
  'before',
  'after',
  'rather',
  // post-mortem boilerplate words
  'post',
  'mortem',
  'post-mortem',
  'bullet',
  'bullets',
  'captured',
  'spawned',
  'linked',
  'existing',
])

export interface Candidate {
  basename: string
  score: number
  state: string
  headline: string
  /**
   * Set when the candidate came from an UNMERGED PR head rather than the
   * on-disk corpus — the open PR that carries it. Absent for on-disk rows.
   * Feed these in with `--extra-candidates` (see `UnmergedRow`).
   */
  pr?: number
}

/**
 * A task that exists only on an open PR's head ref. Shape of the `tasks[]`
 * rows emitted by `sdlc task list-unmerged --output json`; `--extra-candidates`
 * takes that payload verbatim so the two stay in lockstep.
 */
export interface UnmergedRow {
  basename: string
  state: string | null
  headline: string
  text: string
  pr_number: number
}

export interface SearchResult {
  bullet: string
  keywords: string[]
  candidates: Candidate[]
  decision: string // "SPAWNED" or "LINKED-EXISTING"
  linkTo: string | null
  block: string
}

// ---------------------------------------------------------------------------
// Keyword extraction
// ---------------------------------------------------------------------------

const TOKEN_RE = /[A-Za-z][A-Za-z0-9_-]+/g

/**
 * Pull a small keyword set from a post-mortem bullet.
 *
 * Tokenize on word boundaries, lowercase, drop stopwords and tokens under
 * 4 chars, dedupe, and take the top `maxKeywords`.
 */
export function extractKeywords(text: string, maxKeywords = 8): string[] {
  const seen: string[] = []
  const seenSet = new Set<string>()
  const firstSeenIndex = new Map<string, number>()
  for (const m of text.matchAll(TOKEN_RE)) {
    const tok = m[0].toLowerCase()
    if (tok.length < 4) continue
    if (STOPWORDS.has(tok)) continue
    if (seenSet.has(tok)) continue
    firstSeenIndex.set(tok, seen.length)
    seen.push(tok)
    seenSet.add(tok)
  }
  // Stable sort by descending length, then first-seen order as tiebreaker.
  const ordered = [...seen].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length
    return firstSeenIndex.get(a)! - firstSeenIndex.get(b)!
  })
  return ordered.slice(0, maxKeywords)
}

// ---------------------------------------------------------------------------
// Task file parsing
//
// Frontmatter comes from the entity read layer's bulk-scan primitive
// (`readRawFrontmatter` — this is a many-files state walk, not a typed
// single-entity read); the body for keyword scoring comes from the shared
// `splitFrontmatter` fence splitter. A task with missing or malformed
// frontmatter yields `null` frontmatter rather than raising — it scores with
// state "unknown" and won't be picked as a link target.
// ---------------------------------------------------------------------------

/** Return the first `#`-prefixed line's text, or empty string. */
export function extractHeadline(body: string): string {
  for (const line of body.split('\n')) {
    const stripped = line.replace(/^\s+/, '')
    if (stripped.startsWith('# ') || stripped.startsWith('#\t')) {
      return stripped.replace(/^#+/, '').trim()
    }
  }
  return ''
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

/**
 * Count keyword occurrences across the body; headline matches count double.
 *
 * Whole-word matching (`\b`) so e.g. `schema` doesn't match `schemas`.
 */
export function scoreBody(body: string, keywords: Iterable<string>, headline: string): number {
  const bodyLower = body.toLowerCase()
  const headLower = headline.toLowerCase()
  let score = 0
  for (const kw of keywords) {
    const pat = new RegExp(`\\b${escapeRegExp(kw)}\\b`, 'g')
    const bodyMatches = bodyLower.match(pat)
    score += bodyMatches ? bodyMatches.length : 0
    const headMatches = headLower.match(pat)
    score += headMatches ? headMatches.length : 0 // double-count headline matches
  }
  return score
}

/**
 * Walk every .md under `tasksDir`, score each, return top N.
 *
 * `excludeBasenames` filters files by stem BEFORE scoring.
 */
export function scoreCorpus(
  tasksDir: string,
  keywords: string[],
  topN = 5,
  excludeBasenames: Iterable<string> = [],
  extraRows: Iterable<UnmergedRow> = [],
): Candidate[] {
  const excludeSet = new Set(excludeBasenames)
  const scored: Candidate[] = []
  const seen = new Set<string>()
  // The shared bulk walk: sorted *.md rows, README skipped, one read per
  // file carrying both the hydrated fm and the raw text for body scoring.
  for (const row of scanEntityDir(tasksDir, { withText: true })) {
    if (excludeSet.has(row.basename)) continue
    seen.add(row.basename)
    const stateVal = row.fm === null ? undefined : row.fm['state']
    const state = stateVal === undefined || stateVal === null ? 'unknown' : String(stateVal)
    const [, body] = splitFrontmatter(row.text!)
    const headline = extractHeadline(body)
    const score = scoreBody(body, keywords, headline)
    if (score === 0) continue
    scored.push({ basename: row.basename, score, state, headline })
  }
  // Unmerged rows score by the SAME body rule, so an on-disk task and a
  // PR-only task are ranked on one scale. A basename already on disk is
  // skipped: the merged copy is authoritative and would otherwise appear twice.
  for (const row of extraRows) {
    if (excludeSet.has(row.basename) || seen.has(row.basename)) continue
    seen.add(row.basename)
    const [, body] = splitFrontmatter(row.text)
    const headline = row.headline || extractHeadline(body)
    const score = scoreBody(body, keywords, headline)
    if (score === 0) continue
    scored.push({
      basename: row.basename,
      score,
      state: row.state ?? 'unknown',
      headline,
      pr: row.pr_number,
    })
  }
  // Sort by score descending, then basename ascending for determinism.
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.basename < b.basename ? -1 : a.basename > b.basename ? 1 : 0
  })
  return scored.slice(0, topN)
}

// ---------------------------------------------------------------------------
// Decision and search-trail block
// ---------------------------------------------------------------------------

/**
 * Pick "SPAWNED" or "LINKED-EXISTING <basename>" from a ranked list.
 * Returns `[decision, linkToOrNull]`.
 *
 * Closed candidates are skipped rather than ending the search: most of the
 * corpus is closed, so a closed top scorer would otherwise hide an open
 * duplicate ranked just below it.
 */
export function decide(
  candidates: Candidate[],
  keywordCount: number,
  thresholdMinScore: number,
  thresholdRatio: number,
): [string, string | null] {
  const top = candidates.find((c) => !c.state.startsWith('closed/'))
  if (top === undefined) {
    return ['SPAWNED', null]
  }
  if (top.score < thresholdMinScore) {
    return ['SPAWNED', null]
  }
  if (keywordCount > 0 && top.score < thresholdRatio * keywordCount) {
    return ['SPAWNED', null]
  }
  return ['LINKED-EXISTING', top.basename]
}

export interface FormatBlockOptions {
  bullet: string
  keywords: string[]
  candidates: Candidate[]
  decision: string
  linkTo: string | null
  rationale?: string
  excludedBasenames?: Iterable<string>
}

/** Render the search-trail block for embedding in the spawned task. */
export function formatBlock(opts: FormatBlockOptions): string {
  const {
    bullet,
    keywords,
    candidates,
    decision,
    linkTo,
    rationale = '',
    excludedBasenames = [],
  } = opts
  const lines: string[] = ['### Dedup search (spawn-from-post-mortem)', '']
  lines.push(`Bullet: ${bullet.trim()}`)
  lines.push(`Keywords searched: ${keywords.length ? keywords.join(', ') : '(none)'}`)
  const excluded = [...excludedBasenames]
  if (excluded.length) {
    lines.push(`Excluded: ${excluded.join(', ')}`)
  }
  lines.push('Top candidates (score / state / headline):')
  if (candidates.length) {
    for (const c of candidates) {
      const head = c.headline ? c.headline : '(no headline)'
      // An unmerged candidate is flagged inline: it is NOT on main yet, so a
      // reader who greps the task corpus for it will come up empty.
      const origin = c.pr === undefined ? '' : ` [unmerged, PR #${c.pr}]`
      lines.push(`  - ${c.score} / ${c.state} / ${c.basename}${origin} — ${head}`)
    }
  } else {
    lines.push('  - (no candidates matched any keyword)')
  }
  if (decision === 'LINKED-EXISTING' && linkTo) {
    lines.push(`Decision: LINKED-EXISTING ${linkTo}`)
  } else {
    lines.push('Decision: SPAWNED')
  }
  if (rationale) {
    lines.push(`Rationale: ${rationale}`)
  }
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------
// Top-level search entry point
// ---------------------------------------------------------------------------

export interface RunSearchOptions {
  bullet: string
  tasksDir: string
  topN?: number
  thresholdMinScore?: number
  thresholdRatio?: number
  maxKeywords?: number
  rationale?: string
  excludeBasenames?: Iterable<string>
  /** Tasks that exist only on open PR heads — see {@link UnmergedRow}. */
  extraRows?: Iterable<UnmergedRow>
}

/** Execute one dedup search end-to-end. */
export function runSearch(opts: RunSearchOptions): SearchResult {
  const {
    bullet,
    tasksDir,
    topN = 5,
    thresholdMinScore = 6,
    thresholdRatio = 0.5,
    maxKeywords = 8,
    rationale = '',
    excludeBasenames = [],
    extraRows = [],
  } = opts
  const excluded = [...excludeBasenames]
  const keywords = extractKeywords(bullet, maxKeywords)
  const candidates = scoreCorpus(tasksDir, keywords, topN, excluded, extraRows)
  const [decision, linkTo] = decide(candidates, keywords.length, thresholdMinScore, thresholdRatio)
  const block = formatBlock({
    bullet,
    keywords,
    candidates,
    decision,
    linkTo,
    rationale,
    excludedBasenames: excluded,
  })
  return { bullet, keywords, candidates, decision, linkTo, block }
}

// ---------------------------------------------------------------------------
// Telemetry
// ---------------------------------------------------------------------------

/**
 * Append one JSON object describing this invocation to `path`.
 *
 * Creates the parent directory and the file if needed. Each line is a
 * self-contained JSON object — the file is a JSONL log.
 */
export function emitTelemetry(
  path: string,
  result: SearchResult,
  worktree: string | null = null,
  excludedBasenames: Iterable<string> = [],
): void {
  const topScore = result.candidates.length ? result.candidates[0]!.score : 0
  const keywordCount = result.keywords.length
  const ratio = keywordCount ? topScore / keywordCount : 0.0
  const payload = {
    decision: result.decision,
    link_to: result.linkTo,
    top_score: topScore,
    keyword_count: keywordCount,
    ratio: new PyFloat(ratio),
    worktree: worktree !== null ? String(worktree) : null,
    excluded: [...excludedBasenames],
  }
  const parent = dirname(path)
  mkdirSync(parent, { recursive: true })
  appendFileSync(path, pyJsonDumps(payload) + '\n', 'utf-8')
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

/**
 * Load `--extra-candidates`: the `sdlc task list-unmerged --output json`
 * payload, accepted either whole (`{tasks: [...]}`) or as a bare `[...]`.
 * Rows missing the fields the scorer needs are dropped rather than crashing —
 * but a file that is not JSON, or not one of those two shapes, throws.
 */
export function loadExtraCandidates(path: string): UnmergedRow[] {
  const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
  const rows = Array.isArray(parsed)
    ? parsed
    : ((parsed as Record<string, unknown> | null)?.['tasks'] ?? null)
  if (!Array.isArray(rows)) {
    throw new Error('expected a JSON array or an object with a `tasks` array')
  }
  return rows.flatMap((r) => {
    const o = r as Record<string, unknown>
    const basename = typeof o['basename'] === 'string' ? o['basename'] : null
    const text = typeof o['text'] === 'string' ? o['text'] : null
    const prNumber = typeof o['pr_number'] === 'number' ? o['pr_number'] : null
    if (basename === null || text === null || prNumber === null) return []
    return [
      {
        basename,
        text,
        pr_number: prNumber,
        state: typeof o['state'] === 'string' ? o['state'] : null,
        headline: typeof o['headline'] === 'string' ? o['headline'] : '',
      },
    ]
  })
}

const searchCli = defineCli({
  name: 'sdlc task dedup-search',
  summary: 'Score a post-mortem bullet against unfinished tasks and render the search trail.',
  flags: {
    bullet: {
      kind: 'string',
      valueName: 'text',
      required: true,
      help: 'The verbatim post-mortem bullet to search for.',
    },
    tasksDir: {
      kind: 'string',
      valueName: 'dir',
      required: true,
      help: 'The docs/planning/tasks directory to score against.',
    },
    topN: { kind: 'string', valueName: 'n', default: '5', help: 'How many candidates to keep.' },
    thresholdMinScore: {
      kind: 'string',
      valueName: 'n',
      default: '6',
      help: 'Score the top candidate must clear to count as a duplicate.',
    },
    thresholdRatio: {
      kind: 'string',
      valueName: 'r',
      default: '0.5',
      help: "Runner-up ratio above which the top candidate isn't decisive.",
    },
    maxKeywords: {
      kind: 'string',
      valueName: 'n',
      default: '8',
      help: 'How many keywords to extract from the bullet.',
    },
    rationale: { kind: 'string', valueName: 'text', default: '', help: 'Recorded in the trail.' },
    excludeBasename: {
      kind: 'list',
      valueName: 'basename',
      default: [],
      commaSeparated: false,
      help: 'Skip this task. Repeatable.',
    },
    emitTelemetryLine: {
      kind: 'string',
      valueName: 'path',
      help: 'Append one JSONL telemetry record to this log. Best-effort.',
    },
    worktree: { kind: 'string', valueName: 'path', help: 'Recorded in the telemetry record.' },
    extraCandidates: {
      kind: 'string',
      valueName: 'path',
      help: 'JSON from `sdlc task list-unmerged`: tasks that exist only on open PR heads.',
    },
    json: { kind: 'boolean', help: 'Print the result as JSON instead of the markdown trail.' },
    block: { kind: 'boolean', help: 'Print the markdown trail. The default.' },
  },
})

/** A flag whose value must be a number, or the message saying it is not. */
function numeric(
  raw: string,
  flag: string,
  parse: (s: string) => number,
): number | { error: string } {
  const n = parse(raw)
  return Number.isFinite(n) ? n : { error: `argument ${flag}: not a number: '${raw}'` }
}

/**
 * The op's whole CLI surface, unchanged from the retired standalone script
 * MINUS the redundant `search` subcommand literal it used to require: the op
 * path (`task dedup-search`) already names the action.
 */
export function main(argv: readonly string[], ctx: CliContext): number {
  const parsed = searchCli.parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    ctx.io.stderr(`error: ${parsed.message}\n`)
    return EXIT.usage
  }
  const flags = parsed.values

  if (flags.json && flags.block) {
    ctx.io.stderr('error: argument --block: not allowed with argument --json\n')
    return EXIT.usage
  }

  const numbers = {
    topN: numeric(flags.topN, '--top-n', (v) => parseInt(v, 10)),
    thresholdMinScore: numeric(flags.thresholdMinScore, '--threshold-min-score', (v) =>
      parseInt(v, 10),
    ),
    thresholdRatio: numeric(flags.thresholdRatio, '--threshold-ratio', parseFloat),
    maxKeywords: numeric(flags.maxKeywords, '--max-keywords', (v) => parseInt(v, 10)),
  }
  for (const value of Object.values(numbers)) {
    if (typeof value !== 'number') {
      ctx.io.stderr(`error: ${value.error}\n`)
      return EXIT.usage
    }
  }

  if (!isDir(flags.tasksDir)) {
    ctx.io.stderr(`error: tasks dir not found: ${flags.tasksDir}\n`)
    return EXIT.error
  }

  let extraRows: UnmergedRow[] = []
  if (flags.extraCandidates !== undefined) {
    try {
      extraRows = loadExtraCandidates(flags.extraCandidates)
    } catch (exc) {
      // Fail LOUDLY: silently scoring against a smaller corpus than the caller
      // asked for is the exact failure this flag exists to prevent.
      ctx.io.stderr(
        `error: could not read --extra-candidates ${flags.extraCandidates}: ${(exc as Error).message}\n`,
      )
      return EXIT.error
    }
  }

  const result = runSearch({
    bullet: flags.bullet,
    tasksDir: flags.tasksDir,
    topN: numbers.topN as number,
    thresholdMinScore: numbers.thresholdMinScore as number,
    thresholdRatio: numbers.thresholdRatio as number,
    maxKeywords: numbers.maxKeywords as number,
    rationale: flags.rationale,
    excludeBasenames: flags.excludeBasename,
    extraRows,
  })

  if (flags.emitTelemetryLine !== undefined) {
    try {
      emitTelemetry(flags.emitTelemetryLine, result, flags.worktree ?? null, flags.excludeBasename)
    } catch (exc) {
      // Telemetry is best-effort: don't fail the search just because the
      // log couldn't be appended.
      ctx.io.stderr(
        `warning: could not append telemetry to ${flags.emitTelemetryLine}: ${(exc as Error).message}\n`,
      )
    }
  }

  if (flags.json) {
    ctx.io.stdout(
      pyJsonDumps(
        {
          bullet: result.bullet,
          keywords: result.keywords,
          candidates: result.candidates.map((c) => ({
            basename: c.basename,
            score: c.score,
            state: c.state,
            headline: c.headline,
          })),
          decision: result.decision,
          link_to: result.linkTo,
          block: result.block,
        },
        2,
      ) + '\n',
    )
  } else {
    // Default to --block. The decision summary goes to stderr so the caller
    // can dispatch on it without parsing the markdown.
    const tag =
      result.decision === 'LINKED-EXISTING' ? `LINKED-EXISTING ${result.linkTo}` : 'SPAWNED'
    ctx.io.stderr(tag + '\n')
    ctx.io.stdout(result.block)
  }
  return EXIT.ok
}

// ---------------------------------------------------------------------------
// Op definition — CliHints.rawArgv (see lib/registry.ts): this op's whole CLI
// surface is `main`, above. Necessary here, not just convenient: this script's
// own `--json` would otherwise collide with the adapter's reserved `--json`.
// ---------------------------------------------------------------------------

const input = z.object({ argv: z.array(z.string()) })
const output = z.object({ exitCode: z.number().int() })

export default defineOp({
  path: ['task', 'dedup-search'],
  summary: 'Score a post-mortem bullet against unfinished tasks and render the search trail.',
  hidden: true,
  input,
  output,
  cli: { rawArgv: true },
  handler: ({ argv }, ctx: OpCtx) => ({ exitCode: main(argv, legacyCliContext(ctx)) }),
})
