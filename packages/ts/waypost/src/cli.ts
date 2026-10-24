/**
 * `way`: browse and run every task in a repository.
 *
 * waypost is willing to run a repository's tools in principle (`allowExec:
 * true` by default): you are standing in your own repository, and a task
 * browser that cannot see the build graph is not much of a browser.
 * `--no-exec` opts out.
 *
 * The default is not the gate. Per-repository trust is: `@osdlc/trust-repo`'s
 * `policyExecGate` combines the configured value with the marker store and the
 * user file's `trust.paths`/`trust.owners` policy, so willingness becomes
 * execution only once a person, or a policy they configured, has said yes to
 * this repository. A configured `false` means no exec however trusted the
 * repository is.
 */

import { homedir } from 'node:os'

import { EXIT, defineCli, processIo, type CliIo } from '@osdlc/cli-tool'
import { runDevCli } from '@osdlc/cli-tool/devlink'
import {
  tasks as allTasks,
  type Catalog,
  type Project,
  type RunnerCacheState,
  type Task,
} from '@osdlc/system-model/detect'
import { humanAge, humanMs } from '@osdlc/system-model/duration'
import { matchEntry, terms as searchTerms, type Mode } from '@osdlc/system-model/match'
import { policyExecGate, trustStore, withheldHint } from '@osdlc/trust-repo'

import { APP, BIN, PROJECT_CONFIG_FILENAME } from './app.ts'
import { cacheDir } from './cache.ts'
import {
  collectAndCache,
  freshStates,
  fromStore,
  makeProject,
  orderedCatalog,
  readCachedCatalog,
  type WayOptions,
} from './catalog.ts'
import { runCleanCommand } from './clean-command.ts'
import {
  ConfigError,
  collectOptionsFromConfig,
  loadConfig,
  TRUST_STORE_TOOL,
  trustPolicyFromConfig,
  trustPolicyOptions,
  type LoadedConfig,
  type TaskConfig,
} from './config.ts'
import { runConfigCommand, takeConfigDir } from './config-command.ts'
import { WAYPOST_SPEC, checkoutRoot } from './devlink.ts'
import { catalogGroups } from './groups.ts'
import { runGuideCommand, type GuideTool } from './guide.ts'
import { runProvidersCommand } from './providers-command.ts'
import { serve } from './serve.ts'
import { loadTools, ToolModuleError, type LoadedTool } from './tools.ts'
import { runTrustCommand } from './trust-command.ts'
import { runTui } from './tui.ts'

/** The prose under the flag list in the complete help. */
const PROSE = `Defaults come from ${PROJECT_CONFIG_FILENAME} in the project root and from the user file
"${BIN} config path" names; a flag given here beats both. --exclude REPLACES the
configured runners.disabled rather than adding to it.

"${BIN} query" is the terminal UI's search from a shell: the same matcher, the
same ranking, one command line per result. Terms are ANDed and matched fuzzily,
a leading ' forces one term to match exactly, and --exact does that to all of
them. --json prints the matching tasks instead of their command lines, --cached
and every collection flag above apply, and an exit code of 1 means the search
matched nothing.

--json and --list re-probe every time, so a script reading them gets what the
repository currently has; --cached asks for the stored answer instead and names
the stale runners on stderr. The terminal UI and --serve always start from the
store and refresh behind you — an interactive surface is worth painting at once.

Reading some runners means running them, so a repository must be trusted before
they are collected — "${BIN} trust" records that, once, per repository. A
repository cannot trust itself: allowExec in ${PROJECT_CONFIG_FILENAME} cannot raise the
gate.

--config loads a module of extra tools for this run, beside the built-ins and
any the config's "tools" key names; "${BIN} providers" lists them all.

In the terminal UI:
  enter run  ^y copy  tab runner  ^e exact  ^t services  ^s trust  ^r refresh  esc quit
`

/**
 * The surface and subcommand names, for both help tiers. A generated flag
 * list cannot say which surface you are choosing, or name a subcommand that
 * has its own flag list.
 */
const SURFACES = `surfaces
  ${BIN}                  the terminal UI; Enter runs the selected task
  ${BIN} query <terms>    the tasks matching a search, best match first
  ${BIN} --serve          the same catalog as a live page
  ${BIN} --json | --list  the whole catalog, for a script or an agent

subcommands
  config     read and write the layered settings file; see config --help
  trust      allow this repository's runners to be read by running them; see trust --help
  providers  the registered tools, built-in and your own; see providers --help
  guide      how to use and extend this tool, in Markdown; see guide --help
  clean      remove the data this tool stores outside your repositories; see clean --help
  dev        run the installed ${BIN} from a development checkout; see dev --help`

