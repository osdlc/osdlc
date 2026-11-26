/**
 * The phase runner. `survey` is scope, discover and object; `decide` and
 * `recheck` pick what runs; `clean` is prepare, delete and deleted.
 */

import { homedir } from 'node:os'
import { dirname } from 'node:path'

import { globRegExp, isGlob, sameFingerprint } from '@osdlc/repo-cleaner'

import { errorText, realOr } from './helpers.ts'
import { coveredBy, containsIgnored } from './ignore.ts'
import { bindKit } from './kit.ts'
import { acceptRoots, boundBy, gitReads, linkedCheckouts, type Bounds } from './roots.ts'
import {
  CandidateSchema,
  ObjectionSchema,
  writeReceipt,
  PLAN_VERSION,
  RECEIPT_VERSION,
  type Dropped,
  type Plan,
  type Receipt,
  type Step,
} from './plan.ts'
import {
  FatalRun,
  isBuiltIn,
  type Candidate,
  type Ctx,
  type Detection,
  type Hook,
  type MaybePromise,
  type Objection,
  type PathCandidate,
  type Plugin,
  type RunCtx,
} from './types.ts'

/** The refusal for a path candidate that is not inside its owner's roots or the targets. */
export const OUTSIDE_ROOTS = 'outside-roots'

/** The protest on a candidate whose `costDescription` is `lost`. */
export const DISCARD_USER_DATA = 'discard-user-data'

/** The protest on a candidate whose idle time could not be measured in the time budget (D11). */
export const UNMEASURED = 'unmeasured'

export { errorText } from './helpers.ts'

/** The time limit, in milliseconds, of every hook but `delete`, unless the plugin asks for another. */
export const HOOK_LIMIT_MS = 30_000

/** The time limit, in milliseconds, of `delete`, unless the plugin asks for another. */
export const DELETE_LIMIT_MS = 10 * 60_000

/** A hook that ran past its time limit, stopped there or late with its answer. The core reports it as it would a throw. */
export class HookTimeout extends Error {
  override name = 'HookTimeout'
}

/** The longest delay `setTimeout` keeps; a longer one fires at once. */
const MAX_DELAY_MS = 2 ** 31 - 1

/** Whether `ms` is a time limit the core takes: a positive number of milliseconds. */
const validLimit = (ms: unknown): ms is number =>
  typeof ms === 'number' && Number.isFinite(ms) && ms > 0

/** The time limit of `hook` on `p`: its own when valid, else the default. */
const limitOf = (p: Plugin, hook: Hook): number => {
  const own = p.limits?.[hook]
  return validLimit(own) ? own : hook === 'delete' ? DELETE_LIMIT_MS : HOOK_LIMIT_MS
}

/**
 * Calls one hook of `p` under its time limit, as {@link callWithin} does,
 * except that `delete`'s answer counts however late it comes: by then it has
 * deleted, and the receipt and the `deleted` hooks must hear so.
 */
const callHook = <T>(
  p: Plugin,
  hook: Hook,
  ctx: RunCtx,
  f: (ctx: Ctx) => MaybePromise<T>,
): Promise<T> => answerWithin(limitOf(p, hook), ctx, f, hook === 'delete')

/**
 * Calls `f` with `ctx`, `targetsGiven` defaulted and a signal of its own, and
 * awaits its answer. Past `ms` the signal is aborted and {@link HookTimeout}
 * thrown. How the core calls every hook (but a late `delete`, whose answer it
 * keeps); the contract suite calls `delete` so.
 *
 * Nothing can stop `f` while it works synchronously: the timer fires only when
 * `f` waits on something. One that then answers past `ms` is late like any
 * other: its answer is dropped, the signal aborted and {@link HookTimeout}
 * thrown. One that throws late keeps its own error, so a {@link FatalRun}
 * still stops the run.
 */
export function callWithin<T>(
  ms: number,
  ctx: RunCtx,
  f: (ctx: Ctx) => MaybePromise<T>,
): Promise<T> {
  return answerWithin(ms, ctx, f, false)
}

/** {@link callWithin}; with `keepLate`, an answer that comes past `ms` is returned, not dropped. */
async function answerWithin<T>(
  ms: number,
  ctx: RunCtx,
  f: (ctx: Ctx) => MaybePromise<T>,
  keepLate: boolean,
): Promise<T> {
  const controller = new AbortController()
  const limit = Math.min(ms, MAX_DELAY_MS)
  const started = performance.now()
  const isLate = (): boolean => performance.now() - started > limit
  const timeOut = (): HookTimeout => {
    const err = new HookTimeout(`timed out after ${ms} ms`)
    controller.abort(err)
    return err
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(timeOut()), limit)
  })
  try {
    // An async wrapper, so a synchronous throw arrives as a rejection.
    const answer = (async () =>
      f({ ...ctx, targetsGiven: ctx.targetsGiven ?? false, signal: controller.signal }))()
    const answered = await Promise.race([answer, late])
    if (isLate() && !keepLate) throw timeOut()
    return answered
  } catch (err) {
    if (isLate()) timeOut()
    throw err
  } finally {
    clearTimeout(timer)
  }
}

export interface Survey {
  /** The detected plugins, in order. */
  plugins: Plugin[]
  /** The run's context after `scope`. */
  ctx: RunCtx
  candidates: Candidate[]
  objections: Objection[]
  warnings: string[]
  /** The linked worktrees of the repositories the targets are in, which path candidates may be or sit in. A linked worktree whose main checkout is in a target is found per candidate instead. */
  linked: string[]
  /** Each detected plugin's roots by path, as its `roots` hook answered less those the core refused; none for a plugin without the hook. */
  roots: Record<string, readonly string[]>
  /** The roots among `roots` each detected plugin declared `{ path, self: true }`, which may be candidates themselves. */
  selfRoots: Record<string, readonly string[]>
  /** The note each plugin's `detect` gave with its answer, by plugin name, whether it runs or not. */
  notes: Record<string, string>
}

