/**
 * Parsing, ordering, and grading findings.
 *
 * A judge's reply is untrusted input even when a schema was requested — an
 * adapter may have emulated structured output by asking nicely — so every
 * field is validated here rather than cast.
 */
import type { Finding, JobOutcome, Severity, ReviewConfig, ReviewJob } from './types.ts'
import { SEVERITY_ORDER } from './types.ts'

const SEVERITIES = new Set<string>(SEVERITY_ORDER)

/**
 * Validate a judge's reply into findings, attributed to the job that produced it.
 *
 * Malformed entries are dropped rather than thrown on: one bad finding should
 * not discard the good ones from the same call.
 *
 * @param structured - `AgentResult.structured`, whatever shape it came back in.
 * @param job - The job being judged; supplies attribution and the file allowlist.
 */
export function parseFindings(structured: unknown, job: ReviewJob): Finding[] {
  if (!isRecord(structured)) return []
  const raw = structured['findings']
  if (!Array.isArray(raw)) return []

  const allowed = new Set(job.files)
  const out: Finding[] = []

  for (const entry of raw) {
    if (!isRecord(entry)) continue
    const file = entry['file']
    const evidence = entry['evidence']
    const why = entry['why']
    const severity = entry['severity']

    if (typeof file !== 'string' || typeof evidence !== 'string') continue
    if (typeof why !== 'string' || typeof severity !== 'string') continue
    if (!SEVERITIES.has(severity)) continue
    // A judge that cites a file outside its own scope has strayed past the
    // job it was given; that finding belongs to a different source, if any.
    if (!allowed.has(file)) continue

    const finding: Finding = {
      sourceId: job.source.id,
      sourceKind: job.source.kind,
      sourcePath: job.source.path,
      file,
      evidence,
      why,
      severity: severity as Severity,
    }
    const line = entry['line']
    if (typeof line === 'number' && Number.isInteger(line) && line > 0) {
      finding.line = line
    }
    out.push(finding)
  }
  return out
}

/**
 * Merge every outcome's findings into one ordered list.
 *
 * Ordered broad-to-specific by source depth, then by source id, then by
 * severity, then by location — so a report reads from repo-wide rules down to
 * local ones, each rule's findings sit together, and the worst finding under
 * each rule comes first.
 */
export function mergeFindings(outcomes: readonly JobOutcome[]): Finding[] {
  const depthOf = new Map<string, number>()
  for (const outcome of outcomes) {
    depthOf.set(outcome.job.source.id, outcome.job.source.depth)
  }

  return outcomes
    .flatMap((o) => o.findings)
    .sort((a, b) => {
      const da = depthOf.get(a.sourceId) ?? 0
      const db = depthOf.get(b.sourceId) ?? 0
      if (da !== db) return da - db
      if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1
      const sa = SEVERITY_ORDER.indexOf(a.severity)
      const sb = SEVERITY_ORDER.indexOf(b.severity)
      if (sa !== sb) return sa - sb
      if (a.file !== b.file) return a.file < b.file ? -1 : 1
      return (a.line ?? 0) - (b.line ?? 0)
    })
}

/** True when `severity` is at least as serious as the floor. */
export function meetsFloor(severity: Severity, floor: Severity): boolean {
  return SEVERITY_ORDER.indexOf(severity) <= SEVERITY_ORDER.indexOf(floor)
}

/**
 * The process exit code for a completed run.
 *
 * Returns 0 unless `blocking` is set — an advisory run reports and gets out of
 * the way. A degraded run (a job errored) does not fail on its own: an agent
 * that could not be reached is not evidence of a violation.
 */
export function exitCodeFor(
  findings: readonly Finding[],
  config: Pick<ReviewConfig, 'blocking' | 'severityFloor'>,
): number {
  if (!config.blocking) return 0
  return findings.some((f) => meetsFloor(f.severity, config.severityFloor)) ? 1 : 0
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
