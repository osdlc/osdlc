/**
 * What a host must supply that this package cannot know for itself.
 *
 * The three required ports each answer a question the host owns and this
 * package does not: where a named repository's checkout is on this machine,
 * how to run a shell verb, and whether a verb list from the project may run in
 * this repository at all (a trust decision). Two optional ports add conflict
 * resolvers. `generators` rebuild artifacts in process. `repair` is the last
 * step, called only when no fixed rule resolved the problem. The conflict
 * repair is offered only on a merge (a rebase falls back to a merge first). A
 * verify repair runs for either strategy. The optional `attempts` port records
 * failed updates across runs, and `confirmPush` asks before each rebase
 * force-push. A standalone run (see `defaults.ts`) supplies simple versions of
 * the same ports that work with any host.
 */

import type { CommandResult } from '@osdlc/command-seam'

/** Runs one shell verb in `cwd`. Tests inject a fake instead of a subprocess. */
export type RunVerb = (verb: string, cwd: string) => CommandResult

/**
 * A host-supplied rebuild step for the paths it claims. It runs after
 * `PrUpdateConfig.resolvers` and before repair.
 */
export interface Generator {
  /** Shown in reports and failure reasons. */
  name: string
  claims: (path: string) => boolean
  /** Rebuild every claimed artifact in `worktree`. A non-zero exit fails the update. */
  run: (worktree: string) => CommandResult
}

/** Which verb list a `verify` setting other than `none` names. */
export type VerifyWhich = 'check' | 'test'

export type RepairKind = 'conflict' | 'verify-failed'

export interface RepairRequest {
  kind: RepairKind
  pr: number
  base: string
  head: string
  /** The update worktree, where the repair edits files. */
  worktree: string
  /** Unclaimed conflicted paths for `conflict`; the update's changed paths for `verify-failed`. */
  paths: readonly string[]
  reason: string
}

export interface RepairResult {
  /** True when the repair claims it fixed the tree. The executor still checks. */
  ok: boolean
  note: string
}

/**
 * Edits the worktree to fix one problem. It must not commit, move HEAD or
 * create refs: the executor checks that, then stages, commits and verifies.
 * Async because the usual repair is an agent run, which takes minutes.
 */
export type Repair = (req: RepairRequest) => Promise<RepairResult>

/** Identifies one PR at one head and base sha. */
export interface AttemptKey {
  /** `owner/name`. */
  repo: string
  head: string
  headOid: string
  base: string
  baseOid: string
}

export interface AttemptRecord {
  failures: number
  /** The last failure's reason. */
  reason: string
  /** ISO time of the last failure. */
  at: string
}

/** Failed updates, kept across runs so a PR is not retried until its head or base moves. */
export interface AttemptStore {
  get: (key: AttemptKey) => AttemptRecord | null
  recordFailure: (key: AttemptKey, reason: string) => void
  /** Forget the record for this PR target (head into base). */
  clear: (repo: string, head: string, base: string) => void
}

/** What a rebase force-push is about to do to one PR branch. */
export interface PushPreview {
  number: number
  head: string
  base: string
  /** `<sha> <subject>` for each commit the push puts on the branch, newest first. */
  commits: string[]
  /** Commits on the remote branch that the push removes. */
  replaced: number
  /** `git diff --stat <remote>/<head> HEAD`. */
  diffstat: string
}

/** True to push. A throw counts as no. */
export type ConfirmPush = (preview: PushPreview) => boolean

export interface Ports {
  /**
   * Resolve `owner/name` to a local checkout path, or null when this machine
   * has none. Only asked about a repository the run was pointed at with
   * `--repo`, never used to widen the scope.
   */
  locate: (slug: string) => string | null
  /** Runs the shell verbs of resolvers and verify. See {@link RunVerb}. */
  runVerb: RunVerb
  /**
   * Resolve the verb list `pr_update.verify: <which>` runs before a push,
   * applying the host's trust rules for a verb list from the project. Throws
   * when the list is missing or may not run in this repository for this run.
   */
  resolveVerifyVerbs: (opts: { which: VerifyWhich; trust: boolean }) => Promise<readonly string[]>
  generators?: readonly Generator[] | undefined
  /** Called at most once per kind in `PrUpdateConfig.repair.on`. Absent means no repair. */
  repair?: Repair | undefined
  /** Absent means failures are not recorded and no PR is skipped for past failures. */
  attempts?: AttemptStore | undefined
  /**
   * Asked before each rebase force-push when the run sets `confirmPush`.
   * Absent means `runUpdate` asks with `terminalConfirmPush`.
   */
  confirmPush?: ConfirmPush | undefined
}