/**
 * `detect`'s answer as whether the plugin runs and its note; null when it is
 * neither a boolean nor a {@link Detection} with a boolean `active` and a
 * string or no `note`.
 */
function detection(answer: unknown): { active: boolean; note?: string } | null {
  if (typeof answer === 'boolean') return { active: answer }
  if (typeof answer !== 'object' || answer === null) return null
  const { active, note } = answer as Partial<Record<keyof Detection, unknown>>
  if (typeof active !== 'boolean') return null
  if (note === undefined) return { active }
  return typeof note === 'string' ? { active, note } : null
}

/** The ignore entry a candidate sits in, or a path candidate holds (deleting a directory takes what is inside it). */
function ignoredBy(c: Candidate, ignore: readonly string[]): string | undefined {
  if (c.path === undefined) return c.at === undefined ? undefined : coveredBy(c.at, ignore)
  return coveredBy(c.path, ignore) ?? containsIgnored(c.path, ignore)
}

/**
 * Why `c` is neither a path candidate nor a ref candidate, or null when it is
 * one: a string `path` and no `ref` or `at`, or a string `ref`, a string or no
 * `at`, and no `path`. A plugin written in JavaScript can send anything.
 */
function misshapen(c: Candidate): string | null {
  const path = c.path as unknown
  const ref = c.ref as unknown
  const at = c.at as unknown
  if ((typeof path === 'string') === (typeof ref === 'string')) {
    return 'which must have one of a path and a ref'
  }
  if (typeof path === 'string') {
    if (ref !== undefined) return 'which must have one of a path and a ref'
    if (at !== undefined) return 'a path candidate with an at, which only a ref may have'
    return null
  }
  if (path !== undefined) return 'which must have one of a path and a ref'
  if (at !== undefined && typeof at !== 'string') return 'whose at is not a path'
  return null
}

/**
 * Why a plan would refuse `c`, one of a path and a ref, by the plan's own
 * {@link CandidateSchema}, so survey never keeps a candidate `clean --plan`
 * then refuses; null when the plan takes it.
 */
function unplannable(c: Candidate): string | null {
  const [pathShape, refShape] = CandidateSchema.options
  const read = (c.path === undefined ? refShape : pathShape).safeParse(c)
  if (read.success) return null
  const issue = read.error.issues[0]!
  return `whose ${issue.path.join('.') || 'shape'} a plan refuses: ${issue.message}`
}

/** Why `bounds` does not hold path candidate `c`, or null when it does. */
function outside(c: PathCandidate, bounds: Bounds): string | null {
  if (boundBy(bounds, c.path) !== null) return null
  return `${c.path} is not inside ${c.owner}'s roots (${bounds.roots.join(', ') || 'none'}) or the targets`
}

/**
 * `cs`, each path candidate copied with every other one inside it by real path
 * added to its `requires`: deleting it would delete them too.
 */
function nest(cs: readonly Candidate[]): Candidate[] {
  const real = new Map<string, string>()
  const byReal = new Map<string, string>()
  for (const c of cs) {
    if (c.path === undefined) continue
    real.set(c.id, realOr(c.path))
    byReal.set(real.get(c.id)!, c.id)
  }
  const inner = new Map<string, string[]>()
  for (const [id, path] of real) {
    for (let dir = dirname(path); ; dir = dirname(dir)) {
      const outer = byReal.get(dir)
      if (outer !== undefined) inner.set(outer, [...(inner.get(outer) ?? []), id])
      if (dirname(dir) === dir) break
    }
  }
  return cs.map((c) => {
    const ids = inner.get(c.id)
    return ids === undefined ? c : { ...c, requires: [...new Set([...(c.requires ?? []), ...ids])] }
  })
}

/** Calls one hook; a throw or a timeout, other than {@link FatalRun}, is a warning and the fallback. */
const guard =
  (warnings: string[]) =>
  async <T>(
    p: Plugin,
    hook: Hook,
    fallback: T,
    at: RunCtx,
    f: (ctx: Ctx) => MaybePromise<T>,
  ): Promise<T> => {
    try {
      return await callHook(p, hook, at, f)
    } catch (err) {
      if (err instanceof FatalRun) throw err
      warnings.push(`${p.name}: ${hook} failed: ${errorText(err)}`)
      return fallback
    }
  }

/** `answer` when it is a list; otherwise none, with a warning. */
const listFrom = (p: Plugin, hook: Hook, answer: unknown, warnings: string[]): unknown[] => {
  if (Array.isArray(answer)) return answer
  warnings.push(
    `${p.name}: ${hook} answered ${JSON.stringify(answer) ?? String(answer)}, which is not a list; it proposed nothing`,
  )
  return []
}

/** What `detect` said of one plugin. */
interface Detected {
  plugin: Plugin
  detected: boolean
  /** The note `detect` gave with its answer. */
  note?: string | undefined
  /** What `detect` threw or timed out with, or why its answer was left out; absent when it answered a boolean or a {@link Detection}. */
  error?: string | undefined
  /** Whether `skip` left it out, so its `detect` did not run. */
  skipped?: true | undefined
}