/**
 * waypost's own `true` default for exec lives in {@link main}, below the
 * config layer — which is why `exec` and the collection lists are declared
 * absent-unless-given, per `TristateFlag` in `@osdlc/cli-tool`. `autoHelp`
 * is off for the reason `CliDecl.autoHelp` gives: `help` and `all` are
 * declared below as ordinary flags.
 */
const cli = defineCli({
  name: BIN,
  summary: 'Browse and run every task in this repository.',
  autoHelp: false,
  flags: {
    serve: { kind: 'boolean', help: 'a live page in the browser instead of the terminal UI' },
    json: {
      kind: 'boolean',
      help: 'print the catalog and exit, no UI; with query, the matching tasks themselves',
    },
    list: {
      kind: 'boolean',
      help: 'print one command line per task and exit; with query, the default form',
    },
    port: {
      kind: 'string',
      valueName: 'N',
      hidden: true,
      help: 'fixed port for --serve (default: an OS-assigned one)',
    },
    open: {
      kind: 'boolean',
      negatable: true,
      hidden: true,
      help: 'print the URL rather than opening a browser',
    },
    cached: {
      kind: 'boolean',
      hidden: true,
      help: 'answer --json/--list from the last stored probe, not a new one',
    },
    exact: {
      kind: 'boolean',
      hidden: true,
      help: 'with query: terms match as substrings, not subsequences',
    },
    services: {
      kind: 'boolean',
      hidden: true,
      help: 'with query: only tasks that run until you stop them',
    },
    exec: {
      kind: 'tristate',
      help: 'allow runners that must run a subprocess (moon), this run only',
      offHelp: 'skip them, overriding a configured allowExec: true',
    },
    only: { kind: 'list', valueName: 'a,b', hidden: true, help: 'restrict to these runners' },
    exclude: {
      kind: 'list',
      valueName: 'a,b',
      hidden: true,
      help: 'skip these runners, REPLACING the configured runners.disabled',
    },
    excludePath: {
      kind: 'list',
      valueName: 'P',
      commaSeparated: false,
      hidden: true,
      help: 'skip a path; repeatable. A bare name matches any segment, a value with a slash matches a path from the root',
    },
    discovery: {
      kind: 'enum',
      choices: ['git', 'walk', 'auto'] as const,
      valueName: 'M',
      hidden: true,
      help: 'how to find directories. Default: auto',
    },
    dir: {
      kind: 'string',
      short: 'C',
      valueName: 'PATH',
      help: 'the directory to inspect (default: cwd)',
    },
    config: {
      kind: 'list',
      valueName: 'MODULE',
      commaSeparated: false,
      help: 'load extra tools from a module, this run only; repeatable',
    },
    help: {
      kind: 'boolean',
      short: 'h',
      help: 'the short form: the ways in, and where the rest is',
    },
    all: { kind: 'boolean', help: 'with --help: this text, every flag and every note' },
  },
  positionals: [{ name: 'dir-or-terms', variadic: true, help: 'a directory, or query terms' }],
  shortEpilogue: `${SURFACES}

Some runners can only be read by running them, so a repository must be
trusted before they are collected — "${BIN} trust", once, per repository.
Until then they are withheld and every surface says so.

  ${BIN} --help --all     every flag, the defaults, and the notes
  ${BIN} guide            how it works, by topic`,
  epilogue: `${SURFACES}

${PROSE}`,
})

/** The complete help tier. */
const USAGE = cli.help()

/**
 * The default help tier. Nothing in it is the only place a fact lives, and
 * every deeper tier is named. The trust paragraph is in it because a reader
 * who does not know about the gate sees a shorter catalog and no reason why.
 */
const SHORT_USAGE = cli.help({ all: false })

