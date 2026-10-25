/**
 * Declaring commands and groups of commands. A command declares its flags,
 * its positional arguments and its output once. The app parses the input,
 * renders the output as text or as one JSON document, and generates help and
 * JSON Schema from the same declaration.
 */

import type { z } from 'zod'

import type { FlagSpec, FlagValues, PositionalDecl } from '../define-cli.ts'
import type { ExitCode } from '../exit.ts'
import type { CliContext } from '../io.ts'
import type { App } from './app.ts'

/**
 * The output contract of a data command: a Zod object schema.
 * @experimental
 */
export type OutputSchema = z.ZodObject

/**
 * What a command's `run` receives: its own flags, the app's global flags,
 * its positional arguments and the words after `--`.
 * @experimental
 */
export interface CommandInput<F extends FlagSpec, G extends FlagSpec> {
  flags: FlagValues<F>
  globals: FlagValues<G>
  positionals: string[]
  /** The words after a `--`, passed through unparsed. Empty when there was no `--`. */
  rest: string[]
}

/**
 * The context a command runs in: the {@link CliContext} plus what the app
 * worked out from the command line.
 * @experimental
 */
export interface CommandContext extends CliContext {
  /** The app this command runs in. An adapter command, such as `mcp`, serves its tree. */
  app: App
  /** The words that selected this command, such as `['config', 'get']`. */
  path: readonly string[]
  /**
   * The app's global flag values, keyed as declared, such as `dir` for `-C`.
   * The same values as `input.globals`, here so a shared command's store or
   * service can read them. Through an adapter they are the values the server
   * was started with.
   */
  globals: Readonly<Record<string, unknown>>
  /** Whether the answer is JSON: `--json`, `--output json` or `--output jsonl`, or a call through an adapter. */
  json: boolean
  /** The output mode. A call through an adapter is `json`. */
  output: OutputMode
  /** Where the command was called from: the command line, or an adapter. */
  surface: Surface
  /** Aborted when the caller cancels: an MCP cancel, or an HTTP client that disconnects. */
  signal: AbortSignal
  /**
   * Send one event of a command that declares `events`. The command line
   * prints it as it comes; the HTTP adapter streams it; the MCP adapter sends
   * it as progress. Throws for a command that declares no `events`.
   */
  emit(event: Record<string, unknown>): void
  /** Whether stdout may be colored. Always false under `--json`. */
  color: boolean
  /** The width text output is wrapped to. */
  width: number
  /** Write `<app>: warning: <message>` to stderr. */
  warn(message: string): void
  /** Write `<app>: <message>` to stderr. */
  note(message: string): void
}

/**
 * The output modes of `--output`. `json` is the same as `--json`. `jsonl`
 * prints one JSON object per line, each with `schemaVersion` and `kind`.
 * @experimental
 */
export type OutputMode = 'text' | 'json' | 'jsonl'

/**
 * Where a command was called from: `cli` for a command line, `mcp` or `http`
 * for an adapter.
 * @experimental
 */
export type Surface = 'cli' | 'mcp' | 'http'

/**
 * Who may call a command. `all`: the command line and the MCP and HTTP
 * adapters. `cli-only`: the command line only. A command that changes trust is
 * `cli-only`, because an agent or a web page must not grant itself trust.
 * @experimental
 */
export type Exposure = 'all' | 'cli-only'

/**
 * What a data command returns: its output, or its output with an exit code.
 * @experimental
 */
export type CommandResult<O> = O | Outcome<O>

const OUTCOME = Symbol('cli-tool.outcome')

/**
 * An output together with the exit code the run ends with. Made by {@link outcome}.
 * @experimental
 */
export interface Outcome<O> {
  readonly [OUTCOME]: true
  readonly output: O
  readonly exit: ExitCode
}

/**
 * Return `output` and end the run with `exit`. The output is still printed,
 * as text or as JSON. For an answer that is also a failure, such as a search
 * that matched nothing (exit 1) or a domain outcome (10-63).
 * @experimental
 */
