/**
 * The machine-wide ignore list: paths no candidate may sit in. A path is
 * ignored when it is one of the entries or below one, by its own name or by its
 * real path, so a link into an ignored directory is covered too.
 */

import { realpathSync } from 'node:fs'
import { isAbsolute, join, resolve, sep } from 'node:path'

/** `path` with a leading `~` taken as `home`. */
export const expandHome = (path: string, home: string): string =>
  path === '~' || path.startsWith('~/') ? join(home, path.slice(1)) : path

const real = (path: string): string => {
  try {
    return realpathSync(path)
  } catch {
    return path
  }
}

const within = (path: string, dir: string): boolean =>
  path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep)

/** `entries` as absolute paths (`~` is `home`, a relative entry starts at `cwd`), each by its real path as well. */
export function ignorePaths(entries: readonly string[], cwd: string, home: string): string[] {
  const out = new Set<string>()
  for (const entry of entries) {
    const abs = resolve(cwd, expandHome(entry, home))
    out.add(abs)
    out.add(real(abs))
  }
  return [...out]
}

/** The ignore entry that covers `path`, or undefined. Only an absolute path can be covered. */
export function coveredBy(path: string, ignore: readonly string[]): string | undefined {
  if (ignore.length === 0 || !isAbsolute(path)) return undefined
  const forms = [path, real(path)]
  return ignore.find((dir) => forms.some((f) => within(f, dir)))
}
