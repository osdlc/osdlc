// The walk behind `PathGuard`: how much of a path exists, through a `Resolver`.
// It uses `node:path` for the platform's path rules and no `node:fs`.

import { posix, win32 } from 'node:path'

import { components } from './text.ts'

/**
 * Read once, at load, as Node's `path` does: a test reloads the module to switch
 * platform. The Windows rules are in docs/planning/decisions/D-03-platforms.md.
 */
export const WINDOWS = process.platform === 'win32'
export const platformPath = WINDOWS ? win32 : posix

/**
 * How a {@link PathGuard} reads a filesystem. Pass your own to test against a
 * fake filesystem; `nodeResolver` in `@osdlc/path-guard/node` is the real one.
 * The guard asks with `/` separators, on Windows too, and an answer may use
 * either separator there. An answer must be absolute and canonical: a guard
 * that gets a relative answer, or one with a `.` or `..` segment, trusts
 * nothing under it (see {@link PathGuard}).
 *
 * @example
 * ```ts
 * const fake: Resolver = {
 *   realpath: (p) => { if (p === '/' || p === '/root') return p; throw new Error('ENOENT') },
 *   readlink: () => { throw new Error('EINVAL') },
 * }
 * new PathGuard(fake).contains('/root', '/root/new.txt') // true
 * ```
 */
export interface Resolver {
  /**
   * `path` with every symlink resolved: absolute, with no `.` or `..` segment.
   * Must throw when `path` does not exist. When `path` resolves, so must each
   * of its leading parts.
   */
  realpath(path: string): string
  /**
   * The target text of the symlink at `path`, unresolved. Must throw when
   * `path` is not a symlink. The guard asks only about a path whose parent
   * resolves and which does not, so it can follow a dangling link to where its
   * target lands.
   */
  readlink(path: string): string
}

/**
 * How many dangling symlinks one check follows before it refuses the path, as
 * Linux's `MAXSYMLINKS`. A loop of links never reaches a target.
 *
 * @example
 * ```ts
 * MAX_LINK_HOPS // 40
 * ```
 */
export const MAX_LINK_HOPS = 40

// Resolver calls one check may spend: an allowance for each link it may follow,
// plus a few for each segment of the path. A check that needs more is refused.
// Each hop costs calls in proportion to its link's target, so without the cap a
// loop of long targets would multiply them by `MAX_LINK_HOPS`.

/**
 * Calls per link. A hop the kernel can follow costs one whole-path probe, about
 * 2·log2(segments) search probes and one `readlink`: about 25 at `PATH_MAX`.
 */
const CALLS_PER_HOP = 32
/**
 * Calls per path segment. A `..` behind a missing name costs a probe and a
 * `readlink`: 2 calls against the 8 its two segments allow.
 */
const CALLS_PER_PART = 4

/** Thrown inside a walk once its {@link Calls} are spent. */
const OUT_OF_CALLS = Symbol('out of resolver calls')

/** Thrown inside a walk when the resolver gives an answer that is not canonical. */
const NOT_CANONICAL = Symbol('resolver answer is not canonical')

/** A {@link Resolver} with a number of calls left. */
interface Calls {
  resolver: Resolver
  left: number
}

/**
 * Canonicalise as much of `path` as exists and keep the rest as written, in `/`
 * form. A `..` is resolved physically where the filesystem can, and behind a
 * missing name it is folded against the real path of the existing part, never
 * against the spelling. On Windows every `..` folds as text first, as Windows
 * does. A dangling symlink is followed to its target. The answer holds no `..`.
 *
 * Returns null when the walk follows more than {@link MAX_LINK_HOPS} links or
 * would spend more resolver calls than a fixed allowance per link plus a few
 * per segment of `path`. Returns the empty path, which no caller takes as
 * absolute, when the resolver gives an answer that is not canonical: relative,
 * or with a `.` or `..` segment.
 */
