/**
 * What the `cargo` and `node` plugins share: finding the checkouts a run
 * covers, containing a path inside its checkout, and removing one artifact
 * directory under the same checks that listed it. Idle time, processes, sizes
 * and the removal itself go through the plugin kit, as a code plugin's would.
 *
 * A candidate is `artifact:<absolute path>`; its evidence is built in
 * `artifactRow` and `refusedRow`. It leaves out the newest modification time
 * and the size: either may be unmeasured in one survey and measured in the
 * next, which would read as changed. Whether an artifact is idle is judged
 * again at the re-check instead, where one that is no longer idle is gone.
 */

import type { CommandRunner } from '@osdlc/command-seam'
import { nodeGuard } from '@osdlc/path-guard/node'
import { Git } from '@osdlc/typed-git'

import { DISCOVER_LIMIT_MS, checkAgain, objectionsTo, yieldToLimit, type Row } from './helpers.ts'
import {
  attachKit,
  coveredBy,
  idleHoursOr,
  pluginKit,
  present,
  type Kit,
  type KitOptions,
  type Running,
} from './kit.ts'
import type { Candidate, Ctx, MaybePromise, Plugin } from './types.ts'

export { hoursText, objectionsTo, type Row } from './helpers.ts'

export type ArtifactKind = 'cargo-target' | 'cargo-incremental' | 'node-modules'

/** A checkout a run covers: a repository's primary checkout or one of its linked worktrees. */
export interface Checkout {
  path: string
  primary: boolean
}

/** What an artifact plugin is built with beyond the kit's own options; every field has a default. */
export interface ArtifactOptions extends KitOptions {
  /** Idle hours before an artifact is a candidate (default {@link DEFAULT_IDLE_HOURS}); 0 makes every artifact a candidate. */
  idleHours?: number | undefined
  /** The git runner worktrees are listed with. */
  git?: CommandRunner | undefined
}

/** What one hook call works with: the kit, the threshold, and the run's context. */
export interface Env {
  kit: Kit
  git: CommandRunner | undefined
  idleHours: number
  ctx: Ctx
  /** True: only whether an artifact may go is asked, so its size is not read. */
  unsized?: boolean | undefined
}

/** The env of one hook call, with `idleHours` as {@link idleHoursOr} takes it. */
export function envOf(kit: Kit, opts: Pick<ArtifactOptions, 'idleHours' | 'git'>, ctx: Ctx): Env {
  return { kit, git: opts.git, idleHours: idleHoursOr(opts.idleHours), ctx }
}

/**
 * The checkouts of every repository among the run's targets, primary first; a
 * target that is not a repository adds none. Bare, missing and ignored worktrees are left out.
 */
export function checkoutsOf(env: Env): Checkout[] {
  const seen = new Set<string>()
  const out: Checkout[] = []
  for (const target of env.ctx.targets) {
    let trees
    try {
      trees = new Git(target, { runner: env.git }).worktrees()
    } catch {
      continue
    }
    for (const [i, tree] of trees.entries()) {
      if (tree.bare || seen.has(tree.path) || !present(tree.path)) continue
      if (coveredBy(tree.path, env.ctx.ignore ?? []) !== undefined) continue
      seen.add(tree.path)
      out.push({ path: tree.path, primary: i === 0 })
    }
  }
  return out
}

/**
 * `rel` under `checkout`, resolved through path-guard; null when it escapes
 * (a symlink or `..` leads out of the checkout). Nothing is read beyond the links.
 */
export const inside = (checkout: string, rel: string): string | null =>
  nodeGuard.tryResolve(checkout, rel)

export interface ArtifactFacts {
  kind: ArtifactKind
  path: string
  checkout: string
  /** What `kit.running` found in the checkout. */
  held: Running
  /** Idle for the threshold; an artifact that is not is held for review. */
  idle: boolean
  /** Its idle time ran out of the kit's budget: not measured, and protested by the core. */
  unmeasured?: boolean
  why: string
  notes?: string[]
}

/** What refuses deleting in a checkout where `kit.running` found `held`: a busy process, or a process table it could not read. */
export function liveBlockers(held: Running): Array<{ code: string; reason: string }> {
  return [
    ...(held.names.length > 0
      ? [{ code: 'live-process', reason: `running in the checkout: ${held.names.join(', ')}` }]
      : []),
    ...(held.unknown === undefined
      ? []
      : [{ code: 'process-table-unreadable', reason: `process table unreadable: ${held.unknown}` }]),
  ]
}

