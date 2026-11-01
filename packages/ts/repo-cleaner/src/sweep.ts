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

import { HELD_BY_WORKTREE, gatherLocalBranches, gatherRemoteBranches } from './branches.ts'
import { DiscoveryFailed, discoverRepo } from './discover.ts'
import { defaultProcessProbe, type ProcessProbe } from './processes.ts'
import { fetchPrs } from './prs.ts'
import { providers, type ProviderChoice } from './providers/index.ts'
import { resolveEntries } from './resolve.ts'
import {
  ALL_SCOPES,
  findDuplicateCheckouts,
  type PRInfo,
  type RepoSweep,
  type Scope,
  type SweepItem,
  type SweepProgress,
  type SweepResult,
} from './types.ts'
import { gatherWorktrees } from './worktrees.ts'

export interface SweepOptions {
  /** Which categories to gather. Defaults to all of them. */
  scope?: Iterable<Scope | string>
  /** Remote to measure against. Defaults to `origin`, then the first one. */
  remote?: string | null
  /** Ask no provider and classify on git evidence alone. Same as `provider: 'none'`, and wins over it. */
  noProvider?: boolean
  /**
   * Which provider to ask for pull requests: `github` (`gh`), `gitlab`
   * (`glab`), `none`, or `auto`, which reads the remote's host. Defaults to `auto`.
   */
  provider?: ProviderChoice | undefined
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
   * when that worktree is blocked or cannot be removed, or when `scope` leaves
   * worktrees out.
   */
  branch?: string | undefined
  /** Injected runners. Defaults spawn the real `git`, `gh` and `glab`. */
  git?: CommandRunner | undefined
  gh?: CommandRunner | undefined
  glab?: CommandRunner | undefined
  /**
   * Answers whether a worktree lock's owner is alive and which processes work
   * inside a worktree. Defaults to {@link defaultProcessProbe}, one per
   * repository, over `ps` and `lsof`.
   */
  probe?: ProcessProbe | undefined
  /** Told before each step, and before each item of a step that walks many. For a status line. */
  onProgress?: ((progress: SweepProgress) => void) | undefined
  /** Where this repository sits in a run of several, for {@link onProgress}. Defaults to 1 of 1. */
  position?: { index: number; of: number } | undefined
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
  const known = providers({ gh, glab: opts.glab })
  const only = opts.branch
  const at = opts.position ?? { index: 1, of: 1 }
  const report = (
    step: SweepProgress['step'],
    done?: number,
    total?: number,
    tool?: string,
  ): void =>
    opts.onProgress?.({
      repo: path,
      ...at,
      step,
      ...(done === undefined || total === undefined ? {} : { done, total }),
      ...(tool === undefined ? {} : { tool }),
    })
  const ticker =
    (step: SweepProgress['step']) =>
    (done: number, total: number): void =>
      report(step, done, total)

  report('discover')
  let repo
  try {
    repo = discoverRepo(path, {
      remote: opts.remote ?? null,
      allowProvider: opts.noProvider !== true,
      provider: opts.provider,
      git,
      gh,
      providers: known,
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
    report('fetch')
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
    const status = repo.provider ?? null
    if (status?.authenticated === true) report('prs', undefined, undefined, status.tool)
    const prs =
      status === null ? new Map<string, PRInfo>() : fetchPrs(repo, known[status.name], only)
    const items: SweepItem[] = []

    // Worktrees are gathered whenever local branches are, even if they are not
    // reported: a branch checked out in one must not be judged on its own.
    let worktreeItems: SweepItem[] = []
    let worktreeBranches = new Set<string>()
    if (scope.has('worktrees') || scope.has('local-branches')) {
      ;[worktreeItems, worktreeBranches] = gatherWorktrees(
        repo,
        prs,
        cwd,
        git,
        only,
        opts.probe ?? defaultProcessProbe(),
        ticker('worktrees'),
      )
    }
    if (scope.has('worktrees')) items.push(...worktreeItems)

    let localBranchNames = new Set<string>()
    if (scope.has('local-branches') || scope.has('remote-branches')) {
      // A branch whose worktree goes in the same plan is judged on its own:
      // apply removes worktrees before it deletes branches. A full sweep frees
      // the branch of a safe-to-delete worktree; a branch-scoped sweep frees
      // the named branch when its worktree is deletable at all.
      const freed = new Map<string, string>()
      if (scope.has('worktrees')) {
        for (const item of worktreeItems) {
          const branch = item.facts['branch']
          if (freesBranch(item, only !== undefined) && typeof branch === 'string') {
            freed.set(branch, item.id)
          }
        }
      }
      const pinned = new Set([...worktreeBranches].filter((name) => !freed.has(name)))
      const localItems = gatherLocalBranches(repo, prs, pinned, git, only, ticker('local-branches'))
      // Apply drops a freed branch unless the same run removes its worktree.
      for (const item of localItems) {
        const worktree = freed.get(item.id)
        if (worktree !== undefined) item.facts['worktree'] = worktree
      }
      localBranchNames = new Set(localItems.map((item) => item.id))
      if (scope.has('local-branches')) items.push(...localItems)
    }

    if (scope.has('remote-branches')) {
      items.push(
        ...gatherRemoteBranches(repo, prs, localBranchNames, git, only, ticker('remote-branches')),
      )
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
  const of = resolution.repos.length
  const repos = resolution.repos.map((root, i) =>
    sweepRepo(root, { ...opts, position: { index: i + 1, of } }),
  )
  return {
    repos,
    unresolved: resolution.unresolved,
    scan: resolution.scan,
    duplicates: findDuplicateCheckouts(repos.map((sweep) => sweep.repo)),
  }
}

/**
 * Whether worktree row `item` frees its branch to be judged on its own. A full
 * sweep frees it only for a safe-to-delete worktree; a branch-scoped sweep,
 * where the caller named the branch, for any deletable one.
 */
function freesBranch(item: SweepItem, branchScoped: boolean): boolean {
  return item.deletable && (branchScoped || item.classification === 'safe-to-delete')
}

/**
 * Keep again each branch a sweep freed for its worktree's removal when that
 * worktree no longer frees it by the sweep's own rule: a host's `annotate`
 * held it back or demoted it, or dropped its row. Run it on annotated rows,
 * with `branchScoped` set for a `branch` sweep, so the counts and the plan
 * match what `applyPlan` will do. Running it twice changes nothing.
 */
export function holdFreedBranches(
  items: SweepItem[],
  opts: { branchScoped?: boolean } = {},
): SweepItem[] {
  const going = new Set(
    items
      .filter((it) => it.category === 'worktree' && freesBranch(it, opts.branchScoped === true))
      .map((it) => it.id),
  )
  return items.map((item) => {
    const worktree = item.facts['worktree']
    if (item.category !== 'local_branch' || typeof worktree !== 'string') return item
    if (going.has(worktree)) return item
    const { worktree: _, ...facts } = item.facts
    return {
      ...item,
      classification: 'safe-to-keep',
      action: 'keep',
      reason: HELD_BY_WORKTREE,
      facts,
      commands: [],
      investigationParts: [],
      requires: [],
      deletable: false,
    }
  })
}