/** What the `guide` command needs: the complete help, and what it cannot say. */
export const GUIDE_TOOL: GuideTool = {
  usage: USAGE,
  extraUsage: `With no options ${BIN} draws a terminal UI: type to filter, and the key line
at the foot of the usage above is the full set of bindings. Enter runs the
selected task in this terminal, and the trust binding grants trust without
leaving the UI.

\`${BIN} query <terms>\` is that same search without the UI: it ranks the catalog
with the matcher the terminal UI uses and prints one command line per match,
exiting 1 when nothing matched.

\`--serve\` swaps the terminal UI for a live page, opening a browser at an
OS-assigned port; \`--port N\` fixes the port and \`--no-open\` prints the URL
rather than opening anything.

${APP} supplies \`allowExec: true\` as its own default, below any config file:
willing in principle, still gated on trust.`,
}

/**
 * Optional fields are absent unless their flag was given, so the config layer
 * can answer instead. waypost's `allowExec: true` default lives in
 * {@link main}, below that layer.
 */
interface Flags {
  mode: 'tui' | 'serve' | 'json' | 'list' | 'query'
  dir: string
  /** Answer --json/--list from the stored probe. The UI surfaces do it always. */
  cached: boolean
  allowExec?: boolean
  open: boolean
  port?: number
  only?: string[]
  exclude?: string[]
  /**
   * Repeatable: `--exclude-path a --exclude-path b` means both. Passing any
   * at all replaces the configured list, as every other array setting merges.
   */
  excludePaths?: string[]
  discovery?: 'git' | 'walk' | 'auto'
  help: boolean
  /**
   * `query`'s search terms, and the marker that this IS a query: absent for
   * every other mode, whose one positional is a directory instead.
   */
  terms?: string[]
  /** `query --json`: the matching tasks, rather than one command line each. */
  json: boolean
  /** `query --exact`, the terminal UI's `^e`. */
  matchMode: Mode
  /** `query --services`, the terminal UI's `^t`. */
  servicesOnly: boolean
  /** `--help --all`: the complete {@link USAGE} rather than {@link SHORT_USAGE}. */
  all: boolean
  /** `--config` modules, as typed. */
  toolModules: string[]
}

/**
 * `query` is claimed before the flag parse like `config` and `trust` (see
 * {@link main}), but only because it changes what a positional MEANS, from a
 * directory to search terms. Every collection flag still applies after it,
 * which is why it is not a command with its own flag list.
 */
export function parseArgs(
  argv: readonly string[],
  io: CliIo,
  cwd: string = process.cwd(),
): Flags | { error: string } {
  const isQuery = argv[0] === 'query'
  const parsed = cli.parse(isQuery ? argv.slice(1) : argv, io)
  if (parsed.status === 'help') return { error: 'unreachable: help is a declared flag here' }
  if (parsed.status === 'error') return { error: parsed.message }
  const v = parsed.values

  // Under `query` these choose the OUTPUT FORM rather than the surface:
  // letting them set the mode would silently drop the terms.
  const mode: Flags['mode'] = isQuery
    ? 'query'
    : v.serve
      ? 'serve'
      : v.json
        ? 'json'
        : v.list
          ? 'list'
          : 'tui'

  const flags: Flags = {
    mode,
    dir: cwd,
    cached: v.cached,
    open: v.open,
    help: v.help,
    json: isQuery ? v.json : false,
    matchMode: v.exact ? 'exact' : 'fuzzy',
    servicesOnly: v.services,
    all: v.all,
    toolModules: v.config ?? [],
  }
  if (v.dir !== undefined) flags.dir = v.dir
  if (v.exec !== undefined) flags.allowExec = v.exec
  if (v.only !== undefined) flags.only = v.only.filter(Boolean)
  if (v.exclude !== undefined) flags.exclude = v.exclude.filter(Boolean)
  if (v.excludePath !== undefined) flags.excludePaths = v.excludePath
  if (v.discovery !== undefined) flags.discovery = v.discovery

  if (v.all && !v.help) {
    return { error: `--all says which help to print; pass it as "--help --all"` }
  }
  if (!isQuery) {
    if (v.exact) return { error: '--exact only applies to query' }
    if (v.services) return { error: '--services only applies to query' }
  } else {
    // The mode ternary above short-circuits on `isQuery`, so a serve flag
    // under `query` would otherwise be read by nothing at all.
    if (v.serve) return { error: '--serve does not apply to query' }
    if (v.port !== undefined) return { error: '--port only applies to --serve' }
  }
  if (v.port !== undefined) {
    // Digits only, before coercing: `Number('')` and `Number('  ')` are 0,
    // `Number('0x10')` is 16 and `Number('1e3')` is 1000 — every one an
    // integer in range, so a bare `Number()` would accept a port nobody typed,
    // and port 0 means "let the OS pick", which is what --port exists to stop.
    if (!/^\d+$/.test(v.port.trim())) {
      return { error: '--port needs a port number' }
    }
    const port = Number.parseInt(v.port.trim(), 10)
    if (port < 0 || port > 65535) {
      return { error: '--port needs a port number' }
    }
    flags.port = port
  }

  if (isQuery) {
    flags.terms = parsed.positionals
    return flags
  }
  if (parsed.positionals.length > 1) return { error: 'expected at most one directory' }
  // A positional directory beats -C.
  if (parsed.positionals[0] !== undefined) flags.dir = parsed.positionals[0]
  return flags
}

