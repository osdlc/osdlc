/**
 * The sweep itself: one repository, or many.
 *
 * Every item carries the command that would act on it, and running that
 * command is the caller's decision. The only write is the optional fetch,
 * which updates remote-tracking refs and nothing else.
 */

import { Git } from '@osdlc/typed-git'
import { Gh } from '@osdlc/typed-gh'
import type { CommandRunner } from '@osdlc/command-seam'

import { gatherLocalBranches, gatherRemoteBranches } from './branches.ts'
import { DiscoveryFailed, discoverRepo } from './discover.ts'
import { fetchPrs } from './prs.ts'
import { resolveEntries } from './resolve.ts'
import {
  ALL_SCOPES,
  findDuplicateCheckouts,
  type RepoSweep,
  type Scope,
  type SweepItem,
  type SweepResult,
} from './types.ts'
import { gatherWorktrees } from './worktrees.ts'

export interface SweepOptions {
  /** Which categories to gather. Defaults to all of them. */
  scope?: Iterable<Scope | string>
  /** Remote to measure against. Defaults to `origin`, then the first one. */
  remote?: string | null
  /** Skip `gh` entirely and classify on git evidence alone. */
  noGh?: boolean
  /**
   * Run `git fetch --prune <remote>` before classifying, so ancestry is read
   * against fresh remote-tracking refs. A failed fetch makes the repository
   * an error row. Off by default.
   */
  fetch?: boolean
  /**
   * Where the caller is standing. A worktree containing it is never proposed
   * for removal. Defaults to the process's cwd.
   */
  cwd?: string
  /**
   * Inventory one branch only: the worktree holding it, its local branch and
   * its remote branch. The default branch is refused. `cwd` is ignored, so the
   * worktree is judged on its facts, and the local branch is not pinned for
   * being checked out there: apply removes the worktree first. It stays pinned
   * when that worktree is blocked or cannot be removed.
   */
  branch?: string | undefined
  /** Injected runners. Defaults spawn the real `git` and `gh`. */
  git?: CommandRunner | undefined
  gh?: CommandRunner | undefined
}

function scopeSet(scope: SweepOptions['scope']): Set<string> {
  return new Set<string>(scope === undefined ? ALL_SCOPES : [...scope])
}

function clients(path: string, opts: SweepOptions): { git: Git; gh: Gh } {
  return {
    git: new Git(path, { runner: opts.git }),
    gh: new Gh(path, { runner: opts.gh }),
  }
}

/**
 * Inventory one repository.
 *
 * Never throws for a repository that cannot be read: the failure is returned
 * as `error`, because a fan-out must not end on its first bad entry. A
 * single-repository caller checks that field.
 */
export function sweepRepo(path: string, opts: SweepOptions = {}): RepoSweep {
  const scope = scopeSet(opts.scope)
  const { git, gh } = clients(path, opts)
  const only = opts.branch

  let repo
  try {
    repo = discoverRepo(path, {
      remote: opts.remote ?? null,
      allowGh: opts.noGh !== true,
      git,
      gh,
    })
  } catch (err) {
    if (err instanceof DiscoveryFailed) return { repo: null, path, items: [], error: err.message }
    return { repo: null, path, items: [], error: err instanceof Error ? err.message : String(err) }
  }

  if (only === repo.mainBranch) {
    return { repo, path, items: [], error: `refusing to clean up the default branch \`${only}\`` }
  }
  const cwd = only === undefined ? (opts.cwd ?? process.cwd()) : repo.root

  if (opts.fetch === true && repo.remote !== null) {
    const fetched = git
      .at(repo.root)
      .try.fetch(repo.remote, undefined, { prune: true, quiet: true, noWriteFetchHead: true })
    if (!fetched.ok) {
      return {
        repo,
        path,
        items: [],
        error: `fetch failed: ${fetched.error.detail || fetched.error.message}`,
      }
    }
    repo = { ...repo, fetched: true }
  }

  try {
    const prs = fetchPrs(repo, gh, only)
    const items: SweepItem[] = []

    // Worktrees are gathered whenever local branches are, even if they are not
    // reported: a branch checked out in one must not be judged on its own.
    let worktreeItems: SweepItem[] = []
    let worktreeBranches = new Set<string>()
    if (scope.has('worktrees') || scope.has('local-branches')) {
      ;[worktreeItems, worktreeBranches] = gatherWorktrees(repo, prs, cwd, git, only)
    }
    if (scope.has('worktrees')) items.push(...worktreeItems)

    let localBranchNames = new Set<string>()
    if (scope.has('local-branches') || scope.has('remote-branches')) {
      const pinned =
        only === undefined
          ? worktreeBranches
          : new Set(
              worktreeItems
                .filter((item) => !item.deletable)
                .map((item) => String(item.facts['branch'])),
            )
      const localItems = gatherLocalBranches(repo, prs, pinned, git, only)
      localBranchNames = new Set(localItems.map((item) => item.id))
      if (scope.has('local-branches')) items.push(...localItems)
    }

    if (scope.has('remote-branches')) {
      items.push(...gatherRemoteBranches(repo, prs, localBranchNames, git, only))
    }

    return { repo, path, items, error: null }
  } catch (err) {
    return {
      repo,
      path,
      items: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export interface SweepReposOptions extends SweepOptions {
  /** Base for a relative entry. Defaults to the process's cwd. */
  baseDir?: string
  /** Told, mid-walk, that a container entry is enormous. Defaults to stderr. */
  onWarn?: ((message: string) => void) | undefined
}

/**
 * Resolve `entries` and inventory every repository they name.
 *
 * Entries may be checkouts or directories containing checkouts; see
 * {@link resolveEntries}. A repository that fails discovery becomes an error
 * row and the sweep continues.
 */
export function sweepRepos(entries: readonly string[], opts: SweepReposOptions = {}): SweepResult {
  const probe = new Git(opts.baseDir ?? process.cwd(), { runner: opts.git })
  const resolution = resolveEntries(entries, {
    git: probe,
    ...(opts.baseDir === undefined ? {} : { baseDir: opts.baseDir }),
    ...(opts.onWarn === undefined ? {} : { onWarn: opts.onWarn }),
  })
  const repos = resolution.repos.map((root) => sweepRepo(root, opts))
  return {
    repos,
    unresolved: resolution.unresolved,
    scan: resolution.scan,
    duplicates: findDuplicateCheckouts(repos.map((sweep) => sweep.repo)),
  }
}
