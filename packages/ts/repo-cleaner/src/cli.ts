/**
 * `repo-cleaner` — what has been merged, and what can go away.
 *
 *   repo-cleaner [target...]   the report; deletes nothing
 *   repo-cleaner plan          save the sweep's rows and their evidence, to run later
 *   repo-cleaner clean         check again, show the steps, ask, delete
 *   repo-cleaner cache         list or remove the clones kept for remote URL targets
 *
 * Every command takes `--help`, and `--help --extended` for the full
 * reference: what each option means, the words the report uses, and which
 * combinations are refused. A combination that contradicts itself, or one
 * with an option that would have no effect, is refused with exit 2 before
 * anything is swept.
 *
 * Exit codes:
 *   0   swept; or clean ran, was declined, or had nothing to do
 *   1   failed against the state it found
 *   2   cannot run as typed
 *   10  no target named a repository
 *   11  clean stopped at a failed step; the receipt says which
 */

import { readSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { isatty } from 'node:tty'

import {
  EXIT,
  askYesNo,
  canPrompt,
  defineCli,
  type Cli,
  type CliContext,
  type FlagSpec,
  type FlagValues,
} from '@osdlc/cli-tool'
import { detectColorLevel, stripControls } from '@osdlc/ux'

import { check, checkApproval, parseAllow, run, type Approval, type Preview } from './clean.ts'
import { fileStamp, parsePlan, plan as planOf, readPlan, writePlan, type Plan } from './plan.ts'
import { PROVIDER_CHOICES } from './providers/index.ts'
import type { Receipt, Step } from './receipt.ts'
import { REFERENCE } from './reference.ts'
import {
  cachedMirrorOf,
  defaultCacheDir,
  listMirrors,
  redactUrl,
  type CachedMirror,
} from './remote-mirror.ts'
import {
  PLAIN,
  TERMINAL_STYLE,
  renderCommands,
  renderJson,
  renderLateDrops,
  renderPreview,
  renderReceipt,
  renderStepFailure,
  renderSummary,
  renderText,
  renderTotals,
  rowsActedOn,
  summarizeRun,
  type Style,
} from './render.ts'
import {
  NO_STATUS_LINE,
  describeStep,
  describeSweep,
  statusLine,
  type StatusLine,
} from './status-line.ts'
import { stepBoard, type StepBoard } from './step-board.ts'
import { sweep as sweepTargets, sweptWith, type SweepOptions } from './sweep.ts'
import { KINDS, RISKS, RepoCleanerError, type Kind, type Sweep } from './types.ts'

const EXIT_NOTHING_TO_SWEEP = 10
const EXIT_STEP_FAILED = 11

const NAME = 'repo-cleaner'

/** `--help` and its modifier: commander must not own `--help`, or it would never see `--extended`. */
const HELP_FLAGS = {
  help: { kind: 'boolean', short: 'h', help: 'show this message' },
  extended: { kind: 'boolean', help: 'with --help: the full reference' },
} as const

/** The flags every command that sweeps takes. */
const SWEEP_FLAGS = {
  remote: {
    kind: 'boolean',
    help: 'also judge remote branches: fetches first and looks up pull requests; slower',
  },
  offline: { kind: 'boolean', help: 'with --remote: do not fetch' },
  only: {
    kind: 'list',
    valueName: 'kinds',
    help: `only these kinds of row: ${KINDS.join(', ')} (default: worktree,branch; remote too with --remote)`,
  },
  branch: {
    kind: 'string',
    valueName: 'name|HEAD',
    help: "only one branch's rows: its worktree, local branch, and remote branch with --remote",
  },
  against: {
    kind: 'string',
    valueName: 'remote',
    help: 'the remote whose default branch counts as merged into (default: origin)',
  },
  provider: {
    kind: 'enum',
    choices: PROVIDER_CHOICES,
    valueName: 'name',
    help: 'with --remote: where pull requests come from',
  },
  progress: { kind: 'boolean', negatable: true, help: 'no progress line on stderr' },
} as const

/** A repeatable flag that takes a row (or `risk[=row]`) each time, never split on commas. */
const rowList = <V extends string>(valueName: V, help: string) =>
  ({
    kind: 'list',
    valueName,
    default: [] as readonly string[],
    commaSeparated: false,
    help,
  }) as const

const TARGETS = [
  {
    name: 'target',
    variadic: true,
    help: 'a checkout, a directory of checkouts, or a remote URL (default: the checkout you are in)',
  },
] as const

const MORE = `Run with --help --extended for the full reference: what every option means, the words the report uses, and which combinations are refused.`

const reportCli = () =>
  defineCli({
    name: NAME,
    summary:
      'Say which worktrees and local branches (remote branches too, with --remote) are merged ' +
      'into the default branch and can go, with the evidence and the command that would delete ' +
      'each. Deletes nothing.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      all: { kind: 'boolean', help: 'also show keep rows (with --format text)' },
      format: {
        kind: 'enum',
        choices: ['text', 'json', 'summary', 'commands'] as const,
        valueName: 'form',
        default: 'text',
        help: 'text (the report), json (everything), summary (counts), commands (only the safe commands)',
      },
      ...HELP_FLAGS,
    },
    shortEpilogue: `commands:
  ${NAME} [target...]   this report (the default)
  ${NAME} plan          save the sweep's rows and their evidence, to run later
  ${NAME} clean         check again, show the steps, ask, delete
  ${NAME} cache         list or remove the clones kept for remote URL targets
  ${NAME} dev           run ${NAME} from a development checkout

A checkout directory named like a command is swept as ./<name>.
${MORE}`,
    epilogue: REFERENCE.report,
  })

