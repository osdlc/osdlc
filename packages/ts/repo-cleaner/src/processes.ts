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
import { sameProcess } from '@osdlc/file-lock'
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
   * is the one that started then: a pid reused by a process that started
   * later is not the owner. `startedAt` is the text the lock gave; a probe
   * that cannot read it must answer "alive" (the owner cannot be ruled out).
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

/** `ps -o lstart`: `Sat Oct 25 18:22:19 2026`, the day space-padded on Linux. */
const PS_LSTART =
  /^[A-Z][a-z]{2}\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})$/
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Epoch milliseconds of what `ps -o lstart` printed, read as UTC (the zone the
 * default probe runs `ps` under, see `PS_ENV`), or NaN for any other text.
 */
export function startMs(text: string): number {
  const trimmed = text.trim()
  const l = PS_LSTART.exec(trimmed)
  if (l !== null) {
    const month = MONTHS.indexOf(l[1] ?? '')
    if (month < 0) return Number.NaN
    return Date.UTC(Number(l[6]), month, Number(l[2]), Number(l[3]), Number(l[4]), Number(l[5]))
  }
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
  /**
   * Whether a pid exists, asked before `ps` so a dead pid costs no spawn:
   * `false` is gone, `true` exists, `undefined` cannot tell. Defaults to a
   * `process.kill(pid, 0)` check when `ps` is not injected, and to "cannot
   * tell" when it is, since a fake `ps` has its own idea of the pids.
   */
  pidExists?: ((pid: number) => boolean | undefined) | undefined
  /**
   * The platform whose process identities are read: on Linux a recorded
   * boot-id identity is checked against /proc. Defaults to `process.platform`,
   * or to a non-Linux one when `ps` is injected, since a fake `ps` has its own
   * pids.
   */
  platform?: NodeJS.Platform | undefined
}

/** `process.kill(pid, 0)`: ESRCH is gone, EPERM is alive, anything else is unknown. */
function killProbe(pid: number): boolean | undefined {
  // Pid 0 and negative pids name process groups, not a process.
  if (!Number.isInteger(pid) || pid <= 0) return undefined
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ESRCH') return false
    return code === 'EPERM' ? true : undefined
  }
}

/**
 * `ps` reads its own zone and locale. `TZ=UTC` makes the zoneless `lstart` one
 * instant, so the repeated hour of a DST fall-back cannot read as two; `LC_ALL=C`
 * keeps the month and day names English.
 */
const PS_ENV = { TZ: 'UTC', LC_ALL: 'C' } as const

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
  const pidExists = opts.pidExists ?? (opts.ps === undefined ? killProbe : () => undefined)
  // A fake `ps` answers for its own pids, which /proc knows nothing of.
  const platform = opts.platform ?? (opts.ps === undefined ? process.platform : 'darwin')
  let table: Array<ProcessHolder & { cwd: string }> | null = null

  return {
    alive(pid, startedAt) {
      if (pidExists(pid) === false) return false
      // `lstart` is the same five-field date on macOS and Linux procps.
      const r = ps.run(['-o', 'lstart=', '-p', String(pid)], { cwd: '/', env: PS_ENV, timeoutMs })
      if (!answered(r)) return true
      const started = r.stdout.trim()
      // Only exit 1 with nothing printed is ps saying "no such pid". Any other
      // failure (usage error, permission, a diagnostic) cannot rule the owner out.
      if (r.exitCode === 1 && started === '' && r.stderr.trim() === '') return false
      if (r.exitCode !== 0 || started === '') return true
      if (startedAt === undefined) return true
      // `@osdlc/file-lock` reads every form a lock records: its own process
      // identity (Linux boot id and start ticks, checked against /proc), an
      // instant (ISO time, epoch seconds or ms, `start:<ms>`), or `lstart`
      // text in any zone. Only a process that started later is another one,
      // so a writer that recorded when it took the lock keeps it.
      const actual = startMs(started)
      return sameProcess(pid, startedAt, {
        alive: () => true,
        startedAt: () => (Number.isNaN(actual) ? null : actual),
        platform,
      })
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
