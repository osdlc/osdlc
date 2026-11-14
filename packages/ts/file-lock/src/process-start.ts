/**
 * When a process started, and whether a pid still names the process a lock
 * recorded. A pid is reused once its process exits, so "is pid N alive?" can
 * answer for an unrelated later process; comparing start times closes that.
 *
 * Start times are read as numbers, never as clock text in the local zone and
 * language: on Linux from `/proc`, elsewhere from `ps` run in UTC and the C
 * locale. The approach follows `@rushstack/node-core-library`'s `LockFile`
 * (MIT, Copyright (c) Microsoft Corporation): its `/proc` parsing, its UTC
 * `ps` call, and its match of zoneless `ps` text in any time zone.
 */

import { spawnSync } from 'node:child_process'
import { readFileSync, readlinkSync } from 'node:fs'

import { pidAlive } from './rules.ts'

/**
 * Runs `ps` with `args` and `env` added to the environment, and returns its
 * stdout, or null when it could not run or exited non-zero.
 *
 * @experimental
 */
export type PsRunner = (
  args: readonly string[],
  env: Readonly<Record<string, string>>,
) => string | null

/**
 * Options for {@link processStartedAt} and {@link processIdentity}.
 *
 * @experimental
 */
export interface ProcessStartOptions {
  /** Runs `ps` where `/proc` cannot answer. Default: Node's `spawnSync`. */
  ps?: PsRunner | undefined
  /** The platform to read for. Default `process.platform`. */
  platform?: NodeJS.Platform | undefined
  /**
   * Where `/proc` is mounted on Linux. Default `/proc`. It is read only when
   * its `self` entry names this process; otherwise it belongs to another pid
   * namespace, and the start time is unknown.
   */
  procRoot?: string | undefined
}

/**
 * Options for {@link sameProcess}.
 *
 * @experimental
 */
export interface SameProcessOptions extends ProcessStartOptions {
  /** The liveness probe. Default {@link pidAlive}. */
  alive?: ((pid: number) => boolean) | undefined
  /**
   * The start-time probe for a recorded instant or `ps` text. Default
   * {@link processStartedAt} with these options. A Linux identity is checked
   * against `/proc` directly and does not use it.
   */
  startedAt?: ((pid: number) => number | null) | undefined
}

/** How far a recorded start time may be from the real one and still match, in ms. */
const TOLERANCE_MS = 2000

/** Clock ticks per second in `/proc/<pid>/stat`: `USER_HZ`, 100 on every architecture Node supports. */
const LINUX_TICKS_PER_SECOND = 100

/** Field 22 of `/proc/<pid>/stat`, counted from 1: the start time in clock ticks after boot. */
const STARTTIME_FIELD = 22

/** The first field after the command name in `/proc/<pid>/stat`. */
const FIRST_FIELD_AFTER_NAME = 3

const PS_TIMEOUT_MS = 5000

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** What `ps -o lstart` prints in the C locale: `Sun Nov  1 01:30:00 2026`. */
const LSTART =
  /^\s*[A-Z][a-z]{2}\s+([A-Z][a-z]{2})\s+(\d{1,2})\s+(\d{2}):(\d{2}):(\d{2})\s+(\d{4})\s*$/

/** An ISO-8601 time of day with a zone; without one, `Date.parse` would read local time. */
const ISO_WITH_ZONE = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/

// Real UTC offsets span -12 h to +14 h in 15-minute steps.
const MIN_OFFSET_MS = -12 * 3_600_000
const MAX_OFFSET_MS = 14 * 3_600_000
const OFFSET_STEP_MS = 15 * 60_000

/**
 * When the process with `pid` started, in ms since the epoch, rounded down to
 * a whole second. Null when it cannot be read: no process has that pid, or
 * this process cannot see it (another pid namespace, `/proc` mounted with
 * `hidepid`), or the platform cannot say (Windows, a `ps` that fails, output
 * in an unknown format). Null is not proof the process is gone; ask
 * {@link pidAlive} for that.
 *
 * The result depends on neither the time zone nor the locale of this process.
 *
 * @experimental
 */
export function processStartedAt(pid: number, options: ProcessStartOptions = {}): number | null {
  if (!Number.isInteger(pid) || pid <= 0) return null
  const platform = options.platform ?? process.platform
  if (platform === 'linux') {
    const fromProc = linuxStartedAt(pid, options.procRoot)
    if (fromProc !== undefined) return fromProc
  }
  if (platform === 'win32') return null
  const ps = options.ps ?? defaultPs
  const out = ps(['-o', 'lstart=', '-p', String(pid)], { LC_ALL: 'C', TZ: 'UTC0' })
  return out === null ? null : lstartAsUtcMs(out)
}

