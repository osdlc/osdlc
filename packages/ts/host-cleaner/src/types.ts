/**
 * The plugin contract: what a plugin proposes, what it objects to, and the
 * phases the core calls it in (D-H3QW). Phases run in this order: scope,
 * discover, object, decide, re-check, prepare, delete, deleted.
 */

/** One thing a plugin proposes for deletion. The same shape for every kind. */
export interface Candidate {
  /** `<kind>:<path>`; unique across the run. */
  id: string
  /** Free-form, e.g. `worktree`, `branch`. */
  kind: string
  /** The thing itself; for a session, its working directory. */
  path: string
  /** The plugin that deletes it, and the only one that may. */
  owner: string
  why: string
  bytes?: number | undefined
  /** What the objections rest on; the re-check compares it with repo-cleaner's `sameFingerprint`. */
  evidence: Record<string, unknown>
  /** Candidate ids that must be deleted before this one; if one is refused or dropped, so is this. */
  requires?: string[] | undefined
  /**
   * True: `--auto` may take it if nothing refuses or protests.
   * False: a run with no pick skips it.
   * Absent: a run with no pick takes it; `--auto` does not.
   */
  unattended?: boolean | undefined
}

/** How much an objection weighs: `refuse` blocks, `protest` needs `--allow <code>`, `note` informs. */
export const LEVELS = ['refuse', 'protest', 'note'] as const

export type Level = (typeof LEVELS)[number]

/** One plugin's objection to one candidate. Objections only add up. */
export interface Objection {
  by: string
  candidate: string
  level: Level
  /** `refuse`: the blocker, e.g. `live-process`. `protest`: the name `--allow` takes. */
  code: string
  reason: string
}

/** What a run was asked to do, as plugins see it. */
export interface Ctx {
  cwd: string
  /** The checkouts and directories in scope; `scope` is the only phase that adds to them. */
  targets: readonly string[]
  /** The protest codes granted by name. */
  allow: readonly string[]
}

export interface Plugin {
  name: string
  detect(ctx: Ctx): boolean
  /** Roots to look in, beyond the targets. */
  scope?(ctx: Ctx): string[]
  discover?(ctx: Ctx): Candidate[]
  /** Objections to any candidate in `all`. It sees no other plugin's objections. */
  object?(all: readonly Candidate[], ctx: Ctx): Objection[]
  /** Before `c` is deleted, on every plugin. A throw stops only `c`; a {@link FatalRun} stops the run. */
  prepare?(c: Candidate, ctx: Ctx): void
  /** Only called on `c.owner`. Returns the receipt sentence; a throw is a failure. */
  delete?(c: Candidate, ctx: Ctx): string
  /** After `c` was deleted, on every other plugin. Synchronous and best effort. */
  deleted?(c: Candidate, ctx: Ctx): void
}

/** Thrown from a plugin to stop the whole run, not only the candidate it was working on. */
export class FatalRun extends Error {
  override name = 'FatalRun'
}

/** Why a candidate does not run. */
export const DROP_REASONS = ['gone', 'blocked', 'not-allowed', 'changed'] as const

export type DropReason = (typeof DROP_REASONS)[number]
