/**
 * Intersect L2 — filesystem (`intersect/fs`).
 *
 * The only layer that reads disk and the only one carrying a runtime
 * dependency (a globber, `tinyglobby`). It enumerates real files with the
 * globber, then filters via the pure path API (L1/L0) — it does not
 * re-implement matching; L0/L1 stay pure questions about patterns.
 *
 * Semantics are IDENTICAL to the pure layer: a bare path is an exact match and
 * a subtree needs `**`, exactly as at L1 — the globber's own dialect never
 * leaks into the result.
 *
 * The arguments are GLOBS and the enumerated names are FILENAMES. The path API
 * reads the names literally, so a file really called `pages/[id].vue` is that
 * name and not a character class. The corollary binds callers: to reach such a
 * file you must escape the metacharacters in your pattern too
 * (`pages/\[id\].vue`) — a literal repo path fed in verbatim silently matches
 * nothing.
 *
 * The walk lists the WHOLE tree under `cwd` before it filters; it is not pruned
 * by the patterns. Symbolic links are neither followed nor listed. Anything the
 * walk cannot read throws an `IntersectError` with code `IO_ERROR`.
 *
 * `tinyglobby` is imported ONLY here; the core entries (`./index`,
 * `./segments`, `./parse`, `./registry`) never reference it, keeping them
 * zero-dependency.
 *
 * @module fs
 */
import { readdir } from 'node:fs'
import { resolve } from 'node:path'
import { glob } from 'tinyglobby'
import { compile, IntersectError, type Matcher, type Options, type Patterns } from './index.ts'

/** Options for the filesystem layer — matching semantics plus on-disk resolution controls. */
export interface FsOptions extends Options {
  /**
   * Directory the globs resolve against. Default `process.cwd()`. A directory
   * that is missing, is not a directory, or cannot be read throws
   * `IntersectError` with code `IO_ERROR`.
   */
  cwd?: string
  /**
   * Globs to exclude from results, with the same rules as the patterns:
   * `ignore: ['node_modules']` excludes only a path named exactly `node_modules`
   * (write `node_modules/**` for the folder's contents), a pattern with a
   * leading `./` or `/` matches no file, and `!` is not negation.
   */
  ignore?: readonly string[]
  /** Return files only (skip directories). Default `true`. */
  onlyFiles?: boolean
  /** Return absolute paths, `resolve(cwd, path)`, also when `cwd` is relative. Default `false`. */
  absolute?: boolean
}

/** Order strings by code point, which is also UTF-8 byte order. (`Array.sort` orders by UTF-16 unit.) */
function byCodePoint(a: string, b: string): number {
  let i = 0
  let j = 0
  while (i < a.length && j < b.length) {
    const x = a.codePointAt(i)!
    const y = b.codePointAt(j)!
    if (x !== y) return x < y ? -1 : 1
    i += x > 0xffff ? 2 : 1
    j += y > 0xffff ? 2 : 1
  }
  return a.length - i - (b.length - j)
}

/**
 * Enumerate every file under `cwd`, then keep those the path API says fall in
 * `patterns` and not in `ignore`. Returns cwd-relative paths, sorted by code
 * point. The enumeration always runs with `dot: true` so dotfiles reach
 * the post-filter; whether `*`/`**` actually match a dot segment is then the
 * path API's `dot` option's call — keeping the decision in one place (L1).
 *
 * `opts` goes straight to `matches` as its `Options`: `FsOptions` extends
 * `Options`, and the path API reads only the matching keys, ignoring the
 * fs-only ones (`cwd`, `ignore`, …).
 */
