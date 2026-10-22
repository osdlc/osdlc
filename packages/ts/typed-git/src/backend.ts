/**
 * The backend seam — what `AsyncGit` talks to, and the thing you swap when
 * git should not come from a subprocess.
 *
 * A backend takes a {@link GitRequest} — a plain, serializable description of
 * one git operation — and returns its typed result. That is deliberately not
 * argv: argv is a CLI detail, and a backend built on a pure-JavaScript git
 * implementation has no argv to receive. Describing the operation instead of
 * the invocation is what lets the same client drive either.
 *
 * It also means a request can be logged, queued, or replayed as data. The one
 * request that cannot cross that line is `raw`, which is argv by definition; a
 * non-CLI backend rejects it with {@link UnsupportedRequest}.
 *
 * The seam is experimental: `GitBackend`, `GitRequest`, `GitResults` and
 * `partialBackend`. Each new verb adds a request kind, which breaks a backend
 * written as an exhaustive switch. Such a change can land in a minor release.
 * `cliBackend` and `AsyncGit` are stable.
 */

import {
  resolveRunnerAsync,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
  type CommandResult,
} from '@osdlc/command-seam'

import * as v from './verbs.ts'
import {
  gate,
  mergeEnv,
  repoPrefix,
  type AddOptions,
  type AheadBehind,
  type CheckoutOptions,
  type CloneOptions,
  type CommitOptions,
  type ConfigGetOptions,
  type ConfigSetOptions,
  type ConflictSide,
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
  type MergeOptions,
  type MergeOutcome,
  type MergeTreeOptions,
  type MergeTreeOutcome,
  type NumstatEntry,
  type RebaseOptions,
  type RebaseOutcome,
  type RemoteGetUrlOptions,
  type RemoteRef,
  type CleanOptions,
  type DiffCheckOptions,
  type DiffCheckResult,
  type StatusEntry,
  type StatusPorcelainOptions,
  type TreeEntry,
  type TaggedFile,
  type UnmergedEntry,
  type Worktree,
  type WorktreeMoveOptions,
} from './verbs.ts'

/** Per-call concerns that are not part of the operation itself. */
export interface GitCallOptions {
  /**
   * Hard cap on the call; a backend that cannot enforce one may ignore it.
   * Without it there is no cap, and the default async runner has no output
   * cap either. An invalid value throws (sync) or rejects (async), as in command-seam:
   * `RangeError` for 0, a negative value or `NaN`; `TypeError` for a
   * non-number.
   */
  timeoutMs?: number | undefined
  /** Mid-flight cancellation, where the backend supports it. */
  signal?: AbortSignal | undefined
  /**
   * Entries merged over the parent environment for this call only. Per-call
   * rather than part of the request, like `timeoutMs`: it describes how the
   * invocation runs, not what operation was asked for.
   */
  env?: Record<string, string> | undefined
  /**
   * Cap on each output stream, in bytes. Past it the runner kills the child
   * and the call throws (sync) or rejects (async) with `CommandFailed`, so
   * cut-short output is never read as an answer. A backend that cannot
   * enforce it may ignore it. Without it the async runner has no cap and the
   * sync runner caps at 256 MB.
   */
  maxOutputBytes?: number | undefined
}

/**
 * One git operation, described rather than invoked.
 *
 * Optional fields are spelled `?: T | undefined` rather than `?: T`: a request
 * is normally built by spreading a caller's options, and under
 * `exactOptionalPropertyTypes` a present-but-undefined property is not the
 * same as an absent one. Both mean "not given" here.
 *
 * @experimental Each new verb adds a kind, in a minor release.
 */
