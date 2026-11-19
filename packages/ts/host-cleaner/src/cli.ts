/**
 * `host-cleaner` — machine cleanup over repo-cleaner.
 *
 *   host-cleaner [target...]   the report; deletes nothing
 *   host-cleaner plan          save repo-cleaner's rows and the host rows, to run later
 *   host-cleaner clean         check again, show the steps, ask, delete
 *
 * The options are repo-cleaner's, less its remote-branch and URL-target
 * options, plus `--adapter` and `--skip-adapter`. Targets default to the config
 * file's, then to the directory you are in. See `config.ts` for where the
 * config, receipts and log live.
 *
 * Exit codes: 0 swept, or clean ran, was declined or had nothing to do; 1
 * failed against the state it found; 2 cannot run as typed; 10 nothing to
 * sweep; 11 clean stopped at a failed step; the receipt says which.
 */

import { appendFileSync, mkdirSync, readSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

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
import { KINDS, RepoCleanerError, render, type Kind, type RepoNote } from '@osdlc/repo-cleaner'
import { stripControls } from '@osdlc/ux'

import { HostCleanerError, type HostAdapter, type HostRow } from './adapter.ts'
import { hostCheck, hostRun, type HostApproval, type HostPreview } from './clean.ts'
import { configFile, hostConfigOf, hostDirs, readConfig, type Config } from './config.ts'
import type { HostOptions } from './options.ts'
import { hostPlan, parseHostPlan, readHostPlan, writeHostPlan, type HostPlan } from './plan.ts'
import { hostSweep, type HostSweep } from './sweep.ts'

const NAME = 'host-cleaner'
const EXIT_NOTHING_TO_SWEEP = 10
const EXIT_STEP_FAILED = 11

const HELP_FLAGS = {
  help: { kind: 'boolean', short: 'h', help: 'show this message' },
} as const

const SWEEP_FLAGS = {
  only: {
    kind: 'list',
    valueName: 'kinds',
    help: `only these kinds of repo-cleaner row: ${KINDS.filter((k) => k !== 'remote').join(', ')}`,
  },
  adapter: {
    kind: 'list',
    valueName: 'names',
    help: 'run only these adapters',
  },
  skipAdapter: {
    kind: 'list',
    valueName: 'names',
    help: 'never run these adapters',
  },
  config: {
    kind: 'string',
    valueName: 'file',
    help: 'read this config file instead of the one in the config directory',
  },
} as const

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
    help: 'a checkout or a directory of checkouts (default: the config file’s targets, else the directory you are in)',
  },
] as const

const reportCli = () =>
  defineCli({
    name: NAME,
    summary:
      'Say what on this machine can go: repo-cleaner’s rows, re-ranked by the detected adapters, ' +
      'and the rows the adapters own. Deletes nothing.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      all: { kind: 'boolean', help: 'also show keep rows (with --format text)' },
      format: {
        kind: 'enum',
        choices: ['text', 'json'] as const,
        valueName: 'form',
        default: 'text',
        help: 'text (the report) or json (everything)',
      },
      ...HELP_FLAGS,
    },
    shortEpilogue: `commands:
  ${NAME} [target...]   this report (the default)
  ${NAME} plan          save the rows and their evidence, to run later
  ${NAME} clean         check again, show the steps, ask, delete`,
  })

const planCli = () =>
  defineCli({
    name: `${NAME} plan`,
    summary:
      'Sweep, and save every row, each with a fingerprint of the evidence behind its verdict, ' +
      'so `clean --plan` can run it later and drop what moved since.',
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
  })

const cleanCli = () =>
  defineCli({
    name: `${NAME} clean`,
    summary:
      'Delete what the sweep (or a saved plan) found: check each row again, show the steps, ask, ' +
      'then delete, verifying each step. Without --pick, every row judged delete runs.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      pick: rowList('row', 'work on exactly these rows; a review row runs only when picked'),
      spare: rowList('row', 'leave this row alone; repeatable'),
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
        help: 'write the receipt here (default: the state directory)',
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
    shortEpilogue: `rows: worktree:<path>, branch:<name>, <kind>:<name> for a host row, or a bare name
A row that carries a risk you did not --allow is skipped, never deleted.`,
  })

export type Confirm = (question: string) => boolean | null

const terminalConfirm: Confirm = (question) => (canPrompt() ? askYesNo(question) : null)

export interface MainDeps {
  /** The adapters that exist, in run order. The shipped binary has none. */
  adapters?: readonly HostAdapter[]
  confirm?: Confirm
  /** Reads `--plan -`. Defaults to stdin. */
  readStdin?: () => string
  /** Read by the adapters and the sweep in place of the real ones. */
  host?: Pick<HostOptions, 'git' | 'command' | 'probe' | 'now'>
}

