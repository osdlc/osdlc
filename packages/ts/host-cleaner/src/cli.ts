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
import {
  ConfigError,
  configFile,
  descriptorsDir,
  hostDirs,
  readConfig,
  type Config,
} from './config.ts'
import { descriptorDetection } from './descriptor/engine.ts'
import {
  DescriptorLoadError,
  type DescriptorSource,
  type DescriptorSources,
} from './descriptor/load.ts'
import { DescriptorError } from './descriptor/schema.ts'
import type { VarValue, Vars } from './descriptor/vars.ts'
import { pluginKit } from './kit.ts'
import { parsePlan, readPlan, writePlan, type Plan, type Receipt } from './plan.ts'
import {
  UnknownPlugin,
  loadPlugins,
  runsAmong,
  selectPlugins,
  type Loaded,
} from './registry.ts'
import { disabledByConfig, effectiveSettings, settingsOf } from './settings.ts'
import {
  SelectionError,
  clean,
  decidePlan,
  firstOfEachName,
  inspect,
  plan as makePlan,
  recheck,
  survey,
  type Decision,
  type Survey,
} from './run.ts'
import {
  COST_DESCRIPTIONS,
  type Candidate,
  type Objection,
  type Plugin,
  type PluginDefinition,
  type RunCtx,
} from './types.ts'

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
  descriptor: {
    kind: 'list',
    valueName: 'file',
    default: [] as readonly string[],
    commaSeparated: false,
    help: 'also load this descriptor, in place of one of the same name, for this run; repeatable',
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

  ${NAME} config   print the effective settings of every plugin
  ${NAME} plugins  list every plugin: where it came from, detected or why not, its roots`

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
\`${NAME} plugins\` lists each plugin, whether it applies here and why not, and its roots.

Nothing ran. Name a phase; \`${NAME} <phase> --help\` shows its options.
`

/** `--format` of `status` and `plugins`. */
const REPORT_FORMAT = {
  kind: 'enum',
  choices: ['text', 'json'] as const,
  valueName: 'form',
  default: 'text',
  help: 'text (the report) or json (everything)',
} as const

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
      format: REPORT_FORMAT,
      ...HELP_FLAGS,
    },
    shortEpilogue: `${PHASES}

To try a descriptor you are writing: ${NAME} status --descriptor <file> --plugin <name>`,
  })