export type GitRequest =
  | { kind: 'showAtRev'; rev: string; relPath: string }
  | { kind: 'revParse'; args: string[] }
  | { kind: 'resolveRef'; ref: string }
  | { kind: 'headRef' }
  // `topLevel` / `gitCommonDir` are their own kinds rather than a `revParse`
  // with fixed args because they answer a different question: for them a
  // non-repository is an answer (`null`), and for `revParse` it is a failure.
  | { kind: 'topLevel' }
  | { kind: 'gitCommonDir' }
  | { kind: 'gitDir' }
  | { kind: 'symbolicRef'; ref: string }
  | { kind: 'currentBranch' }
  | ({ kind: 'statusPorcelain' } & StatusPorcelainOptions)
  | { kind: 'statusEntries' }
  | { kind: 'branches'; pattern?: string | undefined }
  | { kind: 'worktrees' }
  | { kind: 'mergeBase'; a: string; b: string }
  | { kind: 'logSubject'; ref: string }
  | ({ kind: 'configGet'; key: string } & ConfigGetOptions)
  | ({ kind: 'configGetAll'; key: string } & ConfigGetOptions)
  | ({ kind: 'configGetBool'; key: string } & ConfigGetOptions)
  | { kind: 'objectExists'; rev: string }
  | ({ kind: 'lsRemote'; remote: string; pattern?: string | undefined } & LsRemoteOptions)
  | { kind: 'checkIgnore'; relPaths: string[] }
  | { kind: 'checkIgnoreVerbose'; relPaths: string[] }
  | { kind: 'isAncestor'; a: string; b: string }
  | { kind: 'aheadBehind'; base: string; tip: string }
  // The Tier 1 queries carry their verb's option bag rather than restating
  // its fields: the option types live in `verbs.ts` beside the argv they
  // build, and a request that spread them by hand would drift from it.
  | ({ kind: 'lsFiles' } & LsFilesOptions)
  | { kind: 'lsFilesTagged' }
  | ({ kind: 'forEachRef'; pattern: string | string[] } & ForEachRefOptions)
  | ({ kind: 'diffNameOnly' } & DiffNameOnlyOptions)
  | ({ kind: 'diffStat' } & DiffStatOptions)
  | ({ kind: 'diffCheck' } & DiffCheckOptions)
  | ({ kind: 'diffNameStatus' } & DiffNameStatusOptions)
  | ({ kind: 'log' } & LogOptions)
  | ({ kind: 'lsTree'; rev: string } & LsTreeOptions)
  | ({ kind: 'diffTree'; rev: string } & DiffTreeOptions)
  | ({ kind: 'diffTreeNumstat'; rev: string } & DiffTreeOptions)
  | ({ kind: 'grep'; pattern: string } & GrepOptions)
  | ({ kind: 'diffText'; rev?: string | undefined } & DiffTextOptions)
  | { kind: 'diffAddedFile'; relPath: string }
  | ({
      kind: 'fetch'
      remote: string
      refspec?: string | string[] | undefined
    } & FetchOptions)
  | ({ kind: 'add'; paths: string[] } & AddOptions)
  | ({ kind: 'commit' } & CommitOptions)
  | ({ kind: 'configSet'; key: string; value: string } & ConfigSetOptions)
  | { kind: 'configRemoveSection'; name: string }
  | ({ kind: 'init'; path?: string | undefined } & InitOptions)
  | ({ kind: 'clone'; url: string; dest?: string | undefined } & CloneOptions)
  | {
      kind: 'push'
      remote: string
      refspec: string
      forceWithLease?: boolean | ForceLease | undefined
    }
  | { kind: 'resetHard'; rev: string }
  | ({ kind: 'clean' } & CleanOptions)
  | { kind: 'deleteBranch'; name: string; force?: boolean | undefined }
  | { kind: 'deleteRef'; ref: string; expected: string }
  | {
      kind: 'worktreeAdd'
      path: string
      branch?: string | undefined
      startPoint?: string | undefined
      detach?: boolean | undefined
    }
  | { kind: 'worktreeRemove'; path: string; force?: boolean | undefined }
  | ({ kind: 'worktreeMove'; from: string; to: string } & WorktreeMoveOptions)
  | { kind: 'worktreePrune' }
  | ({ kind: 'merge'; ref: string } & MergeOptions)
  | { kind: 'mergeAbort' }
  | ({ kind: 'rebase'; onto: string } & RebaseOptions)
  | { kind: 'rebaseAbort' }
  | { kind: 'rebaseContinue' }
  | ({ kind: 'mergeTree'; ours: string; theirs: string } & MergeTreeOptions)
  | { kind: 'lsFilesUnmerged' }
  | { kind: 'checkoutSide'; side: ConflictSide; paths: string[] }
  | ({ kind: 'checkout'; ref: string } & CheckoutOptions)
  | { kind: 'remote' }
  | ({ kind: 'remoteGetUrl'; name: string } & RemoteGetUrlOptions)
  | ({ kind: 'remoteGetUrls'; name: string } & RemoteGetUrlOptions)
  | { kind: 'remoteHead'; remote: string }
  | { kind: 'remoteAdd'; name: string; url: string }
  | { kind: 'raw'; argv: string[]; input?: string | undefined; checked?: boolean | undefined }

