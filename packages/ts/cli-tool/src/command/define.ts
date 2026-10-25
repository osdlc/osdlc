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
  /** The app's name and version. */
  app: { name: string; version: string }
  /** The words that selected this command, such as `['config', 'get']`. */
  path: readonly string[]
  /** Whether `--json` was given. */
  json: boolean
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
 * ({@link EXIT.error} unless given).
 * @experimental
 */
export class CommandError extends Error {
  readonly exit: ExitCode
  readonly hint: string | undefined
  constructor(message: string, options: { exit?: ExitCode; hint?: string } = {}) {
    super(message)
    this.name = 'CommandError'
    this.exit = options.exit ?? 1
    this.hint = options.hint
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
    super(message, { exit: 2 })
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
   * The command's own exit codes beyond 0, 1 and 2, with what each means:
   * `{ 10: 'nothing to do' }`. A code must be 1 or in 10-63.
   */
  exits?: Readonly<Record<number, string>>
  /** Command lines shown under `help --full`, without the leading app name. */
  examples?: readonly string[]
  /** Left out of help lists. It still runs and still has a schema. */
  hidden?: boolean
  /** True when the command changes nothing. A later MCP adapter exposes these by default. */
  readOnly?: boolean
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

function checkCommand(spec: CommandCommon<FlagSpec> & { output?: OutputSchema }): void {
  if (spec.summary.trim() === '') throw new Error('defineCommand: summary is empty')
  for (const key of Object.keys(spec.flags ?? {})) {
    if (key in BUILTIN_FLAGS || key === 'version') {
      throw new Error(`defineCommand: flag '${key}' is provided by the app; do not declare it`)
    }
  }
  for (const code of Object.keys(spec.exits ?? {}).map(Number)) {
    if (!(code === 1 || (Number.isInteger(code) && code >= 10 && code <= 63))) {
      throw new Error(`defineCommand: exit code ${code} must be 1 or in 10-63`)
    }
  }
  if (spec.output !== undefined) {
    const shape = spec.output.shape as Record<string, unknown> | undefined
    if (shape === undefined) throw new Error('defineCommand: output must be a z.object')
    for (const key of RESERVED_KEYS) {
      if (key in shape) {
        throw new Error(`defineCommand: output may not declare '${key}'; the app adds it`)
      }
    }
  }
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
      checkCommand(spec as CommandCommon<FlagSpec> & { output?: OutputSchema })
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