/**
 * Each plugin's detection, in the order of `all`; a second plugin of a name is
 * left out, and a `limits` entry the core does not take is ignored, each with
 * a warning. A plugin `skip` picks is listed as skipped and its `detect` not
 * run. A failed `detect` is its plugin's `error`, and a warning too when
 * `warnFailures` is set, in its place among the others.
 */
async function detectAll(
  all: readonly Plugin[],
  ctx: RunCtx,
  warnings: string[],
  { warnFailures, skip }: { warnFailures: boolean; skip?: ((p: Plugin) => boolean) | undefined },
): Promise<Detected[]> {
  // No kit keeps an earlier run's bounds while this one's hooks run.
  for (const p of all) bindKit(p, undefined)
  const names = new Set<string>()
  const detections: Detected[] = []
  for (const p of all) {
    if (names.has(p.name)) {
      warnings.push(`${p.name}: a second plugin of that name was left out`)
      continue
    }
    names.add(p.name)
    if (skip?.(p) === true) {
      detections.push({ plugin: p, detected: false, skipped: true })
      continue
    }
    for (const [hook, ms] of Object.entries(p.limits ?? {})) {
      if (ms !== undefined && !validLimit(ms)) {
        warnings.push(
          `${p.name}: limits.${hook} is ${String(ms)}, not a positive number of milliseconds; the default was used`,
        )
      }
    }
    let answer: unknown
    try {
      answer = await callHook<unknown>(p, 'detect', ctx, (x) => p.detect(x))
    } catch (err) {
      if (err instanceof FatalRun) throw err
      const error = errorText(err)
      if (warnFailures) warnings.push(`${p.name}: detect failed: ${error}`)
      detections.push({ plugin: p, detected: false, error })
      continue
    }
    const found = detection(answer)
    if (found === null) {
      const error = `detect answered ${JSON.stringify(answer) ?? String(answer)}, which is neither a boolean nor { active, note? }`
      if (warnFailures) warnings.push(`${p.name}: ${error}; it was left out`)
      detections.push({ plugin: p, detected: false, error })
      continue
    }
    detections.push({ plugin: p, detected: found.active, note: found.note })
  }
  return detections
}

/**
 * The context whose targets the detected `plugins`' `scope` added to, less
 * those `ignore` covers; a failed `scope`, or an answer or entry the core does
 * not take, is a warning.
 */
async function scopeOf(
  plugins: readonly Plugin[],
  ctx: RunCtx,
  warnings: string[],
): Promise<RunCtx> {
  const guarded = guard(warnings)
  const ignore = ctx.ignore ?? []
  const targets = ctx.targets.filter((t) => coveredBy(t, ignore) === undefined)
  for (const p of plugins) {
    if (p.scope === undefined) continue
    const answer = await guarded<unknown>(p, 'scope', [], ctx, (x) => p.scope!(x))
    for (const root of listFrom(p, 'scope', answer, warnings)) {
      if (typeof root !== 'string') {
        warnings.push(`${p.name}: scope: left out ${JSON.stringify(root)}, which is not a path`)
        continue
      }
      if (!targets.includes(root) && coveredBy(root, ignore) === undefined) targets.push(root)
    }
  }
  return { ...ctx, targets }
}

const detectedOf = (detections: readonly Detected[]): Plugin[] =>
  detections.filter((d) => d.detected).map((d) => d.plugin)

/**
 * Each of `plugins`' roots, asked once per plugin so a throwing `roots` warns
 * once, less those the core refuses (see `rootProblem` in `./roots.ts`), each
 * with a warning; and the linked checkouts and home they were checked against.
 * The linked checkouts run `git` once per target, so they are found only when
 * a plugin has `roots` or the caller asks for them.
 */
async function askRoots(
  plugins: readonly Plugin[],
  scoped: RunCtx,
  warnings: string[],
): Promise<{
  rootsOf: Map<string, { roots: readonly string[]; self: readonly string[] }>
  linked: () => string[]
  home: string
}> {
  const guarded = guard(warnings)
  let found: string[] | undefined
  const linked = (): string[] => (found ??= linkedCheckouts(scoped.targets))
  const home = scoped.home ?? homedir()
  const rootsOf = new Map<string, { roots: readonly string[]; self: readonly string[] }>()
  for (const p of plugins) {
    if (p.roots === undefined) continue
    const answer = await guarded<unknown>(p, 'roots', [], scoped, (x) => p.roots!(x))
    const accepted = acceptRoots(answer, { targets: scoped.targets, linked: linked(), home })
    for (const problem of accepted.problems) warnings.push(`${p.name}: roots: ${problem}`)
    rootsOf.set(p.name, accepted)
  }
  return { rootsOf, linked, home }
}

/** One plugin as `inspect` found it. */
export interface PluginState {
  name: string
  detected: boolean
  /** Set when a factory host-cleaner ships built it. */
  builtIn?: true | undefined
  /** Set when `skip` picked it: its `detect` did not run, so it is not detected. */
  skipped?: true | undefined
  /** Why it was not detected: what `detect` threw or timed out with, or why its answer was left out. Absent when `detect` answered a boolean or a {@link Detection}. */
  reason?: string | undefined
  /** The note `detect` gave with its answer, whether the plugin is detected or not. */
  note?: string | undefined
  /** Its roots by path, as its `roots` hook answered less those the core refused; empty without the hook, or when it is not detected. */
  roots: readonly string[]
  /** The roots among `roots` declared `{ path, self: true }`, which may be candidates themselves. */
  selfRoots: readonly string[]
}

