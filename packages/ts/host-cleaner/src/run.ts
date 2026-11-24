/**
 * The phase runner. `survey` is scope, discover and object; `decide` and
 * `recheck` pick what runs; `clean` is prepare, delete and deleted.
 */

import { homedir } from 'node:os'
import { dirname } from 'node:path'

import { globRegExp, isGlob, sameFingerprint } from '@osdlc/repo-cleaner'

import { coveredBy, containsIgnored } from './ignore.ts'
import { bindKit } from './kit.ts'
import { acceptRoots, boundBy, linkedCheckouts, realOr, type Bounds } from './roots.ts'
import {
  writeReceipt,
  PLAN_VERSION,
  RECEIPT_VERSION,
  type Dropped,
  type Plan,
  type Receipt,
  type Step,
} from './plan.ts'
import {
  COST_DESCRIPTIONS,
  FatalRun,
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

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** The time limit, in milliseconds, of every hook but `delete`, unless the plugin asks for another. */
export const HOOK_LIMIT_MS = 30_000

/** The time limit, in milliseconds, of `delete`, unless the plugin asks for another. */
export const DELETE_LIMIT_MS = 10 * 60_000

/** A hook that ran past its time limit. The core reports it as it would a throw. */
export class HookTimeout extends Error {
  override name = 'HookTimeout'
}

/** The longest delay `setTimeout` keeps; a longer one fires at once. */
const MAX_DELAY_MS = 2 ** 31 - 1

/**
 * Calls one hook of `p` with a signal of its own and awaits its answer. Past
 * the hook's limit the signal is aborted and {@link HookTimeout} thrown; a
 * hook that answers straight away is never timed out.
 */
async function callHook<T>(
  p: Plugin,
  hook: Hook,
  ctx: RunCtx,
  f: (ctx: Ctx) => MaybePromise<T>,
): Promise<T> {
  const ms = p.limits?.[hook] ?? (hook === 'delete' ? DELETE_LIMIT_MS : HOOK_LIMIT_MS)
  const controller = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => {
        const err = new HookTimeout(`timed out after ${ms} ms`)
        controller.abort(err)
        reject(err)
      },
      Math.min(ms, MAX_DELAY_MS),
    )
  })
  try {
    // An async wrapper, so a synchronous throw arrives as a rejection.
    const answer = (async () =>
      f({ ...ctx, targetsGiven: ctx.targetsGiven ?? false, signal: controller.signal }))()
    return await Promise.race([answer, late])
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

/** What `detect` said of one plugin. */
interface Detected {
  plugin: Plugin
  detected: boolean
  /** The note `detect` gave with its answer. */
  note?: string | undefined
  /** What `detect` threw or timed out with, or why its answer was left out; absent when it answered a boolean or a {@link Detection}. */
  error?: string | undefined
}

/**
 * Detect, then scope, as `survey` starts: each plugin's detection (a second
 * plugin of a name is left out), the detected plugins, the notes `detect`
 * gave by plugin name, and the targets once scope added to them, less those
 * `ignore` covers. A failed `detect` is a warning only when `warnDetect`.
 */
async function detectAndScope(
  all: readonly Plugin[],
  ctx: RunCtx,
  warnings: string[],
  warnDetect: boolean,
): Promise<{
  detections: Detected[]
  plugins: Plugin[]
  notes: Record<string, string>
  targets: string[]
  scoped: RunCtx
}> {
  const guarded = guard(warnings)
  const names = new Set<string>()
  const detections: Detected[] = []
  const notes: Record<string, string> = {}
  for (const p of all) {
    if (names.has(p.name)) {
      warnings.push(`${p.name}: a second plugin of that name was left out`)
      continue
    }
    names.add(p.name)
    let answer: unknown
    try {
      answer = await callHook<unknown>(p, 'detect', ctx, (x) => p.detect(x))
    } catch (err) {
      if (err instanceof FatalRun) throw err
      if (warnDetect) warnings.push(`${p.name}: detect failed: ${errorText(err)}`)
      detections.push({ plugin: p, detected: false, error: errorText(err) })
      continue
    }
    const found = detection(answer)
    if (found === null) {
      const why = `detect answered ${JSON.stringify(answer) ?? String(answer)}, which is neither a boolean nor { active, note? }`
      if (warnDetect) warnings.push(`${p.name}: ${why}; it was left out`)
      detections.push({ plugin: p, detected: false, error: why })
      continue
    }
    if (found.note !== undefined) notes[p.name] = found.note
    detections.push({ plugin: p, detected: found.active, note: found.note })
  }
  const plugins = detections.filter((d) => d.detected).map((d) => d.plugin)

  const ignore = ctx.ignore ?? []
  const targets = ctx.targets.filter((t) => coveredBy(t, ignore) === undefined)
  for (const p of plugins) {
    if (p.scope === undefined) continue
    for (const root of await guarded(p, 'scope', [], ctx, (x) => p.scope!(x))) {
      if (!targets.includes(root) && coveredBy(root, ignore) === undefined) targets.push(root)
    }
  }
  return { detections, plugins, notes, targets, scoped: { ...ctx, targets } }
}

/** One plugin as `inspect` found it. */
export interface PluginState {
  name: string
  detected: boolean
  /** Why it was not detected: what `detect` threw or timed out with. Absent when `detect` answered. */
  reason?: string | undefined
  /** Its roots, as its `roots` hook answered; empty without the hook, or when it is not detected. */
  roots: readonly string[]
}

export interface Inspection {
  plugins: PluginState[]
  /** The run's context after `scope`. */
  ctx: RunCtx
  /** A failed `scope` or `roots`, and a second plugin of one name. A failed `detect` is its plugin's `reason` instead. */
  warnings: string[]
}

/**
 * Detect, scope and roots, as `survey` calls them, and nothing else: whether
 * each plugin applies here, why not, and where it may delete. It proposes and
 * deletes nothing, so it is quick where `discover` walks every checkout.
 */
export async function inspect(all: readonly Plugin[], ctx: RunCtx): Promise<Inspection> {
  const warnings: string[] = []
  const { detections, scoped } = await detectAndScope(all, ctx, warnings, false)
  const guarded = guard(warnings)
  const plugins: PluginState[] = []
  for (const d of detections) {
    const p = d.plugin
    const roots =
      d.detected && p.roots !== undefined
        ? await guarded(p, 'roots', [], scoped, (x) => p.roots!(x))
        : []
    plugins.push({
      name: p.name,
      detected: d.detected,
      ...(d.error === undefined ? {} : { reason: d.error }),
      roots,
    })
  }
  return { plugins, ctx: scoped, warnings }
}

/**
 * Scope, discover and object, one plugin at a time in the order of `all`,
 * each hook awaited under its time limit. A plugin that throws or times out
 * in `detect`, or answers neither a boolean nor a {@link Detection}, is left
 * out; a note it gives is kept in `notes`. One that throws or times out
 * in `scope` or `discover` proposes nothing,
 * with a warning; one that throws or times out in `object` refuses every
 * candidate, since what it would object to is unknown. A path candidate
 * outside its owner's roots and the targets is refused `outside-roots`, and a
 * root the core refuses (see `rootProblem` in `./roots.ts`) is left out with a
 * warning; one
 * with both a path and a ref, or neither, or a path and an `at`, or an
 * unknown `costDescription`, is dropped. A `lost` one is held and protested `discard-user-data`, and an
 * `unmeasured` one protested `unmeasured`. A
 * {@link FatalRun} from any phase goes to the caller. Two candidates with the
 * same id, or path candidates with the same real path, are one: the first
 * plugin's stands, with a warning naming both. A path candidate with others
 * inside it requires them, so they go first, and one of them that does not
 * run blocks it.
 */
export async function survey(all: readonly Plugin[], ctx: RunCtx): Promise<Survey> {
  const warnings: string[] = []
  const guarded = guard(warnings)
  const { plugins, targets, scoped, notes } = await detectAndScope(all, ctx, warnings, true)
  const ignore = ctx.ignore ?? []

  const discovered: Candidate[] = []
  const first = new Map<string, string>()
  const atReal = new Map<string, Candidate>()
  const costs = new Set<string>(COST_DESCRIPTIONS)
  for (const p of plugins) {
    if (p.discover === undefined) continue
    for (const c of await guarded(p, 'discover', [], scoped, (x) => p.discover!(x))) {
      if (c.owner !== p.name) {
        warnings.push(`${p.name}: dropped ${c.id}, which names ${c.owner} as its owner`)
      } else if (misshapen(c) !== null) {
        warnings.push(`${p.name}: dropped ${c.id}, ${misshapen(c)}`)
      } else if (c.costDescription !== undefined && !costs.has(c.costDescription)) {
        warnings.push(
          `${p.name}: dropped ${c.id}, whose costDescription is not one of ${COST_DESCRIPTIONS.join(', ')}`,
        )
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
  const linked = linkedCheckouts(targets)
  const home = homedir()
  // Asked once per plugin, so a throwing `roots` warns once.
  const rootsOf = new Map<string, { roots: readonly string[]; self: readonly string[] }>()
  for (const p of plugins) {
    if (p.roots === undefined) continue
    const answer = await guarded<unknown>(p, 'roots', [], scoped, (x) => p.roots!(x))
    const accepted = acceptRoots(answer, { targets, linked, home })
    for (const problem of accepted.problems) warnings.push(`${p.name}: roots: ${problem}`)
    rootsOf.set(p.name, accepted)
  }
  const boundsOf = (name: string): Bounds => ({
    roots: rootsOf.get(name)?.roots ?? [],
    self: rootsOf.get(name)?.self ?? [],
    targets,
    linked,
    home,
  })
  for (const p of plugins) bindKit(p, boundsOf(p.name))
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
    const why = outside(c, boundsOf(c.owner))
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
        if (known.has(o.candidate)) objections.push({ ...o, by: p.name })
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
 *   `spare`  leave these alone: an id, a path, a name (every candidate of
 *            that name, as a branch and the worktree that has it), or a
 *            glob (`*`, `**`, `?`) over ids, paths and names.
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
  const names = [c.id, c.path ?? c.ref, ...(c.name === undefined ? [] : [c.name])]
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
    ...(opts.targetsGiven === undefined ? {} : { targetsGiven: opts.targetsGiven }),
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
 * one held or not selected, `--allow <code>` for a protest not granted);
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
    if (needs.length > 0) return `needs ${needs.join(' ')}`
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
 * recorded and change nothing.
 */
export async function clean(
  p: Plan,
  plugins: readonly Plugin[],
  ctx: RunCtx,
  opts: CleanOptions = {},
): Promise<Receipt> {
  const now = opts.now ?? (() => new Date())
  let checked: Awaited<ReturnType<typeof recheck>>
  try {
    checked = await recheck(p, plugins, ctx)
  } catch (err) {
    // A throw from the re-check still leaves a receipt saying nothing ran.
    if (opts.receiptPath !== undefined && opts.dryRun !== true) {
      const at = now().toISOString()
      try {
        writeReceipt(opts.receiptPath, {
          version: RECEIPT_VERSION,
          plan: opts.source ?? '(swept)',
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
    version: RECEIPT_VERSION,
    plan: opts.source ?? '(swept)',
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
    const at = { targets: s.ctx.targets, linked: s.linked, home: homedir() }
    const { roots, self } = acceptRoots(answer, at)
    const bounds: Bounds = { roots, self, ...at }
    const why = outside(c, bounds)
    if (why !== null) return fail(why)
    // The owner's kit removes within what was just checked.
    bindKit(owner, bounds)
  }
  try {
    step.delete = await callHook(owner, 'delete', s.ctx, (x) => owner.delete!(c, x))
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