/**
 * The row for one artifact directory: a candidate, refused while a process
 * works in the checkout or the process table cannot be read. An unmeasured
 * one is not sized either: a folder too slow to walk is too slow for `du`.
 */
export function artifactRow({ kit, unsized }: Pick<Env, 'kit' | 'unsized'>, f: ArtifactFacts): Row {
  const blockers = liveBlockers(f.held)
  const bytes = f.unmeasured === true || unsized === true ? null : kit.size(f.path)
  return {
    blockers,
    candidate: kit.candidate({
      kind: 'artifact',
      path: f.path,
      why: f.why,
      ...(bytes === null ? {} : { bytes }),
      ...(f.idle || f.unmeasured === true ? {} : { held: true }),
      ...(f.unmeasured === true ? { unmeasured: true } : {}),
      evidence: {
        kind: f.kind,
        path: f.path,
        checkout: f.checkout,
        notes: f.notes ?? [],
      },
    }),
  }
}

/** A row for a path that resolves outside its checkout: nothing was measured and nothing will be removed. */
export function refusedRow(kit: Kit, kind: ArtifactKind, path: string, checkout: string): Row {
  return {
    blockers: [{ code: 'outside-checkout', reason: `${path} resolves outside ${checkout}` }],
    candidate: kit.candidate({
      kind: 'artifact',
      path,
      why: 'resolves outside its checkout',
      held: true,
      evidence: { kind, path, checkout },
    }),
  }
}

/**
 * Remove the directory `c` names, if its checkout's rows still hold it
 * unrefused: `rowsOf` is read again for that checkout alone, unsized, and the
 * kit reads the process table fresh for this call, so idle time and holders
 * are checked now ({@link checkAgain}); one the plan had as idle that is now
 * held or unmeasured is kept. `kit.remove` then checks containment again and that the directory is gone
 * afterwards (see `Kit.remove` in `./kit.ts`). A directory already gone (its
 * worktree was deleted first in this run) is not a failure. Returns what the
 * receipt records.
 */
export async function removeArtifact(
  rowsOf: (env: Env, checkout: Checkout) => Promise<Row[]>,
  c: Candidate,
  env: Env,
): Promise<string> {
  const { path, checkout } = c.evidence as { path: string; checkout: string }
  if (!present(path)) return `already gone: ${path}`
  const where = checkoutsOf(env).find((x) => x.path === checkout)
  const rows = where === undefined ? [] : await rowsOf({ ...env, unsized: true }, where)
  checkAgain(
    c,
    rows.find((r) => r.candidate.id === c.id),
  )
  await yieldToLimit(env.ctx)
  return env.kit.remove(path, env.ctx)
}

/**
 * The plugin both artifact plugins are: `rowsOrThrow` lists one checkout's
 * rows, and a checkout it throws on gives none; `detect` says whether the
 * plugin applies. Without a kit, one is built from `opts`.
 */
export function artifactPlugin(
  name: string,
  opts: ArtifactOptions,
  detect: (env: Env) => MaybePromise<boolean>,
  rowsOrThrow: (env: Env, checkout: Checkout) => MaybePromise<Row[]>,
  kit: Kit = pluginKit(name, opts),
): Plugin {
  const rowsOf = async (env: Env, checkout: Checkout): Promise<Row[]> => {
    try {
      return await rowsOrThrow(env, checkout)
    } catch {
      // A directory that cannot be read may hide recent work: no row.
      return []
    }
  }
  let rows = new Map<string, Row>()
  const plugin: Plugin = {
    name,
    limits: { discover: DISCOVER_LIMIT_MS },
    detect: (ctx) => detect(envOf(kit, opts, ctx)),
    async discover(ctx) {
      const env = envOf(kit, opts, ctx)
      const found: Row[] = []
      for (const c of checkoutsOf(env)) {
        await yieldToLimit(ctx)
        found.push(...(await rowsOf(env, c)))
      }
      rows = new Map(found.map((r) => [r.candidate.id, r]))
      return found.map((r) => r.candidate)
    },
    object: (all) =>
      all.flatMap((c) => {
        const row = rows.get(c.id)
        return c.owner === name && row !== undefined ? objectionsTo(name, row) : []
      }),
    delete: (c, ctx) => removeArtifact(rowsOf, c, envOf(kit, opts, ctx)),
  }
  // Built without `definePlugin` when called directly, so tie the kit here too.
  attachKit(plugin, kit)
  return plugin
}
