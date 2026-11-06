/**
 * Submodules: what removing a worktree would take with them.
 *
 * A linked worktree's submodules keep their git dirs under the worktree's own
 * git dir (`<common>/worktrees/<id>/modules/<name>`), not the shared one. So
 * `git worktree remove --force` and `git worktree prune` delete each
 * submodule's history with the worktree: a commit made in a submodule and
 * never pushed, a local branch, a stash. Plain `git worktree remove` refuses
 * any worktree with a checked-out submodule, or with a submodule git dir left
 * behind (a `git submodule deinit` leaves one), whatever state it is in, so
 * removing one at all needs `--force`, which also skips git's own check for
 * modified and untracked files.
 *
 * {@link inspectSubmodules} reads every submodule, nested ones included, and
 * every left-over git dir, and reports what each holds that removal would
 * lose. The sweep turns that into blockers and authorizations; `applyPlan`
 * reads it again just before a forced remove and refuses if anything changed.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, isAbsolute, join, resolve } from 'node:path'

import type { Git } from '@osdlc/typed-git'

/** One submodule of a worktree, or a submodule git dir it keeps, and what removing the worktree would lose from it. */
export interface Submodule {
  /**
   * The path from the worktree root, `/`-separated, a nested submodule's
   * through its parents (`deps/lib/inner`). For a git dir no checkout uses,
   * its name under `modules/`, nested names joined the same way.
   */
  path: string
  /** The commit the enclosing repository's index records; null for a git dir no checkout uses. */
  recorded: string | null
  /** Checked out: its directory holds a `.git`. */
  populated: boolean
  /** The commit checked out; null when not populated or unreadable. */
  head: string | null
  /** Its git dir, absolute; null when it has none (never initialized, or initialized elsewhere). */
  gitDir: string | null
  /** `git status --porcelain` lines inside it, a nested submodule's change included. */
  dirtyFiles: number
  /** Commits on HEAD or a local branch that no remote-tracking ref holds. */
  unpushedCommits: number
  /** Stash entries. A linked worktree's submodule stashes live in its private git dir. */
  stashes: number
  /** Files marked skip-worktree or assume-unchanged, whose edits status hides. Capped at 10. */
  hiddenIndexPaths: string[]
  /** Untracked or ignored directories inside it that hold a repository of their own. */
  nestedRepositories: string[]
  /** Why it could not be read; null when it was. An unreadable submodule could hold anything. */
  error: string | null
}

/** Everything {@link inspectSubmodules} found in one worktree. */
export interface SubmoduleReport {
  /** Every submodule, nested ones after their parent, then every left-over git dir. */
  submodules: Submodule[]
  /**
   * True when plain `git worktree remove` refuses this worktree: a submodule
   * is checked out, or the worktree's git dir keeps a `modules/` directory.
   * Removing it then takes `--force`.
   */
  forceRequired: boolean
  /** Submodules with modified, staged or untracked files. Removal discards them. */
  dirty: Submodule[]
  /** Submodules holding commits or stashes no remote has. Removal deletes them. */
  unpushed: Submodule[]
  /** Submodules that could not be read, so nobody can say they are safe to lose. */
  unreadable: Submodule[]
}

/** Cap on {@link Submodule.hiddenIndexPaths}. */
const HIDDEN_PATHS_SHOWN = 10

