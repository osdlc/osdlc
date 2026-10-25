/**
 * Find a binary on `PATH` without running anything, with the environment passed
 * in. A bare name goes through `@osdlc/command-seam`'s `which` with
 * `absolutePathOnly`, so the `PATH` and `PATHEXT` rules are that package's.
 * What this adds: only the passed `env` is read, never `process.env`, and a
 * missing `PATH` finds nothing.
 *
 * Runtime-agnostic: `node:` APIs only.
 */

import { isAbsolute } from 'node:path'

import { which as seamWhich } from '@osdlc/command-seam'

/**
 * The resolved path of `binary` on `env.PATH`, or `null`.
 *
 * Only absolute `PATH` entries are searched. Detection runs inside a project
 * that may not be trusted, and a relative or empty entry would find a file
 * the project ships. On Windows the `PATHEXT` suffixes are tried, unless the
 * name already ends in one (`tool.exe`), a quoted entry counts without its
 * quotes, and `Path` is read in any case.
 *
 * A name with a path separator is checked as a path, and only when it is
 * absolute. `cwd` is kept for compatibility: no lookup reads it any more.
 */
export function which(
  binary: string,
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
  cwd: string = process.cwd(),
): string | null {
  if (binary.includes('/') || binary.includes('\\')) {
    return isAbsolute(binary) ? (seamWhich(binary, { cwd, platform }) ?? null) : null
  }
  const read = (name: string): string | undefined =>
    platform === 'win32'
      ? Object.entries(env).find(([k]) => k.toUpperCase() === name)?.[1]
      : env[name]
  const path = read('PATH')
  if (path === undefined) return null
  const found = seamWhich(binary, {
    env: { PATH: path, PATHEXT: read('PATHEXT') },
    platform,
    absolutePathOnly: true,
  })
  return found ?? null
}
