/**
 * `repo-cleaner` — what has been merged, and what can go away.
 *
 * Four verbs over one set of sweep filters:
 *
 *   status  (the default) inventory and classify; read-only but for the fetch
 *   summary the same sweep as counts: totals, merged, delete, review, keep
 *   plan    write the deletable rows as a plan, to stdout or a file
 *   apply   re-check, show the steps, ask, then delete
 *
 * `apply` works from a saved plan (`--plan`) or sweeps first. Either way it
 * re-checks every row, prints the steps it would run and asks before deleting;
 * `--yes` skips the question. Without a terminal and without `--yes` it
 * refuses rather than deleting. Scope is opt-in: the sweep covers the
 * repository you are standing in unless a path says otherwise.
 *
 * Exit codes:
 *   0   swept; or apply ran, was declined, or had nothing to run
 *   1   failed against the state it found
 *   2   cannot run as typed
 *   10  nothing to sweep: no entry named a repository
 *   11  apply stopped at a failed step; the receipt says which
 */

import { readSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'

import { EXIT, askYesNo, canPrompt, defineCli, type CliContext } from '@osdlc/cli-tool'
import { Git } from '@osdlc/typed-git'

import { resolveBranch } from './branches.ts'
import { ApplyArgumentError, applyPlan, parseGrant, parseRowRef, type Grant } from './apply.ts'
import {
  PLAN_VERSION,
  fileStamp,
  parsePlan,
  planRepo,
  readPlan,
  writePlan,
  type Plan,
} from './plan.ts'
import type { Receipt, RowRef } from './receipt.ts'
import {
  proposedCommands,
  renderCountsJson,
  renderCountsText,
  renderJson,
  renderReceipt,
  renderSummary,
  renderText,
} from './render.ts'
import { sweepRepos, type SweepReposOptions } from './sweep.ts'
import type { Scope, SweepResult } from './types.ts'

const EXIT_NOTHING_TO_SWEEP = 10
const EXIT_STEP_FAILED = 11

const NAME = 'repo-cleaner'

/** The `--only` names, and the sweep scope each selects. */
const ONLY: Record<string, Scope> = {
  worktrees: 'worktrees',
  branches: 'local-branches',
  remotes: 'remote-branches',
}

/** The flags every verb that sweeps takes. */
const SWEEP_FLAGS = {
  only: {
    kind: 'list',
    valueName: 'list',
    help: `comma-separated: ${Object.keys(ONLY).join(', ')} (default: all)`,
  },
  branch: {
    kind: 'string',
    valueName: 'name|HEAD',
    help: 'only this branch of this repository: its worktree, local and remote branch',
  },
  remote: {
    kind: 'string',
    valueName: 'name',
    help: 'remote to measure against (default: origin)',
  },
  gh: { kind: 'boolean', negatable: true, help: 'classify on git evidence alone' },
  fetch: {
    kind: 'boolean',
    negatable: true,
    help: 'classify on the remote-tracking refs already on disk',
  },
} as const

const PATHS = [
  {
    name: 'path',
    variadic: true,
    help: 'a checkout, or a directory containing checkouts (default: the one you are in)',
  },
] as const

const OUTPUT = {
  kind: 'enum',
  choices: ['text', 'json'] as const,
  valueName: 'form',
  default: 'text',
  help: 'report format',
} as const

const statusCli = () =>
  defineCli({
    name: NAME,
    summary:
      'Inventory branches, worktrees and remote branches, and say which have been merged into ' +
      'the default branch. Fetches each remote first; deletes nothing.',
    positionals: PATHS,
    flags: {
      ...SWEEP_FLAGS,
      keep: { kind: 'boolean', help: 'include safe-to-keep rows in the report' },
      commands: { kind: 'boolean', help: 'print the proposed commands only' },
      output: OUTPUT,
    },
    epilogue: `commands:
  ${NAME} [status]   this report (the default)
  ${NAME} summary    counts per repository: total, merged, delete, review, keep
  ${NAME} plan       write the deletable rows as a plan
  ${NAME} apply      re-check, show the steps, ask, delete
  ${NAME} dev        run ${NAME} from a development checkout

Each command takes --help. A checkout directory named like a command is
swept as ./<name>.`,
  })

const summaryCli = () =>
  defineCli({
    name: `${NAME} summary`,
    summary:
      'Count local branches, worktrees and remote branches per repository: how many there are, ' +
      'how many are merged into the default branch, and how many would be deleted, reviewed or kept.',
    positionals: PATHS,
    flags: { ...SWEEP_FLAGS, output: OUTPUT },
    epilogue:
      'merged: the work is on the default branch. Rows kept for structure (the default ' +
      'branch, the primary worktree) are counted in total but not judged merged.',
  })

const planCli = () =>
  defineCli({
    name: `${NAME} plan`,
    summary:
      'Sweep, and write the deletable rows as a plan for `apply`: each row with the facts its ' +
      'verdict rests on, so `apply` can tell what moved since.',
    positionals: PATHS,
    flags: {
      ...SWEEP_FLAGS,
      out: {
        kind: 'string',
        short: 'o',
        valueName: 'file',
        default: '-',
        help: 'write the plan here; - is stdout (the default)',
      },
    },
    epilogue: 'The one-line summary goes to stderr, so stdout carries only the plan.',
  })

const applyCli = () =>
  defineCli({
    name: `${NAME} apply`,
    summary:
      'Delete what a sweep or a saved plan found deletable: re-check each row, show the steps, ' +
      'ask, then delete compare-and-swap, verifying each step.',
    positionals: PATHS,
    flags: {
      ...SWEEP_FLAGS,
      plan: {
        kind: 'string',
        valueName: 'file',
        help: 'apply this plan (- reads stdin) instead of sweeping',
      },
      row: {
        kind: 'list',
        valueName: 'category:id',
        default: [],
        commaSeparated: false,
        help: 'apply only this row, e.g. local_branch:feat/x; repeatable (default: every row)',
      },
      allow: {
        kind: 'list',
        valueName: 'risk[=category:id]',
        default: [],
        commaSeparated: false,
        help: 'accept a risk for every row, or for one row; repeatable',
      },
      repoRoot: {
        kind: 'string',
        valueName: 'path',
        help: 'apply only the plan repository rooted here',
      },
      receipt: {
        kind: 'string',
        valueName: 'file',
        help: 'write the receipt here (default: beside a --plan file; none otherwise)',
      },
      yes: { kind: 'boolean', short: 'y', help: 'delete without asking' },
      dryRun: { kind: 'boolean', help: 're-check and print the steps; delete nothing' },
      output: OUTPUT,
    },
    epilogue: `risks: abandon-unmerged, discard-changes, confirm-open-pr
A row that carries a risk you did not --allow is dropped, never deleted.`,
  })

/**
 * Asks a yes/no question, or returns null when there is no one to ask. `main`
 * takes it as a parameter so a test can answer.
 */
export type Confirm = (question: string) => boolean | null

const terminalConfirm: Confirm = (question) => (canPrompt() ? askYesNo(question) : null)

export interface MainDeps {
  confirm?: Confirm
  /** Reads `--plan -`. Defaults to stdin. */
  readStdin?: () => string
}

const PAUSE = new Int32Array(new SharedArrayBuffer(4))

/**
 * All of stdin, synchronously. A pipe can be non-blocking and still empty
 * when the writer upstream has not produced anything yet; `readFileSync(0)`
 * fails with EAGAIN there, so this waits and retries until end of input.
 */
function readAllStdin(): string {
  const chunks: Buffer[] = []
  const buf = Buffer.alloc(65536)
  for (;;) {
    let n: number
    try {
      n = readSync(0, buf, 0, buf.length, null)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EAGAIN') throw e
      Atomics.wait(PAUSE, 0, 0, 50)
      continue
    }
    if (n === 0) return Buffer.concat(chunks).toString('utf8')
    chunks.push(Buffer.from(buf.subarray(0, n)))
  }
}

function usageError(ctx: CliContext, name: string, message: string): number {
  ctx.io.stderr(`${name}: ${message}\n`)
  return EXIT.usage
}

function failure(ctx: CliContext, err: unknown): number {
  ctx.io.stderr(`${NAME}: ${err instanceof Error ? err.message : String(err)}\n`)
  return EXIT.error
}

interface SweepValues {
  only?: string[] | undefined
  branch?: string | undefined
  remote?: string | undefined
  gh: boolean
  fetch: boolean
}

type Swept =
  | { ok: true; result: SweepResult; branch: string | undefined; values: SweepValues }
  | { ok: false; code: number }

/** Validate the sweep flags and run the sweep, or answer with the exit code. */
function sweep(
  name: string,
  v: SweepValues,
  paths: readonly string[],
  ctx: CliContext,
  render: (result: SweepResult) => string,
): Swept {
  const only = v.only?.filter((s) => s !== '')
  const unknown = (only ?? []).filter((s) => !(s in ONLY))
  if (unknown.length > 0) {
    return {
      ok: false,
      code: usageError(ctx, name, `unknown --only value(s): ${unknown.join(', ')}`),
    }
  }
  if (v.branch !== undefined && paths.length > 0) {
    return {
      ok: false,
      code: usageError(ctx, name, '--branch sweeps this repository only; drop the paths'),
    }
  }

  let branch: string | undefined
  try {
    branch = v.branch === undefined ? undefined : resolveBranch(v.branch, new Git(ctx.cwd))
  } catch (err) {
    return { ok: false, code: failure(ctx, err) }
  }

  const options: SweepReposOptions = {
    baseDir: ctx.cwd,
    cwd: ctx.cwd,
    noGh: !v.gh,
    fetch: v.fetch,
    branch,
    // Mid-walk, while the wait is happening — the summary comes too late to
    // explain why the tool appeared to hang.
    onWarn: (message) => ctx.io.stderr(`${NAME}: ${message}\n`),
    ...(only === undefined ? {} : { scope: only.map((s) => ONLY[s]!) }),
    ...(v.remote === undefined ? {} : { remote: v.remote }),
  }
  const result = sweepRepos(paths.length > 0 ? paths : [ctx.cwd], options)
  if (branch !== undefined && result.repos.length > 1) {
    const err = new Error(
      `--branch sweeps one repository; ${result.repos.length} found under ${ctx.cwd}`,
    )
    return { ok: false, code: failure(ctx, err) }
  }
  const refused = branch === undefined ? null : (result.repos[0]?.error ?? null)
  if (refused !== null) return { ok: false, code: failure(ctx, new Error(refused)) }
  if (result.repos.length === 0) {
    ctx.io.stdout(render(result))
    return { ok: false, code: EXIT_NOTHING_TO_SWEEP }
  }
  return { ok: true, result, branch, values: v }
}

function planOf(swept: Extract<Swept, { ok: true }>, now: Date): Plan {
  const opts = {
    remote: swept.values.remote ?? null,
    noGh: !swept.values.gh,
    branch: swept.branch ?? null,
  }
  return {
    version: PLAN_VERSION,
    created_at: now.toISOString(),
    repos: swept.result.repos.flatMap((s) =>
      s.repo === null ? [] : [planRepo(s.repo.root, opts, s.items)],
    ),
  }
}

function runStatus(argv: readonly string[], ctx: CliContext): number {
  const parsed = statusCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, NAME, parsed.message)
  const v = parsed.values
  const render = (r: SweepResult): string =>
    v.output === 'json' ? renderJson(r) : renderText(r, { keep: v.keep })
  const swept = sweep(NAME, v, parsed.positionals, ctx, render)
  if (!swept.ok) return swept.code

  if (v.commands) {
    const commands = proposedCommands(swept.result)
    if (commands.length > 0) ctx.io.stdout(commands.join('\n') + '\n')
  } else {
    ctx.io.stdout(render(swept.result))
  }
  return EXIT.ok
}

