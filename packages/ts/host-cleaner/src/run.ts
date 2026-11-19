/**
 * The phase runner. `survey` is scope, discover and object; `decide` and
 * `recheck` pick what runs; `clean` is prepare, delete and deleted.
 */

import { sameFingerprint } from '@osdlc/repo-cleaner'

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

/** The fixed plugin order. It decides only which plugin keeps a duplicate candidate: the first. */
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

/**
 * Scope, discover and object. A plugin that throws in `scope` or `discover`
 * proposes nothing, with a warning; one that throws in `object` refuses every
 * candidate, since what it would object to is unknown. A {@link FatalRun}
 * from any phase goes to the caller. A duplicate candidate id keeps the first
 * plugin's, with a warning naming both.
 */
export function survey(all: readonly Plugin[], ctx: Ctx): Survey {
  const warnings: string[] = []
  const plugins = orderPlugins(all).filter((p) => {
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

  const targets = [...ctx.targets]
  for (const p of plugins) {
    for (const root of guarded(p, 'scope', [], () => p.scope?.(ctx) ?? [])) {
      if (!targets.includes(root)) targets.push(root)
    }
  }
  const scoped: Ctx = { ...ctx, targets }

  const candidates: Candidate[] = []
  const first = new Map<string, string>()
  for (const p of plugins) {
    for (const c of guarded(p, 'discover', [], () => p.discover?.(scoped) ?? [])) {
      if (c.owner !== p.name) {
        warnings.push(`${p.name}: dropped ${c.id}, which names ${c.owner} as its owner`)
      } else if (first.has(c.id)) {
        warnings.push(`duplicate ${c.id}: kept ${first.get(c.id)}'s, dropped ${p.name}'s`)
      } else {
        first.set(c.id, p.name)
        candidates.push(c)
      }
    }
  }

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

/** A plan of `s`: every candidate and objection, and what was picked and allowed. */
export function plan(
  s: Pick<Survey, 'candidates' | 'objections' | 'warnings'>,
  opts: {
    pick?: readonly string[] | undefined
    allow?: readonly string[] | undefined
    now?: Date
  } = {},
): Plan {
  return {
    version: PLAN_VERSION,
    createdAt: (opts.now ?? new Date()).toISOString(),
    pick: opts.pick === undefined ? null : [...opts.pick],
    allow: [...(opts.allow ?? [])],
    warnings: s.warnings,
    candidates: s.candidates,
    objections: s.objections,
  }
}

export interface Decision {
  /** What runs, each candidate after the ones it requires. */
  run: Candidate[]
  dropped: Dropped[]
}

/**
 * What runs. The picked ids, or without a pick every candidate nothing
 * objects to at `refuse` or `protest`. A refused candidate is dropped as
 * `blocked`, an un-granted protest as `not-allowed`, an unknown pick as
 * `gone`. A candidate whose requirement does not run is dropped as `blocked`,
 * and so on up the chain. A `note` never gates.
 */
export function decide(
  candidates: readonly Candidate[],
  objections: readonly Objection[],
  pick: readonly string[] | null,
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
  const ids =
    pick ??
    candidates
      .filter((c) => gating(c.id, 'refuse').length === 0 && unmet(c.id).length === 0)
      .map((c) => c.id)

  const dropped: Dropped[] = []
  const running = new Map<string, Candidate>()
  for (const id of new Set(ids)) {
    const c = byId.get(id)
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

/** Drop what requires something that is not running, until none does; order the rest, requirements first. */
function closeRequires(running: Map<string, Candidate>, dropped: Dropped[]): { run: Candidate[] } {
  for (let again = true; again;) {
    again = false
    for (const c of running.values()) {
      const lacking = c.requires?.find((r) => !running.has(r))
      if (lacking === undefined) continue
      running.delete(c.id)
      dropped.push({
        id: c.id,
        reason: 'blocked',
        detail: `requires ${lacking}, which does not run`,
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
  return decide(p.candidates, p.objections, p.pick, p.allow)
}

/**
 * Judge a plan against the world now. Surveys again and decides over the same
 * picks, so a refusal that appeared since is `blocked`, a protest nobody
 * granted `not-allowed`, a vanished candidate `gone`, and one whose evidence
 * moved (repo-cleaner's `sameFingerprint`) `changed`.
 */
export function recheck(
  p: Plan,
  plugins: readonly Plugin[],
  ctx: Ctx,
): { decision: Decision; survey: Survey } {
  const planned = decidePlan(p)
  const fresh = survey(plugins, { ...ctx, allow: p.allow })
  const now = decide(
    fresh.candidates,
    fresh.objections,
    planned.run.map((c) => c.id),
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
  const { decision, survey: s } = recheck(p, plugins, ctx)
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