/**
 * waypost's own defaults, applied only where no config file answered.
 *
 * One constant, read in two places: {@link main} resolves the run with it, and
 * `config list` / `config get` are handed it so they report the value this tool
 * would really use rather than the library's.
 *
 * `allowExec: true` means WILLING IN PRINCIPLE, not "run this repository's
 * code"; trust is the gate, and a configured `false` still means no exec.
 */
const WAYPOST_DEFAULTS: Partial<TaskConfig> = { allowExec: true }

/** `allowExec` from the config files, or waypost's default when none sets it. */
function configuredAllowExec(cfg: LoadedConfig): boolean {
  if (cfg.sources.get('allowExec') === 'default') return WAYPOST_DEFAULTS.allowExec ?? true
  return cfg.effective.allowExec ?? WAYPOST_DEFAULTS.allowExec ?? true
}

/**
 * The single stderr line `--cached` prints, or null when there is nothing to
 * say. Where this repo has never measured a runner's probe cost it says so
 * rather than inventing a number.
 */
function cacheNote(rows: readonly RunnerCacheState[]): string | null {
  const stale = rows.filter((r) => r.state === 'stale')
  const missed = rows.filter((r) => r.state === 'miss')
  if (stale.length === 0 && missed.length === 0) return null
  const part = (row: RunnerCacheState): string => {
    const cost =
      row.estimateMs === null
        ? 'refresh cost not measured here yet'
        : `refresh usually about ${humanMs(row.estimateMs)}`
    return `${row.runner} (${humanAge(row.ageMs)}, ${cost})`
  }
  const parts: string[] = []
  if (stale.length > 0) parts.push(`stale: ${stale.map(part).join(', ')}`)
  if (missed.length > 0) {
    parts.push(`not cached, probed now: ${missed.map((r) => r.runner).join(', ')}`)
  }
  return `${APP}: --cached: ${parts.join('; ')}\n`
}

/** `--json`'s document: the catalog, its groups, and the cache verdict under `--cached`. */
export function catalogJson(catalog: Catalog, cache?: RunnerCacheState[]): object {
  const doc = { ...catalog, groups: catalogGroups(catalog.reports) }
  return cache === undefined ? doc : { ...doc, cache }
}

/**
 * Load the tool modules this run names and build the project over them.
 * Returns an error message instead when a module cannot be used.
 */
async function projectFor(
  toolModules: readonly string[],
  cfg: LoadedConfig,
  home: string,
  projectAllowed: boolean,
): Promise<{ project: Project; tools: LoadedTool[]; warnings: string[] } | { error: string }> {
  try {
    const { tools, warnings } = await loadTools({
      flag: toolModules,
      cwd: process.cwd(),
      config: cfg,
      home,
      projectAllowed,
    })
    return { project: makeProject(tools.map((t) => t.def)), tools, warnings }
  } catch (err) {
    if (err instanceof ToolModuleError) return { error: err.message }
    throw err
  }
}

/**
 * `env` and `home` are injectable so a test never reads the developer's own
 * config, cache or trust store. `io` defaults to the real process streams.
 */
