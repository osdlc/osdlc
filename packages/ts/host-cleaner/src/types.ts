/**
 * The plugin contract: what a plugin proposes, what it objects to, and the
 * phases the core calls it in (D-H3QW). Phases run in this order: scope,
 * discover, object, decide, re-check, prepare, delete, deleted.
 */

import type { Kind } from '@osdlc/repo-cleaner'
import type { z } from 'zod'

import type { Kit } from './kit.ts'

/** What every candidate has, whether a path or a ref. */
interface CandidateBase {
  /** `<kind>:<path>`, or `<kind>:<ref>`; unique across the run. */
  id: string
  /** Free-form, e.g. `worktree`, `branch`. */
  kind: string
  /** The plugin that deletes it, and the only one that may. */
  owner: string
  why: string
  bytes?: number | undefined
  /** What the objections rest on; the re-check compares it with repo-cleaner's `sameFingerprint`. */
  evidence: Record<string, unknown>
  /** Candidate ids that must be deleted before this one; if one is refused or dropped, so is this. */
  requires?: string[] | undefined
  /** The name a person knows it by, which `spare` matches: a branch's name, the branch a worktree has checked out. */
  name?: string | undefined
  /** True: held for review. The default leaves it out; only a pick or a selection runs it. */
  held?: boolean | undefined
  /**
   * What deleting it costs. The core holds a `lost` one for review and adds a
   * `discard-user-data` protest, so it runs only when picked and allowed.
   */
  costDescription?: CostDescription | undefined
  /**
   * True: its idle time could not be measured in the time budget. The core
   * adds an `unmeasured` protest, so it runs only with `--allow unmeasured`.
   * Kept out of `evidence`, so a walk that finishes at the re-check does not
   * read as changed.
   */
  unmeasured?: boolean | undefined
}

/** What deleting a candidate costs: fetched again, built again, or gone for good. */
export const COST_DESCRIPTIONS = ['re-download', 'rebuild', 'lost'] as const

export type CostDescription = (typeof COST_DESCRIPTIONS)[number]

/**
 * A folder its owner deletes. It must sit strictly inside one of the owner's
 * `roots` or a target, or be or sit inside a linked worktree of a repository
 * among the targets; the core refuses (`outside-roots`) one that is not, and
 * checks again right before `delete`.
 */
export interface PathCandidate extends CandidateBase {
  /** The folder, as an absolute path. */
  path: string
  ref?: undefined
  at?: undefined
}

/**
 * A thing with no folder of its own, deleted by name, such as a branch or a
 * record another program keeps. The core makes no folder checks on it and
 * never removes a folder for it.
 */
export interface RefCandidate extends CandidateBase {
  /** The name its owner deletes it by, such as a branch's name. */
  ref: string
  /** The directory it belongs to, such as a branch's repository. The ignore list is matched against it. */
  at?: string | undefined
  path?: undefined
}

/** One thing a plugin proposes for deletion: a {@link PathCandidate} or a {@link RefCandidate}. */
export type Candidate = PathCandidate | RefCandidate

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
   * Every path candidate it owns must sit strictly inside one by its real path, or inside
   * the targets (see {@link PathCandidate}); a candidate that is a link is judged by its
   * target. Without `roots`, a plugin is held to the targets alone.
   */
  roots?(ctx: Ctx): MaybePromise<readonly string[]>
  discover?(ctx: Ctx): MaybePromise<Candidate[]>
  /** Objections to any candidate in `all`. It sees no other plugin's objections. */
  object?(all: readonly Candidate[], ctx: Ctx): MaybePromise<Objection[]>
  /** Before `c` is deleted, on every plugin. A throw stops only `c`; a {@link FatalRun} stops the run. */
  prepare?(c: Candidate, ctx: Ctx): MaybePromise<void>
  /**
   * Only called on `c.owner`. Returns the receipt sentence; a throw is a failure.
   * It must act on `c.path` alone, the path the core checked against `roots`, the targets
   * and `ignore`; or, for a ref, on `c.ref` alone, and remove no folder.
   */
  delete?(c: Candidate, ctx: Ctx): MaybePromise<string>
  /** After `c` was deleted, on every other plugin. Best effort: a throw is recorded and changes nothing. */
  deleted?(c: Candidate, ctx: Ctx): MaybePromise<void>
}

/** The plugin API version this host-cleaner supports; a definition's `api` must equal it. */
export const PLUGIN_API = 1

/**
 * What `create` is told: its own entry in the config's `plugins`, validated with
 * its defaults filled in, and the git kinds `--worktrees` and `--branches` leave.
 */
export interface PluginInit<S = Record<string, unknown>> {
  settings: S
  only: readonly Kind[]
  /** The command line's environment, for a plugin that runs other programs. */
  env: Readonly<Record<string, string | undefined>>
  /** The safety helpers, bound to this plugin (see `./kit.ts`). */
  kit: Kit
}

/**
 * A plugin as one value: its name, the API it was written for, its settings
 * schema and the function that builds it. The core adds `enabled` to every
 * schema, so a plugin does not declare it.
 */
export interface PluginDefinition<S extends z.ZodObject = z.ZodObject> {
  name: string
  api: typeof PLUGIN_API
  /** The keys its entry in `plugins` may hold; an unknown key is a config error. */
  settings: S
  create(init: PluginInit<z.output<S>>): Plugin
}

/** `def`, with `create`'s settings typed from its schema. */
export const definePlugin = <S extends z.ZodObject>(
  def: PluginDefinition<S>,
): PluginDefinition<S> => def

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
