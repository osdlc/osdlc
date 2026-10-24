/**
 * `AsyncGit` — the awaitable client, bound to one working directory and one
 * {@link GitBackend}.
 *
 * The same methods as the sync `Git`, returning promises. One difference: a
 * backend does the work, not a runner. The default backend runs the `git`
 * CLI. Any other {@link GitBackend}, such as a pure-JavaScript git, a remote
 * service or a recorded fixture, works with the same client. Each method
 * matches its {@link Git} counterpart and rejects where that one throws.
 *
 * Here the repository is set on the backend:
 * `new AsyncGit(cwd, { backend: cliBackend({ gitDir }) })`, where the sync
 * client takes `gitDir` on its own constructor.
 */

import { dirname } from 'node:path'

import type { CommandResult } from '@osdlc/command-seam'

import { cliBackend, type GitBackend, type GitCallOptions } from './backend.ts'
import { softAsync, triedAsync, type Soft, type TriedAsync } from './outcome.ts'
import { parseRemoteUrl, type RemoteCoordinate } from './remote-url.ts'
import { SOFT_TABLE } from './soft.ts'
import {
  parseRefRows,
  splitLines,
  splitTrailingOptions,
  type AddOptions,
  type AheadBehind,
  type CommitOptions,
  type CheckoutOptions,
  type ConfigGetOptions,
  type CloneOptions,
  type ConflictSide,
  type MergeOptions,
  type MergeOutcome,
  type MergeTreeOptions,
  type MergeTreeOutcome,
  type RebaseOptions,
  type RebaseOutcome,
  type RemoteGetUrlOptions,
  type TaggedFile,
  type UnmergedEntry,
  type ConfigSetOptions,
  type DiffEntry,
  type DiffNameOnlyOptions,
  type DiffStatOptions,
  type DiffNameStatusOptions,
  type DiffTextOptions,
  type DiffTreeOptions,
  type FetchOptions,
  type ForEachRefOptions,
  type ForceLease,
  type GrepOptions,
  type InitOptions,
  type LogOptions,
  type IgnoreMatch,
  type LsFilesOptions,
  type LsRemoteOptions,
  type LsTreeOptions,
  type NumstatEntry,
  type RemoteRef,
  type CleanOptions,
  type DiffCheckOptions,
  type DiffCheckResult,
  type StatusEntry,
  type StatusPorcelainOptions,
  type TreeEntry,
  type Worktree,
  type WorktreeMoveOptions,
} from './verbs.ts'

/** `Omit` applied per union arm, so a discriminated option type stays a union. */
type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

/**
 * Split a merged option bag into the per-call concerns and the operation's
 * own fields. A {@link GitRequest} must stay serializable data, so `signal`
 * and `timeoutMs` are separated out before the request is built.
 */
function splitCallOptions<T extends GitCallOptions>(
  opts: T,
): [GitCallOptions, DistributiveOmit<T, keyof GitCallOptions>] {
  const { timeoutMs, signal, env, maxOutputBytes, ...rest } = opts
  return [
    { timeoutMs, signal, env, maxOutputBytes },
    rest as DistributiveOmit<T, keyof GitCallOptions>,
  ]
}

/** A typed, awaitable git client bound to one working directory. */
export class AsyncGit {
  readonly cwd: string
  private readonly backend: GitBackend
  private tried: TriedAsync<AsyncGit> | undefined
  private softened: Soft<AsyncGit> | undefined

  /**
   * Bind a client to `cwd`. The default backend spawns the `git` CLI.
   *
   * This client takes a `backend`, where `Git` takes a `runner`. To
   * change how the CLI process is spawned, pass `cliBackend({ runner })`.
   *
   * `gitDir`, `workTree` and `env` live on the backend
   * (`cliBackend({ gitDir })`), not here: a non-CLI backend has no
   * `--git-dir` to receive, so they belong to the thing that spawns git.
   * The sync {@link Git} takes them on the client, which has no backend.
   */
  constructor(cwd: string, opts: { backend?: GitBackend | undefined } = {}) {
    this.cwd = cwd
    this.backend = opts.backend ?? cliBackend()
  }

