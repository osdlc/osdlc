/**
 * What the `cargo` and `node` plugins share: finding the checkouts a run
 * covers, measuring a directory, containing a path inside its checkout, and
 * removing one artifact directory under the same checks that listed it.
 *
 * A candidate is `artifact:<absolute path>`; its evidence is built in
 * `artifactRow` and `refusedRow`. It leaves out `idleHours`, which moves with the
 * clock and would make every saved plan read as changed.
 */

import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { nodeGuard } from '@osdlc/path-guard/node'
import { defaultProcessProbe, type ProcessHolder, type ProcessProbe } from '@osdlc/repo-cleaner'
import { Git } from '@osdlc/typed-git'

import { coveredBy } from './ignore.ts'
import type { Candidate, Ctx, Objection, Plugin } from './types.ts'

export const DEFAULT_IDLE_HOURS = 24
const HOUR_MS = 3_600_000

export type ArtifactKind = 'cargo-target' | 'cargo-incremental' | 'node-modules'

/** A checkout a run covers: a repository's primary checkout or one of its linked worktrees. */
export interface Checkout {
  path: string
  primary: boolean
}

/** What an artifact plugin is told beyond the run's context; every field has a default. */
export interface ArtifactOptions {
  /** Idle hours before an artifact is a candidate (default {@link DEFAULT_IDLE_HOURS}); 0 makes every artifact a candidate. */
  idleHours?: number | undefined
  /** The git runner worktrees are listed with. */
  git?: CommandRunner | undefined
  /** A runner for any other binary, by name. */
  command?: ((binary: string) => CommandRunner) | undefined
  probe?: ProcessProbe | undefined
  now?: (() => Date) | undefined
}

/** {@link ArtifactOptions} with the defaults filled in, and the run's targets. */
export interface Env {
  git: CommandRunner | undefined
  command: (binary: string) => CommandRunner
  probe: ProcessProbe
  now: () => Date
  idleHours: number
  targets: readonly string[]
  ignore: readonly string[]
}

/** `opts` with defaults filled in; an `idleHours` that is not a finite number of zero or more becomes {@link DEFAULT_IDLE_HOURS}. */
export function envOf(opts: ArtifactOptions, ctx: Ctx): Env {
  const idle = opts.idleHours
  return {
    git: opts.git,
    command: opts.command ?? ((binary) => spawnRunner(binary)),
    probe: opts.probe ?? defaultProcessProbe(),
    now: opts.now ?? (() => new Date()),
    idleHours: idle !== undefined && Number.isFinite(idle) && idle >= 0 ? idle : DEFAULT_IDLE_HOURS,
    targets: ctx.targets,
    ignore: ctx.ignore ?? [],
  }
}

/**
 * The checkouts of every repository among `env.targets`, primary first; a
 * target that is not a repository adds none. Bare and missing worktrees are left out.
 */
export function checkoutsOf(env: Env): Checkout[] {
  const seen = new Set<string>()
  const out: Checkout[] = []
  for (const target of env.targets) {
    let trees
    try {
      trees = new Git(target, { runner: env.git }).worktrees()
    } catch {
      continue
    }
    for (const [i, tree] of trees.entries()) {
      if (tree.bare || seen.has(tree.path) || !existsSync(tree.path)) continue
      if (coveredBy(tree.path, env.ignore) !== undefined) continue
      seen.add(tree.path)
      out.push({ path: tree.path, primary: i === 0 })
    }
  }
  return out
}

/** Bytes under `path`, every file counted, symlinks counted as themselves and not followed. */
export function sizeOf(path: string): number {
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (stat === undefined) return 0
  if (!stat.isDirectory()) return stat.size
  let total = 0
  let names: string[]
  try {
    names = readdirSync(path)
  } catch {
    return total
  }
  for (const name of names) total += sizeOf(join(path, name))
  return total
}

/**
 * The newest modification time (ms) of any file under `dir`, links not followed;
 * null when it holds none. Throws when a directory cannot be read, since what
 * it hides may be recent; one that vanishes mid-walk is skipped. `skip` names entries to pass over, files and directories alike.
 */
export function newestMtime(
  dir: string,
  skip: (name: string) => boolean = () => false,
): number | null {
  let newest: number | null = null
  const visit = (path: string): void => {
    let entries
    try {
      entries = readdirSync(path, { withFileTypes: true })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
      throw err
    }
    for (const entry of entries) {
      if (skip(entry.name)) continue
      const full = join(path, entry.name)
      if (entry.isDirectory()) {
        visit(full)
        continue
      }
      const stat = lstatSync(full, { throwIfNoEntry: false })
      if (stat !== undefined && (newest === null || stat.mtimeMs > newest)) newest = stat.mtimeMs
    }
  }
  visit(dir)
  return newest
}

/** Whole hours from `mtimeMs` to now, never negative. */
export const idleHoursSince = (mtimeMs: number, now: Date): number =>
  Math.max(0, Math.floor((now.getTime() - mtimeMs) / HOUR_MS))

/**
 * `rel` under `checkout`, resolved through path-guard; null when it escapes
 * (a symlink or `..` leads out of the checkout). Nothing is read beyond the links.
 */
