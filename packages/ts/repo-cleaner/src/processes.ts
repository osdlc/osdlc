/**
 * Process liveness: is the owner of a worktree lock still running, and which
 * processes work inside a directory.
 *
 * These are facts about a worktree, next to "is it dirty" and "is it locked".
 * The engine reads one generic token from a lock reason, `pid <N>`, with an
 * optional `start <time>` after it to guard against pid reuse. It parses no
 * other part of the reason and names no tool.
 *
 * The questions go through a {@link ProcessProbe}, so a test or a host can
 * answer them without a process table. The default probe runs `ps` and `lsof`
 * through the command seam.
 */

import { realpathSync } from 'node:fs'

import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { nodeGuard } from '@osdlc/path-guard/node'

/** A process whose working directory is inside a directory. */
export interface ProcessHolder {
  pid: number
  /** The command name as the OS reports it, without a path. */
  command: string
  /**
   * Whether the process has child processes. Read only for shells: a shell
   * counts as idle only when this is `false`; absent means unknown, which is
   * not idle.
   */
  hasChildren?: boolean | undefined
}

/** What the engine asks of the process table. */
export interface ProcessProbe {
  /**
   * Whether `pid` is running. With `startedAt`, the process counts only if it
   * also started at that time: a pid reused by a newer process is not the
   * owner. `startedAt` is the text the lock gave; a probe that cannot read it
   * as a time must answer "alive" (the owner cannot be ruled out).
   */
  alive(pid: number, startedAt?: string): boolean
  /**
   * Processes whose current directory is `path` or below it. Throws when the
   * process table cannot be read; the caller must treat that as "unknown".
   * With `fresh`, a probe that caches its table reads it again.
   */
  holders(path: string, opts?: { fresh?: boolean }): ProcessHolder[]
}

/** The owner a lock reason claims. */
export interface LockOwner {
  pid: number
  /** The text after `start`, when the reason gave one. */
  startedAt?: string
}

/**
 * The owner claimed by a lock reason, or null when it carries no `pid <N>`
 * token. The token reads `pid <digits>`, optionally followed by
 * `start <text>` running to a closing parenthesis or the end of the reason.
 */
export function parseLockOwner(reason: string | null): LockOwner | null {
  if (reason === null) return null
  const found = /\bpid\s+(\d+)\b(?:\s+start\s+([^)]*))?/.exec(reason)
  if (found === null) return null
  const pid = Number(found[1])
  if (!Number.isSafeInteger(pid) || pid <= 0) return null
  const startedAt = found[2]?.trim()
  return startedAt ? { pid, startedAt } : { pid }
}

/** Shells that sit idle in a directory and do not make a worktree live. */
const IDLE_SHELLS: ReadonlySet<string> = new Set(['sh', 'bash', 'zsh', 'fish'])

/**
 * True when `command` is the name of a shell (`sh`, `bash`, `zsh`, `fish`); a
 * login shell's leading `-` is ignored. The name alone does not make a shell
 * idle: see {@link busyHolders}. Not for names longer than lsof's 9 characters.
 */
export function isIdleShell(command: string): boolean {
  return IDLE_SHELLS.has(command.replace(/^-/, ''))
}

/**
 * Whether a holder is a shell with nothing running under it. A shell whose
 * children are unknown, or that has any, is not idle: it may be running a script.
 */
export function isIdleHolder(h: ProcessHolder): boolean {
  return isIdleShell(h.command) && h.hasChildren === false
}

/** The holders that make a worktree live: everything but idle shells. */
export function busyHolders(holders: readonly ProcessHolder[]): ProcessHolder[] {
  return holders.filter((h) => !isIdleHolder(h))
}

/** Allowed difference between a lock's start time and the process's, in ms. */
const START_TOLERANCE_MS = 2000

// A zone is required: without one Date.parse reads local time, and a writer that
// emitted UTC with no `Z` would shift the start time by hours and make a live owner
// look like a reused pid.
const ISO_WITH_TIME = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/
/** `ps -o lstart`: `Sat Oct 25 18:22:19 2026`, the day space-padded on Linux. */
const PS_LSTART = /^[A-Z][a-z]{2}\s+[A-Z][a-z]{2}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2}\s+\d{4}$/

/**
 * Epoch milliseconds of a start time, or NaN when the text is not precise to
 * the second. Accepted: a full ISO-8601 timestamp with a time of day, epoch
 * seconds (9-10 digits), epoch milliseconds (12-13 digits), or the `lstart`
 * form. A date alone, a short digit string or a partial date such as `Oct 25`
 * is NaN, so the owner is treated as alive: the comparison would otherwise
 * call a live owner dead.
 */
export function startMs(text: string): number {
  const trimmed = text.trim()
  if (/^\d{9,10}$/.test(trimmed)) return Number(trimmed) * 1000
  if (/^\d{12,13}$/.test(trimmed)) return Number(trimmed)
  if (ISO_WITH_TIME.test(trimmed) || PS_LSTART.test(trimmed)) return Date.parse(trimmed)
  return Number.NaN
}

