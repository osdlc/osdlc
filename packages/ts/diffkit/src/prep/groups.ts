/**
 * Group kept files into review groups: one group per nearest package root,
 * then any oversized group split by the even-split rule, then neighbouring
 * small groups packed together up to the limit. A reader handed one group sees
 * whole packages, not an arbitrary slice of a directory tree.
 */

import { splitEven } from '../core/split.ts'
import { byPath } from './files.ts'
import type { PrepFile, PrepGroup } from './schema.ts'

/**
 * Files whose presence marks a directory as a package root.
 *
 * @experimental The list may grow, and the exports of this module may change.
 */
export const PACKAGE_MARKERS: ReadonlySet<string> = new Set([
  'package.json',
  'Cargo.toml',
  'pyproject.toml',
  'go.mod',
  'deno.json',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'setup.py',
  'Gemfile',
  'composer.json',
  'Package.swift',
  'mix.exs',
  'pubspec.yaml',
])

/** The root group, for files with no package root above them. */
export const REPO_ROOT = '.'

/**
 * Directories (repo-relative, `.` for the top) holding a marker file, from the head's path list.
 *
 * @experimental
 */
export function packageRoots(paths: Iterable<string>): Set<string> {
  const roots = new Set<string>()
  for (const p of paths) {
    const i = p.lastIndexOf('/')
    if (PACKAGE_MARKERS.has(p.slice(i + 1))) roots.add(i < 0 ? REPO_ROOT : p.slice(0, i))
  }
  return roots
}

/**
 * The nearest ancestor directory of `path` that is in `roots`, `.` when none
 * is. A marker at the repo root makes `.` a root like any other.
 *
 * @experimental
 */
export function nearestRoot(path: string, roots: ReadonlySet<string>): string {
  let dir = path.lastIndexOf('/') < 0 ? '' : path.slice(0, path.lastIndexOf('/'))
  while (dir !== '') {
    if (roots.has(dir)) return dir
    const i = dir.lastIndexOf('/')
    dir = i < 0 ? '' : dir.slice(0, i)
  }
  return REPO_ROOT
}

/** Root order: the repo root first, then by name. */
const byRoot = (a: string, b: string): number => {
  if (a === b) return 0
  if (a === REPO_ROOT) return -1
  if (b === REPO_ROOT) return 1
  return a < b ? -1 : 1
}

/**
 * Groups in root order, files in path order inside each. A package of more
 * than `limit` files is split into even slices that keep its root. Consecutive
 * groups (in root order) whose combined size stays within `limit` are then
 * packed into one, so thirty one-file packages are a few reviewers, not thirty;
 * a packed group lists every root it holds in `roots`. `limit` 0 disables both
 * splitting and packing. Ids are `g1`, `g2`, … in output order.
 *
 * @experimental
 */
export function buildGroups(
  kept: readonly PrepFile[],
  roots: ReadonlySet<string>,
  limit: number,
): PrepGroup[] {
  const rootOf = new Map<string, PrepFile[]>()
  for (const f of kept) {
    const root = nearestRoot(f.path, roots)
    const list = rootOf.get(root)
    if (list === undefined) rootOf.set(root, [f])
    else list.push(f)
  }
  const pieces: { roots: string[]; files: PrepFile[] }[] = []
  for (const root of [...rootOf.keys()].sort(byRoot)) {
    for (const slice of splitEven(rootOf.get(root)!.sort(byPath), limit)) {
      const last = pieces.at(-1)
      if (limit > 0 && last !== undefined && last.files.length + slice.length <= limit) {
        last.roots.push(root)
        last.files.push(...slice)
      } else pieces.push({ roots: [root], files: [...slice] })
    }
  }
  return pieces.map((p, i) => ({
    id: `g${i + 1}`,
    roots: [...new Set(p.roots)],
    files: p.files.map((f) => f.path),
    lines: p.files.reduce((n, f) => n + f.added + f.removed, 0),
  }))
}
