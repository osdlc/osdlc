/**
 * File discovery: the one place that decides which files exist.
 *
 *   git   `git ls-files`: fast, respects .gitignore, and sees tracked files
 *         plus untracked-but-not-ignored ones.
 *   walk  a directory walk that skips well-known names. Works in a directory
 *         that is not a repository.
 *
 * The two disagree (a .gitignore'd directory is invisible to git and visible
 * to the walk), so the resolved mode is recorded on the profile.
 */

import { readdir, stat } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'

import { runCheckedAsync, type AsyncCommandRunner } from '@osdlc/command-seam'

import type { DiscoveryMode } from './model.ts'
import { compilePattern } from './pattern.ts'

/**
 * Paths never worth walking into. Build output, dependency trees and tool
 * caches — all of which contain manifests that are not this project's.
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
  // Test-fixture trees are data, not project structure: without this a repo's
  // catalog picks up the manifests its own test suites keep around, which are
  // not tasks anyone can run.
  //
  // These two names are the CONVENTIONAL place for such a tree, not a complete
  // answer. A fixture tree named anything else — `tests/mini-repo`, `testdata`,
  // `example-repo` — is invisible to a name list, and adding those names here
  // would exclude directories that hold real tasks in some other repository.
  // Naming one by path is what `excludePaths` is for.
  'fixtures',
  '__fixtures__',
  '.moon/cache',
  'vendor',
]

/** Whether `root` is inside a git working tree AND git can be run. */
export async function gitAvailable(root: string, git: AsyncCommandRunner): Promise<boolean> {
  // Failure IS the answer here: outside a repository git exits 128, and a
  // missing binary reaches the seam as a non-zero exit too. Both mean "not
  // usable", which is what this probe asks — so the exit code is read rather
  // than thrown on.
  const res = await git.run(['rev-parse', '--is-inside-work-tree'], { cwd: root })
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
 * `--cached --others --exclude-standard` is deliberate: tracked files PLUS
 * untracked-but-not-ignored ones. A justfile written a minute ago and not yet
 * `git add`ed is still a justfile, and a tool that cannot see it looks broken.
 */
async function gitFiles(root: string, git: AsyncCommandRunner): Promise<string[]> {
  // Throws rather than degrading to `[]`: this runs only after
  // {@link gitAvailable} said yes, so a failure is a broken repository, and
  // "no files" would report every tool as absent. `-z` because without it git
  // quotes any path holding a space or a non-ASCII byte.
  const res = await runCheckedAsync(
    git,
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { cwd: root },
  )
  return res.stdout.split('\0').filter((f) => f !== '')
}

/**
 * An exclusion set split by how each entry has to be matched.
 *
 * Names and paths cannot share one lookup. A name is compared against every
 * segment of a candidate; a path is compared against its leading segments in
 * order. A single set tested one segment at a time can express the first and
 * silently ignores the second: no path segment is ever equal to `.moon/cache`,
 * so that entry of {@link DEFAULT_EXCLUDES} would exclude nothing.
 */
export interface ExcludeSet {
  /** Bare names, matched against any single path segment. */
  names: Set<string>
  /** Root-relative paths, matched as a segment prefix. Pre-split. */
  paths: string[][]
}

/**
 * Sort raw exclusion strings into the two kinds, dropping what a hand-written
 * config carries: surrounding whitespace, a leading `./`, and leading or
 * trailing slashes.
 *
 * `src/`, `/src` and `./src` all mean `src`. A setting whose effect depends on
 * which of those spellings someone reached for is a setting people get wrong
 * once and never trust again.
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
 * A name matches ANY segment — `node_modules` has to hit at every depth, which
 * is the only useful reading for a dependency tree. A path matches the LEADING
 * segments, so naming a directory takes the whole tree beneath it, and naming a
 * file takes that file.
 *
 * The prefix is compared segment by segment rather than as a string, so `src/app`
 * does not also take `src/application`. The one-line string test is a trap that
 * surfaces only on the repository that happens to have both.
 */
export function matchesExclude(path: string, excludes: ExcludeSet): boolean {
  const segments = path.split('/')
  if (segments.some((segment) => excludes.names.has(segment))) return true
  return excludes.paths.some(
    (prefix) => prefix.length <= segments.length && prefix.every((seg, i) => segments[i] === seg),
  )
}

/**
 * The walk prunes on BOTH kinds, rather than listing everything and filtering
 * after. An excluded directory is the expensive case — `node_modules` is most
 * of the files on the disk — and descending into one to throw its contents away
 * is the cost this walk exists to avoid.
 */
async function walkFiles(root: string, excludes: ExcludeSet): Promise<string[]> {
  const out: string[] = []
  async function walk(dir: string): Promise<void> {
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const full = join(dir, entry.name)
      const rel = relative(root, full).split(sep).join('/')
      if (matchesExclude(rel, excludes)) continue
      // Symlinks are not followed: a link into a parent directory turns the
      // walk into an infinite one, and a link out of the tree reports files
      // that are not this project's.
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory()) await walk(full)
      else if (entry.isFile()) out.push(rel)
    }
  }
  await walk(root)
  return out
}

/** A memoized file lister for one root: every file once, then filtered per pattern. */
export interface Lister {
  (pattern: string): Promise<string[]>
  /** Every file discovery found, root-relative. */
  all(): Promise<string[]>
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
): Lister {
  const excludes = normalizeExcludes(
    useBuiltinExcludes ? [...DEFAULT_EXCLUDES, ...extraExcludes] : extraExcludes,
  )
  let all: Promise<string[]> | null = null
  // The exclusions apply to both strategies, so the two modes agree about a
  // `fixtures/` tree whether or not the root is a repository.
  const list = (): Promise<string[]> =>
    (all ??= (mode === 'git' ? gitFiles(root, git) : walkFiles(root, excludes)).then((files) =>
      files.filter((f) => !matchesExclude(f, excludes)),
    ))

  const lister = async (pattern: string): Promise<string[]> => {
    const compiled = compilePattern(pattern)
    return (await list()).filter((f) => compiled.base(f) !== null)
  }
  return Object.assign(lister, { all: list })
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