function runSummary(argv: readonly string[], ctx: CliContext): number {
  const name = `${NAME} summary`
  const parsed = summaryCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, name, parsed.message)
  const v = parsed.values
  const render = (r: SweepResult): string =>
    v.output === 'json' ? renderCountsJson(r) : renderCountsText(r)
  const swept = sweep(name, v, parsed.positionals, ctx, render)
  if (!swept.ok) return swept.code
  ctx.io.stdout(render(swept.result))
  return EXIT.ok
}

function runPlan(argv: readonly string[], ctx: CliContext): number {
  const name = `${NAME} plan`
  const parsed = planCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, name, parsed.message)
  const v = parsed.values
  const swept = sweep(name, v, parsed.positionals, ctx, (r) => {
    ctx.io.stderr(renderSummary(r) + '\n')
    return ''
  })
  if (!swept.ok) return swept.code

  const plan = planOf(swept, new Date())
  ctx.io.stderr(renderSummary(swept.result) + '\n')
  if (v.out === '-') {
    ctx.io.stdout(`${JSON.stringify(plan, null, 2)}\n`)
  } else {
    const path = resolve(ctx.cwd, v.out)
    writePlan(path, plan)
    ctx.io.stderr(`plan: ${path}\n`)
  }
  return EXIT.ok
}

