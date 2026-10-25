/**
 * The `way` command tree. See `src/core/README.md` for how a command is added.
 */

import { defineApp, type App, type Node } from '@osdlc/cli-tool/command'
import type { CliIo } from '@osdlc/cli-tool'

import { BIN, PROJECT_CONFIG_FILENAME } from '../app.ts'
import { VERSION } from '../version.ts'
import { browseCommand, serveCommand } from './browse.ts'
import { listCommand } from './list.ts'
import { queryCommand } from './query.ts'
import { runCommand } from './run.ts'
import { providersCommand } from '../providers-command.ts'
import { GLOBALS, kit, setCommandWords } from './shared.ts'

/** What a legacy command gets: its own words, and the run's streams and paths. */
export interface LegacyContext {
  io: CliIo
  env: Record<string, string | undefined>
  home: string
  cwd: string
}

/**
 * A command that still parses its own arguments. `main` runs it before the
 * command tree sees the line; the tree holds a stub with the same summary, so
 * `help` lists it. Each one moves into the tree as a data command in time.
 */
export interface LegacyCommand {
  summary: string
  /** Left out of help at every level. */
  hidden?: boolean
  run(argv: string[], ctx: LegacyContext): Promise<number> | number
}

/** The root's long description: what `way help --full` adds. */
const DESCRIPTION = `Defaults come from ${PROJECT_CONFIG_FILENAME} in the project root and from the user file "${BIN} config path" names; a flag beats both. --exclude REPLACES the configured runners.disabled rather than adding to it.

"${BIN} list" and "${BIN} query" probe every time, so a script reading them gets what the repository has now; --cached asks for the stored answer instead and names the stale runners on stderr. The terminal UI and "${BIN} serve" start from the store and refresh behind you.

Reading some runners means running them, so a repository must be trusted before they are collected: "${BIN} trust" records that, once, per repository. Until then they are withheld and every surface says so. A repository cannot trust itself: allowExec in ${PROJECT_CONFIG_FILENAME} cannot raise the gate.

--config loads a module of extra tools for this run, beside the built-ins and any the config's "tools" key names; "${BIN} providers" lists them all.

The flags --serve, --list and --json with no command still work in this release, as "${BIN} serve", "${BIN} list" and "${BIN} list --json". They go away in a later release.`

/** What {@link createWayApp} returns. */
export interface WayApp {
  app: App
  /** Every command word at the root, hidden and legacy ones and `help` and `schema` included. */
  words: readonly string[]
  /** The words of the commands the tree runs itself, for the complete help. */
  treeWords: readonly string[]
  /** The commands `main` runs before the tree, by command word. */
  legacy: Readonly<Record<string, LegacyCommand>>
}

/**
 * Build the command tree. `home` is the base for config, trust and cache
 * paths, injected so a test never reads the developer's own. `legacy` are
 * the commands that still parse their own arguments.
 */
export function createWayApp(opts: {
  home: string
  legacy: Readonly<Record<string, LegacyCommand>>
}): WayApp {
  const { home, legacy } = opts
  const browse = browseCommand(home)
  const stubs: Record<string, Node> = {}
  for (const [word, command] of Object.entries(legacy)) {
    // A hidden one has no stub, so no help level lists it.
    if (command.hidden === true) continue
    stubs[word] = kit.command({
      summary: command.summary,
      interactive: true,
      // `main` runs these before the tree; a stub only gives `help` its line.
      run: () => 2,
    })
  }
  const commands: Record<string, Node> = {
    browse: { ...browse, hidden: true },
    list: listCommand(home),
    query: queryCommand(home),
    run: runCommand(home),
    serve: serveCommand(home),
    providers: providersCommand(home),
    ...stubs,
  }
  const words = [
    ...Object.keys(commands),
    ...Object.keys(legacy).filter((w) => !Object.hasOwn(commands, w)),
    'help',
    'schema',
  ]
  setCommandWords(words)
  const app = defineApp({
    name: BIN,
    version: VERSION,
    summary: 'Browse and run every task in this repository.',
    description: DESCRIPTION,
    globals: GLOBALS,
    default: browse,
    commands,
  })
  const treeWords = ['list', 'query', 'run', 'serve', 'providers']
  return { app, words, treeWords, legacy }
}