/**
 * The result type each request kind resolves to.
 *
 * @experimental It grows with {@link GitRequest}.
 */
export interface GitResults {
  showAtRev: string | null
  revParse: string | null
  resolveRef: string | null
  headRef: string | null
  topLevel: string | null
  gitCommonDir: string | null
  gitDir: string | null
  symbolicRef: string | null
  currentBranch: string | null
  statusPorcelain: string[]
  statusEntries: StatusEntry[]
  branches: string[]
  worktrees: Worktree[]
  mergeBase: string | null
  logSubject: string | null
  configGet: string | null
  configGetAll: string[]
  configGetBool: boolean | null
  objectExists: boolean
  lsRemote: RemoteRef[]
  checkIgnore: Set<string>
  checkIgnoreVerbose: IgnoreMatch[]
  isAncestor: boolean
  aheadBehind: AheadBehind
  lsFiles: string[]
  lsFilesTagged: TaggedFile[]
  forEachRef: string[]
  diffNameOnly: string[]
  diffStat: string
  diffCheck: DiffCheckResult
  diffNameStatus: DiffEntry[]
  log: string
  lsTree: TreeEntry[]
  diffTree: DiffEntry[]
  diffTreeNumstat: NumstatEntry[]
  grep: string[]
  diffText: string
  diffAddedFile: string
  fetch: void
  add: void
  commit: void
  configSet: void
  configRemoveSection: boolean
  init: void
  clone: void
  push: void
  resetHard: void
  clean: void
  deleteBranch: void
  deleteRef: void
  worktreeAdd: void
  worktreeRemove: void
  worktreeMove: void
  worktreePrune: void
  merge: MergeOutcome
  mergeAbort: void
  rebase: RebaseOutcome
  rebaseAbort: void
  rebaseContinue: RebaseOutcome
  mergeTree: MergeTreeOutcome
  lsFilesUnmerged: UnmergedEntry[]
  checkoutSide: void
  checkout: void
  remote: string[]
  remoteGetUrl: string | null
  remoteGetUrls: string[]
  remoteHead: string | null
  remoteAdd: void
  raw: CommandResult
}

/** Every request kind, as a union of string literals. */
export type GitRequestKind = GitRequest['kind']

/**
 * Where git actually happens. Implement this to drive the client with
 * something other than the `git` CLI.
 *
 * A request resolves to its value — including the absence value (`null`,
 * `[]`, `false`) for a state the verb declares absent, such as an unset
 * config key. It rejects with the classified failure — or whatever error the backend
 * considers equivalent — when git failed rather than answered.
 *
 * @experimental New request kinds land in minor releases. Use
 * {@link partialBackend} rather than an exhaustive switch.
 */
export interface GitBackend {
  execute<R extends GitRequest>(
    cwd: string,
    request: R,
    opts?: GitCallOptions,
  ): Promise<GitResults[R['kind']]>
}

/** Thrown by a backend asked for an operation it cannot perform. */
export class UnsupportedRequest extends Error {
  readonly kind: string
  constructor(kind: string, backend: string) {
    super(`${backend} cannot perform '${kind}'`)
    this.name = 'UnsupportedRequest'
    this.kind = kind
  }
}

