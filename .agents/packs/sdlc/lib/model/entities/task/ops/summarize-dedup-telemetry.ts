/**
 * `sdlc task summarize-dedup-telemetry` — summarize the JSONL log produced by
 * `sdlc task dedup-search --emit-telemetry-line`.
 *
 * Ported off `bun run ${CLAUDE_PLUGIN_ROOT}/skills/task-work/summarize_dedup_telemetry.ts`
 * onto the op substrate ([[T-VAW3]] AC-2): that entry point's relative
 * `../../../../../lib/util/fs.ts` import resolved only by accident of the
 * in-repo layout and broke once the plugin was copied outside this checkout.
 * `CliHints.rawArgv` (this op's own `main`/`defineCli` argv parsing, unchanged)
 * is the escape hatch — see its doc comment on `CliHints` in `lib/registry.ts`.
 * Not currently invoked from any skill prose (grepped: none) — a standalone
 * diagnostic a human runs by hand against a telemetry log.
 *
 * Reads each line of the log, buckets by top-candidate score, and prints a
 * histogram of LINKED-EXISTING vs SPAWNED counts per bucket plus a few
 * distribution summaries (decision counts, top-score and ratio percentiles).
 *
 * Usage renders from the flag declaration below; `--help` prints it.
 *
 * Exit codes ([[S-0015-standalone-cli-shape]]):
 *   0  summary printed
 *   1  the log is missing, unreadable, empty, or every line failed to parse
 *   2  the command was typed wrong
 */

import { readFileSync } from 'node:fs'

import { z } from 'zod'

import { defineCli, EXIT, type CliContext } from '@osdlc/cli-tool'

import { defineOp, type OpCtx } from '@lib/registry'
import { isFile } from '@lib/util/fs'
import { cmpStr } from '@lib/util/strings'

import { legacyCliContext } from '@lib/util/legacy-cli.ts'

// --- Python-compatible formatting helpers -----------------------------------
//
// Python's `{value:>width}` / `{value:<width}` (space-padded) are exactly
// `String.prototype.padStart`/`padEnd` — no wrapper needed ([[T-RFUT]]).

/**
 * Python `format(value, f">{width}.{prec}f")`. Rounds half-to-even (Python's
 * round-half-to-even / banker's rounding) and right-justifies to `width`.
 */
function fmtFloat(value: number, width: number, prec: number): string {
  const body = roundHalfEven(value, prec).toFixed(prec)
  return body.padStart(width)
}

/** Round to `prec` decimals using round-half-to-even, matching Python. */
function roundHalfEven(value: number, prec: number): number {
  if (!Number.isFinite(value)) return value
  const factor = Math.pow(10, prec)
  const scaled = value * factor
  const floor = Math.floor(scaled)
  const diff = scaled - floor
  let rounded: number
  const eps = 1e-9
  if (Math.abs(diff - 0.5) < eps) {
    // Exactly halfway — round to even.
    rounded = floor % 2 === 0 ? floor : floor + 1
  } else {
    rounded = Math.round(scaled)
  }
  return rounded / factor
}

// --- Core -------------------------------------------------------------------

export function percentile(values: number[], p: number): number {
  if (values.length === 0) {
    return 0.0
  }
  const s = [...values].sort((a, b) => a - b)
  if (s.length === 1) {
    return s[0] as number
  }
  const k = (s.length - 1) * (p / 100.0)
  const lo = Math.trunc(k)
  const hi = Math.min(lo + 1, s.length - 1)
  const frac = k - lo
  return (s[lo] as number) + ((s[hi] as number) - (s[lo] as number)) * frac
}

export interface ParsedLog {
  parsed: Record<string, unknown>[]
  errors: string[]
}

