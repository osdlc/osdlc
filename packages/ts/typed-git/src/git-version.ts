/**
 * The git version: `git --version` parsed, and probed at most once per runner.
 *
 * Only a verb that declares `needs` (see `./features.ts`) asks for it, so a
 * client that never runs such a verb never spawns `git --version`. The answer
 * is cached against the runner object, so every client sharing a runner (a
 * `Git` and its `at()` copies, every `AsyncGit` over one `cliBackend`) probes
 * once between them.
 *
 * The cache key is the runner and the effective `PATH`, because a runner
 * that finds git on `PATH` runs whichever git the call's `PATH` names.
 *
 * A failed probe is not cached: a missing git is reported on each call, as it
 * is for any other verb.
 */

import { tmpdir } from 'node:os'

import {
  CommandFailed,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
  type EnvOverrides,
} from '@osdlc/command-seam'

import { gate, type GitVerb } from './verbs.ts'

/**
 * A git version, read from `git --version`.
 *
 * `major`, `minor` and `patch` are the leading numbers, so they compare as
 * versions. Everything after them is in `text` only. A release candidate
 * (`2.47.0.rc1`) reads as the release it leads to (2.47.0). A vendor build
 * (`2.39.3 (Apple Git-146)`, `2.45.1.windows.1`) reads as the git release it
 * is built from.
 */
export interface GitVersion {
  major: number
  minor: number
  patch: number
  /** What git printed after `git version `, trimmed: `2.39.3 (Apple Git-146)`. */
  text: string
}

const VERSION_LINE = /^git version (\d+)\.(\d+)(?:\.(\d+))?\S*(?:\s.*)?$/

/**
 * The version in one `git --version` output, or `null` when it is not one.
 * Only the first line is read, so trailing build details do not matter.
 */
export function parseGitVersion(output: string): GitVersion | null {
  const line = output.trim().split(/\r?\n/, 1)[0]?.trim() ?? ''
  const m = VERSION_LINE.exec(line)
  if (m === null) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: m[3] === undefined ? 0 : Number(m[3]),
    text: line.slice('git version '.length),
  }
}

/** Negative when `a` is older than `b`, zero when they are the same release, positive when newer. */
export function compareGitVersions(
  a: Pick<GitVersion, 'major' | 'minor' | 'patch'>,
  b: Pick<GitVersion, 'major' | 'minor' | 'patch'>,
): number {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch
}

/** `2.34.1` — the numbers only, without a vendor suffix. */
export function formatGitVersion(v: Pick<GitVersion, 'major' | 'minor' | 'patch'>): string {
  return `${v.major}.${v.minor}.${v.patch}`
}

/**
 * `git --version`, parsed. Output that is not a version line is a failure,
 * not a guess: the parse raises a `CommandFailed`, which `gate` classifies.
 */
export function versionVerb(): GitVerb<GitVersion> {
  return {
    argv: ['--version'],
    absent: [],
    // `git version` is not translated today. The C locale keeps it that way.
    env: { LC_ALL: 'C' },
    parse(r: CommandResult, ranArgv: string[]) {
      const version = parseGitVersion(r.stdout)
      if (version === null) {
        // Exit 0 with no version line has no git error to show, so say what
        // was wrong in the failure's own words.
        const first = r.stdout.trim().split(/\r?\n/, 1)[0] ?? ''
        const said = first === '' ? 'nothing' : JSON.stringify(first)
        throw new CommandFailed(ranArgv, {
          ...r,
          stderr:
            r.stderr.trim() === '' ? `git --version printed ${said}, not a version` : r.stderr,
        })
      }
      return version
    },
  }
}

/**
 * The time limit on the `git --version` probe itself. In the async client the
 * probe is shared between concurrent callers, so no caller's own timeout or
 * signal applies to it; each caller races its own against it instead.
 */
export const PROBE_TIMEOUT_MS = 15_000

/**
 * Where the probe runs: the OS temp directory, which always exists. The
 * answer is cached per runner and `PATH`, not per directory, so a caller's
 * cwd must not decide it, and a missing cwd must not fail it for others. The
 * verb that asked still runs in its own cwd, and reports a bad one itself.
 */
function probeCwd(): string {
  return tmpdir()
}

/** The probe's run options: the caller's environment, the C locale, the fixed cwd and time limit. */
function probeOptions(
  env: EnvOverrides | undefined,
  verb: GitVerb<GitVersion>,
  timeoutMs: number,
): CommandRunOptions {
  return { cwd: probeCwd(), env: { ...env, ...verb.env }, timeoutMs }
}

/** `env[name]` from the environment the runner sees, without case on Windows (`Path`). */
function effective(env: EnvOverrides | undefined, name: string): string | undefined {
  const merged: Record<string, string | undefined> = { ...process.env, ...env }
  if (process.platform !== 'win32') return merged[name]
  // The last matching key wins, as a later spread would.
  let value: string | undefined
  for (const [key, v] of Object.entries(merged)) if (key.toUpperCase() === name) value = v
  return value
}

/**
 * The cache key within one runner: the effective `PATH` (and `PATHEXT` on
 * Windows), the call's `env` over the process's. An absolute-path-only runner
 * looks `git` up on that `PATH`, so one runner can run two gits.
 */
function pathKey(env: EnvOverrides | undefined): string {
  const path = effective(env, 'PATH') ?? '\u0000unset'
  return process.platform === 'win32' ? `${path}\u0000${effective(env, 'PATHEXT') ?? ''}` : path
}

