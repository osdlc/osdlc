/**
 * `host-cleaner`: machine cleanup over plugins.
 *
 *   host-cleaner [target...]   the report; deletes nothing
 *   host-cleaner plan          save the candidates and objections, to run later
 *   host-cleaner clean         check again, show the steps, ask, delete
 *
 * `--plugin` and `--skip-plugin` choose among the plugins (`--adapter` is an
 * alias of `--plugin`). Targets default to the config file's, then to the
 * directory you are in. See `config.ts` for where the config, receipts and log
 * live.
 *
 * Exit codes: 0 swept, or clean ran, was declined or had nothing to do; 1
 * failed against the state it found; 2 cannot run as typed; 10 nothing to
 * sweep; 11 clean stopped at a failed step; the receipt says which.
 */

import { appendFileSync, mkdirSync, readSync, realpathSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import {
  EXIT,
  askYesNo,
  canPrompt,
  defineCli,
  renderError,
  type Cli,
  type CliContext,
  type FlagSpec,
  type FlagValues,
} from '@osdlc/cli-tool'
import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { claimLock, holderGone, releaseLock } from '@osdlc/file-lock'
import { KINDS, writeJsonAtomic, type Kind } from '@osdlc/repo-cleaner'
import { stripControls } from '@osdlc/ux'

import {
  cleanedIds,
  failedIds,
  leftForReview,
  measure,
  renderAutoReport,
  selectUnattended,
  type AutoReport,
} from './auto.ts'
import { ConfigError, configFile, hostDirs, readConfig, type Config } from './config.ts'
import { parsePlan, readPlan, writePlan, type Plan, type Receipt } from './plan.ts'
import { FACTORIES, UnknownPlugin, selectPlugins } from './registry.ts'
import {
  ScheduleError,
  installSchedule,
  parseEvery,
  scheduleStatus,
  uninstallSchedule,
  type ScheduleEnv,
} from './schedule.ts'
import { clean, orderPlugins, plan as makePlan, recheck, survey, type Decision } from './run.ts'
import type { Candidate, Ctx, Objection, Plugin } from './types.ts'

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
    help: `only these kinds of git candidate: ${KINDS.filter((k) => k !== 'remote').join(', ')}`,
  },
  plugin: {
    kind: 'list',
    valueName: 'names',
    help: 'run only these plugins',
  },
  adapter: {
    kind: 'list',
    valueName: 'names',
    help: 'alias of --plugin',
  },
  skipPlugin: {
    kind: 'list',
    valueName: 'names',
    help: 'never run these plugins',
  },
  config: {
    kind: 'string',
    valueName: 'file',
    help: 'read this config file instead of the one in the config directory',
  },
} as const

const idList = <V extends string>(valueName: V, help: string) =>
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
      'Say what on this machine can go: every plugin’s candidates, and what each objection ' +
      'would stop. Deletes nothing.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      all: { kind: 'boolean', help: 'also show candidates a plugin refuses (with --format text)' },
      auto: {
        kind: 'boolean',
        help:
          'clean the unattended subset with no --allow: candidates their owner marked unattended ' +
          'that nothing refuses or protests (idle artifacts, clean worktrees). Writes a report and a receipt to the state directory',
      },
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
  ${NAME} plan          save the candidates and their evidence, to run later
  ${NAME} clean         check again, show the steps, ask, delete
  ${NAME} --auto        clean what is safe with no person present
  ${NAME} schedule      install, uninstall or show the launchd agent that runs --auto`,
  })

const scheduleCli = () =>
  defineCli({
    name: `${NAME} schedule`,
    summary:
      'Install a launchd user agent that runs `host-cleaner --auto` on a timer, remove it, or say whether it is there. macOS only.',
    autoHelp: false,
    positionals: [{ name: 'action', required: true, help: 'install, uninstall or status' }],
    flags: {
      every: {
        kind: 'string',
        valueName: 'hours',
        help: 'install: run every this many hours (default 6)',
      },
      ...HELP_FLAGS,
    },
  })

const planCli = () =>
  defineCli({
    name: `${NAME} plan`,
    summary:
      'Sweep, and save every candidate with the evidence behind it and every objection, ' +
      'so `clean --plan` can run it later and drop what moved since.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      pick: idList('id', 'work on exactly these candidates; repeatable'),
      allow: idList('code', 'accept a protest by its code; repeatable'),
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
      'Delete what the sweep (or a saved plan) found: check each candidate again, show the steps, ' +
      'ask, then delete. Without --pick, every candidate nothing objects to runs.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      pick: idList('id', 'work on exactly these candidates; repeatable'),
      allow: idList('code', 'accept a protest by its code; repeatable'),
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
    shortEpilogue: `ids: worktree:<path>, branch:<repo>:<name>, or another plugin's <kind>:<path>
