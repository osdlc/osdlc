/**
 * What a host must supply that this package cannot know for itself.
 *
 * The four required ports each answer a question the host owns and this
 * package does not: where a named repository's checkout is on this machine,
 * where the run keeps what it makes for each repository, how to run a shell
 * verb, and whether a verb list from the project may run in this repository at
 * all (a trust decision). Two optional ports add conflict
 * resolvers. `generators` rebuild artifacts in process. `repair` is the last
 * step, called only when no fixed rule resolved the problem. The conflict
 * repair is offered only on a merge (a rebase falls back to a merge first). A
 * verify repair runs for either strategy. The optional `attempts` port records
 * failed updates across runs. The optional `lease` port locks each head branch
 * while it is updated. `confirmPush` asks before each rebase force-push. A standalone run (see
 * `defaults.ts`) supplies simple versions of the same ports that work with any host.
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
export type VerifyWhich = 'check' | 'test' | 'detect'

/** What `resolveVerifyVerbs` is asked: which list, for which repository. */
export interface VerifyVerbsRequest {
  which: VerifyWhich
  /** This run's `--trust`: the user's consent for this run. */
  trust: boolean
  /** `owner/name` of the repository whose PRs the verbs will verify. */
  repo: string
  /**
   * That repository's local checkout, the one the survey measured it in. The
   * verbs run in a temporary worktree of it, not in this directory. For
   * `detect` it is instead the PR's own update worktree, asked once per PR.
   */
  checkout: string
  /** The PR being verified; set only for `detect`. */
  pr?: number | undefined
}

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
  /**
   * Set for a `conflict` met at a rebase stop: the commit being replayed and
   * the base it is moving onto. The repair keeps that commit's intent, not the
   * branch's final state.
   */
  replaying?: { sha: string; subject: string; onto: string } | undefined
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
  /** Drop records too old to matter. Called once per `--apply` run, before records are written. */
  prune?: (() => void) | undefined
}

/** The outcome of asking for a branch's update lease. */
export type LeaseGrant = { ok: true; release: () => void } | { ok: false; holder: string }

/**
 * A lock on one head branch, so two runs do not update it at once. `acquire` never throws for a
 * lease someone else holds; it returns `{ ok: false, holder }` and the PR is skipped. `release`
 * must not throw.
 */