export function existingPrefix(resolver: Resolver, path: string): string | null {
  const calls = {
    resolver,
    left: CALLS_PER_HOP * (MAX_LINK_HOPS + 1) + CALLS_PER_PART * parts(path).length,
  }
  try {
    return walk(calls, path, 0)
  } catch (error) {
    if (error === OUT_OF_CALLS) return null
    if (error === NOT_CANONICAL) return ''
    throw error
  }
}

/** {@link existingPrefix} of `path`, reached after `hops` links. */
function walk(calls: Calls, path: string, hops: number): string | null {
  const folded = WINDOWS ? foldText(path) : path
  const all = parts(folded)
  const rooted = split(folded).root !== ''
  const lastDotDot = all.lastIndexOf('..')
  // `base` stands for `all[0, i)`: their real path once `real`, else as written.
  let base = ''
  let real = false
  let i = 0
  for (;;) {
    const [n, found] = deepestExisting(calls, base, all, i, i === 0)
    if (found !== null) {
      base = found
      real = true
    }
    i += n
    const name = all[i]
    if (real && name !== undefined && name !== '..') {
      const target = tryReadlink(calls, joinPath(base, name))
      if (target !== null) {
        if (hops === MAX_LINK_HOPS) return null
        const start = split(target).root !== '' ? target : joinPath(base, target)
        return walk(calls, all.slice(i + 1).reduce(joinPath, start), hops + 1)
      }
    }
    if (lastDotDot < i) return all.slice(i).reduce(joinPath, base)
    // Fold the rest against `base` up to the first `..` that lands on a directory
    // that exists, or that nothing is known to: a symlink may follow there, so the
    // walk resumes.
    let { root, segs: out } = split(base)
    let missing = 0
    for (;;) {
      const seg = all[i++]
      if (seg === undefined) return format(root, out)
      // The root is only ever the first part. It reaches this loop when the
      // resolver cannot resolve the root itself, so `out` is empty and the answer
      // starts at that root. A `..` there stays there.
      if (rooted && i === 1) root = seg
      else if (seg === '..') {
        out.pop()
        missing = Math.max(missing - 1, 0)
        if (missing === 0) break
      } else if (seg !== '.') {
        missing++
        out.push(seg)
      }
    }
    base = format(root, out)
  }
}

/**
 * How many of `all[i, ...)` resolve when joined to `base`, and the real path they
 * reach (null when none do). `whole` probes all of them first.
 *
 * A leading part that resolves has every shorter one resolving too, so the
 * search steps 1, 2, 4, ... past the last part that resolved and then bisects.
 * That costs O(log d) calls for a missing segment `d` past `base`, plus the probe
 * of the whole path when `whole`.
 */
function deepestExisting(
  calls: Calls,
  base: string,
  all: string[],
  i: number,
  whole: boolean,
): [number, string | null] {
  const probe = (n: number) => tryRealpath(calls, all.slice(i, i + n).reduce(joinPath, base))
  const rest = all.length - i
  if (whole) {
    const r = probe(rest)
    if (r !== null) return [rest, r]
  }
  // Invariant: `all[i, i + found)` resolves (to `real` once `found > 0`);
  // `all[i, i + missing)` does not, or lies past the end.
  let found = 0
  let real: string | null = null
  let missing = whole ? rest : rest + 1
  let step = 1
  while (found + step < missing) {
    const r = probe(found + step)
    if (r === null) missing = found + step
    else [found, real, step] = [found + step, r, step * 2]
  }
  while (missing - found > 1) {
    const mid = (found + missing) >> 1
    const r = probe(mid)
    if (r === null) missing = mid
    else [found, real] = [mid, r]
  }
  return [found, real]
}

/** `path` with `/` for `\` on Windows, where both separate. */
export function slash(path: string): string {
  return WINDOWS ? path.replaceAll('\\', '/') : path
}

/** `path` with `\` for `/` on Windows, the separator Node's `path` returns there. */
export function native(path: string): string {
  return WINDOWS ? path.replaceAll('/', '\\') : path
}

/**
 * Absolute as Rust's `Path::is_absolute`: a leading `/` on POSIX. On Windows, a
 * drive with a root (`C:\`) or a UNC share with a server and a share
 * (`\\server\share`). A root with no drive (`\x`), a bare drive (`C:x`) and a
 * server with no share (`\\server`) are relative there.
 */
