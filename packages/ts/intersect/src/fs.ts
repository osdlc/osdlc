/**
 * The filesystem entry (`@osdlc/intersect/fs`).
 *
 * The only entry that reads the disk, and the only one with a runtime
 * dependency (`tinyglobby`). It lists real files with `tinyglobby`, then
 * filters them with the path API. It does not match patterns itself.
 *
 * Matching works as in the path API: a bare path is an exact match and a
 * subtree needs `**`. `tinyglobby`'s own glob rules never affect the result.
 *
 * The arguments are globs and the listed names are file names. The path API
 * reads the names literally, so a file named `pages/[id].vue` is that name and
 * not a character class. To match such a file, escape the glob characters in
 * your pattern too (`pages/\[id\].vue`). A literal path passed unescaped
 * matches nothing, with no error.
 *
 * The walk lists the whole tree under `cwd` before it filters. The patterns do
 * not narrow it. Symbolic links are neither followed nor listed. Anything the
 * walk cannot read throws an `IntersectError` with code `IO_ERROR`.
 *
 * Only this file imports `tinyglobby`. The other entries (`./index`,
 * `./segments`, `./parse`, `./registry`) never do, so they have no
 * dependencies.
 *
 * @module fs
 */
import { readdir } from 'node:fs'
import { resolve } from 'node:path'
import { glob } from 'tinyglobby'
import { compile, IntersectError, type Matcher, type Options, type Patterns } from './index.ts'

/** Options for the filesystem entry: the matching options, plus where and what to list. */
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
 * List every file under `cwd`, then keep those the path API says match
 * `patterns` and not `ignore`. Returns paths relative to `cwd`, sorted by code
 * point. The listing always runs with `dot: true`, so dotfiles reach the
 * filter. Whether `*` and `**` match a dot segment is then decided by the path
 * API's `dot` option, in one place.
 *
 * `opts` is passed to `compile` as its `Options`. `FsOptions` extends
 * `Options`, and the path API reads only the matching keys. It ignores the
 * fs-only ones (`cwd`, `ignore`, and so on).
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
  // tinyglobby ignores read errors. Record them from its `readdir` and throw
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
  // Under `onlyFiles: false`, tinyglobby returns directories with a trailing
  // separator (`src/api/`). Strip it, so every returned path is a plain path.
  const entries = found.map((rel) => (rel.endsWith('/') ? rel.slice(0, -1) : rel))
  // `matches` reads each name literally, so a file called `[id].vue` is that name.
  const survivors = entries.filter((rel) => {
    if (!include.matches(rel)) return false
    if (also && !also.matches(rel)) return false
    return ignore === null || !ignore.matches(rel)
  })
  return survivors.sort(byCodePoint)
}

/** Make cwd-relative paths absolute when `opts.absolute` is set. Otherwise return them as they are. */
function absolutize(rel: readonly string[], opts: FsOptions | undefined): string[] {
  if (!(opts?.absolute ?? false)) return [...rel]
  const cwd = opts?.cwd ?? process.cwd()
  return rel.map((r) => resolve(cwd, r))
}

/**
 * The files on disk that match `patterns`.
 *
 * @param patterns - The scope to resolve ({@link Patterns}).
 * @param opts - {@link FsOptions}: the matching options, plus `cwd` / `ignore` /
 * `onlyFiles` / `absolute`.
 * @returns The matching files, sorted by code point. Paths are relative to
 * `cwd`, unless `opts.absolute` is set, which gives `resolve(cwd, path)`.
 * @throws {@link IntersectError} with code `IO_ERROR` when `cwd` is missing, is
 * not a directory, or when any directory under it cannot be read.
 * @remarks Matching works as in the path API: a bare path is an exact match and
 * a subtree needs `**`. tinyglobby only lists the tree. The path API decides
 * every include and exclude. `patterns` are globs, not file names: escape
 * `*?[]{}` to name a file that contains them (`pages/\[id\].vue`), or the file
 * is not returned.
 *
 * The call lists the whole tree under `cwd` before it filters. The patterns do
 * not narrow it. Symbolic links are neither followed nor listed.
 * `ignore: ['node_modules']` matches only a path named exactly `node_modules`.
 * To exclude the folder's contents, write `node_modules/**`. A pattern that starts with `./` or `/` matches no
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
 * The files on disk that match both `a` and `b`.
 *
 * @param a - The first scope ({@link Patterns}).
 * @param b - The second scope ({@link Patterns}).
 * @param opts - {@link FsOptions}: the matching options, plus where and what to list.
 * @returns The files matching both `a` and `b`, sorted by code point. Paths are
 * relative to `cwd` unless `opts.absolute` is set.
 * @throws {@link IntersectError} with code `IO_ERROR`, as {@link filesInScope}.
 * @remarks The same rules as {@link filesInScope}: the patterns are globs, not
 * file names, the whole tree is listed, and symbolic links are skipped.
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
  // Match on relative paths (whatever `opts.absolute` says), so the relative
  // patterns match. Make them absolute once, at the end.
  const rel = await filesMatching(a, opts, compile(b, opts))
  return absolutize(rel, opts)
}
