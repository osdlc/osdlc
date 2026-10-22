/**
 * `sdlc task begin` — execute `/sdlc:task-work` Step 5 mechanically.
 *
 * Ported off `bun run ${CLAUDE_PLUGIN_ROOT}/skills/task-work/start_task.ts`
 * onto the op substrate ([[T-VAW3]] AC-2): that entry point's relative
 * `../../../../../lib/registry.ts` and sibling imports resolved only by
 * accident of the in-repo layout and broke once the plugin was copied outside
 * this checkout. `CliHints.rawArgv` (this op's own `main`/`defineCli` argv
 * parsing, unchanged) is the escape hatch — see its doc comment on `CliHints`
 * in `lib/registry.ts`.
 *
 * Starting a task writes NOTHING to the target branch ([[D-S30G-task-state-plane-split]]).
 * Acquiring the work IS the lease transition: this checks the task is eligible
 * off origin/<target>'s copy (task state lives on the branch the work targets:
 * a task readied or created only on an integration branch exists nowhere else),
 * CAS-REPLACEs the lease ref from `claimed` to `working`, and
 * resets the named feature branch (inside the worktree) onto the current tip
 * of the TARGET branch ([[T-NB98]]: `--target`, else
 * `orchestrator.target_branch`, else the repository default branch). Frontmatter `state` stays `open/ready` for the
 * task's whole in-flight life; the `## Post-mortem` stub the old start-commit
 * planted is planted at close time instead.
 *
 * Usage:
 *   sdlc task begin <task-path> --worktree <worktree-path> --branch <branch-name>
 *                   [--target <branch>]
 *
 * Exit codes:
 *   0  the lease transitioned to `working` and the feature branch was reset to
 *      the origin/<target> tip successfully.
 *   1  a precondition failed.
 *   23 (`UNMERGED_COMMITS`) the feature branch holds commits not on
 *      origin/<target>; the reset would discard them, so start refuses first.
 *   2  bad arguments.
 *   12 (`LEASE_CONFLICT`) the CAS-REPLACE on the lease ref failed. Surfaced as
 *      `LEASE-TRANSITION-FAILED ref=<ref>` on stderr.
 *
 * Exit code 3 (rebase conflict) is reserved but never emitted — nothing here
 * rebases.
 */

import { existsSync, realpathSync } from 'node:fs'
import { basename as pathBasename, dirname, join, relative, resolve } from 'node:path'

import { z } from 'zod'

import { defineCli, EXIT, type CliContext, type CliIo } from '@osdlc/cli-tool'
import { Git } from '@osdlc/typed-git'
import { isInside } from '@osdlc/path-guard'

import { defineOp, exitCodeFor, type OpCtx } from '@lib/registry'
import { isDir, isFile } from '@lib/util/fs'
import { mainCheckoutFrom } from '@lib/util/git'
import { fetchLease, transitionLease } from '@lib/services/lease/index'
import { todayUtc } from '@lib/util/date'
import { spawnRunner, type CommandRunner } from '@lib/util/command'
import { repr } from '@lib/util/diagnostics'

import { clearWorkRunFailures } from '@lib/services/orchestrator/work-runs'
import {
  assertBranchName,
  repoDefaultBranch,
  stateBranch,
} from '@lib/services/orchestrator/target-branch'

import { readTask, type TaskReadResult } from '../read.ts'
import { legacyCliContext } from '@lib/util/legacy-cli.ts'

// The post-mortem stub literals live in the entity package: starting a task
// writes nothing to main ([[D-S30G-task-state-plane-split]]), so `close-commit`
// is the only producer. Re-exported here so callers reaching for them through
// this module resolve to the one definition rather than a second copy.
export {
  POST_MORTEM_H2_RE,
  POST_MORTEM_H3S,
  POST_MORTEM_TBD_LINE,
  appendStubToBody,
  renderPostMortemStub,
} from '../post-mortem.ts'

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

// States that are valid inputs (a task that can be transitioned to
// in-progress). Mirrors the implementation-ready contract.
const ALLOWED_INPUT_STATES = new Set<string>([
  'planning/draft',
  'planning/proposed',
  'planning/backlog',
  'open/ready',
  'in-progress',
  'in-progress/blocked',
])

export class StartTaskError extends Error {
  readonly exitCode: number
  constructor(message: string, exitCode: number = EXIT.error) {
    super(message)
    this.name = 'StartTaskError'
    this.exitCode = exitCode
  }
}