export interface Inspection {
  plugins: PluginState[]
  /** The run's context after `scope`. */
  ctx: RunCtx
  /** A failed `scope` or `roots`, a `scope` answer, a root or a `limits` entry the core does not take, and a second plugin of one name. A failed `detect` is its plugin's `reason` instead. */
  warnings: string[]
}

/**
 * Detect, scope and roots, as `survey` calls them, and nothing else: whether
 * each plugin applies here, why not, and where it may delete. A root the core
 * refuses (see `rootProblem` in `./roots.ts`) is left out with a warning, as
 * in `survey`. It proposes and deletes nothing, so it is quick where
 * `discover` walks every checkout; plugins are asked one after another (D2),
 * so each hook that hangs adds its time limit. A plugin `skip` picks is listed as
 * `skipped`, after the check for a second plugin of its name, and none of its
 * hooks run.
 */
export async function inspect(
  all: readonly Plugin[],
  ctx: RunCtx,
  { skip }: { skip?: ((p: Plugin) => boolean) | undefined } = {},
): Promise<Inspection> {
  const warnings: string[] = []
  const detections = await detectAll(all, ctx, warnings, { warnFailures: false, skip })
  const detected = detectedOf(detections)
  const scoped = await scopeOf(detected, ctx, warnings)
  const { rootsOf } = await askRoots(detected, scoped, warnings)
  const plugins = detections.map((d): PluginState => {
    const r = rootsOf.get(d.plugin.name)
    return {
      name: d.plugin.name,
      detected: d.detected,
      ...(isBuiltIn(d.plugin) ? { builtIn: true as const } : {}),
      ...(d.skipped === undefined ? {} : { skipped: d.skipped }),
      ...(d.error === undefined ? {} : { reason: d.error }),
      ...(d.note === undefined ? {} : { note: d.note }),
      roots: r?.roots ?? [],
      selfRoots: r?.self ?? [],
    }
  })
  return { plugins, ctx: scoped, warnings }
}

/**
 * Scope, discover and object, one plugin at a time in the order of `all`,
 * each hook awaited under its time limit. A plugin that throws or times out
 * in `detect`, or answers neither a boolean nor a {@link Detection}, is left
 * out; a note it gives is kept in `notes`. One that throws or times out in
 * `scope` or `discover`, or answers anything but a list, proposes nothing,
 * with a warning; an entry of that list that is not a path or a candidate is
 * left out with a warning. One that throws or times out in `object` refuses
 * every candidate, since what it would object to is unknown, and an
 * objection it answers that a plan would refuse (an unknown level, a reason
 * that is not a string) refuses its candidate instead, with a warning. A path
 * candidate outside its owner's roots and the targets is refused
 * `outside-roots`, and a root the core refuses (see `rootProblem`
 * in `./roots.ts`) is left out with a warning. A candidate with both a path
 * and a ref, or neither, or a path and an `at`, or any field a plan would
 * refuse (such as an unknown `costDescription`), is dropped. A `limits` entry
 * that is not a positive number is warned of and the default used. A `lost`
 * candidate is held and protested `discard-user-data`, and an `unmeasured`
 * one protested `unmeasured`. A {@link FatalRun} from any phase goes to the
 * caller. Two candidates with the
 * same id, or path candidates with the same real path, are one: the first
 * plugin's stands, with a warning naming both. A path candidate with others
 * inside it requires them, so they go first, and one of them that does not
 * run blocks it.
 */