/**
 * Parse `lsof -Fpcn` output: `p<pid>`, then `c<command>`, then `n<cwd>` per
 * process. One record per process; a record missing a field is skipped.
 */
export function parseLsofCwd(output: string): Array<ProcessHolder & { cwd: string }> {
  const rows: Array<ProcessHolder & { cwd: string }> = []
  let pid = 0
  let command = ''
  for (const line of output.split('\n')) {
    const tag = line[0]
    const value = line.slice(1)
    if (tag === 'p') {
      pid = Number(value)
      command = ''
    } else if (tag === 'c') {
      command = value
    } else if (tag === 'n' && pid > 0 && command !== '') {
      rows.push({ pid, command, cwd: value })
    }
  }
  return rows
}

export interface DefaultProbeOptions {
  /** Injected runners for `ps` and `lsof`. Defaults spawn the real binaries. */
  ps?: CommandRunner | undefined
  lsof?: CommandRunner | undefined
  /** Cap on each command, in ms. Defaults to 60 s. */
  timeoutMs?: number | undefined
}

/** True when the command ran and reported an exit status. */
const answered = (r: CommandResult): boolean => r.neverExited !== true

/**
 * The default probe: `ps` for liveness, `lsof` for working directories, both
 * through the command seam.
 *
 * `holders` reads the whole table once, on first use, and answers every later
 * call from that snapshot, so one sweep of many worktrees runs `lsof` once;
 * `fresh` reads it again. Make a new probe for a new sweep. Whenever `ps` or
 * `lsof` cannot give a clear answer, `alive` answers true (the owner cannot be
 * ruled out) and `holders` throws.
 */
export function defaultProcessProbe(opts: DefaultProbeOptions = {}): ProcessProbe {
  const ps = opts.ps ?? spawnRunner('ps')
  const lsof = opts.lsof ?? spawnRunner('lsof')
  const timeoutMs = opts.timeoutMs ?? 60_000
  let table: Array<ProcessHolder & { cwd: string }> | null = null

  return {
    alive(pid, startedAt) {
      // `lstart` is the same five-field date on macOS and Linux procps.
      const r = ps.run(['-o', 'lstart=', '-p', String(pid)], { cwd: '/', timeoutMs })
      if (!answered(r)) return true
      const started = r.stdout.trim()
      // Only exit 1 with nothing printed is ps saying "no such pid". Any other
      // failure (usage error, permission, a diagnostic) cannot rule the owner out.
      if (r.exitCode === 1 && started === '' && r.stderr.trim() === '') return false
      if (r.exitCode !== 0 || started === '') return true
      if (startedAt === undefined) return true
      const claimed = startMs(startedAt)
      const actual = Date.parse(started)
      if (Number.isNaN(claimed) || Number.isNaN(actual)) return true
      return Math.abs(claimed - actual) <= START_TOLERANCE_MS
    },

    holders(path, holdersOpts) {
      if (table === null || holdersOpts?.fresh === true) {
        // `-a -d cwd`: only the working-directory entry of each process.
        // lsof exits 1 when it could not read some processes yet still lists
        // the rest, so a listing is read whatever the status. No listing at
        // all with a failure status is an error, not an empty table.
        const r = lsof.run(['-n', '-P', '-a', '-d', 'cwd', '-Fpcn'], { cwd: '/', timeoutMs })
        if (!answered(r)) throw new Error(`lsof did not run: ${r.error ?? r.stderr.trim()}`)
        if ((r.exitCode !== 0 && r.stdout.trim() === '') || r.exitCode > 1) {
          throw new Error(`lsof failed (exit ${r.exitCode}): ${r.stderr.trim() || 'no output'}`)
        }
        const rows = parseLsofCwd(r.stdout).filter((row) => row.pid !== process.pid)
        const parents = rows.some((row) => isIdleShell(row.command))
          ? parentPids()
          : new Set<number>()
        table = rows.map((row) => ({ ...row, hasChildren: parents.has(row.pid) }))
      }
      const roots = new Set([path])
      try {
        roots.add(realpathSync(path))
      } catch {
        // A directory that is gone has no holders.
      }
      return table
        .filter((row) => [...roots].some((root) => nodeGuard.contains(root, row.cwd)))
        .map(({ pid, command, hasChildren }) => ({ pid, command, hasChildren }))
    },
  }

  /** Pids that are the parent of some process. Throws when `ps` gives no table. */
  function parentPids(): Set<number> {
    const r = ps.run(['-A', '-o', 'pid=,ppid='], { cwd: '/', timeoutMs })
    if (!answered(r)) throw new Error(`ps did not run: ${r.error ?? r.stderr.trim()}`)
    if (r.exitCode !== 0 || r.stdout.trim() === '') {
      throw new Error(`ps failed (exit ${r.exitCode}): ${r.stderr.trim() || 'no output'}`)
    }
    const parents = new Set<number>()
    for (const line of r.stdout.split('\n')) {
      const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(line)
      if (m !== null) parents.add(Number(m[2]))
    }
    return parents
  }
}
