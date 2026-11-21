/**
 * `repo-cleaner` — what has been merged, and what can go away. Nothing runs
 * until a phase is named; the bare command explains them and exits 2.
 *
 *   repo-cleaner status        look: every row and its verdict; deletes nothing
 *   repo-cleaner plan          save what status found, to clean later
 *   repo-cleaner clean         check again, show the steps, ask, delete
 *   repo-cleaner cache         list or remove the clones kept for remote URL targets
 *
 * Every command takes `--help`, and `--help --extended` for the full
 * reference: what each option means, the words the report uses, and which
 * combinations are refused. A combination that contradicts itself, or one
 * with an option that would have no effect, is refused with exit 2 before
 * anything is swept.
 *
 * Exit codes: see EXIT in src/reference.ts (shown by --help --extended).
 */

import { readSync, rmSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { isatty } from 'node:tty'

import {
  EXIT,
  askChecklist,
  askYesNo,
  canPrompt,
  defineCli,
  renderError,
  type Cli,
  type ChecklistItem,
  type CliContext,
  type FlagSpec,
  type FlagValues,
} from '@osdlc/cli-tool'
import { detectColorLevel, stripControls } from '@osdlc/ux'

import {
  allowed,
  checkApproval,
  keyOf,
  parseAllow,
  resolveApproval,
  type Approval,
} from './approval.ts'
import { check, run, type Preview } from './clean.ts'
import {
  fileStamp,
  parsePlan,
  plan as planOf,
  readPlan,
  runnable,
  writePlan,
  type Plan,
} from './plan.ts'
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
import { formatBytes } from './size.ts'
import { stepBoard, type StepBoard } from './step-board.ts'
import { sweptWith } from './scope.ts'
import { sweep as sweepTargets, type Runners, type SweepOptions } from './sweep.ts'
import {
  KINDS,
  RISKS,
  RepoCleanerError,
  sweepNotes,
  type Kind,
  type RepoNote,
  type Sweep,
} from './types.ts'

const EXIT_NOTHING_TO_SWEEP = 10
const EXIT_STEP_FAILED = 11

const NAME = 'repo-cleaner'

const NO_TERMINAL_FOR_I =
  '-i needs a terminal to ask on; name the rows with --pick and --spare instead'

/** `--help` and its modifier: commander must not own `--help`, or it would never see `--extended`. */
const HELP_FLAGS = {
  help: { kind: 'boolean', short: 'h', help: 'show this message' },
  extended: { kind: 'boolean', help: 'with --help: the full reference' },
} as const

/** Which rows a phase looks at. With none of them, `--local`. */
const SCOPE_FLAGS = {
  local: { kind: 'boolean', help: 'worktrees and local branches (the default)' },
  remote: {
    kind: 'list',
    valueName: 'name',
    valueAfterEquals: true,
    commaSeparated: false,
    help: "branches on the default remote; --remote=<name> another, --remote='*' every remote; repeatable",
  },
  all: { kind: 'boolean', help: '--local and --remote' },
  worktrees: { kind: 'boolean', help: 'only worktrees, of the local rows' },
  branches: { kind: 'boolean', help: 'only local branches, of the local rows' },
} as const

/** The flags every phase that looks takes. */
const SWEEP_FLAGS = {
  ...SCOPE_FLAGS,
  fetch: { kind: 'boolean', help: 'fetch the default remote before judging local rows' },
  offline: { kind: 'boolean', help: 'no network: no fetch, judge from the refs on disk' },
  branch: {
    kind: 'string',
    valueName: 'name|HEAD',
    help: "one branch's rows: its worktree, local branch, and remote branches",
  },
  against: {
    kind: 'string',
    valueName: 'remote',
    help: "judge every row against this remote's default branch (a fork against its parent)",
  },
  provider: {
    kind: 'enum',
    choices: PROVIDER_CHOICES,
    valueName: 'name',
    help: 'with remote rows: where pull requests come from',
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
    help: 'a checkout, a directory of checkouts, or a remote URL (default: the directory you are in)',
  },
] as const

const MORE = `Run with --help --extended for the full reference: what every option means, the words the report uses, and which combinations are refused.`

const PHASES = `phases:
  ${NAME} status   look: every row and its verdict, with the command that would delete it
  ${NAME} plan     save what status found, to clean later or hand over
  ${NAME} clean    check again, show the steps, ask, delete
  ${NAME} cache    list or remove the clones kept for remote URL targets`

/** What the bare command prints: the phases, and that nothing ran. */
const OVERVIEW = `${NAME} finds worktrees and branches whose work has landed, and deletes them safely.

It works in phases. Nothing is deleted until clean, and only what is safe.

  1. status   Look: each worktree and branch, with a verdict and the reason.
                $ ${NAME} status            this repository
                $ ${NAME} status --all      local and remote branches
  2. plan     Optional: save what status found, to run later or hand on.
                $ ${NAME} plan --all -o plan.json
  3. clean    Delete what is safe: checks each row again, shows the steps, asks.
                $ ${NAME} clean             asks first
                $ ${NAME} clean -y          does not ask
                $ ${NAME} clean --plan plan.json

Nothing ran. Name a phase; \`${NAME} <phase> --help\` shows its options.
\`${NAME} cache\` manages the clones of remote URL targets; \`${NAME} dev\` runs a
development checkout.
`

const statusCli = () =>
  defineCli({
    name: `${NAME} status`,
    summary:
      'Sort every worktree and local branch (remote branches too, with --remote) into a ' +
      'verdict, with the evidence and the command that would delete each. Deletes nothing.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      sizes: {
        kind: 'boolean',
        help: "read each worktree's size on disk: rank rows largest first and total what can be freed; slower",
      },
      allRows: { kind: 'boolean', help: 'also show keep rows (with --format text)' },
      format: {
        kind: 'enum',
        choices: ['text', 'json', 'summary', 'commands'] as const,
        valueName: 'form',
        default: 'text',
        help: 'text (the report), json (everything), summary (counts), commands (only the safe commands)',
      },
      ...HELP_FLAGS,
    },
    shortEpilogue: `${PHASES}\n\n${MORE}`,
    epilogue: REFERENCE.status,
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
      'Delete what status (or a saved plan) found: check each row again, show the steps, ask, ' +
      'then delete, compare-and-swap, verifying each step. Every row judged delete runs, and ' +
      'each row picked.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      pick: rowList('row', 'also run this row; a review row runs only when picked; repeatable'),
      spare: rowList(
        'row|glob',
        'leave these rows alone; a remote branch spared by name that moved stops the run; repeatable',
      ),
      interactive: {
        kind: 'boolean',
        short: 'i',
        help: 'choose the rows from a checklist; needs a terminal',
      },
      allow: rowList('risk[=row]', 'accept a risk for every row, or for one row; repeatable'),
      archive: {
        kind: 'boolean',
        help:
          'push unlanded work to an archive branch on the remote before deleting it; ' +
          'then --allow discard-archived stands for abandon-unmerged and discard-changes',
      },
      archiveExclude: {
        kind: 'list',
        valueName: 'glob',
        default: [] as readonly string[],
        commaSeparated: false,
        help: 'with --archive, leave files matching this glob out of a worktree snapshot; repeatable',
      },
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

/**
 * Shows a checklist and returns the ticked indexes, or null when there is no
 * one to ask. `main` takes it as a parameter so a test can answer.
 */
export type Checklist = (question: string, items: readonly ChecklistItem[]) => number[] | null

const terminalChecklist: Checklist = (question, items) =>
  canPrompt() ? askChecklist(question, items) : null

export interface MainDeps {
  confirm?: Confirm
  /** Answers `clean -i`. Defaults to a checklist on the terminal. */
  checklist?: Checklist
  /** The `git`, `gh` and `glab` runners and the process probe every phase uses. Default: the real ones. */
  runners?: Runners
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

/** Flags only `status` takes, each with what `plan` and `clean` say when given it. */
const STATUS_ONLY: Readonly<Record<string, string>> = {
  '--sizes': `--sizes is a status flag: run \`${NAME} status --sizes\``,
}

/**
 * Parse, and answer `--help` (and `--help --extended`) itself. An unknown
 * option named in `elsewhere` is refused with its message there instead of
 * the parser's.
 */
function parseWith<F extends FlagSpec & typeof HELP_FLAGS>(
  cli: Cli<F>,
  name: string,
  argv: readonly string[],
  ctx: CliContext,
  elsewhere: Readonly<Record<string, string>> = {},
): Parsed<FlagValues<F>> {
  const parsed = cli.parse(argv, ctx.io)
  if (parsed.status === 'help') return { status: 'done', code: EXIT.ok }
  if (parsed.status === 'error') {
    const flag = /^unknown option '(--[^'=]+)/.exec(parsed.message)?.[1]
    const message = (flag === undefined ? undefined : elsewhere[flag]) ?? parsed.message
    return { status: 'done', code: usageError(ctx, name, message) }
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

/**
 * The kinds of row and the remotes the scope flags name. No scope flag is
 * `--local`; `--worktrees` and `--branches` narrow the local rows; the flags
 * add up. Throws a `conflict` for `--all` beside a named remote.
 */
function scopeOf(v: SweepValues): { only?: Kind[]; remotes: string[] } {
  // No scope flag: the library's default, which also lets a remote URL target
  // sweep its remote branches.
  if (!v.local && v.remote === undefined && !v.all && !v.worktrees && !v.branches) {
    return { remotes: [] }
  }
  const remotes = [...(v.remote ?? [])]
  if (v.all && remotes.some((r) => r !== '')) {
    throw new RepoCleanerError(
      'conflict',
      '--all is --local and the default remote; with other remotes, write them out: --local --remote=<name>',
    )
  }
  if (v.all) remotes.push('')
  const narrowed = v.worktrees || v.branches
  const local: Kind[] = narrowed
    ? KINDS.filter((k) => (k === 'worktree' && v.worktrees) || (k === 'branch' && v.branches))
    : v.local || v.all || remotes.length === 0
      ? ['worktree', 'branch']
      : []
  return { only: remotes.length > 0 ? [...local, 'remote'] : local, remotes }
}

/**
 * The sweep options as typed, for {@link sweptWith} and {@link sweepTargets}.
 * Only `status` takes `--sizes`.
 */
function sweepOptions(
  v: SweepValues & { sizes?: boolean },
  ctx: CliContext,
  deps: MainDeps,
): SweepOptions {
  return {
    ...deps.runners,
    cwd: ctx.cwd,
    ...scopeOf(v),
    fetch: v.fetch,
    offline: v.offline,
    sizes: v.sizes === true,
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
  const fetched = s.options.fetch ? '' : 'nothing fetched, '
  return (
    style.muted(
      `Local only: ${fetched}no pull requests looked up, remote branches not checked; --all adds the default remote's branches.`,
    ) + '\n'
  )
}

type Swept =
  { kind: 'ok'; sweep: Sweep } | { kind: 'nothing'; sweep: Sweep } | { kind: 'exit'; code: number }

/** Sweep, or answer with the exit code. */
function doSweep(
  name: string,
  v: SweepValues & { sizes?: boolean },
  targets: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
  status: StatusLine,
): Swept {
  let result: Sweep
  try {
    const opts: SweepOptions = {
      ...sweepOptions(v, ctx, deps),
      // Mid-walk, while the wait is happening: the totals come too late to
      // explain why the tool appeared to hang.
      onWarn: (message) => ctx.io.stderr(`${NAME}: ${message}\n`),
      ...(v.progress ? { onProgress: (p) => status.update(describeSweep(p)) } : {}),
    }
    if (v.progress) status.update(`${NAME}: finding repositories`)
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
  const failed = s.repos.filter((r) => r.error !== null)
  for (const r of failed) ctx.io.stderr(`${name}: ${r.repo?.root ?? r.path}: ${r.error}\n`)
  return failed.length > 0
}

/** Each repository's `RepoSweep.notes`, on stderr, for the outputs that do not carry them. */
function reportNotes(ctx: CliContext, name: string, s: Sweep): void {
  writeNotes(ctx, name, sweepNotes(s))
}

/** Notes as `<name>: <repo>: <note>` lines on stderr. A note quotes git's and the provider's output, so it goes out as an error line does, controls removed. */
function writeNotes(ctx: CliContext, name: string, notes: readonly RepoNote[]): void {
  for (const { repo, note } of notes) ctx.io.stderr(renderError(`${repo}: ${note}`, name))
}

function runStatus(
  argv: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
  status: StatusLine,
): number {
  const name = `${NAME} status`
  const parsed = parseWith(statusCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  if (v.allRows && v.format !== 'text') {
    return usageError(
      ctx,
      name,
      `--all-rows has no effect with --format ${v.format}: it shows keep rows in the text report`,
    )
  }
  const style = styleFor(ctx, 'stdout')
  const swept = doSweep(name, v, parsed.positionals, ctx, deps, status)
  if (swept.kind === 'exit') return swept.code
  const s = swept.sweep
  if (v.format === 'json') ctx.io.stdout(renderJson(s))
  else if (v.format === 'summary') ctx.io.stdout(renderSummary(s, style) + remoteNote(s, style))
  else if (v.format === 'commands') {
    reportNotes(ctx, name, s)
    const commands = renderCommands(s)
    if (commands.length > 0) ctx.io.stdout(commands.join('\n') + '\n')
  } else {
    ctx.io.stdout(renderText(s, { all: v.allRows, style }) + remoteNote(s, style))
  }
  return swept.kind === 'nothing' ? EXIT_NOTHING_TO_SWEEP : EXIT.ok
}

function runPlan(
  argv: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
  status: StatusLine,
): number {
  const name = `${NAME} plan`
  const parsed = parseWith(planCli(), name, argv, ctx, STATUS_ONLY)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  const swept = doSweep(name, v, parsed.positionals, ctx, deps, status)
  if (swept.kind === 'exit') return swept.code
  // stdout carries only the plan, so the totals go to stderr either way.
  if (swept.kind === 'nothing') {
    ctx.io.stderr(renderTotals(swept.sweep) + '\n')
    return EXIT_NOTHING_TO_SWEEP
  }
  const plan = planOf(swept.sweep)
  reportNotes(ctx, name, swept.sweep)
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
    // Every sweep flag given, so a new one cannot be missed here. `progress`
    // only draws.
    const given = (Object.keys(SWEEP_FLAGS) as (keyof typeof SWEEP_FLAGS)[]).filter(
      (k) => k !== 'progress' && v[k] !== undefined && v[k] !== false,
    )
    const fixed = [...(targets.length > 0 ? ['targets'] : []), ...given.map((k) => `--${k}`)]
    if (fixed.length > 0) return `--plan already fixed what is swept; drop ${fixed.join(', ')}`
  }
  if (v.interactive && v.pick.length > 0) {
    return '-i chooses the rows from a checklist; drop --pick, or drop -i'
  }
  if (v.interactive && v.plan === '-') {
    return '-i asks on the terminal, and --plan - reads the plan from stdin; save the plan to a file'
  }
  if (v.plan === '-' && !v.yes && !v.dryRun) {
    return '--plan - reads the plan from stdin, so nothing can ask; pass --yes or --dry-run'
  }
  if (!v.archive && v.archiveExclude.length > 0) {
    return '--archive-exclude has no effect without --archive'
  }
  if (v.yes && v.dryRun)
    return '--yes and --dry-run contradict: one deletes without asking, the other deletes nothing'
  if (v.receipt !== undefined && v.dryRun)
    return '--receipt has no effect with --dry-run: nothing runs to record'
  return null
}

/**
 * `-i`: the plan's rows as a checklist, `delete` rows ticked, rows that can
 * never run shown but not selectable, spared rows left out; then each ticked
 * row's risks, asked for by name. The answer is an approval that selects
 * exactly the ticked rows, or null when there is no one to ask.
 */
function chooseRows(
  plan: Plan,
  sweep: Sweep | undefined,
  approval: Approval,
  ctx: CliContext,
  deps: MainDeps,
): Approval | null {
  const given = resolveApproval(plan, { spare: approval.spare, allow: approval.allow }, ctx.cwd)
  const left = new Set([...given.spare, ...given.spareMatched].map(keyOf))
  const why = new Map(
    (sweep?.repos ?? []).flatMap((r) =>
      r.repo === null
        ? []
        : r.rows.map((row) => [keyOf({ repo: r.repo!.root, id: row.id }), row.why]),
    ),
  )
  const rows = plan.repos.flatMap((r) =>
    r.rows
      .map((row) => ({ at: { repo: r.root, id: row.id }, row }))
      .filter(({ at }) => !left.has(keyOf(at))),
  )
  if (rows.length === 0) return { spare: approval.spare, allow: approval.allow }
  const several = plan.repos.length > 1
  const items: ChecklistItem[] = rows.map(({ at, row }) => {
    const reason = why.get(keyOf(at))
    const label = `${row.id}  ${row.verdict}${reason === undefined ? '' : `: ${reason}`}${several ? `  (${at.repo})` : ''}`
    const runs = runnable(row)
    return {
      label,
      checked: runs && row.verdict === 'delete',
      ...(runs ? {} : { disabled: row.verdict }),
    }
  })
  const ticked = (deps.checklist ?? terminalChecklist)('Clean which rows?', items)
  if (ticked === null) return null
  const allow = [...(approval.allow ?? [])]
  const ask = deps.confirm ?? terminalConfirm
  for (const i of ticked) {
    const { at, row } = rows[i]!
    for (const risk of row.risks) {
      if (allowed(given.allow, at, risk)) continue
      if (ask(`${row.id} carries ${risk}: allow it?`) === true) allow.push({ risk, row: at })
    }
  }
  return { select: ticked.map((i) => rows[i]!.at), spare: approval.spare, allow }
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
    const swept = doSweep(name, v, targets, ctx, deps, status)
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
  const parsed = parseWith(cleanCli(), name, argv, ctx, STATUS_ONLY)
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
  if (v.interactive && deps.checklist === undefined && !canPrompt()) {
    return usageError(ctx, name, NO_TERMINAL_FOR_I)
  }
  // Refuse what can be refused before sweeping; a saved plan's own options
  // are checked when the approval is resolved against it.
  if (v.plan === undefined) {
    try {
      checkApproval(sweptWith(targets, sweepOptions(v, ctx, deps)), approval)
    } catch (err) {
      return refusal(ctx, name, err)
    }
  }

  const now = new Date()
  const loaded = loadPlan(name, v, targets, ctx, deps, status, now)
  if (typeof loaded === 'number') return loaded
  const { plan, source, receiptPath } = loaded
  const ok = (): number => (loaded.unreadable ? EXIT.error : EXIT.ok)
  if (v.interactive) {
    try {
      const chosen = chooseRows(plan, loaded.sweep, approval, ctx, deps)
      if (chosen === null) {
        return usageError(ctx, name, NO_TERMINAL_FOR_I)
      }
      approval = chosen
    } catch (err) {
      return refusal(ctx, name, err)
    }
  }

  // On a terminal the run is shown live: every step first, then each one
  // checked off as it finishes.
  const live = v.format === 'text' && ctx.terminal?.stdout === true
  const style = styleFor(ctx, 'stdout')

  const shared = {
    ...deps.runners,
    cwd: ctx.cwd,
    ...(v.archive ? { archive: { exclude: v.archiveExclude } } : {}),
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
  // The re-check's notes: from the sweep just made, or from sweeping a saved
  // plan's repositories again. The run re-checks once more; only a note that
  // is new by then is printed again.
  const noted = new Set<string>()
  const notesOnce = (notes: readonly RepoNote[]): void =>
    writeNotes(
      ctx,
      name,
      notes.filter(({ repo, note }) => {
        const key = `${repo}\0${note}`
        if (noted.has(key)) return false
        noted.add(key)
        return true
      }),
    )
  notesOnce(preview.notes)

  const showPreview = (): void => {
    if (v.format === 'json') {
      ctx.io.stdout(
        `${JSON.stringify({ dryRun: v.dryRun, summary: summarizeRun(preview), steps: preview.steps, dropped: preview.dropped, unusedAllows: preview.unusedAllows, notes: preview.notes }, null, 2)}\n`,
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
      onNotes: (notes) => {
        // The run's re-check draws its progress on the status line.
        status.clear()
        notesOnce(notes)
      },
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

function cacheLine(m: CachedMirror): string {
  const why = m.partial ? 'left by a stopped clone' : m.problem
  const note = why === null ? '' : `  (${why})`
  // A URL, directory name or git message is outside text: no terminal controls.
  return (
    stripControls(
      `${formatBytes(m.bytes).padStart(9)}  ${m.url ?? '(no origin)'}  ${m.dir}${note}`,
    ) + '\n'
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
  ctx.io.stdout(`${count}, ${formatBytes(total)}, in ${dir}\n`)
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
    if (sub === 'status') return runStatus(rest, c, deps, status)
    if (sub === 'plan') return runPlan(rest, c, deps, status)
    if (sub === 'clean') return runClean(rest, c, deps, status)
    if (sub === 'cache') return runCache(rest, c)
    if (sub === '-h' || sub === '--help') {
      c.io.stdout(OVERVIEW)
      return EXIT.ok
    }
    // Nothing runs until a phase is named: the bare command explains them.
    if (sub === undefined) {
      c.io.stderr(OVERVIEW)
      return EXIT.usage
    }
    return usageError(
      c,
      NAME,
      `${JSON.stringify(sub)} is not a phase: name one of status, plan, clean or cache, then the targets`,
    )
  } finally {
    status.clear()
  }
}
