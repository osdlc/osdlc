/**
 * The contract a host integration fulfils, and the rows it adds.
 *
 * An adapter knows one thing about the machine: a build cache, a terminal
 * app, a coding agent's sessions. It detects itself, and is skipped when it
 * is absent. Its rows go through the same plan, check and run as
 * repo-cleaner's, with a fingerprint compared by repo-cleaner's rule.
 */

import type { CommandRunner } from '@osdlc/command-seam'
import type { HarnessCatalog } from '@osdlc/detect-harness'
import type { Annotate, ProcessProbe, RemoveWorktree, Verdict } from '@osdlc/repo-cleaner'

/** Machine settings, by adapter name: `{ node: { idleHours: 48 } }`. An adapter reads only its own entry. */
export interface HostConfig {
  adapters: Readonly<Record<string, Readonly<Record<string, unknown>>>>
}

/** What an adapter is given. Every shell-out it makes goes through `git` or `command`. */
export interface HostContext {
  /** The git runner repo-cleaner sweeps with. */
  git: CommandRunner
  /** A runner for any other binary, by name or path. */
  command: (binary: string) => CommandRunner
  probe: ProcessProbe
  now: () => Date
  config: HostConfig
  /**
   * What the run was pointed at. When an adapter detects, the targets as
   * given; when it gathers or executes, the roots of the repositories the
   * sweep read.
   */
  targets: readonly string[]
  /** Which coding harnesses are installed and where; null when the caller did not detect them. */
  harnesses: HarnessCatalog | null
}

/**
 * One thing an adapter owns that could go: a build artifact, a session. The
 * fields are repo-cleaner's, with a kind the adapter names. `evidence` is the
 * fingerprint: a re-check that finds it different drops the row as `changed`,
 * so it must hold what the verdict rests on, and be plain JSON.
 */
export interface HostRow {
  /** `<kind>:<name>`, unique across adapters. */
  id: string
  /** The adapter that owns the row; it alone executes it. */
  adapter: string
  /** Not one of repo-cleaner's kinds (`worktree`, `branch`, `remote`). */
  kind: string
  name: string
  verdict: Verdict
  /** What deleting it does; null for a row that can never be acted on. */
  action: string | null
  why: string
  /** Risks a person grants by name before the action runs. */
  risks: string[]
  blockers: string[]
  commands: string[]
  notes: string[]
  evidence: Record<string, unknown>
}

/** One approved step of a host row. */
export interface HostStep {
  row: HostRow
  command: string
}

export interface HostAdapter {
  /** Lower-case, unique; what `--adapter` and `--no-adapter` select. */
  name: string
  /** Cheap check: a binary on PATH, an app bundle, a config directory. */
  detect(ctx: HostContext): boolean
  /** Re-rank repo-cleaner's rows with what this host knows. Chained into every sweep and re-check. */
  annotate?: Annotate
  /** Rows this host owns. Read again at every re-check. */
  gather?(ctx: HostContext): HostRow[]
  /** Run one approved step, then verify it. Returns the sentence the receipt records; throws when it failed or could not be verified. */
  execute?(step: HostStep, ctx: HostContext): string
  /** Repositories this host knows that the sweep should read too, as absolute paths. Added to the targets unless the caller named its own. */
  discover?(ctx: HostContext): string[]
  /** Run in place of `git worktree remove` for the worktrees this host manages. */
  removeWorktree?: RemoveWorktree
}

export type HostErrorCode = 'bad-input' | 'bad-row' | 'bad-plan'

/** A refusal before anything is touched. */
export class HostCleanerError extends Error {
  constructor(
    readonly code: HostErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'HostCleanerError'
  }
}
