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

import {
  HELD_BY_WORKTREE,
  gatherLocalBranches,
  gatherRemoteBranches,
  resolveBranch,
} from './branches.ts'
import { discoverRepo } from './discover.ts'
import type { Annotate } from './hooks.ts'
import { defaultProcessProbe, type ProcessProbe } from './processes.ts'
import { lookupPrs, prsUnchecked } from './prs.ts'
import { PROVIDER_CHOICES, providers, type ProviderChoice } from './providers/index.ts'
import { defaultCacheDir, ensureMirror, isRemoteUrl, redactUrl } from './remote-mirror.ts'
import { expandTilde, resolveEntries, type Resolution } from './resolve.ts'
import {
  KINDS,
  RepoCleanerError,
  countRows,
  emptyScan,
  findDuplicateCheckouts,
  type Kind,
  type PRInfo,
  type RepoInfo,
  type RepoSweep,
  type Row,
  type Sweep,
  type SweepProgress,
  type SweptWith,
  type WorktreeRow,
} from './types.ts'
import { errorText } from './util.ts'
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
}

export interface SweepOptions extends Runners {
  /** Only these kinds of row. Default: `worktree` and `branch`, and `remote` with `remote`. Naming `remote` implies `remote`. */
  only?: readonly Kind[] | undefined
  /** Also judge remote branches: fetches each remote first and looks up pull requests. */
  remote?: boolean | undefined
  /** With `remote`: do not fetch; judge against the remote-tracking refs on disk. */
  offline?: boolean | undefined
  /** The remote whose default branch counts as "merged into". Default `origin`, then the first remote. */
  against?: string | undefined
  /** With `remote`: where pull requests come from. Default `auto`, by the remote's host. */
  provider?: ProviderChoice | undefined
  /**
   * One branch only: its worktree, its local branch, and its remote branch
   * with `remote`. `HEAD` is the branch checked out at the target. Takes at
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
  /** A host's re-ranking of each repository's rows. */
  annotate?: Annotate | undefined
  /** Told before each step, and before each row of a step that walks many. For a status line. */
  onProgress?: ((progress: SweepProgress) => void) | undefined
  /** Told, mid-walk, that a target directory is enormous. Defaults to stderr. */
  onWarn?: ((message: string) => void) | undefined
}

const LOCAL: readonly Kind[] = ['worktree', 'branch']

/**
 * The sweep `targets` and `opts` ask for, as a plan records it. Throws a
 * {@link RepoCleanerError} for options that contradict each other or would
 * have no effect, before anything is read.
 */
export function sweptWith(
  targets: readonly string[],
  opts: Omit<
    SweepOptions,
    Exclude<keyof Runners, 'git'> | 'annotate' | 'onProgress' | 'onWarn' | 'cacheDir'
  >,
): SweptWith & { urls: boolean } {
  const cwd = opts.cwd ?? process.cwd()
  const conflict = (message: string): never => {
    throw new RepoCleanerError('conflict', message)
  }
  if (targets.some((t) => t.trim() === '')) {
    throw new RepoCleanerError('bad-input', 'a target is empty')
  }
  const only = opts.only === undefined ? undefined : [...new Set(opts.only)]
  const unknown = (only ?? []).filter((k) => !(KINDS as readonly string[]).includes(k))
  if (unknown.length > 0) {
    throw new RepoCleanerError(
      'bad-input',
      `unknown kind(s) ${unknown.join(', ')}: expected ${KINDS.join(', ')}`,
    )
  }
  if (only !== undefined && only.length === 0) {
    throw new RepoCleanerError('bad-input', 'only names no kind')
  }
  if (
    opts.provider !== undefined &&
    !(PROVIDER_CHOICES as readonly string[]).includes(opts.provider)
  ) {
    throw new RepoCleanerError('bad-input', `unknown provider ${JSON.stringify(opts.provider)}`)
  }

  const exists = (t: string): boolean => existsSync(resolve(cwd, expandTilde(t)))
  const isUrl = targets.map((t) => isRemoteUrl(t, exists))
  const urls = isUrl.some(Boolean)
  if (urls && !isUrl.every(Boolean)) {
    conflict('a remote URL target sweeps remote branches only; sweep it apart from checkouts')
  }
  if (urls && only !== undefined && only.some((k) => k !== 'remote')) {
    conflict(`a remote URL has only remote branches; drop --only ${only.join(',')}`)
  }
  if (urls && opts.branch !== undefined) {
    conflict('--branch reads one branch of a checkout; it does not take a remote URL')
  }
  if (urls && opts.offline === true) {
    conflict('a remote URL target is fetched to be swept; --offline would have no effect')
  }
  if (opts.branch !== undefined && targets.length > 1) {
    conflict(`--branch sweeps one repository; ${targets.length} targets given`)
  }
  const remote = urls || opts.remote === true || (only ?? []).includes('remote')
  if (opts.remote === true && only !== undefined && !only.includes('remote')) {
    conflict(`--remote includes remote branches, but --only ${only.join(',')} leaves them out`)
  }
  if (opts.offline === true && !remote) {
    conflict('--offline has no effect without --remote: nothing is fetched anyway')
  }
  if (opts.provider !== undefined && !remote) {
    conflict(
      '--provider has no effect without --remote: pull requests are looked up only for remote branches',
    )
  }
  const kinds: Kind[] = urls
    ? ['remote']
    : only !== undefined
      ? KINDS.filter((k) => only.includes(k))
      : remote
        ? [...LOCAL, 'remote']
        : [...LOCAL]
  // `HEAD` is the branch checked out at the target, resolved here so the
  // options checked before the sweep are the ones the plan records.
  let branch = opts.branch ?? null
  if (branch === 'HEAD') {
    const at = targets[0] === undefined ? cwd : resolve(cwd, expandTilde(targets[0]))
    try {
      branch = resolveBranch('HEAD', new Git(at, { runner: opts.git }))
    } catch (err) {
      throw new RepoCleanerError('conflict', err instanceof Error ? err.message : String(err))
    }
  }
  return {
    only: kinds,
    remote,
    offline: opts.offline === true,
    against: opts.against ?? null,
    provider: remote ? (opts.provider ?? 'auto') : 'none',
    branch,
    urls,
  }
}

