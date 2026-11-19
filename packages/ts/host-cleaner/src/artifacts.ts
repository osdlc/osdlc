/**
 * What the `cargo` and `node` adapters share: finding the checkouts a run
 * covers, measuring a directory, containing a path inside its checkout, and
 * removing one artifact directory under the same checks that listed it.
 *
 * A row is `artifact:<absolute path>`. Its evidence is its fingerprint:
 * `kind`, `path`, `checkout`, `sizeBytes`, `idleHours` (rounded down),
 * `newestMtimeMs` and `unattended`.
 */

import { existsSync, lstatSync, readdirSync, realpathSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'

import { nodeGuard } from '@osdlc/path-guard/node'
import type { ProcessHolder } from '@osdlc/repo-cleaner'
import { Git } from '@osdlc/typed-git'

import type { HostContext, HostRow, HostStep } from './adapter.ts'

export const DEFAULT_IDLE_HOURS = 24
const HOUR_MS = 3_600_000

export type ArtifactKind = 'cargo-target' | 'cargo-incremental' | 'node-modules'

/** A checkout a run covers: a repository's primary checkout or one of its linked worktrees. */
export interface Checkout {
  path: string
  primary: boolean
}

/**
 * The checkouts of every repository among `ctx.targets`, primary first; a
 * target that is not a repository adds none. Bare and missing worktrees are left out.
 */
export function checkoutsOf(ctx: HostContext): Checkout[] {
  const seen = new Set<string>()
  const out: Checkout[] = []
  for (const target of ctx.targets) {
    let trees
    try {
      trees = new Git(target, { runner: ctx.git }).worktrees()
    } catch {
      continue
    }
    for (const [i, tree] of trees.entries()) {
      if (tree.bare || seen.has(tree.path) || !existsSync(tree.path)) continue
      seen.add(tree.path)
      out.push({ path: tree.path, primary: i === 0 })
    }
  }
  return out
}

/** `config.adapters[name].idleHours` when it is a positive number, else the default. */
export function idleHoursSetting(ctx: HostContext, adapter: string): number {
  const value = ctx.config.adapters[adapter]?.idleHours
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : DEFAULT_IDLE_HOURS
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
 * it hides may be recent. `skip` names entries to pass over, files and directories alike.
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
      // A directory that vanished under a running build is fine; one that cannot be read hides activity.
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

/** The row for one artifact directory: `delete`, or `blocked` while a process works in the checkout. */
export function artifactRow(adapter: string, f: ArtifactFacts, now: Date): HostRow {
  const idleHours = f.newestMtimeMs === null ? null : idleHoursSince(f.newestMtimeMs, now)
  const blockers = [
    ...(f.held.names.length > 0 ? [`running in the checkout: ${f.held.names.join(', ')}`] : []),
    ...(f.held.unknown === undefined ? [] : [`process table unreadable: ${f.held.unknown}`]),
  ]
  const blocked = blockers.length > 0
  return {
    id: `artifact:${f.path}`,
    adapter,
    kind: 'artifact',
    name: f.path,
    verdict: blocked ? 'blocked' : 'delete',
    action: 'remove',
    why: f.why,
    risks: [],
    blockers,
    commands: [`rm -r ${f.path}`],
    notes: f.notes ?? [],
    evidence: {
      kind: f.kind,
      path: f.path,
      checkout: f.checkout,
      sizeBytes: sizeOf(f.path),
      idleHours,
      newestMtimeMs: f.newestMtimeMs,
      unattended: !blocked && f.idle,
    },
  }
}

/** A row for a path that resolves outside its checkout: nothing was measured and nothing will be removed. */
export function refusedRow(
  adapter: string,
  kind: ArtifactKind,
  path: string,
  checkout: string,
): HostRow {
  return {
    id: `artifact:${path}`,
    adapter,
    kind: 'artifact',
    name: path,
    verdict: 'blocked',
    action: null,
    why: 'resolves outside its checkout',
    risks: [],
    blockers: [`${path} resolves outside ${checkout}`],
    commands: [],
    notes: [],
    evidence: {
      kind,
      path,
      checkout,
      sizeBytes: null,
      idleHours: null,
      newestMtimeMs: null,
      unattended: false,
    },
  }
}

/** The processes working in `checkout` that `select` keeps; unknown when the table cannot be read. */
export function holdersIn(
  ctx: HostContext,
  checkout: string,
  select: (all: ProcessHolder[]) => ProcessHolder[],
): Held {
  try {
    const names = select(ctx.probe.holders(checkout)).map((h) => `${h.command} (pid ${h.pid})`)
    return { names }
  } catch (err) {
    return { names: [], unknown: err instanceof Error ? err.message : String(err) }
  }
}

/**
 * Remove the directory a step names, if its checkout's rows still hold it as
 * `delete`: `rowsOf` is read again for that checkout alone, over a probe that
 * reads the process table fresh, so idle time and holders are checked now. The
 * path is resolved through path-guard against its checkout, and the directory
 * must be gone afterwards. Returns what the receipt records.
 */
export function removeArtifact(
  rowsOf: (ctx: HostContext, checkout: Checkout) => HostRow[],
  step: HostStep,
  ctx: HostContext,
): string {
  const { path, checkout } = step.row.evidence as { path: string; checkout: string }
  const fresh: HostContext = {
    ...ctx,
    probe: { ...ctx.probe, holders: (p, o) => ctx.probe.holders(p, { ...o, fresh: true }) },
  }
  const where = checkoutsOf(fresh).find((c) => c.path === checkout)
  const now = (where === undefined ? [] : rowsOf(fresh, where)).find((r) => r.id === step.row.id)
  if (now === undefined) throw new Error(`${path} is no longer a candidate`)
  if (now.verdict !== 'delete')
    throw new Error(`${path} is ${now.verdict}: ${now.blockers.join(', ') || now.why}`)
  const target = inside(checkout, relative(realpathSync(checkout), path))
  if (target === null || target !== path) throw new Error(`${path} resolves outside ${checkout}`)
  const bytes = sizeOf(target)
  rmSync(target, { recursive: true })
  if (present(target)) throw new Error(`${target} is still there after removal`)
  return `removed ${target}; freed ${bytes} bytes`
}

/** A path with symlinks resolved, so differently spelled paths to one place compare equal; the path itself when it does not resolve. */
export function canon(path: string): string {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}
