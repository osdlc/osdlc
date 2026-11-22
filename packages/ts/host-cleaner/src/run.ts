/**
 * The phase runner. `survey` is scope, discover and object; `decide` and
 * `recheck` pick what runs; `clean` is prepare, delete and deleted.
 */

import { globRegExp, isGlob, sameFingerprint } from '@osdlc/repo-cleaner'

import { coveredBy, containsIgnored } from './ignore.ts'
import {
  writeReceipt,
  PLAN_VERSION,
  RECEIPT_VERSION,
  type Dropped,
  type Plan,
  type Receipt,
  type Step,
} from './plan.ts'
import { FatalRun, type Candidate, type Ctx, type Objection, type Plugin } from './types.ts'

/** The fixed plugin order: which plugin keeps a duplicate candidate (the first), and the order `prepare` and `deleted` run in. */
export const PLUGIN_ORDER: readonly string[] = ['git', 'cargo', 'node', 'claude-code', 'orca']

/** `plugins` in {@link PLUGIN_ORDER}; a plugin not named there goes after, in the order given. */
export function orderPlugins(plugins: readonly Plugin[]): Plugin[] {
  const rank = (p: Plugin): number => {
    const i = PLUGIN_ORDER.indexOf(p.name)
    return i === -1 ? PLUGIN_ORDER.length : i
  }
  return plugins
    .map((p, i) => ({ p, i }))
    .sort((a, b) => rank(a.p) - rank(b.p) || a.i - b.i)
    .map(({ p }) => p)
}

const errorText = (err: unknown): string => (err instanceof Error ? err.message : String(err))

export interface Survey {
  /** The detected plugins, in order. */
  plugins: Plugin[]
  /** The run's context after `scope`. */
  ctx: Ctx
  candidates: Candidate[]
  objections: Objection[]
  warnings: string[]
}

/** The ignore entry a candidate sits in, or holds (deleting a directory takes what is inside it). */
function ignoredBy(c: Candidate, ignore: readonly string[]): string | undefined {
  return (
    coveredBy(c.at ?? c.path, ignore) ??
    (c.at === undefined ? containsIgnored(c.path, ignore) : undefined)
  )
}

/**
 * Scope, discover and object. A plugin that throws in `scope` or `discover`
 * proposes nothing, with a warning; one that throws in `object` refuses every
 * candidate, since what it would object to is unknown. A {@link FatalRun}
 * from any phase goes to the caller. A duplicate candidate id keeps the first
 * plugin's, with a warning naming both.
 */