function readAllStdin(): string {
  const chunks: Buffer[] = []
  const buf = Buffer.alloc(65536)
  for (;;) {
    let n: number
    try {
      n = readSync(0, buf, 0, buf.length, null)
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EAGAIN') throw e
      continue
    }
    if (n === 0) return Buffer.concat(chunks).toString('utf8')
    chunks.push(Buffer.from(buf.subarray(0, n)))
  }
}

const usageError = (ctx: CliContext, name: string, message: string): number => {
  ctx.io.stderr(`${name}: ${stripControls(message)}\n`)
  return EXIT.usage
}

/** A refusal as its exit code: 2 for what was typed, 1 for the state found. */
function refusal(ctx: CliContext, name: string, err: unknown): number {
  const typed =
    (err instanceof RepoCleanerError && (err.code === 'conflict' || err.code === 'bad-input')) ||
    (err instanceof HostCleanerError && err.code === 'bad-input')
  if (typed) return usageError(ctx, name, (err as Error).message)
  ctx.io.stderr(`${name}: ${stripControls(err instanceof Error ? err.message : String(err))}\n`)
  return EXIT.error
}

/** The values a command's declared flags parse to. */
type ValuesOf<C> = C extends Cli<infer F> ? FlagValues<F> : never

type Parsed<T> =
  { status: 'ok'; values: T; positionals: string[] } | { status: 'done'; code: number }

function parseWith<F extends FlagSpec & typeof HELP_FLAGS>(
  cli: Cli<F>,
  name: string,
  argv: readonly string[],
  ctx: CliContext,
): Parsed<FlagValues<F>> {
  const parsed = cli.parse(argv, ctx.io)
  if (parsed.status === 'help') return { status: 'done', code: EXIT.ok }
  if (parsed.status === 'error')
    return { status: 'done', code: usageError(ctx, name, parsed.message) }
  if ((parsed.values as { help?: boolean }).help) {
    ctx.io.stdout(cli.help({}))
    return { status: 'done', code: EXIT.ok }
  }
  return parsed
}

type SweepValues = FlagValues<typeof SWEEP_FLAGS>

/** What the sweep, the check and the run share: the config's settings and the adapter selection. */
function hostOptions(v: SweepValues, config: Config, deps: MainDeps): HostOptions {
  return {
    ...deps.host,
    adapters: deps.adapters ?? [],
    config: hostConfigOf(config),
    ...(v.adapter === undefined ? {} : { adapter: v.adapter }),
    ...(v.skipAdapter === undefined ? {} : { noAdapter: v.skipAdapter }),
  }
}

function sweepWith(
  v: SweepValues,
  targets: readonly string[],
  config: Config,
  ctx: CliContext,
  deps: MainDeps,
): HostSweep {
  const only = v.only?.filter((s) => s !== '') as Kind[] | undefined
  if (only?.includes('remote')) {
    throw new HostCleanerError(
      'bad-input',
      'remote branches are repo-cleaner’s: use `repo-cleaner --remote`',
    )
  }
  return hostSweep(targets.length > 0 ? targets : config.targets, {
    ...hostOptions(v, config, deps),
    cwd: ctx.cwd,
    only: only ?? ['worktree', 'branch'],
  })
}

const loadConfig = (v: { config?: string | undefined }, ctx: CliContext): Config =>
  v.config === undefined
    ? readConfig(configFile(hostDirs(ctx.env)))
    : readConfig(resolve(ctx.cwd, v.config), { required: true })

function writeNotes(ctx: CliContext, name: string, notes: readonly RepoNote[]): void {
  for (const { repo, note } of notes)
    ctx.io.stderr(`${name}: ${stripControls(`${repo}: ${note}`)}\n`)
}

/** Host rows as text: a line per row, then what it does and why. */
function renderHostRows(rows: readonly HostRow[], all: boolean): string {
  const shown = rows.filter((r) => all || r.verdict !== 'keep')
  if (shown.length === 0) return ''
  const lines = ['host rows']
  for (const r of shown) {
    lines.push(`  ${r.verdict.padEnd(7)} ${r.id}`)
    lines.push(`          ${r.why}`)
    for (const c of r.commands) lines.push(`          ${c}`)
    for (const b of r.blockers) lines.push(`          blocked: ${b}`)
    if (r.risks.length > 0) lines.push(`          risks: ${r.risks.join(', ')}`)
  }
  return stripControls(lines.join('\n'), { newline: true }) + '\n'
}