  /** The same client rooted at a different directory (same backend). */
  at(cwd: string): AsyncGit {
    return new AsyncGit(cwd, { backend: this.backend })
  }

  /**
   * Every method again, resolving to a `Result<T, GitFailure>` instead of
   * rejecting. A declared absence is `ok: true`; see `./outcome.ts`.
   *
   * The type leaves out `raw`, `rawChecked` and `at`, but at runtime the proxy
   * wraps them too: `git.try.raw(argv)` resolves to `{ ok: true, value }`.
   * Call those three on the client itself.
   */
  get try(): TriedAsync<AsyncGit> {
    return (this.tried ??= triedAsync(this))
  }

  /**
   * Each verb with an absence value (`null`, `[]` or `false`) resolves to that
   * value when git fails, instead of rejecting. It is for callers that treat
   * "could not ask" the same as "nothing there": `git.soft.resolveRef(x)` is
   * `null` both for a missing ref and for a broken repo. Use `try` when the
   * failure itself matters.
   *
   * As with `try`, the proxy also wraps `raw`, `rawChecked` and `at` at
   * runtime, though the type leaves them out.
   */
  get soft(): Soft<AsyncGit> {
    // Explicit type argument: otherwise TS 5.x infers the polymorphic `this`.
    return (this.softened ??= softAsync<AsyncGit>(this, SOFT_TABLE))
  }

  // ── escape hatch ──────────────────────────────────────────────────────────

  /**
   * Runs any git argv without checking the exit code. Only a CLI backend can
   * run this. Others reject with `UnsupportedRequest`.
   */
  raw(
    argv: string[],
    opts: GitCallOptions & { input?: string | undefined } = {},
  ): Promise<CommandResult> {
    return this.backend.execute(this.cwd, { kind: 'raw', argv, input: opts.input }, opts)
  }

  /**
   * Runs any git argv and rejects with the classified failure on a non-zero
   * exit, or on output cut short at the output cap or a timeout. Report
   * `e.failure.detail`, which holds both streams. See {@link Git.rawChecked}.
   */
  rawChecked(
    argv: string[],
    opts: GitCallOptions & { input?: string | undefined } = {},
  ): Promise<CommandResult> {
    return this.backend.execute(
      this.cwd,
      { kind: 'raw', argv, checked: true, input: opts.input },
      opts,
    )
  }

  // ── queries ───────────────────────────────────────────────────────────────

