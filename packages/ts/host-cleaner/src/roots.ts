/**
 * Containment of path candidates. Every one must sit strictly below one of
 * its owner's `roots` or a target, proven by `@osdlc/path-guard` on real
 * paths, so a `..` or a symlink that leads out is not inside. A candidate that
 * is itself a link is judged by its target: a link inside a root that points
 * out of it is not inside. A root declared `{ path, self: true }` may also be
 * a candidate itself. The linked worktrees of the repositories among
 * the targets count as targets too, and so does a linked worktree whose
 * repository's main checkout is or sits inside a target, wherever the
 * worktree is; one may itself be a candidate.
 *
 * Real paths are read with `realpathSync.native`, which spells a path as the
 * filesystem does: where it ignores case, as macOS's does, `~/documents` and
 * `~/Documents` are one folder and compare equal.
 */

import { lstatSync, realpathSync, statSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, sep } from 'node:path'

import { nodeGuard } from '@osdlc/path-guard/node'
import { Git } from '@osdlc/typed-git'

/** `path` with only its parent resolved, so a leaf that does not exist yet still compares against a real root; `path` as given when the parent does not resolve. The guard then follows a leaf that is a link. */
const realLeaf = (path: string): string => {
  const dir = dirname(path)
  try {
    return join(realpathSync.native(dir), basename(path))
  } catch {
    return path
  }
}

const hasDotDot = (path: string): boolean => path.split(/[\\/]/).includes('..')

/** The root of `roots` that `path` is strictly inside by its real path, or null. A root that cannot be resolved holds nothing; a root itself is not inside; a relative path or one with a `..` segment is never inside. */
export function containedIn(roots: readonly string[], path: string): string | null {
  if (!isAbsolute(path) || hasDotDot(path)) return null
  const target = realLeaf(path)
  for (const root of roots) {
    let base: string
    try {
      base = realpathSync.native(root)
    } catch {
      continue
    }
    const rel = relative(base, target)
    if (rel === '' || rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel)) continue
    if (nodeGuard.tryResolve(base, rel) !== null) return root
  }
  return null
}

/**
 * The linked worktrees of each repository that a target is in, as `git
 * worktree list` gives them, a gone one included. A target that is not in a
 * repository adds none. The primary checkout is left out: a target inside a
 * repository holds only what is inside the target.
 */
export function linkedCheckouts(targets: readonly string[]): string[] {
  const linked = new Set<string>()
  for (const target of targets) {
    let trees
    try {
      trees = new Git(target).worktrees()
    } catch {
      continue
    }
    for (const [i, tree] of trees.entries()) if (i > 0 && !tree.bare) linked.add(tree.path)
  }
  return [...linked]
}

/** Where a plugin's path candidates may sit. */
export interface Bounds {
  /** The plugin's own `roots`, by path, its self roots among them; none when it declares none. */
  roots: readonly string[]
  /** The roots declared `{ path, self: true }`, each of which may be a candidate itself. */
  self: readonly string[]
  /** The targets, and with them any linked worktree whose main checkout is or sits inside one. */
  targets: readonly string[]
  /** The linked worktrees of the repositories among the targets. */
  linked: readonly string[]
  /** The home folder, which no root may be or hold. */
  home: string
}

/** `path`'s real path as the filesystem spells it, or `path` as given when it does not resolve. */
export const realOr = (path: string): string => {
  try {
    return realpathSync.native(path)
  } catch {
    return path
  }
}

export const isLink = (path: string): boolean =>
  lstatSync(path, { throwIfNoEntry: false })?.isSymbolicLink() === true

/** Whether `inner` is `outer` or sits below it, by real paths. */
export const within = (outer: string, inner: string): boolean => {
  const rel = relative(realOr(outer), realOr(inner))
  return rel === '' || (rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel))
}

/** Folders under home that hold a person's own files: no root may be one. */
export const PERSONAL_FOLDERS = [
  'Documents',
  'Desktop',
  'Downloads',
  'Pictures',
  'Music',
  'Movies',
  'Library',
  '.ssh',
  '.config',
] as const

/**
 * Why `path` may not be a root, or null when it may: it must be absolute with
 * no `..`, and not be the filesystem root, be or hold the home folder, be a
 * personal folder ({@link PERSONAL_FOLDERS}), be or hold a target or a linked
 * worktree, or be a checkout (hold `.git`). With `self`, as a root that may be
 * a candidate itself, it must not be a symlink either. Judged on real paths.
 */
