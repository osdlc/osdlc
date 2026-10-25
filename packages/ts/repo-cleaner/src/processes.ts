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
  /** Processes whose current directory is `path` or below it. */
  holders(path: string): ProcessHolder[]
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

/** True for an interactive shell's command name; a login shell's leading `-` is ignored. */
export function isIdleShell(command: string): boolean {
  return IDLE_SHELLS.has(command.replace(/^-/, ''))
}

/** Allowed difference between a lock's start time and the process's, in ms. */
const START_TOLERANCE_MS = 2000

/**
 * Epoch milliseconds of a start time written as a date, or as epoch seconds
 * or milliseconds; NaN when it is neither.
 */
function startMs(text: string): number {
  const trimmed = text.trim()
  if (/^\d+$/.test(trimmed)) {
    const n = Number(trimmed)
    return trimmed.length > 11 ? n : n * 1000
  }
  return Date.parse(trimmed)
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
 * call from that snapshot, so one sweep of many worktrees runs `lsof` once.
 * Make a new probe for a new sweep. When `ps` or `lsof` cannot be run, `alive`
 * answers true (the owner cannot be ruled out) and `holders` throws.
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
      if (r.exitCode !== 0 || started === '') return false
      if (startedAt === undefined) return true
      const claimed = startMs(startedAt)
      const actual = Date.parse(started)
      if (Number.isNaN(claimed) || Number.isNaN(actual)) return true
      return Math.abs(claimed - actual) <= START_TOLERANCE_MS
    },

    holders(path) {
      if (table === null) {
        // `-a -d cwd`: only the working-directory entry of each process.
        // lsof exits 1 when it could not read some processes yet still lists
        // the rest, so the output is read whatever the status.
        const r = lsof.run(['-n', '-P', '-a', '-d', 'cwd', '-Fpcn'], { cwd: '/', timeoutMs })
        if (!answered(r)) throw new Error(`lsof did not run: ${r.error ?? r.stderr.trim()}`)
        table = parseLsofCwd(r.stdout).filter((row) => row.pid !== process.pid)
      }
      const roots = new Set([path])
      try {
        roots.add(realpathSync(path))
      } catch {
        // A directory that is gone has no holders.
      }
      return table
        .filter((row) => [...roots].some((root) => nodeGuard.contains(root, row.cwd)))
        .map(({ pid, command }) => ({ pid, command }))
    },
  }
}
