/**
 * Scores a judge's findings against a case whose correct findings are known.
 * Pure, so the rules are unit-testable without a model.
 */
import type { Finding, Severity } from '../../src/types.ts'

/** One finding a case asserts the judge should produce. */
export interface ExpectedFinding {
  /** Repo-relative path the finding must be attributed to. */
  file: string
  /**
   * Accepted severities. Omitted means any — useful when the interesting
   * question is whether the breach was spotted at all, not how it was graded.
   */
  severity?: Severity | Severity[]
  /** Substring the judge's quoted `evidence` must contain, case-insensitive. */
  evidence?: string
  /** Substring the judge's `why` must contain, case-insensitive. */
  why?: string
  /**
   * Tracked but never gating — a case at the frontier of what the judge
   * currently manages. It appears in the scoreboard so a future improvement is
   * visible, without a known-hard case holding the suite red.
   */
  aspirational?: boolean
}

/** A changeset with a known answer. */
export interface EvalCase {
  name: string
  /** Findings the judge is expected to produce. */
  expected: ExpectedFinding[]
  /**
   * Files that must produce NO finding at all.
   *
   * This is the load-bearing half. Anything can score well on `expected` by
   * reporting everything; only a file that LOOKS guilty and is not can tell a
   * judge that reads code from one that pattern-matches strings.
   */
  clean: string[]
}

/** What became of one expectation. */
export interface MatchedFinding {
  expected: ExpectedFinding
  finding: Finding
}

export interface Score {
  /** Expectations a finding satisfied. */
  matched: MatchedFinding[]
  /** Expectations nothing satisfied — the judge missed these. */
  missed: ExpectedFinding[]
  /**
   * Findings on files the case declares clean. The headline failure: the judge
   * invented a breach where the code complies.
   */
  spurious: Finding[]
  /**
   * Findings on files that are neither expected nor declared clean, and
   * surplus findings on a file whose expectation was already satisfied.
   *
   * Reported but not scored: the case makes no claim about them.
   */
  extra: Finding[]
  /**
   * matched / (matched + spurious) — over the findings the case can actually
   * judge. 1 when nothing scoreable was reported.
   *
   * `extra` is excluded: nested rule sources can report the same real breach
   * more than once, and that is not a false positive.
   */
  precision: number
  /** matched / expected. 1 when nothing was expected. */
  recall: number
}

/**
 * Score one run's findings against a case.
 *
 * Matching is greedy in case order and one-to-one: an expectation consumes at
 * most one finding, and a finding satisfies at most one expectation. Both
 * halves matter — without the first, one sprawling finding could satisfy every
 * expectation for a file; without the second, a judge could pad its precision
 * by restating the same breach.
 */
export function scoreCase(findings: readonly Finding[], evalCase: EvalCase): Score {
  const clean = new Set(evalCase.clean)
  const taken = new Set<Finding>()

  const matched: MatchedFinding[] = []
  const missed: ExpectedFinding[] = []

  for (const expected of evalCase.expected) {
    const hit = findings.find((f) => !taken.has(f) && satisfies(f, expected))
    if (hit === undefined) {
      missed.push(expected)
      continue
    }
    taken.add(hit)
    matched.push({ expected, finding: hit })
  }

  const spurious: Finding[] = []
  const extra: Finding[] = []
  for (const finding of findings) {
    if (taken.has(finding)) continue
    ;(clean.has(finding.file) ? spurious : extra).push(finding)
  }

  const scoreable = matched.length + spurious.length
  return {
    matched,
    missed,
    spurious,
    extra,
    // A run that reports nothing scoreable is vacuously precise. Saying so
    // beats 0/0.
    precision: scoreable === 0 ? 1 : matched.length / scoreable,
    recall: evalCase.expected.length === 0 ? 1 : matched.length / evalCase.expected.length,
  }
}

/** Does one finding satisfy one expectation? */
function satisfies(finding: Finding, expected: ExpectedFinding): boolean {
  if (finding.file !== expected.file) return false

  if (expected.severity !== undefined) {
    const accepted = Array.isArray(expected.severity) ? expected.severity : [expected.severity]
    if (!accepted.includes(finding.severity)) return false
  }
  // Substring, case-insensitive, on purpose: the judge writes prose, and
  // asserting its exact wording would make every case a brittle transcript of
  // one model's phrasing rather than a claim about what it noticed.
  if (!contains(finding.evidence, expected.evidence)) return false
  if (!contains(finding.why, expected.why)) return false
  return true
}

function contains(haystack: string, needle: string | undefined): boolean {
  return needle === undefined || haystack.toLowerCase().includes(needle.toLowerCase())
}

/**
 * Whether a score gates the suite.
 *
 * Per-expectation, never an aggregate threshold: "0.82" names nothing a person
 * can act on, whereas "missed the child_process import in src/shell.ts" does.
 * An aspirational expectation is excused; a spurious finding never is, since
 * nothing about it is at the frontier — the case asserts that file complies.
 */
export function gatingFailures(score: Score): string[] {
  const failures: string[] = []

  for (const miss of score.missed) {
    if (miss.aspirational === true) continue
    failures.push(`missed: ${describe(miss)}`)
  }
  for (const f of score.spurious) {
    failures.push(
      `spurious: ${f.file} reported ${f.severity} on a file the case declares clean — ${firstLine(f.why)}`,
    )
  }
  return failures
}

function describe(expected: ExpectedFinding): string {
  const bits = [expected.file]
  if (expected.severity !== undefined) {
    bits.push(Array.isArray(expected.severity) ? expected.severity.join('|') : expected.severity)
  }
  if (expected.evidence !== undefined) bits.push(`evidence~"${expected.evidence}"`)
  if (expected.why !== undefined) bits.push(`why~"${expected.why}"`)
  return bits.join(' ')
}

function firstLine(text: string): string {
  return (text.split('\n')[0] ?? '').slice(0, 100)
}