  /** A file's content at a rev, null if absent. */
  showAtRev(rev: string, relPath: string, opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'showAtRev', rev, relPath }, opts)
  }

  /**
   * See {@link Git.revParse}. Call options go last, as an object. For a ref,
   * prefer {@link AsyncGit.resolveRef}.
   */
  revParse(...args: string[] | [...string[], GitCallOptions]): Promise<string | null> {
    const [argv, opts] = splitTrailingOptions<GitCallOptions>(args)
    return this.backend.execute(this.cwd, { kind: 'revParse', args: argv }, opts)
  }

  /** The sha `ref` resolves to, or null. See {@link Git.resolveRef}. */
  resolveRef(ref: string, opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'resolveRef', ref }, opts)
  }

  /** True iff this repository has any history. See {@link Git.hasHistory}. */
  async hasHistory(opts: GitCallOptions = {}): Promise<boolean> {
    return (await this.resolveRef('HEAD', opts)) !== null
  }

  /** HEAD's shortname, `"HEAD"` when detached. See {@link Git.headRef}. */
  headRef(opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'headRef' }, opts)
  }

  /** Absolute repo top-level directory, or null outside a repo. */
  topLevel(opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'topLevel' }, opts)
  }

  /**
   * The shared `.git` dir (worktree-aware) as an absolute path, or null
   * outside a repo. See {@link Git.gitCommonDir}.
   */
  gitCommonDir(opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'gitCommonDir' }, opts)
  }

  /**
   * This worktree's own `.git` dir as an absolute path, or null outside a
   * repo. See {@link Git.gitDir}.
   */
  gitDir(opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'gitDir' }, opts)
  }

  /**
   * What a symbolic ref points at (full refname), or null when it is not one.
   * See {@link Git.symbolicRef}.
   */
  symbolicRef(ref: string, opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'symbolicRef', ref }, opts)
  }

  /**
   * The primary checkout that owns this working directory, or null outside a
   * repository. See {@link Git.mainCheckout}.
   */
  async mainCheckout(opts: GitCallOptions = {}): Promise<string | null> {
    const common = await this.gitCommonDir(opts)
    return common === null ? null : dirname(common)
  }

  /** Current branch shortname, or null when detached. Rejects outside a repo. */
  currentBranch(opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'currentBranch' }, opts)
  }

  /**
   * `git status --porcelain` lines; `[]` on a clean tree, and a rejection
   * outside a repository. `paths` narrows the report to those pathspecs.
   */
  statusPorcelain(opts: GitCallOptions & StatusPorcelainOptions = {}): Promise<string[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'statusPorcelain', ...req }, call)
  }

  /** Every changed or untracked file, from `status --porcelain -z`. */
  statusEntries(opts: GitCallOptions = {}): Promise<StatusEntry[]> {
    return this.backend.execute(this.cwd, { kind: 'statusEntries' }, opts)
  }

  /** True iff the working tree has any staged/unstaged/untracked change. */
  async isDirty(opts: GitCallOptions & StatusPorcelainOptions = {}): Promise<boolean> {
    return (await this.statusPorcelain(opts)).length > 0
  }

  /** Local branch shortnames matching `pattern` (all when omitted). */
  branches(pattern?: string | undefined, opts: GitCallOptions = {}): Promise<string[]> {
    return this.backend.execute(this.cwd, { kind: 'branches', pattern }, opts)
  }

  /** True iff local branch `name` exists (exact match). */
  async branchExists(name: string, opts: GitCallOptions = {}): Promise<boolean> {
    return (await this.branches(name, opts)).includes(name)
  }

  /** `git worktree list --porcelain`, parsed. Rejects outside a repo. */
  worktrees(opts: GitCallOptions = {}): Promise<Worktree[]> {
    return this.backend.execute(this.cwd, { kind: 'worktrees' }, opts)
  }

  /** Merge base of two revs, or null when the histories are unrelated. */
  mergeBase(a: string, b: string, opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'mergeBase', a, b }, opts)
  }

  /** Subject line of a ref's HEAD commit, or null. */
  logSubject(ref: string, opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'logSubject', ref }, opts)
  }

  /** `git config --get <key>`, or null when unset. `scope` reads one file only. */
  configGet(key: string, opts: GitCallOptions & ConfigGetOptions = {}): Promise<string | null> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'configGet', key, ...req }, call)
  }

  /** Every value of a multi-valued key, verbatim; `[]` when unset. */
  configGetAll(key: string, opts: GitCallOptions & ConfigGetOptions = {}): Promise<string[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'configGetAll', key, ...req }, call)
  }

  /** A key read as a boolean by git, or null when unset. See {@link Git.configGetBool}. */
  configGetBool(
    key: string,
    opts: GitCallOptions & ConfigGetOptions = {},
  ): Promise<boolean | null> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'configGetBool', key, ...req }, call)
  }

  /** True iff `rev` resolves to an object. */
  objectExists(rev: string, opts: GitCallOptions = {}): Promise<boolean> {
    return this.backend.execute(this.cwd, { kind: 'objectExists', rev }, opts)
  }

  /**
   * `ls-remote` rows for a remote (optionally pattern-filtered). `[]` means
   * the remote has no matching refs; an unreachable remote rejects.
   */
  lsRemote(
    remote: string,
    pattern?: string | undefined,
    opts: GitCallOptions & LsRemoteOptions = {},
  ): Promise<RemoteRef[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'lsRemote', remote, pattern, ...req }, call)
  }

  /**
   * The subset of `relPaths` that .gitignore rules ignore. Rejects outside a
   * repository. Fail-closed callers: see {@link Git.checkIgnore}.
   */
  checkIgnore(relPaths: string[], opts: GitCallOptions = {}): Promise<Set<string>> {
    if (relPaths.length === 0) return Promise.resolve(new Set())
    return this.backend.execute(this.cwd, { kind: 'checkIgnore', relPaths }, opts)
  }

  /**
   * The ignore rule (file, line, pattern) behind each of `relPaths` that a rule mentions;
   * see {@link Git.checkIgnoreVerbose}. Rejects outside a repository.
   */
  checkIgnoreVerbose(relPaths: string[], opts: GitCallOptions = {}): Promise<IgnoreMatch[]> {
    if (relPaths.length === 0) return Promise.resolve([])
    return this.backend.execute(this.cwd, { kind: 'checkIgnoreVerbose', relPaths }, opts)
  }

  /**
   * Tracked and/or untracked file paths (`ls-files -z`). Rejects outside a
   * repository, where `topLevel()` resolves to null. See {@link Git.lsFiles}.
   */
  lsFiles(opts: GitCallOptions & LsFilesOptions = {}): Promise<string[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'lsFiles', ...req }, call)
  }

  /** Tracked files with their `ls-files -v` tag. See {@link Git.lsFilesTagged}. */
  lsFilesTagged(opts: GitCallOptions = {}): Promise<TaggedFile[]> {
    return this.backend.execute(this.cwd, { kind: 'lsFilesTagged' }, opts)
  }

  /**
   * The unified diff; `""` when nothing differs. A bad rev, or a cwd outside a
   * repository, rejects. See {@link Git.diffText}.
   */
  diffText(rev?: string | undefined, opts: GitCallOptions & DiffTextOptions = {}): Promise<string> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(
      this.cwd,
      { kind: 'diffText', rev, staged: req.staged, paths: req.paths },
      call,
    )
  }

  /**
   * One untracked file rendered as an all-added diff. A path git cannot read
   * rejects. See {@link Git.diffAddedFile}.
   */
  diffAddedFile(relPath: string, opts: GitCallOptions = {}): Promise<string> {
    return this.backend.execute(this.cwd, { kind: 'diffAddedFile', relPath }, opts)
  }

  /** `for-each-ref` rows, one line each, in the caller's format. */
  forEachRef(
    pattern: string | string[],
    opts: GitCallOptions & ForEachRefOptions = {},
  ): Promise<string[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'forEachRef', pattern, ...req }, call)
  }

  /** Local refs matching `pattern` as `{ sha, ref }` rows. */
  async refs(pattern: string | string[], opts: GitCallOptions = {}): Promise<RemoteRef[]> {
    return parseRefRows(await this.forEachRef(pattern, opts))
  }

  /** Changed paths (`diff --name-only -z`); `[]` when nothing changed. */
  diffNameOnly(opts: GitCallOptions & DiffNameOnlyOptions = {}): Promise<string[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'diffNameOnly', ...req }, call)
  }

  /** The `diff --stat` summary as raw stdout. See {@link Git.diffStat}. */
  diffStat(opts: GitCallOptions & DiffStatOptions = {}): Promise<string> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'diffStat', ...req }, call)
  }

  /** `git diff --check`: whitespace errors and conflict markers; findings do not reject. */
  diffCheck(opts: GitCallOptions & DiffCheckOptions = {}): Promise<DiffCheckResult> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'diffCheck', ...req }, call)
  }

  /** Changed paths with their status; renames report the destination. */
  diffNameStatus(opts: GitCallOptions & DiffNameStatusOptions = {}): Promise<DiffEntry[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'diffNameStatus', ...req }, call)
  }

  /**
   * `git log` as raw stdout — the caller's `--format`, unsplit and untrimmed.
   * Rejects on an empty repository; probe {@link AsyncGit.hasHistory} first.
   * See {@link Git.log}.
   */
  log(opts: GitCallOptions & LogOptions = {}): Promise<string> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'log', ...req }, call)
  }

  /** {@link AsyncGit.log}, split into non-blank lines. See {@link Git.logLines}. */
  async logLines(opts: GitCallOptions & LogOptions = {}): Promise<string[]> {
    return splitLines(await this.log(opts))
  }

  /**
   * The entries of a tree at a rev (`ls-tree -z`); `[]` for a pathspec that
   * matches nothing, and a rejection for a rev that does not resolve.
   */
  lsTree(rev: string, opts: GitCallOptions & LsTreeOptions = {}): Promise<TreeEntry[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'lsTree', rev, ...req }, call)
  }

  /**
   * The paths and statuses one commit changed. Pass `root` for a commit that
   * may be the first one — without it a root commit reports nothing.
   */
  diffTree(rev: string, opts: GitCallOptions & DiffTreeOptions = {}): Promise<DiffEntry[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'diffTree', rev, ...req }, call)
  }

  /** Per-file line counts for one commit. See {@link Git.diffTreeNumstat}. */
  diffTreeNumstat(
    rev: string,
    opts: GitCallOptions & DiffTreeOptions = {},
  ): Promise<NumstatEntry[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'diffTreeNumstat', rev, ...req }, call)
  }

  /** Matching lines (`git grep`); `[]` for no matches, a rejection for a failure. */
  grep(pattern: string, opts: GitCallOptions & GrepOptions = {}): Promise<string[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'grep', pattern, ...req }, call)
  }

  /**
   * True iff `a` is an ancestor of `b`. A rev that does not resolve rejects
   * rather than reading as "no".
   */
  isAncestor(a: string, b: string, opts: GitCallOptions = {}): Promise<boolean> {
    return this.backend.execute(this.cwd, { kind: 'isAncestor', a, b }, opts)
  }

  /** How far `tip` has diverged from `base`. See {@link AheadBehind}. */
  aheadBehind(base: string, tip: string, opts: GitCallOptions = {}): Promise<AheadBehind> {
    return this.backend.execute(this.cwd, { kind: 'aheadBehind', base, tip }, opts)
  }

  /** Configured remote names (`git remote`); `[]` when there are none. */
  remotes(opts: GitCallOptions = {}): Promise<string[]> {
    return this.backend.execute(this.cwd, { kind: 'remote' }, opts)
  }

  /**
   * The same as {@link AsyncGit.remotes}.
   *
   * @deprecated Use `remotes()`. The name `remote()` reads as one remote, but
   * it returns every remote name. It will be removed at 1.0.
   */
  remote(opts: GitCallOptions = {}): Promise<string[]> {
    return this.remotes(opts)
  }

  /**
   * A remote's fetch URL (push URL with `push`), or null when no remote by
   * that name exists.
   */
  remoteGetUrl(
    name: string,
    opts: GitCallOptions & RemoteGetUrlOptions = {},
  ): Promise<string | null> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'remoteGetUrl', name, ...req }, call)
  }

  /** Every URL a remote has (push URLs with `push`); `[]` for an unknown remote. */
  remoteGetUrls(name: string, opts: GitCallOptions & RemoteGetUrlOptions = {}): Promise<string[]> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'remoteGetUrls', name, ...req }, call)
  }

  /**
   * The full refname the remote's HEAD points at, asked over the network; null
   * when the remote names none. See {@link Git.remoteHead}.
   */
  remoteHead(remote: string, opts: GitCallOptions = {}): Promise<string | null> {
    return this.backend.execute(this.cwd, { kind: 'remoteHead', remote }, opts)
  }

  /** The coordinate a remote's URL names, or null. See {@link Git.remoteOwnerRepo}. */
  async remoteOwnerRepo(
    remote = 'origin',
    opts: GitCallOptions = {},
  ): Promise<RemoteCoordinate | null> {
    const url = await this.remoteGetUrl(remote, opts)
    return url === null ? null : parseRemoteUrl(url)
  }

  // ── mutations (nothing is absence — any non-zero exit rejects) ────────────

  /** `git fetch <remote> [refspec…]`. See {@link FetchOptions} for the flags. */
  fetch(
    remote: string,
    refspec?: string | string[] | undefined,
    opts: GitCallOptions & FetchOptions = {},
  ): Promise<void> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'fetch', remote, refspec, ...req }, call)
  }

  /** Stage paths; `all` / `update` are `git add -A` / `-u`. */
  add(paths: string[], opts: GitCallOptions & AddOptions = {}): Promise<void> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'add', paths, ...req }, call)
  }

  /**
   * Commit with an inline message, a message file or a stdin message (exactly
   * one). A failing hook rejects. git writes hook output to stdout, which
   * `e.failure.detail` includes.
   */
  commit(opts: GitCallOptions & CommitOptions): Promise<void> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'commit', ...req }, call)
  }

  /** `git config <key> <value>`, the write counterpart of {@link AsyncGit.configGet}. */
  configSet(
    key: string,
    value: string,
    opts: GitCallOptions & ConfigSetOptions = {},
  ): Promise<void> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'configSet', key, value, ...req }, call)
  }

  /** `git init [path]`; `path` defaults to this client's `cwd`. */
  init(path?: string | undefined, opts: GitCallOptions & InitOptions = {}): Promise<void> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'init', path, ...req }, call)
  }

  /** `git clone [--depth n] [--branch ref] <url> [dest]`, from this client's `cwd`. */
  clone(
    url: string,
    dest?: string | undefined,
    opts: GitCallOptions & CloneOptions = {},
  ): Promise<void> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'clone', url, dest, ...req }, call)
  }

  /**
   * Push a refspec. A {@link ForceLease} pins `--force-with-lease`.
   * `{forceWithLease: true}` adds the bare flag, which is the unsafe form. See
   * {@link Git.push}.
   */
  push(
    remote: string,
    refspec: string,
    opts: GitCallOptions & { forceWithLease?: boolean | ForceLease | undefined } = {},
  ): Promise<void> {
    return this.backend.execute(
      this.cwd,
      { kind: 'push', remote, refspec, forceWithLease: opts.forceWithLease },
      opts,
    )
  }

  /** `git clean -f`, plus `-d` with `directories`. Ignored files are kept. */
  clean(opts: GitCallOptions & CleanOptions = {}): Promise<void> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'clean', ...req }, call)
  }

  /** `git reset --hard <rev>`. */
  resetHard(rev: string, opts: GitCallOptions = {}): Promise<void> {
    return this.backend.execute(this.cwd, { kind: 'resetHard', rev }, opts)
  }

  /** Delete a local branch (`-d`, or `-D` with `{force: true}`). */
  deleteBranch(
    name: string,
    opts: GitCallOptions & { force?: boolean | undefined } = {},
  ): Promise<void> {
    return this.backend.execute(this.cwd, { kind: 'deleteBranch', name, force: opts.force }, opts)
  }

  /**
   * Remove config section `name`; false when it was absent. See
   * `configRemoveSection` in `verbs.ts`.
   */
  configRemoveSection(name: string, opts: GitCallOptions = {}): Promise<boolean> {
    return this.backend.execute(this.cwd, { kind: 'configRemoveSection', name }, opts)
  }

  /** Delete `ref` only while it points at `expected`. See `deleteRef` in `verbs.ts`. */
  deleteRef(ref: string, opts: GitCallOptions & { expected: string }): Promise<void> {
    return this.backend.execute(this.cwd, { kind: 'deleteRef', ref, expected: opts.expected }, opts)
  }

  /** `git worktree add [--detach] [-b branch] <path> [startPoint]`. */
  worktreeAdd(
    path: string,
    opts: GitCallOptions & {
      branch?: string | undefined
      startPoint?: string | undefined
      detach?: boolean | undefined
    } = {},
  ): Promise<void> {
    return this.backend.execute(
      this.cwd,
      {
        kind: 'worktreeAdd',
        path,
        branch: opts.branch,
        startPoint: opts.startPoint,
        detach: opts.detach,
      },
      opts,
    )
  }

  /** `git worktree remove [--force] <path>`. */
  worktreeRemove(
    path: string,
    opts: GitCallOptions & { force?: boolean | undefined } = {},
  ): Promise<void> {
    return this.backend.execute(this.cwd, { kind: 'worktreeRemove', path, force: opts.force }, opts)
  }

  /** `git worktree move [--force] <from> <to>`. */
  worktreeMove(
    from: string,
    to: string,
    opts: GitCallOptions & WorktreeMoveOptions = {},
  ): Promise<void> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'worktreeMove', from, to, ...req }, call)
  }

  /** `git worktree prune`. */
  worktreePrune(opts: GitCallOptions = {}): Promise<void> {
    return this.backend.execute(this.cwd, { kind: 'worktreePrune' }, opts)
  }

  /** `git remote add <name> <url>`. */
  remoteAdd(name: string, url: string, opts: GitCallOptions = {}): Promise<void> {
    return this.backend.execute(this.cwd, { kind: 'remoteAdd', name, url }, opts)
  }

  // ── integration ───────────────────────────────────────────────────────────

  /**
   * Merge `ref` into the current branch. A conflict is a value, not a
   * rejection: the outcome is `clean` or `conflict`. Git refusing to merge at
   * all still rejects with the classified failure.
   */
  merge(ref: string, opts: MergeOptions & GitCallOptions = {}): Promise<MergeOutcome> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'merge', ref, ...req }, call)
  }

  /** `git merge --abort`. Rejects when no merge is in progress. */
  mergeAbort(opts: GitCallOptions = {}): Promise<void> {
    return this.backend.execute(this.cwd, { kind: 'mergeAbort' }, opts)
  }

  /** Replay onto `onto`. Same outcome as {@link AsyncGit.merge}. */
  rebase(onto: string, opts: RebaseOptions & GitCallOptions = {}): Promise<RebaseOutcome> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'rebase', onto, ...req }, call)
  }

  /** `git rebase --abort`. Rejects when no rebase is in progress. */
  rebaseAbort(opts: GitCallOptions = {}): Promise<void> {
    return this.backend.execute(this.cwd, { kind: 'rebaseAbort' }, opts)
  }

  /** `git rebase --continue`, editor stubbed. May conflict again. */
  rebaseContinue(opts: GitCallOptions = {}): Promise<RebaseOutcome> {
    return this.backend.execute(this.cwd, { kind: 'rebaseContinue' }, opts)
  }

  /**
   * What merging `theirs` into `ours` would do — no index, no checkout, no
   * worktree. It is the cheap way to ask "would this conflict, and where". The
   * merged `tree` it returns is a real object you can build a commit from.
   */
  mergeTree(
    ours: string,
    theirs: string,
    opts: MergeTreeOptions & GitCallOptions = {},
  ): Promise<MergeTreeOutcome> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'mergeTree', ours, theirs, ...req }, call)
  }

  /** `git ls-files -u`, parsed — the stage detail behind each conflict. */
  lsFilesUnmerged(opts: GitCallOptions = {}): Promise<UnmergedEntry[]> {
    return this.backend.execute(this.cwd, { kind: 'lsFilesUnmerged' }, opts)
  }

  /**
   * Resolve conflicted `paths` to one side wholesale. An empty list resolves
   * without calling the backend. See {@link Git.checkoutSide}.
   */
  checkoutSide(side: ConflictSide, paths: string[], opts: GitCallOptions = {}): Promise<void> {
    if (paths.length === 0) return Promise.resolve()
    return this.backend.execute(this.cwd, { kind: 'checkoutSide', side, paths }, opts)
  }

  /** `git checkout [-f] [-b|-B <branch>] <ref>`. */
  checkout(ref: string, opts: CheckoutOptions & GitCallOptions = {}): Promise<void> {
    const [call, req] = splitCallOptions(opts)
    return this.backend.execute(this.cwd, { kind: 'checkout', ref, ...req }, call)
  }
}
