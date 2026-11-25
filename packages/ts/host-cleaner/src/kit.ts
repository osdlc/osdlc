/**
 * The plugin kit (D4): the safety helpers the shipped plugins use, so a code
 * plugin measures idle time, asks what is running, runs a program and
 * removes a folder the same way instead of writing its own. The core builds
 * one kit per plugin, bound to its name, and hands it to `create`. Each run,
 * once the plugin's `roots` hook has answered, the core binds that kit to the
 * bounds `remove` checks against (see `boundBy` in `./roots.ts`).
 */

import { chmodSync, lstatSync, readdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'

import {
  CommandFailed,
  spawnRunner,
  spawnRunnerAsync,
  which,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '@osdlc/command-seam'
import { busyHolders, defaultProcessProbe, sizeOf, type ProcessProbe } from '@osdlc/repo-cleaner'
import { z } from 'zod'

import { errorText } from './helpers.ts'
import { boundBy, type Bounds } from './roots.ts'
import type { Candidate, Ctx, PathCandidate, Plugin, RefCandidate } from './types.ts'

/** The run's ignore check, for a plugin that walks checkouts itself. */
export { coveredBy } from './ignore.ts'

export const DEFAULT_IDLE_HOURS = 24

/** `idle` as an `idleHours` threshold: {@link DEFAULT_IDLE_HOURS} when it is not a finite number of zero or more. */
export const idleHoursOr = (idle: number | undefined): number =>
  idle !== undefined && Number.isFinite(idle) && idle >= 0 ? idle : DEFAULT_IDLE_HOURS

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

/** How long one call of {@link Kit.idle} or {@link Kit.size} may take, in milliseconds, unless the kit is given another. */
export const MEASURE_BUDGET_MS = 10_000

/** How many entries {@link Kit.idle} reads between two looks at the clock. */
const CLOCK_EVERY = 64

/** The time limit of {@link Kit.run}, in milliseconds, unless the call gives another. */
export const RUN_LIMIT_MS = 30_000

const HOUR_MS = 3_600_000

/**
 * How long a folder has sat unchanged: the newest modification time under it
 * and the hours since, fractions included, both null when it holds no file.
 * `unmeasured` when the walk ran out of its time budget; the plugin then marks
 * the candidate `unmeasured: true`, which the core protests, and leaves the
 * outcome out of its evidence, since the next walk may finish.
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
   * file under it, links not followed, within the time budget. Several paths
   * are one answer, by the newest file under any of them, within one budget.
   * `skip` names entries to pass over, files and directories alike. Throws
   * when a directory cannot be read, since what it hides may be recent; one
   * that vanishes mid-walk is skipped.
   */
  idle(
    path: string | readonly string[],
    opts?: { skip?: ((name: string) => boolean) | undefined },
  ): Idle
  /** Bytes `path` takes on disk, by repo-cleaner's `sizeOf` (`du`) within the time budget; null when it could not be read. */
  size(path: string): number | null
  /**
   * The processes of a program, named as a string or as `{ name }`, or the
   * busy processes working in `in` (an idle shell is not busy). A name
   * matches a process when {@link commandHasName} finds it in its command
   * line (`ps -axo pid=,ppid=,args=`). This process and the unbroken line
   * of ancestors above it whose command lines name host-cleaner are left
   * out, so the `npm exec` or `pnpm dlx` that started it does not count, but
   * an editor, terminal or `tmux` it runs inside does. The process table is
   * read once per hook call, so a `delete` sees it fresh; one that could not
   * be read stays unknown for the rest of that call.
   */
  running(where: string | { in: string } | { name: string }, ctx: Pick<Ctx, 'signal'>): Running
  /** Whether `program` is on PATH. */
  onPath(program: string): boolean
  /** A candidate with its id (`<kind>:<path>` or `<kind>:<ref>`) and this plugin as its owner. */
  candidate(fields: CandidateFields): Candidate
  /** Runs `argv` through `@osdlc/command-seam` with a time limit, stopped when `signal` aborts. */
  run(argv: readonly string[], opts: KitRunOptions): Promise<KitRunResult>
  /**
   * Removes the folder `path`: only if it is still where a {@link PathCandidate}
   * of this plugin may sit, by its real path, as the core resolved the bounds
   * this run. When something in it may not be removed, its read-only folders
   * and files are made writable and the removal tried once more. Returns the
   * receipt sentence; a folder already gone is not a failure. Throws when it is
   * outside, when the kit is not bound to a run, when `ctx.signal` has aborted,
   * or when the folder is still there after.
   */
  remove(path: string, ctx?: Pick<Ctx, 'signal'>): string
}

/** What a kit is built with; every field has a default. */
export interface KitOptions {
  /** The clock idle time is read from. */
  now?: (() => Date) | undefined
  /** A clock in milliseconds that only goes forward, which the time budget is read from. Default: `performance.now`. */
  clock?: (() => number) | undefined
  /** Default {@link MEASURE_BUDGET_MS}. */
  budgetMs?: number | undefined
  probe?: ProcessProbe | undefined
  /** The runner for `ps`, which {@link Kit.running} reads command lines with. Default: `spawnRunner('ps')`. */
  ps?: CommandRunner | undefined
  /** The runner for a program, by name. Default: `spawnRunnerAsync`. */
  runner?: ((program: string) => AsyncCommandRunner) | undefined
  /** Where `program` is on PATH. Default: command-seam's `which` over `env`. */
  which?: ((program: string) => string | undefined) | undefined
  /** The command line's environment. */
  env?: Readonly<Record<string, string | undefined>> | undefined
}

/** Each kit's setter for its bounds, kept off {@link Kit} so a plugin cannot widen its own. */
const binders = new WeakMap<Kit, (bounds: Bounds | undefined) => void>()

/** The kits each plugin was built on: the one `create` was given, and one it built itself instead. */
const kits = new WeakMap<Plugin, Set<Kit>>()

/** Records that `plugin` was built on `kit`, beside any recorded before, so the core can bind it each run. `definePlugin`'s `create` calls it. */
export function attachKit(plugin: Plugin, kit: Kit): void {
  kits.set(plugin, (kits.get(plugin) ?? new Set()).add(kit))
}

/** Binds each kit `plugin` was built on to `bounds` for {@link Kit.remove}, or unbinds it with none, so it removes nothing; a plugin built on no kit is left alone. */
export function bindKit(plugin: Plugin, bounds: Bounds | undefined): void {
  for (const kit of kits.get(plugin) ?? []) binders.get(kit)?.(bounds)
}

/** Thrown inside {@link Kit.idle}'s walk when the budget runs out. */
class OutOfTime extends Error {}

/** True when `path` exists as itself, a link counted as present. */
export const present = (path: string): boolean =>
  lstatSync(path, { throwIfNoEntry: false }) !== undefined

/** Gives the owner write (and, for a folder, search) permission on everything under `path`, links not followed, and returns whether anything changed. Best effort. */
function makeWritable(path: string): boolean {
  const stat = lstatSync(path, { throwIfNoEntry: false })
  if (stat === undefined || stat.isSymbolicLink()) return false
  const want = stat.mode | (stat.isDirectory() ? 0o700 : 0o200)
  let changed = false
  try {
    if (want !== stat.mode) {
      chmodSync(path, want & 0o7777)
      changed = true
    }
  } catch {
    // Best effort: whatever this leaves unremovable, the removal reports.
  }
  if (!stat.isDirectory()) return changed
  let names: string[]
  try {
    names = readdirSync(path)
  } catch {
    return changed
  }
  for (const name of names) changed = makeWritable(join(path, name)) || changed
  return changed
}

/** Whether `err`, from `rmSync`, may come from something read-only: newer Node versions say ENOTEMPTY of the folder around it. */
const mayBeReadOnly = (err: unknown): boolean =>
  ['EACCES', 'EPERM', 'ENOTEMPTY'].includes((err as NodeJS.ErrnoException | null)?.code ?? '')

/**
 * Whether `name` is a word of the command line `args`: a word, split on
 * whitespace, whose last path segment is `name`, or has `name` as one of its
 * dot-separated parts. So `pnpm` matches `/opt/homebrew/bin/pnpm` and
 * `.../bin/pnpm.cjs`, and both `GradleDaemon` and `gradle` match
 * `org.gradle.launcher.daemon.bootstrap.GradleDaemon`. Case counts. It errs
 * towards a match, since a match only stops a delete.
 */
export function commandHasName(args: string, name: string): boolean {
  if (name === '') return false
  return args.split(/\s+/).some((word) => {
    const last = word.slice(word.lastIndexOf('/') + 1)
    return last === name || last.split('.').includes(name)
  })
}

/** `ps` reads its own locale; `LC_ALL=C` keeps its output plain. */
const PS_ENV = { LC_ALL: 'C' } as const

/** What the command line of a launcher that started host-cleaner holds. */
const SELF = 'host-cleaner'

/**
 * Each process with its command line, this one and the launchers that
 * started it left out (see {@link Kit.running}). Throws when `ps` gives no table.
 */
function commandLines(ps: CommandRunner): Array<{ pid: number; args: string }> {
  const r = ps.run(['-axo', 'pid=,ppid=,args='], { cwd: '/', env: PS_ENV, timeoutMs: 60_000 })
  if (r.neverExited === true) throw new Error(`ps did not run: ${r.error ?? r.stderr.trim()}`)
  if (r.exitCode !== 0 || r.stdout.trim() === '') {
    throw new Error(`ps failed (exit ${r.exitCode}): ${r.stderr.trim() || 'no output'}`)
  }
  const rows: Array<{ pid: number; args: string }> = []
  const parents = new Map<number, number>()
  const argsOf = new Map<number, string>()
  for (const line of r.stdout.split('\n')) {
    const m = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (m === null) continue
    const pid = Number(m[1])
    const args = m[3]!.trim()
    parents.set(pid, Number(m[2]))
    argsOf.set(pid, args)
    rows.push({ pid, args })
  }
  // Up from this process while each parent's command line names host-cleaner;
  // `own` is also the guard against a loop.
  const own = new Set<number>([process.pid])
  let up = parents.get(process.pid)
  while (up !== undefined && up > 0 && !own.has(up) && argsOf.get(up)?.includes(SELF) === true) {
    own.add(up)
    up = parents.get(up)
  }
  return rows.filter((row) => !own.has(row.pid))
}

/** The kit for the plugin `owner`. */
export function pluginKit(owner: string, opts: KitOptions = {}): Kit {
  const now = opts.now ?? (() => new Date())
  const clock = opts.clock ?? (() => performance.now())
  const budget = opts.budgetMs ?? MEASURE_BUDGET_MS
  const probe = opts.probe ?? defaultProcessProbe()
  const runner = opts.runner ?? ((program: string) => spawnRunnerAsync(program))
  const lookup = opts.which ?? ((program: string) => which(program, { env: opts.env }))
  const ps = opts.ps ?? spawnRunner('ps')
  // What each hook call's first read of the process table threw, or null: that
  // read is fresh, and one that failed is not tried again in the call, where the
  // probe would answer from the table of an earlier one.
  const read = new WeakMap<AbortSignal, { failed: unknown } | null>()
  const holders = (path: string, signal: AbortSignal) => {
    const before = read.get(signal)
    if (before) throw before.failed
    try {
      const found = probe.holders(path, before === undefined ? { fresh: true } : undefined)
      read.set(signal, null)
      return found
    } catch (failed) {
      read.set(signal, { failed })
      throw failed
    }
  }
  // The command lines, or what reading them threw, read once per hook call.
  type Lines = { rows: Array<{ pid: number; args: string }> } | { failed: unknown }
  const lines = new WeakMap<AbortSignal, Lines>()
  const readLines = (): Lines => {
    try {
      return { rows: commandLines(ps) }
    } catch (failed) {
      return { failed }
    }
  }
  const commands = (signal: AbortSignal) => {
    const got = lines.get(signal) ?? readLines()
    lines.set(signal, got)
    if ('failed' in got) throw got.failed
    return got.rows
  }

  // Unbound until the core resolves this plugin's roots in a run.
  let bounds: Bounds | undefined

  const kit: Kit = {
    owner,
    idle(path, { skip = () => false } = {}) {
      const at = now().getTime()
      const start = clock()
      let newest: number | null = null
      const check = (): void => {
        if (clock() - start > budget) throw new OutOfTime()
      }
      let entriesRead = 0
      const visit = (dir: string): void => {
        check()
        let entries
        try {
          entries = readdirSync(dir, { withFileTypes: true })
        } catch (err) {
          if ((err as NodeJS.ErrnoException).code === 'ENOENT') return
          throw err
        }
        for (const entry of entries) {
          if (++entriesRead % CLOCK_EVERY === 0) check()
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
        for (const each of typeof path === 'string' ? [path] : path) visit(each)
      } catch (err) {
        if (err instanceof OutOfTime) return { unmeasured: true }
        throw err
      }
      const hours: number | null = newest === null ? null : Math.max(0, (at - newest) / HOUR_MS)
      return { unmeasured: false, newestMs: newest, hours }
    },
    size: (path) => sizeOf(path, { timeoutMs: budget }),
    running(where, ctx) {
      try {
        const by = typeof where === 'string' ? { name: where } : where
        if ('in' in by) {
          const found = busyHolders(holders(by.in, ctx.signal))
          return { names: found.map((h) => `${h.command} (pid ${h.pid})`) }
        }
        const found = commands(ctx.signal).filter((row) => commandHasName(row.args, by.name))
        return {
          names: found.map((row) => `${basename(row.args.split(/\s+/)[0]!)} (pid ${row.pid})`),
        }
      } catch (err) {
        return { names: [], unknown: errorText(err) }
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
      try {
        rmSync(path, { recursive: true })
      } catch (err) {
        // With nothing read-only in it, something is still writing there: not tried again.
        if (!mayBeReadOnly(err) || !makeWritable(path)) throw err
        rmSync(path, { recursive: true })
      }
      if (present(path)) throw new Error(`${path} is still there after removal`)
      return bytes === null ? `removed ${path}` : `removed ${path}; freed ${bytes} bytes`
    },
  }
  binders.set(kit, (b) => {
    bounds = b
  })
  return kit
}
