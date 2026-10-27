/**
 * An app: a command tree with a name and a version. It routes a command line
 * to one command, parses it with `defineCli`, runs the command, and renders
 * the answer as text or as one JSON document. It adds `help`, `schema`,
 * `--help`, `--json` and `--version` to every tree.
 */

import { z } from 'zod'

import { closestMatches } from '@osdlc/config-layers/did-you-mean'

import { defineCli, type FlagSpec, type FlagValues } from '../define-cli.ts'
import { EXIT, type ExitCode } from '../exit.ts'
import { exitCodeFor, failureOf, renderError, renderFailure } from '../failure.ts'
import { colorEnabled, type CliContext } from '../io.ts'
import { safe } from '../safe.ts'
import { helpWidth } from '../wrap.ts'
import {
  BUILTIN_FLAGS,
  CommandError,
  UsageError,
  checkFlags,
  commandKit,
  isGroup,
  isInteractive,
  isOutcome,
  type Command,
  type CommandContext,
  type DataCommand,
  type Group,
  type Node,
  type OutputMode,
  type Surface,
} from './define.ts'
import { inputFromArgs } from './args.ts'
import {
  HelpEntrySchema,
  helpEntry,
  renderHelp,
  usageHint,
  type HelpEntry,
  type HelpScope,
  type Placed,
} from './help.ts'
import { errorDocument } from './error.ts'
import { documentSchema, documentZod, inputSchema, kebab, type JsonSchema } from './schema.ts'

/**
 * What an app declares.
 * @experimental
 */
export interface AppSpec<G extends FlagSpec> {
  /** The binary's name, as typed and as the prefix of every stderr line. */
  name: string
  /** The version `--version` prints: the `VERSION` that `cli-tool-stamp-version` writes. */
  version: string
  summary: string
  description?: string
  /** Flags every command takes, typed into `input.globals`. Use the same object as the {@link commandKit}. */
  globals?: G
  /** The top-level commands, or a group (such as one from `loadCommandTree`). */
  commands: Readonly<Record<string, Node>> | Group
  /** The command that runs when no command word is given. */
  default?: Command
  /**
   * Check each data command's output against its schema before printing it,
   * and fail the run when it does not match. For tests; off by default.
   */
  checkOutput?: boolean
}

/**
 * One entry of the `schema` document: a command's path and its input and output schemas.
 * @experimental
 */
export interface SchemaEntry {
  path: string[]
  command: string
  summary: string
  group: boolean
  interactive: boolean
  kind?: string
  schemaVersion?: number
  input?: JsonSchema
  output?: JsonSchema
  /** The command's long description, when it has one. */
  description?: string
  /** True when the command changes nothing. */
  readOnly?: boolean
  /** True when the command deletes or overwrites something that cannot be got back. */
  destructive?: boolean
  /** Who may call it: `all`, `cli-only`, or `by-input` when some inputs are `cli-only`. */
  exposure?: 'all' | 'cli-only' | 'by-input'
  /** For a list command: the field `--output jsonl` prints a line per element of, and each line's kind. */
  items?: { field: string; kind: string }
  /** For a command that sends events: their kind and the JSON Schema of one event line. */
  events?: { kind: string; schema: JsonSchema }
}

/**
 * How an adapter calls a command with {@link App.call}.
 * @experimental
 */
export interface CallOptions {
  /** The adapter calling. Commands read it as `ctx.surface`. */
  surface: Exclude<Surface, 'cli'>
  /** The app's global flags, fixed by the adapter when it started. A caller cannot set them. */
  globals?: Record<string, unknown>
  /** Aborted when the caller cancels. Commands read it as `ctx.signal`. */
  signal?: AbortSignal
  /** Receives each event line a command with `events` sends, as it is sent. */
  onEvent?(line: Record<string, unknown>): void
  /**
   * Run a `cli-only` command or input anyway. Only for a caller that has
   * confirmed with the person, such as the HTTP adapter's confirmation step.
   */
  allowCliOnly?: boolean
}