/**
 * A token that names the process with `pid` for as long as it runs, and no
 * later process: the start time in the form least open to error. Record it
 * in a lock, and pass it back to {@link sameProcess}.
 *
 * - Linux: `linux:<boot id>:<start ticks>`, read from `/proc`. Neither a
 *   change to the wall clock nor the time zone moves it, and a reboot changes
 *   the boot id.
 * - Elsewhere: `start:<ms>`, from {@link processStartedAt}. Where `ps`
 *   derives the start from the boot time, as on the BSDs, setting the wall
 *   clock can move it.
 *
 * Null when the start time cannot be read; see {@link processStartedAt}.
 *
 * @experimental
 */
export function processIdentity(pid: number, options: ProcessStartOptions = {}): string | null {
  if (!Number.isInteger(pid) || pid <= 0) return null
  if ((options.platform ?? process.platform) === 'linux') {
    const proc = linuxProcess(pid, options.procRoot)
    if (proc === null || proc === FOREIGN) return null
    if (proc !== undefined && proc.bootId !== null) return `linux:${proc.bootId}:${proc.ticks}`
  }
  const started = processStartedAt(pid, options)
  return started === null ? null : `start:${started}`
}

/**
 * Whether `pid` still names the process that started at `startedAt`. False
 * when the pid is gone, a Linux identity names another boot, the process
 * started more than 2 s after an instant, or zoneless `ps` text matches its
 * start in no time zone. A pid is reused only after its holder exits, so a
 * reuser always starts after the holder did; an instant later than the real
 * start still matches, so a writer that recorded when it took the lock,
 * rather than when it started, keeps its lock. True when either side cannot
 * be read: the owner cannot be ruled out. See D-03.
 *
 * `startedAt` may be:
 * - what {@link processIdentity} returned, the most reliable form;
 * - ms since the epoch, as a number (a number below 10^11 is read as seconds);
 * - an ISO-8601 time with a zone, such as `2026-11-01T08:30:00Z`;
 * - epoch seconds (9-10 digits) or ms (12-13 digits), as text;
 * - what `ps -o lstart` printed in the C locale, in any time zone, such as
 *   `Sun Nov  1 01:30:00 2026`. It matches when it is the real start time in
 *   some zone, so the writer's zone need not be known.
 *
 * @experimental
 */
export function sameProcess(
  pid: number,
  startedAt: string | number,
  options: SameProcessOptions = {},
): boolean {
  const alive = options.alive ?? pidAlive
  if (!alive(pid)) return false
  const recorded = readRecorded(startedAt)
  if (recorded === null) return true
  if (recorded.kind === 'linux') return sameLinuxProcess(pid, recorded, options)
  const actual = (options.startedAt ?? ((p: number) => processStartedAt(p, options)))(pid)
  if (actual === null) return true
  if (recorded.kind === 'instant') return actual <= recorded.ms + TOLERANCE_MS
  return inSomeTimeZone(recorded.utcMs, actual)
}

/** A recorded start: an instant, zoneless `ps` text read as if it were UTC, or a Linux identity. */
type Recorded =
  | { kind: 'instant'; ms: number }
  | { kind: 'zoneless'; utcMs: number }
  | { kind: 'linux'; bootId: string; ticks: number }

/** `processIdentity` on Linux: the boot id, then the start ticks. */
const LINUX_IDENTITY = /^linux:([0-9a-f-]{36}):(\d+)$/

/**
 * A Linux identity against this machine's `/proc`. Another boot id means the
 * holder ended at a reboot. Otherwise, as for an instant, only a process that
 * started later is a different one. When this is not Linux, or `/proc` cannot
 * say, true.
 */
function sameLinuxProcess(
  pid: number,
  recorded: { bootId: string; ticks: number },
  options: SameProcessOptions,
): boolean {
  if ((options.platform ?? process.platform) !== 'linux') return true
  const proc = linuxProcess(pid, options.procRoot)
  if (proc === undefined || proc === null || proc === FOREIGN || proc.bootId === null) return true
  if (proc.bootId !== recorded.bootId) return false
  return proc.ticks <= recorded.ticks
}

function readRecorded(startedAt: string | number): Recorded | null {
  if (typeof startedAt === 'number') {
    if (!Number.isFinite(startedAt) || startedAt <= 0) return null
    return { kind: 'instant', ms: startedAt < 1e11 ? startedAt * 1000 : startedAt }
  }
  const text = startedAt.trim()
  const linux = LINUX_IDENTITY.exec(text)
  if (linux !== null) return { kind: 'linux', bootId: linux[1]!, ticks: Number(linux[2]) }
  const start = /^start:(\d+)$/.exec(text)
  if (start !== null) return { kind: 'instant', ms: Number(start[1]) }
  if (/^\d{9,10}$/.test(text)) return { kind: 'instant', ms: Number(text) * 1000 }
  if (/^\d{12,13}$/.test(text)) return { kind: 'instant', ms: Number(text) }
  if (ISO_WITH_ZONE.test(text)) {
    const ms = Date.parse(text)
    return Number.isNaN(ms) ? null : { kind: 'instant', ms }
  }
  const lstart = lstartAsUtcMs(text)
  return lstart === null ? null : { kind: 'zoneless', utcMs: lstart }
}

