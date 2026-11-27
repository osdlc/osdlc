/**
 * The plugin contract: what a plugin proposes, what it objects to, and the
 * phases the core calls it in (D-H3QW). Phases run in this order: scope,
 * discover, object, decide, re-check, prepare, delete, deleted.
 */

import { z } from 'zod'

import type { CostDescription } from './cost.ts'
import { attachKit, type Kit } from './kit.ts'

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
  /**
   * True: held for review. The default leaves it out; only a pick or a selection runs it.
   * One the plan did not hold and the re-check finds held is dropped as `changed`.
   */
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
  /**
   * True: deleting it takes whatever is there by then, as a prune does. One
   * whose `bytes` are more at the re-check than in the plan counts as
   * changed; fewer do not, which `evidence` could not say.
   */
  capped?: boolean | undefined
}

export { COST_DESCRIPTIONS, type CostDescription } from './cost.ts'

/**
 * A folder its owner deletes. It must sit strictly inside one of the owner's
 * `roots` or a target, be a root its owner declared `{ path, self: true }`,
 * or be or sit inside a linked worktree of a repository a target is in, or of
 * one whose main checkout is or sits inside a target; the core refuses
 * (`outside-roots`) one that is not, and checks again right before `delete`.
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
  /**
   * True when a person named the targets, in the config or on the command
   * line; false when the CLI fell back to the folder it runs in. Unset is false.
   */
  targetsGiven?: boolean | undefined
  /** The home folder, which no root may be or hold; the process's when unset. The CLI sets it from `HOME`, as it expands `~`. */
  home?: string | undefined
  /**
   * In `detect`, the plugins survey has found active so far, in run order: a
   * plugin whose `detect` failed or ran past its limit is not among them.
   * Survey sets it; unset elsewhere.
   */
  running?: readonly string[] | undefined
  /**
   * The candidates `clean` will delete, in order; set for `roots`, `prepare`,
   * `delete` and `deleted` while `clean` runs. A caller with its own core sets
   * it to every candidate it will run before the first `prepare`: git archives
   * a repository's work once, from this list, and a `prepare` for one the list
   * leaves out archives again with the listed rows of its repository, some of
   * which may be deleted by then, which stops the run.
   */
  run?: readonly Candidate[] | undefined
}

/** What a hook is given: the run, and a signal of its own. */
export interface Ctx extends RunCtx {
  /** Aborted when this call runs past its time limit; pass it to whatever the hook waits on. */
  signal: AbortSignal
  /** {@link RunCtx.targetsGiven}, false when the run left it unset. */
  targetsGiven: boolean
}

/**
 * `detect`'s answer with a note: `active` is whether the plugin runs, and
 * `note` says why it runs degraded, or why it does not, for a person to read.
 * The core keeps the note on the survey (`Survey.notes`), and `status`, `plan`
 * and `clean` print it.
 */
export interface Detection {
  active: boolean
  note?: string | undefined
  /**
   * The variables the plugin's folders use here and the source that gave
   * each, as a descriptor's plugin gives them; `inspect` returns them, and
   * `host-cleaner plugins` shows them.
   */
  vars?: Readonly<Vars> | undefined
}

/** One variable's outcome, as a descriptor's `resolveVars` gives it. */
export interface VarValue {
  /** The folder, absolute and normalized; null when no source gave one. */
  value: string | null
  /**
   * The source that gave it, as a descriptor names it (`env XDG_CACHE_HOME`);
   * `config`; `home` for `HOME`; or `default` for an `XDG_*` folder's default.
   */
  from?: string | undefined
  /**
   * Set in the config, an `XDG_*` folder the environment sets that the folder
   * checks pass (as a built-in or read by an `env` source), or a `value` inside
   * a trusted variable's folder: its folders may sit outside home.
   */
  trusted: boolean
  /** The sources before it that gave nothing, in order, and why. */
  tried: Array<{ source: string; failed: string }>
}

/** Every variable's outcome: the built-ins, then the declared ones in the order declared. */
export type Vars = Record<string, VarValue>

const VarValueSchema = z.object({
  value: z.string().nullable(),
  from: z.string().optional(),
  trusted: z.boolean(),
  tried: z.array(z.object({ source: z.string(), failed: z.string() })),
}) satisfies z.ZodType<VarValue>

/**
 * `raw`, a `detect` answer's `vars`, as {@link Vars}; else why not. Each entry
 * is checked on its own and kept as an own key, so a variable named
 * `__proto__` stays a variable.
 */
export function parseVars(raw: unknown): { vars: Vars } | { failed: string } {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { failed: 'vars is not an object' }
  }
  const entries: Array<[string, VarValue]> = []
  for (const [name, value] of Object.entries(raw)) {
    const checked = VarValueSchema.safeParse(value)
    if (!checked.success) return { failed: `vars.${name} is not { value, from?, trusted, tried }` }
    entries.push([name, checked.data])
  }
  return { vars: Object.fromEntries(entries) }
}

