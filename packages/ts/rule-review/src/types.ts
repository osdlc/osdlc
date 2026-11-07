/**
 * The vocabulary every other module in this package speaks.
 *
 * The load-bearing idea is that nothing downstream of a provider knows where
 * a rule came from. A `CLAUDE.md`, a standards document, and whatever a consumer
 * invents next all arrive as `RuleSource` — an id, some prose, and the set of
 * paths it governs. Selection, dispatch, and reporting see only that shape.
 */

import type { EffortLevel } from '@osdlc/agent-call'

/**
 * A body of rules plus the paths it governs.
 *
 * `patterns` is what makes a source selectable: intersecting it against a
 * changeset decides whether the source is dispatched at all. A `CLAUDE.md` at
 * directory `D` governs `D/**`; a provider for another corpus declares the
 * scope each of its documents governs.
 */
export interface RuleSource {
  /** Stable, unique within a run. Doubles as the intersect registry id. */
  id: string
  /** Which provider minted this, e.g. `"instruction"` or `"standard"`. */
  kind: string
  /** Repo-relative path of the file the rules were read from. */
  path: string
  /**
   * Scope specificity — path segments in the governed scope. Orders jobs and
   * findings broad-to-specific; a later cascade would group waves by it.
   */
  depth: number
  /** Glob patterns, in `@osdlc/intersect` semantics (no inference). */
  patterns: readonly string[]
  /** The rule prose handed to the judge verbatim. */
  text: string
  /** Human-facing label for reports, e.g. `"CLAUDE.md (packages/api/lib)"`. */
  label: string
}

/** What a provider is given to find its rule sources. */
export interface DiscoveryContext {
  /** Absolute path to the repository root. */
  projectRoot: string
  /**
   * Repo-relative paths in the changeset. A provider may use this to avoid
   * reading corpora that cannot be relevant, but it is not obliged to filter —
   * the planner drops non-intersecting sources regardless.
   */
  changedFiles: readonly string[]
}

/**
 * A source of rule sources.
 *
 * Providers are registered explicitly by the caller, so this package never
 * imports a rule corpus and never learns that one exists. The built-in
 * `instructionFiles` provider handles `CLAUDE.md`/`AGENTS.md`, which every
 * repository has; anything else ships from wherever that corpus is defined.
 */
export interface RuleSourceProvider {
  /** Identifies the provider in diagnostics; not required to be unique. */
  id: string
  discover(ctx: DiscoveryContext): Promise<RuleSource[]>
}

/** One rule source paired with the changed files it actually governs. */
export interface ReviewJob {
  source: RuleSource
  /** Repo-relative, non-empty — a job with no files is never planned. */
  files: readonly string[]
  /**
   * Set when the source's files were split across several jobs.
   *
   * A shard is a slice of one source's files judged by its own agent call,
   * against the same rules. Absent when the source produced a single job, so
   * the common case carries no shard vocabulary at all.
   */
  shard?: { index: number; of: number }
}

/**
 * How seriously to take a finding.
 *
 * - `violation` — the change contradicts the rule.
 * - `tension`   — defensible, but pulls against the rule's intent.
 * - `drift`     — complies today while moving away from the rule.
 */
export type Severity = 'violation' | 'tension' | 'drift'

/** Severity ordering, most to least serious. Index doubles as the rank. */
export const SEVERITY_ORDER: readonly Severity[] = Object.freeze(['violation', 'tension', 'drift'])

/** One rule breach, attributed to the source that judged it. */
export interface Finding {
  sourceId: string
  sourceKind: string
  sourcePath: string
  /** Repo-relative path of the offending file. */
  file: string
  /** 1-indexed, when the judge could point at a line. */
  line?: number
  /** Quoted from the change — what the judge is pointing at. */
  evidence: string
  /** Why that evidence breaches this source's rules. */
  why: string
  severity: Severity
}

/** What became of one planned job. */
export interface JobOutcome {
  job: ReviewJob
  findings: Finding[]
  /**
   * Set when the job produced no judgement: the agent failed or gave no
   * findings object, the run was aborted first, or none of its files had a
   * diff. Findings are then empty.
   */
  error?: string
  durationMs: number
  costUsd?: number
  /** Size of the prompt this job would send, or did. */
  promptBytes: number
  /**
   * Input tokens the engine reported, when it reported any.
   *
   * The engine's own count, not an estimate — but not directly comparable to
   * `estimateTokens(promptBytes)` either, because a CLI agent prepends its own
   * system prompt and tool definitions to whatever we sent. Recorded because
   * it is the true cost of the call; the estimate remains what a dry run has
   * to work with.
   */
  promptTokens?: number
  /**
   * Set when the job's prompt crossed `maxPromptBytes`.
   *
   * Recorded rather than acted on: the job still runs, because a partial
   * answer beats none. It exists so the quality decay that comes with an
   * oversized prompt is visible instead of inferred from a thin result.
   */
  oversize?: { bytes: number; limit: number }
}