export async function main(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  home: string = homedir(),
  io: CliIo = processIo,
): Promise<number> {
  // Subcommands are claimed before the flag parse: their arguments are not
  // this parser's flags. The root is found with the built-in tools only.
  const findRoot = (dir: string): Promise<string> => makeProject().findRoot(dir)
  const usageError = (message: string): number => {
    io.stderr(`${APP}: ${message}\n\n${SHORT_USAGE}`)
    return EXIT.usage
  }

  if (argv[0] === 'config' || argv[0] === 'trust' || argv[0] === 'providers') {
    // -C has to work here: pointing at another directory must show THAT
    // directory's configuration, trust and tools.
    const taken = takeConfigDir(argv.slice(1))
    if ('error' in taken) return usageError(taken.error)
    const root = await findRoot(taken.dir ?? process.cwd())
    if (argv[0] === 'config') {
      return runConfigCommand(APP, root, taken.rest, {
        ...io,
        env,
        home,
        defaults: WAYPOST_DEFAULTS,
      })
    }
    if (argv[0] === 'trust') return runTrustCommand(APP, root, taken.rest, { ...io, env, home })
    return runProvidersCommand(root, taken.rest, {
      ...io,
      env,
      home,
      configuredAllowExec,
      load: async (cfg, modules, projectAllowed) => projectFor(modules, cfg, home, projectAllowed),
    })
  }

  if (argv[0] === 'clean') return runCleanCommand(APP, argv.slice(1), { ...io, env, home })
  if (argv[0] === 'guide') return runGuideCommand(GUIDE_TOOL, argv.slice(1), io)
  // `self` is this checkout, so `dev install` and a bare `dev link` know what
  // to point at.
  if (argv[0] === 'dev') {
    return runDevCli(WAYPOST_SPEC, argv.slice(1), { io, env, self: checkoutRoot() })
  }

  const parsed = parseArgs(argv, io)
  // The short form on a typo: the error is the part the reader came for.
  if ('error' in parsed) return usageError(parsed.error)
  if (parsed.help) {
    io.stdout(parsed.all ? USAGE : SHORT_USAGE)
    return EXIT.ok
  }

  const root = await findRoot(parsed.dir)

  let cfg: LoadedConfig
  try {
    cfg = await loadConfig(root, env, home)
  } catch (err) {
    if (err instanceof ConfigError) {
      io.stderr(`${APP}: ${err.message}\n`)
      return EXIT.error
    }
    throw err
  }
  for (const warning of cfg.warnings) io.stderr(`warning: ${warning}\n`)

  // Precedence for allowExec, highest first: --exec / --no-exec; allowExec in
  // the project file, then the user file; waypost's own default (true). Only
  // `sources` separates "a file said false" from "nobody said anything".
  const configured = configuredAllowExec(cfg)

  // The trust seam. Collection never reads the store.
  const trustStoreInstance = trustStore({ tool: TRUST_STORE_TOOL, env, home })
  const gate = await policyExecGate(
    trustStoreInstance,
    trustPolicyFromConfig(cfg.effective),
    { root, configured, flag: parsed.allowExec },
    trustPolicyOptions(home),
  )

  // A project module runs code on import, so it needs execution allowed as
  // well as trust.
  const projectAllowed = gate.trusted && gate.allowExec
  const built = await projectFor(parsed.toolModules, cfg, home, projectAllowed)
  const projectToolsPending = !projectAllowed && (cfg.layers.project?.tools?.length ?? 0) > 0
  if ('error' in built) {
    io.stderr(`${APP}: ${built.error}\n`)
    return EXIT.error
  }
  for (const warning of built.warnings) io.stderr(`warning: ${warning}\n`)
  const { project } = built

  // The config's own allowExec was consumed above.
  const { allowExec: _consumed, ...configOptions } = collectOptionsFromConfig(cfg.effective)

  // Config first, flags second. --exclude REPLACES runners.disabled.
  const options: WayOptions = {
    ...configOptions,
    allowExec: gate.allowExec,
    // Only when trust is what is missing: when a file turned execution off,
    // trusting the repository would change nothing.
    ...(gate.reason === 'untrusted' ? { execWithheldHint: withheldHint(BIN) } : {}),
    ...(parsed.only ? { only: parsed.only } : {}),
    ...(parsed.exclude ? { exclude: parsed.exclude } : {}),
    ...(parsed.excludePaths ? { excludePaths: parsed.excludePaths } : {}),
    ...(parsed.discovery !== undefined ? { discovery: parsed.discovery } : {}),
  }

  // The config keys a flag already answered. `serve` re-derives the file's
  // slice after a save from the page and leaves these alone.
  const pinnedByFlag = [
    ...(parsed.exclude ? ['exclude'] : []),
    ...(parsed.excludePaths ? ['excludePaths'] : []),
    ...(parsed.discovery !== undefined ? ['discovery'] : []),
  ]

  // Said once for all runners, and only by the non-interactive modes: the TUI
  // and the page have their own affordance.
  const reportWithheld = (catalog: Catalog): void => {
    const withheld = catalog.reports.filter((r) => r.skippedForExec).length
    if (gate.reason !== 'untrusted' || withheld === 0) return
    io.stderr(
      `${APP}: ${withheld} runner${withheld === 1 ? '' : 's'} not collected — ${withheldHint(BIN)}\n`,
    )
  }

  const store = cacheDir(env, home)
  const order = cfg.effective.runners?.order

  /**
   * The catalog for a data surface, plus the cache verdict when one was read.
   * Fresh by default, since a script must not get a quietly old answer; the
   * probe still writes the store. --cached reads the store and says so on
   * stderr.
   */
  const dataCatalog = async (): Promise<{
    catalog: Catalog
    cache: RunnerCacheState[] | undefined
  }> => {
    if (!parsed.cached) {
      const fresh = await collectAndCache(project, root, options, store)
      return { catalog: orderedCatalog(fresh, order), cache: undefined }
    }
    const stored = await readCachedCatalog(project, root, options, store)
    if (stored.catalog === null || !fromStore(stored)) {
      io.stderr(
        `${APP}: --cached: nothing cached for this repository yet — probed it fresh, and this run stores the result\n`,
      )
      const fresh = await collectAndCache(project, root, options, store)
      return { catalog: orderedCatalog(fresh, order), cache: freshStates(fresh) }
    }
    // A miss is a gap in the cache: the missing runners alone are probed.
    const missing = stored.runners.filter((r) => r.state === 'miss').map((r) => r.runner)
    const merged =
      missing.length === 0
        ? stored.catalog
        : {
            ...stored.catalog,
            reports: [
              ...stored.catalog.reports,
              ...(await collectAndCache(project, root, { ...options, only: missing }, store))
                .reports,
            ],
          }
    // stderr, never stdout: --list stays pipeable and --json stays parseable.
    const note = cacheNote(stored.runners)
    if (note !== null) io.stderr(note)
    return { catalog: orderedCatalog(merged, order), cache: stored.runners }
  }

  switch (parsed.mode) {
    case 'serve':
      return serve({
        project,
        projectToolsPending,
        root,
        collectOptions: options,
        pinnedByFlag,
        open: parsed.open,
        runnerOrder: order,
        env,
        home,
        ...(parsed.port !== undefined ? { port: parsed.port } : {}),
      })
    case 'json': {
      const { catalog, cache } = await dataCatalog()
      io.stdout(`${JSON.stringify(catalogJson(catalog, cache), null, 2)}\n`)
      reportWithheld(catalog)
      return EXIT.ok
    }
    case 'list': {
      const { catalog } = await dataCatalog()
      const lines = allTasks(catalog).map((t) => t.display)
      if (lines.length > 0) io.stdout(`${lines.join('\n')}\n`)
      reportWithheld(catalog)
      return EXIT.ok
    }
    case 'query': {
      const { catalog } = await dataCatalog()
      // Joined and re-split, so a quoted "dep env" is two terms.
      const queryTerms = searchTerms((parsed.terms ?? []).join(' '))
      const hits: { task: Task; score: number }[] = []
      for (const task of allTasks(catalog)) {
        if (parsed.servicesOnly && !task.persistent.value) continue
        // An empty query matches everything, as the TUI's empty entry line does.
        if (queryTerms.length === 0) {
          hits.push({ task, score: 0 })
          continue
        }
        const m = matchEntry(task, queryTerms, parsed.matchMode)
        if (m !== null) hits.push({ task, score: m.score })
      }
      // Stable, so equal scores keep the catalog's own order.
      if (queryTerms.length > 0) hits.sort((a, b) => b.score - a.score)

      if (parsed.json) {
        io.stdout(
          `${JSON.stringify(
            hits.map((h) => h.task),
            null,
            2,
          )}\n`,
        )
      } else if (hits.length > 0) {
        io.stdout(`${hits.map((h) => h.task.display).join('\n')}\n`)
      }
      reportWithheld(catalog)
      // grep's contract: a search with terms that matched nothing exits 1.
      return queryTerms.length > 0 && hits.length === 0 ? 1 : 0
    }
    case 'tui':
      return runTui({
        project,
        projectToolsPending,
        root,
        options,
        runnerOrder: order,
        gate,
        env,
        home,
      })
  }
}

// Runs when executed directly (devlink runs a checkout's `src/cli.ts` under
// Bun); inert when imported by the bin.
if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
