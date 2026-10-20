/**
 * Find a binary on `PATH` without running anything. Ported from
 * `detect-runners`' `which.ts`, with the environment passed in.
 *
 * Runtime-agnostic: `node:` APIs only.
 */

import { accessSync, constants, statSync } from 'node:fs'
import { delimiter, isAbsolute, join } from 'node:path'

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
 * separator is checked as a path. On Windows the `PATHEXT` suffixes are tried.
 */
export function which(
  binary: string,
  env: Readonly<Record<string, string | undefined>>,
  platform: NodeJS.Platform = process.platform,
): string | null {
  if (binary.includes('/') || binary.includes('\\')) {
    return isAbsolute(binary) && executable(binary) ? binary : null
  }
  const exts =
    platform === 'win32'
      ? (env['PATHEXT'] ?? '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean)
      : ['']
  for (const dir of (env['PATH'] ?? '').split(delimiter)) {
    if (dir === '') continue
    for (const ext of exts) {
      const candidate = join(dir, binary + ext)
      if (executable(candidate)) return candidate
    }
  }
  return null
}
