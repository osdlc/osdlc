/**
 * The CLI output formats: `human`, `json` and `sarif`. Each takes the runner's `Finding[]` and
 * returns the text the CLI prints. None of them does IO or touches `process`. `./bin.ts` writes
 * the output.
 *
 * - `human`: a report per file and a count of findings.
 * - `json`: the findings array as it is.
 * - `sarif`: a SARIF 2.1.0 log for code scanning tools (GitHub and others).
 *
 * `formatRunSummary` gives the run summary that `validate` prints before a human report: files
 * scanned, matched and unmatched, and a count per contract when rules are named.
 *
 * This module imports `countByLevel` from core and only the `RunStats` type from the runner.
 */
import { countByLevel, type Finding, type FindingLevel } from '../core/index.js'
import type { RunStats } from '../runner/index.js'

const SARIF_SCHEMA =
  'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json'

/**
 * The human report: one `"<path>:<line> <level> <id> — <message>"` line per finding, grouped
 * by file (in first-seen order), each file's findings in the order the runner gave them. A
 * finding with no `pos` prints without `:line`. A finding with a `hint` gets an indented
 * `  hint: <text>` line below it. A last line counts findings by level. With no findings it
 * prints "No findings."
 */
export function formatHuman(findings: Finding[]): string {
  if (findings.length === 0) return 'No findings.'

  // Group by file path, in first-seen order.
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

/** `n word`, with an `s` unless `n === 1`: `1 file`, `39 files`, `6 contracts`. */
function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

/**
 * The run summary `validate` prints before the human report, so a clean run still shows which
 * files it checked.
 *
 * `labels[i]` is the contract name for `stats.matchedByRule[i]` (in `config.rules` order), or
 * `undefined` for a rule with no name (a `--contract` run). The total line always prints:
 *
 *   Scanned 12 files; 12 matched, 0 unmatched
 *
 * When any rule has a name (the `--config` form), the total line adds `across K contracts`
 * (K named rules) and one indented `  <name>: <count>` row per named rule, in rule order. A
 * named rule that matched nothing still gets a row:
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
 * The JSON report: the findings array with a two-space indent. It is exactly the runner's
 * `Finding[]`, so `JSON.parse` gives it back.
 */
export function formatJson(findings: Finding[]): string {
  return JSON.stringify(findings, null, 2)
}

/** The SARIF level for a finding level: error→"error", warn→"warning", report→"note". */
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
 * The SARIF 2.1.0 report: one run whose `tool.driver` is `markdown-contract`. `driver.rules`
 * lists each distinct finding id once. Each finding becomes one `result` with its `ruleId`,
 * `level`, `message.text` and a `physicalLocation` for the file. The location has
 * `region.startLine` when the finding has a `pos`, and no region for a whole-document finding.
 * A finding's `hint` goes in the result's `properties: { hint }`.
 */
export function formatSarif(findings: Finding[]): string {
  // Each finding id once, in first-seen order, for `driver.rules`.
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