/**
 * A folder a plugin cleans. A path: its candidates sit strictly inside it.
 * `{ path, self: true }`: the folder itself may be a candidate as well, for a
 * store such as `~/.npm` that is removed whole. The core refuses, with a
 * warning, a root that is the filesystem root, is or holds the home folder,
 * is a personal folder such as `~/Documents`, is or holds a target or a
 * checkout, or, for a self root, is a symlink.
 */
export type Root = string | { path: string; self: true }

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
 * Synchronous work cannot be stopped part way: a hook that answers past its
 * limit is timed out only then, and its answer dropped, but for `delete`'s,
 * which counts: it has deleted by then. So a hook that works
 * for long waits on something between two pieces of work and looks at
 * `ctx.signal`.
 */
export interface Plugin {
  name: string
  /**
   * Milliseconds per hook, replacing the default: short for every hook but
   * `delete`, which is long. For a plugin that waits on a slow program.
   */
  limits?: Partial<Record<Hook, number>> | undefined
  /**
   * Whether the plugin runs this time: `true`, `false`, or a {@link Detection}
   * that adds a note, such as why a plugin that still runs is degraded.
   */
  detect(ctx: Ctx): MaybePromise<boolean | Detection>
  /** Roots to look in, beyond the targets. */
  scope?(ctx: Ctx): MaybePromise<string[]>
  /**
   * Directories outside any checkout that this plugin cleans: fixed, or from its settings.
   * Every path candidate it owns must sit strictly inside one by its real path, be a root
   * declared `{ path, self: true }`, or sit inside the targets (see {@link PathCandidate});
   * a candidate that is a link is judged by its target. Without `roots`, a plugin is held
   * to the targets alone. See {@link Root} for the roots the core refuses.
   */
  roots?(ctx: Ctx): MaybePromise<readonly Root[]>
  discover?(ctx: Ctx): MaybePromise<Candidate[]>
  /** Objections to any candidate in `all`. It sees no other plugin's objections. */
  object?(all: readonly Candidate[], ctx: Ctx): MaybePromise<Objection[]>
  /**
   * Before `c` is deleted, on every plugin. A throw stops only `c`; a {@link FatalRun} stops the run.
   * Returns a receipt sentence when it did something the receipt must record, even if `c` then fails.
   */
  prepare?(c: Candidate, ctx: Ctx): MaybePromise<string | void>
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

/** Where a setting's value came from: the plugin's own entry, the config's top-level setting, or the default. */
export type SettingSource = 'config' | 'shared' | 'default'

/** One part of a plugin with an idle threshold of its own, as `config` shows it. */
export interface PartIdleHours {
  part: string
  idleHours: number
}

/** What `create` is told. */
export interface PluginInit<S = Record<string, unknown>> {
  /** Its own entry in the config's `plugins`, validated with its defaults filled in. */
  settings: S
  /** Where each key of `settings` came from; a key it does not name came from the default. */
  sources?: Readonly<Record<string, SettingSource>>
  /** The command line's environment, for a plugin that runs other programs. */
  env: Readonly<Record<string, string | undefined>>
  /** The safety helpers, bound to this plugin and, each run, to its roots (see `./kit.ts`). */
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
  /**
   * The idle threshold of each part that does not simply take the `idleHours`
   * setting, given that setting and where it came from: what the run uses, for
   * `config` to show.
   */
  idleHoursOf?(idleHours: number, source: SettingSource): PartIdleHours[]
}

/**
 * `def`, with `create`'s settings typed from its schema. The plugin `create`
 * returns is tied to the kit it was given, beside one it was built on instead
 * (as `cargoPlugin` without a kit is), so the core can bind each to the
 * plugin's roots each run.
 */
export const definePlugin = <S extends z.ZodObject>(
  def: PluginDefinition<S>,
): PluginDefinition<S> => ({
  ...def,
  create(init) {
    const plugin = def.create(init)
    attachKit(plugin, init.kit)
    return plugin
  },
})

/**
 * The hooks a factory host-cleaner ships gave the plugin it built. An
 * enumerable own property, so a copy such as `{ ...gitPlugin(), limits }`
 * keeps it.
 */
const SHIPPED_HOOKS = Symbol('host-cleaner shipped hooks')

type Branded = Plugin & { [SHIPPED_HOOKS]?: Partial<Record<Hook, unknown>> }

const hooksOf = (plugin: Plugin): Partial<Record<Hook, unknown>> =>
  Object.fromEntries(HOOKS.map((h) => [h, plugin[h]]))

/** `plugin`, recorded as one host-cleaner ships; each built-in plugin's factory returns through it. */
export const builtIn = (plugin: Plugin): Plugin => {
  ;(plugin as Branded)[SHIPPED_HOOKS] = hooksOf(plugin)
  return plugin
}

/**
 * Whether a factory host-cleaner ships built `plugin`, however it reached the
 * caller, copied or not: every hook is still the one that factory gave it. A
 * program that replaces a hook wrote that plugin.
 */
export const isBuiltIn = (plugin: Plugin): boolean => {
  const shipped = (plugin as Branded)[SHIPPED_HOOKS]
  return shipped !== undefined && HOOKS.every((h) => plugin[h] === shipped[h])
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