export function survey(all: readonly Plugin[], ctx: Ctx): Survey {
  const warnings: string[] = []
  const names = new Set<string>()
  const plugins = orderPlugins(all).filter((p) => {
    if (names.has(p.name)) {
      warnings.push(`${p.name}: a second plugin of that name was left out`)
      return false
    }
    names.add(p.name)
    try {
      return p.detect(ctx)
    } catch (err) {
      if (err instanceof FatalRun) throw err
      warnings.push(`${p.name}: detect failed: ${errorText(err)}`)
      return false
    }
  })
  const guarded = <T>(p: Plugin, phase: string, fallback: T, f: () => T): T => {
    try {
      return f()
    } catch (err) {
      if (err instanceof FatalRun) throw err
      warnings.push(`${p.name}: ${phase} failed: ${errorText(err)}`)
      return fallback
    }
  }

  const ignore = ctx.ignore ?? []
  const targets = ctx.targets.filter((t) => coveredBy(t, ignore) === undefined)
  for (const p of plugins) {
    for (const root of guarded(p, 'scope', [], () => p.scope?.(ctx) ?? [])) {
      if (!targets.includes(root) && coveredBy(root, ignore) === undefined) targets.push(root)
    }
  }
  const scoped: Ctx = { ...ctx, targets }

  const discovered: Candidate[] = []
  const first = new Map<string, string>()
  for (const p of plugins) {
    for (const c of guarded(p, 'discover', [], () => p.discover?.(scoped) ?? [])) {
      if (c.owner !== p.name) {
        warnings.push(`${p.name}: dropped ${c.id}, which names ${c.owner} as its owner`)
      } else if (first.has(c.id)) {
        warnings.push(`duplicate ${c.id}: kept ${first.get(c.id)}'s, dropped ${p.name}'s`)
      } else {
        first.set(c.id, p.name)
        discovered.push(c)
      }
    }
  }
  const left = new Map<string, number>()
  const candidates = discovered.filter((c) => {
    const dir = ignoredBy(c, ignore)
    if (dir !== undefined) left.set(dir, (left.get(dir) ?? 0) + 1)
    return dir === undefined
  })
  for (const [dir, n] of left) warnings.push(`ignore ${dir}: left out ${n} candidate(s)`)

  const known = new Set(candidates.map((c) => c.id))
  const objections: Objection[] = []
  for (const p of plugins) {
    if (p.object === undefined) continue
    try {
      for (const o of p.object(candidates, scoped)) {
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
  return { plugins, ctx: scoped, candidates, objections, warnings }
}

/**
 * What a person chose, as {@link decide} reads it. Candidates are named by id.
 *
 *   `select` work on exactly these, instead of the default: every candidate
 *            its owner has not held for review and nothing refuses or
 *            protests. For a checklist (`clean -i`) or a run that already
 *            chose.
 *   `pick`   also run these: a candidate held for review
 *            (`unattended: false`) runs only when picked or selected.
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
  const names = [c.id, c.path, ...(c.name === undefined ? [] : [c.name])]
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
 * owner has not marked `unattended: false` and nothing objects to at `refuse`
 * or `protest`; then the picked ids too; then less what is spared. A spared
 * candidate that would have run is dropped as `spared`, a refused one as
 * `blocked`, an un-granted protest as `not-allowed`, an unknown id as `gone`.
 * A candidate whose requirement does not run is dropped as `blocked`, and so
 * on up the chain. A `note` never gates.
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
  // `unattended: false` when it wants a person to choose it.
  const base =
    selection.select ??
    candidates
      .filter(
        (c) =>
          c.unattended !== false && gating(c.id, 'refuse').length === 0 && unmet(c.id).length === 0,
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
  return { ...closeRequires(running, dropped), dropped }
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

/** Drop what requires something that is not running or is in a cycle, until none does; order the rest, requirements first. */
function closeRequires(running: Map<string, Candidate>, dropped: Dropped[]): { run: Candidate[] } {
  for (let again = true; again;) {
    again = false
    for (const c of running.values()) {
      const lacking = c.requires?.find((r) => !running.has(r))
      const cyclic = lacking === undefined && requiresItself(c, running)
      if (lacking === undefined && !cyclic) continue
      running.delete(c.id)
      dropped.push({
        id: c.id,
        reason: 'blocked',
        detail: cyclic
          ? 'its requirements form a cycle'
          : `requires ${lacking}, which does not run`,
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
export function recheck(
  p: Plan,
  plugins: readonly Plugin[],
  ctx: Ctx,
): { decision: Decision; survey: Survey } {
  const decided = decidePlan(p)
  const ignore = [...new Set([...(ctx.ignore ?? []), ...p.ignore])]
  const fresh = survey(plugins, { ...ctx, ignore, allow: p.allow })
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
  return { decision: { ...closeRequires(kept, dropped), dropped }, survey: fresh }
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
 * Re-check `p`, then for each candidate: `prepare` on every plugin, `delete`
 * on its owner, `deleted` on the others. A throw in `prepare` or `delete`
 * fails that candidate and skips those requiring it; a {@link FatalRun} stops
 * the run and skips the rest. `deleted` failures are recorded and change
 * nothing.
 */
export function clean(
  p: Plan,
  plugins: readonly Plugin[],
  ctx: Ctx,
  opts: CleanOptions = {},
): Receipt {
  const now = opts.now ?? (() => new Date())
  let checked: ReturnType<typeof recheck>
  try {
    checked = recheck(p, plugins, ctx)
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
      const skip =
        fatal !== null
          ? `the run stopped: ${fatal}`
          : c.requires?.some((r) => stopped.has(r))
            ? 'a candidate it requires did not complete'
            : null
      if (skip !== null) {
        step.result = 'skipped'
        step.error = skip
      } else if (opts.dryRun === true) {
        step.result = 'would-run'
      } else {
        fatal = runOne(c, step, s, byName.get(c.owner))
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
function runOne(c: Candidate, step: Step, s: Survey, owner: Plugin | undefined): string | null {
  const fail = (err: unknown, prefix = ''): string | null => {
    step.result = 'failed'
    step.error = prefix + errorText(err)
    return err instanceof FatalRun ? step.error : null
  }
  for (const q of s.plugins) {
    if (q.prepare === undefined) continue
    try {
      q.prepare(c, s.ctx)
      step.preparedBy.push(q.name)
    } catch (err) {
      return fail(err, `${q.name}: prepare failed: `)
    }
  }
  if (owner?.delete === undefined) {
    return fail(`${c.owner} cannot delete`)
  }
  try {
    step.delete = owner.delete(c, s.ctx)
  } catch (err) {
    return fail(err)
  }
  for (const q of s.plugins) {
    if (q === owner || q.deleted === undefined) continue
    try {
      q.deleted(c, s.ctx)
      step.notified.push({ plugin: q.name, error: null })
    } catch (err) {
      step.notified.push({ plugin: q.name, error: errorText(err) })
    }
  }
  return null
}
