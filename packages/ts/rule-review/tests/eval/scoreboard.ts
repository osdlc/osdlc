/** Renders scored runs as text for a person to read. */
import type { EvalCase, Score } from './score.ts'
import { gatingFailures } from './score.ts'

export interface RunOutcome {
  case: EvalCase
  score: Score
  /** Wall clock for the judged run, in ms. */
  durationMs: number
  /** Engine and model the run used, for the header. */
  engine: string
  model?: string
}

/** A fixed-width summary: one line per run, then a stability section and totals. */
export function renderScoreboard(outcomes: readonly RunOutcome[]): string {
  const lines: string[] = []
  const first = outcomes[0]
  if (first !== undefined) {
    lines.push(`judge: ${first.engine}${first.model === undefined ? '' : ` / ${first.model}`}`, '')
  }

  const width = Math.max(4, ...outcomes.map((o) => o.case.name.length))
  let gated = 0

  for (const outcome of outcomes) {
    const { score } = outcome
    const failures = gatingFailures(score)
    if (failures.length > 0) gated += 1

    const stretchMissed = score.missed.filter((m) => m.aspirational === true).length
    const mark = failures.length === 0 ? (stretchMissed > 0 ? '△' : '✓') : '✗'

    lines.push(
      `  ${mark} ${outcome.case.name.padEnd(width)}  ` +
        `found ${score.matched.length}/${outcome.case.expected.length}  ` +
        `spurious ${score.spurious.length}  ` +
        `unscored ${score.extra.length}  ` +
        `${(outcome.durationMs / 1000).toFixed(1)}s`,
    )
    for (const failure of failures) lines.push(`      ${failure}`)
    for (const f of score.extra) {
      lines.push(`      note: unscored ${f.severity} on ${f.file}`)
    }
  }

  const stability = renderStability(outcomes)
  if (stability !== undefined) lines.push('', stability)

  const totals = outcomes.reduce(
    (acc, o) => ({
      matched: acc.matched + o.score.matched.length,
      expected: acc.expected + o.case.expected.length,
      spurious: acc.spurious + o.score.spurious.length,
      extra: acc.extra + o.score.extra.length,
    }),
    { matched: 0, expected: 0, spurious: 0, extra: 0 },
  )

  lines.push(
    '',
    `  ${outcomes.length - gated}/${outcomes.length} cases pass` +
      ` — ${totals.matched}/${totals.expected} breaches found,` +
      ` ${totals.spurious} spurious, ${totals.extra} unscored`,
  )
  if (totals.spurious > 0) {
    lines.push(
      '  A spurious finding is the expensive kind: it is what teaches a reader',
      '  to stop reading the output.',
    )
  }
  return lines.join('\n')
}

/** Run-to-run agreement per case; undefined when every case ran once. */
function renderStability(outcomes: readonly RunOutcome[]): string | undefined {
  const byCase = new Map<string, RunOutcome[]>()
  for (const outcome of outcomes) {
    const group = byCase.get(outcome.case.name)
    if (group === undefined) byCase.set(outcome.case.name, [outcome])
    else group.push(outcome)
  }
  if ([...byCase.values()].every((runs) => runs.length < 2)) return undefined

  const lines = ['  stability']
  for (const [name, runs] of byCase) {
    if (runs.length < 2) continue
    const found = runs.map((r) => r.score.matched.length)
    const spurious = runs.map((r) => r.score.spurious.length)
    const agreed = new Set(runs.map(fingerprint)).size === 1

    lines.push(
      `    ${name}: ${runs.length} runs, found [${found.join(', ')}], ` +
        `spurious [${spurious.join(', ')}] — ` +
        (agreed ? 'identical' : 'DIVERGENT'),
    )
  }
  return lines.join('\n')
}

/** Met expectations and spurious files; the judge's wording is ignored. */
export function fingerprint(outcome: RunOutcome): string {
  const met = outcome.score.matched.map((m) => m.expected.file).sort()
  const bad = outcome.score.spurious.map((f) => f.file).sort()
  return `${met.join(',')}|${bad.join(',')}`
}
