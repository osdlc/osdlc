/**
 * Find a binary on PATH, without `Bun.which`.
 *
 * Node has no `Bun.which`, so a bare name goes through `@osdlc/command-seam`'s
 * `which` (absolute paths only), and a name with a separator is checked with
 * `node:fs`. Callers inject their own through `DetectOptions.which` and `CollectOptions.which`.
 */

import { accessSync, constants, statSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'

import { spawnRunnerAsync, which as seamWhich, type AsyncCommandRunner } from '@osdlc/command-seam'

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
 * The absolute path of `binary`, or null.
 *
 * Only absolute PATH entries are searched. Detection runs inside a repository
 * before it is trusted, and a relative or empty entry would find a file the
 * repository ships. On Windows, PATHEXT suffixes are tried in turn, because
 * the file on disk is `git.exe` while callers ask for `git`, and the current
 * folder is not searched.
 *
 * A name containing a separator is checked as a path, not searched for on
 * PATH: `./bin/tool` names a file.
 */
export function which(
  binary: string,
  env: Record<string, string | undefined> = process.env,
): string | null {
  if (binary.includes('/') || binary.includes('\\')) {
    const direct = isAbsolute(binary) ? binary : join(process.cwd(), binary)
    return executable(direct) ? direct : null
  }
  const found = seamWhich(binary, {
    env: { PATH: env['PATH'], PATHEXT: env['PATHEXT'] },
    absolutePathOnly: true,
  })
  return found ?? null
}

/**
 * The default `makeRunner`: `spawnRunnerAsync` that runs a bare name only from
 * an absolute PATH entry, for the reason {@link which} gives.
 */
export function defaultRunner(binary: string): AsyncCommandRunner {
  return spawnRunnerAsync(binary, { absolutePathOnly: true })
}