async function filesMatching(
  patterns: Patterns,
  opts: FsOptions | undefined,
  also?: Matcher,
): Promise<string[]> {
  const cwd = opts?.cwd ?? process.cwd()
  // Compile first: a bad pattern or argument must fail before the walk starts.
  const include = compile(patterns, opts)
  const ignore = opts?.ignore?.length ? compile(opts.ignore, opts) : null
  // The globber swallows read errors. Record them from its `readdir` and throw
  // once the walk is done.
  const failures: { path: string; error: NodeJS.ErrnoException }[] = []
  const found = await glob('**/*', {
    cwd,
    dot: true,
    followSymbolicLinks: false,
    onlyFiles: opts?.onlyFiles ?? true,
    absolute: false,
    fs: {
      readdir: ((path: string, options: object, callback: (...args: unknown[]) => void) => {
        readdir(path, options, (error, entries) => {
          if (error) failures.push({ path, error })
          callback(error, entries)
        })
      }) as never,
    },
  })
  const first = failures[0]
  if (first) {
    throw new IntersectError(
      'IO_ERROR',
      `cannot read directory '${first.path}': ${first.error.code ?? first.error.message}`,
      { cause: first.error },
    )
  }
  // Under `onlyFiles: false` the globber emits directory entries in its own
  // dialect, with a trailing separator (`src/api/`). Strip it at the boundary:
  // a path this layer returns is a plain path, never a globber-shaped one.
  const entries = found.map((rel) => (rel.endsWith('/') ? rel.slice(0, -1) : rel))
  // `matches` reads each name literally, so a file called `[id].vue` is that name.
  const survivors = entries.filter((rel) => {
    if (!include.matches(rel)) return false
    if (also && !also.matches(rel)) return false
    return ignore === null || !ignore.matches(rel)
  })
  return survivors.sort(byCodePoint)
}

/** Absolutize cwd-relative paths when `opts.absolute` is set; otherwise pass them through. */
function absolutize(rel: readonly string[], opts: FsOptions | undefined): string[] {
  if (!(opts?.absolute ?? false)) return [...rel]
  const cwd = opts?.cwd ?? process.cwd()
  return rel.map((r) => resolve(cwd, r))
}

/**
 * The concrete on-disk files matching `patterns` — a scope's context slice.
 *
 * @param patterns - The scope to resolve ({@link Patterns}).
 * @param opts - {@link FsOptions}: matching semantics plus `cwd` / `ignore` /
 * `onlyFiles` / `absolute`.
 * @returns The matching files, sorted by code point; cwd-relative unless
 * `opts.absolute`, which gives `resolve(cwd, path)`.
 * @throws {@link IntersectError} with code `IO_ERROR` when `cwd` is missing, is
 * not a directory, or when any directory under it cannot be read.
 * @remarks Same semantics as the pure layer — a bare path is an exact match and
 * a subtree needs `**`. The globber only enumerates the tree; every
 * include/exclude decision is the path API's `matches`. `patterns` are globs,
 * not filenames: escape `*?[]{}` to name a file that really contains them
 * (`pages/\[id\].vue`), or the file is not returned.
 *
 * The call lists the whole tree under `cwd` before it filters, and does not
 * prune it by the patterns. Symbolic links are neither followed nor listed.
 * `ignore: ['node_modules']` matches only a path named exactly `node_modules`;
 * write `node_modules/**`. A pattern that starts with `./` or `/` matches no
 * file, and `!` is not negation.
 * @example
 * ```ts
 * const context = await filesInScope(["src/api/**", "src/db/**"], { cwd: repoRoot });
 * // → ["src/api/routes/list.ts", "src/api/user.ts", "src/db/pool.ts"]  (sorted, cwd-relative)
 * ```
 */
export async function filesInScope(patterns: Patterns, opts?: FsOptions): Promise<string[]> {
  const rel = await filesMatching(patterns, opts)
  return absolutize(rel, opts)
}

/**
 * The concrete on-disk files that fall in BOTH `a` and `b`.
 *
 * @param a - The first scope ({@link Patterns}).
 * @param b - The second scope ({@link Patterns}).
 * @param opts - {@link FsOptions}: matching semantics plus on-disk controls.
 * @returns The files matching both `a` and `b`, sorted by code point;
 * cwd-relative unless `opts.absolute`.
 * @throws {@link IntersectError} with code `IO_ERROR`, as {@link filesInScope}.
 * @remarks The same rules as {@link filesInScope}: globs, not filenames; the
 * whole tree is listed; symbolic links are skipped.
 * @example
 * ```ts
 * const both = await resolveIntersection(["src/**"], ["src/api/**"], { cwd: repoRoot });
 * // → ["src/api/routes/list.ts", "src/api/user.ts"]  (only files under both scopes)
 * ```
 */
export async function resolveIntersection(
  a: Patterns,
  b: Patterns,
  opts?: FsOptions,
): Promise<string[]> {
  // Resolve in relative space (regardless of `opts.absolute`) so the relative
  // patterns match, then absolutize once at the boundary.
  const rel = await filesMatching(a, opts, compile(b, opts))
  return absolutize(rel, opts)
}