export function outcome<O>(output: O, exit: ExitCode): Outcome<O> {
  return { [OUTCOME]: true, output, exit }
}

/**
 * Whether `value` was made by {@link outcome}.
 * @experimental
 */
export function isOutcome(value: unknown): value is Outcome<unknown> {
  return typeof value === 'object' && value !== null && OUTCOME in value
}

/**
 * A command that cannot do what it was asked. The app prints
 * `<app>: <message>` and the hint on stderr and exits with `exit`
 * ({@link EXIT.error} unless given). Under `--json` it also prints an error
 * document whose `code` is `code` (default `error`).
 * @experimental
 */
export class CommandError extends Error {
  readonly exit: ExitCode
  readonly hint: string | undefined
  /** A stable name for the error, for the error document. */
  readonly code: string
  constructor(message: string, options: { exit?: ExitCode; hint?: string; code?: string } = {}) {
    super(message)
    this.name = 'CommandError'
    this.exit = options.exit ?? 1
    this.hint = options.hint
    this.code = options.code ?? 'error'
  }
}

/**
 * A command line that cannot run as typed, found by the command itself
 * rather than the parser: two flags that conflict, a value out of range. The
 * app prints the message and the command's usage line on stderr and exits 2.
 * @experimental
 */
export class UsageError extends CommandError {
  constructor(message: string) {
    super(message, { exit: 2, code: 'usage' })
    this.name = 'UsageError'
  }
}

/**
 * What every command declares, data or interactive.
 * @experimental
 */
export interface CommandCommon<F extends FlagSpec> {
  /** One line, for lists of commands. */
  summary: string
  /** The longer explanation, shown by `help --full`. Wrapped at render time. */
  description?: string
  flags?: F
  positionals?: readonly PositionalDecl[]
  /**
   * The words after `--`, named for the usage line: `{ name: 'args' }` shows
   * `[-- <args>...]`. Every command gets them as `rest`; this only documents them.
   */
  rest?: { name: string }
  /**
   * The command's own exit codes beyond 0, 1 and 2, with what each means:
   * `{ 10: 'nothing to do' }`. A code must be 1, or in 10-63 except the shared
   * failure codes 22-25.
   */
  exits?: Readonly<Record<number, string>>
  /** Command lines shown under `help --full`, without the leading app name. */
  examples?: readonly string[]
  /** Left out of help lists. It still runs and still has a schema. */
  hidden?: boolean
  /** True when the command changes nothing. The MCP adapter marks it with `readOnlyHint`. */
  readOnly?: boolean
  /**
   * True when the command deletes or overwrites something that cannot be got
   * back. The MCP adapter marks it with `destructiveHint`. Ignored with `readOnly`.
   */
  destructive?: boolean
  /** Who may call the command. Default `all`. Interactive commands are never exposed to adapters. */
  exposure?: Exposure
  /**
   * The exposure of one call, for a command whose risk depends on its input,
   * such as `config set` of a trust key. Checked by the adapters after the
   * input is parsed. A `cli-only` from here refuses that call only.
   */
  exposureOf?(input: CommandInput<F, FlagSpec>): Exposure
}

/**
 * A command that answers with data. Its output is declared as a Zod object,
 * which is the contract for `--json` and for `schema`.
 * @experimental
 */
export interface DataCommandSpec<
  F extends FlagSpec,
  G extends FlagSpec,
  S extends OutputSchema,
