import { readlinkSync, realpathSync, statSync } from 'node:fs'
import { dirname, isAbsolute, resolve } from 'node:path'

import { PathError, validateRelative } from './lexical.ts'

/**
 * How the containment layer canonicalises a path. POSIX paths only. Pass your
 * own to test against a fake filesystem.
 *
 * @example
 * ```ts
 * const fake: Resolver = {
 *   realpath: (p) => { if (p === '/' || p === '/root') return p; throw new Error('ENOENT') },
 *   readlink: () => { throw new Error('EINVAL') },
 * }
 * contains('/root', '/root/new.txt', fake) // true
 * ```
 */
export interface Resolver {
  /**
   * `path` with every symlink resolved. Must throw when `path` does not exist.
   * When `path` resolves, so must each of its leading parts.
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
 * The real filesystem. A `..` is resolved physically, as the OS `realpath`
 * does: `link/..` is the parent of the link's target. `realpathSync` alone
 * cannot be trusted with that: it folds `..` textually first.
 *
 * @example
 * ```ts
 * nodeResolver.realpath('/tmp') // '/private/tmp' on macOS, '/tmp' on Linux
 * ```
 */
export const nodeResolver: Resolver = {
  realpath(path) {
    if (path === '') throw fsError('ENOENT', path)
    const { absolute, segs } = components(path)
    let current = absolute ? '/' : '.'
    for (const seg of segs) {
      if (seg === '..') {
        const real = realpathSync(current)
        if (!statSync(real).isDirectory()) throw fsError('ENOTDIR', current)
        current = dirname(real)
      } else current = joinPath(current, seg)
    }
    return realpathSync(current)
  },
  readlink: (path) => readlinkSync(path),
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

function fsError(code: string, path: string): Error {
  return Object.assign(new Error(`${code}: ${path}`), { code })
}

/**
 * {@link canonicalExistingPrefix} of `path`, made absolute against the working
 * directory first: the realpath when `path` exists, otherwise the realpath of
 * its deepest existing ancestor with the rest re-attached and any `..` in it
 * folded against that real path. Where that walk gives up (more than
 * {@link MAX_LINK_HOPS} links, or too many resolver calls), returns the
 * absolute path with `..` folded as text, so the answer never holds a `..`.
 *
 * @throws {Error} What `process.cwd()` throws, when `path` is relative and the
 * working directory cannot be read.
 * @example
 * ```ts
 * realpathOrSelf('/tmp/does-not-exist/x') // '/private/tmp/does-not-exist/x' on macOS
 * realpathOrSelf('/no/such/dir/../x') // '/no/such/x'
 * ```
 */
export function realpathOrSelf(path: string): string {
  const abs = isAbsolute(path) ? path : joinPath(process.cwd(), path)
  return existingPrefix(nodeResolver, abs) ?? resolve(abs)
}

/**
 * Layers 1 + 2: validate `raw`, join it onto `root`, and prove the result stays
 * inside. Port of the Rust `resolve`.
 *
 * Neither the path nor the root need exist: each is checked by the realpath of
 * its deepest existing ancestor, so a create-new-file call uses the same guard
 * as a read. A dangling symlink on the path is checked by where its target would
 * land. A chain of more than {@link MAX_LINK_HOPS} links is refused, as is a root
 * that reduces to the empty path (`''`, or a relative `missing/..`) and a path
 * whose check would spend more resolver calls than its length allows.
 * Returns the joined path (not its realpath).
 *
 * @throws {PathError} Any kind {@link validateRelative} throws for `raw`, and
 * kind `escapes` when the result resolves outside `root`.
 * @example
 * ```ts
 * resolveInside('/vault', 'notes/a.md') // '/vault/notes/a.md'
 * resolveInside('/vault', '../etc') // throws PathError, kind 'parent_segment'
 * ```
 */
export function resolveInside(
  root: string,
  raw: string,
  resolver: Resolver = nodeResolver,
): string {
  const rel = validateRelative(raw)
  const joined = joinPath(root, rel)
  const realRoot = existingPrefix(resolver, root) ?? root
  const real = existingPrefix(resolver, joined)
  // An empty root would hold every relative path.
  if (real === null || realRoot === '' || !startsWith(real, realRoot)) {
    throw new PathError(
      'escapes',
      `path escapes the root: ${JSON.stringify(raw)} resolves outside ${JSON.stringify(realRoot)}`,
    )
  }
  return joined
}

/**
 * Like {@link resolveInside}, but returns null instead of throwing a
 * {@link PathError}. Errors that are not a {@link PathError} still propagate.
 *
 * @example
 * ```ts
 * tryResolveInside('/vault', 'notes/a.md') // '/vault/notes/a.md'
 * tryResolveInside('/vault', '../etc') // null
 * ```
 */
export function tryResolveInside(
  root: string,
  raw: string,
  resolver: Resolver = nodeResolver,
): string | null {
  try {
    return resolveInside(root, raw, resolver)
  } catch (error) {
    if (error instanceof PathError) return null
    throw error
  }
}

/**
 * Is `inner` the same directory as `outer`, or beneath it, once both are
 * reduced by {@link canonicalExistingPrefix}? Compared by whole components, so
 * `/vault-bee` is not inside `/vault-b`. False when either passes through more
 * than {@link MAX_LINK_HOPS} symlinks or spends its resolver calls, and when
 * `outer` reduces to the empty path. Port of the Rust `contains`.
 *
 * Does not throw for a missing path; it compares what exists and keeps the rest as written.
 * @example
 * ```ts
 * contains('/vault', '/vault/notes/new.md') // true, when /vault exists and holds no escaping link
 * contains('/vault-b', '/vault-bee') // false
 * ```
 */
export function contains(outer: string, inner: string, resolver: Resolver = nodeResolver): boolean {
  const realInner = existingPrefix(resolver, inner)
  const realOuter = existingPrefix(resolver, outer)
  return (
    realInner !== null && realOuter !== null && realOuter !== '' && startsWith(realInner, realOuter)
  )
}

/**
 * `path` made absolute against the working directory and folded as text: `.`
 * dropped, `..` removed with the component before it, no trailing slash.
 *
 * Touches no filesystem and follows no symlink, so it cannot tell whether the
 * result stays inside any root. Use {@link resolveInside} for that. A `..` at the
 * root stays at the root, and a leading `..` in a relative path pops the last
 * component of the working directory. An absolute `path` never reads the working
 * directory. Port of the Rust `lexical_absolute`.
 *
 * @throws {Error} What `process.cwd()` throws, when `path` is relative and the
 * working directory cannot be read.
 * @example
 * ```ts
 * lexicalAbsolute('/srv/data/a/./b/../c/') // '/srv/data/a/c'
 * lexicalAbsolute('/srv/../../etc') // '/etc'
 * lexicalAbsolute('a/../b') // '/work/b', when the working directory is '/work'
 * ```
 */
export function lexicalAbsolute(path: string): string {
  // Rust takes a `Path` and returns `io::Result<PathBuf>`. Here a string goes in
  // and out, and the cwd failure is thrown.
  // `resolve` gives the same fold as the Rust component walk on POSIX for every
  // case in the parity fixture and the tests. The join is explicit, as in Rust,
  // so only a relative path reads the working directory.
  return resolve(isAbsolute(path) ? path : joinPath(process.cwd(), path))
}

/**
 * Turn an absolute path back into a root-relative one with `/` separators:
 * `/v/Notes/a.md` under `/v` becomes `Notes/a.md`, and the root itself becomes
 * `''`. `abs` is under `root` by whole components, so `/vault2` is not under
 * `/vault`. A `.` component is dropped. Touches no filesystem. POSIX paths only.
 * Port of the Rust `to_relative`.
 *
 * @throws {PathError} Kind `escapes` if `abs` is not under `root`, and kind
 * `parent_segment` if the relative part holds a `..`.
 * @example
 * ```ts
 * toRelative('/v', '/v/Notes/a.md') // 'Notes/a.md'
 * toRelative('/v', '/other/a.md') // throws PathError, kind 'escapes'
 * ```
 */
export function toRelative(root: string, abs: string): string {
  // Rust also throws `NotUtf8` for a component that is not valid UTF-8. A
  // TypeScript path is a string, so that case does not exist here.
  if (!startsWith(abs, root)) {
    throw new PathError(
      'escapes',
      `path escapes the root: ${JSON.stringify(abs)} resolves outside ${JSON.stringify(root)}`,
    )
  }
  const rel = components(abs).segs.slice(components(root).segs.length)
  if (rel.includes('..')) {
    throw new PathError(
      'parent_segment',
      `path contains a parent-directory segment: ${JSON.stringify(rel.join('/'))}`,
    )
  }
  // As Rust skips `Component::CurDir`. `components` leaves a `.` only at the
  // start of a relative path, which lands here when `root` is empty.
  return rel.filter((seg) => seg !== '.').join('/')
}

/**
 * Canonicalise as much of `path` as exists and keep the rest lexically. Port of
 * the Rust `canonical_existing_prefix`, which documents the rule: a `..` is
 * resolved physically where the filesystem can, and behind a missing name it is
 * folded against the real path of the existing part, never against the
 * spelling. A dangling symlink is followed to its target; a chain of more than
 * {@link MAX_LINK_HOPS} links, such as a loop, leaves `path` as written, as does
 * a walk that would spend more resolver calls than a fixed allowance per link
 * plus a few per segment of `path`.
 *
 * Does not throw for a missing path.
 * @example
 * ```ts
 * canonicalExistingPrefix('/no/such/dir/../x') // '/no/such/x'
 * ```
 */
export function canonicalExistingPrefix(path: string, resolver: Resolver = nodeResolver): string {
  return existingPrefix(resolver, path) ?? path
}

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

/** A {@link Resolver} with a number of calls left. */
interface Calls {
  resolver: Resolver
  left: number
}

/**
 * {@link canonicalExistingPrefix} through `resolver`. Null when the walk follows
 * more than {@link MAX_LINK_HOPS} links or spends its resolver calls. The answer
 * holds no `..`.
 */
function existingPrefix(resolver: Resolver, path: string): string | null {
  const calls = {
    resolver,
    left: CALLS_PER_HOP * (MAX_LINK_HOPS + 1) + CALLS_PER_PART * parts(path).length,
  }
  try {
    return walk(calls, path, 0)
  } catch (error) {
    if (error === OUT_OF_CALLS) return null
    throw error
  }
}

/** {@link existingPrefix} of `path`, reached after `hops` links. */
function walk(calls: Calls, path: string, hops: number): string | null {
  const all = parts(path)
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
        const start = isAbsolute(target) ? target : joinPath(base, target)
        return walk(calls, all.slice(i + 1).reduce(joinPath, start), hops + 1)
      }
    }
    if (lastDotDot < i) return all.slice(i).reduce(joinPath, base)
    // Fold the rest against `base` up to the first `..` that lands on a directory
    // that exists, or that nothing is known to: a symlink may follow there, so the
    // walk resumes.
    let absolute = base.startsWith('/')
    const out = components(base).segs
    let missing = 0
    for (;;) {
      const seg = all[i++]
      if (seg === undefined) return format(absolute, out)
      // `/` is only ever the first part. It reaches this loop when the resolver
      // cannot resolve `/` itself, so `out` is empty and the answer is absolute.
      if (seg === '/') absolute = true
      else if (seg === '..') {
        out.pop()
        missing = Math.max(missing - 1, 0)
        if (missing === 0) break
      } else if (seg !== '.') {
        missing++
        out.push(seg)
      }
    }
    base = format(absolute, out)
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

/** Whole-component prefix test, as Rust's `Path::starts_with`. */
function startsWith(path: string, base: string): boolean {
  const p = components(path)
  const b = components(base)
  return (
    p.absolute === b.absolute &&
    b.segs.length <= p.segs.length &&
    b.segs.every((seg, i) => p.segs[i] === seg)
  )
}

/**
 * Rust's `Path::components` for a POSIX path: empty segments and `.` are
 * dropped, except a `.` that starts a relative path.
 */
function components(path: string): { absolute: boolean; segs: string[] } {
  const absolute = path.startsWith('/')
  const segs = path
    .split('/')
    .filter((seg, i) => seg !== '' && (seg !== '.' || (i === 0 && !absolute)))
  return { absolute, segs }
}

/** {@link components} as Rust lists them: `/` first for an absolute path. */
function parts(path: string): string[] {
  const { absolute, segs } = components(path)
  return absolute ? ['/', ...segs] : segs
}

function format(absolute: boolean, segs: string[]): string {
  return (absolute ? '/' : '') + segs.join('/')
}

/** Rust's `Path::join` for a relative `rel`. */
function joinPath(base: string, rel: string): string {
  if (base === '') return rel
  return base.endsWith('/') ? base + rel : `${base}/${rel}`
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
    return resolver.readlink(path)
  } catch {
    return null
  }
}

function tryRealpath(calls: Calls, path: string): string | null {
  if (path === '') return null
  const resolver = spend(calls)
  try {
    return resolver.realpath(path)
  } catch {
    return null
  }
}
