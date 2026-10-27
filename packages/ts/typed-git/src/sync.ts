/**
 * `Git` — the synchronous client, bound to one working directory and one
 * {@link CommandRunner}.
 *
 * It is synchronous on purpose. Git calls run one after another gain nothing
 * from being awaited, and a sync client does not force its callers to be
 * async. Use `AsyncGit` when the caller must not block, when calls run
 * concurrently, or when the work should run against a non-CLI backend.
 *
 * The contract is stated once in `./index.ts`: a declared absence returns a
 * value, everything else throws, `try` reports instead of throwing, and `raw`
 * skips the checks. Each verb's absence codes and parsing live in
 * `./verbs.ts`.
 *
 * Not here: any protocol with its own conflict rules, such as a lease
 * service's compare-and-swap ref operations. That is not general git.
 */

import { basename, dirname, resolve } from 'node:path'

import {
  spawnRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '@osdlc/command-seam'

import { versionedVerb } from './features.ts'
import { pinnedGitVersion, probeGitVersion, type GitVersion } from './git-version.ts'
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
  type CherryEntry,
  type CommitTreeOptions,
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
  type GitVerb,
  type GrepOptions,
  type InitOptions,
  type LogOptions,
  type IgnoreMatch,
  type LsFilesOptions,
  type LsRemoteOptions,
  type LsTreeOptions,
  type NumstatEntry,
  type PushPorcelainOptions,
  type PushReport,
  type RemoteRef,
  type CleanOptions,
  type DiffCheckOptions,
  type DiffCheckResult,
  type StatusEntry,
  type StatusPorcelainOptions,
  type TreeEntry,
  type Worktree,
  type WorktreeAddOptions,
  type WorktreeMoveOptions,
  type GcOptions,
  type PushOptions,
  type RemoteSetBranchesOptions,
  type RemoteSetHeadOptions,
} from './verbs.ts'

/**
 * Per-call concerns that are not part of the operation itself.
 *
 * The synchronous counterpart of `GitCallOptions`, without `signal`. A
 * `spawnSync` child cannot be cancelled while it runs, so an `AbortSignal`
 * here would do nothing. Use `timeoutMs` instead.
 */
export interface GitSyncCallOptions {
  /**
   * Time limit for the call, enforced by the runner. Without it there is no cap.
   * An invalid value throws, as in command-seam (`RangeError` for 0, negative
   * or NaN; `TypeError` for a non-number).
   */
  timeoutMs?: number | undefined
  /** Entries merged over the parent environment for this call only. */
  env?: Record<string, string> | undefined
  /**
   * Cap on each output stream, in bytes; 256 MB when omitted. Past it the
   * runner kills the child and the call throws the classified failure. command-seam's
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
  private readonly gitVersionOption: string | undefined
  private readonly pinnedVersion: GitVersion | undefined
  private tried: TriedSync<Git> | undefined
  private softened: Soft<Git> | undefined

  /**
   * `gitDir` / `workTree` name the repository this client works on. They are
   * added to every call as `--git-dir` / `--work-tree`. Use them for a repo
   * that is not the process's own tree, such as a bare store or a checkout
   * whose `.git` lives elsewhere.
   *
   * They belong to the client, not to one call, because the repository is
   * fixed for the client the same way `cwd` is. `AsyncGit` takes them on its
   * backend instead (`cliBackend({ gitDir })`). A non-CLI backend has no
   * `--git-dir` to receive, so the option goes on whatever spawns git. For
   * the sync client, that is the client itself.
   *
   * `env` works the same way for the environment. See `cliBackend` in
   * `backend.ts`.
   *
   * This client takes a `runner`, where `AsyncGit` takes a `backend`. The
   * default runner spawns the `git` found on an absolute `PATH` entry, so a
   * `git` file in the checkout cannot run in its place. Tests pass a fake
   * `CommandRunner`.
   *
   * Neither client has a default timeout. This client kills a child whose
   * output on one stream passes 256 MB; `AsyncGit` has no output cap. The
   * `maxOutputBytes` call option sets the cap per call on both.
   *
   * `gitVersion` pins the git version: `'2.55.0'`, or a whole
   * `git version …` line. Version-gated verbs then use it and never run
   * `git --version`, and {@link Git.version} returns it. Set it with a fake
   * runner, so the fake answers only the verbs under test. An unparsable
   * value throws a `RangeError` here.
   */
  constructor(
    cwd: string,
    opts: {
      runner?: CommandRunner | undefined
      gitDir?: string | undefined
      workTree?: string | undefined
      env?: Record<string, string> | undefined
      gitVersion?: string | undefined
    } = {},
  ) {
    this.cwd = cwd
    this.gitVersionOption = opts.gitVersion
    this.pinnedVersion = pinnedGitVersion(opts.gitVersion)
    this.runner = opts.runner ?? spawnRunner('git', { absolutePathOnly: true })
    this.boundGitDir = opts.gitDir
    this.workTree = opts.workTree
    this.env = opts.env
  }