> extends CommandCommon<F> {
  /**
   * The output's shape. The JSON document is this object with `schemaVersion`
   * and `kind` added in front, so it may not declare either key.
   */
  output: S
  /** The document's `kind`. Defaults to the command's path joined with `-`, or the app name at the root. */
  kind?: string
  /** The document's `schemaVersion`. Raise it when the output changes incompatibly. Defaults to 1. */
  schemaVersion?: number
  /**
   * For a command whose output is a list: the array field that
   * `--output jsonl` prints one line per element of, and the `kind` of each
   * line. Each element must be an object. Other fields of the output are not
   * printed under `jsonl`.
   */
  items?: { field: string; kind: string }
  /**
   * For a long-running command that reports as it goes: the shape of each
   * event `ctx.emit` sends and its `kind`. `text` renders one event for the
   * text form; without it, events print nothing in text mode.
   */
  events?: EventsSpec
  /** Compute the output. It writes nothing to stdout itself. Notes go through `ctx.note` and `ctx.warn`. */
  run(
    input: CommandInput<F, G>,
    ctx: CommandContext,
  ): CommandResult<z.input<S>> | Promise<CommandResult<z.input<S>>>
  /**
   * The text form of the output. Defaults to the output as indented JSON.
   * The returned string is written as is, so end it with a newline.
   */
  text?(output: z.input<S>, ctx: CommandContext): string
}

/**
 * The events a long-running data command sends with `ctx.emit`.
 * @experimental
 */
export interface EventsSpec {
  /** The shape of one event. It may not declare `schemaVersion` or `kind`. */
  schema: OutputSchema
  /** Each event's `kind`. */
  kind: string
  /** The text form of one event, written to stdout as it comes. End it with a newline. */
  text?(event: Record<string, unknown>): string
}

/**
 * A command that takes over the terminal or runs until stopped, such as a
 * terminal UI or a server. It has no JSON form: `--json` is refused with
 * exit 2.
 * @experimental
 */
export interface InteractiveCommandSpec<
  F extends FlagSpec,
  G extends FlagSpec,
> extends CommandCommon<F> {
  interactive: true
  /** Run, writing through `ctx.io`. Returns the exit code, or nothing for 0. */
  run(
    input: CommandInput<F, G>,
    ctx: CommandContext,
  ): ExitCode | undefined | void | Promise<ExitCode | undefined | void>
}

/**
 * A declared data command.
 * @experimental
 */
export interface DataCommand<
  F extends FlagSpec = FlagSpec,
  G extends FlagSpec = FlagSpec,
  S extends OutputSchema = OutputSchema,
> extends DataCommandSpec<F, G, S> {
  readonly type: 'command'
  readonly interactive?: false
}

/**
 * A declared interactive command.
 * @experimental
 */
export interface InteractiveCommand<
  F extends FlagSpec = FlagSpec,
  G extends FlagSpec = FlagSpec,
> extends InteractiveCommandSpec<F, G> {
  readonly type: 'command'
}

/**
 * Any declared command.
 * @experimental
 */
// oxlint-disable-next-line typescript/no-explicit-any -- the tree holds commands of every flag type
export type Command = DataCommand<any, any, any> | InteractiveCommand<any, any>

/**
 * What a group declares: a summary, its commands, and an optional default.
 * @experimental
 */
export interface GroupSpec {
  summary: string
  description?: string
  /** The commands under this word, keyed by the word that selects each. Key order is help order. */
  commands?: Readonly<Record<string, Node>>
  /** The command that runs when no subcommand is given. Its positionals take any word that names no subcommand. */
  default?: Command
  /** The help order of the commands. Names left out follow in key order. */
  order?: readonly string[]
  hidden?: boolean
}

/**
 * A declared group of commands.
 * @experimental
 */
export interface Group extends GroupSpec {
  readonly type: 'group'
  readonly commands: Readonly<Record<string, Node>>
}

/**
 * A node of the command tree.
 * @experimental
 */
export type Node = Command | Group

/**
 * The flags every command gets from the app, whatever it declares.
 * @experimental
 */
export const BUILTIN_FLAGS = {
  json: { kind: 'boolean', help: 'answer as one JSON document on stdout' },
  output: {
    kind: 'enum',
    choices: ['text', 'json', 'jsonl'],
    valueName: 'mode',
    help: 'text, json (the same as --json), or jsonl: one JSON object per line',
  },
  help: { kind: 'boolean', short: 'h', help: 'show help for this command' },
  all: {
    kind: 'boolean',
    help: 'with --help: every flag, the long description and the exit codes',
  },
} as const satisfies FlagSpec

/**
 * The builder functions, with the app's global flags typed into every command.
 * @experimental
 */