export async function survey(all: readonly Plugin[], ctx: RunCtx): Promise<Survey> {
  const warnings: string[] = []
  const guarded = guard(warnings)
  const detections = await detectAll(all, ctx, warnings, { warnFailures: true })
  const notes: Record<string, string> = {}
  for (const d of detections) {
    if (d.note !== undefined) notes[d.plugin.name] = d.note
  }
  const plugins = detectedOf(detections)
  const scoped = await scopeOf(plugins, ctx, warnings)
  const targets = scoped.targets
  const ignore = ctx.ignore ?? []

  const discovered: Candidate[] = []
  const first = new Map<string, string>()
  const atReal = new Map<string, Candidate>()
  for (const p of plugins) {
    if (p.discover === undefined) continue
    const answer = await guarded<unknown>(p, 'discover', [], scoped, (x) => p.discover!(x))
    for (const entry of listFrom(p, 'discover', answer, warnings)) {
      if (typeof entry !== 'object' || entry === null) {
        warnings.push(`${p.name}: dropped ${JSON.stringify(entry)}, which is not a candidate`)
        continue
      }
      const c = entry as Candidate
      const bad = c.owner === p.name ? (misshapen(c) ?? unplannable(c)) : null
      if (c.owner !== p.name) {
        warnings.push(`${p.name}: dropped ${c.id}, which names ${c.owner} as its owner`)
      } else if (bad !== null) {
        warnings.push(`${p.name}: dropped ${c.id}, ${bad}`)
      } else if (first.has(c.id)) {
        warnings.push(`duplicate ${c.id}: kept ${first.get(c.id)}'s, dropped ${p.name}'s`)
      } else {
        const real = c.path === undefined ? undefined : realOr(c.path)
        const same = real === undefined ? undefined : atReal.get(real)
        if (same !== undefined) {
          warnings.push(
            `duplicate ${real}: kept ${same.owner}'s ${same.id}, dropped ${p.name}'s ${c.id}`,
          )
          continue
        }
        first.set(c.id, p.name)
        if (real !== undefined) atReal.set(real, c)
        discovered.push(c.costDescription === 'lost' ? { ...c, held: true } : c)
      }
    }
  }
  const left = new Map<string, number>()
  const candidates = nest(
    discovered.filter((c) => {
      const dir = ignoredBy(c, ignore)
      if (dir !== undefined) left.set(dir, (left.get(dir) ?? 0) + 1)
      return dir === undefined
    }),
  )
  for (const [dir, n] of left) warnings.push(`ignore ${dir}: left out ${n} candidate(s)`)

  const known = new Set(candidates.map((c) => c.id))
  const objections: Objection[] = []
  const asked = await askRoots(plugins, scoped, warnings)
  const { rootsOf, home } = asked
  const linked = asked.linked()
  const boundsOf = (name: string): Bounds => ({
    roots: rootsOf.get(name)?.roots ?? [],
    self: rootsOf.get(name)?.self ?? [],
    targets,
    linked,
    home,
  })
  for (const p of plugins) bindKit(p, boundsOf(p.name))
  // Git is asked once per repository for every candidate of this survey; `delete` and `kit.remove` ask afresh.
  const reads = gitReads()
  for (const c of candidates) {
    if (c.costDescription === 'lost') {
      objections.push({
        by: 'host-cleaner',
        candidate: c.id,
        level: 'protest',
        code: DISCARD_USER_DATA,
        reason: 'deleting it loses data that cannot be fetched or built again',
      })
    }
    if (c.unmeasured === true) {
      objections.push({
        by: 'host-cleaner',
        candidate: c.id,
        level: 'protest',
        code: UNMEASURED,
        reason: 'how long it sat unused could not be measured in the time budget',
      })
    }
    if (c.path === undefined) continue
    const why = outside(c, { ...boundsOf(c.owner), reads })
    if (why !== null) {
      objections.push({
        by: 'host-cleaner',
        candidate: c.id,
        level: 'refuse',
        code: OUTSIDE_ROOTS,
        reason: why,
      })
    }
  }
  for (const p of plugins) {
    if (p.object === undefined) continue
    try {
      for (const o of await callHook(p, 'object', scoped, (x) => p.object!(candidates, x))) {
        if (!known.has(o.candidate)) continue
        const own = { ...o, by: p.name }
        const read = ObjectionSchema.safeParse(own)
        if (read.success) {
          objections.push(own)
          continue
        }
        // What it meant to stop is unknown, so it refuses, as an `object` that throws does.
        const issue = read.error.issues[0]!
        const reason = `${p.name}: object answered an objection to ${o.candidate} whose ${issue.path.join('.')} a plan refuses: ${issue.message}`
        warnings.push(reason)
        objections.push({
          by: p.name,
          candidate: o.candidate,
          level: 'refuse',
          code: 'plugin-error',
          reason,
        })
      }
    } catch (err) {
      if (err instanceof FatalRun) throw err
      const reason = `${p.name}: object failed: ${errorText(err)}`
      warnings.push(reason)
      for (const c of candidates) {
        objections.push({
          by: p.name,
          candidate: c.id,
          level: 'refuse',
          code: 'plugin-error',
          reason,
        })
      }
    }
  }
  const roots = Object.fromEntries(plugins.map((p) => [p.name, boundsOf(p.name).roots]))
  const selfRoots = Object.fromEntries(plugins.map((p) => [p.name, boundsOf(p.name).self]))
  return {
    plugins,
    ctx: scoped,
    candidates,
    objections,
    warnings,
    linked,
    roots,
    selfRoots,
    notes,
  }
}

/**
 * What a person chose, as {@link decide} reads it. Candidates are named by id.
 *
 *   `select` work on exactly these, instead of the default: every candidate
 *            its owner has not held for review and nothing refuses or
 *            protests. For a checklist (`clean -i`) or a run that already
 *            chose.
 *   `pick`   also run these: a candidate held for review
 *            (`held: true`) runs only when picked or selected.
 *   `spare`  leave these alone: an id, a path (a ref candidate's ref,
 *            `at`, or `<at>:<ref>`, as a git branch's path was), a name
 *            (every candidate of that name, as a branch and the worktree
 *            that has it), or a glob (`*`, `**`, `?`) over ids, paths and
 *            names.
 *
 * The same words repo-cleaner's approval uses, with the same meaning.
 */
export interface Selection {
  select: readonly string[] | null
  pick: readonly string[]
  spare: readonly string[]
}

/** The default selection: nothing chosen, picked or spared. */
export const DEFAULT_SELECTION: Selection = { select: null, pick: [], spare: [] }

/** Whether `entry`, one `spare`, names `c`. */
export function spares(entry: string, c: Candidate): boolean {
  const names = [
    c.id,
    c.path ?? c.ref,
    ...(c.at === undefined ? [] : [c.at]),
    // A git branch's path was `<repo>:<branch>`, and a spare may still name it so.
    ...(c.at === undefined || c.ref === undefined ? [] : [`${c.at}:${c.ref}`]),
    ...(c.name === undefined ? [] : [c.name]),
  ]
  if (isGlob(entry)) {
    const re = globRegExp(entry)
    return names.some((n) => re.test(n))
  }
  return names.includes(entry)
}

/**
 * Refuses a selection that contradicts itself: a candidate both chosen and
 * spared by the same text.
 */
export function checkSelection(sel: Selection): void {
  const chosen = [...(sel.select ?? []), ...sel.pick]
  const both = chosen.find((id) => sel.spare.includes(id))
  if (both !== undefined) throw new SelectionError(`${both} is both picked and spared`)
}

/** A selection that cannot be honoured as typed. */
export class SelectionError extends Error {
  override name = 'SelectionError'
}

