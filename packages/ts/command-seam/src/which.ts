/**
 * `which`: find a binary on `PATH` without running it, the way the runners'
 * spawn would find it. For code that picks a tool by what is installed.
 * Running `--version` to check is slow for some CLIs and has side effects
 * (update checks, telemetry) for others.
 */

import { accessSync, constants, statSync } from 'node:fs'
import { posix, resolve, win32 } from 'node:path'

import type { EnvOverrides } from './sync.ts'

/**
 * Options for {@link which}.
 *
 * @experimental
 */
export interface WhichOptions {
  /**
   * The folder a relative path, or a relative `PATH` entry, is resolved
   * against, as a spawn with this `cwd` would. Default `process.cwd()`.
   */
  cwd?: string | undefined
  /**
   * Variables merged over the parent's environment, as the runners take
   * them. Only `PATH`, and `PATHEXT` on Windows, are read. An `undefined`
   * value unsets one. On Windows the names match in any case (`Path`).
   */
  env?: EnvOverrides | undefined
  /**
   * The lookup rules to follow: `'win32'` for Windows, anything else for
   * POSIX. Default `process.platform`. Paths are still joined by the host's
   * `node:path`, so a test can run the Windows rules on a POSIX folder.
   */
  platform?: NodeJS.Platform | undefined
  /**
   * Search only absolute `PATH` entries for a bare name. A relative or empty
   * entry is skipped, and so is the current folder, so a binary planted in
   * the folder a command runs in is never picked. On Windows, `PATHEXT`
   * suffixes are tried. A name with a separator is still taken as a path.
   * Default `false`.
   */
  absolutePathOnly?: boolean | undefined
}

/** `PATHEXT` when it is unset or empty, as `cmd.exe` uses it. */
const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD'

/**
 * The absolute path of the file a spawn of `binary` would run, or
 * `undefined` when there is none. Never throws for a missing binary, an
 * unreadable folder or a bad `cwd`.
 *
 * POSIX: a name with a `/` is taken relative to `cwd`. A bare name is looked
 * up on `PATH` (split on `:`), and the first match wins. A match must be an
 * executable file. With `PATH` unset, it searches `/usr/bin:/bin`. An empty
 * `PATH` entry (`PATH=''`, `a::b`, a trailing `:`) means `cwd`, as it does
 * for Node's spawn. Bun's spawn skips empty entries, so under Bun such a
 * match may not start.
 *
 * Windows (`platform: 'win32'`): `\` and `/` both mark a path. `PATH` is
 * split on `;`, an entry in double quotes counts without them, and empty
 * entries are skipped. `cwd` is not searched unless
 * `PATH` names it. A name whose extension is in `PATHEXT` (default
 * `.COM;.EXE;.BAT;.CMD`) is tried as given; any other name is tried with
 * each `PATHEXT` extension appended, in order. Extensions compare in any
 * case. A match must be a file; there is no execute bit to check.
 *
 * With `absolutePathOnly`, a bare name is looked up in the absolute `PATH`
 * entries only (see {@link absolutePathCandidates}), on either platform.
 *
 * @param binary - A name looked up on `PATH`, or a path.
 * @param opts - `cwd`, `env`, `platform` and `absolutePathOnly`.
 * @returns The absolute path, or `undefined`.
 * @experimental
 *
 * @example
 * ```ts
 * const harnesses = ['codex', 'claude', 'cursor-agent'].filter((b) => which(b) !== undefined)
 * ```
 */