export interface CommandKit<G extends FlagSpec> {
  /** The global flags this kit was made with. */
  readonly globals: G
  /** Declare a data command. */
  command<S extends OutputSchema, F extends FlagSpec = Record<never, never>>(
    spec: DataCommandSpec<F, G, S>,
  ): DataCommand<F, G, S>
  /** Declare an interactive command. */
  command<F extends FlagSpec = Record<never, never>>(
    spec: InteractiveCommandSpec<F, G>,
  ): InteractiveCommand<F, G>
  /** Declare a group. */
  group(spec: GroupSpec): Group
}

const RESERVED_KEYS = ['schemaVersion', 'kind'] as const

/** The shared failure codes (`EXIT_FAILURE`), which a command may not give a meaning of its own. */
const RESERVED_EXIT_MIN = 22
const RESERVED_EXIT_MAX = 25

/**
 * Refuse a flag the app provides: a builtin name, `version`, or the `-h` short.
 * @internal
 */
export function checkFlags(flags: FlagSpec, what: string): void {
  for (const [key, decl] of Object.entries(flags)) {
    if (Object.hasOwn(BUILTIN_FLAGS, key) || key === 'version') {
      throw new Error(`${what} '${key}' is provided by the app; do not declare it`)
    }
    if (decl.short === 'h') {
      throw new Error(`${what} '${key}' takes -h, which is the app's short for --help`)
    }
  }
}

function checkReserved(schema: OutputSchema, what: string): void {
  const shape = schema.shape as Record<string, unknown> | undefined
  if (shape === undefined) throw new Error(`defineCommand: ${what} must be a z.object`)
  for (const key of RESERVED_KEYS) {
    if (Object.hasOwn(shape, key)) {
      throw new Error(`defineCommand: ${what} may not declare '${key}'; the app adds it`)
    }
  }
}

interface SchemaDef {
  type?: string
  options?: { def?: SchemaDef; shape?: unknown }[]
  left?: { def?: SchemaDef; shape?: unknown }
  right?: { def?: SchemaDef; shape?: unknown }
  in?: { def?: SchemaDef; shape?: unknown }
  getter?: () => { def?: SchemaDef; shape?: unknown }
}

/**
 * The object schemas an items element can be: itself, each option of a
 * union, both sides of an intersection, the input of a pipe, the target of a
 * lazy. Null when some branch is not an object, since a jsonl line adds
 * `schemaVersion` and `kind` to the element's own fields. A schema seen
 * before on this walk, as in a recursive lazy, adds nothing: it is already
 * being checked.
 */
function elementObjects(
  schema: { def?: SchemaDef; shape?: unknown } | undefined,
  seen = new Set<object>(),
): OutputSchema[] | null {
  if (schema === undefined) return null
  if (seen.has(schema)) return []
  seen.add(schema)
  if (schema.shape !== undefined) return [schema as OutputSchema]
  const def = schema.def ?? {}
  const all = (
    parts: ({ def?: SchemaDef; shape?: unknown } | undefined)[],
  ): OutputSchema[] | null => {
    const out: OutputSchema[] = []
    for (const part of parts) {
      const found = elementObjects(part, seen)
      if (found === null) return null
      out.push(...found)
    }
    return out
  }
  if (def.type === 'union') return all(def.options ?? [])
  if (def.type === 'intersection') return all([def.left, def.right])
  if (def.type === 'pipe') return elementObjects(def.in, seen)
  if (def.type === 'lazy') return elementObjects(def.getter?.(), seen)
  return null
}