/** Everything one review run produced. */
export interface ReviewRun {
  jobs: ReviewJob[]
  outcomes: JobOutcome[]
  /** Every outcome's findings, merged and ordered broad-to-specific. */
  findings: Finding[]
  /**
   * Sources a provider returned that matched no changed file. The built-in
   * provider does not return instruction files outside the change.
   */
  skipped: { id: string; label: string }[]
  /**
   * True when any job produced no judgement: the run is incomplete, not
   * necessarily clean. In a dry run, true when some job would not be
   * dispatched (none of its files has a diff).
   */
  degraded: boolean
  /** True when the run was planned and measured but never dispatched. */
  dryRun: boolean
}

/** Runtime knobs. Resolved by the caller, from wherever it keeps them. */
export interface ReviewConfig {
  /**
   * Agent to dispatch to: a name in `BUILTIN_AGENTS` from `@osdlc/agent-call`,
   * such as `claude` or `codex`. `review` refuses any other name before it
   * starts an agent.
   */
  engine: string
  /** The agent's executable. Omit to take the adapter's own (`claude`, `codex`, `agy`, `opencode`). */
  binary?: string
  /** Concrete model id. Omit to take the agent's default. */
  model?: string
  /** Reasoning effort. Omit to take the agent's default. */
  effort?: EffortLevel
  /**
   * Flags handed to the agent as given, before the prompt (agent-call's
   * `extraArgs`): a launch mode the model needs, such as codex's `--oss
   * --local-provider ollama` for a local model.
   */
  extraArgs?: string[]
  /**
   * Ceiling on jobs in flight, not a target — a run plans what it plans and
   * never opens more than it has. Read-only work, so this is a rate limit.
   *
   * Coupled to `maxFilesPerJob`, and the coupling is the whole story on
   * latency. A judgement costs roughly the same wall clock whatever its
   * prompt size, because the time goes on starting an agent and having it
   * reason, not on reading. So a run costs about `ceil(jobs / concurrency)`
   * of those, and sharding only pays when the extra jobs fit in the waves
   * already being run. Measured on a 63-file branch: 12 jobs at a cap of 6
   * took 190s, sharding to 30 jobs at a cap of 12 took 253s — slower, three
   * waves instead of two — and the same 30 jobs at a cap of 32 took 155s.
   * Sharding under a cap below the job count is the one configuration that
   * loses to not sharding at all.
   */
  concurrency: number
  /** Findings at or above `severityFloor` produce a non-zero exit. */
  blocking: boolean
  severityFloor: Severity
  /** Repo-relative globs removed from the changeset before planning. */
  exclude: readonly string[]
  /** Per-job wall clock. */
  timeoutMs: number
  /**
   * Prompt size, in bytes, past which a job is reported as oversized.
   *
   * Advisory only — nothing is truncated and no job is skipped, because
   * dropping files silently is a worse failure than a degraded judgement.
   * A judge asked about two hundred files reasons worse about each one than a
   * judge asked about five, and nothing else in the run surfaces that: you get
   * vaguer findings and no signal that scope caused it. Set 0 to disable.
   */
  maxPromptBytes: number
  /**
   * Largest number of changed files one job may carry. 0 disables sharding.
   *
   * The binding constraint is attention, not context. A judge handed sixty
   * diffs and a long ruleset reasons worse about each one than a judge handed
   * a dozen, well before any window fills — and the sixty-file job also sets
   * the run's wall clock, because everything else finishes while it is still
   * reading. Splitting a source's files into several same-rules jobs fixes
   * both: each judgement is narrower, and the slices run concurrently.
   *
   * Findings are attributed to the source, not the shard, so a split is
   * invisible in the output.
   */
  maxFilesPerJob: number
}

/**
 * The settings a run uses when the caller sets none. Frozen; spread it to
 * change a field: `{ ...DEFAULT_CONFIG, blocking: true }`.
 */
export const DEFAULT_CONFIG: Readonly<ReviewConfig> = Object.freeze({
  engine: 'claude',
  // High enough that a sharded branch-wide run is a single wave, which is
  // what makes sharding a win rather than a regression. A ceiling, so a
  // small changeset planning three jobs still opens three.
  concurrency: 32,
  blocking: false,
  severityFloor: 'violation',
  exclude: Object.freeze([]),
  timeoutMs: 600_000,
  // ~100k tokens at four bytes a token — generous next to a modern context
  // window, and deliberately so: this marks the point where a judgement is
  // worth distrusting, not the point where the call fails.
  maxPromptBytes: 400_000,
  // Small enough that a judge holds every diff in view at once, large enough
  // that a typical changeset does not shard at all.
  maxFilesPerJob: 12,
})
