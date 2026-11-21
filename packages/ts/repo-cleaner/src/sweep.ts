/**
 * The sweep: resolve the targets, then inventory every repository they name.
 *
 * Every row carries the commands that would act on it, and running them is
 * the caller's decision. The only write is the fetch a sweep of remote
 * branches makes, which updates remote-tracking refs and nothing else, and the
 * clone a remote URL target is swept through.
 */

import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'

import type { CommandRunner } from '@osdlc/command-seam'
import { Git, checkoutRoot } from '@osdlc/typed-git'
import { Gh } from '@osdlc/typed-gh'

import { HELD_BY_WORKTREE, gatherLocalBranches, gatherRemoteBranches } from './branches.ts'
import { discoverRepo, resolveRemoteDefaults } from './discover.ts'
import type { Annotate } from './hooks.ts'
import { defaultProcessProbe, type ProcessProbe } from './processes.ts'
import { lookupPrs, prsUnchecked } from './prs.ts'
import { providers, type ProviderChoice } from './providers/index.ts'
import type { ProviderStatus } from './providers/types.ts'
import { defaultCacheDir, ensureMirror, redactUrl } from './remote-mirror.ts'
import { sizeOf } from './size.ts'
import { resolveEntries, type Resolution } from './resolve.ts'
import { sweptWith } from './scope.ts'
import {
  RepoCleanerError,
  judgedRemotes,
  countRows,
  emptyScan,
  reclaimableOf,
  findDuplicateCheckouts,
  type Kind,
  type PRInfo,
  type RepoInfo,
  type Reclaimable,
  type RepoSweep,
  type Row,
  type Sweep,
  type SweepProgress,
  type WorktreeRow,
} from './types.ts'
import { errorText, isDir } from './util.ts'
import { gatherWorktrees } from './worktrees.ts'

/** Runners and the process probe: what a test or a host injects. */
export interface Runners {
  /** Defaults spawn the real `git`, `gh` and `glab`. */
  git?: CommandRunner | undefined
  gh?: CommandRunner | undefined
  glab?: CommandRunner | undefined
  /**
   * Answers whether a worktree lock's owner is alive and which processes work
   * inside a worktree. Defaults to {@link defaultProcessProbe}, over `ps` and
   * `lsof`.
   */
  probe?: ProcessProbe | undefined
  /**
   * Runs `du`: for `sizes`, and for each worktree `run` removes. Default
   * spawns the real one.
   */
  du?: CommandRunner | undefined
}

export interface SweepOptions extends Runners {
  /**
   * Only these kinds of row. Default: `worktree` and `branch`, and `remote`
   * with `remotes`. Naming `remote` alone judges the default remote's branches.
   */
  only?: readonly Kind[] | undefined
  /**
   * Also judge these remotes' branches: a name, `''` for the default remote,
   * `*` for every remote. Each is fetched first, and its pull requests looked
   * up.
   */
  remotes?: readonly string[] | undefined
  /** Fetch the default remote before judging local rows. Remote rows fetch their remotes anyway. */
  fetch?: boolean | undefined
  /** With `remotes`: do not fetch; judge against the remote-tracking refs on disk. */
  offline?: boolean | undefined
  /**
   * Judge every row against this remote's default branch, as a fork against
   * its parent. Without it, a remote's branches are judged against its own
   * default branch, and local rows against the default remote's.
   */
  against?: string | undefined
  /** With `remotes`: where pull requests come from. Default `auto`, by each remote's host. */
  provider?: ProviderChoice | undefined
  /**
   * One branch only: its worktree, its local branch, and its remote branches
   * with `remotes`. `HEAD` is the branch checked out at the target. Takes at
   * most one target, no remote URL, and never the default branch.
   */
  branch?: string | undefined
  /**
   * Where the caller is standing: the base for relative targets, the target
   * when none is given, and a worktree that is never offered for removal.
   * Defaults to the process's cwd.
   */
  cwd?: string | undefined
  /** Where remote URL targets' clones are kept. Defaults to {@link defaultCacheDir}. */
  cacheDir?: string | undefined
  /**
   * Read each on-disk worktree's size into `evidence.sizeBytes`, rank rows
   * largest first, and total what the `delete` and `review` rows free. Off by
   * default: it reads every file under every worktree. Not part of a plan.
   */
  sizes?: boolean | undefined
  /** How long one worktree's size may take, in ms. Defaults to {@link sizeOf}'s cap. */
  sizeTimeoutMs?: number | undefined
  /** A host's re-ranking of each repository's rows. */
  annotate?: Annotate | undefined
  /** Told before each step, and before each row of a step that walks many. For a status line. */
  onProgress?: ((progress: SweepProgress) => void) | undefined
  /** Told, mid-walk, that a target directory is enormous. Defaults to stderr. */
  onWarn?: ((message: string) => void) | undefined
}

