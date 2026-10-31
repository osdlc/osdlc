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
import { isatty } from 'node:tty'

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
import { PROVIDER_CHOICES, type ProviderChoice } from './providers/index.ts'
import { RECEIPT_VERSION, type Receipt, type RowRef, type Step } from './receipt.ts'
import {
  proposedCommands,
  renderCountsJson,
  renderCountsText,
  renderJson,
  renderReceipt,
  renderSummary,
  renderText,
  rowsActedOn,
  summarizeReceipt,
} from './render.ts'
import {
  NO_STATUS_LINE,
  describeStep,
  describeSweep,
  statusLine,
  type StatusLine,
} from './status-line.ts'
import { sweepRepos, type SweepReposOptions } from './sweep.ts'
import type { Scope, SweepItem, SweepProgress, SweepResult } from './types.ts'

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
  provider: {
    kind: 'enum',
    choices: PROVIDER_CHOICES,
    valueName: 'name',
    help: 'where pull requests come from: auto (by remote host), github (gh), gitlab (glab), none',
  },
  fetch: {
    kind: 'boolean',
    negatable: true,
    help: 'classify on the remote-tracking refs already on disk',
  },
  progress: {
    kind: 'boolean',
    negatable: true,
    help: 'no status line on stderr (drawn only when stderr is a terminal)',
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
        help: 'with a plan of several repositories: apply only the one rooted here',
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
  /** Whether stderr is a terminal, so a status line may be drawn. Defaults to `isatty(2)`. */
  stderrIsTerminal?: boolean
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
  provider?: ProviderChoice | undefined
  fetch: boolean
  progress: boolean
}

type Swept =
  | { kind: 'ok'; result: SweepResult; branch: string | undefined; values: SweepValues }
  /** No entry named a repository; the verb reports it and exits 10. */
  | { kind: 'nothing'; result: SweepResult }
  | { kind: 'exit'; code: number }

/** Validate the sweep flags and run the sweep, or answer with the exit code. */
function sweep(
  name: string,
  v: SweepValues,
  paths: readonly string[],
  ctx: CliContext,
  status: StatusLine,
): Swept {
  const only = v.only?.filter((s) => s !== '')
  const unknown = (only ?? []).filter((s) => !(s in ONLY))
  if (unknown.length > 0) {
    const message = `unknown --only value(s): ${unknown.join(', ')}`
    return { kind: 'exit', code: usageError(ctx, name, message) }
  }
  if (v.branch !== undefined && paths.length > 0) {
    const message = '--branch sweeps this repository only; drop the paths'
    return { kind: 'exit', code: usageError(ctx, name, message) }
  }

  if (!v.gh && v.provider !== undefined && v.provider !== 'none') {
    const message = `--no-gh asks no provider; drop it or --provider ${v.provider}`
    return { kind: 'exit', code: usageError(ctx, name, message) }
  }

  let branch: string | undefined
  try {
    branch = v.branch === undefined ? undefined : resolveBranch(v.branch, new Git(ctx.cwd))
  } catch (err) {
    return { kind: 'exit', code: failure(ctx, err) }
  }

  const options: SweepReposOptions = {
    baseDir: ctx.cwd,
    cwd: ctx.cwd,
    noGh: !v.gh,
    provider: v.provider,
    fetch: v.fetch,
    branch,
    // Mid-walk, while the wait is happening — the summary comes too late to
    // explain why the tool appeared to hang.
    onWarn: (message) => ctx.io.stderr(`${NAME}: ${message}\n`),
    ...(v.progress ? { onProgress: (p) => status.update(describeSweep(p)) } : {}),
    ...(only === undefined ? {} : { scope: only.map((s) => ONLY[s]!) }),
    ...(v.remote === undefined ? {} : { remote: v.remote }),
  }
  if (v.progress) status.update(`${NAME}: finding repositories`)
  const result = sweepRepos(paths.length > 0 ? paths : [ctx.cwd], options)
  status.clear()
  if (branch !== undefined && result.repos.length > 1) {
    const err = new Error(
      `--branch sweeps one repository; ${result.repos.length} found under ${ctx.cwd}`,
    )
    return { kind: 'exit', code: failure(ctx, err) }
  }
  const refused = branch === undefined ? null : (result.repos[0]?.error ?? null)
  if (refused !== null) return { kind: 'exit', code: failure(ctx, new Error(refused)) }
  if (result.repos.length === 0) return { kind: 'nothing', result }
  return { kind: 'ok', result, branch, values: v }
}

