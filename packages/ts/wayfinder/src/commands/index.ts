/**
 * The `way` command tree. See `src/core/README.md` for how a command is added.
 */

import { defineApp, type App, type CommandContext, type Node } from '@osdlc/cli-tool/command'

import { BIN, PROJECT_CONFIG_FILENAME } from '../app.ts'
import { VERSION } from '../version.ts'
import { TUI_KEYS_HELP, browseCommand, serveCommand } from './browse.ts'
import { listCommand } from './list.ts'
import { queryCommand } from './query.ts'
import { runCommand } from './run.ts'
import { cleanCommand } from '../clean-command.ts'
import { configCommand } from '../config-command.ts'
import { guideCommand, type GuideTool } from '../guide.ts'
import { providersCommand } from '../providers-command.ts'
import { trustCommand } from '../trust-command.ts'
import { createCatalogShare, type CatalogShare } from '../serve/catalog-share.ts'
import { GLOBALS, setCommandWords } from './shared.ts'

/** The root's long description: what `way help --full` adds. */
const DESCRIPTION = `Defaults come from ${PROJECT_CONFIG_FILENAME} in the project root and from the user file "${BIN} config path" names; a flag beats both. --exclude REPLACES the configured runners.disabled rather than adding to it.

"${BIN} list" and "${BIN} query" probe every time, so a script reading them gets what the repository has now; --cached asks for the stored answer instead and names the stale runners on stderr. The terminal UI and "${BIN} serve" start from the store and refresh behind you.

Reading some runners means running them, so a repository must be trusted before they are collected: "${BIN} trust" records that, once, per repository. Until then they are withheld and every surface says so. A repository cannot trust itself: allowExec in ${PROJECT_CONFIG_FILENAME} cannot raise the gate.

--config loads a module of extra tools for this run, beside the built-ins and any the config's "tools" key names; "${BIN} providers" lists them all.

The flags --serve, --list and --json with no command still work in this release, as "${BIN} serve", "${BIN} list" and "${BIN} list --json". They go away in a later release.

${TUI_KEYS_HELP}`

/** What {@link createWayApp} returns. */
export interface WayApp {
  app: App
  /** Every command word at the root, hidden ones and `help` and `schema` included. */
  words: readonly string[]
  /** The words of the commands the complete help shows. */
  treeWords: readonly string[]
  /** The catalog `list` shares between the web view's requests; `serve` fills it. */
  share: CatalogShare
}

/**
 * Build the command tree. `home` is the base for config, trust and cache
 * paths, injected so a test never reads the developer's own. `guide` gives
 * the guide its usage topic; by default the root's complete help.
 */
export function createWayApp(opts: {
  home: string
  guide?: (ctx: CommandContext) => GuideTool
}): WayApp {
  const { home } = opts
  const env = { globals: GLOBALS, home: () => home }
  // The catalog the web view holds between requests; `serve` turns it on.
  const share = createCatalogShare()
  const browse = browseCommand(home)
  // The bare `way` follows the `open` setting; `way browse` is always the terminal UI.
  const bare = browseCommand(home, { followOpen: true, share })
  const commands: Record<string, Node> = {
    browse: { ...browse, hidden: true },
    list: listCommand(home, share),
    query: queryCommand(home),
    run: runCommand(home),
    serve: serveCommand(home, share),
    providers: providersCommand(home),
    config: configCommand(env),
    trust: trustCommand(env),
    guide: guideCommand({
      globals: GLOBALS,
      ...(opts.guide !== undefined ? { tool: opts.guide } : {}),
    }),
    clean: cleanCommand(env),
  }
  const words = [...Object.keys(commands), 'help', 'schema']
  setCommandWords(words)
  const app = defineApp({
    name: BIN,
    version: VERSION,
    summary: 'Browse and run every task in this repository.',
    description: DESCRIPTION,
    globals: GLOBALS,
    default: bare,
    commands,
  })
  const treeWords = Object.keys(commands).filter((w) => w !== 'browse')
  return { app, words, treeWords, share }
}
