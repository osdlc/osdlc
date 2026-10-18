/**
 * The CLI output formatters — `human`, `json`, `sarif`. Each takes the aggregated
 * `Finding[]` from the runner and returns a string the CLI writes to stdout. Pure:
 * no IO, no `process`. `./bin.ts` owns the streams and the exit code.
 *
 * - `human`  — a readable per-file report plus a summary count.
 * - `json`   — the findings array as-is (machine-parseable, stable shape).
 * - `sarif`  — a valid SARIF 2.1.0 log for code-scanning surfaces (GitHub, etc.).
 *
 * Plus `formatRunSummary` — the additive, human-only run summary the `validate` path
 * prepends to the findings report (total files scanned/matched/unmatched, and a
 * per-contract breakdown when named rules exist). Also pure.
 *
 * Imports flow one way: cli → runner/core (types only). The only runner dependency is
 * the `RunStats` shape `formatRunSummary` renders.
 */
import { countByLevel, type Finding, type FindingLevel } from '../core/index.js'
import type { RunStats } from '../runner/index.js'

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json'

/**
 * The human report: one `"<path>:<line> <level> <id> — <message>"` line per finding,
 * grouped by file (files in first-seen order) with each file's findings in the order
 * the runner already sorted them. A finding with no `pos` prints without a `:line`;
 * a finding carrying a `hint` adds an
 * indented `  hint: <text>` line beneath its own. A trailing summary line counts
 * findings by level. An empty corpus reports "No findings."
 */
export function formatHuman(findings: Finding[]): string {
  if (findings.length === 0) return 'No findings.'

  // Group by file path, preserving first-seen order of the paths.
  const byPath = new Map<string, Finding[]>()
  for (const f of findings) {
    const list = byPath.get(f.path)
    if (list) list.push(f)
    else byPath.set(f.path, [f])
  }

  const lines: string[] = []
  for (const [path, group] of byPath) {
    for (const f of group) {
      const loc = f.pos ? `${path}:${f.pos.line}` : path
      lines.push(`${loc} ${f.level} ${f.id} — ${f.message}`)
      if (f.hint !== undefined) lines.push(`  hint: ${f.hint}`)
    }
  }

  const counts = countByLevel(findings)
  const summary = `${findings.length} finding(s): ${counts.error} error, ${counts.warn} warn, ${counts.report} report`
  lines.push('', summary)
  return lines.join('\n')
}

/** `n word` with a plural `s` unless `n === 1` — e.g. `1 file`, `39 files`, `6 contracts`. */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * The human run summary — additive evidence that the run happened and how it routed,
 * prepended to the findings report on the `validate` path (so it shows even on a clean,
 * `No findings.` run). Pure: no IO, no `process`.
 *
 * `labels[i]` is the contract name for `stats.matchedByRule[i]` (parallel to `config.rules`),
 * or `undefined` for an unnamed rule (an inline `--contract` run). The total line always prints:
 *
 *   Scanned 12 files; 12 matched, 0 unmatched
 *
 * When ANY rule is named (the `--config` form), the total line gains an `across K contracts`
 * clause (K = number of named rules) and one indented `  <name>: <count>` row per named rule,
 * in rule order — including a named rule that matched 0 (evidence it routed nothing):
 *
 *   Scanned 39 files; 38 matched across 6 contracts, 1 unmatched
 *     capability: 8
 *     …
 */
export function formatRunSummary(stats: RunStats, labels: Array<string | undefined>): string {
  const namedCount = labels.filter((l) => l !== undefined).length
  const across = namedCount > 0 ? ` across ${plural(namedCount, 'contract')}` : ''
  const total = `Scanned ${plural(stats.filesScanned, 'file')}; ${stats.filesMatched} matched${across}, ${stats.filesUnmatched} unmatched`
  if (namedCount === 0) return total

  const rows = labels.flatMap((label, i) =>
    label === undefined ? [] : [`  ${label}: ${stats.matchedByRule[i] ?? 0}`],
  )
  return [total, ...rows].join('\n')
}

/**
 * The JSON report: the findings array serialized with two-space indent. The shape is
 * exactly the `Finding[]` the runner returns, so it round-trips through `JSON.parse`.
 */
export function formatJson(findings: Finding[]): string {
  return JSON.stringify(findings, null, 2)
}

/** SARIF level mapping: error→"error", warn→"warning", report→"note". */
function sarifLevel(level: FindingLevel): 'error' | 'warning' | 'note' {
  switch (level) {
    case 'error':
      return 'error'
    case 'warn':
      return 'warning'
    case 'report':
      return 'note'
  }
}

/**
 * The SARIF 2.1.0 report. A single run whose `tool.driver` is `markdown-contract`;
 * `driver.rules` lists every distinct finding id seen (deduped), and each finding
 * becomes one `result` with its `ruleId`, mapped `level`, `message.text`, and a
 * `physicalLocation` pointing at the file (and `region.startLine` when the finding
 * has a `pos`; the region is omitted for whole-document findings). A finding's
 * `hint` rides in the result's `properties: { hint }` bag. The whole object
 * round-trips through `JSON.parse` / `JSON.stringify`.
 */
export function formatSarif(findings: Finding[]): string {
  // Distinct rule ids, in first-seen order, for the driver's rule descriptors.
  const ruleIds: string[] = []
  const seen = new Set<string>()
  for (const f of findings) {
    if (!seen.has(f.id)) {
      seen.add(f.id)
      ruleIds.push(f.id)
    }
  }

  const log = {
    version: '2.1.0',
    $schema: SARIF_SCHEMA,
    runs: [
      {
        tool: {
          driver: {
            name: 'markdown-contract',
            rules: ruleIds.map((id) => ({ id })),
          },
        },
        results: findings.map((f) => {
          const physicalLocation: {
            artifactLocation: { uri: string }
            region?: { startLine: number }
          } = {
            artifactLocation: { uri: f.path },
          }
          if (f.pos) physicalLocation.region = { startLine: f.pos.line }
          return {
            ruleId: f.id,
            level: sarifLevel(f.level),
            message: { text: f.message },
            locations: [{ physicalLocation }],
            ...(f.hint !== undefined ? { properties: { hint: f.hint } } : {}),
          }
        }),
      },
    ],
  }

  return JSON.stringify(log, null, 2)
}
