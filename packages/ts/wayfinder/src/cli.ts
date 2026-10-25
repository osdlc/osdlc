/**
 * `way`: browse and run every task in a repository.
 *
 * The commands are a `@osdlc/cli-tool` command tree (`commands/index.ts`).
 * This module is the entry point: it runs the commands that still parse their
 * own arguments, maps the old surface flags onto commands, and hands the rest
 * to the tree.
 *
 * wayfinder's `allowExec` default is `true`. You usually run it in your own
 * repository, and a task browser that cannot see the build graph is of little
 * use. `--no-exec` turns execution off. The default alone does not allow
 * execution: the repository must also be trusted (see `core/session.ts`).
 */

import { stat } from 'node:fs/promises'
import { resolve } from 'node:path'

import { EXIT, processContext, processIo, type CliIo } from '@osdlc/cli-tool'
import { runDevCli } from '@osdlc/cli-tool/devlink'
import { installGroupSignalForwarding } from '@osdlc/command-seam'
import { homeDir } from '@osdlc/trust-repo'

import { APP, BIN } from './app.ts'
import { makeProject } from './catalog.ts'
import { runCleanCommand } from './clean-command.ts'
import { createWayApp, type LegacyCommand, type LegacyContext } from './commands/index.ts'
import { GLOBALS } from './commands/shared.ts'
import { runConfigCommand, takeConfigDir } from './config-command.ts'
import { WAYFINDER_DEFAULTS } from './core/session.ts'
import { WAYFINDER_SPEC, checkoutRoot } from './devlink.ts'
import { runGuideCommand, type GuideTool } from './guide.ts'
import { safeJsonStdout, safeStderr, safeStdout } from './terminal-text.ts'
import { runTrustCommand } from './trust-command.ts'

function usageError(io: CliIo, message: string): number {
  io.stderr(`${BIN}: ${message}\n  "${BIN} --help" lists the commands\n`)
  return EXIT.usage
}

/**
 * The project root a legacy command acts on: `-C`, else the cwd. The
 * directory must exist. Returns an error message instead.
 */
async function legacyRoot(
  dir: string | undefined,
  cwd: string,
): Promise<string | { error: string }> {
  const start = resolve(cwd, dir ?? '.')
  const isDir = await stat(start).then(
    (s) => s.isDirectory(),
    () => false,
  )
  if (!isDir) return { error: `${dir ?? start}: no such directory` }
  // The root is found with the built-in tools only.
  return makeProject().findRoot(start)
}

/** A legacy command that takes `-C`: config and trust. */
function withRoot(
  summary: string,
  run: (root: string, rest: string[], ctx: LegacyContext) => Promise<number>,
): LegacyCommand {
  return {
    summary,
    async run(argv, ctx) {
      // -C has to work here, so pointing at another directory shows that
      // directory's configuration and trust.
      const taken = takeConfigDir(argv)
      if ('error' in taken) return usageError(ctx.io, taken.error)
      const root = await legacyRoot(taken.dir, ctx.cwd)
      if (typeof root !== 'string') {
        ctx.io.stderr(`${APP}: ${root.error}\n`)
        return EXIT.error
      }
      return run(root, taken.rest, ctx)
    },
  }
}

/**
 * The commands that still parse their own arguments. `main` runs one of
 * these before the command tree when its word is the command word.
 */
const LEGACY: Readonly<Record<string, LegacyCommand>> = {
  config: withRoot(
    'read and write the layered settings file; see config --help',
    (root, rest, { io, env, home }) =>
      runConfigCommand(APP, root, rest, { ...io, env, home, defaults: WAYFINDER_DEFAULTS }),
  ),
  trust: withRoot(
    "allow this repository's runners to be read by running them; see trust --help",
    (root, rest, { io, env, home }) => runTrustCommand(APP, root, rest, { ...io, env, home }),
  ),
  guide: {
    summary: 'how to use and extend this tool, in Markdown; see guide --help',
    run: (argv, { io }) => runGuideCommand(GUIDE_TOOL, argv, io),
  },
  clean: {
    summary: 'remove the data this tool stores outside your repositories; see clean --help',
    run: (argv, { io, env, home }) => runCleanCommand(APP, argv, { ...io, env, home }),
  },
  // A contributor tool, so help does not list it. `self` is this checkout, so
  // `dev install` and a bare `dev link` know what to point at.
  dev: {
    summary: 'link a checkout of this tool for development',
    hidden: true,
    run: (argv, { io, env }) =>
      runDevCli(WAYFINDER_SPEC, argv, {
        io: argv.includes('--json') ? safeJsonStdout(io) : safeStdout(io),
        env,
        self: checkoutRoot(),
      }),
  },
}

/** An app that only renders help, for the guide. It never runs a command. */
const HELP = createWayApp({ home: '/', legacy: LEGACY })

/** The complete help: the root, then each command the tree runs, each in full. */
const COMPLETE_HELP = [[], ...HELP.treeWords.map((w) => [w])]
  .map((path) => HELP.app.helpText(path, { full: true, width: 80 }))
  .join('\n')

