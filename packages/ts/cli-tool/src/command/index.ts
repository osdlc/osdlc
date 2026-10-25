/**
 * `@osdlc/cli-tool/command`: a CLI as a tree of declared commands.
 *
 * Each command declares its flags, arguments and output once. {@link defineApp}
 * routes a command line to it, parses the input, and prints the output as text
 * or, under `--json`, as one document with `schemaVersion` and `kind`. The app
 * adds a `help` command with progressive disclosure, a `schema` command, and
 * `--help`, `--json` and `--version` everywhere. {@link loadCommandTree} builds
 * the tree from a directory of command files.
 */

export {
  BUILTIN_FLAGS,
  CommandError,
  UsageError,
  commandKit,
  defineCommand,
  defineGroup,
  isGroup,
  isInteractive,
  outcome,
} from './define.ts'
export type {
  Command,
  CommandCommon,
  CommandContext,
  CommandInput,
  CommandKit,
  CommandResult,
  DataCommand,
  DataCommandSpec,
  Group,
  GroupSpec,
  InteractiveCommand,
  InteractiveCommandSpec,
  Node,
  Outcome,
  OutputSchema,
} from './define.ts'

export { defineApp } from './app.ts'
export type { App, AppSpec, SchemaEntry } from './app.ts'

export { HelpEntrySchema, UNIVERSAL_EXITS } from './help.ts'
export type { HelpEntry, HelpExit, HelpFlag, HelpPositional } from './help.ts'

export type { JsonSchema } from './schema.ts'

export { loadCommandTree, treeFromFiles } from './load.ts'
export type { CommandFile } from './load.ts'