function renderAdapters(s: HostSweep): string {
  const lines = s.adapters.map(
    (a) =>
      `adapter ${a.name}: ${a.status === 'active' ? 'active' : `skipped (${a.reason})`}${a.error ? `: ${a.error}` : ''}`,
  )
  return lines.length === 0 ? '' : stripControls(lines.join('\n'), { newline: true }) + '\n'
}

/** True when the sweep found no repository and no host row. */
const nothingSwept = (s: HostSweep): boolean => s.repo.repos.length === 0 && s.rows.length === 0

function runReport(argv: readonly string[], ctx: CliContext, deps: MainDeps): number {
  const parsed = parseWith(reportCli(), NAME, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  let s: HostSweep
  try {
    s = sweepWith(v, parsed.positionals, loadConfig(v, ctx), ctx, deps)
  } catch (err) {
    return refusal(ctx, NAME, err)
  }
  const none = nothingSwept(s)
  if (v.format === 'json') {
    ctx.io.stdout(render.json(s.repo, { adapters: s.adapters, hostRows: s.rows }))
  } else {
    ctx.io.stdout(
      render.text(s.repo, { all: v.all }) + renderHostRows(s.rows, v.all) + renderAdapters(s),
    )
  }
  return none ? EXIT_NOTHING_TO_SWEEP : EXIT.ok
}

function runPlan(argv: readonly string[], ctx: CliContext, deps: MainDeps): number {
  const name = `${NAME} plan`
  const parsed = parseWith(planCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  let plan: HostPlan
  try {
    const s = sweepWith(v, parsed.positionals, loadConfig(v, ctx), ctx, deps)
    if (nothingSwept(s)) return EXIT_NOTHING_TO_SWEEP
    plan = hostPlan(s)
  } catch (err) {
    return refusal(ctx, name, err)
  }
  if (v.out === '-') {
    ctx.io.stdout(`${JSON.stringify(plan, null, 2)}\n`)
  } else {
    const path = resolve(ctx.cwd, v.out)
    writeHostPlan(path, plan)
    ctx.io.stderr(`plan: ${path}\n`)
  }
  return EXIT.ok
}

/** `risk` or `risk=row` as an allow. */
function parseAllow(text: string): { risk: string; row?: string } {
  const eq = text.indexOf('=')
  if (eq < 0) return { risk: text }
  const row = text.slice(eq + 1)
  if (row === '') throw new HostCleanerError('bad-input', `--allow ${text} names no row`)
  return { risk: text.slice(0, eq), row }
}

type CleanValues = ValuesOf<ReturnType<typeof cleanCli>>

/** The options that contradict each other, as a usage message, or null. */
function cleanConflict(v: CleanValues, targets: readonly string[]): string | null {
  if (v.plan !== undefined) {
    const fixed = [
      targets.length > 0 ? 'targets' : null,
      v.only !== undefined ? '--only' : null,
      v.adapter !== undefined ? '--adapter' : null,
      v.skipAdapter !== undefined ? '--skip-adapter' : null,
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

const REPO_ACTIONS = new Set([
  'remove-worktree',
  'delete-branch',
  'delete-remote',
  'prune-worktrees',
])

/** Rows a run deletes: the person is asked to approve this many. */
function rowsActedOn(p: HostPreview): number {
  return p.repo.steps.filter((s) => REPO_ACTIONS.has(s.action)).length + p.steps.length
}

/** The host half of a preview as text. */
function renderHostSteps(p: Pick<HostPreview, 'steps' | 'dropped'>): string {
  const lines: string[] = []
  for (const s of p.steps)
    lines.push(
      `  ${s.result === 'ok' ? 'done' : s.result === 'failed' ? 'FAILED' : 'host'}    ${s.row}`,
      `          ${s.command}${s.verification ? ` (${s.verification})` : ''}${s.error ? ` (${s.error})` : ''}`,
    )
  for (const d of p.dropped) lines.push(`  skip    ${d.row}`, `          ${d.reason}: ${d.detail}`)
  return lines.length === 0 ? '' : stripControls(lines.join('\n'), { newline: true }) + '\n'
}

function renderPreview(p: HostPreview): string {
  const repo = p.repo.steps.length + p.repo.dropped.length > 0 ? render.preview(p.repo) : ''
  const host = renderHostSteps(p)
  const unused = p.unusedAllows
    .map((a) => `unused: --allow ${a.risk}${a.row === null ? '' : `=${a.row}`}\n`)
    .join('')
  return (
    repo +
    (host === '' ? '' : `host rows\n${host}`) +
    stripControls(unused, { newline: true }) +
    `would delete: ${rowsActedOn(p)} item(s)\n`
  )
}

const stamp = (d: Date): string => d.toISOString().replace(/[:.]/g, '-')

function logRun(logs: string, entry: Record<string, unknown>): void {
  try {
    mkdirSync(logs, { recursive: true })
    appendFileSync(join(logs, `${NAME}.log`), `${JSON.stringify(entry)}\n`)
  } catch {
    // A log that cannot be written must not fail a run that already happened.
  }
}

function runClean(argv: readonly string[], ctx: CliContext, deps: MainDeps): number {
  const name = `${NAME} clean`
  const parsed = parseWith(cleanCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  const conflict = cleanConflict(v, parsed.positionals)
  if (conflict !== null) return usageError(ctx, name, conflict)

  const now = new Date()
  const dirs = hostDirs(ctx.env)
  let plan: HostPlan
  let source: string
  let config: Config
  let preview: HostPreview
  try {
    config = loadConfig(v, ctx)
    const approval: HostApproval = { pick: v.pick, spare: v.spare, allow: v.allow.map(parseAllow) }
    if (v.plan === undefined) {
      const s = sweepWith(v, parsed.positionals, config, ctx, deps)
      if (nothingSwept(s)) return EXIT_NOTHING_TO_SWEEP
      plan = hostPlan(s, now)
      source = '(swept)'
    } else if (v.plan === '-') {
      plan = parseHostPlan((deps.readStdin ?? readAllStdin)(), 'stdin')
      source = '(stdin)'
    } else {
      source = resolve(ctx.cwd, v.plan)
      plan = readHostPlan(source)
    }
    preview = hostCheck(plan, approval, { ...hostOptions(v, config, deps), cwd: ctx.cwd })
  } catch (err) {
    return refusal(ctx, name, err)
  }
  writeNotes(ctx, name, preview.repo.notes)

  const count = rowsActedOn(preview)
  const json = v.format === 'json'
  if (v.dryRun || count === 0) {
    ctx.io.stdout(
      json
        ? `${JSON.stringify({ dryRun: v.dryRun, repo: preview.repo.steps, host: preview.steps, dropped: { repo: preview.repo.dropped, host: preview.dropped } }, null, 2)}\n`
        : renderPreview(preview),
    )
    return EXIT.ok
  }
  if (!v.yes) {
    ;(json ? ctx.io.stderr : ctx.io.stdout)(renderPreview(preview))
    const answer = (deps.confirm ?? terminalConfirm)(
      `Delete ${count} item${count === 1 ? '' : 's'}?`,
    )
    if (answer === null)
      return usageError(ctx, name, 'refusing to delete without a terminal to ask; pass --yes')
    if (!answer) {
      ctx.io.stderr('nothing deleted\n')
      return EXIT.ok
    }
  }

  const receiptPath =
    v.receipt === undefined
      ? join(dirs.state, 'receipts', `receipt-${stamp(now)}.json`)
      : resolve(ctx.cwd, v.receipt)
  let receipt
  try {
    mkdirSync(dirname(receiptPath), { recursive: true })
    receipt = hostRun(preview, {
      ...hostOptions(v, config, deps),
      cwd: ctx.cwd,
      source,
      receiptPath,
      now: () => new Date(),
      onNotes: (notes) => writeNotes(ctx, name, notes),
    })
  } catch (err) {
    return refusal(ctx, name, err)
  }
  logRun(dirs.logs, { at: now.toISOString(), source, receipt: receiptPath, status: receipt.status })
  if (json) {
    ctx.io.stdout(`${JSON.stringify({ receiptPath, receipt }, null, 2)}\n`)
  } else {
    const repo =
      receipt.repo.steps.length + receipt.repo.dropped.length > 0
        ? render.receipt(receipt.repo, null)
        : ''
    ctx.io.stdout(
      repo +
        renderHostSteps({ steps: receipt.host.steps, dropped: receipt.host.dropped }) +
        `receipt: ${stripControls(receiptPath)} (${receipt.status})\n`,
    )
  }
  return receipt.status === 'failed' ? EXIT_STEP_FAILED : EXIT.ok
}

/** `main(argv, ctx)`: returns an exit code, never exits. */
export function main(argv: readonly string[], ctx: CliContext, deps: MainDeps = {}): number {
  const [sub, ...rest] = argv
  if (sub === 'plan') return runPlan(rest, ctx, deps)
  if (sub === 'clean') return runClean(rest, ctx, deps)
  return runReport(argv, ctx, deps)
}