/**
 * Whether the checkout `dir` is in tracks any file under it. True as well when
 * git cannot say: then widening to that checkout reports why it cannot be
 * read, which says more than "no git checkouts under it".
 */
function tracksFilesIn(dir: string, git: Git): boolean {
  const listed = git.at(dir).try.lsFiles({ cached: true })
  return !listed.ok || listed.value.length > 0
}

/**
 * Sweep `targets`: checkouts, directories to search for checkouts, or remote
 * URLs (swept through a clone kept in `cacheDir`, remote branches only). No
 * targets means `[cwd]`, resolved the same way, except that a `cwd` where the
 * search finds no checkout, and whose checkout tracks files in it, sweeps
 * that checkout.
 *
 * Never throws for a repository it cannot read: that one comes back with
 * `error` set, because a fan-out must not end on its first bad entry. Throws a
 * {@link RepoCleanerError} for options that contradict each other, before
 * reading anything.
 */
export function sweep(targets: readonly string[], opts: SweepOptions = {}): Sweep {
  const cwd = opts.cwd ?? process.cwd()
  const { urls, ...options } = sweptWith(targets, opts)
  const branch = options.branch ?? undefined

  const failed: RepoSweep[] = []
  let entries: string[] = targets.length > 0 ? [...targets] : [cwd]
  if (urls) {
    const cache = opts.cacheDir ?? defaultCacheDir()
    entries = []
    for (const url of targets) {
      try {
        entries.push(ensureMirror(url, cache, { git: opts.git }))
      } catch (err) {
        failed.push(errorSweep(redactUrl(url), err))
      }
    }
  }
  const resolveOpts = {
    git: new Git(cwd, { runner: opts.git }),
    baseDir: cwd,
    ...(opts.onWarn === undefined ? {} : { onWarn: opts.onWarn }),
  }
  let resolution: Resolution =
    entries.length === 0
      ? { repos: [], unresolved: [], scan: emptyScan() }
      : resolveEntries(entries, resolveOpts)
  // With no target, a directory the checkout around it tracks files in means
  // that checkout, as it does for git itself. The search comes first, and a
  // directory the checkout tracks nothing in is not part of it: a home
  // directory kept in git does not track ~/Developer, so a search there that
  // finds nothing is reported as it is. So is a search that found checkouts
  // it could not read.
  const around =
    targets.length === 0 && resolution.repos.length === 0 && resolution.scan.checkoutsFound === 0
      ? checkoutRoot(cwd)
      : null
  if (around !== null && around !== resolve(cwd) && tracksFilesIn(cwd, resolveOpts.git)) {
    resolution = resolveEntries([around], resolveOpts)
  }
  if (branch !== undefined && resolution.repos.length > 1) {
    throw new RepoCleanerError(
      'conflict',
      `--branch sweeps one repository; ${resolution.repos.length} found under ${entries[0]}`,
    )
  }
  const of = resolution.repos.length
  const repos = [
    ...failed,
    ...resolution.repos.map((root, i) =>
      sweepRepo(root, {
        ...opts,
        only: options.only,
        remotes: options.remotes,
        against: options.against ?? undefined,
        provider: options.provider,
        fetch: options.offline ? [] : options.fetch ? 'local' : 'scope',
        branch,
        cwd,
        position: { index: i + 1, of },
      }),
    ),
  ]
  return {
    repos,
    unresolved: resolution.unresolved,
    scan: resolution.scan,
    duplicates: findDuplicateCheckouts(repos.map((s) => s.repo)),
    counts: countRows(repos.flatMap((s) => s.rows)),
    reclaimableBytes: opts.sizes === true ? sumReclaimable(repos) : null,
    options,
  }
}