/**
 * What {@link App.call} gives.
 *
 * - `ok`: the command ran and answered with its document. `exit` may still be
 *   non-zero, as on the command line.
 * - `error`: the command failed or the arguments were wrong (`usage`, exit 2).
 * - `refused`: no such command, an interactive one, or a `cli-only` one.
 *
 * `stderr` holds the notes and warnings the command wrote.
 * @experimental
 */
export type CallResult =
  | { status: 'ok'; exit: number; document: Record<string, unknown>; stderr: string }
  | {
      status: 'error'
      exit: number
      /** The error document's `code`: `usage`, a failure kind, a `CommandError`'s code, or `error`. */
      code: string
      message: string
      hint?: string
      usage?: true
      stderr: string
    }
  | { status: 'refused'; reason: 'not-found' | 'interactive' | 'cli-only'; message: string }

/**
 * A declared app.
 * @experimental
 */
export interface App {
  readonly name: string
  readonly version: string
  readonly summary: string
  /** Run a command line (the words after the binary name). Returns the exit code. */
  run(argv: readonly string[], ctx: CliContext): Promise<number>
  /** {@link run} as a `MainFn`, for `runMain(app.main, { name })`. */
  readonly main: (argv: readonly string[], ctx: CliContext) => Promise<number>
  /**
   * Run the data command at `path` with `args`, one JSON object with a
   * property per flag and positional (see {@link argsSchema}), and return its
   * document. For adapters: nothing is written to the process streams, and a
   * command's `exposure` is enforced.
   */
  call(
    path: readonly string[],
    args: unknown,
    ctx: Omit<CliContext, 'io'>,
    options: CallOptions,
  ): Promise<CallResult>
  /** The JSON Schema of the `args` {@link call} takes for the command at `path`. */
  argsSchema(path: readonly string[]): JsonSchema
  /** The help for the node at `path`, as data. Throws for a path that names nothing. */
  help(path?: readonly string[], opts?: { depth?: number; full?: boolean }): HelpEntry
  /** The help for the node at `path`, as text wrapped to `width` (default 80). */
  helpText(
    path?: readonly string[],
    opts?: { depth?: number; full?: boolean; width?: number },
  ): string
  /** The `schema` entries for the node at `path` and every node under it. */
  schema(path?: readonly string[]): SchemaEntry[]
  /** The JSON Schema of the document the command at `path` prints under `--json`. */
  documentSchema(path: readonly string[]): JsonSchema
  /** The Zod schema of that document, to validate a parsed `--json` answer in a test. */
  documentContract(path: readonly string[]): z.ZodObject
  /** Every command path in the tree, depth first, the root (`[]`) first when it runs. */
  paths(): string[][]
}

const VERSION_FLAGS = {
  version: { kind: 'boolean', help: 'print the version and exit' },
} as const satisfies FlagSpec

function orderedChildren(group: Group): [string, Node][] {
  const entries = Object.entries(group.commands)
  const order = group.order ?? []
  const rank = (name: string): number => {
    const i = order.indexOf(name)
    return i === -1 ? order.length : i
  }
  return entries
    .map((e, i) => ({ e, i }))
    .sort((a, b) => rank(a.e[0]) - rank(b.e[0]) || a.i - b.i)
    .map(({ e }) => e)
}

function place(name: string, path: string[], node: Node): Placed {
  if (!isGroup(node)) {
    return {
      name,
      path,
      summary: node.summary,
      description: node.description,
      command: node,
      group: false,
      hidden: node.hidden === true,
      children: [],
    }
  }
  return {
    name,
    path,
    summary: node.summary,
    description: node.description,
    command: node.default,
    group: true,
    hidden: node.hidden === true,
    children: orderedChildren(node).map(([word, child]) => place(word, [...path, word], child)),
  }
}

function walk(node: Placed): Placed[] {
  return [node, ...node.children.flatMap(walk)]
}

/** The value-taking spellings of `flags`: `--dir`, `-C`. */
function valueTaking(flags: FlagSpec): Set<string> {
  const out = new Set<string>()
  for (const [name, decl] of Object.entries(flags)) {
    if (decl.kind === 'string' || decl.kind === 'enum' || decl.kind === 'list') {
      out.add(`--${kebab(name)}`)
      if (decl.short !== undefined) out.add(`-${decl.short}`)
    }
  }
  return out
}

