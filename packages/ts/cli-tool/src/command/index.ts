/**
 * `@osdlc/cli-tool/command`: a CLI as a tree of declared commands.
 *
 * Each command declares its flags, arguments and output once. {@link defineApp}
 * routes a command line to it, parses the input, and prints the output as text
 * or, under `--json`, as one document with `schemaVersion` and `kind`, and a
 * list as JSON lines under `--output jsonl`. The app adds a `help` command
 * with progressive disclosure, a `schema` command, `--help`, `--json` and
 * `--output` on every command, and `--version` on the root. `App.call` runs a command from a JSON
 * object, for the MCP and HTTP adapters. {@link loadCommandTree} builds
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
  EventsSpec,
  Exposure,
  Group,
  GroupSpec,
  InteractiveCommand,
  InteractiveCommandSpec,
  Node,
  Outcome,
  OutputMode,
  OutputSchema,
  Surface,
} from './define.ts'

export { ErrorDocumentSchema, errorDocument } from './error.ts'
export type { ErrorDocument } from './error.ts'

export { defineApp } from './app.ts'
export type { App, AppSpec, CallOptions, CallResult, SchemaEntry } from './app.ts'

export { HelpEntrySchema, UNIVERSAL_EXITS } from './help.ts'
export type { HelpEntry, HelpExit, HelpFlag, HelpPositional } from './help.ts'

export type { JsonSchema } from './schema.ts'

export { loadCommandTree, treeFromFiles } from './load.ts'
export type { CommandFile } from './load.ts'
