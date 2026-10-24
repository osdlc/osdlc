/**
 * Find a binary on PATH, without `Bun.which`.
 *
 * Node has no `Bun.which`, so this walks PATH with `node:fs`. Callers inject
 * their own through `DetectOptions.which` and `CollectOptions.which`.
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
 * The resolved path of `binary`, or null. A relative PATH entry yields a
 * relative result.
 *
 * A name containing a separator is checked as a path, not searched for on
 * PATH — `./bin/tool` names a file. On Windows, PATHEXT suffixes are tried in
 * turn, because the file on disk is `git.exe` while callers ask for `git`.
 */
export function which(
  binary: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (binary.includes('/') || binary.includes('\\')) {
    const direct = isAbsolute(binary) ? binary : join(process.cwd(), binary)
    return executable(direct) ? direct : null
  }

  const exts =
    process.platform === 'win32'
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