  /**
   * The same client in a different directory, with the same runner,
   * repository options, client-level `env` and `gitVersion`.
   */
  at(cwd: string): Git {
    return new Git(cwd, {
      runner: this.runner,
      gitDir: this.boundGitDir,
      workTree: this.workTree,
      env: this.env,
      gitVersion: this.gitVersionOption,
    })
  }

  /**
   * Every method again, returning the failure instead of throwing.
   * `git.try.topLevel()` is a `Result<string | null, GitFailure>`: `{ ok: true, value }`
   * or `{ ok: false, error }` with a classified {@link GitFailure}.
   * A declared absence is `ok: true`. See `./outcome.ts`.
   *
   * The type leaves out `raw`, `rawChecked` and `at`, but at runtime the proxy
   * wraps them too: `git.try.raw(argv)` returns `{ ok: true, value }`. Call
   * those three on the client itself.
   */
  get try(): TriedSync<Git> {
    return (this.tried ??= triedSync(this))
  }

  /**
   * Each verb with an absence value (`null`, `[]` or `false`) returns that
   * value when git fails, instead of throwing. It is for callers that treat
   * "could not ask" the same as "nothing there": `git.soft.resolveRef(x)` is
   * `null` both for a missing ref and for a broken repo. Use `try` when the
   * failure itself matters.
   *
   * As with `try`, the proxy also wraps `raw`, `rawChecked` and `at` at
   * runtime, though the type leaves them out.
   */
  get soft(): Soft<Git> {
    // Explicit type argument: otherwise TS 5.x infers the polymorphic `this`.
    return (this.softened ??= softSync<Git>(this, SOFT_TABLE))
  }

  // ── escape hatch ──────────────────────────────────────────────────────────

  /** Runs any git argv without checking the exit code. For git commands that have no verb here. */
  raw(
    argv: string[],
    opts: GitSyncCallOptions & { input?: string | undefined } = {},
  ): CommandResult {
    return this.runner.run(this.argv(argv), this.runOpts(opts))
  }

  /**
   * Runs any git argv and throws the classified failure on a non-zero exit, or
   * on output cut short at the output cap or a timeout, as every verb does.
   *
   * Several git commands write the reason for a failure to stdout, not stderr:
   * a rejecting hook, `commit` on a clean tree, `apply --check`. Report
   * `e.failure.detail`, which holds both streams.
   */
  rawChecked(
    argv: string[],
    opts: GitSyncCallOptions & { input?: string | undefined } = {},
  ): CommandResult {
    // Through `gate`, like `AsyncGit.rawChecked`. The seam's `runChecked`
    // checks only the exit code, so it would accept cut-short output.
    const verb: GitVerb<CommandResult> = { argv, absent: [], parse: (r) => r }
    if (opts.input !== undefined) verb.input = opts.input
    return this.exec(verb, opts)
  }

  /** The verb's argv, after this client's `--git-dir` / `--work-tree` flags. */
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