/** A plan of `s`: every candidate and objection, and what was chosen and allowed. */
export function plan(
  s: Pick<Survey, 'candidates' | 'objections' | 'warnings'>,
  opts: {
    targets?: readonly string[] | undefined
    targetsGiven?: boolean | undefined
    ignore?: readonly string[] | undefined
    select?: readonly string[] | null | undefined
    pick?: readonly string[] | undefined
    spare?: readonly string[] | undefined
    allow?: readonly string[] | undefined
    now?: Date
  } = {},
): Plan {
  const selection: Selection = {
    select: opts.select === undefined || opts.select === null ? null : [...opts.select],
    pick: [...(opts.pick ?? [])],
    spare: [...(opts.spare ?? [])],
  }
  checkSelection(selection)
  return {
    version: PLAN_VERSION,
    createdAt: (opts.now ?? new Date()).toISOString(),
    targets: [...(opts.targets ?? [])],
    targetsGiven: opts.targetsGiven ?? false,
    select: selection.select === null ? null : [...selection.select],
    pick: [...selection.pick],
    spare: [...selection.spare],
    allow: [...(opts.allow ?? [])],
    ignore: [...(opts.ignore ?? [])],
    warnings: s.warnings,
    // A copy, so a plugin that mutates and returns the same objects on re-discovery cannot change the plan.
    candidates: structuredClone(s.candidates),
    objections: structuredClone(s.objections),
  }
}

export interface Decision {
  /** What runs, each candidate after the ones it requires. */
  run: Candidate[]
  dropped: Dropped[]
}

/**
 * What runs: the selected ids, or without a selection every candidate its
 * owner has not marked `held: true` and nothing objects to at `refuse`
 * or `protest`; then the picked ids too; then less what is spared. A spared
 * candidate that would have run is dropped as `spared`, a refused one as
 * `blocked`, an un-granted protest as `not-allowed`, an unknown id as `gone`.
 * A candidate whose requirement does not run is dropped as `blocked`, and so
 * on up the chain, its detail naming each such requirement and what would let
 * it run (see {@link explainer}). A `note` never gates.
 */
export function decide(
  candidates: readonly Candidate[],
  objections: readonly Objection[],
  selection: Selection,
  allow: readonly string[],
): Decision {
  const byId = new Map(candidates.map((c) => [c.id, c]))
  const granted = new Set(allow)
  const byCandidate = new Map<string, Objection[]>()
  for (const o of objections) {
    if (o.level !== 'note')
      byCandidate.set(o.candidate, [...(byCandidate.get(o.candidate) ?? []), o])
  }
  const gating = (id: string, level: Objection['level']): Objection[] =>
    (byCandidate.get(id) ?? []).filter((o) => o.level === level)
  const unmet = (id: string): Objection[] =>
    gating(id, 'protest').filter((o) => !granted.has(o.code))
  // With no selection, only what no owner has held back: an owner marks a candidate
  // `held: true` when it wants a person to choose it.
  const base =
    selection.select ??
    candidates
      .filter(
        (c) => c.held !== true && gating(c.id, 'refuse').length === 0 && unmet(c.id).length === 0,
      )
      .map((c) => c.id)

  const dropped: Dropped[] = []
  const running = new Map<string, Candidate>()
  for (const id of new Set([...base, ...selection.pick])) {
    const c = byId.get(id)
    const spare = c === undefined ? undefined : selection.spare.find((e) => spares(e, c))
    if (spare !== undefined) {
      dropped.push({ id, reason: 'spared', detail: `--spare ${spare}` })
      continue
    }
    const refused = gating(id, 'refuse')
    const missing = unmet(id)
    if (c === undefined) dropped.push({ id, reason: 'gone', detail: 'no plugin proposes it now' })
    else if (refused.length > 0) {
      dropped.push({
        id,
        reason: 'blocked',
        detail: refused.map((o) => `${o.by}: ${o.reason}`).join('; '),
      })
    } else if (missing.length > 0) {
      const codes = [...new Set(missing.map((o) => o.code))].join(', ')
      dropped.push({ id, reason: 'not-allowed', detail: `needs --allow ${codes}` })
    } else running.set(id, c)
  }
  const explain = explainer(byId, gating, unmet, selection, dropped)
  return { ...closeRequires(running, dropped, explain), dropped }
}

/** Why a candidate does not run, worded to follow "which": what would let it run. */
type Explain = (id: string) => string

/** `d` worded to follow "which". */
function because(d: Dropped): string {
  if (d.reason === 'not-allowed') return d.detail
  if (d.reason === 'spared') return `is spared (${d.detail})`
  if (d.reason === 'gone') return 'is gone'
  return `is ${d.reason}: ${d.detail}`
}

/**
 * Explains, from the candidates and the selection, why one does not run:
 * gone, spared, refused (and by whom), or what it needs (`--pick <id>` for
 * one held or not selected, when the plan is made, `--allow <code>` for a
 * protest not granted);
 * failing those, its entry in `dropped`, as for one blocked by its own
 * requirement.
 */
