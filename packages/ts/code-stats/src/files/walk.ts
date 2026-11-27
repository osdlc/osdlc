import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'

import ignore, { type Ignore } from 'ignore'

import { isWithin } from '../paths.ts'

/** Never counted, as a directory or a file: version-control metadata and installed packages. */
export const SKIPPED_DIRECTORIES: readonly string[] = ['.git', '.hg', '.svn', '.jj', 'node_modules']

interface Scope {
  /** The directory the rules apply under, relative to the root; `''` is the root. */
  base: string
  rules: Ignore
}

function readText(file: string): string | null {
  try {
    return readFileSync(file, 'utf8')
  } catch {
    return null
  }
}

/**
 * The git directory whose `info/exclude` and `info/attributes` apply at
 * `root`: `.git` itself, or for a worktree, whose `.git` is a file naming its
 * own git directory, the common directory that one points to.
 */
export function gitDirOf(root: string): string | null {
  const dotGit = join(root, '.git')
  const link = readText(dotGit)
  if (link === null) return existsSync(dotGit) ? dotGit : null
  const gitDir = /^gitdir: (.+)$/m.exec(link)?.[1]?.trim()
  if (gitDir === undefined) return null
  const own = resolve(root, gitDir)
  const common = readText(join(own, 'commondir'))?.trim()
  return common === undefined ? own : resolve(own, common)
}

/** `.gitignore` in `dir`, and at the root also the git directory's `info/exclude`, which git reads first. */
function scopesAt(root: string, dir: string): Scope[] {
  const gitDir = dir === '' ? gitDirOf(root) : null
  const texts = [
    gitDir === null ? null : readText(join(gitDir, 'info', 'exclude')),
    readText(join(root, dir, '.gitignore')),
  ].filter((t) => t !== null)
  if (texts.length === 0) return []
  // `add` splits a string on newlines, so each file's text is added whole.
  const rules = ignore()
  for (const text of texts) rules.add(text)
  return [{ base: dir, rules }]
}

/** Git's rule: the last pattern that matches decides, deeper files after shallower ones. */
function ignored(scopes: readonly Scope[], path: string, isDir: boolean): boolean {
  let out = false
  for (const s of scopes) {
    const rel = s.base === '' ? path : path.slice(s.base.length + 1)
    const test = s.rules.test(isDir ? `${rel}/` : rel)
    if (test.ignored) out = true
    else if (test.unignored) out = false
  }
  return out
}

/** Whether `dir` holds, or lies inside, one of `paths`; true for every directory when `paths` is empty. */
function wanted(dir: string, paths: readonly string[]): boolean {
  if (paths.length === 0) return true
  return paths.some((p) => isWithin(p, dir) || isWithin(dir, p))
}

function within(file: string, paths: readonly string[]): boolean {
  return paths.length === 0 || paths.some((p) => isWithin(file, p))
}

/**
 * The regular files under `root`, as `/`-separated paths relative to it, in
 * order: those under `paths` when any are given, without those a
 * `.gitignore` on the way down (or `.git/info/exclude`) leaves out, and
 * never inside {@link SKIPPED_DIRECTORIES}. Symlinks are not followed and not
 * listed, matching `listTree`, which counts a commit's regular files only. With
 * `inRepository`, a directory holding its own `.git` (a submodule or a nested
 * repository) is left out as well, since git lists none of its files.
 */
export function listFiles(
  root: string,
  paths: readonly string[] = [],
  inRepository = false,
): string[] {
  const out: string[] = []
  const walk = (dir: string, scopes: readonly Scope[]) => {
    const inScope = [...scopes, ...scopesAt(root, dir)]
    const entries = readdirSync(join(root, dir), { withFileTypes: true }).sort((a, b) =>
      a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
    )
    for (const entry of entries) {
      const path = dir === '' ? entry.name : `${dir}/${entry.name}`
      if (SKIPPED_DIRECTORIES.includes(entry.name)) continue
      if (entry.isDirectory()) {
        if (!wanted(path, paths)) continue
        if (inRepository && existsSync(join(root, path, '.git'))) continue
        if (!ignored(inScope, path, true)) walk(path, inScope)
      } else if (entry.isFile() && within(path, paths) && !ignored(inScope, path, false)) {
        out.push(path)
      }
    }
  }
  if (statSync(root).isDirectory()) walk('', [])
  return out
}