/** The document kind of the command at `path`. */
function kindOf(command: DataCommand, path: readonly string[], appName: string): string {
  return command.kind ?? (path.length === 0 ? appName : path.join('-'))
}

/**
 * Declare an app over a command tree.
 * @experimental
 */
export function defineApp<G extends FlagSpec = Record<never, never>>(spec: AppSpec<G>): App {
  const globals: FlagSpec = spec.globals ?? {}
  const kit = commandKit({ globals })
  checkFlags(globals, 'defineApp: global flag')

  const userRoot: Group =
    'type' in spec.commands && (spec.commands as Group).type === 'group'
      ? (spec.commands as Group)
      : kit.group({ summary: spec.summary, commands: spec.commands as Record<string, Node> })
  const scope: HelpScope = {
    appName: spec.name,
    globals,
    rootFlags: VERSION_FLAGS,
    builtins: BUILTIN_FLAGS,
  }

  // `help` and `schema` are added unless the tree defines its own.
  const builtinCommands: Record<string, Node> = {}
  const placedRef: { root?: Placed } = {}

  const findPlaced = (path: readonly string[]): Placed | undefined => {
    let node = placedRef.root
    for (const word of path) node = node?.children.find((c) => c.name === word)
    return node
  }
  const mustFind = (path: readonly string[]): Placed => {
    const found = findPlaced(path)
    if (found === undefined) throw new UsageError(`no command '${path.join(' ')}'`)
    return found
  }

  const helpCommand = kit.command({
    summary: 'show help for a command, as text or JSON',
    description:
      'Lists the top-level commands, or the command the words name. --depth expands that many levels ' +
      'of subcommands, and --full adds the long description, hidden flags, exit codes and examples. ' +
      '--all is both, for the whole tree.',
    positionals: [
      { name: 'command', variadic: true, help: 'the words of a command, such as "config get"' },
    ],
    flags: {
      depth: {
        kind: 'string',
        valueName: 'n',
        help: 'levels of subcommands to expand, or "all" (default 1)',
      },
      full: {
        kind: 'boolean',
        help: 'include the long description, hidden flags, exit codes and examples',
      },
    },
    output: z.object({
      tool: z.object({ name: z.string(), version: z.string() }),
      help: HelpEntrySchema,
    }),
    kind: 'help',
    readOnly: true,
    run({ flags, positionals }) {
      let depth = 1
      if (flags.depth === 'all') depth = Number.POSITIVE_INFINITY
      else if (flags.depth !== undefined) {
        if (!/^\d+$/.test(flags.depth)) throw new UsageError('--depth needs a number or "all"')
        depth = Number(flags.depth)
      }
      const node = mustFind(positionals)
      return {
        tool: { name: spec.name, version: spec.version },
        help: helpEntry(node, scope, { depth, full: flags.full }),
      }
    },
    text(output, ctx) {
      return renderHelp(output.help, ctx.width, spec.name)
    },
  })

  const schemaEntries = (path: readonly string[]): SchemaEntry[] =>
    walk(mustFind(path)).map((node) => {
      const command = [spec.name, ...node.path].join(' ')
      const base: SchemaEntry = {
        path: [...node.path],
        command,
        summary: node.summary,
        group: node.group,
        interactive: node.command !== undefined && isInteractive(node.command),
      }
      if (node.command === undefined) return base
      const flags = { ...node.command.flags, ...globals, ...BUILTIN_FLAGS }
      base.input = inputSchema(flags, node.command.positionals)
      const c = node.command
      if (c.description !== undefined) base.description = c.description
      if (c.readOnly === true) base.readOnly = true
      if (c.destructive === true) base.destructive = true
      base.exposure =
        c.exposure === 'cli-only' ? 'cli-only' : c.exposureOf !== undefined ? 'by-input' : 'all'
      if (!isInteractive(c)) {
        const kind = kindOf(c, node.path, spec.name)
        const schemaVersion = c.schemaVersion ?? 1
        base.kind = kind
        base.schemaVersion = schemaVersion
        base.output = documentSchema(c, kind)
        if (c.items !== undefined) base.items = { ...c.items }
        if (c.events !== undefined) {
          base.events = {
            kind: c.events.kind,
            schema: z.toJSONSchema(documentZod(c.events.schema, c.events.kind, schemaVersion), {
              io: 'input',
              unrepresentable: 'any',
            }) as JsonSchema,
          }
        }
      }
      return base
    })

  const schemaCommand = kit.command({
    summary: "print each command's input and output JSON Schema",
    description:
      'Prints the command tree under the command the words name (the whole tree with none). Each ' +
      "entry has the command's input schema, built from its flags and arguments, and the JSON Schema " +
      'of the document it prints under --json. The text form is the same JSON.',
    positionals: [{ name: 'command', variadic: true, help: 'the words of a command' }],
    output: z.object({
      tool: z.object({ name: z.string(), version: z.string() }),
      commands: z.array(
        z.object({
          path: z.array(z.string()),
          command: z.string(),
          summary: z.string(),
          group: z.boolean(),
          interactive: z.boolean(),
          kind: z.string().optional(),
          schemaVersion: z.number().int().optional(),
          input: z.record(z.string(), z.unknown()).optional(),
          output: z.record(z.string(), z.unknown()).optional(),
          description: z.string().optional(),
          readOnly: z.boolean().optional(),
          destructive: z.boolean().optional(),
          exposure: z.enum(['all', 'cli-only', 'by-input']).optional(),
          items: z.object({ field: z.string(), kind: z.string() }).optional(),
          events: z
            .object({ kind: z.string(), schema: z.record(z.string(), z.unknown()) })
            .optional(),
        }),
      ),
    }),
    kind: 'schema',
    readOnly: true,
    run({ positionals }) {
      return {
        tool: { name: spec.name, version: spec.version },
        commands: schemaEntries(positionals),
      }
    },
  })

  if (!Object.hasOwn(userRoot.commands, 'help')) builtinCommands['help'] = helpCommand
  if (!Object.hasOwn(userRoot.commands, 'schema')) builtinCommands['schema'] = schemaCommand

  const root: Group = {
    ...userRoot,
    summary: spec.summary,
    ...(spec.description !== undefined ? { description: spec.description } : {}),
    ...(spec.default !== undefined ? { default: spec.default } : {}),
    commands: { ...userRoot.commands, ...builtinCommands },
  }
  placedRef.root = place(spec.name, [], root)
  const placedRoot = placedRef.root

  const globalShorts = new Set(Object.values(globals).flatMap((d) => d.short ?? []))
  // Check the whole tree once, so a bad declaration fails at start-up and in
  // tests, not when someone first types the command.
  for (const node of walk(placedRoot)) {
    if (node.summary.trim() === '') {
      throw new Error(`defineApp: '${[spec.name, ...node.path].join(' ')}' has no summary`)
    }
    if (node.command === undefined) continue
    for (const [key, decl] of Object.entries((node.command.flags ?? {}) as FlagSpec)) {
      const where = [spec.name, ...node.path].join(' ')
      if (Object.hasOwn(globals, key)) {
        throw new Error(`defineApp: '${where}' declares '${key}', which is a global flag`)
      }
      if (decl.short !== undefined && globalShorts.has(decl.short)) {
        throw new Error(`defineApp: '${where}' declares -${decl.short}, which a global flag takes`)
      }
    }
  }

  // The builtins count too: `--output json config get` routes like `--json`.
  const globalValueFlags = valueTaking({ ...globals, ...BUILTIN_FLAGS })

  /** Find the node the command line selects, and the words left for its parser. */
  const route = (argv: readonly string[]): { node: Placed; words: string[]; rest: string[] } => {
    const dash = argv.indexOf('--')
    const head = dash === -1 ? [...argv] : argv.slice(0, dash)
    const rest = dash === -1 ? [] : argv.slice(dash + 1)
    let node = placedRoot
    const kept: string[] = []
    let i = 0
    while (i < head.length) {
      // Global flags may come before the command word.
      let j = i
      while (j < head.length && head[j]!.startsWith('-')) {
        j += globalValueFlags.has(head[j]!) ? 2 : 1
      }
      const word = head[j]
      const child = word === undefined ? undefined : node.children.find((c) => c.name === word)
      if (child === undefined) break
      kept.push(...head.slice(i, j))
      node = child
      i = j + 1
    }
    return { node, words: [...kept, ...head.slice(i)], rest }
  }

  const run = async (argv: readonly string[], base: CliContext): Promise<number> => {
    const { node, words, rest: afterDash } = route(argv)
    const command = node.command
    const flags: FlagSpec = {
      ...command?.flags,
      ...globals,
      ...(node.path.length === 0 ? VERSION_FLAGS : {}),
      ...BUILTIN_FLAGS,
    }
    // The builtins are read from flag positions only, so `--name --help` gives
    // `--name` the value `--help` rather than asking for help.
    const scanned = scanWords(words, valueTaking(flags))
    const has = (word: string): boolean => scanned.flags.includes(word)
    const wantsHelp = has('--help') || has('-h')
    const wantsJson =
      has('--json') || scanned.values.get('--output') === 'json' || has('--output=json')
    const wantsJsonl = scanned.values.get('--output') === 'jsonl' || has('--output=jsonl')
    const width = helpWidth(base.terminal?.stdout === true ? base.terminal.columns : undefined)
    // How an error is reported: as read from the words, then as parsed.
    let errorMode: OutputMode = wantsJson ? 'json' : wantsJsonl ? 'jsonl' : 'text'
    /**
     * Report a failure: a line on stderr, and under `--json` or `jsonl` an
     * error document on stdout too, since that is where a caller reads data.
     */
    const fail = (code: string, message: string, exit: ExitCode, hint?: string): number => {
      base.io.stderr(`${renderError(message, spec.name)}${safe(hint ?? '')}`)
      if (errorMode !== 'text') {
        const doc = errorDocument(code, message, exit, hint)
        base.io.stdout(`${JSON.stringify(doc, null, errorMode === 'json' ? 2 : undefined)}\n`)
      }
      return exit
    }
    const usageFail = (message: string): number =>
      fail('usage', message, EXIT.usage, usageHint(helpEntry(node, scope, { depth: 0 }), spec.name))

    // A word that names no subcommand, where nothing takes a positional.
    const takesWords = (command?.positionals ?? []).length > 0
    const stray = scanned.operands[0]
    if (stray !== undefined && node.children.length > 0 && !takesWords) {
      const names = node.children.filter((c) => !c.hidden).map((c) => c.name)
      const close = closestMatches(stray, names)
      return usageFail(
        `unknown command '${[...node.path, stray].join(' ')}'${close.length > 0 ? `; did you mean ${close.join(', ')}?` : ''}`,
      )
    }
    if (wantsHelp) {
      const all = has('--all')
      return run(
        ['help', ...node.path, ...(all ? ['--all'] : []), ...(wantsJson ? ['--json'] : [])],
        base,
      )
    }
    if (node.path.length === 0 && has('--version')) {
      if (wantsJson) {
        base.io.stdout(
          `${JSON.stringify({ schemaVersion: 1, kind: 'version', name: spec.name, version: spec.version }, null, 2)}\n`,
        )
      } else base.io.stdout(`${spec.name} ${spec.version}\n`)
      return EXIT.ok
    }

    if (command === undefined) {
      // A group with no default: name a command.
      const message = `'${[spec.name, ...node.path].join(' ')}' needs a command`
      if (errorMode !== 'text') return usageFail(message)
      base.io.stderr(
        `${spec.name}: ${message}\n\n${renderHelp(helpEntry(node, scope), width, spec.name)}`,
      )
      return EXIT.usage
    }

    const cli = defineCli({
      name: [spec.name, ...node.path].join(' '),
      summary: node.summary,
      flags,
      positionals: [...(command.positionals ?? [])],
      autoHelp: false,
    })
    // A required positional still missing takes the next word after `--`, so
    // a value that starts with a dash can be given: `config set n -- -5`.
    const required = (command.positionals ?? []).filter((p) => p.required === true).length
    let parsed = cli.parse(words, base.io)
    let taken = 0
    while (
      parsed.status === 'error' &&
      parsed.message.startsWith('missing required argument') &&
      taken < Math.min(required, afterDash.length)
    ) {
      taken += 1
      parsed = cli.parse([...words, '--', ...afterDash.slice(0, taken)], base.io)
    }
    const rest = afterDash.slice(parsed.status === 'ok' ? taken : 0)
    if (parsed.status === 'help') return EXIT.ok
    if (parsed.status === 'error') return usageFail(parsed.message)
    const values = parsed.values as FlagValues<FlagSpec> & {
      json: boolean
      all: boolean
      output?: string
    }
    // `--all` modifies `--help` only. `help --all` is `help --depth all --full`.
    if (values.all && command !== helpCommand) {
      return usageFail('--all goes with --help: "--help --all"')
    }

    const both = values.json && values.output !== undefined && values.output !== 'json'
    if (both) return usageFail(`--json and --output ${values.output} ask for different forms`)
    const mode: OutputMode = values.json ? 'json' : ((values.output as OutputMode) ?? 'text')
    errorMode = mode
    const json = mode !== 'text'
    const own: Record<string, unknown> = {}
    const globalValues: Record<string, unknown> = {}
    for (const key of Object.keys(command.flags ?? {})) own[key] = values[key]
    for (const key of Object.keys(globals)) globalValues[key] = values[key]
    if (values.all) Object.assign(own, { depth: 'all', full: true })
    const commandName = [spec.name, ...node.path].join(' ')
    if (isInteractive(command) && json) {
      return usageFail(`'${commandName}' is interactive and has no JSON form`)
    }
    if (!isInteractive(command) && mode === 'jsonl') {
      if (command.items === undefined && command.events === undefined) {
        return usageFail(`'${commandName}' prints one document; use --json`)
      }
    }
    const ctx: CommandContext = {
      ...base,
      app,
      path: node.path,
      globals: globalValues,
      json,
      output: mode,
      surface: 'cli',
      signal: base.signal ?? new AbortController().signal,
      color: colorEnabled(base, { json }),
      width,
      warn: (message) => base.io.stderr(`${spec.name}: warning: ${safe(message)}\n`),
      note: (message) => base.io.stderr(`${spec.name}: ${safe(message)}\n`),
      emit: noEvents(commandName),
    }
    const input = { flags: own, globals: globalValues, positionals: parsed.positionals, rest }

    try {
      if (isInteractive(command)) return (await command.run(input as never, ctx)) ?? EXIT.ok
      const events = command.events
      if (events !== undefined) {
        ctx.emit = (event) => {
          const line = eventLine(command, event, commandName)
          if (mode === 'jsonl') base.io.stdout(`${JSON.stringify(line)}\n`)
          else if (mode === 'text' && events.text !== undefined) base.io.stdout(events.text(event))
        }
      }
      const { output, exit, doc } = await execute(command, node.path, input, ctx)
      if (mode === 'json') base.io.stdout(`${JSON.stringify(doc, null, 2)}\n`)
      else if (mode === 'jsonl') {
        if (command.items !== undefined) {
          const list = (output as Record<string, unknown>)[command.items.field] as unknown[]
          for (const item of list) {
            const line = envelope(item, doc.schemaVersion as number, command.items.kind)
            base.io.stdout(`${JSON.stringify(line)}\n`)
          }
        } else base.io.stdout(`${JSON.stringify(doc)}\n`)
      } else if (command.text !== undefined) base.io.stdout(command.text(output, ctx))
      else base.io.stdout(`${JSON.stringify(output, null, 2)}\n`)
      return exit
    } catch (err) {
      if (err instanceof UsageError) return usageFail(err.message)
      if (err instanceof CommandError) {
        return fail(err.code, err.message, err.exit, err.hint !== undefined ? `${err.hint}\n` : '')
      }
      const failure = failureOf(err)
      if (failure !== null) {
        base.io.stderr(renderFailure(failure, spec.name))
        if (errorMode !== 'text') {
          const doc = errorDocument(
            failure.kind,
            failure.message,
            exitCodeFor(failure),
            failure.hint,
          )
          base.io.stdout(`${JSON.stringify(doc, null, errorMode === 'json' ? 2 : undefined)}\n`)
        }
        return exitCodeFor(failure)
      }
      return fail('error', err instanceof Error ? err.message : String(err), EXIT.error)
    }
  }

  /** The event `ctx.emit` sends, as one line with the command's `schemaVersion` and the events' `kind`. */
  const eventLine = (
    command: DataCommand,
    event: Record<string, unknown>,
    name: string,
  ): Record<string, unknown> => {
    const events = command.events!
    const line = envelope(event, command.schemaVersion ?? 1, events.kind)
    if (spec.checkOutput === true) {
      const checked = documentZod(events.schema, events.kind, line.schemaVersion).safeParse(line)
      if (!checked.success) {
        throw new Error(`'${name}' event does not match its schema: ${checked.error.message}`)
      }
    }
    return line
  }

  /** Run a data command and build its document. Errors propagate. */
  const execute = async (
    command: DataCommand,
    path: readonly string[],
    input: unknown,
    ctx: CommandContext,
  ): Promise<{ output: unknown; exit: ExitCode; doc: Record<string, unknown> }> => {
    const result = await command.run(input as never, ctx)
    const output = isOutcome(result) ? result.output : result
    const exit = isOutcome(result) ? result.exit : EXIT.ok
    const kind = kindOf(command, path, spec.name)
    const doc = envelope(output, command.schemaVersion ?? 1, kind)
    if (spec.checkOutput === true) {
      const checked = documentZod(command.output, kind, doc.schemaVersion).safeParse(doc)
      if (!checked.success) {
        throw new Error(
          `'${[spec.name, ...path].join(' ')}' output does not match its schema: ${checked.error.message}`,
        )
      }
    }
    return { output, exit, doc }
  }

  const call = async (
    path: readonly string[],
    args: unknown,
    base: Omit<CliContext, 'io'>,
    options: CallOptions,
  ): Promise<CallResult> => {
    const node = findPlaced(path)
    const name = [spec.name, ...path].join(' ')
    const command = node?.command
    if (node === undefined || command === undefined) {
      return { status: 'refused', reason: 'not-found', message: `no command '${name}'` }
    }
    if (isInteractive(command)) {
      return { status: 'refused', reason: 'interactive', message: `'${name}' is interactive` }
    }
    const cliOnly = (): CallResult => ({
      status: 'refused',
      reason: 'cli-only',
      message: `'${name}' runs from the command line only`,
    })
    if (command.exposure === 'cli-only' && options.allowCliOnly !== true) return cliOnly()
    let stderr = ''
    const capture = (text: string): void => {
      stderr += text
    }
    // An adapter's caller may print these, so they are made safe as on the command line.
    const failed = (code: string, exit: number, message: string, hint?: string): CallResult => ({
      status: 'error',
      exit,
      code,
      message: safe(message),
      ...(hint !== undefined ? { hint: safe(hint) } : {}),
      stderr,
    })
    const usageFailed = (message: string): CallResult => ({
      status: 'error',
      exit: EXIT.usage,
      code: 'usage',
      message: safe(message),
      usage: true,
      stderr,
    })
    try {
      const own = inputFromArgs(command.flags ?? {}, command.positionals ?? [], args)
      const fixed = inputFromArgs(globals, [], stripUndefined(options.globals ?? {}))
      const input = { ...own, globals: fixed.flags }
      if (command.exposureOf?.(input as never) === 'cli-only' && options.allowCliOnly !== true) {
        return cliOnly()
      }
      // Only the directory and environment carry over: a call has no terminal.
      const ctx: CommandContext = {
        cwd: base.cwd,
        env: base.env,
        // Nothing an adapter runs may write to stdout: under MCP it is the protocol stream.
        io: { stdout: capture, stderr: capture },
        app,
        path: node.path,
        globals: input.globals,
        json: true,
        output: 'json',
        surface: options.surface,
        signal: options.signal ?? base.signal ?? new AbortController().signal,
        color: false,
        width: helpWidth(undefined),
        warn: (message) => capture(`${spec.name}: warning: ${safe(message)}\n`),
        note: (message) => capture(`${spec.name}: ${safe(message)}\n`),
        emit:
          command.events === undefined
            ? noEvents(name)
            : (event) => options.onEvent?.(eventLine(command, event, name)),
      }
      const { exit, doc } = await execute(command, node.path, input, ctx)
      return { status: 'ok', exit, document: doc, stderr }
    } catch (err) {
      if (err instanceof UsageError) return usageFailed(err.message)
      if (err instanceof CommandError) return failed(err.code, err.exit, err.message, err.hint)
      const failure = failureOf(err)
      if (failure !== null) {
        return failed(failure.kind, exitCodeFor(failure), failure.message, failure.hint)
      }
      return failed('error', EXIT.error, err instanceof Error ? err.message : String(err))
    }
  }

  const app: App = {
    name: spec.name,
    version: spec.version,
    summary: spec.summary,
    run,
    main: run,
    call,
    argsSchema(path) {
      const node = findPlaced(path)
      if (node?.command === undefined) throw new Error(`no command '${path.join(' ')}'`)
      return inputSchema(node.command.flags ?? {}, node.command.positionals)
    },
    help(path = [], opts = {}) {
      const node = findPlaced(path)
      if (node === undefined) throw new Error(`no command '${path.join(' ')}'`)
      return helpEntry(node, scope, opts)
    },
    helpText(path = [], opts = {}) {
      return renderHelp(this.help(path, opts), opts.width ?? 80, spec.name)
    },
    schema(path = []) {
      return schemaEntries(path)
    },
    documentSchema(path) {
      const node = findPlaced(path)
      if (node?.command === undefined || isInteractive(node.command)) {
        throw new Error(`'${[spec.name, ...path].join(' ')}' is not a data command`)
      }
      return documentSchema(node.command, kindOf(node.command, path, spec.name))
    },
    documentContract(path) {
      const node = findPlaced(path)
      if (node?.command === undefined || isInteractive(node.command)) {
        throw new Error(`'${[spec.name, ...path].join(' ')}' is not a data command`)
      }
      const kind = kindOf(node.command, path, spec.name)
      return documentZod(node.command.output, kind, node.command.schemaVersion ?? 1)
    },
    paths() {
      return walk(placedRoot)
        .filter((n) => n.command !== undefined)
        .map((n) => [...n.path])
    },
  }
  return app
}

