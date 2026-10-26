/**
 * Which machine wrote a line or launched a session, and who started it there. A
 * store can be shared between machines, and only this machine's records say
 * anything about live processes, so every record and envelope carries a stable
 * machine id.
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, hostname, platform, userInfo } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'

import { spawnRunner } from '@osdlc/command-seam'

import { readTag } from './envelope.ts'

/**
 * The launching process's {@link machineId}, passed down so a child reads it
 * instead of probing the platform again. This matters for hook processes,
 * which start once per tool call. When it is absent, `machineId()` probes. Writers also set
 * `SDLC_MACHINE_ID`; readers accept either.
 */
export const MACHINE_ENV_VAR = 'OBSERVE_MACHINE_ID'

/**
 * What {@link deriveMachineId} reads to tell machines apart. Injected so tests
 * never touch the real platform. `platform` is a `process.platform` value.
 * `readFile` returns a file's text, or `null` when unreadable. `run` returns a
 * command's stdout, or `null` when it failed. `hostname` is the fallback.
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
    // The cwd may be a repository, so a bare name runs only from an absolute PATH entry.
    const runner = spawnRunner(argv[0] ?? '', { absolutePathOnly: true })
    const result = runner.run(argv.slice(1), { cwd: process.cwd(), timeoutMs: 5000 })
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
 * whose UUID cannot be read hashes its hostname the same way, with a different
 * seed so the two never collide. A raw hostname is never used as the id,
 * because the id is written on every record and envelope even when identity
 * capture is off. The seeds are part of the format. Changing them would change
 * every machine's id.
 */
export function deriveMachineId(probe: MachineProbe): string {
  const uuid = platformUuid(probe)
  const seed = uuid !== null ? `sdlc-machine:${uuid}` : `sdlc-machine-host:${probe.hostname()}`
  return `m-${createHash('sha256').update(seed).digest('hex').slice(0, 16)}`
}

const MACHINE_ID_RE = /^m-[0-9a-f]{16}$/

/**
 * Where {@link resolveMachineId} keeps the derived id: `sdlc/machine-id` under
 * `$XDG_CACHE_HOME` or `~/.cache`. A relative `$XDG_CACHE_HOME` is ignored, as
 * the XDG spec says, and a home that is not absolute means no cache: either
 * would put the file under whatever directory the process runs in.
 */
function machineIdCachePath(): string | null {
  const xdg = process.env['XDG_CACHE_HOME']?.trim()
  if (xdg !== undefined && xdg !== '' && isAbsolute(xdg)) return join(xdg, 'sdlc', 'machine-id')
  const home = homedir()
  return isAbsolute(home) ? join(home, '.cache', 'sdlc', 'machine-id') : null
}

/**
 * A digest of the hostname, written next to the cached id. A home directory
 * can be shared between machines (NFS, a home baked into an image), and so can
 * the cache in it. Without this key a second machine would read the first
 * one's id and take that machine's live sessions for its own. Hashed, like the
 * id, so the file never names the host.
 */
function cacheHostKey(probe: MachineProbe): string {
  return createHash('sha256')
    .update(`machine-cache-host:${probe.hostname()}`)
    .digest('hex')
    .slice(0, 16)
}

/**
 * Internal, not exported from the package entry. {@link machineId} uses it.
 *
 * The machine's id: the id in the file at `cachePath` when it holds one written
 * on this host, else {@link deriveMachineId}, which is then written there (mode
 * 0600) with this host's key. This way only the first command probes the
 * platform (which spawns a process on macOS and Windows). The file holds only
 * the derived id and a hash of the hostname, never the hardware UUID. A cache
 * written by another host, or in the older id-only form, is derived again and
 * rewritten. A failed write is ignored.
 */
export function resolveMachineId(probe: MachineProbe, cachePath: string | null): string {
  const hostKey = cachePath === null ? '' : cacheHostKey(probe)
  if (cachePath !== null) {
    try {
      const [cached, key] = readFileSync(cachePath, 'utf8').trim().split(/\s+/)
      if (cached !== undefined && MACHINE_ID_RE.test(cached) && key === hostKey) return cached
    } catch {
      // not cached yet
    }
  }
  const id = deriveMachineId(probe)
  if (cachePath !== null) {
    try {
      mkdirSync(dirname(cachePath), { recursive: true })
      writeFileSync(cachePath, `${id} ${hostKey}\n`, { mode: 0o600 })
    } catch {
      // an unwritable cache only costs the next probe
    }
  }
  return id
}

let cachedMachineId: string | undefined

/**
 * This machine's id, as a record's `machine` and an envelope's `writer`. Stable
 * across hostname changes (for example when a laptop's network renames it).
 *
 * It has side effects. It reads process-wide state and computes the id once
 * per process. The first call reads {@link MACHINE_ENV_VAR} (or its legacy
 * `SDLC_MACHINE_ID`) from `process.env`. When that is unset, it reads the cache
 * file `$XDG_CACHE_HOME/sdlc/machine-id` (default `~/.cache/sdlc/machine-id`).
 * When the cache holds no id written on this host, it probes the platform (it runs `ioreg` on macOS
 * or `reg` on Windows, and reads `/etc/machine-id` on Linux) and writes the
 * cache file. Later calls return the same value. Functions that would call it
 * take an optional machine id, so a caller can avoid the call.
 */
export function machineId(): string {
  cachedMachineId ??=
    readTag(process.env, MACHINE_ENV_VAR)?.trim() ||
    resolveMachineId(LIVE_PROBE, machineIdCachePath())
  return cachedMachineId
}

/**
 * Whether `record` was launched by `machine` (default: this machine's
 * {@link machineId}, with its side effects). Liveness checks (a pid, an open
 * end, the process scan) consider only these records. Another machine's
 * records are history.
 */
export function isThisMachine(record: { machine: string }, machine: string = machineId()): boolean {
  return record.machine === machine
}

/** Who started something and where: recorded at session launch and at the start of a run. */
export interface Originator {
  /** The git `user.name` in the launch directory, else the OS login. `null` when neither could be read or identity is not captured. */
  startedBy: string | null
  /** The machine's readable name (`os.hostname()`). The derived {@link machineId} is still its identity. Absent when identity is not captured. */
  hostname?: string | undefined
  /** The IANA zone the machine's clock is set to, e.g. `Europe/Berlin`. */
  tz: string
}

/** What {@link resolveOriginator} reads. Injected so tests never touch the real machine. */
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
      // `cwd` is a repository, so git runs only from an absolute PATH entry.
      const git = spawnRunner('git', { absolutePathOnly: true })
      const result = git.run(['config', 'user.name'], { cwd, timeoutMs: 5000 })
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
 * The default probe runs `git config user.name` in `cwd`. With `identity` false,
 * neither the person nor the machine's name is read. `startedBy` is `null`,
 * `hostname` is absent, and only the time zone is reported.
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