const planCli = () =>
  defineCli({
    name: `${NAME} plan`,
    summary:
      'Sweep, and save every row, each with a fingerprint of the evidence ' +
      'behind its verdict, so `clean --plan` can run it later and drop what moved since.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      out: {
        kind: 'string',
        short: 'o',
        valueName: 'file',
        default: '-',
        help: 'write the plan here; - is stdout (the default)',
      },
      ...HELP_FLAGS,
    },
    shortEpilogue: `The totals line goes to stderr, so stdout carries only the plan.\n${MORE}`,
    epilogue: REFERENCE.plan,
  })

const cleanCli = () =>
  defineCli({
    name: `${NAME} clean`,
    summary:
      'Delete what the sweep (or a saved plan) found: check each row again, show the steps, ask, ' +
      'then delete, compare-and-swap, verifying each step. Without --pick, every row judged ' +
      'delete runs.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      pick: rowList(
        'row',
        'work on exactly these rows; a review row runs only when picked; repeatable',
      ),
      spare: rowList(
        'row',
        'leave this row alone; a spared remote branch that moved stops the run; repeatable',
      ),
      allow: rowList('risk[=row]', 'accept a risk for every row, or for one row; repeatable'),
      plan: {
        kind: 'string',
        valueName: 'file',
        help: 'run this plan (- reads stdin) instead of sweeping',
      },
      yes: { kind: 'boolean', short: 'y', help: 'delete without asking' },
      dryRun: { kind: 'boolean', help: 'check and show the steps; delete nothing' },
      receipt: {
        kind: 'string',
        valueName: 'file',
        help: 'write the receipt here (default: beside a --plan file; none otherwise)',
      },
      format: {
        kind: 'enum',
        choices: ['text', 'json'] as const,
        valueName: 'form',
        default: 'text',
        help: 'how the steps and the outcome are shown',
      },
      ...HELP_FLAGS,
    },
    shortEpilogue: `rows: worktree:<path>, branch:<name>, remote:<remote>/<name>, or a bare name
risks: ${RISKS.join(', ')}
A row that carries a risk you did not --allow is skipped, never deleted.
${MORE}`,
    epilogue: REFERENCE.clean,
  })