export function which(binary: string, opts: WhichOptions = {}): string | undefined {
  const cwd = opts.cwd ?? process.cwd()
  if (binary === '') return undefined
  const platform = opts.platform ?? process.platform
  if (opts.absolutePathOnly === true && !hasSeparator(binary, platform)) {
    const windows = platform === 'win32'
    const candidates = absolutePathCandidates(binary, {
      path: envOverride(opts.env, 'PATH', platform),
      pathext: envOverride(opts.env, 'PATHEXT', platform),
      platform,
    })
    for (const candidate of candidates) {
      const found = windows ? file(candidate) : executable(candidate)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (platform === 'win32') return whichWindows(binary, cwd, opts.env)
  if (binary.includes('/')) return executable(resolve(cwd, binary))
  const path = envOverride(opts.env, 'PATH', platform)
  for (const dir of (path ?? '/usr/bin:/bin').split(':')) {
    const found = executable(resolve(cwd, dir, binary))
    if (found !== undefined) return found
  }
  return undefined
}

function whichWindows(
  binary: string,
  cwd: string,
  env: EnvOverrides | undefined,
): string | undefined {
  const names = pathextSuffixes(binary, envOverride(env, 'PATHEXT', 'win32')).map(
    (suffix) => binary + suffix,
  )
  const dirs = /[\\/]/.test(binary)
    ? ['']
    : windowsPathDirs(envOverride(env, 'PATH', 'win32') ?? '').filter((d) => d !== '')
  for (const dir of dirs) {
    for (const name of names) {
      const found = file(resolve(cwd, dir, name))
      if (found !== undefined) return found
    }
  }
  return undefined
}

/**
 * `name` from `env` over `process.env`. An override set to `undefined`
 * unsets it. Under Windows rules the name matches in any case.
 */
function envOverride(
  env: EnvOverrides | undefined,
  name: string,
  platform: NodeJS.Platform,
): string | undefined {
  if (platform !== 'win32') return env !== undefined && name in env ? env[name] : process.env[name]
  if (env !== undefined) {
    const key = Object.keys(env).find((k) => k.toUpperCase() === name)
    if (key !== undefined) return env[key]
  }
  return process.env[name]
}

/** `p` when it is an executable file, else `undefined`. */
function executable(p: string): string | undefined {
  try {
    accessSync(p, constants.X_OK)
    return statSync(p).isFile() ? p : undefined
  } catch {
    return undefined
  }
}

/** `p` when it is a file, else `undefined`. */
function file(p: string): string | undefined {
  try {
    return statSync(p).isFile() ? p : undefined
  } catch {
    return undefined
  }
}

/**
 * Inputs to {@link absolutePathCandidates}.
 *
 * @experimental
 */
export interface PathCandidateOptions {
  /**
   * The `PATH` value. Unset means `/usr/bin:/bin` on POSIX, as a spawn
   * searches then, and no candidates on Windows.
   */
  path: string | undefined
  /** The `PATHEXT` value, read on Windows only. Unset or empty means `.COM;.EXE;.BAT;.CMD`. */
  pathext?: string | undefined
  /** The platform whose rules apply. Default `process.platform`. */
  platform?: NodeJS.Platform | undefined
}

/**
 * The files a lookup with `absolutePathOnly` checks for the bare name
 * `binary`, in order. It reads no files. Only absolute `PATH` entries count:
 * on Windows, one with a drive (`C:\bin`) or a UNC prefix (`\\host\share`).
 * On Windows an entry in double quotes counts without its quotes, and each
 * entry is tried with every `PATHEXT` suffix, unless `binary`
 * already ends in one, and the current folder is never searched, unlike a
 * Windows spawn of a bare name.
 *
 * @param binary - A bare name, such as `git`.
 * @param opts - `PATH`, `PATHEXT` and the platform.
 * @returns Absolute candidate paths.
 * @experimental
 */
export function absolutePathCandidates(binary: string, opts: PathCandidateOptions): string[] {
  const platform = opts.platform ?? process.platform
  const windows = platform === 'win32'
  if (binary === '' || hasSeparator(binary, platform)) return []
  const path = opts.path ?? (windows ? undefined : '/usr/bin:/bin')
  if (path === undefined) return []
  const suffixes = windows ? pathextSuffixes(binary, opts.pathext) : ['']
  const join = windows ? win32.join : posix.join
  const out: string[] = []
  for (const dir of windows ? windowsPathDirs(path) : path.split(':')) {
    if (!isAbsoluteEntry(dir, windows)) continue
    for (const suffix of suffixes) out.push(join(dir, binary + suffix))
  }
  return out
}

/**
 * The suffixes a Windows lookup tries on `binary`: `''` alone when it already
 * ends in a `PATHEXT` extension (compared in any case), else each extension.
 */
function pathextSuffixes(binary: string, pathext: string | undefined): string[] {
  const exts = (pathext || DEFAULT_PATHEXT).split(';').filter((e) => e !== '')
  const lower = binary.toLowerCase()
  return exts.some((e) => lower.endsWith(e.toLowerCase())) ? [''] : exts
}

/**
 * A Windows `PATH` split on `;`. Windows strips the double quotes around an
 * entry such as `"C:\Program Files\x"`, so they are stripped here too.
 */
function windowsPathDirs(path: string): string[] {
  return path.split(';').map((entry) => (/^".*"$/.test(entry) ? entry.slice(1, -1) : entry))
}

/** Whether `binary` holds a path separator, so it is a path, not a name looked up on `PATH`. */
export function hasSeparator(binary: string, platform: NodeJS.Platform): boolean {
  return binary.includes('/') || (platform === 'win32' && binary.includes('\\'))
}

/** Absolute, and not drive-relative (`\bin`) on Windows. */
function isAbsoluteEntry(dir: string, windows: boolean): boolean {
  if (!windows) return dir.startsWith('/')
  return /^[a-z]:[\\/]/i.test(dir) || dir.startsWith('\\\\') || dir.startsWith('//')
}