/**
 * The repository's note about its pull request lookup, or null when the
 * provider answered or nothing hangs on it. A failed listing is always noted;
 * a CLI that is missing or signed out only when a remote branch could be
 * deleted on its account, which then needs confirm-open-pr.
 */
function providerNote(
  status: ProviderStatus | null,
  kinds: ReadonlySet<Kind>,
  choice: ProviderChoice,
): string | null {
  const unchecked = status === null ? null : prsUnchecked(status)
  if (status === null || unchecked === null) return null
  // A local remote names no forge, and `auto` asks GitHub for any host that
  // is not GitLab's, so a host that is not a forge lands here too. github.com
  // is a forge: there the cause is access, not the provider.
  const hint =
    status.host === null ||
    (choice === 'auto' && status.name === 'github' && status.host !== 'github.com')
      ? ` Pass \`--provider none\` if this remote has no ${status.noun}s.`
      : ''
  if (unchecked.kind === 'list-failed') {
    return `Listing ${status.noun}s with \`${status.listing}\` failed (${status.listError}); judged on git evidence alone.${hint}`
  }
  if (unchecked.kind === 'incomplete') {
    return `The ${status.noun} listing from \`${status.listing}\` is incomplete (${status.incomplete}), so a remote branch with no ${status.noun} found needs confirm-open-pr to delete.${hint}`
  }
  if (!kinds.has('remote')) return null
  const fix =
    unchecked.kind === 'not-installed'
      ? `Install \`${status.tool}\``
      : `Sign in to \`${status.tool}\``
  return `Could not check for open ${status.noun}s: ${unchecked.why}, so deleting a remote branch needs confirm-open-pr. ${fix}, or pass \`--allow confirm-open-pr\` once you have checked.${hint}`
}

/**
 * Each worktree whose directory exists (by `isDir`, so one that lost its `.git`
 * too) gets its size in its evidence; null when `du` could not say. A gone
 * worktree has none.
 */
function readSizes(
  rows: readonly WorktreeRow[],
  opts: Pick<RepoSweepOptions, 'du' | 'sizeTimeoutMs'>,
  tick: (done: number, total: number) => void,
): void {
  const onDisk = rows.filter((row) => isDir(row.evidence.path))
  for (const [i, row] of onDisk.entries()) {
    tick(i, onDisk.length)
    row.evidence.sizeBytes = sizeOf(row.evidence.path, {
      du: opts.du,
      timeoutMs: opts.sizeTimeoutMs,
    })
  }
}

/** The repositories' `reclaimableBytes` added up; an unreadable one counts for nothing. */
function sumReclaimable(repos: readonly RepoSweep[]): Reclaimable {
  const total: Reclaimable = { delete: 0, review: 0, unsized: 0 }
  for (const repo of repos) {
    total.delete += repo.reclaimableBytes?.delete ?? 0
    total.review += repo.reclaimableBytes?.review ?? 0
    total.unsized += repo.reclaimableBytes?.unsized ?? 0
  }
  return total
}

function errorSweep(path: string, err: unknown): RepoSweep {
  return {
    path,
    repo: null,
    rows: [],
    counts: countRows([]),
    reclaimableBytes: null,
    notes: [],
    error: err instanceof Error ? err.message : String(err),
  }
}

