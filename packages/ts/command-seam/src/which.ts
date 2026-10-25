/**
 * `which`: find a binary on `PATH` without running it, the way the runners'
 * spawn would find it. For code that picks a tool by what is installed.
 * Running `--version` to check is slow for some CLIs and has side effects
 * (update checks, telemetry) for others.
 */

import { accessSync, constants, statSync } from 'node:fs'
import { resolve } from 'node:path'

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
 * split on `;` and empty entries are skipped. `cwd` is not searched unless
 * `PATH` names it. A name whose extension is in `PATHEXT` (default
 * `.COM;.EXE;.BAT;.CMD`) is tried as given; any other name is tried with
 * each `PATHEXT` extension appended, in order. Extensions compare in any
 * case. A match must be a file; there is no execute bit to check.
 *
 * @param binary - A name looked up on `PATH`, or a path.
 * @param opts - `cwd`, `env` and `platform`.
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
  if ((opts.platform ?? process.platform) === 'win32') return whichWindows(binary, cwd, opts.env)
  if (binary.includes('/')) return executable(resolve(cwd, binary))
  const path = opts.env !== undefined && 'PATH' in opts.env ? opts.env['PATH'] : process.env['PATH']
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
  const exts = (envValue(env, 'PATHEXT') || DEFAULT_PATHEXT).split(';').filter((e) => e !== '')
  const lower = binary.toLowerCase()
  const listed = exts.some((e) => lower.endsWith(e.toLowerCase()))
  const names = listed ? [binary] : exts.map((e) => binary + e)
  const dirs = /[\\/]/.test(binary)
    ? ['']
    : (envValue(env, 'PATH') ?? '').split(';').filter((d) => d !== '')
  for (const dir of dirs) {
    for (const name of names) {
      const found = file(resolve(cwd, dir, name))
      if (found !== undefined) return found
    }
  }
  return undefined
}

/** `name` from `env` over `process.env`, matched in any case as Windows does. */
function envValue(env: EnvOverrides | undefined, name: string): string | undefined {
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
