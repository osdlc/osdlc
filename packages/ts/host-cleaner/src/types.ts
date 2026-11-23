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
  /** The thing itself. */
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
   * The directory it belongs to when `path` is not one, such as a branch's repository.
   * The ignore list is matched against this, else against `path`.
   */
  at?: string | undefined
  /** The name a person knows it by, which `spare` matches: a branch's name, the branch a worktree has checked out. */
  name?: string | undefined
  /** True: held for review. The default leaves it out; only a pick or a selection runs it. */
  held?: boolean | undefined
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

/** What a run was asked to do: what `survey`, `recheck` and `clean` take. */
export interface RunCtx {
  cwd: string
  /** The checkouts and directories in scope; `scope` is the only phase that adds to them. */
  targets: readonly string[]
  /** The protest codes granted by name. */
  allow: readonly string[]
  /** Absolute paths nothing may be deleted in or below; the core drops candidates there, a plugin may also skip them. */
  ignore?: readonly string[] | undefined
}

/** What a hook is given: the run, and a signal of its own. */
export interface Ctx extends RunCtx {
  /** Aborted when this call runs past its time limit; pass it to whatever the hook waits on. */
  signal: AbortSignal
}

/** A hook's answer, now or later. */
export type MaybePromise<T> = T | Promise<T>

/** The hooks the core calls, each under its own time limit. */
export const HOOKS = [
  'detect',
  'scope',
  'roots',
  'discover',
  'object',
  'prepare',
  'delete',
  'deleted',
] as const

export type Hook = (typeof HOOKS)[number]

/**
 * A plugin. Every hook may answer straight away or return a promise; the core
 * awaits each in turn, one plugin at a time. Each call has a time limit (see
 * `limits`): past it, `ctx.signal` is aborted and the call counts as a throw.
 */
export interface Plugin {
  name: string
  /**
   * Milliseconds per hook, replacing the default: short for every hook but
   * `delete`, which is long. For a plugin that waits on a slow program.
   */
  limits?: Partial<Record<Hook, number>> | undefined
  detect(ctx: Ctx): MaybePromise<boolean>
  /** Roots to look in, beyond the targets. */
  scope?(ctx: Ctx): MaybePromise<string[]>
  /**
   * Directories outside any checkout that this plugin cleans: fixed, or from its settings.
   * Every candidate it owns must sit strictly inside one by its real path; a candidate
   * that is a link is judged by its target. The core refuses (`outside-roots`) one that
   * does not, and checks again right before `delete`.
   */
  roots?(ctx: Ctx): MaybePromise<readonly string[]>
  discover?(ctx: Ctx): MaybePromise<Candidate[]>
  /** Objections to any candidate in `all`. It sees no other plugin's objections. */
  object?(all: readonly Candidate[], ctx: Ctx): MaybePromise<Objection[]>
  /** Before `c` is deleted, on every plugin. A throw stops only `c`; a {@link FatalRun} stops the run. */
  prepare?(c: Candidate, ctx: Ctx): MaybePromise<void>
  /**
   * Only called on `c.owner`. Returns the receipt sentence; a throw is a failure.
   * It must act on `c.path` alone: that is the path the core checked against `roots` and `ignore`.
   */
  delete?(c: Candidate, ctx: Ctx): MaybePromise<string>
  /** After `c` was deleted, on every other plugin. Best effort: a throw is recorded and changes nothing. */
  deleted?(c: Candidate, ctx: Ctx): MaybePromise<void>
}

/** Thrown from a plugin to stop the whole run, not only the candidate it was working on. */
export class FatalRun extends Error {
  override name = 'FatalRun'
}

/** Why a candidate does not run. */
export const DROP_REASONS = [
  'gone',
  'blocked',
  'not-allowed',
  'changed',
  'spared',
  'ignored',
] as const

export type DropReason = (typeof DROP_REASONS)[number]