/**
 * The words of a command line split into flags (with the value each
 * value-taking flag was given) and operands. The value after a value-taking
 * flag is neither.
 */
function scanWords(
  words: readonly string[],
  valueFlags: ReadonlySet<string>,
): { flags: string[]; values: Map<string, string>; operands: string[] } {
  const flags: string[] = []
  const values = new Map<string, string>()
  const operands: string[] = []
  for (let i = 0; i < words.length; i++) {
    const word = words[i]!
    if (!word.startsWith('-') || word === '-') {
      operands.push(word)
      continue
    }
    flags.push(word)
    if (valueFlags.has(word) && i + 1 < words.length) {
      values.set(word, words[i + 1]!)
      i += 1
    }
  }
  return { flags, values, operands }
}

/**
 * `fields` with `schemaVersion` and `kind` in front. They are set again after
 * the fields, so a field of the same name cannot replace them.
 */
function envelope(
  fields: unknown,
  schemaVersion: number,
  kind: string,
): Record<string, unknown> & { schemaVersion: number; kind: string } {
  return Object.assign({ schemaVersion, kind }, fields as object, { schemaVersion, kind })
}

function noEvents(name: string): (event: Record<string, unknown>) => void {
  return () => {
    throw new Error(`'${name}' declares no events; it cannot emit one`)
  }
}

function stripUndefined(values: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== undefined))
}