  /**
   * Run one verb from the table and check its result with `gate`. A verb that
   * `needs` a git feature first gets the form this runner's git can run (see
   * `versionedVerb` in `features.ts`), which probes the version once.
   */
  private exec<T>(gated: GitVerb<T>, opts: GitSyncCallOptions = {}): T {
    const run = this.runOpts(opts)
    let verb = gated
    if (gated.needs !== undefined) {
      const prefix = repoPrefix(this.boundGitDir, this.workTree)
      // A failed probe names this verb's argv, not `--version`.
      const have =
        this.pinnedVersion ??
        probeGitVersion(this.runner, {
          env: run.env,
          timeoutMs: run.timeoutMs,
          report: [...prefix, ...gated.argv],
        })
      verb = versionedVerb(gated, have, prefix)
    }
    if (verb.input !== undefined) run.input = verb.input
    // The verb's own entries (the C locale) win over the client's and the call's.
    if (verb.env !== undefined) run.env = { ...run.env, ...verb.env }
    // The prefixed argv is what ran, so it is what a `CommandFailed` reports.
    const argv = this.argv(verb.argv)
    return gate(verb, this.runner.run(argv, run), argv)
  }

  // ── queries ───────────────────────────────────────────────────────────────

  /**
   * The git this client's runner runs, from `git --version`. Probed on the
   * first call (or the first version-gated verb) and cached for the runner,
   * so a client that never asks never spawns it. Throws the classified
   * failure when git cannot run (`not-installed`), and an `exit` failure when
   * the output is not a version line. With the `gitVersion` option it is that
   * version, and nothing runs.
   */
  version(opts: GitSyncCallOptions = {}): GitVersion {
    if (this.pinnedVersion !== undefined) return this.pinnedVersion
    const run = this.runOpts(opts)
    return probeGitVersion(this.runner, {
      env: run.env,
      timeoutMs: run.timeoutMs,
      report: ['--version'],
    })
  }

  /** A file's content at a rev (`git show <rev>:<relPath>`), null if absent. */
  showAtRev(rev: string, relPath: string, opts: GitSyncCallOptions = {}): string | null {
    return this.exec(v.showAtRev(rev, relPath), opts)
  }

  /**
   * A file's content at a rev, throwing when the path is missing. Use it when
   * a missing file is an error. See `showAtRevChecked` in `verbs.ts`.
   */
  showAtRevChecked(rev: string, relPath: string, opts: GitSyncCallOptions = {}): string {
    return this.exec(v.showAtRevChecked(rev, relPath), opts)
  }