export interface BranchLease {
  acquire: (req: { head: string; pr: number }) => LeaseGrant
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

/**
 * A repository the run was pointed at with `--repo`, as the run resolved it:
 * lower-cased, with the host filled in when `--repo` named none.
 */
export interface LocateTarget {
  /** Without a port, as a remote's host is read: `--repo forgejo.local:3000/x/y` is asked for as `forgejo.local`. */
  host: string
  owner: string
  name: string
  /**
   * The port `--repo` named (`3000` for `forgejo.local:3000/x/y`), or unset for none. A checkout
   * or clone serves the target only when it is of that same port (the standalone `locate`).
   */
  port?: number | undefined
  /**
   * Whether the target's code host is GitHub (github.com, or the project root's host when that
   * is GitHub), so a managed clone could serve it. Unset when the caller does not say.
   */
  github?: boolean | undefined
}

/** Where a checkout came from: the project root, a checkout found on this machine, or a managed clone. */
export type CheckoutSource = 'root' | 'located' | 'clone'

/**
 * A checkout `locate` found, described in full. A bare path means the run's
 * `--remote` is read; this form names the remote the checkout itself uses.
 */
export interface FoundCheckout {
  /** The checkout, absolute. */
  path: string
  source: Exclude<CheckoutSource, 'root'>
  /** The remote to fetch from, measure against and push to, such as the `origin` that matched. */
  remote: string
  /**
   * Every other checkout of the same repository on this machine, absolute. The run is not served
   * from them, but the `unpushed_local` guard reads each one's worktrees through its `origin`, so
   * a branch with unpushed commits there is not rewritten. Absent means none.
   */
  others?: readonly string[] | undefined
}

/**
 * A repository the run updates, as {@link Ports.targetHome} is asked about it: the repository,
 * lower-cased, and the checkout serving the run. The trust gate is asked about every one but the
 * project root (`source: 'root'`).
 */
export interface TargetCheckout extends LocateTarget {
  /** The checkout the run is served from, absolute. */
  path: string
  /** Where {@link path} came from. */
  source: CheckoutSource
  /** The checkout's remote the run fetches from and pushes to. */
  remote: string
}

/**
 * Where a run keeps what it makes for one repository, outside its checkout. Each directory is
 * that repository's own. The checkout itself gets only git records: the run's worktree
 * registrations, its `pr-update/*` branches and, with a `git-ref` store, refs on its remote.
 */
export interface TargetHome {
  /** The target's run worktrees go here, one `<run>` directory each. */
  worktrees: string
  /** The target's kept worktrees go here, as `<number>/`, each with `<number>.json` beside it. */
  kept: string
  /**
   * The folder of the host's own that holds {@link kept}, such as `kept/` in pr-update's state
   * directory. A kept tree is removed only when the folders from here down to it pass the folder
   * rule: the person owns them, and no one else can write to them. Default {@link kept} itself.
   */
  keptRoot?: string | undefined
  /** The target's failed-attempt record. Absent means none is kept for it. */
  attempts?: AttemptStore | undefined
  /** The target's branch lease. Absent means no locking for it. */
  lease?: BranchLease | undefined
}

export interface Ports {
  /**
   * Resolve `owner/name` to a local checkout, or null when this machine has
   * none. Only asked about a repository the run was pointed at with `--repo`,
   * never used to widen the scope, and once per run for each.
   *
   * `repo` is lower-cased. `target` carries the host as well, for a locate
   * that tells hosts apart. A path means the checkout is read through the
   * run's `--remote`; a {@link FoundCheckout} names its own remote. The
   * standalone run's locate returns that form (see `defaults.ts`).
   *
   * `update` runs in the checkout it returns. Its run worktree and kept
   * worktrees go where {@link targetHome} says.
   */
  locate: (repo: string, target?: LocateTarget) => string | FoundCheckout | null
  /**
   * Where `update` keeps the run worktrees, kept worktrees, failed-attempt
   * record and lease of each repository it updates, the project root
   * included. Asked once per run for each one with a checkout. For the project
   * root, {@link attempts} and {@link lease} win where set. The standalone run
   * puts them in pr-update's osdlc directories (see `defaults.ts`).
   */
  targetHome: (target: TargetCheckout) => TargetHome
  /** Runs the shell verbs of resolvers and verify. See {@link RunVerb}. */
  runVerb: RunVerb
  /**
   * Resolve the verb list `pr_update.verify: <which>` runs before a push,
   * applying the host's trust rules for a verb list from the project. Throws
   * when the list is missing or may not run in this repository for this run.
   *
   * Asked once per repository the run surveyed in a local checkout, so
   * repositories that build differently can each get their own list. Every
   * call comes before the first update, and comes whether or not that
   * repository has a PR to update, so a refused list stops the run before
   * anything is pushed. It is not asked for a repository the trust gate
   * refused, or for one whose PR listing failed or whose drift could not be
   * measured and that has no PR to update.
   */
  resolveVerifyVerbs: (opts: VerifyVerbsRequest) => Promise<readonly string[]>
  generators?: readonly Generator[] | undefined
  /** Called at most once per kind in `PrUpdateConfig.repair.on`. Absent means no repair. */
  repair?: Repair | undefined
  /**
   * The project root's failed-attempt record, and the record of any repository whose
   * {@link TargetHome} has none. An error from it ends the run. Absent means the project root's
   * {@link TargetHome.attempts} serves; with neither, failures are not recorded and no PR is
   * skipped for past failures.
   */
  attempts?: AttemptStore | undefined
  /**
   * The project root's lease, taken around each PR's update in an `--apply` run. A PR whose
   * lease another run holds is skipped; an error from it ends the run. Absent means the project
   * root's {@link TargetHome.lease}, or no locking; a rehearsal never takes it.
   */
  lease?: BranchLease | undefined
  /**
   * Asked before each rebase force-push when the run sets `confirmPush`.
   * Absent means `runUpdate` asks with `terminalConfirmPush`.
   */
  confirmPush?: ConfirmPush | undefined
}