/** Per runner, per `PATH`: the version once known. */
const known = new WeakMap<object, Map<string, GitVersion>>()
/** Per async runner, per `PATH`: the probe in flight, shared by concurrent callers. */
const inFlight = new WeakMap<AsyncCommandRunner, Map<string, Promise<CommandResult>>>()

function knownFor(runner: object, key: string): GitVersion | undefined {
  return known.get(runner)?.get(key)
}

function remember(runner: object, key: string, version: GitVersion): GitVersion {
  let byPath = known.get(runner)
  if (byPath === undefined) known.set(runner, (byPath = new Map()))
  byPath.set(key, version)
  return version
}

/**
 * What a probe call needs from the call that asked: its environment, its
 * time limit and signal, and the argv a probe failure reports.
 */
export interface ProbeCall {
  env?: EnvOverrides | undefined
  timeoutMs?: number | undefined
  signal?: AbortSignal | undefined
  /**
   * The argv the failure names when the probe fails: the gated verb's, with
   * the client's repository flags, so a missing git reads `git worktree: …`
   * rather than `git --version: …`. `['--version']` for `version()` itself.
   */
  report: string[]
}

/**
 * The version of the git `runner` runs, for the call's `PATH`: probed on the
 * first call, then cached. A failed probe is not cached. The probe runs under
 * the call's `timeoutMs`, or {@link PROBE_TIMEOUT_MS} when it has none, so the
 * first gated call can take up to the probe's time plus its own `timeoutMs`.
 */
export function probeGitVersion(runner: CommandRunner, call: ProbeCall): GitVersion {
  const key = pathKey(call.env)
  const cached = knownFor(runner, key)
  if (cached !== undefined) return cached
  const verb = versionVerb()
  const timeoutMs = Math.min(call.timeoutMs ?? PROBE_TIMEOUT_MS, PROBE_TIMEOUT_MS)
  const result = runner.run(verb.argv, probeOptions(call.env, verb, timeoutMs))
  return remember(runner, key, gate(verb, result, call.report))
}

/** A result standing in for a probe this caller stopped waiting for. */
function stopped(reason: 'timeout' | 'abort'): CommandResult {
  return {
    exitCode: 1,
    stdout: '',
    stderr: '',
    neverExited: true,
    reason,
    error:
      reason === 'abort'
        ? 'The operation was aborted'
        : 'timed out waiting for the git --version probe',
  }
}

/** `probe`, or a stand-in result when the caller's own timeout or signal ends first. */
function race(
  probe: Promise<CommandResult>,
  timeoutMs: number | undefined,
  signal: AbortSignal | undefined,
): Promise<CommandResult> {
  if (signal?.aborted === true) return Promise.resolve(stopped('abort'))
  const usable =
    typeof timeoutMs === 'number' && Number.isFinite(timeoutMs) && timeoutMs > 0
      ? Math.min(timeoutMs, 2 ** 31 - 1)
      : undefined
  if (usable === undefined && signal === undefined) return probe
  return new Promise((resolve, reject) => {
    const timer =
      usable === undefined ? undefined : setTimeout(() => done(stopped('timeout')), usable)
    const onAbort = () => done(stopped('abort'))
    function done(result: CommandResult): void {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      resolve(result)
    }
    signal?.addEventListener('abort', onAbort, { once: true })
    probe.then(done, (error: unknown) => {
      if (timer !== undefined) clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(error)
    })
  })
}

/**
 * {@link probeGitVersion} for an async runner. Concurrent first calls with
 * the same `PATH` share one probe, which runs with no caller's signal and a
 * fixed {@link PROBE_TIMEOUT_MS} limit. Each caller waits for it under its own
 * `timeoutMs` and `signal`, so a caller that gives up rejects alone and the
 * probe goes on for the others. Each caller reads the shared result itself,
 * so a failure names that caller's verb. A failed probe is not cached.
 */
export async function probeGitVersionAsync(
  runner: AsyncCommandRunner,
  call: ProbeCall,
): Promise<GitVersion> {
  const key = pathKey(call.env)
  const cached = knownFor(runner, key)
  if (cached !== undefined) return cached
  const verb = versionVerb()
  let byPath = inFlight.get(runner)
  if (byPath === undefined) inFlight.set(runner, (byPath = new Map()))
  let probe = byPath.get(key)
  if (probe === undefined) {
    const started = runner.run(verb.argv, probeOptions(call.env, verb, PROBE_TIMEOUT_MS))
    probe = started
    byPath.set(key, started)
    const settle = () => {
      if (byPath.get(key) === started) byPath.delete(key)
    }
    started.then(settle, settle)
  }
  const result = await race(probe, call.timeoutMs, call.signal)
  return knownFor(runner, key) ?? remember(runner, key, gate(verb, result, call.report))
}

/**
 * The `gitVersion` client option, parsed: `'2.55.0'`, or `git --version`'s
 * whole line (`'git version 2.39.3 (Apple Git-146)'`). `undefined` when the
 * option is not set. Anything else throws a `RangeError`, at construction.
 */
export function pinnedGitVersion(value: string | undefined): GitVersion | undefined {
  if (value === undefined) return undefined
  const text = value.trim()
  const version = parseGitVersion(text.startsWith('git version ') ? text : `git version ${text}`)
  if (version === null) {
    throw new RangeError(`gitVersion must be a git version such as '2.55.0'; got '${value}'`)
  }
  return version
}
