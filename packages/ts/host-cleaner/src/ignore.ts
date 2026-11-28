/**
 * The machine-wide ignore list: paths no candidate may sit in. A path is
 * ignored when it is one of the entries or below one, by its own name or by its
 * real path, so a link into an ignored directory is covered too.
 */

import { isAbsolute, posix, resolve, win32 } from 'node:path'

import { isUnder, realOr } from './helpers.ts'

/** `path` with a leading `~` (or on Windows `~\`) taken as `home()`, which is called only then. */
export const expandHome = (
  path: string,
  home: () => string,
  platform: string = process.platform,
): string =>
  path === '~' || path.startsWith('~/') || (platform === 'win32' && path.startsWith('~\\'))
    ? (platform === 'win32' ? win32 : posix).join(home(), path.slice(1))
    : path

/** `entries` as absolute paths (`~` is `home()`, a relative entry starts at `cwd`), each by its real path as well. */
export function ignorePaths(entries: readonly string[], cwd: string, home: () => string): string[] {
  const out = new Set<string>()
  for (const entry of entries) {
    const abs = resolve(cwd, expandHome(entry, home))
    out.add(abs)
    out.add(realOr(abs))
  }
  return [...out]
}

/** The ignore entry that covers `path`, or undefined. Only an absolute path can be covered. */
export function coveredBy(path: string, ignore: readonly string[]): string | undefined {
  if (ignore.length === 0 || !isAbsolute(path)) return undefined
  const forms = [path, realOr(path)]
  return ignore.find((dir) => forms.some((f) => isUnder(f, dir)))
}

/** The ignore entry that sits inside `path`, so deleting `path` would take it too, or undefined. */
export function containsIgnored(path: string, ignore: readonly string[]): string | undefined {
  if (ignore.length === 0 || !isAbsolute(path)) return undefined
  const forms = [path, realOr(path)]
  return ignore.find((dir) => forms.some((f) => isUnder(dir, f)))
}