const cacheCli = () =>
  defineCli({
    name: `${NAME} cache`,
    summary:
      'List the clones kept for remote URL targets, or remove them. A removed clone is cloned ' +
      'again by the next sweep of its URL.',
    autoHelp: false,
    positionals: [
      { name: 'verb', help: 'list (the default) or remove' },
      { name: 'url', variadic: true, help: 'with remove: the URL whose clone to remove' },
    ],
    flags: {
      all: { kind: 'boolean', help: 'with remove: remove every clone' },
      format: {
        kind: 'enum',
        choices: ['text', 'json'] as const,
        valueName: 'form',
        default: 'text',
        help: 'how the clones are shown',
      },
      ...HELP_FLAGS,
    },
    shortEpilogue: `A plan that names a removed clone cannot run; sweep again instead.\n${MORE}`,
    epilogue: REFERENCE.cache,
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
  /** The terminal's size, for the live step board. Defaults to stdout's columns and rows. */
  terminalSize?: () => { width: number; height: number }
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

function failure(ctx: CliContext, name: string, err: unknown): number {
  ctx.io.stderr(`${name}: ${err instanceof Error ? err.message : String(err)}\n`)
  return EXIT.error
}

/** A refusal as its exit code: 2 for what was typed, 1 for the state found. */
function refusal(ctx: CliContext, name: string, err: unknown): number {
  if (err instanceof RepoCleanerError && (err.code === 'conflict' || err.code === 'bad-input')) {
    return usageError(ctx, name, err.message)
  }
  return failure(ctx, name, err)
}

type Parsed<T> =
  { status: 'ok'; values: T; positionals: string[] } | { status: 'done'; code: number }

/** The values a command's declared flags parse to. */
type ValuesOf<C> = C extends Cli<infer F> ? FlagValues<F> : never

/** Parse, and answer `--help` (and `--help --extended`) itself. */
function parseWith<F extends FlagSpec & typeof HELP_FLAGS>(
  cli: Cli<F>,
  name: string,
  argv: readonly string[],
  ctx: CliContext,
): Parsed<FlagValues<F>> {
  const parsed = cli.parse(argv, ctx.io)
  if (parsed.status === 'help') return { status: 'done', code: EXIT.ok }
  if (parsed.status === 'error') {
    return { status: 'done', code: usageError(ctx, name, parsed.message) }
  }
  const v = parsed.values as FlagValues<F> & ValuesOf<Cli<typeof HELP_FLAGS>>
  if (v.help) {
    ctx.io.stdout(cli.help({ all: v.extended }))
    return { status: 'done', code: EXIT.ok }
  }
  if (v.extended) {
    return { status: 'done', code: usageError(ctx, name, '--extended goes with --help') }
  }
  return parsed
}

type SweepValues = FlagValues<typeof SWEEP_FLAGS>

/** The sweep options as typed, for {@link sweptWith} and {@link sweepTargets}. */
function sweepOptions(v: SweepValues, ctx: CliContext): SweepOptions {
  const only = v.only?.filter((s) => s !== '')
  return {
    cwd: ctx.cwd,
    remote: v.remote,
    offline: v.offline,
    ...(only === undefined ? {} : { only: only as Kind[] }),
    ...(v.branch === undefined ? {} : { branch: v.branch }),
    ...(v.against === undefined ? {} : { against: v.against }),
    ...(v.provider === undefined ? {} : { provider: v.provider }),
    cacheDir: defaultCacheDir(ctx.env),
  }
}

/** Color for output on `stream`, when it is a terminal that takes color. */
function styleFor(ctx: CliContext, stream: 'stdout' | 'stderr'): Style {
  const level = detectColorLevel({ env: ctx.env, isTTY: ctx.terminal?.[stream] === true })
  return level === 'none' ? PLAIN : TERMINAL_STYLE
}

/** The note under a text report that left remote branches out, or '' when it did not. */
function remoteNote(s: Sweep, style: Style): string {
  if (s.options.only.includes('remote')) return ''
  if (!s.repos.some((r) => r.repo?.remote != null)) return ''
  return (
    style.muted(
      'Local only: nothing fetched, no pull requests looked up, remote branches not checked; add --remote for all three.',
    ) + '\n'
  )
}

type Swept =
  { kind: 'ok'; sweep: Sweep } | { kind: 'nothing'; sweep: Sweep } | { kind: 'exit'; code: number }

/** Sweep, or answer with the exit code. */
function doSweep(
  name: string,
  v: SweepValues,
  targets: readonly string[],
  ctx: CliContext,
  status: StatusLine,
): Swept {
  const opts: SweepOptions = {
    ...sweepOptions(v, ctx),
    // Mid-walk, while the wait is happening: the totals come too late to
    // explain why the tool appeared to hang.
    onWarn: (message) => ctx.io.stderr(`${NAME}: ${message}\n`),
    ...(v.progress ? { onProgress: (p) => status.update(describeSweep(p)) } : {}),
  }
  if (v.progress) status.update(`${NAME}: finding repositories`)
  let result: Sweep
  try {
    result = sweepTargets(targets, opts)
  } catch (err) {
    status.clear()
    return { kind: 'exit', code: refusal(ctx, name, err) }
  }
  status.clear()
  const refused = v.branch === undefined ? null : (result.repos[0]?.error ?? null)
  if (refused !== null) return { kind: 'exit', code: failure(ctx, name, new Error(refused)) }
  if (result.repos.length === 0) return { kind: 'nothing', sweep: result }
  return { kind: 'ok', sweep: result }
}

/**
 * Name each repository the sweep could not read, on stderr. True when there
 * was one: a command that acts on the sweep must not pass an unread
 * repository off as an empty one.
 */
function reportUnreadable(ctx: CliContext, name: string, s: Sweep): boolean {
  reportNotes(ctx, name, s)
  const failed = s.repos.filter((r) => r.error !== null)
  for (const r of failed) ctx.io.stderr(`${name}: ${r.repo?.root ?? r.path}: ${r.error}\n`)
  return failed.length > 0
}

/**
 * Each repository's notes on what the sweep judged without (a failed fetch,
 * remote listing or pull request lookup), on stderr, for the outputs that do
 * not carry them.
 */
function reportNotes(ctx: CliContext, name: string, s: Sweep): void {
  for (const r of s.repos) {
    for (const note of r.notes) ctx.io.stderr(`${name}: ${r.repo?.root ?? r.path}: ${note}\n`)
  }
}

function runReport(argv: readonly string[], ctx: CliContext, status: StatusLine): number {
  const parsed = parseWith(reportCli(), NAME, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  if (v.all && v.format !== 'text') {
    return usageError(
      ctx,
      NAME,
      `--all has no effect with --format ${v.format}: it shows keep rows in the text report`,
    )
  }
  const style = styleFor(ctx, 'stdout')
  const swept = doSweep(NAME, v, parsed.positionals, ctx, status)
  if (swept.kind === 'exit') return swept.code
  const s = swept.sweep
  if (v.format === 'json') ctx.io.stdout(renderJson(s))
  else if (v.format === 'summary') ctx.io.stdout(renderSummary(s, style) + remoteNote(s, style))
  else if (v.format === 'commands') {
    reportNotes(ctx, NAME, s)
    const commands = renderCommands(s)
    if (commands.length > 0) ctx.io.stdout(commands.join('\n') + '\n')
  } else {
    ctx.io.stdout(renderText(s, { all: v.all, style }) + remoteNote(s, style))
  }
  return swept.kind === 'nothing' ? EXIT_NOTHING_TO_SWEEP : EXIT.ok
}

function runPlan(argv: readonly string[], ctx: CliContext, status: StatusLine): number {
  const name = `${NAME} plan`
  const parsed = parseWith(planCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  const swept = doSweep(name, v, parsed.positionals, ctx, status)
  if (swept.kind === 'exit') return swept.code
  // stdout carries only the plan, so the totals go to stderr either way.
  if (swept.kind === 'nothing') {
    ctx.io.stderr(renderTotals(swept.sweep) + '\n')
    return EXIT_NOTHING_TO_SWEEP
  }
  const plan = planOf(swept.sweep)
  const unreadable = reportUnreadable(ctx, name, swept.sweep)
  const style = styleFor(ctx, 'stderr')
  ctx.io.stderr(renderTotals(swept.sweep, style) + '\n' + remoteNote(swept.sweep, style))
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

const dropKey = (d: Receipt['dropped'][number]): string => JSON.stringify([d.repo, d.row])

type CleanValues = ValuesOf<ReturnType<typeof cleanCli>>

/** The run's options that contradict each other, as a usage message, or null. */
function cleanConflict(v: CleanValues, targets: readonly string[]): string | null {
  if (v.plan !== undefined) {
    const fixed = [
      targets.length > 0 ? 'targets' : null,
      v.only !== undefined ? '--only' : null,
      v.branch !== undefined ? '--branch' : null,
      v.remote ? '--remote' : null,
      v.offline ? '--offline' : null,
      v.against !== undefined ? '--against' : null,
      v.provider !== undefined ? '--provider' : null,
    ].filter((f) => f !== null)
    if (fixed.length > 0) return `--plan already fixed what is swept; drop ${fixed.join(', ')}`
  }
  if (v.plan === '-' && !v.yes && !v.dryRun) {
    return '--plan - reads the plan from stdin, so nothing can ask; pass --yes or --dry-run'
  }
  if (v.yes && v.dryRun)
    return '--yes and --dry-run contradict: one deletes without asking, the other deletes nothing'
  if (v.receipt !== undefined && v.dryRun)
    return '--receipt has no effect with --dry-run: nothing runs to record'
  return null
}

/** Where `clean`'s plan came from, and what that decides about the run. */
interface LoadedPlan {
  plan: Plan
  /** Shown in the receipt: the plan's path, `(stdin)` or `(swept)`. */
  source: string
  receiptPath: string | undefined
  /** A swept repository could not be read: the run exits 1 whatever else happens. */
  unreadable: boolean
  /** The sweep just made, so the preview need not sweep again. */
  sweep: Sweep | undefined
}

function loadPlan(
  name: string,
  v: CleanValues,
  targets: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
  status: StatusLine,
  now: Date,
): LoadedPlan | number {
  const receiptPath = v.receipt === undefined ? undefined : resolve(ctx.cwd, v.receipt)
  if (v.plan === undefined) {
    const swept = doSweep(name, v, targets, ctx, status)
    if (swept.kind === 'exit') return swept.code
    if (swept.kind === 'nothing') {
      ctx.io.stdout(v.format === 'json' ? renderJson(swept.sweep) : renderText(swept.sweep))
      return EXIT_NOTHING_TO_SWEEP
    }
    return {
      plan: planOf(swept.sweep, now),
      source: '(swept)',
      receiptPath,
      unreadable: reportUnreadable(ctx, name, swept.sweep),
      sweep: swept.sweep,
    }
  }
  try {
    if (v.plan === '-') {
      const plan = parsePlan((deps.readStdin ?? readAllStdin)(), 'stdin')
      return { plan, source: '(stdin)', receiptPath, unreadable: false, sweep: undefined }
    }
    const source = resolve(ctx.cwd, v.plan)
    return {
      plan: readPlan(source),
      source,
      receiptPath: receiptPath ?? receiptBeside(source, now),
      unreadable: false,
      sweep: undefined,
    }
  } catch (err) {
    return refusal(ctx, name, err)
  }
}

function runClean(
  argv: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
  status: StatusLine,
): number {
  const name = `${NAME} clean`
  const parsed = parseWith(cleanCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  const targets = parsed.positionals

  let approval: Approval
  try {
    approval = { pick: v.pick, spare: v.spare, allow: v.allow.map(parseAllow) }
  } catch (err) {
    return refusal(ctx, name, err)
  }
  const conflict = cleanConflict(v, targets)
  if (conflict !== null) return usageError(ctx, name, conflict)
  // Refuse what can be refused before sweeping; a saved plan's own options
  // are checked when the approval is resolved against it.
  if (v.plan === undefined) {
    try {
      checkApproval(sweptWith(targets, sweepOptions(v, ctx)), approval)
    } catch (err) {
      return refusal(ctx, name, err)
    }
  }

  const now = new Date()
  const loaded = loadPlan(name, v, targets, ctx, deps, status, now)
  if (typeof loaded === 'number') return loaded
  const { plan, source, receiptPath } = loaded
  const ok = (): number => (loaded.unreadable ? EXIT.error : EXIT.ok)

  // On a terminal the run is shown live: every step first, then each one
  // checked off as it finishes.
  const live = v.format === 'text' && ctx.terminal?.stdout === true
  const style = styleFor(ctx, 'stdout')

  const shared = {
    cwd: ctx.cwd,
    ...(v.progress
      ? {
          onProgress: (p: Parameters<typeof describeSweep>[0]) =>
            status.update(`re-checking ${describeSweep(p)}`),
        }
      : {}),
  }
  let preview: Preview
  try {
    // A sweep that just ran is the preview's re-check; the run sweeps again.
    preview = check(plan, approval, {
      ...shared,
      sweep: loaded.sweep,
      cacheDir: defaultCacheDir(ctx.env),
    })
  } catch (err) {
    status.clear()
    return refusal(ctx, name, err)
  }
  status.clear()

  const showPreview = (): void => {
    if (v.format === 'json') {
      ctx.io.stdout(
        `${JSON.stringify({ dryRun: v.dryRun, summary: summarizeRun(preview), steps: preview.steps, dropped: preview.dropped, unusedAllows: preview.unusedAllows }, null, 2)}\n`,
      )
    } else {
      ctx.io.stdout(renderPreview(preview, style))
    }
  }
  const count = rowsActedOn(summarizeRun(preview))
  if (v.dryRun || count === 0) {
    showPreview()
    return ok()
  }
  if (!v.yes) {
    const declined = confirm(ctx, name, preview, count, v.format === 'json', deps)
    if (declined !== null) return declined
  } else if (live) {
    ctx.io.stdout(renderPreview(preview, style))
  }
  if (live) ctx.io.stdout('\n')

  const size =
    deps.terminalSize ??
    (() => ({
      width: ctx.terminal?.columns || process.stdout.columns || 80,
      height: process.stdout.rows || 24,
    }))
  let board: StepBoard | undefined
  let receipt: Receipt
  try {
    receipt = run(preview, {
      ...shared,
      source,
      receiptPath,
      now: () => new Date(),
      ...(live
        ? {
            // The board carries the run's progress; the status line stays clear.
            onStart: (steps: readonly Step[]) => {
              board = stepBoard(ctx.io.stdout, steps, size, style)
              board.draw(null)
            },
            onStep: (i: number) => board?.draw(i),
            onStepDone: (_i: number, _total: number, step: Step) => {
              board?.draw(null)
              // Here rather than after the run: a receipt that then cannot be
              // saved must not take the step's own error with it.
              if (step.result === 'failed') ctx.io.stdout(`\n${renderStepFailure(step, style)}\n`)
            },
          }
        : v.progress
          ? {
              onStep: (i: number, total: number, step: Step) =>
                status.update(describeStep(i, total, step)),
            }
          : {}),
    })
  } catch (err) {
    status.clear()
    return refusal(ctx, name, err)
  }
  status.clear()
  if (live) {
    // The run's own re-check can drop a row the preview showed, if it moved
    // while the question was open: say which, since it gets no tick.
    const seen = new Set(preview.dropped.map(dropKey))
    const late = receipt.dropped.filter((d) => !seen.has(dropKey(d)))
    if (late.length > 0) ctx.io.stdout(`\n${renderLateDrops(late, style)}`)
    ctx.io.stdout('\n')
  }
  if (v.format === 'json') {
    ctx.io.stdout(
      `${JSON.stringify({ receiptPath: receiptPath ?? null, summary: summarizeRun(receipt), receipt }, null, 2)}\n`,
    )
  } else {
    ctx.io.stdout(renderReceipt(receipt, receiptPath ?? null, style, { steps: !live }))
  }
  if (receiptPath === undefined) {
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
  preview: Preview,
  count: number,
  json: boolean,
  deps: MainDeps,
): number | null {
  // The preview is for the person answering, so it goes where the question does.
  const show = json ? ctx.io.stderr : ctx.io.stdout
  show(renderPreview(preview, styleFor(ctx, json ? 'stderr' : 'stdout')))
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

/** `bytes` as a short size: `512 B`, `3.4 MB`. */
function sizeText(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return unit === 0 ? `${value} B` : `${value.toFixed(1)} ${units[unit]}`
}

function cacheLine(m: CachedMirror): string {
  const why = m.partial ? 'left by a stopped clone' : m.problem
  const note = why === null ? '' : `  (${why})`
  // A URL, directory name or git message is outside text: no terminal controls.
  return (
    stripControls(`${sizeText(m.bytes).padStart(9)}  ${m.url ?? '(no origin)'}  ${m.dir}${note}`) +
    '\n'
  )
}

function cacheList(ctx: CliContext, dir: string, json: boolean): number {
  const mirrors = listMirrors(dir)
  if (json) {
    ctx.io.stdout(`${JSON.stringify({ cache: dir, mirrors }, null, 2)}\n`)
    return EXIT.ok
  }
  if (mirrors.length === 0) {
    ctx.io.stdout(`no clones in ${dir}\n`)
    return EXIT.ok
  }
  for (const m of mirrors) ctx.io.stdout(cacheLine(m))
  const total = mirrors.reduce((sum, m) => sum + m.bytes, 0)
  const count = `${mirrors.length} clone${mirrors.length === 1 ? '' : 's'}`
  ctx.io.stdout(`${count}, ${sizeText(total)}, in ${dir}\n`)
  return EXIT.ok
}

/**
 * The clones to remove: those of `urls`, or every entry when `urls` is null,
 * each with the URL to name it by (credentials removed), and the URLs that
 * have none.
 */
function cacheTargets(
  dir: string,
  urls: readonly string[] | null,
): { targets: Array<{ dir: string; label: string }>; missing: string[] } {
  if (urls === null) {
    const targets = listMirrors(dir).map((m) => ({ dir: m.dir, label: m.url ?? '(no origin)' }))
    return { targets, missing: [] }
  }
  const targets: Array<{ dir: string; label: string }> = []
  const missing: string[] = []
  for (const url of urls) {
    const shown = redactUrl(url)
    const found = cachedMirrorOf(url, dir)
    if (found === null) missing.push(shown)
    else targets.push({ dir: found, label: shown })
  }
  return { targets, missing }
}

/**
 * Remove the clones of `urls`, or every entry when `urls` is null. A URL with
 * no clone, or a clone that cannot be removed, is reported and the rest still
 * go; either makes the exit 1.
 */
function cacheRemove(
  ctx: CliContext,
  name: string,
  dir: string,
  urls: readonly string[] | null,
  json: boolean,
): number {
  const { targets, missing } = cacheTargets(dir, urls)
  const removed: string[] = []
  const failed: Array<{ dir: string; error: string }> = []
  for (const t of targets) {
    try {
      rmSync(t.dir, { recursive: true, force: true })
      removed.push(t.dir)
      if (!json) ctx.io.stdout(stripControls(`removed ${t.label}  ${t.dir}`) + '\n')
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      failed.push({ dir: t.dir, error })
      ctx.io.stderr(stripControls(`${name}: cannot remove ${t.label}  ${t.dir}: ${error}`) + '\n')
    }
  }
  for (const url of missing) ctx.io.stderr(stripControls(`${name}: no clone of ${url}`) + '\n')
  if (json) {
    ctx.io.stdout(`${JSON.stringify({ cache: dir, removed, missing, failed }, null, 2)}\n`)
  } else if (targets.length === 0 && missing.length === 0) {
    ctx.io.stdout(`no clones in ${dir}\n`)
  }
  return missing.length > 0 || failed.length > 0 ? EXIT.error : EXIT.ok
}

function runCache(argv: readonly string[], ctx: CliContext): number {
  const name = `${NAME} cache`
  const parsed = parseWith(cacheCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  const [verb = 'list', ...urls] = parsed.positionals
  const dir = defaultCacheDir(ctx.env)
  const json = v.format === 'json'
  if (verb === 'list') {
    if (urls.length > 0 || v.all) return usageError(ctx, name, 'list takes no URLs and no --all')
    return cacheList(ctx, dir, json)
  }
  if (verb === 'remove') {
    const hasUrls = urls.length > 0
    if (hasUrls === v.all) {
      return usageError(ctx, name, 'remove takes URLs or --all, not both and not neither')
    }
    return cacheRemove(ctx, name, dir, v.all ? null : urls, json)
  }
  return usageError(ctx, name, `unknown verb ${JSON.stringify(verb)}; use list or remove`)
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
    if (sub === 'plan') return runPlan(rest, c, status)
    if (sub === 'clean') return runClean(rest, c, deps, status)
    if (sub === 'cache') return runCache(rest, c)
    return runReport(argv, c, status)
  } finally {
    status.clear()
  }
}
