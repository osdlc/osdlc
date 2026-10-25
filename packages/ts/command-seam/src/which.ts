/**
 * `which`: find a binary on `PATH` without running it, the way the runners'
 * spawn would find it. For code that picks a tool by what is installed.
 * Running `--version` to check is slow for some CLIs and has side effects
 * (update checks, telemetry) for others.
 */

import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, posix, resolve, win32 } from 'node:path'

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
   * them. Only `PATH` is read. An `undefined` value unsets it.
   */
  env?: EnvOverrides | undefined
  /**
   * Search only absolute `PATH` entries for a bare name. A relative or empty
   * entry is skipped, and so is the current folder, so a binary planted in
   * the folder a command runs in is never picked. On Windows, `PATHEXT`
   * suffixes are tried. A name with a separator is still taken as a path.
   * Default `false`.
   */
  absolutePathOnly?: boolean | undefined
}

/**
 * The absolute path of the file a spawn of `binary` would run, or
 * `undefined` when there is none. A name with a `/` is taken relative to
 * `cwd`. A bare name is looked up on `PATH`, and the first match wins. A
 * match must be an executable file. With `PATH` unset, it searches
 * `/usr/bin:/bin`. An empty `PATH` entry (`PATH=''`, `a::b`, a trailing `:`)
 * means `cwd`, as it does for Node's spawn. Bun's spawn skips empty entries,
 * so under Bun such a match may not start. Without `absolutePathOnly` it is
 * POSIX only: `PATHEXT` is not read.
 *
 * Never throws for a missing binary, an unreadable folder or a bad `cwd`.
 *
 * @param binary - A name looked up on `PATH`, or a path.
 * @param opts - `cwd` and `env`, as the runners take them.
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
  const read = (name: string): string | undefined =>
    opts.env !== undefined && name in opts.env ? opts.env[name] : process.env[name]
  if (opts.absolutePathOnly === true && !hasSeparator(binary, process.platform)) {
    const candidates = absolutePathCandidates(binary, {
      path: read('PATH'),
      pathext: read('PATHEXT'),
      platform: process.platform,
    })
    for (const candidate of candidates) {
      const found = executable(candidate)
      if (found !== undefined) return found
    }
    return undefined
  }
  if (binary.includes('/')) return executable(resolve(cwd, binary))
  const path = read('PATH')
  for (const dir of (path ?? '/usr/bin:/bin').split(delimiter)) {
    const found = executable(resolve(cwd, dir, binary))
    if (found !== undefined) return found
  }
  return undefined
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

/**
 * Inputs to {@link absolutePathCandidates}.
 *
 * @experimental
 */
export interface PathCandidateOptions {
  /** The `PATH` value. Unset means no candidates. */
  path: string | undefined
  /** The `PATHEXT` value, read on Windows only. Default `.COM;.EXE;.BAT;.CMD`. */
  pathext?: string | undefined
  /** The platform whose rules apply. Default `process.platform`. */
  platform?: NodeJS.Platform | undefined
}

/**
 * The files a lookup with `absolutePathOnly` checks for the bare name
 * `binary`, in order. It reads no files. Only absolute `PATH` entries count:
 * on Windows, one with a drive (`C:\bin`) or a UNC prefix (`\\host\share`).
 * On Windows each entry is tried with every `PATHEXT` suffix, unless `binary`
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
  if (binary === '' || hasSeparator(binary, platform) || opts.path === undefined) return []
  const exts = windows
    ? (opts.pathext ?? '.COM;.EXE;.BAT;.CMD').split(';').filter((e) => e !== '')
    : []
  const suffixes =
    !windows || exts.some((e) => binary.toLowerCase().endsWith(e.toLowerCase())) ? [''] : exts
  const join = windows ? win32.join : posix.join
  const out: string[] = []
  for (const dir of opts.path.split(windows ? ';' : ':')) {
    if (!isAbsoluteEntry(dir, windows)) continue
    for (const suffix of suffixes) out.push(join(dir, binary + suffix))
  }
  return out
}

function hasSeparator(binary: string, platform: NodeJS.Platform): boolean {
  return binary.includes('/') || (platform === 'win32' && binary.includes('\\'))
}

/** Absolute, and not drive-relative (`\bin`) on Windows. */
function isAbsoluteEntry(dir: string, windows: boolean): boolean {
  if (!windows) return dir.startsWith('/')
  return /^[a-z]:[\\/]/i.test(dir) || dir.startsWith('\\\\') || dir.startsWith('//')
}
