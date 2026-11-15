/**
 * The types the other modules share. Nothing downstream of a provider knows
 * where a rule came from: see docs/planning/decisions/D-04-one-built-in-provider.md.
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
 * A source of rule sources. The caller passes providers in; the package itself
 * reads only `CLAUDE.md` and `AGENTS.md` (`instructionFiles`).
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
   * Set when the source's files were split across several jobs: `index` is
   * 1-based, `of` is the number of shards. Absent for a source with one job.
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
  /** Set when the job's prompt crossed `maxPromptBytes`; see that setting. */
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
   * such as `claude` or `codex`. Without a custom `dispatch`, `review` refuses
   * any other name before it starts an agent.
   */
  engine: string
  /** The agent's executable. Omit to take the agent-call adapter's own. */
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
   * Most jobs in flight at once; a ceiling, not a target. A judgement takes
   * about the same time whatever its size, so a run takes about
   * `ceil(jobs / concurrency)` of them: with `maxFilesPerJob` sharding a large
   * change, a cap below the job count makes the run slower than not sharding.
   * Measurements: https://github.com/osdlc/osdlc/blob/main/packages/ts/rule-review/docs/planning/decisions/D-05-selection-by-scope.md
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
   * Prompt size, in bytes, past which a job's outcome is flagged `oversize`.
   * The job still runs: nothing is truncated or skipped, because dropping files
   * silently is worse than a weaker judgement. Set 0 to disable.
   */
  maxPromptBytes: number
  /**
   * Largest number of changed files one job may carry; 0 disables sharding. A
   * source over it is split into jobs with the same rules, which run at once:
   * a judge reasons better about a dozen diffs than sixty. Findings name the
   * source, not the shard.
   */
  maxFilesPerJob: number
}

/**
 * The settings a run uses when the caller sets none. Frozen; spread it to
 * change a field: `{ ...DEFAULT_CONFIG, blocking: true }`.
 */
export const DEFAULT_CONFIG: Readonly<ReviewConfig> = Object.freeze({
  engine: 'claude',
  // A sharded branch-wide run is one wave; see `concurrency`.
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