function explainer(
  byId: ReadonlyMap<string, Candidate>,
  gating: (id: string, level: Objection['level']) => Objection[],
  unmet: (id: string) => Objection[],
  selection: Selection,
  dropped: readonly Dropped[],
): Explain {
  return (id) => {
    const c = byId.get(id)
    if (c === undefined) return 'is gone'
    const spare = selection.spare.find((e) => spares(e, c))
    if (spare !== undefined) return `is spared (--spare ${spare})`
    const refused = gating(id, 'refuse')
    if (refused.length > 0) {
      return `is refused (${refused.map((o) => `${o.by}: ${o.reason}`).join('; ')})`
    }
    const chosen =
      selection.pick.includes(id) ||
      (selection.select === null ? c.held !== true : selection.select.includes(id))
    const codes = [...new Set(unmet(id).map((o) => o.code))]
    const needs = [
      ...(chosen ? [] : [`--pick ${id}`]),
      ...(codes.length > 0 ? [`--allow ${codes.join(', ')}`] : []),
    ]
    // A saved plan takes no --pick or --allow at `clean --plan`: they go where it is made.
    if (needs.length > 0) return `needs ${needs.join(' ')}${chosen ? '' : ' when the plan is made'}`
    const entry = dropped.find((d) => d.id === id)
    return entry === undefined ? 'does not run' : because(entry)
  }
}

/** True when following `requires` from `c` leads back to `c`. */
function requiresItself(c: Candidate, running: ReadonlyMap<string, Candidate>): boolean {
  const seen = new Set<string>()
  const stack = [...(c.requires ?? [])]
  for (let id = stack.pop(); id !== undefined; id = stack.pop()) {
    if (id === c.id) return true
    if (seen.has(id)) continue
    seen.add(id)
    stack.push(...(running.get(id)?.requires ?? []))
  }
  return false
}

/**
 * Drop what requires something that is not running or is in a cycle, until
 * none does, naming each requirement that does not run and, by `explain`,
 * why; order the rest, requirements first.
 */
function closeRequires(
  running: Map<string, Candidate>,
  dropped: Dropped[],
  explain: Explain,
): { run: Candidate[] } {
  for (let again = true; again;) {
    again = false
    for (const c of running.values()) {
      const lacking = (c.requires ?? []).filter((r) => !running.has(r))
      const cyclic = lacking.length === 0 && requiresItself(c, running)
      if (lacking.length === 0 && !cyclic) continue
      running.delete(c.id)
      dropped.push({
        id: c.id,
        reason: 'blocked',
        detail: cyclic
          ? 'its requirements form a cycle'
          : lacking.map((r) => `requires ${r}, which ${explain(r)}`).join('; '),
      })
      again = true
    }
  }
  const run: Candidate[] = []
  const seen = new Set<string>()
  const visit = (c: Candidate): void => {
    if (seen.has(c.id)) return
    seen.add(c.id)
    for (const r of c.requires ?? []) visit(running.get(r)!)
    run.push(c)
  }
  for (const c of running.values()) visit(c)
  return { run }
}

/** What the plan decided, from its own candidates and objections. */
export function decidePlan(p: Plan): Decision {
  return decide(
    p.candidates,
    p.objections,
    { select: p.select, pick: p.pick, spare: p.spare },
    p.allow,
  )
}

/**
 * Judge a plan against the world now. Surveys again and decides over exactly
 * what the plan would run, so a refusal that appeared since is `blocked`, a
 * protest nobody granted `not-allowed`, a vanished candidate `gone`, and one whose evidence
 * moved (repo-cleaner's `sameFingerprint`) `changed`.
 */
export async function recheck(
  p: Plan,
  plugins: readonly Plugin[],
  ctx: RunCtx,
): Promise<{ decision: Decision; survey: Survey }> {
  const decided = decidePlan(p)
  const ignore = [...new Set([...(ctx.ignore ?? []), ...p.ignore])]
  const fresh = await survey(plugins, { ...ctx, ignore, allow: p.allow })
  const planned: Decision = { ...decided, run: [], dropped: [...decided.dropped] }
  for (const c of decided.run) {
    const dir = ignoredBy(c, ignore)
    if (dir === undefined) planned.run.push(c)
    else planned.dropped.push({ id: c.id, reason: 'ignored', detail: `inside ignored ${dir}` })
  }
  const now = decide(
    fresh.candidates,
    fresh.objections,
    { select: planned.run.map((c) => c.id), pick: [], spare: [] },
    p.allow,
  )
  const dropped = [...planned.dropped, ...now.dropped]
  const kept = new Map<string, Candidate>()
  const plannedById = new Map(planned.run.map((q) => [q.id, q]))
  for (const c of now.run) {
    const before = plannedById.get(c.id)
    if (before !== undefined && !sameFingerprint(before.evidence, c.evidence)) {
      dropped.push({ id: c.id, reason: 'changed', detail: 'its evidence moved since the plan' })
    } else kept.set(c.id, c)
  }
  const explain: Explain = (id) => {
    const entry = dropped.find((d) => d.id === id)
    return entry === undefined ? 'does not run' : because(entry)
  }
  return { decision: { ...closeRequires(kept, dropped, explain), dropped }, survey: fresh }
}

export interface CleanOptions {
  /** Where the plan came from, for the receipt. */
  source?: string
  /** Plan the steps and run no phase after the re-check. */
  dryRun?: boolean
  /** The receipt is rewritten here after every step. */
  receiptPath?: string
  now?: () => Date
}

/**
 * Re-check `p`, then for each candidate, one at a time: `prepare` on every
 * plugin, `delete` on its owner, `deleted` on the others. A throw or time-out
 * in `prepare` or `delete` fails that candidate and skips those requiring it;
 * a {@link FatalRun} stops the run and skips the rest. `deleted` failures are
 * recorded and change nothing. Every kit is unbound after.
 */
export async function clean(
  p: Plan,
  plugins: readonly Plugin[],
  ctx: RunCtx,
  opts: CleanOptions = {},
): Promise<Receipt> {
  try {
    return await cleanBound(p, plugins, ctx, opts)
  } finally {
    // No kit keeps this run's bounds once it is over.
    for (const q of plugins) bindKit(q, undefined)
  }
}