/**
 * Sweep `targets`: checkouts, directories to search for checkouts, or remote
 * URLs (swept through a clone kept in `cacheDir`, remote branches only). No
 * targets means `[cwd]`, resolved the same way, except that a `cwd` inside a
 * checkout with no checkouts below it sweeps that checkout.
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
  // With no target, a subdirectory of a checkout that holds no checkouts
  // means the checkout around it, as it does for git itself. The search comes
  // first, so a directory of checkouts that sits inside a checkout of its own
  // (a home directory kept in git) still sweeps the checkouts below it.
  const around = targets.length === 0 && resolution.repos.length === 0 ? checkoutRoot(cwd) : null
  if (around !== null && around !== resolve(cwd)) {
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
        against: options.against ?? undefined,
        provider: options.provider,
        fetch: options.remote && !options.offline,
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
  repo: RepoInfo,
  kinds: ReadonlySet<Kind>,
  choice: ProviderChoice,
): string | null {
  const status = repo.provider
  const unchecked = status === null ? null : prsUnchecked(status)
  // With no remote there is no remote branch to gate and no forge to point
  // at; the local rows already say the lookup failed.
  if (status === null || unchecked === null || repo.remote === null) return null
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
  if (!kinds.has('remote')) return null
  const fix =
    unchecked.kind === 'not-installed'
      ? `Install \`${status.tool}\``
      : `Sign in to \`${status.tool}\``
  return `Could not check for open ${status.noun}s: ${unchecked.why}, so deleting a remote branch needs confirm-open-pr. ${fix}, or pass \`--allow confirm-open-pr\` once you have checked.${hint}`
}

function errorSweep(path: string, err: unknown): RepoSweep {
  return {
    path,
    repo: null,
    rows: [],
    counts: countRows([]),
    notes: [],
    error: err instanceof Error ? err.message : String(err),
  }
}

/** What {@link sweepRepo} takes: a sweep's options, already resolved. */
interface RepoSweepOptions extends Runners {
  only: readonly Kind[]
  against?: string | undefined
  provider: ProviderChoice
  fetch: boolean
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
      remote: opts.against ?? null,
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

  if (opts.fetch && repo.remote !== null) {
    report('fetch')
    const fetched = git
      .at(repo.root)
      .try.fetch(repo.remote, undefined, { prune: true, quiet: true, noWriteFetchHead: true })
    // Unlike the lookups below, a failed fetch fails the repository: every
    // row, local ones included, would be judged against a default branch
    // older than the one asked for.
    if (!fetched.ok) {
      return {
        ...errorSweep(path, new Error(`fetch failed: ${errorText(fetched.error)}`)),
        repo,
      }
    }
    repo = { ...repo, fetched: true }
  }

  const notes: string[] = []
  try {
    const status = repo.provider ?? null
    if (status?.authenticated === true) report('prs', undefined, undefined, status.tool)
    let prs = new Map<string, PRInfo>()
    if (status !== null) {
      const looked = lookupPrs(repo, known[status.name], only)
      prs = looked.prs
      if (looked.error !== null) {
        repo = { ...repo, provider: { ...status, listError: looked.error } }
      }
      const note = providerNote(repo, kinds, opts.provider)
      if (note !== null) notes.push(note)
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
    if (kinds.has('worktree')) rows.push(...worktreeRows)

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
      const remote = gatherRemoteBranches(repo, prs, localBranchNames, git, {
        live: repo.fetched || opts.liveRemoteTips === true,
        strict: opts.liveRemoteTips === true && !repo.fetched,
        only,
        tick: ticker('remote'),
      })
      rows.push(...remote.rows)
      if (remote.note !== null) notes.push(remote.note)
    }

    const annotated =
      opts.annotate === undefined
        ? rows
        : holdFreedBranches(opts.annotate(repo, rows).map(blockedHasNoAction), only !== undefined)
    return { path, repo, rows: annotated, counts: countRows(annotated), notes, error: null }
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
    provider: 'none',
    fetch: false,
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
