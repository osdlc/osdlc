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

import { lstatSync } from 'node:fs'
import { sep } from 'node:path'

import type { CommandRunner } from '@osdlc/command-seam'
import { nodeGuard } from '@osdlc/path-guard/node'
import { Git } from '@osdlc/typed-git'

import { DEFAULT_IDLE_HOURS, pluginKit, type Kit, type KitOptions, type Running } from './kit.ts'
import type { Candidate, Ctx, MaybePromise, Objection, Plugin } from './types.ts'

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
}

/** The env of one hook call; an `idleHours` that is not a finite number of zero or more becomes {@link DEFAULT_IDLE_HOURS}. */
export function envOf(kit: Kit, opts: Pick<ArtifactOptions, 'idleHours' | 'git'>, ctx: Ctx): Env {
  const idle = opts.idleHours
  return {
    kit,
    git: opts.git,
    idleHours: idle !== undefined && Number.isFinite(idle) && idle >= 0 ? idle : DEFAULT_IDLE_HOURS,
    ctx,
  }
}

/** Whether `path` is one of `ignore` or below one. */
const ignored = (path: string, ignore: readonly string[]): boolean =>
  ignore.some((dir) => path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep))

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
      if (ignored(tree.path, env.ctx.ignore ?? [])) continue
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

/** True when `path` exists as itself, a link counted as present. */
export const present = (path: string): boolean =>
  lstatSync(path, { throwIfNoEntry: false }) !== undefined

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

/** A candidate and what a refusal of it rests on. */
export interface Row {
  candidate: Candidate
  /** Each becomes a `refuse` objection by the owner. */
  blockers: Array<{ code: string; reason: string }>
}

export const objectionsTo = (owner: string, row: Row): Objection[] =>
  row.blockers.map((b) => ({
    by: owner,
    candidate: row.candidate.id,
    level: 'refuse',
    code: b.code,
    reason: b.reason,
  }))

/**
 * The row for one artifact directory: a candidate, refused while a process
 * works in the checkout or the process table cannot be read. An unmeasured
 * one is not sized either: a folder too slow to walk is too slow for `du`.
 */
export function artifactRow(kit: Kit, f: ArtifactFacts): Row {
  const blockers = [
    ...(f.held.names.length > 0
      ? [
          {
            code: 'live-process',
            reason: `running in the checkout: ${f.held.names.join(', ')}`,
          },
        ]
      : []),
    ...(f.held.unknown === undefined
      ? []
      : [
          {
            code: 'process-table-unreadable',
            reason: `process table unreadable: ${f.held.unknown}`,
          },
        ]),
  ]
  const bytes = f.unmeasured === true ? null : kit.size(f.path)
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
 * unrefused: `rowsOf` is read again for that checkout alone, and the kit reads
 * the process table fresh for this call, so idle time and holders are checked
 * now. `kit.remove` then checks the path is still inside the targets by its
 * real path and that it is gone afterwards. A directory already gone (its
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
  const now = (where === undefined ? [] : await rowsOf(env, where)).find(
    (r) => r.candidate.id === c.id,
  )
  if (now === undefined) throw new Error(`${path} is no longer a candidate`)
  if (now.blockers.length > 0) {
    throw new Error(`${path} is refused: ${now.blockers.map((b) => b.reason).join(', ')}`)
  }
  return env.kit.remove(path, env.ctx)
}

/** The longest a survey of every checkout may take: it walks each one. */
const DISCOVER_LIMIT_MS = 10 * 60_000

/**
 * The plugin both artifact plugins are: `rowsOf` lists one checkout's rows,
 * `detect` says whether the plugin applies. Without a kit, one is built from `opts`.
 */
export function artifactPlugin(
  name: string,
  opts: ArtifactOptions,
  detect: (env: Env) => MaybePromise<boolean>,
  rowsOf: (env: Env, checkout: Checkout) => Promise<Row[]>,
  kit: Kit = pluginKit(name, opts),
): Plugin {
  let rows = new Map<string, Row>()
  return {
    name,
    limits: { discover: DISCOVER_LIMIT_MS },
    detect: (ctx) => detect(envOf(kit, opts, ctx)),
    async discover(ctx) {
      const env = envOf(kit, opts, ctx)
      const found: Row[] = []
      for (const c of checkoutsOf(env)) found.push(...(await rowsOf(env, c)))
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
}