const configCli = () =>
  defineCli({
    name: `${NAME} config`,
    summary:
      'Print the effective settings of every plugin: each value, its default and whether the config file set it. Deletes nothing.',
    autoHelp: false,
    flags: {
      config: SWEEP_FLAGS.config,
      descriptor: SWEEP_FLAGS.descriptor,
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

const pluginsCli = () =>
  defineCli({
    name: `${NAME} plugins`,
    summary:
      'List every plugin: where it came from, whether it applies here and why not, and the ' +
      'folders it may delete in. Runs detect, scope and roots only; proposes and deletes nothing.',
    autoHelp: false,
    positionals: TARGETS,
    flags: {
      config: SWEEP_FLAGS.config,
      ignore: SWEEP_FLAGS.ignore,
      descriptor: SWEEP_FLAGS.descriptor,
      format: REPORT_FORMAT,
      ...HELP_FLAGS,
    },
    shortEpilogue: `To try one plugin's candidates: ${NAME} status --plugin <name>`,
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
    shortEpilogue: `ids: worktree:<path>, branch:<repo>:<name>, or another plugin's <kind>:<path>;
~ for the home folder, as status shows them.
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
  /** The plugins that exist; default is the built-ins and the descriptors, built from the config. */
  plugins?: readonly Plugin[]
  /** The folder of shipped descriptors. Defaults to the package's `descriptors/`. */
  shippedDescriptors?: string
  confirm?: Confirm
  /** Answers `clean -i`. Defaults to a checklist on the terminal. */
  checklist?: Checklist
  /** Reads `--plan -`. Defaults to stdin. */
  readStdin?: () => string
  /** The user id the command runs as; 0, root, is refused. Defaults to this process's. */
  uid?: number | undefined
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
    err instanceof DescriptorError ||
    err instanceof DescriptorLoadError ||
    err instanceof UnknownPlugin ||
    err instanceof BadInput ||
    err instanceof SelectionError
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

/** The config, its `plugins` entries checked against `plugins`. */
const loadConfig = (
  v: { config?: string | undefined },
  ctx: CliContext,
  plugins: readonly PluginDefinition[],
): Config =>
  v.config === undefined
    ? readConfig(configFile(hostDirs(ctx.env)), { plugins })
    : readConfig(resolve(ctx.cwd, v.config), { required: true, plugins })

/** Where this run's descriptors come from: the shipped folder, the user's, and each `--descriptor`. */
const sourcesFor = (
  v: { descriptor: readonly string[] },
  ctx: CliContext,
  deps: MainDeps,
): DescriptorSources => ({
  shipped: deps.shippedDescriptors,
  user: descriptorsDir(hostDirs(ctx.env)),
  flag: v.descriptor.map((f) => resolve(ctx.cwd, f)),
})

/** The plugin names in `plugins` that `known` refuses. */
const unknownPlugins = (config: Config, known: (name: string) => boolean): string[] =>
  Object.keys(config.plugins).filter((n) => !known(n))

/**
 * The config and the plugins this run uses: the built-ins and the descriptors
 * loaded, the config checked against them, each built from its entry (or
 * `deps.plugins`) into `all`, then chosen by `choose`. A descriptor's
 * `supersededBy` plugin runs when it is among those chosen and detects.
 */
function setUp(
  v: { config?: string | undefined; descriptor: readonly string[] },
  ctx: CliContext,
  deps: MainDeps,
  only: readonly Kind[],
  choose: (all: readonly Plugin[], config: Config) => Plugin[],
): {
  config: Config
  all: readonly Plugin[]
  plugins: Plugin[]
  descriptors: Loaded['descriptors']
} {
  let chosen: readonly Plugin[] = []
  const { definitions, descriptors } = loadPlugins(sourcesFor(v, ctx, deps), {
    runs: runsAmong(() => chosen),
  })
  const config = loadConfig(v, ctx, definitions)
  const all = allPlugins(config, definitions, deps, ctx, only)
  const plugins = choose(all, config)
  chosen = plugins
  return { config, all, plugins, descriptors }
}

/** {@link setUp} with the plugins chosen by flag. */
function setUpSweep(v: SweepValues, ctx: CliContext, deps: MainDeps) {
  // As repo-cleaner's --worktrees and --branches; remote branches are repo-cleaner's alone.
  const only: Kind[] =
    v.worktrees === v.branches ? ['worktree', 'branch'] : v.worktrees ? ['worktree'] : ['branch']
  return setUp(v, ctx, deps, only, (all, config) => chosenByFlag(v, all, config))
}

/** Every plugin, enabled or not: `definitions` built from the config, or `deps.plugins`. */
function allPlugins(
  config: Config,
  definitions: readonly PluginDefinition[],
  deps: MainDeps,
  ctx: CliContext,
  only: readonly Kind[],
): readonly Plugin[] {
  const all =
    deps.plugins ??
    definitions.map((d) =>
      d.create({
        settings: settingsOf(d.name, config.plugins[d.name] ?? {}, config, definitions),
        only,
        env: ctx.env,
        kit: pluginKit(d.name, { env: ctx.env }),
      }),
    )
  const unused = unknownPlugins(config, (n) => all.some((p) => p.name === n))
  if (unused.length > 0) throw new BadInput(`config names no plugin ${unused.join(', ')}`)
  return all
}

/** The plugins among `all` this run uses, chosen by flag. */
function chosenByFlag(v: SweepValues, all: readonly Plugin[], config: Config): Plugin[] {
  // `enabled: false` leaves a plugin out; naming it with --plugin runs it anyway.
  const named = v.plugin ?? []
  const chosen = selectPlugins(all, v.plugin, v.skipPlugin)
  return chosen.filter((p) => named.includes(p.name) || !disabledByConfig(p.name, config.plugins))
}

const homeOf = (ctx: CliContext): string => ctx.env.HOME ?? homedir()

/** `id` with the home folder after its `<kind>:` written `~`, as the text output shows it. */
export function tildeId(id: string, home: string): string {
  const colon = id.indexOf(':')
  const rest = id.slice(colon + 1)
  if (colon < 0 || home === '' || home === '/') return id
  const under = rest === home || rest.startsWith(`${home}/`) || rest.startsWith(`${home}:`)
  return under ? `${id.slice(0, colon + 1)}~${rest.slice(home.length)}` : id
}

/** `entry`, as typed to `--pick` or `--spare`, with a `~` at its start or right after `<kind>:` taken as the home folder. */
export function untildeId(entry: string, home: string): string {
  const colon = entry.indexOf(':')
  const at = entry === '~' || entry.startsWith('~/') ? 0 : colon + 1
  const rest = entry.slice(at)
  const tilde = rest === '~' || rest.startsWith('~/') || rest.startsWith('~:')
  return tilde && (at === 0 || colon > 0) ? `${entry.slice(0, at)}${home}${rest.slice(1)}` : entry
}

function contextFor(
  targets: readonly string[],
  config: Config,
  ctx: CliContext,
  allow: readonly string[],
  ignore: readonly string[],
): RunCtx {
  const chosen =
    targets.length > 0 ? targets : config.targets.length > 0 ? config.targets : [ctx.cwd]
  const home = homeOf(ctx)
  return {
    cwd: ctx.cwd,
    targets: chosen.map((t) => resolve(ctx.cwd, expandHome(t, home))),
    targetsGiven: targets.length > 0 || config.targets.length > 0,
    allow,
    ignore: ignoreFor(config, ignore, ctx),
  }
}

/** The config's ignore list with `extra` (`--ignore`) added, as absolute paths. */
const ignoreFor = (config: Config, extra: readonly string[], ctx: CliContext): string[] =>
  ignorePaths([...config.ignore, ...extra], ctx.cwd, homeOf(ctx))

/** The lines as one control-stripped block, or nothing for no lines. */
const block = (lines: readonly string[]): string =>
  lines.length === 0 ? '' : stripControls(lines.join('\n'), { newline: true }) + '\n'

const nothingFound = (s: { candidates: readonly Candidate[] }): boolean => s.candidates.length === 0

function writeWarnings(ctx: CliContext, name: string, warnings: readonly string[]): void {
  for (const w of warnings) ctx.io.stderr(renderError(w, name))
}

/** The survey's warnings, then each plugin's `detect` note as `<plugin>: <note>`. */
const surveyWarnings = (s: Pick<Survey, 'warnings' | 'notes'>): string[] => [
  ...s.warnings,
  ...Object.entries(s.notes).map(([plugin, note]) => `${plugin}: ${note}`),
]

/** What a candidate would do by default, with nothing allowed. */
function standing(c: Candidate, os: readonly Objection[]): 'delete' | 'review' | 'refused' {
  const mine = os.filter((o) => o.candidate === c.id)
  if (mine.some((o) => o.level === 'refuse')) return 'refused'
  if (mine.some((o) => o.level === 'protest') || c.held === true) return 'review'
  return 'delete'
}

const COST_WIDTH = Math.max(...COST_DESCRIPTIONS.map((c) => c.length))

function renderCandidates(
  cs: readonly Candidate[],
  os: readonly Objection[],
  all: boolean,
  home: string,
): string {
  const lines: string[] = []
  for (const c of cs) {
    const how = standing(c, os)
    if (how === 'refused' && !all) continue
    const cost = (c.costDescription ?? '-').padEnd(COST_WIDTH)
    lines.push(`  ${how.padEnd(7)} ${cost} ${tildeId(c.id, home)}`, `          ${c.why}`)
    for (const o of os.filter((x) => x.candidate === c.id)) {
      lines.push(`          ${o.level} ${o.code} (${o.by}): ${o.reason}`)
    }
  }
  return block(lines)
}

async function runStatus(
  argv: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
): Promise<number> {
  const name = `${NAME} status`
  const parsed = parseWith(statusCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  let s: Survey
  try {
    const { config, plugins } = setUpSweep(v, ctx, deps)
    s = await survey(plugins, contextFor(parsed.positionals, config, ctx, [], v.ignore))
  } catch (err) {
    return refusal(ctx, name, err)
  }
  const ignored = s.ctx.ignore ?? []
  if (v.format === 'json') {
    ctx.io.stdout(
      `${JSON.stringify({ plugins: s.plugins.map((p) => p.name), ignore: ignored, warnings: s.warnings, notes: s.notes, candidates: s.candidates, objections: s.objections }, null, 2)}\n`,
    )
  } else {
    writeWarnings(ctx, name, surveyWarnings(s))
    ctx.io.stdout(
      `plugins: ${s.plugins.map((p) => p.name).join(', ') || '(none)'}\n` +
        (ignored.length > 0 ? `ignoring: ${ignored.join(', ')}\n` : '') +
        renderCandidates(s.candidates, s.objections, v.allRows, homeOf(ctx)),
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
    const { definitions } = loadPlugins(sourcesFor(v, ctx, deps))
    const config = loadConfig(v, ctx, definitions)
    const unused = unknownPlugins(config, (n) => definitions.some((d) => d.name === n))
    if (unused.length > 0) throw new BadInput(`config names no plugin ${unused.join(', ')}`)
    const settings = effectiveSettings(config.plugins, config, definitions)
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

/** One of a descriptor's variables, as `host-cleaner plugins` shows it. */
type VarRow = Omit<VarValue, 'from'> & {
  name: string
  /** The source that gave it, such as `config`, `env GOPATH` or `value`; null when none did. */
  from: string | null
}

/** One row of `host-cleaner plugins`. */
interface PluginRow {
  name: string
  /** `built-in`, or for a descriptor the folder it was read from (`flag` is `--descriptor`). */
  source: 'built-in' | DescriptorSource
  /** See `LoadedDescriptor.replaces` in `./descriptor/load.ts`. */
  replaces?: { source: DescriptorSource; path: string }
  enabled: boolean
  detected: boolean
  /** Why it does not run: disabled in the config, a failed `detect`, or why a descriptor skipped (`system: true`, superseded). Null otherwise. */
  reason: string | null
  /** Where it may delete besides the targets; empty, the targets alone. */
  roots: readonly string[]
  /** The roots among `roots` that may be deleted themselves (`{ path, self: true }`). */
  selfRoots: readonly string[]
  /** The note its `detect` gave, whether it is detected or not; null when it gave none. */
  note: string | null
  /** A descriptor's variables as its `detect` worked them out; empty for a plugin that has none, or when `detect` did not get that far. */
  vars: readonly VarRow[]
}

const varRows = (vars: Vars | undefined): VarRow[] =>
  Object.entries(vars ?? {}).map(([name, x]) => ({ name, ...x, from: x.from ?? null }))

/**
 * `${NAME} = <folder>  from <source> (tried <source>: <why it gave none>; …)`,
 * or `has no value (tried …)` when no source gave one.
 */
function varLine(x: VarRow, width: number): string {
  const tried =
    x.tried.length === 0
      ? ''
      : ` (tried ${x.tried.map((t) => `${t.source}: ${t.failed}`).join('; ')})`
  const said = x.value === null ? `has no value${tried}` : `= ${x.value}  from ${x.from}${tried}`
  return `    ${`\${${x.name}}`.padEnd(width + 3)}  ${said}`
}

function renderPlugins(rows: readonly PluginRow[], targets: readonly string[]): string {
  const width = Math.max(...rows.map((r) => r.name.length))
  const from = Math.max(...rows.map((r) => r.source.length))
  const lines = [`targets: ${targets.join(', ') || '(none)'}`]
  for (const r of rows) {
    const state = !r.enabled
      ? 'disabled'
      : r.detected
        ? `detected; roots: ${r.roots.map((root) => (r.selfRoots.includes(root) ? `${root} (itself too)` : root)).join(', ') || 'none, the targets alone'}`
        : 'not detected'
    const replaces =
      r.replaces === undefined ? '' : `; replaces the ${r.replaces.source} ${r.replaces.path}`
    lines.push(
      `  ${r.name.padEnd(width)}  ${r.source.padEnd(from)}  ${state}${r.reason === null ? '' : `: ${r.reason}`}${r.note === null ? '' : `; note: ${r.note}`}${replaces}`,
    )
    const names = Math.max(...r.vars.map((x) => x.name.length))
    for (const x of r.vars) lines.push(varLine(x, names))
  }
  return block(lines)
}

async function runPlugins(
  argv: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
): Promise<number> {
  const name = `${NAME} plugins`
  const parsed = parseWith(pluginsCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  let rows: PluginRow[]
  let targets: readonly string[]
  let warnings: readonly string[]
  try {
    const {
      config,
      all,
      plugins: enabled,
      descriptors,
    } = setUp(v, ctx, deps, ['worktree', 'branch'], (all, config) =>
      all.filter((p) => !disabledByConfig(p.name, config.plugins)),
    )
    const loaded = new Map(descriptors.map((d) => [d.name, d]))
    const found = await inspect(enabled, contextFor(parsed.positionals, config, ctx, [], v.ignore))
    const state = new Map(found.plugins.map((s) => [s.name, s]))
    // One row per name: `inspect` leaves out a second plugin of a name, with a warning.
    rows = firstOfEachName(all).first.map((p): PluginRow => {
      const off = !enabled.includes(p)
      const s = state.get(p.name)
      const d = loaded.get(p.name)
      const seen = off ? undefined : descriptorDetection(p)
      return {
        name: p.name,
        source: d?.source ?? 'built-in',
        ...(d?.replaces === undefined ? {} : { replaces: d.replaces }),
        enabled: !off,
        detected: s?.detected ?? false,
        reason: off
          ? `plugins.${p.name}.enabled is false; a sweep's --plugin ${p.name} runs it anyway`
          : (s?.reason ?? seen?.skipped ?? null),
        roots: s?.roots ?? [],
        selfRoots: s?.selfRoots ?? [],
        note: s?.note ?? null,
        vars: varRows(seen?.vars),
      }
    })
    targets = found.ctx.targets
    warnings = found.warnings
  } catch (err) {
    return refusal(ctx, name, err)
  }
  if (v.format === 'json') {
    ctx.io.stdout(`${JSON.stringify({ targets, warnings, plugins: rows }, null, 2)}\n`)
  } else {
    writeWarnings(ctx, name, warnings)
    ctx.io.stdout(renderPlugins(rows, targets))
  }
  return EXIT.ok
}

