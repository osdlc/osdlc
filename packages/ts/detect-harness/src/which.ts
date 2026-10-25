/**
 * Find a binary on `PATH` without running anything, with the environment passed
 * in. This is not `@osdlc/command-seam`'s `which`, because that one has no
 * `PATHEXT` support, reads an empty `PATH` entry as the working directory and
 * falls back to a default list when `PATH` is missing. Here an empty entry is
 * skipped and a missing `PATH` finds nothing.
 *
 * Runtime-agnostic: `node:` APIs only.
 */

import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, isAbsolute, resolve } from 'node:path'

function executable(path: string): boolean {
  try {
    if (!statSync(path).isFile()) return false
    accessSync(path, constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * The resolved path of `binary` on `env.PATH`, or `null`. A name with a path
 * separator is checked as a path. On Windows the `PATHEXT` suffixes are tried,
 * after the name as given when it already ends in one (`tool.exe`).
 * A relative `PATH` entry is resolved against `cwd`, so the result is always
 * absolute and names the file a process started in `cwd` would run.
 */
export function which(
  binary: string,
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
  cwd: string = process.cwd(),
): string | null {
  if (binary.includes('/') || binary.includes('\\')) {
    return isAbsolute(binary) && executable(binary) ? binary : null
  }
  const pathExts =
    platform === 'win32'
      ? (env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : null
  const lower = binary.toLowerCase()
  const exts =
    pathExts === null
      ? ['']
      : pathExts.some((e) => lower.endsWith(e.toLowerCase()))
        ? ['', ...pathExts]
        : pathExts
  for (const dir of (env['PATH'] ?? '').split(delimiter)) {
    if (dir === '') continue
    for (const ext of exts) {
      const candidate = resolve(cwd, dir, binary + ext)
      if (executable(candidate)) return candidate
    }
  }
  return null
}