/** What the `guide` command needs: the complete help, and what it cannot say. */
export const GUIDE_TOOL: GuideTool = {
  usage: COMPLETE_HELP,
  extraUsage: `With no command ${BIN} draws a terminal UI: type to filter, and the key line
at the foot of the screen is the full set of bindings. Enter runs the
selected task in this terminal, and the trust binding grants trust without
leaving the UI.

\`${BIN} query <terms>\` is that same search without the UI: it ranks the catalog
with the matcher the terminal UI uses and prints one command line per match,
exiting 1 when nothing matched. \`${BIN} run <id>\` runs one task by id.

\`${BIN} serve\` swaps the terminal UI for a live page, opening a browser at an
OS-assigned port; \`--port N\` fixes the port and \`--no-open\` prints the URL
rather than opening anything. The old \`--serve\` flag still works.

${APP} supplies \`allowExec: true\` as its own default, below any config file:
willing in principle, still gated on trust.`,
}

/** The spellings of the global flags that take a value: `-C`, `--dir`, `--only`. */
const GLOBAL_VALUE_FLAGS: ReadonlySet<string> = new Set(
  Object.entries(GLOBALS).flatMap(([name, decl]) => {
    if (decl.kind === 'tristate') return []
    const long = `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`
    return 'short' in decl ? [long, `-${decl.short}`] : [long]
  }),
)

/** Flags of the old surfaces that take a value. */
const ALIAS_VALUE_FLAGS: ReadonlySet<string> = new Set(['--port'])

/**
 * The index of the first word that is not a flag or a flag's value, before
 * any `--`. -1 when there is none.
 */
function commandWordIndex(argv: readonly string[]): number {
  for (let i = 0; i < argv.length; i++) {
    const word = argv[i]!
    if (word === '--') return -1
    if (!word.startsWith('-') || word === '-') return i
    if (GLOBAL_VALUE_FLAGS.has(word) || ALIAS_VALUE_FLAGS.has(word)) i += 1
  }
  return -1
}

/** The old surface flags, and the command line each one now is. */
const SURFACE_FLAGS: Readonly<Record<string, readonly string[]>> = {
  '--serve': ['serve'],
  '--list': ['list'],
  '--json': ['list', '--json'],
}

/**
 * Map the old surface flags onto commands, for this release: `--serve` is
 * `serve`, `--list` is `list`, and `--json` alone is `list --json`. They
 * apply only where no command word is given. Two of them together are
 * refused, since each chooses a surface.
 */
export function rewriteAliases(
  argv: readonly string[],
  commandWords: readonly string[],
): { argv: string[] } | { error: string } {
  const at = commandWordIndex(argv)
  const word = at === -1 ? undefined : argv[at]
  if (word !== undefined && commandWords.includes(word)) {
    // `query --list` asked for the default form of `query`.
    if (word === 'query') return { argv: argv.filter((w, i) => i <= at || w !== '--list') }
    return { argv: [...argv] }
  }
  const dash = argv.indexOf('--')
  const head = dash === -1 ? argv : argv.slice(0, dash)
  // `--version` and `--help` answer for the root, whatever else is given.
  if (['--version', '--help', '-h'].some((flag) => head.includes(flag))) return { argv: [...argv] }
  const given = Object.keys(SURFACE_FLAGS).filter((flag) => head.includes(flag))
  if (given.length === 0) return { argv: [...argv] }
  if (given.length > 1) return { error: `${given.join(' and ')} each choose a surface; give one` }
  const flag = given[0]!
  return { argv: [...SURFACE_FLAGS[flag]!, ...argv.filter((w) => w !== flag)] }
}

/**
 * A legacy command and its arguments, when its word is the command word.
 * Global flags before the word move after it, so `way -C x trust` is
 * `trust -C x`.
 */
function findLegacy(
  argv: readonly string[],
): { command: LegacyCommand; argv: string[] } | undefined {
  const at = commandWordIndex(argv)
  if (at === -1 || !Object.hasOwn(LEGACY, argv[at]!)) return undefined
  return { command: LEGACY[argv[at]!]!, argv: [...argv.slice(at + 1), ...argv.slice(0, at)] }
}

/**
 * Run `way` with `argv`, the words after the binary. Returns the exit code.
 * `env` and `home` are injectable so a test never reads the developer's own
 * config, cache or trust store. `io` defaults to the real process streams.
 */
export async function main(
  argv: string[],
  env: Record<string, string | undefined> = process.env,
  home: string = homeDir(),
  io: CliIo = processIo,
): Promise<number> {
  const real = io === processIo
  // Each probe runs in its own process group, so the terminal's Ctrl-C does
  // not reach it. On SIGINT, SIGTERM or SIGHUP this kills every live probe
  // group and exits with 128 + the signal. Only the real process installs it:
  // a test that passes its own io keeps the process's signal handling.
  if (real) installGroupSignalForwarding()
  // Every stderr line is human text that can quote repository content.
  io = safeStderr(io)
  const cwd = process.cwd()

  const legacy = findLegacy(argv)
  if (legacy !== undefined) return legacy.command.run(legacy.argv, { io, env, home, cwd })

  const { app, words } = createWayApp({ home, legacy: LEGACY })
  const aliased = rewriteAliases(argv, words)
  if ('error' in aliased) return usageError(io, aliased.error)

  return app.run(aliased.argv, {
    // JSON keeps every value exact, with DEL, C1 and bidi controls escaped.
    // Each command makes its own text output terminal-safe.
    io: safeJsonStdout(io),
    cwd,
    env,
    ...(real ? { terminal: processContext().terminal! } : {}),
  })
}

// Runs when executed directly (devlink runs a checkout's `src/cli.ts` under
// Bun); inert when imported by the bin.
if (import.meta.main) {
  process.exitCode = await main(process.argv.slice(2))
}
