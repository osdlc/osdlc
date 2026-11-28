import { isAbsolute, relative, resolve, sep } from 'node:path'

/** `path` with the platform's separators written as `/`, the form git and reports use. */
export function posix(path: string): string {
  return path.split(sep).join('/')
}

/**
 * Whether the `/`-separated relative `path` is `dir` or lies under it; `''`
 * is the root and holds every path.
 */
export function isWithin(path: string, dir: string): boolean {
  return dir === '' || path === dir || path.startsWith(`${dir}/`)
}

/**
 * `path`, resolved against `from`, as a `/`-separated path relative to
 * `root` (`.` for `root` itself); null when it lies outside `root`. A name
 * that only starts with `..`, such as `..odd`, is inside.
 */
export function relativeWithin(root: string, path: string, from: string = root): string | null {
  const rel = relative(root, resolve(from, path))
  if (rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) return null
  return rel === '' ? '.' : posix(rel)
}