/** Whether zoneless text, read as UTC, is `actualMs` shifted by a real time-zone offset. */
function inSomeTimeZone(textAsUtcMs: number, actualMs: number): boolean {
  const offset = textAsUtcMs - actualMs
  if (offset < MIN_OFFSET_MS - TOLERANCE_MS || offset > MAX_OFFSET_MS + TOLERANCE_MS) return false
  const nearest = Math.round(offset / OFFSET_STEP_MS) * OFFSET_STEP_MS
  return Math.abs(offset - nearest) <= TOLERANCE_MS
}

/** `ps -o lstart` text in the C locale, read as UTC, in ms; null for any other text. */
function lstartAsUtcMs(text: string): number | null {
  const m = LSTART.exec(text)
  if (m === null) return null
  const month = MONTHS.indexOf(m[1]!)
  if (month < 0) return null
  return Date.UTC(Number(m[6]), month, Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]))
}

/**
 * The start time from `/proc`: boot time plus the process's start in ticks.
 * Null when there is no such process or `/proc` is FOREIGN; undefined when
 * `/proc` cannot say, so the caller asks `ps` instead.
 */
function linuxStartedAt(pid: number, procRoot: string | undefined): number | null | undefined {
  const proc = linuxProcess(pid, procRoot)
  if (proc === FOREIGN) return null
  if (proc === null || proc === undefined) return proc
  const boot = bootSeconds(procRoot ?? '/proc')
  if (boot === null) return undefined
  return (boot + Math.floor(proc.ticks / LINUX_TICKS_PER_SECOND)) * 1000
}

/**
 * `linuxProcess`'s answer for a `/proc` that belongs to another pid namespace:
 * it describes other processes under the same numbers, and `ps` reads the
 * same `/proc`, so nothing here can answer.
 */
const FOREIGN = 'foreign'

/**
 * A process's start ticks and the boot id, from `/proc`. Null when there is
 * no such process; undefined when `/proc` cannot say, so `ps` may. FOREIGN
 * when `/proc` does not list this process as itself.
 */
function linuxProcess(
  pid: number,
  procRoot: string | undefined,
): { ticks: number; bootId: string | null } | typeof FOREIGN | null | undefined {
  const root = procRoot ?? '/proc'
  if (!ownProc(root)) return FOREIGN
  let stat: string
  try {
    stat = readFileSync(`${root}/${pid}/stat`, 'utf-8')
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    // ESRCH: the process exited while the file was being read.
    return code === 'ENOENT' || code === 'ESRCH' ? null : undefined
  }
  const ticks = startTicks(stat)
  return ticks === null ? undefined : { ticks, bootId: bootId(root) }
}

/** Whether `/proc` at `root` belongs to this process's pid namespace. */
function ownProc(root: string): boolean {
  try {
    return readlinkSync(`${root}/self`) === String(process.pid)
  } catch {
    return false
  }
}

/** This boot's id, from `/proc/sys/kernel/random/boot_id`; null when it cannot be read. */
function bootId(root: string): string | null {
  try {
    const id = readFileSync(`${root}/sys/kernel/random/boot_id`, 'utf-8').trim()
    return /^[0-9a-f-]{36}$/.test(id) ? id : null
  } catch {
    return null
  }
}

/**
 * Field 22 of a `/proc/<pid>/stat` line. Field 2 is the command name in
 * parentheses, which may itself hold spaces and `)`, so fields are counted
 * from the last `)`.
 */
function startTicks(stat: string): number | null {
  const close = stat.lastIndexOf(')')
  if (close < 0) return null
  const rest = stat
    .slice(close + 1)
    .trim()
    .split(/\s+/)
  const value = rest[STARTTIME_FIELD - FIRST_FIELD_AFTER_NAME]
  return value !== undefined && /^\d+$/.test(value) ? Number(value) : null
}

/** The `btime` line of `/proc/stat`: when the system booted, in seconds since the epoch. */
function bootSeconds(procRoot: string): number | null {
  try {
    const m = /^btime (\d+)$/m.exec(readFileSync(`${procRoot}/stat`, 'utf-8'))
    return m === null ? null : Number(m[1])
  } catch {
    return null
  }
}

/** A {@link PsRunner} through Node's `spawnSync`. */
function defaultPs(args: readonly string[], env: Readonly<Record<string, string>>): string | null {
  const r = spawnSync('ps', args, {
    encoding: 'utf-8',
    env: { ...process.env, ...env },
    timeout: PS_TIMEOUT_MS,
  })
  return r.error === undefined && r.status === 0 ? r.stdout : null
}