export function rootProblem(
  path: string,
  at: Pick<Bounds, 'targets' | 'linked' | 'home'>,
  self = false,
): string | null {
  if (!isAbsolute(path) || hasDotDot(path)) return 'it is not an absolute path without ..'
  if (self && isLink(path)) return 'it is a symlink'
  const real = realOr(path)
  if (dirname(real) === real) return 'it is the filesystem root'
  if (real === realOr(at.home)) return 'it is the home folder'
  if (within(path, at.home)) return 'it holds the home folder'
  for (const name of PERSONAL_FOLDERS) {
    if (real === realOr(join(at.home, name))) return `it is the personal folder ~/${name}`
  }
  for (const t of at.targets) {
    if (within(path, t)) return real === realOr(t) ? 'it is a target' : `it holds the target ${t}`
  }
  if (lstatSync(join(path, '.git'), { throwIfNoEntry: false }) !== undefined) {
    return 'it is a checkout'
  }
  for (const l of at.linked) if (within(path, l)) return `it holds the checkout ${l}`
  return null
}

/** A plugin's `roots` answer, checked: the roots by path, the self roots among them, and why each entry left out was. */
export interface AcceptedRoots {
  roots: string[]
  self: string[]
  problems: string[]
}

/**
 * The roots in `answer`, a `roots` hook's answer: each a path, or `{ path,
 * self: true }`. An entry that is neither, or that {@link rootProblem} refuses,
 * is left out and named in `problems`.
 */
export function acceptRoots(
  answer: unknown,
  at: Pick<Bounds, 'targets' | 'linked' | 'home'>,
): AcceptedRoots {
  const out: AcceptedRoots = { roots: [], self: [], problems: [] }
  if (!Array.isArray(answer)) {
    out.problems.push('the answer is not a list of roots')
    return out
  }
  for (const entry of answer as unknown[]) {
    const self = typeof entry === 'object' && entry !== null && 'self' in entry
    const path = self ? (entry as { path?: unknown }).path : entry
    if (typeof path !== 'string' || (self && (entry as { self?: unknown }).self !== true)) {
      out.problems.push(
        `left out ${JSON.stringify(entry)}, which is neither a path nor { path, self: true }`,
      )
      continue
    }
    const why = rootProblem(path, at, self)
    if (why !== null) {
      out.problems.push(`left out the root ${path}: ${why}`)
      continue
    }
    out.roots.push(path)
    if (self) out.self.push(path)
  }
  return out
}

/** Whether `path` is a directory, links followed; false when it cannot be read. */
const isDir = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * The linked worktree that `path` is or sits inside, by real path, whose
 * repository's main checkout (git's common dir's) is or sits inside one of
 * `targets`; null when there is none. The worktree must be one its
 * repository lists, by real path, so a `.git` file that points into a
 * target's repository, or a worktree moved away from where it is
 * registered, does not count. A repository nested in a worktree is looked
 * through to the worktree around it. The main checkout itself is never one.
 */
export function linkedWorktreeOf(targets: readonly string[], path: string): string | null {
  if (!isAbsolute(path) || hasDotDot(path)) return null
  const leaf = realLeaf(path)
  const inTarget = (dir: string): boolean =>
    containedIn(targets, dir) !== null || targets.some((t) => realOr(t) === realOr(dir))
  let dir = isDir(leaf) ? realOr(leaf) : dirname(leaf)
  for (;;) {
    let top: string | null
    try {
      const git = new Git(dir)
      top = git.topLevel()
      if (top === null) return null
      top = realOr(top)
      const main = git.mainCheckout()
      if (main !== null && realOr(main) !== top && inTarget(main)) {
        const listed = git.worktrees().some((t, i) => i > 0 && !t.bare && realLeaf(t.path) === top)
        if (listed && (leaf === top || containedIn([top], path) !== null)) return top
      }
    } catch {
      return null
    }
    if (dirname(top) === top) return null
    dir = dirname(top)
  }
}

/**
 * What in `bounds` holds `path`, or null: a root, a target or a linked
 * worktree it is strictly inside, the self root it is, or the linked worktree
 * it is, unless that is a target; failing those, a linked worktree whose main
 * checkout is or sits inside a target ({@link linkedWorktreeOf}). Judged on
 * real paths, as {@link containedIn} does. A self root counts only while
 * {@link rootProblem} still accepts it, so one that has become a symlink, a
 * checkout or a target since the survey holds nothing, and `path` must not
 * be a link, so a link left in the root's place is not the root.
 */
export function boundBy(bounds: Bounds, path: string): string | null {
  const inside = containedIn([...bounds.roots, ...bounds.targets, ...bounds.linked], path)
  if (inside !== null || !isAbsolute(path) || hasDotDot(path)) return inside
  const leaf = realLeaf(path)
  if (!isLink(path)) {
    const real = realOr(path)
    const self = bounds.self.find(
      (r) => realOr(r) === real && rootProblem(r, bounds, true) === null,
    )
    if (self !== undefined) return self
  }
  if (bounds.targets.some((t) => t === path || realOr(t) === leaf)) return null
  return (
    bounds.linked.find((c) => c === path || realOr(c) === leaf) ??
    linkedWorktreeOf(bounds.targets, path)
  )
}
