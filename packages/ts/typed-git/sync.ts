/**
 * `Git` — the synchronous client, bound to one working directory and one
 * {@link CommandRunner}.
 *
 * Synchronous on purpose: sequential git one-shots gain nothing from being
 * awaited, and staying sync keeps a caller's call graph uncolored. Reach for
 * `AsyncGit` when the caller must not block, when calls fan out concurrently,
 * or when the work should run against a non-CLI backend.
 *
 * The contract — declared absence returns a value, everything else throws,
 * `try` inspects, `raw` bypasses — is stated once in `./index.ts`. Each verb's
 * own absence codes and parsing live in `./verbs.ts`.
 *
 * Deliberately NOT here: any control-plane protocol with its own conflict
 * semantics (a lease service's CAS ref primitives, say) — that is not
 * general git.
 */

import { dirname } from 'node:path'

import {
  resolveRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '@osdlc/command-seam'

import { softSync, triedSync, type Soft, type TriedSync } from './outcome.ts'
import { parseRemoteUrl, type RemoteCoordinate } from './remote-url.ts'
import { SOFT_TABLE } from './soft.ts'
import * as v from './verbs.ts'
import {
  gate,
  mergeEnv,
  parseRefRows,
  repoPrefix,
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
  type GitVerb,
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

/**
 * Per-call concerns that are not part of the operation itself.
 *
 * The synchronous twin of `GitCallOptions`, minus `signal`: a `spawnSync`
 * child cannot be cancelled mid-flight, so offering an `AbortSignal` here
 * would be a promise the seam cannot keep. `timeoutMs` is the sync answer.
 */
export interface GitSyncCallOptions {
  /**
   * Hard cap on the call, enforced by the runner. Without it there is no cap.
   * An invalid value throws, as in command-seam (`RangeError` for 0, negative
   * or NaN; `TypeError` for a non-number).
   */
  timeoutMs?: number | undefined
  /** Entries merged over the parent environment for this call only. */
  env?: Record<string, string> | undefined
  /**
   * Cap on each output stream, in bytes; 256 MB when omitted. Past it the
   * runner kills the child and the call throws `CommandFailed`. command-seam's
   * Bun test capture path (the Bun runtime with `NODE_ENV=test`) does not
   * apply it.
   */
  maxOutputBytes?: number | undefined
}

/** A typed git client bound to one working directory. */
export class Git {
  readonly cwd: string
  private readonly runner: CommandRunner
  private readonly boundGitDir: string | undefined
  private readonly workTree: string | undefined
  private readonly env: Record<string, string> | undefined
  private tried: TriedSync<Git> | undefined
  private softened: Soft<Git> | undefined

  /**
   * `gitDir` / `workTree` name which repository this client drives, as
   * `--git-dir` / `--work-tree` prefixed onto every invocation — the way to
   * operate on a repo that is not the process's own tree (a bare store, or a
   * checkout whose `.git` lives elsewhere).
   *
   * They are a property of the client, not of any one call, because "which
   * repository" binds the client the same way `cwd` does. `AsyncGit` takes
   * them on its backend instead (`cliBackend({ gitDir })`): a non-CLI backend
   * has no `--git-dir` to receive, so the option belongs to the thing that
   * spawns git, and for the sync client that thing is the client.
   *
   * `env` is the same idea for the environment — see `cliBackend` in
   * `backend.ts`.
   *
   * This client takes a `runner`, where `AsyncGit` takes a `backend`. The
   * default runner spawns `git`; tests pass a fake `CommandRunner`.
   *
   * Neither client has a default timeout. This client kills a child whose
   * output on one stream passes 256 MB; `AsyncGit` has no output cap. The
   * `maxOutputBytes` call option sets the cap per call on both.
   */
  constructor(
    cwd: string,
    opts: {
      runner?: CommandRunner | undefined
      gitDir?: string | undefined
      workTree?: string | undefined
      env?: Record<string, string> | undefined
    } = {},
  ) {
    this.cwd = cwd
    this.runner = resolveRunner('git', opts.runner)
    this.boundGitDir = opts.gitDir
    this.workTree = opts.workTree
    this.env = opts.env
  }

  /**
   * The same client rooted at a different directory — same runner, same repo
   * binding, same client-level `env`.
   */
  at(cwd: string): Git {
    return new Git(cwd, {
      runner: this.runner,
      gitDir: this.boundGitDir,
      workTree: this.workTree,
      env: this.env,
    })
  }

  /**
   * The whole surface again, reporting failure instead of throwing:
   * `git.try.topLevel()` is `{ ok: true, value } | { ok: false, error }`.
   * A declared absence is `ok: true` — see `./outcome.ts`.
   *
   * The type leaves out `raw`, `rawChecked` and `at`, but at runtime the proxy
   * wraps them too: `git.try.raw(argv)` returns `{ ok: true, value }`. Call
   * those three on the client itself.
   */
  get try(): TriedSync<Git> {
    return (this.tried ??= triedSync(this))
  }

  /**
   * The tolerant door: each verb with an absence value (`null`, `[]` or
   * `false`) returns that value when git fails instead of throwing. For
   * callers that treat "could not ask" the same as "nothing there" —
   * `git.soft.resolveRef(x)` is `null` for a missing ref and for a broken
   * repo alike. Use `try` when the failure itself matters.
   *
   * As with `try`, the proxy also wraps `raw`, `rawChecked` and `at` at
   * runtime, though the type leaves them out.
   */
  get soft(): Soft<Git> {
    return (this.softened ??= softSync(this, SOFT_TABLE))
  }

  // ── escape hatch ──────────────────────────────────────────────────────────

  /** Unchecked passthrough for verbs not yet lifted into the API. */
  raw(
    argv: string[],
    opts: GitSyncCallOptions & { input?: string | undefined } = {},
  ): CommandResult {
    return this.runner.run(this.argv(argv), this.runOpts(opts))
  }

  /**
   * Checked passthrough — throws `CommandFailed` on a non-zero exit, and on
   * output cut short at the output cap or a timeout, as every verb does.
   *
   * `CommandFailed.message` interpolates stderr only, and several git commands
   * write the sentence that explains the failure to stdout instead — a
   * rejecting hook, `commit` on a clean tree, `apply --check`. Report
   * `e.detail`, which reads both.
   */
  rawChecked(
    argv: string[],
    opts: GitSyncCallOptions & { input?: string | undefined } = {},
  ): CommandResult {
    // Through the gate, like `AsyncGit.rawChecked`: the seam's `runChecked`
    // checks the exit code only, so it would pass cut-short output.
    const verb: GitVerb<CommandResult> = { argv, absent: [], parse: (r) => r }
    if (opts.input !== undefined) verb.input = opts.input
    return this.exec(verb, opts)
  }

  /** The verb's argv behind this client's repository binding. */
  private argv(argv: string[]): string[] {
    const prefix = repoPrefix(this.boundGitDir, this.workTree)
    return prefix.length === 0 ? argv : [...prefix, ...argv]
  }

  private runOpts(opts: GitSyncCallOptions & { input?: string | undefined }): CommandRunOptions {
    const run: CommandRunOptions = { cwd: this.cwd }
    if (opts.timeoutMs !== undefined) run.timeoutMs = opts.timeoutMs
    if (opts.maxOutputBytes !== undefined) run.maxOutputBytes = opts.maxOutputBytes
    // Per-call entries win over the client's.
    const env = mergeEnv(this.env, opts.env)
    if (env !== undefined) run.env = env
    if (opts.input !== undefined) run.input = opts.input
    return run
  }

  /** Run one verb from the table and gate its result. */
  private exec<T>(verb: GitVerb<T>, opts: GitSyncCallOptions = {}): T {
    const run = this.runOpts(opts)
    if (verb.input !== undefined) run.input = verb.input
    // The verb's own entries (the C locale) win over the client's and the call's.
    if (verb.env !== undefined) run.env = { ...run.env, ...verb.env }
    // The prefixed argv is what ran, so it is what a `CommandFailed` reports.
    const argv = this.argv(verb.argv)
    return gate(verb, this.runner.run(argv, run), argv)
  }

  // ── queries ───────────────────────────────────────────────────────────────

  /** A file's content at a rev (`git show <rev>:<relPath>`), null if absent. */
  showAtRev(rev: string, relPath: string, opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.showAtRev(rev, relPath), opts)
  }

  /**
   * Trimmed `git rev-parse <args>` output — the escape hatch for a query no
   * dedicated verb covers. See `revParse` in `verbs.ts`; for a ref, prefer
   * {@link Git.resolveRef}.
   *
   * Variadic. Call options go last, as an object:
   * `revParse('--show-toplevel', { timeoutMs: 5000 })`. The args are flags by
   * design, so a value that starts with `-` is not refused here.
   */
  revParse(...args: string[] | [...string[], GitSyncCallOptions]): string | null {
    const [argv, opts] = splitTrailingOptions<GitSyncCallOptions>(args)
    return this.exec(v.revParse(...argv), opts)
  }

  /**
   * The sha `ref` resolves to, or null when it does not
   * (`rev-parse --verify --quiet`). An unreadable store throws.
   */
  resolveRef(ref: string, opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.resolveRef(ref), opts)
  }

  /**
   * True iff this repository has any history — `resolveRef("HEAD") !== null`.
   *
   * The repository-health probe. False means an unborn HEAD only; an
   * unreadable store throws rather than reading as empty, which is why this is
   * not `objectExists("HEAD")`.
   */
  hasHistory(opts: GitSyncCallOptions = {}): boolean {
    return this.resolveRef('HEAD', opts) !== null
  }

  /**
   * HEAD's shortname (`rev-parse --abbrev-ref HEAD`). Reports the literal
   * `"HEAD"` on a detached HEAD, where {@link Git.currentBranch} reports null.
   * Throws on an unborn HEAD.
   */
  headRef(opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.headRef(), opts)
  }

  /** Absolute repo top-level directory, or null outside a repo. */
  topLevel(opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.topLevel(), opts)
  }

  /**
   * The shared `.git` dir (worktree-aware) as an absolute path, or null outside
   * a repo — see `gitCommonDir` in `verbs.ts`.
   */
  gitCommonDir(opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.gitCommonDir(), opts)
  }

  /**
   * This worktree's own `.git` dir as an absolute path, or null outside a repo
   * — see `gitDir` in `verbs.ts`. Not the constructor's `gitDir` option, which
   * binds the client to a repository.
   */
  gitDir(opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.gitDir(), opts)
  }

  /**
   * What a symbolic ref points at (full refname), or null when it is not one —
   * see `symbolicRef` in `verbs.ts`.
   */
  symbolicRef(ref: string, opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.symbolicRef(ref), opts)
  }

  /**
   * The primary checkout that owns this working directory, or null when it is
   * not inside a repository at all.
   *
   * Correct when the cwd is a linked worktree, which is what makes it worth a
   * method: `gitCommonDir()` is worktree-aware and absolute, so its parent is
   * the primary checkout in both cases. Callers kept rediscovering that pair.
   */
  mainCheckout(opts: GitSyncCallOptions = {}): string | null {
    const common = this.gitCommonDir(opts)
    return common === null ? null : dirname(common)
  }

  /** Current branch shortname, or null when detached. Throws outside a repo. */
  currentBranch(opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.currentBranch(), opts)
  }

  /**
   * `git status --porcelain` lines; `[]` on a clean tree, and a throw outside
   * a repository. `paths` narrows the report to those pathspecs.
   */
  statusPorcelain(opts: GitSyncCallOptions & StatusPorcelainOptions = {}): string[] {
    return this.exec(v.statusPorcelain(opts), opts)
  }

  /** Every changed or untracked file, from `status --porcelain -z`. */
  statusEntries(opts: GitSyncCallOptions = {}): StatusEntry[] {
    return this.exec(v.statusEntries(), opts)
  }

  /** True iff the working tree has any staged/unstaged/untracked change. */
  isDirty(opts: GitSyncCallOptions & StatusPorcelainOptions = {}): boolean {
    return this.statusPorcelain(opts).length > 0
  }

  /** Local branch shortnames matching `pattern` (all when omitted). */
  branches(pattern?: string | undefined, opts: GitSyncCallOptions = {}): string[] {
    return this.exec(v.branches(pattern), opts)
  }

  /** True iff local branch `name` exists (exact match). */
  branchExists(name: string, opts: GitSyncCallOptions = {}): boolean {
    return this.branches(name, opts).includes(name)
  }

  /** `git worktree list --porcelain`, parsed. Throws outside a repo. */
  worktrees(opts: GitSyncCallOptions = {}): Worktree[] {
    return this.exec(v.worktrees(), opts)
  }

  /** Merge base of two revs, or null when the histories are unrelated. */
  mergeBase(a: string, b: string, opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.mergeBase(a, b), opts)
  }

  /** Subject line of a ref's HEAD commit (`log -1 --format=%s`), or null. */
  logSubject(ref: string, opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.logSubject(ref), opts)
  }

  /** `git config --get <key>`, or null when unset. `scope` reads one file only. */
  configGet(key: string, opts: GitSyncCallOptions & ConfigGetOptions = {}): string | null {
    return this.exec(v.configGet(key, opts), opts)
  }

  /** Every value of a multi-valued key, verbatim; `[]` when unset. */
  configGetAll(key: string, opts: GitSyncCallOptions & ConfigGetOptions = {}): string[] {
    return this.exec(v.configGetAll(key, opts), opts)
  }

  /**
   * A key read as a boolean by git, or null when unset. A value git cannot
   * read as a boolean throws.
   */
  configGetBool(key: string, opts: GitSyncCallOptions & ConfigGetOptions = {}): boolean | null {
    return this.exec(v.configGetBool(key, opts), opts)
  }

  /** True iff `rev` resolves to an object (`cat-file -e`). */
  objectExists(rev: string, opts: GitSyncCallOptions = {}): boolean {
    return this.exec(v.objectExists(rev), opts)
  }

  /**
   * `ls-remote` rows for a remote (optionally pattern-filtered). `[]` means
   * the remote has no matching refs; an unreachable remote throws.
   * `timeoutMs` guards the network call.
   */
  lsRemote(
    remote: string,
    pattern?: string | undefined,
    opts: GitSyncCallOptions & LsRemoteOptions = {},
  ): RemoteRef[] {
    return this.exec(v.lsRemote(remote, pattern, opts), opts)
  }

  /**
   * The subset of `relPaths` that .gitignore rules ignore. Throws outside a
   * repository. Fail-closed callers: see `checkIgnore` in `verbs.ts`.
   */
  checkIgnore(relPaths: string[], opts: GitSyncCallOptions = {}): Set<string> {
    if (relPaths.length === 0) return new Set()
    return this.exec(v.checkIgnore(relPaths), opts)
  }

  /**
   * The ignore rule (file, line, pattern) behind each of `relPaths` that a rule mentions;
   * see `checkIgnoreVerbose` in `verbs.ts`. Throws outside a repository.
   */
  checkIgnoreVerbose(relPaths: string[], opts: GitSyncCallOptions = {}): IgnoreMatch[] {
    if (relPaths.length === 0) return []
    return this.exec(v.checkIgnoreVerbose(relPaths), opts)
  }

  /**
   * Tracked and/or untracked file paths (`ls-files -z`). Throws outside a
   * repository, where `topLevel()` returns null — see `lsFiles` in `verbs.ts`.
   */
  lsFiles(opts: GitSyncCallOptions & LsFilesOptions = {}): string[] {
    return this.exec(v.lsFiles(opts), opts)
  }

  /** Tracked files with their `ls-files -v` tag — see `lsFilesTagged` in `verbs.ts`. */
  lsFilesTagged(opts: GitSyncCallOptions = {}): TaggedFile[] {
    return this.exec(v.lsFilesTagged(), opts)
  }

  /**
   * The unified diff; `""` when nothing differs. A bad rev, or a cwd outside a
   * repository, throws. See `diffText` in `verbs.ts`.
   */
  diffText(rev?: string | undefined, opts: GitSyncCallOptions & DiffTextOptions = {}): string {
    return this.exec(v.diffText(rev, opts), opts)
  }

  /**
   * One untracked file rendered as an all-added diff. A path git cannot read
   * throws. See `diffAddedFile` in `verbs.ts`.
   */
  diffAddedFile(relPath: string, opts: GitSyncCallOptions = {}): string {
    return this.exec(v.diffAddedFile(relPath), opts)
  }

  /** `for-each-ref` rows, one line each, in the caller's format. */
  forEachRef(
    pattern: string | string[],
    opts: GitSyncCallOptions & ForEachRefOptions = {},
  ): string[] {
    return this.exec(v.forEachRef(pattern, opts), opts)
  }

  /**
   * Local refs matching `pattern` as `{ sha, ref }` rows — `ls-remote`'s
   * shape, for the repository you are standing in.
   */
  refs(pattern: string | string[], opts: GitSyncCallOptions = {}): RemoteRef[] {
    return parseRefRows(this.forEachRef(pattern, opts))
  }

  /** Changed paths (`diff --name-only -z`); `[]` when nothing changed. */
  diffNameOnly(opts: GitSyncCallOptions & DiffNameOnlyOptions = {}): string[] {
    return this.exec(v.diffNameOnly(opts), opts)
  }

  /** The `diff --stat` summary as raw stdout; empty when nothing changed. */
  diffStat(opts: GitSyncCallOptions & DiffStatOptions = {}): string {
    return this.exec(v.diffStat(opts), opts)
  }

  /** `git diff --check`: whitespace errors and conflict markers; findings are not a throw. */
  diffCheck(opts: GitSyncCallOptions & DiffCheckOptions = {}): DiffCheckResult {
    return this.exec(v.diffCheck(opts), opts)
  }

  /** Changed paths with their status; renames report the destination. */
  diffNameStatus(opts: GitSyncCallOptions & DiffNameStatusOptions = {}): DiffEntry[] {
    return this.exec(v.diffNameStatus(opts), opts)
  }

  /**
   * `git log` as raw stdout — the caller's `--format`, unsplit and untrimmed.
   * Throws on an empty repository; probe {@link Git.hasHistory} first, or use
   * `git.try.log()`. See `log` in `verbs.ts`.
   */
  log(opts: GitSyncCallOptions & LogOptions = {}): string {
    return this.exec(v.log(opts), opts)
  }

  /**
   * {@link Git.log}, split into non-blank lines.
   *
   * For a one-record-per-line `--format` only. A format that frames its own
   * records with `%x1e`, or interleaves `--name-status` blocks, must read the
   * bytes from `log`.
   */
  logLines(opts: GitSyncCallOptions & LogOptions = {}): string[] {
    return splitLines(this.log(opts))
  }

  /**
   * The entries of a tree at a rev (`ls-tree -z`); `[]` for a pathspec that
   * matches nothing, and a throw for a rev that does not resolve.
   */
  lsTree(rev: string, opts: GitSyncCallOptions & LsTreeOptions = {}): TreeEntry[] {
    return this.exec(v.lsTree(rev, opts), opts)
  }

  /**
   * The paths and statuses one commit changed. Pass `root` for a commit that
   * may be the first one — without it a root commit reports nothing.
   */
  diffTree(rev: string, opts: GitSyncCallOptions & DiffTreeOptions = {}): DiffEntry[] {
    return this.exec(v.diffTree(rev, opts), opts)
  }

  /**
   * Per-file line counts for one commit (`diff-tree --numstat -z`); `null`
   * counts for a binary file. Same options as {@link Git.diffTree}.
   */
  diffTreeNumstat(rev: string, opts: GitSyncCallOptions & DiffTreeOptions = {}): NumstatEntry[] {
    return this.exec(v.diffTreeNumstat(rev, opts), opts)
  }

  /** Matching lines (`git grep`); `[]` for no matches, a throw for a failure. */
  grep(pattern: string, opts: GitSyncCallOptions & GrepOptions = {}): string[] {
    return this.exec(v.grep(pattern, opts), opts)
  }

  /**
   * True iff `a` is an ancestor of `b`. A rev that does not resolve throws
   * rather than reading as "no".
   */
  isAncestor(a: string, b: string, opts: GitSyncCallOptions = {}): boolean {
    return this.exec(v.isAncestor(a, b), opts)
  }

  /** How far `tip` has diverged from `base`. See {@link AheadBehind}. */
  aheadBehind(base: string, tip: string, opts: GitSyncCallOptions = {}): AheadBehind {
    return this.exec(v.aheadBehind(base, tip), opts)
  }

  /** Configured remote names (`git remote`); `[]` when there are none. */
  remotes(opts: GitSyncCallOptions = {}): string[] {
    return this.exec(v.remote(), opts)
  }

  /**
   * The same as {@link Git.remotes}.
   *
   * @deprecated Use `remotes()`. The name `remote()` reads as one remote, but
   * it returns every remote name. It will be removed at 1.0.
   */
  remote(opts: GitSyncCallOptions = {}): string[] {
    return this.remotes(opts)
  }

  /**
   * A remote's fetch URL (push URL with `push`), or null when no remote by
   * that name exists.
   */
  remoteGetUrl(name: string, opts: GitSyncCallOptions & RemoteGetUrlOptions = {}): string | null {
    return this.exec(v.remoteGetUrl(name, opts), opts)
  }

  /** Every URL a remote has (push URLs with `push`); `[]` for an unknown remote. */
  remoteGetUrls(name: string, opts: GitSyncCallOptions & RemoteGetUrlOptions = {}): string[] {
    return this.exec(v.remoteGetUrls(name, opts), opts)
  }

  /**
   * The full refname the remote's HEAD points at, asked over the network; null
   * when the remote names none. See `remoteHead` in `verbs.ts`.
   */
  remoteHead(remote: string, opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.remoteHead(remote), opts)
  }

  /**
   * The coordinate (`owner`, `repo`, `host`, `port`) a remote's URL names, or
   * null when no such remote exists or its URL names no project. Any host: see
   * {@link parseRemoteUrl}. Outside a repository it throws, like
   * {@link Git.remoteGetUrl}. A composite helper, not a verb: it parses after
   * the verb runs, so it is written once per client.
   */
  remoteOwnerRepo(remote = 'origin', opts: GitSyncCallOptions = {}): RemoteCoordinate | null {
    const url = this.remoteGetUrl(remote, opts)
    return url === null ? null : parseRemoteUrl(url)
  }

  // ── mutations (nothing is absence — any non-zero exit throws) ─────────────

  /** `git fetch <remote> [refspec…]`. See {@link FetchOptions} for the flags. */
  fetch(
    remote: string,
    refspec?: string | string[] | undefined,
    opts: GitSyncCallOptions & FetchOptions = {},
  ): void {
    this.exec(v.fetch(remote, refspec, opts), opts)
  }

  /** Stage paths; `all` / `update` are `git add -A` / `-u`. */
  add(paths: string[], opts: GitSyncCallOptions & AddOptions = {}): void {
    this.exec(v.add(paths, opts), opts)
  }

  /**
   * Commit with an inline message, a message file or a stdin message (exactly
   * one). A failing hook throws; git writes hook output to stdout, which
   * `e.detail` reads.
   */
  commit(opts: GitSyncCallOptions & CommitOptions): void {
    this.exec(v.commit(opts), opts)
  }

  /** `git config <key> <value>` — the twin of {@link Git.configGet}. */
  configSet(key: string, value: string, opts: GitSyncCallOptions & ConfigSetOptions = {}): void {
    this.exec(v.configSet(key, value, opts), opts)
  }

  /** `git init [path]`; `path` defaults to this client's `cwd`. */
  init(path?: string | undefined, opts: GitSyncCallOptions & InitOptions = {}): void {
    this.exec(v.init(path, opts), opts)
  }

  /**
   * `git clone [--depth n] [--branch ref] <url> [dest]`.
   *
   * Runs from this client's `cwd`, which is where a relative `dest`
   * resolves. The clone itself is not a repository operation, so a client
   * bound to a store with `gitDir` is the wrong client to clone with.
   */
  clone(
    url: string,
    dest?: string | undefined,
    opts: GitSyncCallOptions & CloneOptions = {},
  ): void {
    this.exec(v.clone(url, dest, opts), opts)
  }

  /**
   * Push a refspec. A {@link ForceLease} pins `--force-with-lease`, which means
   * "nobody has touched this since I looked". `{forceWithLease: true}` adds the
   * bare flag, which is the unsafe form: it compares against the
   * remote-tracking ref, which a fetch in this same process may have just
   * updated. See `push` in `verbs.ts`.
   */
  push(
    remote: string,
    refspec: string,
    opts: GitSyncCallOptions & { forceWithLease?: boolean | ForceLease | undefined } = {},
  ): void {
    this.exec(v.push(remote, refspec, opts), opts)
  }

  /** `git clean -f`, plus `-d` with `directories`. Ignored files are kept. */
  clean(opts: GitSyncCallOptions & CleanOptions = {}): void {
    this.exec(v.clean(opts), opts)
  }

  /** `git reset --hard <rev>`. */
  resetHard(rev: string, opts: GitSyncCallOptions = {}): void {
    this.exec(v.resetHard(rev), opts)
  }

  /** Delete a local branch (`-d`, or `-D` with `{force: true}`). */
  deleteBranch(
    name: string,
    opts: GitSyncCallOptions & { force?: boolean | undefined } = {},
  ): void {
    this.exec(v.deleteBranch(name, opts), opts)
  }

  /**
   * Remove config section `name`; false when it was absent. See
   * `configRemoveSection` in `verbs.ts`.
   */
  configRemoveSection(name: string, opts: GitSyncCallOptions = {}): boolean {
    return this.exec(v.configRemoveSection(name), opts)
  }

  /** Delete `ref` only while it points at `expected`. See `deleteRef` in `verbs.ts`. */
  deleteRef(ref: string, opts: GitSyncCallOptions & { expected: string }): void {
    this.exec(v.deleteRef(ref, opts), opts)
  }

  /** `git worktree add [--detach] [-b branch] <path> [startPoint]`. */
  worktreeAdd(
    path: string,
    opts: GitSyncCallOptions & {
      branch?: string | undefined
      startPoint?: string | undefined
      detach?: boolean | undefined
    } = {},
  ): void {
    this.exec(v.worktreeAdd(path, opts), opts)
  }

  /** `git worktree remove [--force] <path>`. */
  worktreeRemove(
    path: string,
    opts: GitSyncCallOptions & { force?: boolean | undefined } = {},
  ): void {
    this.exec(v.worktreeRemove(path, opts), opts)
  }

  /** `git worktree move [--force] <from> <to>`. */
  worktreeMove(
    from: string,
    to: string,
    opts: GitSyncCallOptions & WorktreeMoveOptions = {},
  ): void {
    this.exec(v.worktreeMove(from, to, opts), opts)
  }

  /** `git worktree prune`. */
  worktreePrune(opts: GitSyncCallOptions = {}): void {
    this.exec(v.worktreePrune(), opts)
  }

  /** `git remote add <name> <url>`. */
  remoteAdd(name: string, url: string, opts: GitSyncCallOptions = {}): void {
    this.exec(v.remoteAdd(name, url), opts)
  }

  // ── integration ───────────────────────────────────────────────────────────

  /**
   * Merge `ref` into the current branch. A conflict is a value, not a throw:
   * the outcome is `clean` or `conflict`. Git refusing to merge at all still
   * throws `CommandFailed`.
   */
  merge(ref: string, opts: MergeOptions & GitSyncCallOptions = {}): MergeOutcome {
    return this.exec(v.merge(ref, opts), opts)
  }

  /** `git merge --abort`. Throws when no merge is in progress. */
  mergeAbort(opts: GitSyncCallOptions = {}): void {
    this.exec(v.mergeAbort(), opts)
  }

  /** Replay the current branch onto `onto`. Same outcome as {@link Git.merge}. */
  rebase(onto: string, opts: RebaseOptions & GitSyncCallOptions = {}): RebaseOutcome {
    return this.exec(v.rebase(onto, opts), opts)
  }

  /** `git rebase --abort`. Throws when no rebase is in progress. */
  rebaseAbort(opts: GitSyncCallOptions = {}): void {
    this.exec(v.rebaseAbort(), opts)
  }

  /** `git rebase --continue`, editor stubbed. May conflict again. */
  rebaseContinue(opts: GitSyncCallOptions = {}): RebaseOutcome {
    return this.exec(v.rebaseContinue(), opts)
  }

  /**
   * What merging `theirs` into `ours` would do — no index, no checkout, no
   * worktree. The cheap way to ask "would this conflict, and where", and the
   * merged `tree` it returns is real enough to build a commit from.
   */
  mergeTree(
    ours: string,
    theirs: string,
    opts: MergeTreeOptions & GitSyncCallOptions = {},
  ): MergeTreeOutcome {
    return this.exec(v.mergeTree(ours, theirs, opts), opts)
  }

  /**
   * `git ls-files -u`, parsed — which stages each conflicted path has, which
   * is what distinguishes both-modified from modify/delete. For the paths
   * alone, {@link Git.diffNameOnly} with `diffFilter: "U"` is cheaper.
   */
  lsFilesUnmerged(opts: GitSyncCallOptions = {}): UnmergedEntry[] {
    return this.exec(v.lsFilesUnmerged(), opts)
  }

  /**
   * Resolve conflicted `paths` to one side wholesale. An empty list returns
   * without running git. Silently does nothing for a path that is not
   * conflicted — see `checkoutSide` in `verbs.ts`.
   */
  checkoutSide(side: ConflictSide, paths: string[], opts: GitSyncCallOptions = {}): void {
    if (paths.length === 0) return
    this.exec(v.checkoutSide(side, paths), opts)
  }

  /** `git checkout [-f] [-b|-B <branch>] <ref>`. */
  checkout(ref: string, opts: CheckoutOptions & GitSyncCallOptions = {}): void {
    this.exec(v.checkout(ref, opts), opts)
  }
}