function parseLog(path: string): ParsedLog {
  const parsed: Record<string, unknown>[] = []
  const errors: string[] = []
  const text = readFileSync(path, 'utf-8')
  const rawLines = text.split('\n')
  let lineno = 0
  for (let i = 0; i < rawLines.length; i++) {
    // Skip the synthetic trailing empty segment that split() adds when the
    // file ends in a newline, so line numbering matches Python's readlines.
    if (i === rawLines.length - 1 && rawLines[i] === '') {
      break
    }
    lineno += 1
    const line = (rawLines[i] as string).trim()
    if (!line) {
      continue
    }
    let obj: unknown
    try {
      obj = JSON.parse(line)
    } catch (exc) {
      errors.push(`line ${lineno}: not valid JSON (${jsonErrMsg(exc)})`)
      continue
    }
    if (typeof obj !== 'object' || obj === null || Array.isArray(obj)) {
      errors.push(`line ${lineno}: not a JSON object`)
      continue
    }
    parsed.push(obj as Record<string, unknown>)
  }
  return { parsed, errors }
}

function jsonErrMsg(exc: unknown): string {
  // Python surfaces JSONDecodeError.msg (e.g. "Expecting value"). JS's message
  // shape differs; surface the JS message text for parity of intent.
  return exc instanceof Error ? exc.message : String(exc)
}

function bucketLabel(score: number, bucketSize: number): string {
  const lo = Math.floor(score / bucketSize) * bucketSize
  const hi = lo + bucketSize - 1
  return `${String(lo).padStart(3)}-${String(hi).padEnd(3)}`
}

function toInt(value: unknown, fallback: number): number {
  // Mirror Python int(entry.get(...)) with a try/except fallback.
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }
  if (typeof value === 'string') {
    const n = parseInt(value.trim(), 10)
    return Number.isNaN(n) ? fallback : n
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  return fallback
}

function toFloatVal(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string') {
    const n = Number(value.trim())
    return Number.isNaN(n) ? fallback : n
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0
  }
  return fallback
}

export interface SummarizeOptions {
  bucketSize: number
  percentiles: number[]
}

export function summarize(
  entries: Iterable<Record<string, unknown>>,
  opts: SummarizeOptions,
): string {
  const list = [...entries]
  const total = list.length
  if (total === 0) {
    return 'no entries'
  }

  const byDecision = new Map<string, number>()
  const buckets = new Map<string, { [k: string]: number }>()
  const scores: number[] = []
  const ratios: number[] = []
  const keywordCounts: number[] = []

  const newBucket = () => ({
    'LINKED-EXISTING': 0,
    SPAWNED: 0,
    OTHER: 0,
  })

  for (const entry of list) {
    const decision = String(entry['decision'] ?? 'OTHER')
    byDecision.set(decision, (byDecision.get(decision) ?? 0) + 1)
    const topScore = toInt(entry['top_score'], 0)
    const ratio = toFloatVal(entry['ratio'], 0.0)
    const kwCount = toInt(entry['keyword_count'], 0)
    scores.push(topScore)
    ratios.push(ratio)
    keywordCounts.push(kwCount)
    const label = bucketLabel(topScore, opts.bucketSize)
    let bucket = buckets.get(label)
    if (bucket === undefined) {
      bucket = newBucket()
      buckets.set(label, bucket)
    }
    if (decision in bucket) {
      bucket[decision] = (bucket[decision] as number) + 1
    } else {
      bucket['OTHER'] = (bucket['OTHER'] as number) + 1
    }
  }

  const lines: string[] = []
  lines.push(`entries: ${total}`)
  lines.push('')
  lines.push('decision counts:')
  for (const d of [...byDecision.keys()].sort(cmpStr)) {
    lines.push(`  ${d}: ${byDecision.get(d)}`)
  }
  lines.push('')
  lines.push(`histogram by top-candidate score (bucket size ${opts.bucketSize}):`)
  lines.push('  range    linked  spawned  other')
  for (const label of [...buckets.keys()].sort(cmpStr)) {
    const b = buckets.get(label) as { [k: string]: number }
    lines.push(
      `  ${label}    ${String(b['LINKED-EXISTING']).padStart(6)}   ` +
        `${String(b['SPAWNED']).padStart(6)}   ${String(b['OTHER']).padStart(4)}`,
    )
  }
  lines.push('')
  lines.push('percentiles:')
  for (const p of opts.percentiles) {
    lines.push(
      `  p${String(Math.trunc(p)).padEnd(2)}  ` +
        `top_score=${fmtFloat(percentile(scores, p), 5, 1)}  ` +
        `ratio=${fmtFloat(percentile(ratios, p), 5, 2)}  ` +
        `keyword_count=${fmtFloat(percentile(keywordCounts, p), 5, 1)}`,
    )
  }
  return lines.join('\n')
}

