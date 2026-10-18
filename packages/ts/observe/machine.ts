/**
 * Which machine wrote a line or launched a session, and who started it there. A
 * store can be shared between machines, and only this machine's records say
 * anything about live processes, so every record and envelope carries a stable
 * machine id.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, hostname, platform, userInfo } from 'node:os'
import { dirname, join } from 'node:path'

import { spawnRunner } from '@osdlc/command-seam'

import { readTag } from './envelope.ts'

/**
 * The launching process's {@link machineId}, handed down so a child (a hook
 * process fires once per tool call) reads it instead of probing the platform
 * again. Absent on a cold start, where `machineId()` probes. Writers also set
 * `SDLC_MACHINE_ID`; readers accept either.
 */
export const MACHINE_ENV_VAR = 'OBSERVE_MACHINE_ID'

/**
 * What {@link deriveMachineId} reads to tell machines apart. Injected so tests
 * never touch the real platform: `platform` is a `process.platform` value,
 * `readFile` returns a file's text or `null` when unreadable, `run` returns a
 * command's stdout or `null` when it failed, `hostname` is the fallback.
 */
export interface MachineProbe {
  platform: string
  readFile(path: string): string | null
  run(argv: string[]): string | null
  hostname(): string
}

const LIVE_PROBE: MachineProbe = {
  platform: platform(),
  readFile(path) {
    try {
      return readFileSync(path, 'utf8')
    } catch {
      return null
    }
  },
  run(argv) {
    const result = spawnRunner(argv[0] ?? '').run(argv.slice(1), {
      cwd: process.cwd(),
      timeoutMs: 5000,
    })
    return result.exitCode === 0 ? result.stdout : null
  },
  hostname: () => hostname(),
}

/** The platform's own machine UUID, or `null` when it cannot be read. */
function platformUuid(probe: MachineProbe): string | null {
  const clean = (v: string | null | undefined) => (v && v.trim() !== '' ? v.trim() : null)
  if (probe.platform === 'darwin') {
    const out = probe.run(['ioreg', '-rd1', '-c', 'IOPlatformExpertDevice'])
    return clean(out?.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/)?.[1])
  }
  if (probe.platform === 'linux') {
    return (
      clean(probe.readFile('/etc/machine-id')) ?? clean(probe.readFile('/var/lib/dbus/machine-id'))
    )
  }
  if (probe.platform === 'win32') {
    const out = probe.run([
      'reg',
      'query',
      'HKLM\\SOFTWARE\\Microsoft\\Cryptography',
      '/v',
      'MachineGuid',
    ])
    return clean(out?.match(/MachineGuid\s+REG_SZ\s+(\S+)/i)?.[1])
  }
  return null
}

/**
 * The stable id for the machine `probe` describes: `m-` plus the first 16 hex
 * characters of `sha256("sdlc-machine:" + platformUuid)`. The platform UUID
 * (macOS `IOPlatformUUID`, Linux `/etc/machine-id`, Windows `MachineGuid`) is a
 * hardware identifier, so only this derived id is ever written down. A machine
 * whose UUID cannot be read hashes its hostname the same way, under a different
 * seed so the two never collide: a raw hostname is never an id, because the id
 * lands on every record and envelope even when identity capture is off. The
 * seeds are part of the format: changing them would change every machine's id.
 */
export function deriveMachineId(probe: MachineProbe): string {
  const uuid = platformUuid(probe)
  const seed = uuid !== null ? `sdlc-machine:${uuid}` : `sdlc-machine-host:${probe.hostname()}`
  return `m-${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`
}

const MACHINE_ID_RE = /^m-[0-9a-f]{16}$/

/** Where {@link resolveMachineId} keeps the derived id: `sdlc/machine-id` under `$XDG_CACHE_HOME` or `~/.cache`. */
function machineIdCachePath(): string {
  const base = process.env['XDG_CACHE_HOME']?.trim() || join(homedir(), '.cache')
  return join(base, 'sdlc', 'machine-id')
}

/**
 * Internal: not exported from the package entry; {@link machineId} uses it.
 *
 * The machine's id: the file at `cachePath` when it holds one, else
 * {@link deriveMachineId}, which is then written there (mode 0600). On a cold
 * start this keeps the platform probe (a process spawn on macOS and Windows) off
 * every command after the first. The file holds only the derived id, never the
 * hardware UUID; a write that fails is ignored.
 */