function resolveMainRepo(worktree: string, override: string | null, runner: CommandRunner): string {
  if (override !== null) {
    return resolve(override)
  }
  const main = mainCheckoutFrom(worktree, { runner })
  if (main === null) {
    throw new StartTaskError(`not a git repository: ${worktree}`, EXIT.error)
  }
  return main
}

/**
 * Refuse to start a task whose state is not a pre-implementation one, off
 * origin/<target>'s copy as returned by the entity read layer
 * (`readTask(..., { at: "origin/<target>" })`).
 *
 * There is no state flip to plan ([[D-S30G-task-state-plane-split]]) — only
 * this precondition. It reads the wrapper's raw `fm` (present on both arms),
 * so a schema-drifted copy at origin/<target> still gates off its raw state.
 */
function assertStartEligible(res: TaskReadResult): void {
  if (res.fm === null) {
    throw new StartTaskError('task frontmatter is not a YAML mapping', EXIT.error)
  }

  const state = res.fm['state']
  if (typeof state !== 'string' || !ALLOWED_INPUT_STATES.has(state)) {
    const allowed = [...ALLOWED_INPUT_STATES].sort()
    throw new StartTaskError(
      `task state ${repr(state)} is not eligible for start ` +
        `(expected one of ${JSON.stringify(allowed)})`,
      EXIT.error,
    )
  }
}

function transitionLeaseToWorking(opts: {
  worktree: string
  taskId: string
  authority: string
}): void {
  // Read the authority-current lease for the idempotent "already at
  // working" no-op and the precondition check.
  const { lease: current } = fetchLease(opts.taskId, {
    cwd: opts.worktree,
    authority: opts.authority,
  })
  if (current.phase === 'working') {
    return
  }
  if (current.phase !== 'claimed') {
    throw new StartTaskError(
      `unexpected lease phase ${JSON.stringify(current.phase)} for ` +
        `task_id=${JSON.stringify(opts.taskId)}; expected 'claimed' before ` +
        `start_task transition`,
      EXIT.error,
    )
  }

  transitionLease(opts.taskId, 'working', {
    cwd: opts.worktree,
    authority: opts.authority,
    actor: 'op:task start',
  })
}

export interface StartTaskOptions {
  io: CliIo
  taskPath: string
  worktree: string
  branch: string
  mainRepoOverride: string | null
  today: string | null
  leaseAuthority?: string | null
  /** The branch to reset the feature branch onto (`origin/<target>`); `main` when omitted. */
  target?: string
}