export const inside = (checkout: string, rel: string): string | null =>
  nodeGuard.tryResolve(checkout, rel)

/** True when `path` exists as itself, a link counted as present. */
export const present = (path: string): boolean =>
  lstatSync(path, { throwIfNoEntry: false }) !== undefined

/** Processes found working in a checkout; `unknown` is set when the process table could not be read. */
export interface Held {
  names: string[]
  unknown?: string
}

export interface ArtifactFacts {
  kind: ArtifactKind
  path: string
  checkout: string
  /** Newest mtime that decides idleness; null when there is no file to date it by. */
  newestMtimeMs: number | null
  /** What {@link holdersIn} found in the checkout. */
  held: Held
  /** Idle for the threshold, which decides `unattended`. */
  idle: boolean
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

/** The row for one artifact directory: a candidate, refused while a process works in the checkout or the process table cannot be read. */
export function artifactRow(owner: string, f: ArtifactFacts, now: Date): Row {
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
  const sizeBytes = sizeOf(f.path)
  return {
    blockers,
    candidate: {
      id: `artifact:${f.path}`,
      kind: 'artifact',
      path: f.path,
      owner,
      why: f.why,
      bytes: sizeBytes,
      unattended: blockers.length === 0 && f.idle,
      evidence: {
        kind: f.kind,
        path: f.path,
        checkout: f.checkout,
        sizeBytes,
        newestMtimeMs: f.newestMtimeMs,
        unattended: blockers.length === 0 && f.idle,
        notes: f.notes ?? [],
      },
    },
  }
}

/** A row for a path that resolves outside its checkout: nothing was measured and nothing will be removed. */
export function refusedRow(owner: string, kind: ArtifactKind, path: string, checkout: string): Row {
  return {
    blockers: [{ code: 'outside-checkout', reason: `${path} resolves outside ${checkout}` }],
    candidate: {
      id: `artifact:${path}`,
      kind: 'artifact',
      path,
      owner,
      why: 'resolves outside its checkout',
      unattended: false,
      evidence: {
        kind,
        path,
        checkout,
        sizeBytes: null,
        newestMtimeMs: null,
        unattended: false,
      },
    },
  }
}

/** The processes working in `checkout` that `select` keeps; unknown when the table cannot be read. */
export function holdersIn(
  env: Env,
  checkout: string,
  select: (all: ProcessHolder[]) => ProcessHolder[],
): Held {
  try {
    const names = select(env.probe.holders(checkout)).map((h) => `${h.command} (pid ${h.pid})`)
    return { names }
  } catch (err) {
    return { names: [], unknown: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Remove the directory `c` names, if its checkout's rows still hold it
 * unrefused: `rowsOf` is read again for that checkout alone, over a probe that
 * reads the process table fresh, so idle time and holders are checked now. The
 * path is resolved through path-guard against its checkout, and the directory
 * must be gone afterwards. A directory already gone (its worktree was deleted
 * first in this run) is not a failure. Returns what the receipt records.
 */
export function removeArtifact(
  rowsOf: (env: Env, checkout: Checkout) => Row[],
  c: Candidate,
  env: Env,
): string {
  const { path, checkout } = c.evidence as { path: string; checkout: string }
  if (!present(path)) return `already gone: ${path}`
  const fresh: Env = {
    ...env,
    probe: { ...env.probe, holders: (p, o) => env.probe.holders(p, { ...o, fresh: true }) },
  }
  const where = checkoutsOf(fresh).find((x) => x.path === checkout)
  const now = (where === undefined ? [] : rowsOf(fresh, where)).find((r) => r.candidate.id === c.id)
  if (now === undefined) throw new Error(`${path} is no longer a candidate`)
  if (now.blockers.length > 0) {
    throw new Error(`${path} is refused: ${now.blockers.map((b) => b.reason).join(', ')}`)
  }
  const target = inside(checkout, relative(realpathSync(checkout), path))
  if (target === null || target !== path) throw new Error(`${path} resolves outside ${checkout}`)
  const bytes = sizeOf(target)
  rmSync(target, { recursive: true })
  if (present(target)) throw new Error(`${target} is still there after removal`)
  return `removed ${target}; freed ${bytes} bytes`
}

/** The plugin both artifact plugins are: `rowsOf` lists one checkout's rows, `detect` says whether the plugin applies. */
export function artifactPlugin(
  name: string,
  opts: ArtifactOptions,
  detect: (env: Env) => boolean,
  rowsOf: (env: Env, checkout: Checkout) => Row[],
): Plugin {
  let rows = new Map<string, Row>()
  return {
    name,
    detect: (ctx) => detect(envOf(opts, ctx)),
    discover(ctx) {
      const env = envOf(opts, ctx)
      const found = checkoutsOf(env).flatMap((c) => rowsOf(env, c))
      rows = new Map(found.map((r) => [r.candidate.id, r]))
      return found.map((r) => r.candidate)
    },
    object: (all) =>
      all.flatMap((c) => {
        const row = rows.get(c.id)
        return c.owner === name && row !== undefined ? objectionsTo(name, row) : []
      }),
    delete: (c, ctx) => removeArtifact(rowsOf, c, envOf(opts, ctx)),
  }
}
