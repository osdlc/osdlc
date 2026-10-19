/**
 * Intersect L2 — filesystem (`intersect/fs`).
 *
 * The only layer that reads disk and the only one carrying a runtime
 * dependency (a globber, `tinyglobby`). It enumerates real files with the
 * globber, then filters via the pure path API (L1/L0) — it does not
 * re-implement matching; L0/L1 stay pure questions about patterns. See
 * `docs/planning/decisions/D-4FRD-intersect-api/layered-api.md`.
 *
 * Semantics are IDENTICAL to the pure layer: a bare path is an exact match and
 * a subtree needs `**`, exactly as at L1 — the globber's own dialect never
 * leaks into the result.
 *
 * The enumerated names are FILENAMES; the arguments are GLOBS. This layer quotes
 * every enumerated name before handing it to `matches`, so a file really called
 * `pages/[id].vue` is compared as that name and not as a character class. The
 * corollary binds callers: to reach such a file you must escape the
 * metacharacters in your pattern too (`pages/\[id\].vue`) — a literal repo
 * path fed in verbatim silently matches nothing.
 *
 * `tinyglobby` is imported ONLY here; the core entries (`./index`,
 * `./segments`, `./parse`, `./registry`) never reference it, keeping them
 * zero-dependency per [[D-4FRD-intersect-api]] Option C.
 *
 * @module fs
 */
import { join } from 'node:path'
import { glob } from 'tinyglobby'
import { compile, type Matcher, type Options, type Patterns } from './index.ts'

/** Options for the filesystem layer — matching semantics plus on-disk resolution controls. */
export interface FsOptions extends Options {
  /** Directory the globs resolve against. Default `process.cwd()`. */
  cwd?: string
  /** Globs to exclude from results. */
  ignore?: readonly string[]
  /** Return files only (skip directories). Default `true`. */
  onlyFiles?: boolean
  /** Return absolute paths. Default `false`. */
  absolute?: boolean
}

/** The characters the L0 tokenizer reads as glob syntax rather than as themselves. */
const GLOB_META = /[\\*?[\]{}]/g

/**
 * Quote a real on-disk path so the path API reads it as the literal name it is.
 * The enumeration yields FILENAMES, and `matches` parses its first argument as a
 * glob — so without this a file actually called `pages/[id].vue` would be
 * re-read as a character class and reported as a match for `pages/d.vue`.
 */
function literal(rel: string): string {
  return rel.replace(GLOB_META, '\\$&')
}

/**
 * Enumerate every file under `cwd`, then keep those the path API says fall in
 * `patterns` and not in `ignore`. Returns cwd-relative paths, sorted for
 * determinism. The enumeration always runs with `dot: true` so dotfiles reach
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
  const found = await glob('**/*', {
    cwd,
    dot: true,
    onlyFiles: opts?.onlyFiles ?? true,
    absolute: false,
  })
  // Under `onlyFiles: false` the globber emits directory entries in its own
  // dialect, with a trailing separator (`src/api/`). Strip it at the boundary:
  // a path this layer returns is a plain path, never a globber-shaped one.
  const entries = found.map((rel) => (rel.endsWith('/') ? rel.slice(0, -1) : rel))
  // Compile once per call, not once per file.
  const include = compile(patterns, opts)
  const ignore = opts?.ignore?.length ? compile(opts.ignore, opts) : null
  const survivors = entries.filter((rel) => {
    const name = literal(rel)
    if (!include.matches(name)) return false
    if (also && !also.matches(name)) return false
    return ignore === null || !ignore.matches(name)
  })
  return survivors.sort()
}

/** Absolutize cwd-relative paths when `opts.absolute` is set; otherwise pass them through. */
function absolutize(rel: readonly string[], opts: FsOptions | undefined): string[] {
  if (!(opts?.absolute ?? false)) return [...rel]
  const cwd = opts?.cwd ?? process.cwd()
  return rel.map((r) => join(cwd, r))
}

/**
 * The concrete on-disk files matching `patterns` — a scope's context slice
 * (DR-0011: build a headless-script's working set).
 *
 * @param patterns - The scope to resolve ({@link Patterns}).
 * @param opts - {@link FsOptions}: matching semantics plus `cwd` / `ignore` /
 * `onlyFiles` / `absolute`.
 * @returns The matching files, sorted; cwd-relative unless `opts.absolute`.
 * @remarks Same semantics as the pure layer — a bare path is an exact match and
 * a subtree needs `**`. The globber only enumerates the tree; every
 * include/exclude decision is the path API's `matches`. `patterns` are globs,
 * not filenames: escape `*?[]{}` to name a file that really contains them
 * (`pages/\[id\].vue`), or the file is not returned.
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
 * @returns The files matching both `a` and `b`, sorted; cwd-relative unless `opts.absolute`.
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