export function resolveMachineId(probe: MachineProbe, cachePath: string | null): string {
  if (cachePath !== null) {
    try {
      const cached = readFileSync(cachePath, 'utf8').trim()
      if (MACHINE_ID_RE.test(cached)) return cached
    } catch {
      // not cached yet
    }
  }
  const id = deriveMachineId(probe)
  if (cachePath !== null) {
    try {
      mkdirSync(dirname(cachePath), { recursive: true })
      writeFileSync(cachePath, `${id}\n`, { mode: 0o600 })
    } catch {
      // an unwritable cache only costs the next probe
    }
  }
  return id
}

let cachedMachineId: string | undefined

/**
 * This machine's id, as a record's `machine` and an envelope's `writer`. Stable
 * across hostname changes (a laptop's network renames it).
 *
 * Side effects. It reads process-wide state and resolves once per process: the
 * first call reads {@link MACHINE_ENV_VAR} (or its legacy `SDLC_MACHINE_ID`)
 * from `process.env`; when that is unset it reads the cache file
 * `$XDG_CACHE_HOME/sdlc/machine-id` (default `~/.cache/sdlc/machine-id`), and
 * when that holds no id it probes the platform, which spawns `ioreg` on macOS
 * or `reg` on Windows and reads `/etc/machine-id` on Linux, and then writes the
 * cache file. Later calls return the same value. Functions that would call it
 * implicitly take an optional machine id instead.
 */
export function machineId(): string {
  cachedMachineId ??=
    readTag(process.env, MACHINE_ENV_VAR)?.trim() ||
    resolveMachineId(LIVE_PROBE, machineIdCachePath())
  return cachedMachineId
}

/**
 * Whether `record` was launched by `machine` (default: this machine's
 * {@link machineId}, with its side effects). Liveness readers (a pid, an open
 * end, the process scan) consider only these; another machine's records are
 * history.
 */
export function isThisMachine(record: { machine: string }, machine: string = machineId()): boolean {
  return record.machine === machine
}

/** Who started something and where: recorded at session launch and at the start of a run. */
export interface Originator {
  /** The git `user.name` in the launch directory, else the OS login; `null` when neither could be read or identity is not captured. */
  startedBy: string | null
  /** The machine's readable name (`os.hostname()`); the derived {@link machineId} stays its identity. Absent when identity is not captured. */
  hostname?: string | undefined
  /** The IANA zone the machine's clock is set to, e.g. `Europe/Berlin`. */
  tz: string
}

/** What {@link resolveOriginator} reads; injected so tests never touch the real machine. */
export interface OriginatorProbe {
  /** `git config user.name` as run in `cwd`; `null` when unset or git failed. */
  gitUserName(cwd: string): string | null
  /** The OS login name; `null` when it cannot be read. */
  osUser(): string | null
  /** The machine's readable name. */
  hostname(): string
  /** The IANA time zone of the machine's clock. */
  tz(): string
}

const LIVE_ORIGINATOR_PROBE: OriginatorProbe = {
  gitUserName(cwd) {
    try {
      const result = spawnRunner('git').run(['config', 'user.name'], { cwd, timeoutMs: 5000 })
      return result.exitCode === 0 ? result.stdout : null
    } catch {
      return null
    }
  },
  osUser() {
    try {
      return userInfo().username
    } catch {
      return null
    }
  },
  hostname: () => hostname(),
  tz: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
}

/**
 * Who is launching from `cwd`: git `user.name`, falling back to the OS login.
 * The default probe runs `git config user.name` in `cwd`. With `identity` false
 * neither the person nor the machine's name is read: `startedBy` is `null`,
 * `hostname` absent, and only the time zone is reported.
 */
export function resolveOriginator(
  cwd: string,
  probe: OriginatorProbe = LIVE_ORIGINATOR_PROBE,
  identity = true,
): Originator {
  if (!identity) return { startedBy: null, tz: probe.tz() }
  const clean = (v: string | null): string | null =>
    v !== null && v.trim() !== '' ? v.trim() : null
  return {
    startedBy: clean(probe.gitUserName(cwd)) ?? clean(probe.osUser()),
    hostname: probe.hostname(),
    tz: probe.tz(),
  }
}