A candidate with a protest you did not --allow is skipped, never deleted.`,
  })

export type Confirm = (question: string) => boolean | null

const terminalConfirm: Confirm = (question) => (canPrompt() ? askYesNo(question) : null)

export interface MainDeps {
  /** The plugins that exist; default is the shipped ones, built from the config. */
  plugins?: readonly Plugin[]
  confirm?: Confirm
  /** Reads `--plan -`. Defaults to stdin. */
  readStdin?: () => string
  /** `schedule`: the command the agent runs. Default: this node and this script. */
  program?: readonly string[]
  /** `schedule`: the platform, the uid launchd domain and the runner for `launchctl`. */
  platform?: string
  uid?: number
  launchctl?: CommandRunner
  now?: () => Date
}

const PAUSE = new Int32Array(new SharedArrayBuffer(4))

function readAllStdin(): string {
  const chunks: Buffer[] = []
  const buf = Buffer.alloc(65536)
  for (;;) {
    let n: number
    try {
      n = readSync(0, buf, 0, buf.length, null)
    } catch (e) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'EOF') return Buffer.concat(chunks).toString('utf8')
      if (code !== 'EAGAIN') throw e
      Atomics.wait(PAUSE, 0, 0, 50)
      continue
    }
    if (n === 0) return Buffer.concat(chunks).toString('utf8')
    chunks.push(Buffer.from(buf.subarray(0, n)))
  }
}

const usageError = (ctx: CliContext, name: string, message: string): number => {
  ctx.io.stderr(renderError(message, name))
  return EXIT.usage
}

/** A refusal as its exit code: 2 for what was typed, 1 for the state found. */
function refusal(ctx: CliContext, name: string, err: unknown): number {
  if (
    err instanceof ConfigError ||
    err instanceof UnknownPlugin ||
    err instanceof BadInput ||
    err instanceof ScheduleError
  ) {
    return usageError(ctx, name, err.message)
  }
  ctx.io.stderr(renderError(err instanceof Error ? err.message : String(err), name))
  return EXIT.error
}

/** What was typed cannot be run. */
class BadInput extends Error {
  override name = 'BadInput'
}

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

const loadConfig = (v: { config?: string | undefined }, ctx: CliContext): Config =>
  v.config === undefined
    ? readConfig(configFile(hostDirs(ctx.env)))
    : readConfig(resolve(ctx.cwd, v.config), { required: true })

/** `--plugin` and its alias `--adapter`, as one list; undefined when neither is given. */
const wanted = (v: SweepValues): string[] | undefined =>
  v.plugin === undefined && v.adapter === undefined
    ? undefined
    : [...(v.plugin ?? []), ...(v.adapter ?? [])]

/** The plugins this run uses: the shipped ones built from the config, or `deps.plugins`, then chosen by flag. */
function pluginsFor(v: SweepValues, config: Config, deps: MainDeps): Plugin[] {
  const named = v.only?.filter((s) => s !== '')
  const only = named === undefined || named.length === 0 ? undefined : (named as Kind[])
  const bad = named?.filter((k) => !(KINDS as readonly string[]).includes(k))
  if (bad !== undefined && bad.length > 0) {
    throw new BadInput(`--only names no kind ${bad.join(', ')}; have ${KINDS.join(', ')}`)
  }
  if (only?.includes('remote')) {
    throw new BadInput('remote branches are repo-cleaner’s: use `repo-cleaner --remote`')
  }
  const all =
    deps.plugins ??
    Object.entries(FACTORIES).map(([name, make]) =>
      make({ settings: config.plugins[name] ?? {}, only: only ?? ['worktree', 'branch'] }),
    )
  const unused = Object.keys(config.plugins).filter((n) => !all.some((p) => p.name === n))
  if (unused.length > 0) throw new BadInput(`config names no plugin ${unused.join(', ')}`)
  return orderPlugins(selectPlugins(all, wanted(v), v.skipPlugin))
}

function contextFor(
  targets: readonly string[],
  config: Config,
  ctx: CliContext,
  allow: readonly string[],
): Ctx {
  return {
    cwd: ctx.cwd,
    targets: targets.length > 0 ? targets : config.targets.length > 0 ? config.targets : [ctx.cwd],
    allow,
  }
}

/** The lines as one control-stripped block, or nothing for no lines. */
const block = (lines: readonly string[]): string =>
  lines.length === 0 ? '' : stripControls(lines.join('\n'), { newline: true }) + '\n'

const nothingFound = (s: { candidates: readonly Candidate[] }): boolean => s.candidates.length === 0

function writeWarnings(ctx: CliContext, name: string, warnings: readonly string[]): void {
  for (const w of warnings) ctx.io.stderr(renderError(w, name))
}

/** What a candidate would do with no pick and nothing allowed. */
function standing(c: Candidate, os: readonly Objection[]): 'delete' | 'review' | 'refused' {
  const mine = os.filter((o) => o.candidate === c.id)
  if (mine.some((o) => o.level === 'refuse')) return 'refused'
  if (mine.some((o) => o.level === 'protest') || c.unattended === false) return 'review'
  return 'delete'
}

function renderCandidates(
  cs: readonly Candidate[],
  os: readonly Objection[],
  all: boolean,
): string {
  const lines: string[] = []
  for (const c of cs) {
    const how = standing(c, os)
    if (how === 'refused' && !all) continue
    lines.push(`  ${how.padEnd(7)} ${c.id}`, `          ${c.why}`)
    for (const o of os.filter((x) => x.candidate === c.id)) {
      lines.push(`          ${o.level} ${o.code} (${o.by}): ${o.reason}`)
    }
  }
  return block(lines)
}

function runReport(argv: readonly string[], ctx: CliContext, deps: MainDeps): number {
  const parsed = parseWith(reportCli(), NAME, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  if (v.auto) {
    if (v.all) return usageError(ctx, NAME, '--auto cleans a fixed subset; --all does not apply')
    return runAuto(v, parsed.positionals, ctx, deps)
  }
  let s: ReturnType<typeof survey>
  try {
    const config = loadConfig(v, ctx)
    s = survey(pluginsFor(v, config, deps), contextFor(parsed.positionals, config, ctx, []))
  } catch (err) {
    return refusal(ctx, NAME, err)
  }
  if (v.format === 'json') {
    ctx.io.stdout(
      `${JSON.stringify({ plugins: s.plugins.map((p) => p.name), warnings: s.warnings, candidates: s.candidates, objections: s.objections }, null, 2)}\n`,
    )
  } else {
    writeWarnings(ctx, NAME, s.warnings)
    ctx.io.stdout(
      `plugins: ${s.plugins.map((p) => p.name).join(', ') || '(none)'}\n` +
        renderCandidates(s.candidates, s.objections, v.all),
    )
  }
  return nothingFound(s) ? EXIT_NOTHING_TO_SWEEP : EXIT.ok
}

function runPlan(argv: readonly string[], ctx: CliContext, deps: MainDeps): number {
  const name = `${NAME} plan`
  const parsed = parseWith(planCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  let plan: Plan
  try {
    const config = loadConfig(v, ctx)
    const s = survey(
      pluginsFor(v, config, deps),
      contextFor(parsed.positionals, config, ctx, v.allow),
    )
    writeWarnings(ctx, name, s.warnings)
    if (nothingFound(s)) return EXIT_NOTHING_TO_SWEEP
    plan = makePlan(s, { pick: v.pick.length > 0 ? v.pick : undefined, allow: v.allow })
  } catch (err) {
    return refusal(ctx, name, err)
  }
  if (v.out === '-') {
    ctx.io.stdout(`${JSON.stringify(plan, null, 2)}\n`)
  } else {
    const path = resolve(ctx.cwd, v.out)
    writePlan(path, plan)
    ctx.io.stderr(`plan: ${path}\n`)
  }
  return EXIT.ok
}

type CleanValues = ValuesOf<ReturnType<typeof cleanCli>>

/** The options that contradict each other, as a usage message, or null. */
function cleanConflict(v: CleanValues, targets: readonly string[]): string | null {
  if (v.plan !== undefined) {
    const fixed = [
      targets.length > 0 ? 'targets' : null,
      v.only !== undefined ? '--only' : null,
      v.pick.length > 0 ? '--pick' : null,
      v.allow.length > 0 ? '--allow' : null,
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

/** What a clean would do, as text: each candidate to run in order, then each one dropped and why. */
function renderPreview(d: Decision): string {
  const lines: string[] = []
  for (const c of d.run) lines.push(`  delete  ${c.id}`, `          ${c.why}`)
  for (const x of d.dropped) lines.push(`  skip    ${x.id}`, `          ${x.reason}: ${x.detail}`)
  return block(lines) + `would delete: ${d.run.length} item(s)\n`
}

function renderReceipt(r: Receipt, path: string): string {
  const lines: string[] = []
  for (const s of r.steps) {
    lines.push(
      `  ${s.result === 'ok' ? 'done' : s.result.toUpperCase().padEnd(7)} ${s.id}`,
      `          ${s.delete ?? s.error ?? ''}`,
    )
    for (const n of s.notified)
      if (n.error !== null) lines.push(`          ${n.plugin}: ${n.error}`)
  }
  for (const x of r.dropped) lines.push(`  skip    ${x.id}`, `          ${x.reason}: ${x.detail}`)
  return block(lines) + `receipt: ${stripControls(path)} (${r.status})\n`
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
  let plan: Plan
  let source: string
  let plugins: Plugin[]
  let cctx: Ctx
  let preview: Decision
  try {
    const config = loadConfig(v, ctx)
    plugins = pluginsFor(v, config, deps)
    cctx = contextFor(parsed.positionals, config, ctx, v.allow)
    if (v.plan === undefined) {
      const s = survey(plugins, cctx)
      writeWarnings(ctx, name, s.warnings)
      if (nothingFound(s)) return EXIT_NOTHING_TO_SWEEP
      plan = makePlan(s, { pick: v.pick.length > 0 ? v.pick : undefined, allow: v.allow, now })
      source = '(swept)'
    } else if (v.plan === '-') {
      plan = parsePlan((deps.readStdin ?? readAllStdin)(), 'stdin')
      source = '(stdin)'
    } else {
      source = resolve(ctx.cwd, v.plan)
      plan = readPlan(source)
    }
    preview = recheck(plan, plugins, cctx).decision
  } catch (err) {
    return refusal(ctx, name, err)
  }

  const count = preview.run.length
  const json = v.format === 'json'
  if (v.dryRun || count === 0) {
    ctx.io.stdout(
      json
        ? `${JSON.stringify({ dryRun: v.dryRun, run: preview.run.map((c) => c.id), dropped: preview.dropped }, null, 2)}\n`
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
  let receipt: Receipt
  try {
    mkdirSync(dirname(receiptPath), { recursive: true })
    receipt = clean(plan, plugins, cctx, { source, receiptPath })
  } catch (err) {
    return refusal(ctx, name, err)
  }
  logRun(dirs.logs, { at: now.toISOString(), source, receipt: receiptPath, status: receipt.status })
  ctx.io.stdout(
    json
      ? `${JSON.stringify({ receiptPath, receipt }, null, 2)}\n`
      : renderReceipt(receipt, receiptPath),
  )
  return receipt.status === 'failed' ? EXIT_STEP_FAILED : EXIT.ok
}

const LOCK_FILE = 'host-cleaner.lock'

/**
 * `--auto`: survey, pick the unattended subset by id, clean it with nothing
 * allowed, and leave a report and a receipt in the state directory. A second
 * run that finds the lock held exits without work.
 */
function runAuto(
  v: ValuesOf<ReturnType<typeof reportCli>>,
  targets: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
): number {
  const name = `${NAME} --auto`
  const dirs = hostDirs(ctx.env)
  try {
    mkdirSync(dirs.state, { recursive: true })
  } catch (err) {
    return refusal(ctx, name, err)
  }
  const lockPath = join(dirs.state, LOCK_FILE)
  const claim = claimLock(
    lockPath,
    { pid: process.pid, startedAt: new Date().toISOString() },
    { isStale: holderGone<{ pid: number }>((c) => [c.pid]) },
  )
  if (!claim.ok) {
    const pid = claim.holder?.content?.pid
    ctx.io.stderr(
      `${name}: another run holds ${lockPath}${pid === undefined ? '' : ` (pid ${pid})`}; exiting without work\n`,
    )
    return EXIT.ok
  }
  try {
    return autoWork(v, targets, ctx, deps, dirs)
  } finally {
    releaseLock(lockPath, claim.token)
  }
}

function autoWork(
  v: ValuesOf<ReturnType<typeof reportCli>>,
  targets: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
  dirs: ReturnType<typeof hostDirs>,
): number {
  const name = `${NAME} --auto`
  const now = deps.now ?? (() => new Date())
  const startedAt = now()
  let plugins: Plugin[]
  let cctx: Ctx
  let s: ReturnType<typeof survey>
  try {
    const config = loadConfig(v, ctx)
    plugins = pluginsFor(v, config, deps)
    cctx = contextFor(targets, config, ctx, [])
    s = survey(plugins, cctx)
  } catch (err) {
    return refusal(ctx, name, err)
  }
  if (nothingFound(s)) return EXIT_NOTHING_TO_SWEEP
  writeWarnings(ctx, name, s.warnings)

  const ids = selectUnattended(s.candidates, s.objections)
  const sizes = measure(s.candidates, ids)
  const receiptPath = join(dirs.state, 'receipts', `receipt-${stamp(startedAt)}.json`)
  let receipt: Receipt | null = null
  try {
    // An empty selection runs nothing: skip the clean.
    if (ids.length > 0) {
      mkdirSync(dirname(receiptPath), { recursive: true })
      receipt = clean(makePlan(s, { pick: ids, now: startedAt }), plugins, cctx, {
        source: '(auto)',
        receiptPath,
        now,
      })
    }
  } catch (err) {
    return refusal(ctx, name, err)
  }
  const done = receipt === null ? [] : cleanedIds(receipt)
  const cleaned = done.map((id) => ({ id, bytes: sizes.get(id) ?? 0 }))
  const report: AutoReport = {
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    status:
      receipt === null ? 'nothing-to-clean' : receipt.status === 'failed' ? 'failed' : 'complete',
    receipt: receipt === null ? null : receiptPath,
    cleaned,
    failed: receipt === null ? [] : failedIds(receipt),
    left: leftForReview(s.candidates, s.objections, new Set(done)),
    bytesFreed: cleaned.reduce((sum, c) => sum + c.bytes, 0),
  }
  let reportFailed = false
  const reportPath = join(dirs.state, 'reports', `report-${stamp(startedAt)}.json`)
  try {
    mkdirSync(dirname(reportPath), { recursive: true })
    writeJsonAtomic(reportPath, report)
  } catch (err) {
    reportFailed = true
    ctx.io.stderr(renderError(`cannot write the report: ${(err as Error).message}`, name))
  }
  logRun(dirs.logs, {
    at: report.startedAt,
    source: '(auto)',
    receipt: report.receipt,
    status: report.status,
  })
  ctx.io.stdout(
    v.format === 'json'
      ? `${JSON.stringify({ reportPath, report }, null, 2)}\n`
      : renderAutoReport(report) + `report: ${stripControls(reportPath)}\n`,
  )
  if (report.status === 'failed') return EXIT_STEP_FAILED
  return reportFailed ? EXIT.error : EXIT.ok
}

function runSchedule(argv: readonly string[], ctx: CliContext, deps: MainDeps): number {
  const name = `${NAME} schedule`
  const parsed = parseWith(scheduleCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const action = parsed.positionals[0]
  if (parsed.positionals.length !== 1 || !['install', 'uninstall', 'status'].includes(action ?? ''))
    return usageError(ctx, name, 'say one of: install, uninstall, status')
  if (action !== 'install' && parsed.values.every !== undefined)
    return usageError(ctx, name, '--every applies to install only')
  const env: ScheduleEnv = {
    platform: deps.platform ?? process.platform,
    home: ctx.env.HOME ?? homedir(),
    uid: deps.uid ?? process.getuid?.() ?? 0,
    launchctl: deps.launchctl ?? spawnRunner('launchctl'),
    program: deps.program ?? [],
    logFile: join(hostDirs(ctx.env).logs, `${NAME}-schedule.log`),
    path: ctx.env.PATH,
    vars: Object.fromEntries(
      Object.entries(ctx.env).filter(
        (e): e is [string, string] => e[0].startsWith('HOST_CLEANER_') && e[1] !== undefined,
      ),
    ),
  }
  try {
    if (action === 'install') {
      const hours = parseEvery(parsed.values.every)
      const program = deps.program ?? [
        process.execPath,
        realpathSync(process.argv[1] ?? ''),
        '--auto',
      ]
      const file = installSchedule({ ...env, program }, hours)
      ctx.io.stdout(
        `installed ${stripControls(file)}: runs \`${NAME} --auto\` every ${hours} hour${hours === 1 ? '' : 's'}\n`,
      )
    } else if (action === 'uninstall') {
      ctx.io.stdout(uninstallSchedule(env) ? 'uninstalled\n' : 'not installed\n')
    } else {
      const st = scheduleStatus(env)
      ctx.io.stdout(
        `plist: ${stripControls(st.plist)} (${st.installed ? 'present' : 'absent'})\nlaunchd: ${st.loaded ? 'loaded' : 'not loaded'}\n`,
      )
    }
  } catch (err) {
    return refusal(ctx, name, err)
  }
  return EXIT.ok
}

/** `main(argv, ctx)`: returns an exit code, never exits. */
export function main(argv: readonly string[], ctx: CliContext, deps: MainDeps = {}): number {
  const [sub, ...rest] = argv
  if (sub === 'plan') return runPlan(rest, ctx, deps)
  if (sub === 'clean') return runClean(rest, ctx, deps)
  if (sub === 'schedule') return runSchedule(rest, ctx, deps)
  return runReport(argv, ctx, deps)
}