// --- CLI --------------------------------------------------------------------

const cli = defineCli({
  name: 'sdlc task summarize-dedup-telemetry',
  summary: 'Bucket a dedup-search telemetry log by top-candidate score and print the histogram.',
  flags: {
    bucketSize: {
      kind: 'string',
      valueName: 'n',
      default: '2',
      help: 'Score width of one histogram bucket. Rounded up to 1.',
    },
    percentiles: {
      kind: 'string',
      valueName: 'list',
      default: '50,75,90,95',
      help: 'Comma-separated percentiles to report for top score and ratio.',
    },
  },
  positionals: [{ name: 'log', required: true, help: 'The JSONL telemetry log to read.' }],
})

/** A comma-separated number list, or the message saying why it is not one. */
function numberList(raw: string, flag: string): number[] | { error: string } {
  const values: number[] = []
  for (const part of raw.split(',')) {
    if (part.trim() === '') continue
    const n = Number(part)
    if (Number.isNaN(n)) {
      return {
        error: `${flag} is not a comma-separated number list (could not convert '${part.trim()}')`,
      }
    }
    values.push(n)
  }
  return values
}

export function main(argv: readonly string[], ctx: CliContext): number {
  const parsed = cli.parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    ctx.io.stderr(`error: ${parsed.message}\n`)
    return EXIT.usage
  }
  const path = parsed.positionals[0] as string

  if (!isFile(path)) {
    ctx.io.stderr(`error: telemetry log not found: ${path}\n`)
    return EXIT.error
  }

  const percentiles = numberList(parsed.values.percentiles, '--percentiles')
  if ('error' in percentiles) {
    ctx.io.stderr(`error: ${percentiles.error}\n`)
    return EXIT.usage
  }

  // Parsed here rather than by commander: an unparseable `--bucket-size` used
  // to reach `Math.max(1, NaN)` and bucket everything into NaN silently.
  const bucketSize = Number(parsed.values.bucketSize)
  if (!Number.isFinite(bucketSize)) {
    ctx.io.stderr(`error: --bucket-size is not a number (got '${parsed.values.bucketSize}')\n`)
    return EXIT.usage
  }

  let result: ParsedLog
  try {
    result = parseLog(path)
  } catch (exc) {
    ctx.io.stderr(`error: could not read ${path}: ${exc}\n`)
    return EXIT.error
  }

  for (const err of result.errors) {
    ctx.io.stderr(`warning: ${err}\n`)
  }

  if (result.parsed.length === 0) {
    ctx.io.stderr('no parseable entries\n')
    return EXIT.error
  }

  ctx.io.stdout(
    summarize(result.parsed, { bucketSize: Math.max(1, bucketSize), percentiles }) + '\n',
  )
  return EXIT.ok
}

// ---------------------------------------------------------------------------
// Op definition — CliHints.rawArgv (see lib/registry.ts): this op's whole CLI
// surface (flags, defaults, error text, exit codes) is `main`, above,
// unchanged from the retired standalone script.
// ---------------------------------------------------------------------------

const input = z.object({ argv: z.array(z.string()) })
const output = z.object({ exitCode: z.number().int() })

export default defineOp({
  path: ['task', 'summarize-dedup-telemetry'],
  summary: 'Bucket a dedup-search telemetry log by top-candidate score and print the histogram.',
  hidden: true,
  input,
  output,
  cli: { rawArgv: true },
  handler: ({ argv }, ctx: OpCtx) => ({ exitCode: main(argv, legacyCliContext(ctx)) }),
})