function isDir(path: string): boolean {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

const message = (err: unknown): string => (err instanceof Error ? err.message : String(err))

/** A repository's git dir: `HEAD` and `objects` side by side. */
const isGitDir = (dir: string): boolean =>
  existsSync(join(dir, 'HEAD')) && isDir(join(dir, 'objects'))

/**
 * The private git dir of the linked worktree at `worktree`, found by reading
 * each `<commonDir>/worktrees/<id>/gitdir`; null when none points at it. Works
 * for a worktree whose directory is gone, where `rev-parse` has nothing to
 * run in.
 */
export function worktreeGitDir(commonDir: string, worktree: string): string | null {
  const admin = join(commonDir, 'worktrees')
  let ids: string[]
  try {
    ids = readdirSync(admin)
  } catch {
    return null
  }
  const want = resolve(worktree)
  for (const id of ids) {
    try {
      const pointer = readFileSync(join(admin, id, 'gitdir'), 'utf-8').trim()
      if (resolve(dirname(isAbsolute(pointer) ? pointer : join(admin, id, pointer))) === want) {
        return join(admin, id)
      }
    } catch {
      // Not a worktree's admin dir, or one being written; not ours either way.
    }
  }
  return null
}

/** Every git dir under `modules`, a nested submodule's (`<name>/modules/<name>`) included. */
function moduleGitDirs(modules: string, prefix = ''): { name: string; dir: string }[] {
  let entries: string[]
  try {
    entries = readdirSync(modules)
  } catch {
    return []
  }
  const out: { name: string; dir: string }[] = []
  for (const entry of entries.sort()) {
    const dir = join(modules, entry)
    if (!isDir(dir)) continue
    const name = prefix === '' ? entry : `${prefix}/${entry}`
    if (isGitDir(dir)) {
      out.push({ name, dir }, ...moduleGitDirs(join(dir, 'modules'), name))
    } else {
      // A submodule name may hold slashes: `modules/vendor/lib`.
      out.push(...moduleGitDirs(dir, name))
    }
  }
  return out
}

/** A `rev-list --count` argv's answer, exit code checked. */
function count(git: Git, argv: string[]): number {
  const out = git.rawChecked(argv).stdout.trim()
  const n = Number(out)
  if (!Number.isInteger(n)) throw new Error(`rev-list printed ${JSON.stringify(out)}`)
  return n
}

/**
 * Commits on HEAD or a local branch that no remote-tracking ref has, and the
 * stash's entries. `prefix` goes before each git command: `--git-dir` and
 * `--work-tree` for a git dir with no checkout.
 */
function unsharedWork(git: Git, prefix: string[]): { unpushedCommits: number; stashes: number } {
  // An unborn HEAD (a git dir whose clone never finished) has no commits of its own.
  const hasHead = git.raw([...prefix, 'rev-parse', '--verify', '--quiet', 'HEAD']).exitCode === 0
  const tips = [...(hasHead ? ['HEAD'] : []), '--branches']
  return {
    unpushedCommits: count(git, [...prefix, 'rev-list', '--count', ...tips, '--not', '--remotes']),
    stashes: stashCount(git, prefix),
  }
}

/** Entries in `refs/stash`'s reflog: one per `git stash list` line. */
function stashCount(git: Git, prefix: string[]): number {
  const listed = git.raw([...prefix, 'reflog', 'show', '--format=%H', 'refs/stash', '--'])
  // No stash: the ref does not exist and git exits non-zero.
  if (listed.exitCode !== 0) return 0
  return listed.stdout.split('\n').filter((line) => line.trim() !== '').length
}

function blank(path: string, recorded: string | null): Submodule {
  return {
    path,
    recorded,
    populated: false,
    head: null,
    gitDir: null,
    dirtyFiles: 0,
    unpushedCommits: 0,
    stashes: 0,
    hiddenIndexPaths: [],
    nestedRepositories: [],
    error: null,
  }
}

/** Read the checked-out submodule at `dir`, then its own submodules. */
function readCheckout(git: Git, dir: string, entry: Submodule, out: Submodule[]): void {
  const at = git.at(dir)
  out.push(entry)
  try {
    entry.head = at.resolveRef('HEAD')
    entry.gitDir = at.gitDir()
    entry.dirtyFiles = at.statusPorcelain().length
    const work = unsharedWork(at, [])
    entry.unpushedCommits = work.unpushedCommits
    entry.stashes = work.stashes
    entry.hiddenIndexPaths = at
      .lsFilesTagged()
      .filter((row) => row.tag === 'S' || row.tag !== row.tag.toUpperCase())
      .map((row) => row.path)
      .slice(0, HIDDEN_PATHS_SHOWN)
    entry.nestedRepositories = at
      .lsFiles({ others: true, directory: true })
      .filter((p) => p.endsWith('/') && existsSync(join(dir, p, '.git')))
    for (const child of at.submodules()) {
      readSubmodule(git, dir, `${entry.path}/${child.path}`, child.path, child.commit, out)
    }
  } catch (err) {
    entry.error = message(err)
  }
}

function readSubmodule(
  git: Git,
  parentDir: string,
  label: string,
  path: string,
  recorded: string,
  out: Submodule[],
): void {
  const dir = join(parentDir, ...path.split('/'))
  const entry = blank(label, recorded)
  if (!existsSync(join(dir, '.git'))) {
    out.push(entry)
    return
  }
  entry.populated = true
  readCheckout(git, dir, entry, out)
}

/**
 * Every submodule of the worktree at `worktree`, nested ones included, and
 * every submodule git dir its private git dir keeps that no checkout uses.
 *
 * `gitDir` is the worktree's private git dir. Without it, it is asked of git
 * when the directory is there, and nothing beyond the checkouts is read when
 * it is not. A worktree whose directory is gone has no checkouts to read, but
 * its git dir may still hold submodule history: pass {@link worktreeGitDir}.
 *
 * Never throws for a submodule it cannot read: that submodule comes back with
 * `error` set, and in `unreadable`.
 */
export function inspectSubmodules(
  git: Git,
  worktree: string,
  opts: { gitDir?: string | null | undefined } = {},
): SubmoduleReport {
  const out: Submodule[] = []
  const onDisk = existsSync(join(worktree, '.git'))
  let gitDir = opts.gitDir ?? null
  let topError: string | null = null
  if (onDisk) {
    const at = git.at(worktree)
    try {
      gitDir ??= at.gitDir()
      for (const sub of at.submodules()) {
        readSubmodule(git, worktree, sub.path, sub.path, sub.commit, out)
      }
    } catch (err) {
      topError = message(err)
    }
  }

  // A git dir under `modules/` that no checkout above uses: a deinit leaves
  // one, and so does a worktree whose directory was deleted. Its history goes
  // with the worktree's git dir all the same.
  const modules = gitDir === null ? null : join(gitDir, 'modules')
  const used = out.flatMap((s) => (s.gitDir === null ? [] : [resolve(s.gitDir)]))
  if (modules !== null && isDir(modules)) {
    for (const { name, dir } of moduleGitDirs(modules)) {
      if (used.includes(resolve(dir))) continue
      const entry = blank(name, null)
      entry.gitDir = dir
      try {
        // `--work-tree`: the git dir's `core.worktree` may name a directory
        // that is gone, and git would fail to enter it. These reads never
        // touch a working tree, so the git dir itself stands in.
        const work = unsharedWork(git, [`--git-dir=${dir}`, `--work-tree=${dir}`])
        entry.unpushedCommits = work.unpushedCommits
        entry.stashes = work.stashes
      } catch (err) {
        entry.error = message(err)
      }
      out.push(entry)
    }
  }
  if (topError !== null) out.unshift({ ...blank('.', null), error: topError })

  return {
    submodules: out,
    forceRequired: out.some((s) => s.populated) || (modules !== null && isDir(modules)),
    dirty: out.filter((s) => s.dirtyFiles > 0),
    unpushed: out.filter((s) => s.unpushedCommits > 0 || s.stashes > 0),
    unreadable: out.filter((s) => s.error !== null),
  }
}

/** The report as `facts.submodules`: snake_case, for JSON output and the plan fingerprint. */
export function submoduleFacts(report: SubmoduleReport): Record<string, unknown>[] {
  return report.submodules.map((s) => ({
    path: s.path,
    populated: s.populated,
    head: s.head,
    recorded: s.recorded,
    dirty_files: s.dirtyFiles,
    unpushed_commits: s.unpushedCommits,
    stashes: s.stashes,
    ...(s.error === null ? {} : { error: s.error }),
  }))
}

/**
 * Why a forced remove of a worktree with this report would lose something,
 * one sentence each; empty when it would lose nothing. `discard` accepts
 * modified and untracked files (the `discard-changes` grant). Commits, stashes
 * and an unreadable submodule are never accepted: no grant covers them.
 */
export function submoduleHazards(
  report: SubmoduleReport,
  opts: { discard?: boolean } = {},
): string[] {
  const out: string[] = []
  const names = (subs: Submodule[]): string => subs.map((s) => s.path).join(', ')
  if (report.unreadable.length > 0) {
    out.push(
      `could not read submodule(s) ${report.unreadable.map((s) => `${s.path} (${s.error})`).join(', ')}`,
    )
  }
  if (report.unpushed.length > 0) {
    out.push(
      `submodule(s) ${report.unpushed
        .map((s) => `${s.path} (${unsharedPhrase(s)})`)
        .join(', ')} hold work no remote has`,
    )
  }
  const hidden = report.submodules.filter((s) => s.hiddenIndexPaths.length > 0)
  if (hidden.length > 0) out.push(`submodule(s) ${names(hidden)} hide edits behind index flags`)
  const nested = report.submodules.filter((s) => s.nestedRepositories.length > 0)
  if (nested.length > 0) out.push(`submodule(s) ${names(nested)} hold nested repositories`)
  if (opts.discard !== true && report.dirty.length > 0) {
    out.push(`submodule(s) ${names(report.dirty)} have uncommitted changes`)
  }
  return out
}

/** `2 unpushed commits, 1 stash`. */
export function unsharedPhrase(s: Pick<Submodule, 'unpushedCommits' | 'stashes'>): string {
  const parts: string[] = []
  if (s.unpushedCommits > 0) {
    parts.push(`${s.unpushedCommits} unpushed commit${s.unpushedCommits === 1 ? '' : 's'}`)
  }
  if (s.stashes > 0) parts.push(`${s.stashes} stash${s.stashes === 1 ? '' : 'es'}`)
  return parts.join(', ')
}