/** What {@link sweepRepo} takes: a sweep's options, already resolved. */
interface RepoSweepOptions extends Runners {
  only: readonly Kind[]
  /** As {@link SweepOptions.remotes}; a plan's re-check passes the names it resolved. */
  remotes: readonly string[]
  against?: string | undefined
  provider: ProviderChoice
  sizes?: boolean | undefined
  sizeTimeoutMs?: number | undefined
  /**
   * What to fetch first. `scope`: every remote whose branches are judged, and
   * the `against` remote with them. `local`: those, and the default remote.
   * A list: exactly those remotes, as a plan's re-check does. `[]`: nothing.
   */
  fetch: 'scope' | 'local' | readonly string[]
  /**
   * Read remote tips with `ls-remote` even without a fetch: `clean`'s
   * re-check, which must not delete on the strength of a stale tracking ref.
   * Without a fetch, a failed `ls-remote` then fails the repository rather
   * than fall back to those refs.
   */
  liveRemoteTips?: boolean | undefined
  branch?: string | undefined
  /** Only the worktree at this path; for {@link inspectWorktree}. */
  worktree?: string | undefined
  cwd: string
  annotate?: Annotate | undefined
  onProgress?: ((progress: SweepProgress) => void) | undefined
  position?: { index: number; of: number } | undefined
}

/**
 * Inventory one repository, annotated and with freed branches held, as
 * {@link sweep} does for each. The engine `check` and `run` re-sweep with.
 * Never throws for a repository it cannot read; throws a `conflict` for a
 * `branch` that is the default branch.
 *
 * A failed fetch fails the repository. A lookup that only adds evidence does
 * not: a remote whose branches `ls-remote` cannot list is read from the
 * remote-tracking refs the fetch just wrote, and a provider whose listing
 * fails leaves no pull request evidence. Each is a sentence in `notes`, and
 * every row is judged on the evidence that is left.
 */