/**
 * Name each repository the sweep could not read, on stderr. True when there
 * was one: a verb that acts on the sweep must not pass an unread repository
 * off as an empty one.
 */
function reportUnreadable(ctx: CliContext, name: string, result: SweepResult): boolean {
  const failed = result.repos.filter((r) => r.error !== null)
  for (const r of failed) ctx.io.stderr(`${name}: ${r.repo?.root ?? r.path}: ${r.error}\n`)
  return failed.length > 0
}

function planOf(swept: Extract<Swept, { kind: 'ok' }>, now: Date): Plan {
  const opts = {
    remote: swept.values.remote ?? null,
    noGh: !swept.values.gh || swept.values.provider === 'none',
    provider: swept.values.provider,
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

function runStatus(argv: readonly string[], ctx: CliContext, status: StatusLine): number {
  const parsed = statusCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, NAME, parsed.message)
  const v = parsed.values
  const render = (r: SweepResult): string =>
    v.output === 'json' ? renderJson(r) : renderText(r, { keep: v.keep })
  const swept = sweep(NAME, v, parsed.positionals, ctx, status)
  if (swept.kind === 'exit') return swept.code
  if (swept.kind === 'nothing') {
    ctx.io.stdout(render(swept.result))
    return EXIT_NOTHING_TO_SWEEP
  }

  if (v.commands) {
    const commands = proposedCommands(swept.result)
    if (commands.length > 0) ctx.io.stdout(commands.join('\n') + '\n')
  } else {
    ctx.io.stdout(render(swept.result))
  }
  return EXIT.ok
}

function runSummary(argv: readonly string[], ctx: CliContext, status: StatusLine): number {
  const name = `${NAME} summary`
  const parsed = summaryCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, name, parsed.message)
  const v = parsed.values
  const render = (r: SweepResult): string =>
    v.output === 'json' ? renderCountsJson(r) : renderCountsText(r)
  const swept = sweep(name, v, parsed.positionals, ctx, status)
  if (swept.kind === 'exit') return swept.code
  ctx.io.stdout(render(swept.result))
  return swept.kind === 'nothing' ? EXIT_NOTHING_TO_SWEEP : EXIT.ok
}

function runPlan(argv: readonly string[], ctx: CliContext, status: StatusLine): number {
  const name = `${NAME} plan`
  const parsed = planCli().parse(argv, ctx.io)
  if (parsed.status === 'help') return EXIT.ok
  if (parsed.status === 'error') return usageError(ctx, name, parsed.message)
  const v = parsed.values
  const swept = sweep(name, v, parsed.positionals, ctx, status)
  if (swept.kind === 'exit') return swept.code
  // stdout carries only the plan, so the summary goes to stderr either way.
  if (swept.kind === 'nothing') {
    ctx.io.stderr(renderSummary(swept.result) + '\n')
    return EXIT_NOTHING_TO_SWEEP
  }

  const plan = planOf(swept, new Date())
  const unreadable = reportUnreadable(ctx, name, swept.result)
  ctx.io.stderr(renderSummary(swept.result) + '\n')
  if (v.out === '-') {
    ctx.io.stdout(`${JSON.stringify(plan, null, 2)}\n`)
  } else {
    const path = resolve(ctx.cwd, v.out)
    writePlan(path, plan)
    ctx.io.stderr(`plan: ${path}\n`)
  }
  return unreadable ? EXIT.error : EXIT.ok
}

/** `<dir>/<name>.receipt-<stamp>.json` for plan `<dir>/<name>.json`. */
function receiptBeside(planPath: string, now: Date): string {
  const stem = basename(planPath).replace(/\.json$/i, '')
  return join(dirname(planPath), `${stem}.receipt-${fileStamp(now)}.json`)
}

/** Rows the run would delete or prune: one each, however many steps (an unlock, a remove) it takes. */
function wouldRun(receipt: Receipt): number {
  return rowsActedOn(summarizeReceipt(receipt))
}

type ApplyValues = Extract<
  ReturnType<ReturnType<typeof applyCli>['parse']>,
  { status: 'ok' }
>['values']