/** {@link clean}, leaving each kit bound as its last delete or the re-check bound it. */
async function cleanBound(
  p: Plan,
  plugins: readonly Plugin[],
  ctx: RunCtx,
  opts: CleanOptions,
): Promise<Receipt> {
  const now = opts.now ?? (() => new Date())
  const head = { version: RECEIPT_VERSION, plan: opts.source ?? '(swept)' } as const
  let checked: Awaited<ReturnType<typeof recheck>>
  try {
    checked = await recheck(p, plugins, ctx)
  } catch (err) {
    // A throw from the re-check still leaves a receipt saying nothing ran.
    if (opts.receiptPath !== undefined && opts.dryRun !== true) {
      const at = now().toISOString()
      try {
        writeReceipt(opts.receiptPath, {
          ...head,
          status: 'failed',
          startedAt: at,
          finishedAt: at,
          warnings: [...p.warnings],
          dropped: [],
          steps: [],
        })
      } catch {
        // the original error is the one to report
      }
    }
    throw err
  }
  const { decision, survey: s } = checked
  const receipt: Receipt = {
    ...head,
    status: opts.dryRun === true ? 'dry-run' : 'running',
    startedAt: now().toISOString(),
    finishedAt: null,
    warnings: [...p.warnings, ...s.warnings],
    dropped: decision.dropped,
    steps: [],
  }
  const save = (): void => {
    if (opts.receiptPath !== undefined) writeReceipt(opts.receiptPath, receipt)
  }
  save()
  const byName = new Map(s.plugins.map((q) => [q.name, q]))
  const stopped = new Set<string>()
  let fatal: string | null = null

  try {
    for (const c of decision.run) {
      const step: Step = {
        id: c.id,
        owner: c.owner,
        preparedBy: [],
        result: 'ok',
        delete: null,
        error: null,
        notified: [],
      }
      receipt.steps.push(step)
      const halted = c.requires?.find((r) => stopped.has(r))
      const skip =
        fatal !== null
          ? `the run stopped: ${fatal}`
          : halted !== undefined
            ? `requires ${halted}, which did not complete`
            : null
      if (skip !== null) {
        step.result = 'skipped'
        step.error = skip
      } else if (opts.dryRun === true) {
        step.result = 'would-run'
      } else {
        fatal = await runOne(c, step, s, byName.get(c.owner))
      }
      if (step.result === 'failed' || step.result === 'skipped') stopped.add(c.id)
      save()
    }
  } catch (err) {
    // A write or a plugin escaped: leave a receipt that says the run did not finish.
    receipt.status = 'failed'
    receipt.finishedAt = now().toISOString()
    try {
      save()
    } catch {
      // the original error is the one to report
    }
    throw err
  }

  receipt.finishedAt = now().toISOString()
  if (opts.dryRun !== true) {
    receipt.status = receipt.steps.some((x) => x.result === 'failed' || x.result === 'skipped')
      ? 'failed'
      : 'complete'
  }
  save()
  return receipt
}

/** Prepare, delete and notify one candidate, recording on `step`. Returns the message of a {@link FatalRun}, else null. */
async function runOne(
  c: Candidate,
  step: Step,
  s: Survey,
  owner: Plugin | undefined,
): Promise<string | null> {
  const fail = (err: unknown, prefix = ''): string | null => {
    step.result = 'failed'
    step.error = prefix + errorText(err)
    return err instanceof FatalRun ? step.error : null
  }
  for (const q of s.plugins) {
    if (q.prepare === undefined) continue
    try {
      await callHook(q, 'prepare', s.ctx, (x) => q.prepare!(c, x))
      step.preparedBy.push(q.name)
    } catch (err) {
      return fail(err, `${q.name}: prepare failed: `)
    }
  }
  if (owner?.delete === undefined) {
    return fail(`${c.owner} cannot delete`)
  }
  // A ref has no folder to check; a path is checked again on its real path, which may have moved since the survey.
  let bounds: Bounds | undefined
  if (c.path !== undefined) {
    let answer: unknown
    try {
      answer =
        owner.roots === undefined
          ? []
          : await callHook(owner, 'roots', s.ctx, (x) => owner.roots!(x))
    } catch (err) {
      return fail(err, `${c.owner}: roots failed: `)
    }
    const at = { targets: s.ctx.targets, linked: s.linked, home: s.ctx.home ?? homedir() }
    const { roots, self, problems } = acceptRoots(answer, at)
    bounds = { roots, self, ...at }
    const why = outside(c, bounds)
    if (why !== null) {
      return fail(problems.length === 0 ? why : `${why}; roots refused: ${problems.join('; ')}`)
    }
  }
  // The owner's kit removes within what was just checked; a ref delete removes no folder.
  bindKit(owner, bounds)
  try {
    step.delete = await callHook(owner, 'delete', s.ctx, async (x) => {
      // Bound by this call's signal too, which no other run binds.
      bindKit(owner, bounds, x.signal)
      try {
        return await owner.delete!(c, x)
      } finally {
        bindKit(owner, undefined, x.signal)
      }
    })
  } catch (err) {
    return fail(err)
  }
  for (const q of s.plugins) {
    if (q === owner || q.deleted === undefined) continue
    try {
      await callHook(q, 'deleted', s.ctx, (x) => q.deleted!(c, x))
      step.notified.push({ plugin: q.name, error: null })
    } catch (err) {
      step.notified.push({ plugin: q.name, error: errorText(err) })
    }
  }
  return null
}
