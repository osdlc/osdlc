/**
 * The git version: `git --version` parsed, and probed at most once per runner.
 *
 * Only a verb that declares `needs` (see `./features.ts`) asks for it, so a
 * client that never runs such a verb never spawns `git --version`. The answer
 * is cached against the runner object, so every client sharing a runner (a
 * `Git` and its `at()` copies, every `AsyncGit` over one `cliBackend`) probes
 * once between them.
 *
 * A failed probe is not cached: a missing git is reported on each call, as it
 * is for any other verb.
 */

import {
  CommandFailed,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
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
      if (version === null) throw new CommandFailed(ranArgv, r)
      return version
    },
  }
}

function probeOptions<O extends CommandRunOptions | AsyncCommandRunOptions>(
  run: O,
  verb: GitVerb<GitVersion>,
): O {
  // The call's cwd, timeout, output cap and environment, but never its stdin.
  const { input: _input, ...rest } = run
  return { ...rest, env: { ...run.env, ...verb.env } } as O
}

const syncCache = new WeakMap<CommandRunner, GitVersion>()
const asyncCache = new WeakMap<AsyncCommandRunner, Promise<GitVersion>>()

/** The version of the git `runner` runs: probed on the first call, then cached for that runner. */
export function probeGitVersion(runner: CommandRunner, run: CommandRunOptions): GitVersion {
  const cached = syncCache.get(runner)
  if (cached !== undefined) return cached
  const verb = versionVerb()
  const version = gate(verb, runner.run(verb.argv, probeOptions(run, verb)), verb.argv)
  syncCache.set(runner, version)
  return version
}

/**
 * {@link probeGitVersion} for an async runner. Concurrent first calls share
 * one probe. A probe that fails is dropped from the cache, so the next call
 * tries again.
 */
export function probeGitVersionAsync(
  runner: AsyncCommandRunner,
  run: AsyncCommandRunOptions,
): Promise<GitVersion> {
  const cached = asyncCache.get(runner)
  if (cached !== undefined) return cached
  const verb = versionVerb()
  const probe = runner
    .run(verb.argv, probeOptions(run, verb))
    .then((result) => gate(verb, result, verb.argv))
  asyncCache.set(runner, probe)
  probe.catch(() => {
    if (asyncCache.get(runner) === probe) asyncCache.delete(runner)
  })
  return probe
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