export function startTask(opts: StartTaskOptions): number {
  const taskPath = resolve(opts.taskPath)
  const worktree = resolve(opts.worktree)

  if (!isFile(taskPath)) {
    throw new StartTaskError(`task file not found: ${taskPath}`, EXIT.error)
  }
  if (!isDir(worktree)) {
    throw new StartTaskError(`worktree not found: ${worktree}`, EXIT.error)
  }
  if (!opts.branch) {
    throw new StartTaskError('--branch must be non-empty', EXIT.usage)
  }

  const todayStr = opts.today || todayUtc()
  if (!DATE_RE.test(todayStr)) {
    throw new StartTaskError(
      `--today must be YYYY-MM-DD (got ${JSON.stringify(todayStr)})`,
      EXIT.usage,
    )
  }

  // One runner for the whole run: the entity read layer's `at:` seam, the
  // main-checkout probe, and the worktree client all share it.
  const runner = spawnRunner('git')
  const mainRepo = resolveMainRepo(worktree, opts.mainRepoOverride, runner)
  if (!existsSync(join(mainRepo, '.git'))) {
    throw new StartTaskError(
      `main repo working tree not found at ${mainRepo} (no .git directory)`,
      EXIT.error,
    )
  }

  // The task file lives in SOME planning root of the repo: the git root's, or a
  // nested one (`<gitroot>/solutions/x/docs/planning/tasks/`). The positional
  // may be this checkout's copy or the worktree's, so take its path relative to
  // ITS OWN checkout root and re-anchor that on `mainRepo` (a git root: the
  // `.git` check above). Every checkout of the repo shares one layout, so the
  // result is the same file's path on origin/<target>, read from the main
  // checkout's git root — never this checkout's own copy.
  const basename = pathBasename(taskPath).replace(/\.md$/, '')
  const taskCheckout = new Git(dirname(taskPath), { runner }).topLevel()
  if (taskCheckout === null) {
    throw new StartTaskError(`task file is not inside a git checkout: ${taskPath}`, EXIT.error)
  }
  const realCheckout = realpathSync(taskCheckout)
  const realTask = realpathSync(taskPath)
  if (!isInside(realCheckout, realTask)) {
    throw new StartTaskError(
      `task file ${taskPath} is outside its checkout root ${taskCheckout}`,
      EXIT.error,
    )
  }
  const taskRel = relative(realCheckout, realTask)

  // Source of truth is origin/<target>, NOT the (possibly stale or dirty) primary
  // checkout. Task state lives on the target branch, the one the work branches
  // from and PRs against ([[T-NB98]]); `main` only when nothing sets a target.
  // Read origin/<target>'s copy through the typed entity read layer to
  // check eligibility. Nothing is written back: the start transition is a lease
  // write, and frontmatter `state` stays `open/ready` for the task's whole
  // in-flight life ([[D-S30G-task-state-plane-split]]).
  const target = opts.target ?? 'main'
  assertBranchName(target)
  const fetchState = new Git(mainRepo, { runner }).try.fetch('origin', target, {
    quiet: true,
  })
  if (!fetchState.ok) {
    opts.io.stdout(fetchState.error.result.stdout)
    opts.io.stderr(fetchState.error.result.stderr || (fetchState.error.result.error ?? ''))
    throw new StartTaskError(`git fetch origin ${target} failed in ${mainRepo}`, EXIT.error)
  }
  const originRead = readTask(taskRel, {
    projectRoot: mainRepo,
    at: `origin/${target}`,
    git: runner,
  })
  if (originRead === null) {
    throw new StartTaskError(`task file not found on origin/${target}: ${taskRel}`, EXIT.error)
  }
  assertStartEligible(originRead)

  // The feature branch must already be checked out in the worktree, and must
  // carry nothing the reset below would throw away: checked BEFORE the lease
  // moves, so a refusal leaves the lease at `claimed`.
  const wt = new Git(worktree, { runner })
  const currentBranch = wt.headRef() ?? ''
  if (currentBranch !== opts.branch) {
    throw new StartTaskError(
      `worktree ${worktree} is on branch ${JSON.stringify(currentBranch)}, ` +
        `expected ${JSON.stringify(opts.branch)}`,
      EXIT.error,
    )
  }
  const fetchTip = wt.try.fetch('origin', target, { quiet: true })
  if (!fetchTip.ok) {
    opts.io.stdout(fetchTip.error.result.stdout)
    opts.io.stderr(fetchTip.error.result.stderr || (fetchTip.error.result.error ?? ''))
    throw new StartTaskError(`git fetch origin ${target} failed in ${worktree}`, EXIT.error)
  }
  // Only commits on neither origin/<target> nor origin/<default branch> are at
  // risk: a worktree cut from main or an older tip of a diverged integration
  // branch carries nothing the reset would lose. Refs that do not resolve are
  // skipped.
  const safeRefs = [...new Set([target, repoDefaultBranch(wt)])]
    .map((b) => `origin/${b}`)
    .filter((ref) => wt.resolveRef(ref) !== null)
  const unmerged = wt.logLines({ rev: 'HEAD', notRefs: safeRefs, format: '%H' })
  if (unmerged.length > 0) {
    throw new StartTaskError(
      `branch ${JSON.stringify(opts.branch)} has ${unmerged.length} commit(s) on neither ` +
        `origin/${target} nor the default branch; resetting it onto origin/${target} would ` +
        `discard them. Land them on ${target}, or move them to another branch, first.`,
      exitCodeFor('UNMERGED_COMMITS'),
    )
  }

  // Lease phase transition: claimed -> working.
  if (opts.leaseAuthority !== undefined && opts.leaseAuthority !== null) {
    try {
      transitionLeaseToWorking({
        worktree,
        taskId: basename,
        authority: opts.leaseAuthority,
      })
    } catch (exc) {
      if (exc instanceof StartTaskError) {
        throw exc
      }
      opts.io.stderr(
        `LEASE-TRANSITION-FAILED ref=refs/sdlc/tasks/${basename} ` + `reason=${reprError(exc)}\n`,
      )
      throw new StartTaskError(
        `lease transition failed for task_id=${JSON.stringify(basename)}: ${
          exc instanceof Error ? exc.message : String(exc)
        }`,
        exitCodeFor('LEASE_CONFLICT'),
      )
    }
  }

  // `task begin` lifts the orchestrator's hold on the task (three not-clean runs
  // in a row) when a person's session reaches it; a run the loop itself has in
  // flight is untouched.
  clearWorkRunFailures(mainRepo, basename)

  // Hard-reset the feature branch (inside the worktree) onto the origin/<target>
  // tip fetched above — no local branch involved. `try` so failure surfaces as
  // this script's own exit 1 with git's output relayed, not a bare
  // `CommandFailed`. A target missing on the remote failed the fetch earlier:
  // no fallback to another branch.
  const reset = wt.try.resetHard(`origin/${target}`)
  if (!reset.ok) {
    opts.io.stdout(reset.error.result.stdout)
    opts.io.stderr(reset.error.result.stderr || (reset.error.result.error ?? ''))
    throw new StartTaskError(`git reset --hard origin/${target} failed in ${worktree}`, EXIT.error)
  }

  // Emit a deterministic marker so callers can grep for success.
  opts.io.stdout(`STARTED: ${basename}\n`)
  return EXIT.ok
}