/** Where `apply`'s plan came from, and what that decides about the run. */
interface LoadedPlan {
  plan: Plan
  /** Shown in the receipt: the plan's path, `(stdin)` or `(swept)`. */
  source: string
  receiptPath: string | null
  /** A swept repository could not be read: the run exits 1 whatever else happens. */
  unreadable: boolean
  /** The sweep's items by repository root, so the preview need not sweep again. */
  swept: Map<string, SweepItem[]> | undefined
}

/** Sweep and plan in memory, or read `--plan`; or answer with the exit code. */
function loadPlan(
  name: string,
  v: ApplyValues,
  paths: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
  status: StatusLine,
  now: Date,
): LoadedPlan | number {
  const receiptPath = v.receipt === undefined ? null : resolve(ctx.cwd, v.receipt)
  if (v.plan === undefined) {
    const swept = sweep(name, v, paths, ctx, status)
    if (swept.kind === 'exit') return swept.code
    if (swept.kind === 'nothing') {
      ctx.io.stdout(v.output === 'json' ? renderJson(swept.result) : renderText(swept.result))
      return EXIT_NOTHING_TO_SWEEP
    }
    const items = new Map<string, SweepItem[]>()
    for (const r of swept.result.repos) if (r.repo !== null) items.set(r.repo.root, r.items)
    return {
      plan: planOf(swept, now),
      source: '(swept)',
      receiptPath,
      unreadable: reportUnreadable(ctx, name, swept.result),
      swept: items,
    }
  }
  try {
    if (v.plan === '-') {
      const plan = parsePlan((deps.readStdin ?? readAllStdin)(), 'stdin')
      return { plan, source: '(stdin)', receiptPath, unreadable: false, swept: undefined }
    }
    const source = resolve(ctx.cwd, v.plan)
    const plan = readPlan(source)
    return {
      plan,
      source,
      receiptPath: receiptPath ?? receiptBeside(source, now),
      unreadable: false,
      swept: undefined,
    }
  } catch (err) {
    return failure(ctx, err)
  }
}

/** The run's flags that contradict each other, as a usage message, or null. */
function applyConflict(v: ApplyValues, paths: readonly string[]): string | null {
  if (v.plan !== undefined) {
    const sweepFlags = [
      paths.length > 0 ? 'paths' : null,
      v.only !== undefined ? '--only' : null,
      v.branch !== undefined ? '--branch' : null,
      v.remote !== undefined ? '--remote' : null,
    ].filter((f) => f !== null)
    if (sweepFlags.length > 0) return `--plan fixes what is swept; drop ${sweepFlags.join(', ')}`
  }
  if (v.plan === '-' && !v.yes && !v.dryRun) {
    return '--plan - reads the plan from stdin, so it cannot ask; pass --yes or --dry-run'
  }
  return null
}