export function isAbsolutePath(path: string): boolean {
  if (!WINDOWS) return path.startsWith('/')
  const { root } = win32.parse(path)
  // A UNC root needs a server and a share, as Rust's prefix parser does. A
  // verbatim (`\\?\`) or device (`\\.\`) root counts too.
  return /^[A-Za-z]:[\\/]$/.test(root) || /^[\\/]{2}[^\\/]+[\\/][^\\/]/.test(root)
}

/** A Windows drive with no separator, `C:`, which is relative to that drive. */
const BARE_DRIVE = /^[A-Za-z]:$/

/**
 * Rust's `Path::components` for this platform, in `/` form: the root, then the
 * names. The root is `''` for a relative path and `/` on POSIX. On Windows it
 * can also be a drive (`C:/`, or `C:` alone) or a UNC share (`//server/share/`).
 */
function split(path: string): { root: string; segs: string[] } {
  if (!WINDOWS) {
    const { absolute, segs } = components(path)
    return { root: absolute ? '/' : '', segs }
  }
  const p = slash(path)
  let root = win32.parse(p).root
  if (root !== '' && !root.endsWith('/') && !BARE_DRIVE.test(root)) root += '/'
  const { segs } = components(p.slice(root.length))
  return { root, segs: root === '' ? segs : segs.filter((seg) => seg !== '.') }
}

/** {@link split} as Rust lists components: the root first, when there is one. */
function parts(path: string): string[] {
  const { root, segs } = split(path)
  return root === '' ? segs : [root, ...segs]
}

function format(root: string, segs: string[]): string {
  return root + segs.join('/')
}

/** Whole-component prefix test, as Rust's `Path::starts_with`. A Windows root matches in any case. */
export function under(path: string, base: string): boolean {
  const p = split(path)
  const b = split(base)
  const sameRoot = WINDOWS ? p.root.toUpperCase() === b.root.toUpperCase() : p.root === b.root
  return sameRoot && b.segs.length <= p.segs.length && b.segs.every((seg, i) => p.segs[i] === seg)
}

/**
 * `path` with `.` dropped and each `..` removed with the name before it, as
 * Windows reads a path. A `..` at a root stays there. A leading `..` is kept in
 * a relative path and after a bare drive, which is a working directory too.
 */
function foldText(path: string): string {
  const { root, segs } = split(path)
  const out: string[] = []
  for (const seg of segs) {
    const last = out.at(-1)
    if (seg !== '..') out.push(seg)
    else if (last === '.') out[out.length - 1] = '..'
    else if (last !== undefined && last !== '..') out.pop()
    else if (root === '' || BARE_DRIVE.test(root)) out.push('..')
  }
  return format(root, out)
}

/** Rust's `Path::join` for a relative `rel`. */
export function joinPath(base: string, rel: string): string {
  if (base === '') return rel
  return base.endsWith('/') || (WINDOWS && BARE_DRIVE.test(base)) ? base + rel : `${base}/${rel}`
}

/** Takes one of `calls`, or throws {@link OUT_OF_CALLS} when none are left. */
function spend(calls: Calls): Resolver {
  if (calls.left <= 0) throw OUT_OF_CALLS
  calls.left--
  return calls.resolver
}

function tryReadlink(calls: Calls, path: string): string | null {
  const resolver = spend(calls)
  try {
    return slash(resolver.readlink(path))
  } catch {
    return null
  }
}

function tryRealpath(calls: Calls, path: string): string | null {
  if (path === '') return null
  const resolver = spend(calls)
  let real: string
  try {
    real = slash(resolver.realpath(path))
  } catch {
    return null
  }
  if (!canonical(real)) throw NOT_CANONICAL
  return real
}

/** Absolute, with no `.` or `..` segment after the root, in `/` form. */
function canonical(path: string): boolean {
  if (!isAbsolutePath(path)) return false
  const rest = path.slice(split(path).root.length).split('/')
  return !rest.some((seg) => seg === '.' || seg === '..')
}