/**
 * Render an exception for the `reason=` field of the `LEASE-TRANSITION-FAILED`
 * marker line. Deliberately NOT `repr()` from `@lib/util/diagnostics`: that
 * formats *values*, and an `Error`'s `name`/`message` are non-enumerable, so
 * `repr(exc)` would collapse every exception to `{}`. This carries the
 * constructor name, which is the diagnostic's whole point.
 */
function reprError(exc: unknown): string {
  const msg = exc instanceof Error ? exc.message : String(exc)
  const name = exc instanceof Error ? exc.constructor.name : 'Error'
  return `${name}('${msg.replace(/'/g, "\\'")}')`
}

const cli = defineCli({
  name: 'sdlc task begin',
  summary: "Start a task's lease and reset its worktree onto the target branch tip.",
  flags: {
    worktree: {
      kind: 'string',
      valueName: 'path',
      required: true,
      help: "The task's worktree, already created and on its branch.",
    },
    branch: {
      kind: 'string',
      valueName: 'name',
      required: true,
      help: 'The branch that worktree must already be on.',
    },
    mainRepo: {
      kind: 'string',
      valueName: 'path',
      help: 'Override the main checkout. Default: resolved from the worktree.',
    },
    today: {
      kind: 'string',
      valueName: 'YYYY-MM-DD',
      help: "The promotion's last_reviewed date. Default: today, UTC.",
    },
    leaseAuthority: {
      kind: 'string',
      valueName: 'remote',
      help: 'Transition the task lease claimed -> working against this authority.',
    },
    target: {
      kind: 'string',
      valueName: 'branch',
      help: 'The branch to reset onto (origin/<branch>). Default: orchestrator.target_branch, else the repository default branch.',
    },
  },
  positionals: [{ name: 'task-file', required: true, help: 'The task markdown to start.' }],
})

export function main(argv: readonly string[], ctx: CliContext, defaultTarget = 'main'): number {
  const parsed = cli.parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') {
    ctx.io.stderr(`error: ${parsed.message}\n`)
    return EXIT.usage
  }
  const args = parsed.values
  try {
    return startTask({
      io: ctx.io,
      taskPath: parsed.positionals[0] as string,
      worktree: args.worktree,
      branch: args.branch,
      mainRepoOverride: args.mainRepo ?? null,
      today: args.today ?? null,
      leaseAuthority: args.leaseAuthority ?? null,
      target: args.target ?? defaultTarget,
    })
  } catch (exc) {
    if (exc instanceof StartTaskError) {
      ctx.io.stderr(`error: ${exc.message}\n`)
      return exc.exitCode
    }
    throw exc
  }
}

// ---------------------------------------------------------------------------
// Op definition — CliHints.rawArgv (see lib/registry.ts): this op's whole CLI
// surface (flags, error text, exit codes) is `main`, above, unchanged from the
// retired standalone script.
// ---------------------------------------------------------------------------

const input = z.object({ argv: z.array(z.string()) })
const output = z.object({ exitCode: z.number().int() })

export default defineOp({
  path: ['task', 'begin'],
  summary: "Start a task's lease and reset its worktree onto the target branch tip.",
  hidden: true,
  input,
  output,
  cli: { rawArgv: true },
  handler: ({ argv }, ctx: OpCtx) => ({
    exitCode: main(argv, legacyCliContext(ctx), stateBranch(ctx)),
  }),
})
