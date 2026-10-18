/**
 * `which`: find a binary on `PATH` without running it, the way the runners'
 * spawn would find it. For code that picks a tool by what is installed;
 * running `--version` to probe is slow for some CLIs and has side effects
 * (update checks, telemetry) for others.
 */

import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, resolve } from 'node:path'

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
   * them. Only `PATH` is read; an `undefined` value unsets it.
   */
  env?: EnvOverrides | undefined
}

/**
 * The absolute path of the file a spawn of `binary` would run, or
 * `undefined` when there is none. A name with a `/` is taken relative to
 * `cwd`; a bare name is looked up on `PATH`, first match wins. A match must be
 * an executable file. With `PATH` unset, it searches `/usr/bin:/bin`. An
 * empty `PATH` entry (`PATH=''`, `a::b`, a trailing `:`) means `cwd`, as it
 * does for Node's spawn; Bun's spawn skips empty entries, so under Bun such
 * a match may not start. POSIX only: `PATHEXT` is not read.
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
  if (binary.includes('/')) return executable(resolve(cwd, binary))
  const path = opts.env !== undefined && 'PATH' in opts.env ? opts.env['PATH'] : process.env['PATH']
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
