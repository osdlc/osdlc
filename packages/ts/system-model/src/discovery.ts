/**
 * File discovery: the one place that decides which files exist.
 *
 *   git   `git ls-files`: fast, respects .gitignore, and lists tracked files
 *         plus untracked files that are not ignored.
 *   walk  a directory walk that skips well-known names. Works in a directory
 *         that is not a repository.
 *
 * The two can disagree. git does not list a gitignored directory, and the walk
 * does. So the chosen mode is recorded on the profile.
 */

import { readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { runCheckedAsync, type AsyncCommandRunner } from '@osdlc/command-seam'

import type { DiscoveryMode } from './model.ts'
import { compilePattern } from './pattern.ts'

/**
 * Paths to skip: build output, dependency trees and tool caches. All of them
 * contain manifests that are not this project's.
 *
 * Two forms, per {@link matchesExclude}: a bare name matches any path segment,
 * and a value containing `/` matches a root-relative path prefix.
 */
export const DEFAULT_EXCLUDES: readonly string[] = [
  'node_modules',
  '.git',
  'target',
  'dist',
  'build',
  '.nuxt',
  '.output',
  '.astro',
  '.venv',
  'venv',
  '__pycache__',
  '.sdlc',
  '.claude',
  // Test-fixture trees are data, not project structure. Without these, a
  // repo's catalog picks up the manifests its test suites keep, which are not
  // tasks anyone can run.
  //
  // These two names are the usual place for such a tree, not a complete list.
  // A fixture tree with another name (`tests/mini-repo`, `testdata`,
  // `example-repo`) is not caught. Adding those names here would exclude
  // directories that hold real tasks in other repositories. Use
  // `excludePaths` to name such a tree by path.
  'fixtures',
  '__fixtures__',
  '.moon/cache',
  'vendor',
]

/**
 * Config set on every discovery git call. Discovery runs before the
 * repository is trusted, and `.git/config` belongs to whoever made the
 * directory. `core.fsmonitor` names a command that `ls-files --others` runs,
 * so it is turned off. The other config keys that run commands (hooks,
 * `diff.external`, `filter.*`, `core.sshCommand`, `core.pager`) do not apply
 * to `rev-parse` or `ls-files` without a TTY.
 *
 * Which `git` binary runs is a separate exposure. The default runner finds it
 * on absolute PATH entries only (see `defaultRunner` in `which.ts`), so a
 * `git` the repository ships is never run.
 */
const SAFE_GIT_CONFIG: readonly string[] = ['-c', 'core.fsmonitor=false']

/** Whether `root` is inside a git working tree and git can be run. */
export async function gitAvailable(root: string, git: AsyncCommandRunner): Promise<boolean> {
  // A failure is the answer here. Outside a repository git exits 128, and a
  // missing binary also comes back from `@osdlc/command-seam` as a non-zero
  // exit. Both mean "not usable", so the exit code is read, not thrown.
  const res = await git.run([...SAFE_GIT_CONFIG, 'rev-parse', '--is-inside-work-tree'], {
    cwd: root,
  })
  return res.exitCode === 0 && res.stdout.trim() === 'true'
}

export async function resolveDiscovery(
  root: string,
  requested: DiscoveryMode | 'auto',
  git: AsyncCommandRunner,
): Promise<DiscoveryMode> {
  if (requested !== 'auto') return requested
  return (await gitAvailable(root, git)) ? 'git' : 'walk'
}

/**
 * Every file git knows about, root-relative and posix-separated.
 *
 * `--cached --others --exclude-standard` is deliberate: tracked files plus
 * untracked files that are not ignored. A justfile written a minute ago and
 * not yet `git add`ed is still a justfile, and a tool that cannot see it looks
 * broken.
 */
async function gitFiles(root: string, git: AsyncCommandRunner): Promise<string[]> {
  // Throws rather than returning `[]`. This runs only after
  // {@link gitAvailable} returned true, so a failure means a broken
  // repository, and "no files" would report every tool as absent. `-z`
  // because without it git quotes any path with a space or a non-ASCII byte.
  const res = await runCheckedAsync(
    git,
    [...SAFE_GIT_CONFIG, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root },
  )
  return res.stdout.split('\0').filter((f) => f !== '')
}

/**
 * An exclusion set split by how each entry has to be matched.
 *
 * Names and paths cannot share one lookup. A name is compared against every
 * segment of a candidate. A path is compared against its leading segments in
 * order. A single set tested one segment at a time handles names but silently
 * ignores paths. No path segment is ever equal to `.moon/cache`, so that entry
 * of {@link DEFAULT_EXCLUDES} would exclude nothing.
 */
export interface ExcludeSet {
  /** Bare names, matched against any single path segment. */
  names: Set<string>
  /** Root-relative paths, matched as a segment prefix. Already split into segments. */
  paths: string[][]
}

/**
 * Sort raw exclusion strings into the two kinds. Drops what hand-written
 * config often has: surrounding whitespace, a leading `./`, and leading or
 * trailing slashes.
 *
 * `src/`, `/src` and `./src` all mean `src`. If the effect depended on the
 * spelling, people would get the setting wrong.
 */
export function normalizeExcludes(raw: readonly string[]): ExcludeSet {
  const names = new Set<string>()
  const paths: string[][] = []
  for (const entry of raw) {
    const segments = entry
      .trim()
      .split('/')
      .filter((segment) => segment !== '' && segment !== '.')
    if (segments.length === 0) continue
    if (segments.length === 1) names.add(segments[0] as string)
    else paths.push(segments)
  }
  return { names, paths }
}

/**
 * Whether a root-relative path is excluded.
 *
 * A name matches any segment. `node_modules` must match at every depth, which
 * is the only useful meaning for a dependency tree. A path matches the leading
 * segments, so naming a directory excludes the whole tree under it, and naming
 * a file excludes that file.
 *
 * The prefix is compared segment by segment, not as a string, so `src/app`
 * does not also exclude `src/application`. A plain string prefix test would
 * fail only in a repository that has both.
 */
export function matchesExclude(path: string, excludes: ExcludeSet): boolean {
  const segments = path.split('/')
  if (segments.some((segment) => excludes.names.has(segment))) return true
  return excludes.paths.some(
    (prefix) => prefix.length <= segments.length && prefix.every((seg, i) => segments[i] === seg),
  )
}

/** The most files a directory walk lists. The rest of the tree is not listed. */
export const MAX_WALK_FILES = 50_000

/** The deepest directory a walk enters, counted from the root at depth 0. */
export const MAX_WALK_DEPTH = 32

/** A walk cap that was reached: which one, and its value. */
export interface WalkLimit {
  cap: 'files' | 'depth'
  value: number
}

/** The walk's caps. Tests lower them; callers use the defaults. */
export interface WalkCaps {
  files: number
  depth: number
}

/**
 * The walk skips both kinds of exclude as it goes, rather than listing
 * everything and filtering after. An excluded directory is the expensive case,
 * since `node_modules` often holds most of the files. Entering one only to
 * discard its contents is the cost this walk avoids.
 *
 * The walk stops at {@link MAX_WALK_FILES} files and does not enter a
 * directory deeper than {@link MAX_WALK_DEPTH}. `limit` records the first cap
 * reached. Entries are visited in name order, so a capped walk keeps the same
 * files on every machine. git mode has no cap: it lists what git lists.
 */
async function walkFiles(
  root: string,
  excludes: ExcludeSet,
  limit: { hit?: WalkLimit },
  caps: WalkCaps,
): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string, depth: number): Promise<void> {
    let entries
    try {
      entries = (await readdir(dir, { withFileTypes: true })).sort((a, b) =>
        a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
      )
    } catch {
      return
    }
    for (const entry of entries) {
      if (out.length >= caps.files) {
        limit.hit ??= { cap: 'files', value: caps.files }
        return
      }
      const full = join(dir, entry.name)
      const rel = relative(root, full).split(sep).join('/')
      if (matchesExclude(rel, excludes)) continue
      // Symlinks are not followed. A link to a parent directory would make the
      // walk loop forever, and a link out of the tree would report files that
      // are not this project's.
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) {
        if (depth >= caps.depth) limit.hit ??= { cap: 'depth', value: caps.depth }
        else await walk(full, depth + 1)
      } else if (entry.isFile()) out.push(rel)
    }
  }
  await walk(root, 0)
  return out
}