/** Translate a request into the CLI verb that performs it. */
function toVerb(request: GitRequest): GitVerb<unknown> {
  switch (request.kind) {
    case 'showAtRev':
      return v.showAtRev(request.rev, request.relPath)
    case 'revParse':
      return v.revParse(...request.args)
    case 'resolveRef':
      return v.resolveRef(request.ref)
    case 'headRef':
      return v.headRef()
    case 'topLevel':
      return v.topLevel()
    case 'gitCommonDir':
      return v.gitCommonDir()
    case 'gitDir':
      return v.gitDir()
    case 'symbolicRef':
      return v.symbolicRef(request.ref)
    case 'currentBranch':
      return v.currentBranch()
    case 'statusPorcelain':
      return v.statusPorcelain(request)
    case 'statusEntries':
      return v.statusEntries()
    case 'branches':
      return v.branches(request.pattern)
    case 'worktrees':
      return v.worktrees()
    case 'mergeBase':
      return v.mergeBase(request.a, request.b)
    case 'logSubject':
      return v.logSubject(request.ref)
    case 'configGet':
      return v.configGet(request.key, request)
    case 'configGetAll':
      return v.configGetAll(request.key, request)
    case 'configGetBool':
      return v.configGetBool(request.key, request)
    case 'objectExists':
      return v.objectExists(request.rev)
    case 'lsRemote':
      return v.lsRemote(request.remote, request.pattern, request)
    case 'isAncestor':
      return v.isAncestor(request.a, request.b)
    case 'aheadBehind':
      return v.aheadBehind(request.base, request.tip)
    case 'checkIgnore':
      return v.checkIgnore(request.relPaths)
    case 'checkIgnoreVerbose':
      return v.checkIgnoreVerbose(request.relPaths)
    case 'lsFiles':
      return v.lsFiles(request)
    case 'lsFilesTagged':
      return v.lsFilesTagged()
    case 'forEachRef':
      return v.forEachRef(request.pattern, request)
    case 'diffNameOnly':
      return v.diffNameOnly(request)
    case 'diffStat':
      return v.diffStat(request)
    case 'diffCheck':
      return v.diffCheck(request)
    case 'diffNameStatus':
      return v.diffNameStatus(request)
    case 'log':
      return v.log(request)
    case 'lsTree':
      return v.lsTree(request.rev, request)
    case 'diffTree':
      return v.diffTree(request.rev, request)
    case 'diffTreeNumstat':
      return v.diffTreeNumstat(request.rev, request)
    case 'grep':
      return v.grep(request.pattern, request)
    case 'diffText':
      return v.diffText(request.rev, request)
    case 'diffAddedFile':
      return v.diffAddedFile(request.relPath)
    case 'fetch':
      return v.fetch(request.remote, request.refspec, request)
    case 'add':
      return v.add(request.paths, request)
    case 'commit':
      return v.commit(request)
    case 'configSet':
      return v.configSet(request.key, request.value, request)
    case 'configRemoveSection':
      return v.configRemoveSection(request.name)
    case 'init':
      return v.init(request.path, request)
    case 'clone':
      return v.clone(request.url, request.dest, request)
    case 'push':
      return v.push(request.remote, request.refspec, {
        forceWithLease: request.forceWithLease,
      })
    case 'resetHard':
      return v.resetHard(request.rev)
    case 'clean':
      return v.clean(request)
    case 'deleteBranch':
      return v.deleteBranch(request.name, { force: request.force })
    case 'deleteRef':
      return v.deleteRef(request.ref, { expected: request.expected })
    case 'worktreeAdd':
      return v.worktreeAdd(request.path, request)
    case 'worktreeRemove':
      return v.worktreeRemove(request.path, { force: request.force })
    case 'worktreeMove':
      return v.worktreeMove(request.from, request.to, request)
    case 'worktreePrune':
      return v.worktreePrune()
    case 'merge':
      return v.merge(request.ref, request)
    case 'mergeAbort':
      return v.mergeAbort()
    case 'rebase':
      return v.rebase(request.onto, request)
    case 'rebaseAbort':
      return v.rebaseAbort()
    case 'rebaseContinue':
      return v.rebaseContinue()
    case 'mergeTree':
      return v.mergeTree(request.ours, request.theirs, request)
    case 'lsFilesUnmerged':
      return v.lsFilesUnmerged()
    case 'checkoutSide':
      return v.checkoutSide(request.side, request.paths)
    case 'checkout':
      return v.checkout(request.ref, request)
    case 'remote':
      return v.remote()
    case 'remoteGetUrl':
      return v.remoteGetUrl(request.name, request)
    case 'remoteGetUrls':
      return v.remoteGetUrls(request.name, request)
    case 'remoteHead':
      return v.remoteHead(request.remote)
    case 'remoteAdd':
      return v.remoteAdd(request.name, request.url)
    case 'raw': {
      const verb: GitVerb<CommandResult> = {
        argv: request.argv,
        // Unchecked `raw` bypasses the gate entirely (see `execute`), so this
        // declaration only matters for the checked door, where nothing is
        // absence.
        absent: [],
        parse: (r) => r,
      }
      if (request.input !== undefined) verb.input = request.input
      return verb
    }
  }
}