  /**
   * Trimmed `git rev-parse <args>` output, for a query no other verb covers. See `revParse` in `verbs.ts`; for a ref, prefer
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
   * True iff this repository has any history: `resolveRef("HEAD") !== null`.
   *
   * Use it to check that a repository is readable. False means only an unborn
   * HEAD. An unreadable store throws rather than reading as empty, which is
   * why this is not `objectExists("HEAD")`.
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
   * It is correct when the cwd is a linked worktree too: `gitCommonDir()` is
   * worktree-aware and absolute. When that store is `<checkout>/.git`, its
   * parent is the answer. Otherwise (a submodule's `.git/modules/<name>`, a
   * `--separate-git-dir` clone, a bare store) it is `core.worktree`, this
   * checkout when the cwd is the main worktree, or the first non-bare
   * `worktree list` entry. A bare store with no main checkout answers null.
   */
  mainCheckout(opts: GitSyncCallOptions = {}): string | null {
    const common = this.gitCommonDir(opts)
    if (common === null) return null
    if (basename(common) === '.git') return dirname(common)
    const configured = this.configGet('core.worktree', opts)
    if (configured !== null) return resolve(common, configured)
    if (this.gitDir(opts) === common) return this.topLevel(opts)
    const main = this.worktrees(opts)[0]
    return main === undefined || main.bare ? null : main.path
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

  /**
   * True iff anything is staged (`diff --cached --quiet` exits 1). On an
   * unborn HEAD the index is compared against the empty tree. See
   * `hasStagedChanges` in `verbs.ts`.
   */
  hasStagedChanges(opts: GitSyncCallOptions = {}): boolean {
    return this.exec(v.hasStagedChanges(), opts)
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
   * `timeoutMs` limits the network call.
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

  /**
   * Commits on `head` (default `HEAD`) that `upstream` lacks, each marked by
   * whether `upstream` has the same patch. See {@link CherryEntry}.
   */
  cherry(upstream: string, head?: string, opts: GitSyncCallOptions = {}): CherryEntry[] {
    return this.exec(v.cherry(upstream, head), opts)
  }

  /** Write a commit for `tree` and return its sha; no ref moves. Needs a git identity. */
  commitTree(tree: string, commitOpts: CommitTreeOptions, opts: GitSyncCallOptions = {}): string {
    return this.exec(v.commitTree(tree, commitOpts), opts)
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
   * {@link Git.remoteGetUrl}. It is a helper, not a verb: it parses after the
   * verb runs, so each client has its own copy.
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
   * one). A failing hook throws. git writes hook output to stdout, which
   * `e.failure.detail` includes.
   */
  commit(opts: GitSyncCallOptions & CommitOptions): void {
    this.exec(v.commit(opts), opts)
  }

  /** `git config <key> <value>`, the write counterpart of {@link Git.configGet}. */
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
   * "push only if the remote ref is still where I saw it". `{forceWithLease: true}` adds the
   * bare flag, which is the unsafe form: it compares against the
   * remote-tracking ref, which a fetch in this same process may have just
   * updated. `{delete: true}` deletes `refspec` on the remote. See `push` in
   * `verbs.ts`.
   */
  push(remote: string, refspec: string, opts: GitSyncCallOptions & PushOptions = {}): void {
    this.exec(v.push(remote, refspec, opts), opts)
  }

  /**
   * `git push --porcelain`, read into one result per ref. A rejected ref comes
   * back with a typed `rejection` rather than a throw; a failure that reaches
   * no ref (an unknown remote, auth, network) still throws. See
   * `pushPorcelain` in `verbs.ts`.
   */
  pushPorcelain(
    remote: string,
    refspec: string | string[],
    opts: GitSyncCallOptions & PushPorcelainOptions = {},
  ): PushReport {
    return this.exec(v.pushPorcelain(remote, refspec, opts), opts)
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

  /**
   * `git worktree add [--detach] [-b|-B branch] <path> [startPoint]`.
   * `resetBranch` picks `-B`: create `branch`, or reset it if it exists.
   */
  worktreeAdd(path: string, opts: GitSyncCallOptions & WorktreeAddOptions = {}): void {
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

  /** `git worktree unlock <path>`. */
  worktreeUnlock(path: string, opts: GitSyncCallOptions = {}): void {
    this.exec(v.worktreeUnlock(path), opts)
  }

  /** `git worktree prune`. */
  worktreePrune(opts: GitSyncCallOptions = {}): void {
    this.exec(v.worktreePrune(), opts)
  }

  /** `git remote add <name> <url>`. */
  remoteAdd(name: string, url: string, opts: GitSyncCallOptions = {}): void {
    this.exec(v.remoteAdd(name, url), opts)
  }

  /**
   * `git remote set-head <remote> <branch> | --auto | --delete` — exactly one
   * of `branch`, `auto` or `delete`. See `remoteSetHead` in `verbs.ts`.
   */
  remoteSetHead(remote: string, opts: GitSyncCallOptions & RemoteSetHeadOptions): void {
    this.exec(v.remoteSetHead(remote, opts), opts)
  }

  /** `git remote set-branches [--add] <remote> <branch…>`; an empty list throws. */
  remoteSetBranches(
    remote: string,
    branches: string[],
    opts: GitSyncCallOptions & RemoteSetBranchesOptions = {},
  ): void {
    this.exec(v.remoteSetBranches(remote, branches, opts), opts)
  }

  /** `git gc [--auto] [--aggressive] [--prune=<date> | --no-prune] [--quiet]`. */
  gc(opts: GitSyncCallOptions & GcOptions = {}): void {
    this.exec(v.gc(opts), opts)
  }

  // ── integration ───────────────────────────────────────────────────────────

  /**
   * Merge `ref` into the current branch. A conflict is a value, not a throw:
   * the outcome is `clean` or `conflict`. Git refusing to merge at all still
   * throws the classified failure.
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
   * worktree. It is the cheap way to ask "would this conflict, and where". The
   * merged `tree` it returns is a real object you can build a commit from.
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
