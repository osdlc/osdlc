/**
 * The plugin kit (D4): the safety helpers the shipped plugins use, so a code
 * plugin measures idle time, asks what is running, runs a program and
 * removes a folder the same way instead of writing its own. The core builds
 * one kit per plugin, bound to its name, and hands it to `create`. Each run,
 * once the plugin's `roots` hook has answered, the core binds that kit to the
 * plugin's roots, the run's targets and their linked worktrees (including
 * one anywhere whose main checkout is in a target), which `remove` checks
 * against.
 *
 * It reuses repo-cleaner's process probe, `busyHolders` and `sizeOf`, and
 * `@osdlc/path-guard` for containment (through `./roots.ts`).
 */

import { chmodSync, lstatSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

import {
  CommandFailed,
  spawnRunnerAsync,
  which,
  type AsyncCommandRunner,
  type CommandResult,
} from '@osdlc/command-seam'
import { busyHolders, defaultProcessProbe, sizeOf, type ProcessProbe } from '@osdlc/repo-cleaner'
import { z } from 'zod'

import { boundBy, type Bounds } from './roots.ts'
import type { Candidate, Ctx, PathCandidate, Plugin, RefCandidate } from './types.ts'

export const DEFAULT_IDLE_HOURS = 24

/**
 * The `idleHours` setting. A plugin that declares it under that key inherits
 * the config's top-level `idleHours` when its own entry sets none (see
 * `settingsOf` in `./settings.ts`).
 */
export const idleHoursSetting = z
  .number()
  .nonnegative()
  .optional()
  .describe(
    `Hours an artifact must have sat unused before it is a candidate; 0 takes every one. Unset: the config's top-level idleHours, else ${DEFAULT_IDLE_HOURS}.`,
  )

/** How long {@link Kit.idle} and {@link Kit.size} may take on one folder, in milliseconds, unless the kit is given another. */
export const MEASURE_BUDGET_MS = 10_000

/** The time limit of {@link Kit.run}, in milliseconds, unless the call gives another. */
export const RUN_LIMIT_MS = 30_000

const HOUR_MS = 3_600_000

/**
 * How long a folder has sat unchanged: the newest modification time under it
 * and the hours since, fractions included, both null when it holds no file. `unmeasured`
 * when the walk ran out of its time budget; the core then protests the
 * candidate (`unmeasured`), and the plugin leaves the outcome out of its
 * evidence, since the next walk may finish.
 */
export type Idle =
  { unmeasured: false; newestMs: number | null; hours: number | null } | { unmeasured: true }

/** The processes found; `unknown` is set when the process table could not be read. */
export interface Running {
  /** Each as `<command> (pid <n>)`. */
  names: string[]
  unknown?: string | undefined
}

/** A candidate without its `id` and `owner`, which {@link Kit.candidate} fills in; `evidence` defaults to `{}`. */
export type CandidateFields =
  | (Omit<PathCandidate, 'id' | 'owner' | 'evidence'> & { evidence?: Record<string, unknown> })
  | (Omit<RefCandidate, 'id' | 'owner' | 'evidence'> & { evidence?: Record<string, unknown> })

export interface KitRunOptions {
  /** The hook's `ctx.signal`: aborting it stops the program. */
  signal: AbortSignal
  /** Default: the home folder. */
  cwd?: string | undefined
  /** Variables over the kit's environment. */
  env?: Readonly<Record<string, string | undefined>> | undefined
  /** Default {@link RUN_LIMIT_MS}. */
  timeoutMs?: number | undefined
  /** Throw `CommandFailed` when the program does not exit 0. */
  check?: boolean | undefined
}

export interface KitRunResult extends CommandResult {
  /** The program ran and exited 0. */
  ok: boolean
}

/** The helpers one plugin is given. */
export interface Kit {
  /** The plugin the kit is bound to; the owner of every candidate it builds. */
  readonly owner: string
  /**
   * How long `path` has sat unchanged, by the newest modification time of any
   * file under it, links not followed, within the time budget. `skip` names
   * entries to pass over, files and directories alike. Throws when a directory
   * cannot be read, since what it hides may be recent; one that vanishes
   * mid-walk is skipped.
   */
  idle(path: string, opts?: { skip?: ((name: string) => boolean) | undefined }): Idle
  /** Bytes `path` takes on disk, by repo-cleaner's `sizeOf` (`du`) within the time budget; null when it could not be read. */
  size(path: string): number | null
  /**
   * The processes of a program, named as a string or as `{ name }`, or the
   * busy processes working in `in` (an idle shell is not busy). The process
   * table is read once per hook call, so a `delete` sees it fresh.
   */
  running(where: string | { in: string } | { name: string }, ctx: Pick<Ctx, 'signal'>): Running
  /** Whether `program` is on PATH. */
  onPath(program: string): boolean
  /** A candidate with its id (`<kind>:<path>` or `<kind>:<ref>`) and this plugin as its owner. */
  candidate(fields: CandidateFields): Candidate
  /** Runs `argv` through `@osdlc/command-seam` with a time limit, stopped when `signal` aborts. */
  run(argv: readonly string[], opts: KitRunOptions): Promise<KitRunResult>
  /**
   * Removes the folder `path`: only if it is still inside the plugin's roots,
   * a target or a linked worktree of one (a worktree of a repository a
   * target is in, or whose main checkout is in a target) by its real path, as the core
   * resolved them this run, after making read-only folders and files in it
   * writable. Returns the receipt sentence; a folder already gone is not a
   * failure. Throws when it is outside, when the kit is not bound to a run,
   * when `ctx.signal` has aborted, or when the folder is still there after.
   */
  remove(path: string, ctx?: Pick<Ctx, 'signal'>): string
}

/** What a kit is built with; every field has a default. */
export interface KitOptions {
  /** The clock idle time and the time budget are read from. */
  now?: (() => Date) | undefined
  /** Default {@link MEASURE_BUDGET_MS}. */
  budgetMs?: number | undefined
  probe?: ProcessProbe | undefined
  /** The runner for a program, by name. Default: `spawnRunnerAsync`. */
  runner?: ((program: string) => AsyncCommandRunner) | undefined
  /** Where `program` is on PATH. Default: command-seam's `which` over `env`. */
  which?: ((program: string) => string | undefined) | undefined
  /** The command line's environment. */
  env?: Readonly<Record<string, string | undefined>> | undefined
}

/** Each kit's setter for its bounds, kept off {@link Kit} so a plugin cannot widen its own. */
const binders = new WeakMap<Kit, (bounds: Bounds) => void>()

/** The kit each plugin was created with. */
const kits = new WeakMap<Plugin, Kit>()

/** Records that `plugin` was built on `kit`, so the core can bind it each run. `definePlugin`'s `create` calls it. */
export function attachKit(plugin: Plugin, kit: Kit): void {
  kits.set(plugin, kit)
}

/** Binds the kit `plugin` was built on to `bounds` for {@link Kit.remove}; a plugin built on no kit is left alone. */
export function bindKit(plugin: Plugin, bounds: Bounds): void {
  const kit = kits.get(plugin)
  if (kit !== undefined) binders.get(kit)?.(bounds)
}

/** Thrown inside {@link Kit.idle}'s walk when the budget runs out. */
class OutOfTime extends Error {}

/** True when `path` exists as itself, a link counted as present. */
const present = (path: string): boolean => lstatSync(path, { throwIfNoEntry: false }) !== undefined

/** Gives the owner write (and, for a folder, search) permission on everything under `path`, links not followed. Best effort. */
function makeWritable(path: string): void {
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (stat === undefined || stat.isSymbolicLink()) return
  const want = stat.mode | (stat.isDirectory() ? 0o700 : 0o200)
  try {
    if (want !== stat.mode) chmodSync(path, want & 0o7777)
  } catch {
    // the removal reports what is left
  }
  if (!stat.isDirectory()) return
  let names: string[]
  try {
    names = readdirSync(path)
  } catch {
    return
  }
  for (const name of names) makeWritable(join(path, name))
}

/** The kit for the plugin `owner`. */
export function pluginKit(owner: string, opts: KitOptions = {}): Kit {
  const now = opts.now ?? (() => new Date())
  const budget = opts.budgetMs ?? MEASURE_BUDGET_MS
  const probe = opts.probe ?? defaultProcessProbe()
  const runner = opts.runner ?? ((program: string) => spawnRunnerAsync(program))
  const lookup = opts.which ?? ((program: string) => which(program, { env: opts.env }))
  // The hook calls that have read the process table: the first read in each is fresh.
  const read = new WeakSet<AbortSignal>()
  const holders = (path: string, signal: AbortSignal) => {
    const fresh = !read.has(signal)
    read.add(signal)
    return probe.holders(path, fresh ? { fresh: true } : undefined)
  }

  // Unbound until the core resolves this plugin's roots in a run.
  let bounds: Bounds | undefined

  const kit: Kit = {
    owner,
    idle(path, { skip = () => false } = {}) {
      const start = now().getTime()
      let newest: number | null = null
      const visit = (dir: string): void => {
        if (now().getTime() - start > budget) throw new OutOfTime()
        let entries
        try {
          entries = readdirSync(dir, { withFileTypes: true })
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
          throw err
        }
        for (const entry of entries) {
          if (skip(entry.name)) continue
          const full = join(dir, entry.name)
          if (entry.isDirectory()) {
            visit(full)
            continue
          }
          const stat = lstatSync(full, { throwIfNoEntry: false })
          if (stat !== undefined && (newest === null || stat.mtimeMs > newest)) {
            newest = stat.mtimeMs
          }
        }
      }
      try {
        visit(path)
      } catch (err) {
        if (err instanceof OutOfTime) return { unmeasured: true }
        throw err
      }
      const hours: number | null = newest === null ? null : Math.max(0, (start - newest) / HOUR_MS)
      return { unmeasured: false, newestMs: newest, hours }
    },
    size: (path) => sizeOf(path, { timeoutMs: budget }),
    running(where, ctx) {
      try {
        const by = typeof where === 'string' ? { name: where } : where
        const found =
          'in' in by
            ? busyHolders(holders(by.in, ctx.signal))
            : holders('/', ctx.signal).filter((h) => h.command === by.name)
        return { names: found.map((h) => `${h.command} (pid ${h.pid})`) }
      } catch (err) {
        return { names: [], unknown: err instanceof Error ? err.message : String(err) }
      }
    },
    onPath: (program) => lookup(program) !== undefined,
    candidate(fields) {
      const id = `${fields.kind}:${fields.path ?? fields.ref}`
      return { ...fields, id, owner, evidence: fields.evidence ?? {} } as Candidate
    },
    async run(argv, o) {
      const [program, ...args] = argv
      if (program === undefined) throw new Error('kit.run: argv is empty')
      const env =
        opts.env === undefined && o.env === undefined ? undefined : { ...opts.env, ...o.env }
      const r = await runner(program).run(args, {
        cwd: o.cwd ?? homedir(),
        signal: o.signal,
        timeoutMs: o.timeoutMs ?? RUN_LIMIT_MS,
        ...(env === undefined ? {} : { env }),
      })
      if (o.check === true && r.exitCode !== 0) throw new CommandFailed(args, r, program)
      return { ...r, ok: r.exitCode === 0 && r.neverExited !== true }
    },
    remove(path, ctx) {
      if (ctx?.signal.aborted === true)
        throw new Error(`${path} was not removed: the hook was stopped`)
      if (!present(path)) return `already gone: ${path}`
      if (bounds === undefined) {
        throw new Error(`${path} was not removed: ${owner}'s kit is not bound to a run`)
      }
      if (boundBy(bounds, path) === null) {
        throw new Error(`${path} is not inside ${owner}'s roots or the targets`)
      }
      const bytes = sizeOf(path, { timeoutMs: budget })
      makeWritable(path)
      rmSync(path, { recursive: true })
      if (present(path)) throw new Error(`${path} is still there after removal`)
      return bytes === null ? `removed ${path}` : `removed ${path}; freed ${bytes} bytes`
    },
  }
  binders.set(kit, (b) => {
    bounds = b
  })
  return kit
}