/** A memoized file lister for one root: every file once, then filtered per pattern. */
export interface Lister {
  (pattern: string): Promise<string[]>
  /** Every file discovery found, root-relative. */
  all(): Promise<string[]>
  /** The walk cap the listing reached, once `all` has resolved. Never set in git mode. */
  limit(): WalkLimit | undefined
}

/** The exclude list discovery applies: `DEFAULT_EXCLUDES` first when `useBuiltinExcludes`, then `extra`. */
export function excludeList(extra: readonly string[], useBuiltinExcludes: boolean): string[] {
  return useBuiltinExcludes ? [...DEFAULT_EXCLUDES, ...extra] : [...extra]
}

/**
 * A file lister for one root, resolved once and memoized. `useBuiltinExcludes`
 * (default `true`) adds {@link DEFAULT_EXCLUDES} to `extraExcludes`.
 */
export function createLister(
  root: string,
  mode: DiscoveryMode,
  git: AsyncCommandRunner,
  extraExcludes: readonly string[] = [],
  useBuiltinExcludes = true,
  caps: WalkCaps = { files: MAX_WALK_FILES, depth: MAX_WALK_DEPTH },
): Lister {
  const excludes = normalizeExcludes(excludeList(extraExcludes, useBuiltinExcludes))
  let all: Promise<string[]> | null = null
  const limit: { hit?: WalkLimit } = {}
  // The exclusions apply to both strategies, so the two modes agree about a
  // `fixtures/` tree whether or not the root is a repository.
  const list = (): Promise<string[]> =>
    (all ??= (mode === 'git' ? gitFiles(root, git) : walkFiles(root, excludes, limit, caps)).then(
      (files) => files.filter((f) => !matchesExclude(f, excludes)),
    ))

  const lister = async (pattern: string): Promise<string[]> => {
    const compiled = compilePattern(pattern)
    return (await list()).filter((f) => compiled.base(f) !== null)
  }
  return Object.assign(lister, { all: list, limit: () => limit.hit })
}

/** True when a root-relative path exists on disk. */
export async function pathExists(root: string, relPath: string): Promise<boolean> {
  try {
    await stat(join(root, relPath))
    return true
  } catch {
    return false
  }
}