/** `<dir>/<name>.receipt-<stamp>.json` for plan `<dir>/<name>.json`. */
function receiptBeside(planPath: string, now: Date): string {
  const stem = basename(planPath).replace(/\.json$/i, '')
  return join(dirname(planPath), `${stem}.receipt-${fileStamp(now)}.json`)
}

function wouldRun(receipt: Receipt): number {
  return receipt.steps.filter((s) => s.row !== null).length
}

function runApply(argv: readonly string[], ctx: CliContext, deps: MainDeps): number {
  const name = `${NAME} apply`
  const parsed = applyCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, name, parsed.message)
  const v = parsed.values
  const paths = parsed.positionals

  let rows: RowRef[]
  let grants: Grant[]
  try {
    rows = v.row.map(parseRowRef)
    grants = v.allow.map(parseGrant)
  } catch (err) {
    if (err instanceof ApplyArgumentError) return usageError(ctx, name, err.message)
    throw err
  }

  const fromStdin = v.plan === '-'
  if (v.plan !== undefined) {
    const sweepFlags = [
      paths.length > 0 ? 'paths' : null,
      v.only !== undefined ? '--only' : null,
      v.branch !== undefined ? '--branch' : null,
      v.remote !== undefined ? '--remote' : null,
    ].filter((f) => f !== null)
    if (sweepFlags.length > 0) {
      return usageError(ctx, name, `--plan fixes what is swept; drop ${sweepFlags.join(', ')}`)
    }
  }
  if (fromStdin && !v.yes && !v.dryRun) {
    return usageError(
      ctx,
      name,
      '--plan - reads the plan from stdin, so it cannot ask; pass --yes or --dry-run',
    )
  }

  const now = new Date()
  let plan: Plan
  let planSource: string
  let receiptPath: string | null = v.receipt === undefined ? null : resolve(ctx.cwd, v.receipt)
  if (v.plan === undefined) {
    const swept = sweep(name, v, paths, ctx, (r) =>
      v.output === 'json' ? renderJson(r) : renderText(r),
    )
    if (!swept.ok) return swept.code
    plan = planOf(swept, now)
    planSource = '(swept)'
  } else {
    try {
      if (fromStdin) {
        plan = parsePlan((deps.readStdin ?? readAllStdin)(), 'stdin')
        planSource = '(stdin)'
      } else {
        planSource = resolve(ctx.cwd, v.plan)
        plan = readPlan(planSource)
        receiptPath ??= receiptBeside(planSource, now)
      }
    } catch (err) {
      return failure(ctx, err)
    }
  }

  const repoRoot = v.repoRoot === undefined ? undefined : resolve(ctx.cwd, v.repoRoot)
  const base = { callerCwd: ctx.cwd, planPath: planSource, repoRoot }
  const print = (receipt: Receipt, shownPath: string | null): void => {
    ctx.io.stdout(
      v.output === 'json'
        ? `${JSON.stringify({ receiptPath: shownPath, receipt }, null, 2)}\n`
        : renderReceipt(receipt, shownPath),
    )
  }

  let preview: Receipt
  try {
    preview = applyPlan(plan, rows, grants, { ...base, dryRun: true, receiptPath: null })
  } catch (err) {
    if (err instanceof ApplyArgumentError) {
      if (rows.length === 0 && plan.repos.every((r) => r.rows.length === 0)) {
        if (v.output === 'json') print(emptyReceipt(planSource, now), null)
        else ctx.io.stdout('nothing to delete\n')
        return EXIT.ok
      }
    }
    return failure(ctx, err)
  }

  const count = wouldRun(preview)
  if (v.dryRun || count === 0) {
    print(preview, null)
    return EXIT.ok
  }

  if (!v.yes) {
    // The preview is for the person answering, so it goes where the question does.
    const show = v.output === 'json' ? ctx.io.stderr : ctx.io.stdout
    show(renderReceipt(preview, null))
    const answer = (deps.confirm ?? terminalConfirm)(
      `Delete ${count} item${count === 1 ? '' : 's'}?`,
    )
    if (answer === null) {
      return usageError(ctx, name, 'refusing to delete without a terminal to ask; pass --yes')
    }
    if (!answer) {
      ctx.io.stderr('nothing deleted\n')
      return EXIT.ok
    }
  }

  // Only what the preview showed: rows it dropped stay dropped.
  const approved = preview.steps.flatMap((s) => (s.row === null ? [] : [s.row]))
  const approvedGrants = grants.filter(
    (g) =>
      g.row === null || approved.some((r) => r.category === g.row!.category && r.id === g.row!.id),
  )
  let receipt: Receipt
  try {
    receipt = applyPlan(plan, approved, approvedGrants, { ...base, dryRun: false, receiptPath })
  } catch (err) {
    return failure(ctx, err)
  }
  receipt.dropped = [...preview.dropped, ...receipt.dropped]
  print(receipt, receiptPath)
  return receipt.status === 'failed' ? EXIT_STEP_FAILED : EXIT.ok
}

function emptyReceipt(plan: string, now: Date): Receipt {
  const at = now.toISOString()
  return {
    version: 1,
    plan,
    status: 'dry-run',
    started_at: at,
    finished_at: at,
    dropped: [],
    steps: [],
  }
}

/** `main(argv, ctx)`: returns an exit code, never exits. */
export function main(argv: readonly string[], ctx: CliContext, deps: MainDeps = {}): number {
  const [sub, ...rest] = argv
  if (sub === 'summary') return runSummary(rest, ctx)
  if (sub === 'plan') return runPlan(rest, ctx)
  if (sub === 'apply') return runApply(rest, ctx, deps)
  if (sub === 'status') return runStatus(rest, ctx)
  return runStatus(argv, ctx)
}
