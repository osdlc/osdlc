/**
 * `host-cleaner`: status, plan, clean, in repo-cleaner's phases and words.
 * Nothing runs until a phase is named; the bare command explains them and
 * exits 2. Exit codes are in README.md, directories in `config.ts`.
 */

import { appendFileSync, mkdirSync, readSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import {
  EXIT,
  askChecklist,
  askYesNo,
  canPrompt,
  defineCli,
  renderError,
  type ChecklistItem,
  type Cli,
  type CliContext,
  type FlagSpec,
  type FlagValues,
} from '@osdlc/cli-tool'
import type { Kind } from '@osdlc/repo-cleaner'
import { stripControls } from '@osdlc/ux'

import { expandHome, ignorePaths } from './ignore.ts'
import { ConfigError, configFile, hostDirs, readConfig, type Config } from './config.ts'
import { parsePlan, readPlan, writePlan, type Plan, type Receipt } from './plan.ts'
import { FACTORIES, UnknownPlugin, selectPlugins } from './registry.ts'
import { disabledByConfig, effectiveSettings, settingsOf } from './settings.ts'
import {
  SelectionError,
  StalePlan,
  clean,
  decidePlan,
  orderPlugins,
  plan as makePlan,
  recheck,
  survey,
  type Decision,
} from './run.ts'
import type { Candidate, Ctx, Objection, Plugin } from './types.ts'

const NAME = 'host-cleaner'
const EXIT_NOTHING_TO_SWEEP = 10
const EXIT_STEP_FAILED = 11

const HELP_FLAGS = {
  help: { kind: 'boolean', short: 'h', help: 'show this message' },
} as const

const SWEEP_FLAGS = {
  worktrees: { kind: 'boolean', help: 'only worktrees, of the git candidates' },
  branches: { kind: 'boolean', help: 'only local branches, of the git candidates' },
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
  ignore: {
    kind: 'list',
    valueName: 'dir',
    default: [] as readonly string[],
    commaSeparated: false,
    help: 'never delete in or below this directory, as the config file’s ignore; repeatable',
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

const PHASES = `phases:
  ${NAME} status   look: every plugin's candidates, and what each objection would stop
  ${NAME} plan     save what status found, to clean later or hand over
  ${NAME} clean    check again, show the steps, ask, delete

  ${NAME} config   print the effective settings of every plugin`

/** What the bare command prints: the phases, and that nothing ran. */
const OVERVIEW = `${NAME} finds what on this machine can go (worktrees and branches whose
work has landed, and whatever else its plugins know) and deletes it safely.

It works in phases, as repo-cleaner does. Nothing is deleted until clean.

  1. status   Look: each candidate, and what each objection would stop.
                $ ${NAME} status
  2. plan     Optional: save what status found, to run later or hand on.
                $ ${NAME} plan -o plan.json
  3. clean    Delete what is safe: checks each candidate again, shows the steps, asks.
                $ ${NAME} clean             asks first
                $ ${NAME} clean -i          choose from a checklist
                $ ${NAME} clean --plan plan.json

\`${NAME} config\` prints each plugin's settings and where each value came from.

Nothing ran. Name a phase; \`${NAME} <phase> --help\` shows its options.
`

const statusCli = () =>
  defineCli({
    name: `${NAME} status`,
    summary:
      'Say what on this machine can go: every plugin’s candidates, and what each objection ' +
      'would stop. Deletes nothing.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      allRows: {
        kind: 'boolean',
        help: 'also show candidates a plugin refuses (with --format text)',
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
    shortEpilogue: PHASES,
  })

const configCli = () =>
  defineCli({
    name: `${NAME} config`,
    summary:
      'Print the effective settings of every plugin: each value, its default and whether the config file set it. Deletes nothing.',
    autoHelp: false,
    flags: {
      config: SWEEP_FLAGS.config,
      format: {
        kind: 'enum',
        choices: ['text', 'json'] as const,
        valueName: 'form',
        default: 'text',
        help: 'text (the report) or json (the values)',
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
      pick: idList(
        'id',
        'also run this candidate; one its plugin holds for review runs only when picked; repeatable',
      ),
      spare: idList(
        'id|name|glob',
        'leave these candidates alone: an id, a path, a branch name (its worktree too) or a glob; repeatable',
      ),
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
      'ask, then delete. By default every candidate nothing objects to and no plugin holds for review runs; ' +
      '--pick adds to it, --spare takes from it.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      ...SWEEP_FLAGS,
      pick: idList(
        'id',
        'also run this candidate; one its plugin holds for review runs only when picked; repeatable',
      ),
      spare: idList(
        'id|name|glob',
        'leave these candidates alone: an id, a path, a branch name (its worktree too) or a glob; repeatable',
      ),
      allow: idList('code', 'accept a protest by its code; repeatable'),
      plan: {
        kind: 'string',
        valueName: 'file',
        help: 'run this plan (- reads stdin) instead of sweeping',
      },
      interactive: {
        kind: 'boolean',
        short: 'i',
        help: 'choose the candidates from a checklist; needs a terminal',
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

/**
 * Shows a checklist and returns the ticked indexes, or null when there is no
 * one to ask. `main` takes it as a parameter so a test can answer.
 */
export type Checklist = (question: string, items: readonly ChecklistItem[]) => number[] | null

const terminalChecklist: Checklist = (question, items) =>
  canPrompt() ? askChecklist(question, items) : null

export interface MainDeps {
  /** The plugins that exist; default is the shipped ones, built from the config. */
  plugins?: readonly Plugin[]
  confirm?: Confirm
  /** Answers `clean -i`. Defaults to a checklist on the terminal. */
  checklist?: Checklist
  /** Reads `--plan -`. Defaults to stdin. */
  readStdin?: () => string
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
    err instanceof SelectionError ||
    err instanceof StalePlan
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

/** Every plugin name this run could use, before config and flags narrow it: `deps.plugins`, else the registry. */
const registered = (deps: MainDeps): string[] =>
  deps.plugins?.map((p) => p.name) ?? Object.keys(FACTORIES)

/**
 * The config, and a warning for each name in its `plugins` that no registered plugin has.
 * With `refuse`, such a name is an error instead: `clean` deletes nothing on a config it
 * cannot apply in full, since a misspelt name would leave that plugin on its defaults.
 */
function checkedConfig(
  v: { config?: string | undefined },
  ctx: CliContext,
  deps: MainDeps,
  refuse = false,
): { config: Config; warnings: string[] } {
  const config = loadConfig(v, ctx)
  const known = new Set(registered(deps))
  const unused = Object.keys(config.plugins).filter((n) => !known.has(n))
  if (refuse && unused.length > 0) {
    throw new BadInput(`config names no plugin ${unused.join(', ')}; nothing was deleted`)
  }
  const warnings = unused.map(
    (n) => `config plugins.${n}: no plugin has this name, so it is ignored`,
  )
  return { config, warnings }
}

/** The plugins this run uses: the shipped ones built from the config, or `deps.plugins`, then chosen by flag. */
function pluginsFor(v: SweepValues, config: Config, deps: MainDeps, ctx: CliContext): Plugin[] {
  // As repo-cleaner's --worktrees and --branches; remote branches are repo-cleaner's alone.
  const only: Kind[] =
    v.worktrees === v.branches ? ['worktree', 'branch'] : v.worktrees ? ['worktree'] : ['branch']
  const all =
    deps.plugins ??
    Object.entries(FACTORIES).map(([name, make]) =>
      make({ settings: settingsOf(name, config.plugins[name] ?? {}, config), only, env: ctx.env }),
    )
  // `enabled: false` leaves a plugin out; naming it with --plugin runs it anyway.
  const named = wanted(v) ?? []
  const chosen = selectPlugins(all, wanted(v), v.skipPlugin)
  return orderPlugins(
    chosen.filter((p) => named.includes(p.name) || !disabledByConfig(p.name, config.plugins)),
  )
}

function contextFor(
  targets: readonly string[],
  config: Config,
  ctx: CliContext,
  allow: readonly string[],
  ignore: readonly string[],
): Ctx {
  const chosen =
    targets.length > 0 ? targets : config.targets.length > 0 ? config.targets : [ctx.cwd]
  const home = ctx.env.HOME ?? homedir()
  return {
    cwd: ctx.cwd,
    targets: chosen.map((t) => resolve(ctx.cwd, expandHome(t, home))),
    allow,
    ignore: ignoreFor(config, ignore, ctx),
  }
}

/** The config's ignore list with `extra` (`--ignore`) added, as absolute paths. */
const ignoreFor = (config: Config, extra: readonly string[], ctx: CliContext): string[] =>
  ignorePaths([...config.ignore, ...extra], ctx.cwd, ctx.env.HOME ?? homedir())

/** The lines as one control-stripped block, or nothing for no lines. */
const block = (lines: readonly string[]): string =>
  lines.length === 0 ? '' : stripControls(lines.join('\n'), { newline: true }) + '\n'

const nothingFound = (s: { candidates: readonly Candidate[] }): boolean => s.candidates.length === 0

function writeWarnings(ctx: CliContext, name: string, warnings: readonly string[]): void {
  for (const w of warnings) ctx.io.stderr(renderError(w, name))
}

/** What a candidate would do by default, with nothing allowed. */
function standing(c: Candidate, os: readonly Objection[]): 'delete' | 'review' | 'refused' {
  const mine = os.filter((o) => o.candidate === c.id)
  if (mine.some((o) => o.level === 'refuse')) return 'refused'
  if (mine.some((o) => o.level === 'protest') || c.held === true) return 'review'
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

function runStatus(argv: readonly string[], ctx: CliContext, deps: MainDeps): number {
  const name = `${NAME} status`
  const parsed = parseWith(statusCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  let s: ReturnType<typeof survey>
  try {
    const { config, warnings } = checkedConfig(v, ctx, deps)
    s = survey(
      pluginsFor(v, config, deps, ctx),
      contextFor(parsed.positionals, config, ctx, [], v.ignore),
    )
    s = { ...s, warnings: [...warnings, ...s.warnings] }
  } catch (err) {
    return refusal(ctx, name, err)
  }
  const ignored = s.ctx.ignore ?? []
  if (v.format === 'json') {
    ctx.io.stdout(
      `${JSON.stringify({ plugins: s.plugins.map((p) => p.name), ignore: ignored, warnings: s.warnings, candidates: s.candidates, objections: s.objections }, null, 2)}\n`,
    )
  } else {
    writeWarnings(ctx, name, s.warnings)
    ctx.io.stdout(
      `plugins: ${s.plugins.map((p) => p.name).join(', ') || '(none)'}\n` +
        (ignored.length > 0 ? `ignoring: ${ignored.join(', ')}\n` : '') +
        renderCandidates(s.candidates, s.objections, v.allRows),
    )
  }
  return nothingFound(s) ? EXIT_NOTHING_TO_SWEEP : EXIT.ok
}

function runConfig(argv: readonly string[], ctx: CliContext, deps: MainDeps): number {
  const name = `${NAME} config`
  const parsed = parseWith(configCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  try {
    const { config, warnings } = checkedConfig(v, ctx, deps)
    writeWarnings(ctx, name, warnings)
    // Only the plugins a run would build: a section for one it lacks would contradict the warning.
    const known = new Set(registered(deps))
    const settings = Object.fromEntries(
      Object.entries(effectiveSettings(config.plugins, config)).filter(([n]) => known.has(n)),
    )
    if (v.format === 'json') {
      const values = Object.fromEntries(
        Object.entries(settings).map(([n, rows]) => [
          n,
          Object.fromEntries(rows.map((r) => [r.key, r.value])),
        ]),
      )
      ctx.io.stdout(
        JSON.stringify(
          {
            targets: config.targets,
            ignore: config.ignore,
            idleHours: config.idleHours ?? null,
            plugins: values,
          },
          null,
          2,
        ) + '\n',
      )
      return EXIT.ok
    }
    const list = (xs: readonly string[]): string => (xs.length > 0 ? xs.join(', ') : '(none)')
    const lines = [
      `targets: ${list(config.targets)}`,
      `ignore: ${list(config.ignore)}`,
      `idleHours: ${config.idleHours ?? '(not set)'}`,
    ]
    for (const [n, rows] of Object.entries(settings)) {
      lines.push('', `plugins.${n}`)
      for (const r of rows) {
        lines.push(
          `  ${r.key} = ${JSON.stringify(r.value)}  (${r.source === 'shared' ? 'idleHours' : r.source})  ${r.description}`,
        )
      }
    }
    ctx.io.stdout(block(lines))
  } catch (err) {
    return refusal(ctx, name, err)
  }
  return EXIT.ok
}

function runPlan(argv: readonly string[], ctx: CliContext, deps: MainDeps): number {
  const name = `${NAME} plan`
  const parsed = parseWith(planCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  let plan: Plan
  try {
    const { config, warnings } = checkedConfig(v, ctx, deps)
    const cctx = contextFor(parsed.positionals, config, ctx, v.allow, v.ignore)
    const surveyed = survey(pluginsFor(v, config, deps, ctx), cctx)
    const s = { ...surveyed, warnings: [...warnings, ...surveyed.warnings] }
    writeWarnings(ctx, name, s.warnings)
    if (nothingFound(s)) return EXIT_NOTHING_TO_SWEEP
    plan = makePlan(s, {
      targets: cctx.targets,
      ignore: cctx.ignore,
      pick: v.pick,
      spare: v.spare,
      allow: v.allow,
    })
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
      v.worktrees === true ? '--worktrees' : null,
      v.branches === true ? '--branches' : null,
      v.pick.length > 0 ? '--pick' : null,
      v.spare.length > 0 ? '--spare' : null,
      v.allow.length > 0 ? '--allow' : null,
    ].filter((f) => f !== null)
    if (fixed.length > 0) return `--plan already fixed what is swept; drop ${fixed.join(', ')}`
  }
  if (v.interactive && v.pick.length > 0) {
    return '-i chooses the candidates from a checklist; drop --pick, or drop -i'
  }
  if (v.interactive && v.plan === '-') {
    return '-i asks on the terminal, and --plan - reads the plan from stdin; save the plan to a file'
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

const NO_TERMINAL_FOR_I =
  '-i needs a terminal to show the checklist; name the candidates with --pick and --spare instead'

/**
 * `-i`: the plan's candidates as a checklist, those the preview would run
 * ticked, refused ones shown but not selectable, spared ones left out; then
 * each ticked candidate's protests not yet allowed, asked for by code. The
 * answer is the plan selecting exactly the ticked candidates, or null when
 * there is no one to ask.
 */
function chooseCandidates(plan: Plan, preview: Decision, deps: MainDeps): Plan | null {
  const spared = new Set(preview.dropped.filter((d) => d.reason === 'spared').map((d) => d.id))
  const shown = plan.candidates.filter((c) => !spared.has(c.id))
  if (shown.length === 0) return plan
  const runs = new Set(preview.run.map((c) => c.id))
  const items: ChecklistItem[] = shown.map((c) => {
    const how = standing(c, plan.objections)
    return {
      label: `${c.id}  ${how}: ${c.why}`,
      checked: runs.has(c.id),
      ...(how === 'refused' ? { disabled: how } : {}),
    }
  })
  const ticked = (deps.checklist ?? terminalChecklist)('Clean which candidates?', items)
  if (ticked === null) return null
  const allow = [...plan.allow]
  const ask = deps.confirm ?? terminalConfirm
  for (const i of ticked) {
    const c = shown[i]!
    for (const o of plan.objections) {
      if (o.candidate !== c.id || o.level !== 'protest' || allow.includes(o.code)) continue
      if (ask(`${c.id} carries ${o.code} (${o.reason}): allow it?`) === true) allow.push(o.code)
    }
  }
  return { ...plan, select: ticked.map((i) => shown[i]!.id), pick: [], allow }
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
  if (v.interactive && deps.checklist === undefined && !canPrompt()) {
    return usageError(ctx, name, NO_TERMINAL_FOR_I)
  }

  const now = new Date()
  const dirs = hostDirs(ctx.env)
  let plan: Plan
  let source: string
  let plugins: Plugin[]
  let cctx: Ctx
  let preview: Decision
  try {
    const { config } = checkedConfig(v, ctx, deps, true)
    plugins = pluginsFor(v, config, deps, ctx)
    if (v.plan === undefined) {
      cctx = contextFor(parsed.positionals, config, ctx, v.allow, v.ignore)
      const s = survey(plugins, cctx)
      writeWarnings(ctx, name, s.warnings)
      if (nothingFound(s)) return EXIT_NOTHING_TO_SWEEP
      plan = makePlan(s, {
        targets: cctx.targets,
        ignore: cctx.ignore,
        pick: v.pick,
        spare: v.spare,
        allow: v.allow,
        now,
      })
      source = '(swept)'
      // Swept a moment ago: `clean` checks again before it deletes.
      preview = decidePlan(plan)
    } else {
      if (v.plan === '-') {
        plan = parsePlan((deps.readStdin ?? readAllStdin)(), 'stdin')
        source = '(stdin)'
      } else {
        source = resolve(ctx.cwd, v.plan)
        plan = readPlan(source)
      }
      cctx = {
        cwd: ctx.cwd,
        targets: plan.targets,
        allow: plan.allow,
        ignore: ignoreFor(config, v.ignore, ctx),
      }
      const checked = recheck(plan, plugins, cctx, registered(deps))
      writeWarnings(ctx, name, checked.survey.warnings)
      preview = checked.decision
    }
  } catch (err) {
    return refusal(ctx, name, err)
  }

  if (v.interactive) {
    const chosen = chooseCandidates(plan, preview, deps)
    if (chosen === null) return usageError(ctx, name, NO_TERMINAL_FOR_I)
    plan = chosen
    preview = decidePlan(plan)
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
    // Only what the person saw as `delete`: a block that clears while they decide must not add to it.
    const approved = { ...plan, pick: preview.run.map((c) => c.id) }
    receipt = clean(approved, plugins, cctx, { source, receiptPath })
  } catch (err) {
    logRun(dirs.logs, { at: now.toISOString(), source, receipt: receiptPath, status: 'failed' })
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

/** Returns an exit code; never exits the process. */
export function main(argv: readonly string[], ctx: CliContext, deps: MainDeps = {}): number {
  const [sub, ...rest] = argv
  if (sub === 'status') return runStatus(rest, ctx, deps)
  if (sub === 'plan') return runPlan(rest, ctx, deps)
  if (sub === 'clean') return runClean(rest, ctx, deps)
  if (sub === 'config') return runConfig(rest, ctx, deps)
  if (sub === '-h' || sub === '--help') {
    ctx.io.stdout(OVERVIEW)
    return EXIT.ok
  }
  // Nothing runs until a phase is named: the bare command explains them.
  if (sub === undefined) {
    ctx.io.stderr(OVERVIEW)
    return EXIT.usage
  }
  return usageError(
    ctx,
    NAME,
    `${JSON.stringify(sub)} is not a phase: name one of status, plan, clean or config, then the targets`,
  )
}