function checkCommand(
  spec: CommandCommon<FlagSpec> & {
    output?: OutputSchema
    items?: { field: string; kind: string }
    events?: EventsSpec
  },
): void {
  if (spec.summary.trim() === '') throw new Error('defineCommand: summary is empty')
  checkFlags(spec.flags ?? {}, 'defineCommand: flag')
  for (const code of Object.keys(spec.exits ?? {}).map(Number)) {
    if (!(code === 1 || (Number.isInteger(code) && code >= 10 && code <= 63))) {
      throw new Error(`defineCommand: exit code ${code} must be 1 or in 10-63`)
    }
    if (code >= RESERVED_EXIT_MIN && code <= RESERVED_EXIT_MAX) {
      throw new Error(
        `defineCommand: exit code ${code} is one of the shared failure codes (22-25); pick another`,
      )
    }
  }
  if (spec.output !== undefined) {
    checkReserved(spec.output, 'output')
    if (spec.items !== undefined) {
      const shape = spec.output.shape as Record<
        string,
        { def?: { type?: string; element?: unknown } }
      >
      const field = Object.hasOwn(shape, spec.items.field) ? shape[spec.items.field] : undefined
      if (field?.def?.type !== 'array') {
        throw new Error(
          `defineCommand: items.field '${spec.items.field}' is not an array of the output`,
        )
      }
      // Each jsonl line is an element with `schemaVersion` and `kind` set by the app.
      const objects = elementObjects(field.def.element as { def?: SchemaDef; shape?: unknown })
      if (objects === null) {
        throw new Error(
          `defineCommand: items.field '${spec.items.field}' must hold objects, or unions of objects`,
        )
      }
      for (const element of objects) checkReserved(element, 'an items element')
    }
  }
  if (spec.events !== undefined) checkReserved(spec.events.schema, 'events.schema')
}

/**
 * The command builders for an app whose global flags are `globals`. Every
 * command made with the kit receives the parsed globals, typed, in
 * `input.globals`. Pass the same kit's globals to {@link defineApp}.
 * @experimental
 */
export function commandKit<G extends FlagSpec>(options: { globals: G }): CommandKit<G> {
  return {
    globals: options.globals,
    command(
      spec: DataCommandSpec<FlagSpec, G, OutputSchema> | InteractiveCommandSpec<FlagSpec, G>,
    ) {
      checkCommand(spec as Parameters<typeof checkCommand>[0])
      if ('interactive' in spec && spec.interactive === true) {
        return { ...spec, type: 'command' } as InteractiveCommand<FlagSpec, G>
      }
      if (!('output' in spec)) {
        throw new Error(
          'defineCommand: a command declares its output, or says interactive: true when it has none',
        )
      }
      return { ...spec, type: 'command' } as DataCommand<FlagSpec, G, OutputSchema>
    },
    group(spec) {
      if (spec.summary.trim() === '') throw new Error('defineGroup: summary is empty')
      return { ...spec, commands: spec.commands ?? {}, type: 'group' }
    },
  } as CommandKit<G>
}

const plain = commandKit({ globals: {} })

/**
 * Declare a data command with no global flags. See {@link commandKit} for an app with some.
 * @experimental
 */
export function defineCommand<S extends OutputSchema, F extends FlagSpec = Record<never, never>>(
  spec: DataCommandSpec<F, Record<never, never>, S>,
): DataCommand<F, Record<never, never>, S>
/**
 * Declare an interactive command with no global flags.
 * @experimental
 */
export function defineCommand<F extends FlagSpec = Record<never, never>>(
  spec: InteractiveCommandSpec<F, Record<never, never>>,
): InteractiveCommand<F, Record<never, never>>
export function defineCommand(
  spec:
    | DataCommandSpec<FlagSpec, Record<never, never>, OutputSchema>
    | InteractiveCommandSpec<FlagSpec, Record<never, never>>,
): Command {
  return plain.command(spec as never)
}

/**
 * Declare a group of commands.
 * @experimental
 */
export function defineGroup(spec: GroupSpec): Group {
  return plain.group(spec)
}

/**
 * Whether `node` is a group.
 * @experimental
 */
export function isGroup(node: Node): node is Group {
  return node.type === 'group'
}

/**
 * Whether `command` is interactive, with no JSON form.
 * @experimental
 */
// oxlint-disable-next-line typescript/no-explicit-any -- narrows the tree's Command union
export function isInteractive(command: Command): command is InteractiveCommand<any, any> {
  return 'interactive' in command && command.interactive === true
}