export function sweepRepo(path: string, opts: RepoSweepOptions): RepoSweep {
  const kinds = new Set<Kind>(opts.only)
  const git = new Git(path, { runner: opts.git })
  const gh = new Gh(path, { runner: opts.gh })
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
      remotes: opts.remotes,
      against: opts.against ?? null,
      allowProvider: opts.provider !== 'none',
      provider: opts.provider,
      git,
      gh,
      providers: known,
    })
  } catch (err) {
    // A `DiscoveryFailed`, or anything else that kept the repository from being read.
    return errorSweep(path, err)
  }

  if (only === repo.mainBranch) {
    throw new RepoCleanerError(
      'conflict',
      `--branch ${only} is the default branch, which is never a candidate for deletion`,
    )
  }
  // A branch sweep judges the worktree on its own evidence, wherever the caller stands.
  const cwd = only === undefined ? opts.cwd : repo.root

  const toFetch = fetchSet(repo, opts.fetch)
  if (toFetch.length > 0) {
    report('fetch')
    // Several remotes in one `git fetch --multiple`, fetched at once.
    const flags = { prune: true, quiet: true, noWriteFetchHead: true }
    const at = git.at(repo.root)
    const fetched =
      toFetch.length === 1
        ? at.try.fetch(toFetch[0]!, undefined, flags)
        : at.try.fetchMany(toFetch, { ...flags, jobs: Math.min(toFetch.length, FETCH_JOBS) })
    // Unlike the lookups below, a failed fetch fails the repository: every
    // row, local ones included, would be judged against a default branch
    // older than the one asked for. Git names the remote that failed.
    if (!fetched.ok) {
      return {
        ...errorSweep(
          path,
          new Error(`fetch of ${toFetch.join(', ')} failed: ${errorText(fetched.error)}`),
        ),
        repo,
      }
    }
  }
  repo = {
    ...repo,
    fetchedRemotes: toFetch,
  }
  try {
    repo = resolveRemoteDefaults(repo, git)
  } catch (err) {
    return { ...errorSweep(path, err), repo }
  }
  if (only !== undefined && repo.remotes.some((r) => r.defaultBranch === only)) {
    throw new RepoCleanerError(
      'conflict',
      `--branch ${only} is a remote's default branch, which is never a candidate for deletion`,
    )
  }

  const notes: string[] = []
  if (
    repo.remote === null &&
    repo.against === null &&
    (kinds.has('worktree') || kinds.has('branch')) &&
    repo.allRemotes.length > 0
  ) {
    notes.push(
      `No default remote (no origin, and the default branch tracks none), so local rows are judged against the local \`${repo.mainBranch}\`; pass \`--against <remote>\` to judge them against a remote.`,
    )
  }
  try {
    // One lookup per remote: the default remote's answer serves both its
    // own branches and the local rows. A repository with no default remote
    // keys its local rows' lookup by ''.
    const root = repo.root
    // The default remote's pull requests are for the local rows: with none in
    // scope, it is asked only when it is judged itself.
    const local = kinds.has('worktree') || kinds.has('branch')
    const statuses = new Map<string, ProviderStatus | null>(
      local ? [[repo.remote ?? '', repo.provider]] : [],
    )
    for (const r of judgedRemotes(repo)) if (!statuses.has(r.name)) statuses.set(r.name, r.provider)
    const answered = new Map<string, { prs: Map<string, PRInfo>; status: ProviderStatus | null }>()
    for (const [name, status] of statuses) {
      if (status === null) {
        answered.set(name, { prs: new Map(), status })
        continue
      }
      if (status.authenticated) report('prs', undefined, undefined, status.tool)
      const looked = lookupPrs({ root, provider: status }, known[status.name], only)
      const after: ProviderStatus =
        looked.error !== null
          ? { ...status, listError: looked.error }
          : looked.incomplete !== null
            ? { ...status, incomplete: looked.incomplete }
            : status
      answered.set(name, { prs: looked.prs, status: after })
      // With no remote there is no remote branch to gate and no forge to point
      // at; the local rows already say the lookup failed.
      const note = name === '' ? null : providerNote(after, kinds, opts.provider)
      if (note !== null) notes.push(statuses.size > 1 ? `${name}: ${note}` : note)
    }
    const prs = answered.get(repo.remote ?? '')?.prs ?? new Map<string, PRInfo>()
    repo = {
      ...repo,
      provider: answered.get(repo.remote ?? '')?.status ?? repo.provider,
      remotes: repo.remotes.map((r) => ({
        ...r,
        provider: answered.get(r.name)?.status ?? r.provider,
      })),
    }
    const rows: Row[] = []

    // Worktrees are gathered whenever local branches are, even if they are not
    // reported: a branch checked out in one must not be judged on its own.
    let worktreeRows: WorktreeRow[] = []
    let worktreeBranches = new Set<string>()
    if (kinds.has('worktree') || kinds.has('branch')) {
      ;[worktreeRows, worktreeBranches] = gatherWorktrees(
        repo,
        prs,
        cwd,
        git,
        { branch: only, path: opts.worktree },
        opts.probe ?? defaultProcessProbe(),
        ticker('worktree'),
      )
    }
    if (kinds.has('worktree')) {
      if (opts.sizes === true) readSizes(worktreeRows, opts, ticker('size'))
      rows.push(...worktreeRows)
    }

    let localBranchNames = new Set<string>()
    if (kinds.has('branch') || kinds.has('remote')) {
      // A branch whose worktree goes in the same run is judged on its own:
      // a run removes worktrees before it deletes branches.
      const freed = new Map<string, string>()
      if (kinds.has('worktree')) {
        for (const row of worktreeRows) {
          const branch = row.evidence.branch
          if (freesBranch(row, only !== undefined) && branch !== null) freed.set(branch, row.name)
        }
      }
      const pinned = new Set([...worktreeBranches].filter((name) => !freed.has(name)))
      const localRows = gatherLocalBranches(repo, prs, pinned, git, only, ticker('branch'))
      // A run drops a freed branch unless it also removes the worktree.
      for (const row of localRows) {
        const worktree = freed.get(row.name)
        if (worktree !== undefined) row.evidence.worktree = worktree
      }
      localBranchNames = new Set(localRows.map((row) => row.name))
      if (kinds.has('branch')) rows.push(...localRows)
    }

    if (kinds.has('remote')) {
      for (const remote of judgedRemotes(repo)) {
        const gathered = gatherRemoteBranches(
          repo,
          remote,
          answered.get(remote.name)!.prs,
          localBranchNames,
          git,
          {
            live: toFetch.includes(remote.name) || opts.liveRemoteTips === true,
            strict: opts.liveRemoteTips === true && !toFetch.includes(remote.name),
            only,
            tick: ticker('remote'),
          },
        )
        rows.push(...gathered.rows)
        if (gathered.note !== null) notes.push(gathered.note)
      }
    }

    const annotated =
      opts.annotate === undefined
        ? rows
        : holdFreedBranches(opts.annotate(repo, rows).map(blockedHasNoAction), only !== undefined)
    return {
      path,
      repo,
      rows: annotated,
      counts: countRows(annotated),
      reclaimableBytes: opts.sizes === true ? reclaimableOf(annotated) : null,
      notes,
      error: null,
    }
  } catch (err) {
    if (err instanceof RepoCleanerError) throw err
    return { ...errorSweep(path, err), repo, notes }
  }
}