async function runPlan(argv: readonly string[], ctx: CliContext, deps: MainDeps): Promise<number> {
  const name = `${NAME} plan`
  const parsed = parseWith(planCli(), name, argv, ctx)
  if (parsed.status === 'done') return parsed.code
  const v = parsed.values
  let plan: Plan
  try {
    const { config, plugins } = setUpSweep(v, ctx, deps)
    const cctx = contextFor(parsed.positionals, config, ctx, v.allow, v.ignore)
    const s = await survey(plugins, cctx)
    writeWarnings(ctx, name, surveyWarnings(s))
    if (nothingFound(s)) return EXIT_NOTHING_TO_SWEEP
    plan = makePlan(s, {
      targets: cctx.targets,
      targetsGiven: cctx.targetsGiven,
      ignore: cctx.ignore,
      pick: v.pick.map((e) => untildeId(e, homeOf(ctx))),
      spare: v.spare.map((e) => untildeId(e, homeOf(ctx))),
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
 * ticked, refused ones shown but not selectable, spared ones left out, and
 * one the preview blocks with why (a candidate inside it that does not run); then
 * each ticked candidate's protests not yet allowed, asked for by code. The
 * answer is the plan selecting exactly the ticked candidates, or null when
 * there is no one to ask.
 */
function chooseCandidates(
  plan: Plan,
  preview: Decision,
  deps: MainDeps,
  home: string,
): Plan | null {
  const spared = new Set(preview.dropped.filter((d) => d.reason === 'spared').map((d) => d.id))
  const shown = plan.candidates.filter((c) => !spared.has(c.id))
  if (shown.length === 0) return plan
  const runs = new Set(preview.run.map((c) => c.id))
  const blocked = new Map(
    preview.dropped.filter((d) => d.reason === 'blocked').map((d) => [d.id, d.detail]),
  )
  const items: ChecklistItem[] = shown.map((c) => {
    const how = standing(c, plan.objections)
    const why = how === 'refused' ? undefined : blocked.get(c.id)
    return {
      label: `${tildeId(c.id, home)}  ${how}: ${c.why}${why === undefined ? '' : ` (blocked: ${why})`}`,
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
      if (ask(`${tildeId(c.id, home)} carries ${o.code} (${o.reason}): allow it?`) === true) {
        allow.push(o.code)
      }
    }
  }
  return { ...plan, select: ticked.map((i) => shown[i]!.id), pick: [], allow }
}

/** What a clean would do, as text: each candidate to run in order, then each one dropped and why. */
function renderPreview(d: Decision, home: string): string {
  const lines: string[] = []
  for (const c of d.run) lines.push(`  delete  ${tildeId(c.id, home)}`, `          ${c.why}`)
  for (const x of d.dropped) {
    lines.push(`  skip    ${tildeId(x.id, home)}`, `          ${x.reason}: ${x.detail}`)
  }
  return block(lines) + `would delete: ${d.run.length} item(s)\n`
}

function renderReceipt(r: Receipt, path: string, home: string): string {
  const lines: string[] = []
  for (const s of r.steps) {
    lines.push(
      `  ${s.result === 'ok' ? 'done' : s.result.toUpperCase().padEnd(7)} ${tildeId(s.id, home)}`,
      `          ${s.delete ?? s.error ?? ''}`,
    )
    for (const n of s.notified)
      if (n.error !== null) lines.push(`          ${n.plugin}: ${n.error}`)
  }
  for (const x of r.dropped) {
    lines.push(`  skip    ${tildeId(x.id, home)}`, `          ${x.reason}: ${x.detail}`)
  }
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

async function runClean(argv: readonly string[], ctx: CliContext, deps: MainDeps): Promise<number> {
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
  let cctx: RunCtx
  let preview: Decision
  let notes: Record<string, string>
  try {
    const run = setUpSweep(v, ctx, deps)
    const config = run.config
    plugins = run.plugins
    if (v.plan === undefined) {
      cctx = contextFor(parsed.positionals, config, ctx, v.allow, v.ignore)
      const s = await survey(plugins, cctx)
      writeWarnings(ctx, name, surveyWarnings(s))
      notes = s.notes
      if (nothingFound(s)) return EXIT_NOTHING_TO_SWEEP
      plan = makePlan(s, {
        targets: cctx.targets,
        targetsGiven: cctx.targetsGiven,
        ignore: cctx.ignore,
        pick: v.pick.map((e) => untildeId(e, homeOf(ctx))),
        spare: v.spare.map((e) => untildeId(e, homeOf(ctx))),
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
        targetsGiven: plan.targetsGiven,
        allow: plan.allow,
        ignore: ignoreFor(config, v.ignore, ctx),
      }
      const checked = await recheck(plan, plugins, cctx)
      writeWarnings(ctx, name, surveyWarnings(checked.survey))
      notes = checked.survey.notes
      preview = checked.decision
    }
  } catch (err) {
    return refusal(ctx, name, err)
  }

  if (v.interactive) {
    const chosen = chooseCandidates(plan, preview, deps, homeOf(ctx))
    if (chosen === null) return usageError(ctx, name, NO_TERMINAL_FOR_I)
    plan = chosen
    preview = decidePlan(plan)
  }

  const count = preview.run.length
  const json = v.format === 'json'
  if (v.dryRun || count === 0) {
    ctx.io.stdout(
      json
        ? `${JSON.stringify({ dryRun: v.dryRun, notes, run: preview.run.map((c) => c.id), dropped: preview.dropped }, null, 2)}\n`
        : renderPreview(preview, homeOf(ctx)),
    )
    return EXIT.ok
  }
  if (!v.yes) {
    ;(json ? ctx.io.stderr : ctx.io.stdout)(renderPreview(preview, homeOf(ctx)))
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
    receipt = await clean(approved, plugins, cctx, { source, receiptPath })
  } catch (err) {
    logRun(dirs.logs, { at: now.toISOString(), source, receipt: receiptPath, status: 'failed' })
    return refusal(ctx, name, err)
  }
  logRun(dirs.logs, { at: now.toISOString(), source, receipt: receiptPath, status: receipt.status })
  ctx.io.stdout(
    json
      ? `${JSON.stringify({ receiptPath, notes, receipt }, null, 2)}\n`
      : renderReceipt(receipt, receiptPath, homeOf(ctx)),
  )
  return receipt.status === 'failed' ? EXIT_STEP_FAILED : EXIT.ok
}

type PhaseRun = (
  argv: readonly string[],
  ctx: CliContext,
  deps: MainDeps,
) => number | Promise<number>

/** Each phase's runner, in the order the usage error names them. */
const RUNS = {
  status: runStatus,
  plan: runPlan,
  clean: runClean,
  config: runConfig,
  plugins: runPlugins,
} satisfies Record<string, PhaseRun>
type Phase = keyof typeof RUNS
const PHASE_NAMES = Object.keys(RUNS) as Phase[]

/** Resolves to an exit code; never exits the process. */
export async function main(
  argv: readonly string[],
  ctx: CliContext,
  deps: MainDeps = {},
): Promise<number> {
  const [sub, ...rest] = argv
  const run: PhaseRun | undefined =
    sub !== undefined && Object.hasOwn(RUNS, sub) ? RUNS[sub as Phase] : undefined
  if (run !== undefined) {
    // It cleans one person's files; as root, a target or a root could reach everyone's.
    if ((deps.uid ?? process.getuid?.()) === 0) {
      ctx.io.stderr(
        renderError('refusing to run as root; run it as the user whose files it cleans', NAME),
      )
      return EXIT.error
    }
    return run(rest, ctx, deps)
  }
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
    `${JSON.stringify(sub)} is not a phase: name one of ${PHASE_NAMES.slice(0, -1).join(', ')} or ${PHASE_NAMES.at(-1)}, then the targets`,
  )
}