function runApply(
  argv: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
  status: StatusLine,
): number {
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
  const conflict = applyConflict(v, paths)
  if (conflict !== null) return usageError(ctx, name, conflict)

  const now = new Date()
  const loaded = loadPlan(name, v, paths, ctx, deps, status, now)
  if (typeof loaded === 'number') return loaded
  const { plan, source, receiptPath } = loaded
  const ok = (): number => (loaded.unreadable ? EXIT.error : EXIT.ok)

  const repoRoot = v.repoRoot === undefined ? undefined : resolve(ctx.cwd, v.repoRoot)
  const print = (receipt: Receipt, shownPath: string | null): void => {
    ctx.io.stdout(
      v.output === 'json'
        ? `${JSON.stringify({ receiptPath: shownPath, summary: summarizeReceipt(receipt), receipt }, null, 2)}\n`
        : renderReceipt(receipt, shownPath),
    )
  }

  const planned = plan.repos.filter(
    (r) => repoRoot === undefined || resolve(r.root) === resolve(repoRoot),
  )
  if (repoRoot !== undefined && planned.length === 0) {
    return failure(ctx, new Error(`no plan repository at ${repoRoot}`))
  }
  if (rows.length === 0 && planned.every((r) => r.rows.length === 0)) {
    if (v.output === 'json') print(emptyReceipt(source, now, v.dryRun), null)
    else ctx.io.stdout('nothing to delete\n')
    return ok()
  }

  const base = {
    callerCwd: ctx.cwd,
    planPath: source,
    repoRoot,
    // An implicit selection runs only safe-to-delete rows, in the preview and
    // in the run it confirms, whose rows are passed explicitly.
    safeOnly: rows.length === 0,
    ...(v.progress
      ? {
          onSweepProgress: (p: SweepProgress) => status.update(`re-checking ${describeSweep(p)}`),
          onStep: (i: number, total: number, step: Step) =>
            status.update(describeStep(i, total, step)),
        }
      : {}),
  }

  let preview: Receipt
  try {
    // A sweep that just ran is the preview's re-check; the run that deletes sweeps again.
    preview = applyPlan(plan, rows, grants, {
      ...base,
      dryRun: true,
      receiptPath: null,
      swept: loaded.swept,
    })
  } catch (err) {
    return failure(ctx, err)
  }

  const count = wouldRun(preview)
  if (v.dryRun || count === 0) {
    print(preview, null)
    return ok()
  }
  if (!v.yes) {
    const declined = confirm(ctx, name, preview, count, v.output === 'json', deps)
    if (declined !== null) return declined
  }

  // Only what the preview showed: rows it dropped stay dropped.
  // Pinned to their repositories: a branch name two repositories share stays two rows.
  const approved = preview.steps.flatMap((s) =>
    s.row === null ? [] : [{ ...s.row, repo: s.repo }],
  )
  const approvedGrants = grants.filter(
    (g) =>
      g.row === null || approved.some((r) => r.category === g.row!.category && r.id === g.row!.id),
  )
  let receipt: Receipt
  try {
    receipt = applyPlan(plan, approved, approvedGrants, {
      ...base,
      dryRun: false,
      receiptPath,
      dropped: preview.dropped,
    })
  } catch (err) {
    return failure(ctx, err)
  }
  print(receipt, receiptPath)
  if (receiptPath === null) {
    ctx.io.stderr(`${name}: no receipt written; pass --receipt <file> to keep one\n`)
  }
  return receipt.status === 'failed' ? EXIT_STEP_FAILED : ok()
}

/**
 * Show the preview and ask. Null to go ahead; otherwise the exit code: 0 for
 * a no, 2 when there is no one to ask.
 */
function confirm(
  ctx: CliContext,
  name: string,
  preview: Receipt,
  count: number,
  json: boolean,
  deps: MainDeps,
): number | null {
  // The preview is for the person answering, so it goes where the question does.
  const show = json ? ctx.io.stderr : ctx.io.stdout
  show(renderReceipt(preview, null))
  const answer = (deps.confirm ?? terminalConfirm)(`Delete ${count} item${count === 1 ? '' : 's'}?`)
  if (answer === null) {
    return usageError(ctx, name, 'refusing to delete without a terminal to ask; pass --yes')
  }
  if (!answer) {
    ctx.io.stderr('nothing deleted\n')
    return EXIT.ok
  }
  return null
}

function emptyReceipt(plan: string, now: Date, dryRun: boolean): Receipt {
  const at = now.toISOString()
  return {
    version: RECEIPT_VERSION,
    plan,
    status: dryRun ? 'dry-run' : 'complete',
    started_at: at,
    finished_at: at,
    dropped: [],
    steps: [],
  }
}

/** `main(argv, ctx)`: returns an exit code, never exits. */
export function main(argv: readonly string[], ctx: CliContext, deps: MainDeps = {}): number {
  const terminal = deps.stderrIsTerminal ?? isatty(2)
  const status = terminal
    ? statusLine(ctx.io.stderr, () => process.stderr.columns || 80)
    : NO_STATUS_LINE
  // Anything else written erases the status line first, so it never trails into output.
  const io = {
    stdout: (text: string) => {
      status.clear()
      ctx.io.stdout(text)
    },
    stderr: (text: string) => {
      status.clear()
      ctx.io.stderr(text)
    },
  }
  const c: CliContext = { ...ctx, io }
  const [sub, ...rest] = argv
  try {
    if (sub === 'summary') return runSummary(rest, c, status)
    if (sub === 'plan') return runPlan(rest, c, status)
    if (sub === 'apply') return runApply(rest, c, deps, status)
    if (sub === 'status') return runStatus(rest, c, status)
    return runStatus(argv, c, status)
  } finally {
    status.clear()
  }
}