/**
 * Whether worktree row `row` frees its branch to be judged on its own. A full
 * sweep frees it only for a worktree judged `delete`; a branch sweep, where the
 * caller named the branch, for any worktree that can be removed.
 */
function freesBranch(row: Row, branchScoped: boolean): boolean {
  return row.action !== null && (branchScoped || row.verdict === 'delete')
}

/** A row a host marked `blocked` can never be deleted: it keeps no action and no command. */
function blockedHasNoAction(row: Row): Row {
  return row.verdict === 'blocked' && row.action !== null
    ? { ...row, action: null, commands: [] }
    : row
}

/**
 * Keep again each branch the sweep freed for its worktree's removal when that
 * worktree no longer frees it: a host's `annotate` held it back, demoted it,
 * or dropped its row. Running it twice changes nothing.
 */
export function holdFreedBranches(rows: Row[], branchScoped: boolean): Row[] {
  const going = new Set(
    rows.filter((r) => r.kind === 'worktree' && freesBranch(r, branchScoped)).map((r) => r.name),
  )
  return rows.map((row) => {
    if (row.kind !== 'branch' || row.evidence.worktree === undefined) return row
    if (going.has(row.evidence.worktree)) return row
    const { worktree: _, ...evidence } = row.evidence
    return {
      ...row,
      verdict: 'keep',
      action: null,
      why: HELD_BY_WORKTREE,
      evidence,
      commands: [],
      notes: [],
      risks: [],
    }
  })
}

/**
 * The worktree at `path`, judged as a sweep judges it: its verdict, risks,
 * blockers and evidence, submodules included. Reads git and the process
 * table; asks no provider.
 *
 * The main checkout is a worktree too: it comes back as its `keep` row
 * ("primary worktree").
 *
 * @throws RepoCleanerError (`not-found`) when `path` is not a worktree of a
 *   repository git can read.
 */
export function inspectWorktree(
  path: string,
  opts: Runners & { cwd?: string | undefined; annotate?: Annotate | undefined } = {},
): WorktreeRow {
  const cwd = opts.cwd ?? process.cwd()
  const abs = isAbsolute(path) ? path : resolve(cwd, path)
  const there = existsSync(abs)
  const real = there ? realpathSync(abs) : resolve(abs)
  // From the worktree itself when it is there; a gone one is read from the
  // repository the caller stands in. The sweep finds the main checkout.
  const swept = sweepRepo(there ? real : cwd, {
    ...opts,
    only: ['worktree'],
    remotes: [],
    provider: 'none',
    fetch: [],
    cwd,
    worktree: real,
  })
  if (swept.error !== null) throw new RepoCleanerError('not-found', swept.error)
  const row = swept.rows.find((r): r is WorktreeRow => r.kind === 'worktree')
  if (row === undefined) {
    throw new RepoCleanerError(
      'not-found',
      `${path} is not a worktree of ${swept.repo?.root ?? cwd}`,
    )
  }
  return row
}

/** The most remotes one repository fetches at once. */
const FETCH_JOBS = 8

/** The remotes `fetch` names for `repo`; see {@link RepoSweepOptions.fetch}. */
function fetchSet(repo: RepoInfo, fetch: RepoSweepOptions['fetch']): string[] {
  if (Array.isArray(fetch)) return [...fetch]
  const names = judgedRemotes(repo).map((r) => r.name)
  if (fetch === 'local' && repo.remote !== null) names.unshift(repo.remote)
  if ((names.length > 0 || fetch === 'local') && repo.against !== null) names.push(repo.against)
  return [...new Set(names)]
}