/**
 * The default backend: every request becomes a `git` subprocess, run through
 * an {@link AsyncCommandRunner} so the caller decides how spawning happens
 * (and tests inject a fake).
 */
export function cliBackend(
  opts: {
    runner?: AsyncCommandRunner | undefined
    /**
     * Which repository to drive, as `--git-dir` / `--work-tree` prefixed onto
     * every invocation. They live on the backend rather than on `GitRequest`
     * because they are CLI flags: a backend built on a pure-JavaScript git has
     * no `--git-dir` to receive, so "which repository" binds the thing that
     * spawns git.
     */
    gitDir?: string | undefined
    workTree?: string | undefined
    /**
     * Entries merged over the parent environment on every call this backend
     * makes, under any per-call `env`. Binds an identity or a
     * `GIT_SSH_COMMAND` once, rather than threading it through call sites.
     */
    env?: Record<string, string> | undefined
  } = {},
): GitBackend {
  const runner = resolveRunnerAsync('git', opts.runner)
  const prefix = repoPrefix(opts.gitDir, opts.workTree)
  return {
    async execute<R extends GitRequest>(
      cwd: string,
      request: R,
      callOpts: GitCallOptions = {},
    ): Promise<GitResults[R['kind']]> {
      const verb = toVerb(request)
      const runOpts: AsyncCommandRunOptions = { cwd }
      if (callOpts.timeoutMs !== undefined) runOpts.timeoutMs = callOpts.timeoutMs
      if (callOpts.signal !== undefined) runOpts.signal = callOpts.signal
      if (callOpts.maxOutputBytes !== undefined) runOpts.maxOutputBytes = callOpts.maxOutputBytes
      // Per-call entries win over the backend's, matching `Git`.
      const env = mergeEnv(opts.env, callOpts.env)
      if (env !== undefined) runOpts.env = env
      if (verb.input !== undefined) runOpts.input = verb.input
      // The verb's own entries (the C locale) win over the backend's and the call's.
      if (verb.env !== undefined) runOpts.env = { ...runOpts.env, ...verb.env }
      const argv = prefix.length === 0 ? verb.argv : [...prefix, ...verb.argv]
      const result = await runner.run(argv, runOpts)
      // Unchecked `raw` is the one door outside the gate: it hands back
      // whatever came out, at any exit code. Everything else uses the same
      // gate the sync client does.
      const req: GitRequest = request
      const gated = req.kind !== 'raw' || req.checked === true
      // The prefixed argv is what ran, so it is what a `CommandFailed` reports.
      const value = gated ? gate(verb, result, argv) : verb.parse(result, argv)
      // `GitResults` restates the verb table's return types for callers; the
      // two are kept in step by hand, which this cast is the seam for.
      return value as GitResults[R['kind']]
    },
  }
}

/**
 * Wrap a partial implementation: any request kind the object does not handle
 * rejects with {@link UnsupportedRequest} instead of failing as `undefined`.
 * The way to ship a backend that covers the operations it can and says so
 * about the rest.
 *
 * @experimental Part of the backend seam; see {@link GitBackend}.
 */
export function partialBackend(
  name: string,
  impl: Partial<{
    [K in GitRequestKind]: (
      cwd: string,
      request: Extract<GitRequest, { kind: K }>,
      opts: GitCallOptions,
    ) => Promise<GitResults[K]>
  }>,
): GitBackend {
  return {
    execute<R extends GitRequest>(
      cwd: string,
      request: R,
      opts: GitCallOptions = {},
    ): Promise<GitResults[R['kind']]> {
      const handler = impl[request.kind]
      if (handler === undefined) {
        return Promise.reject(new UnsupportedRequest(request.kind, name))
      }
      // The lookup narrows `impl` to the union of every handler signature;
      // the key that selected it is the same key that types the result, which
      // the indexed access cannot express. Sound by construction.
      const run = handler as unknown as (
        c: string,
        r: R,
        o: GitCallOptions,
      ) => Promise<GitResults[R['kind']]>
      return run(cwd, request, opts)
    },
  }
}
