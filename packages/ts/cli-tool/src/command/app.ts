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
import { exitCodeFor, failureOf, renderFailure } from '../failure.ts'
import { colorEnabled, type CliContext } from '../io.ts'
import { helpWidth } from '../wrap.ts'
import {
  BUILTIN_FLAGS,
  CommandError,
  UsageError,
  commandKit,
  isGroup,
  isInteractive,
  isOutcome,
  type Command,
  type CommandContext,
  type DataCommand,
  type Group,
  type Node,
} from './define.ts'
import {
  HelpEntrySchema,
  helpEntry,
  renderHelp,
  usageHint,
  type HelpEntry,
  type HelpScope,
  type Placed,
} from './help.ts'
import { documentSchema, documentZod, inputSchema, type JsonSchema } from './schema.ts'

/**
 * What an app declares.
 * @experimental
 */
export interface AppSpec<G extends FlagSpec> {
  /** The binary's name, as typed and as the prefix of every stderr line. */
  name: string
  /** The version `--version` prints. Usually read from package.json. */
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
}

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
      out.add(`--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`)
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
  for (const key of Object.keys(globals)) {
    if (key in BUILTIN_FLAGS || key === 'version') {
      throw new Error(`defineApp: global flag '${key}' is provided by the app; do not declare it`)
    }
  }

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
    run({ flags, positionals }, ctx) {
      const all = (ctx as CommandContext & { all?: boolean }).all === true
      let depth = 1
      if (all || flags.depth === 'all') depth = Number.POSITIVE_INFINITY
      else if (flags.depth !== undefined) {
        if (!/^\d+$/.test(flags.depth)) throw new UsageError('--depth needs a number or "all"')
        depth = Number(flags.depth)
      }
      const node = mustFind(positionals)
      return {
        tool: { name: spec.name, version: spec.version },
        help: helpEntry(node, scope, { depth, full: all || flags.full }),
      }
    },
    text(output, ctx) {
      return renderHelp(output.help as HelpEntry, ctx.width, spec.name)
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
      if (!isInteractive(node.command)) {
        const kind = kindOf(node.command, node.path, spec.name)
        base.kind = kind
        base.schemaVersion = node.command.schemaVersion ?? 1
        base.output = documentSchema(node.command, kind)
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

  if (!('help' in userRoot.commands)) builtinCommands['help'] = helpCommand
  if (!('schema' in userRoot.commands)) builtinCommands['schema'] = schemaCommand

  const root: Group = {
    ...userRoot,
    summary: spec.summary,
    ...(spec.description !== undefined ? { description: spec.description } : {}),
    ...(spec.default !== undefined ? { default: spec.default } : {}),
    commands: { ...userRoot.commands, ...builtinCommands },
  }
  placedRef.root = place(spec.name, [], root)
  const placedRoot = placedRef.root

  // Check the whole tree once, so a bad declaration fails at start-up and in
  // tests, not when someone first types the command.
  for (const node of walk(placedRoot)) {
    if (node.summary.trim() === '') {
      throw new Error(`defineApp: '${[spec.name, ...node.path].join(' ')}' has no summary`)
    }
    if (node.command === undefined) continue
    for (const key of Object.keys(node.command.flags ?? {})) {
      if (key in globals) {
        throw new Error(
          `defineApp: '${[spec.name, ...node.path].join(' ')}' declares '${key}', which is a global flag`,
        )
      }
    }
  }

  const globalValueFlags = valueTaking(globals)

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
    const { node, words, rest } = route(argv)
    const wantsHelp = words.includes('--help') || words.includes('-h')
    const wantsJson = words.includes('--json')
    const width = helpWidth(base.terminal?.stdout === true ? base.terminal.columns : undefined)
    const fail = (message: string, exit: ExitCode, hint?: string): number => {
      base.io.stderr(`${spec.name}: ${message}\n${hint ?? ''}`)
      return exit
    }
    const usageFail = (message: string): number =>
      fail(message, EXIT.usage, usageHint(helpEntry(node, scope, { depth: 0 }), spec.name))

    if (wantsHelp) {
      const all = words.includes('--all')
      return run(
        ['help', ...node.path, ...(all ? ['--all'] : []), ...(wantsJson ? ['--json'] : [])],
        base,
      )
    }
    if (node.path.length === 0 && words.includes('--version')) {
      if (wantsJson) {
        base.io.stdout(
          `${JSON.stringify({ schemaVersion: 1, kind: 'version', name: spec.name, version: spec.version }, null, 2)}\n`,
        )
      } else base.io.stdout(`${spec.name} ${spec.version}\n`)
      return EXIT.ok
    }

    const command = node.command
    if (command === undefined) {
      let k = 0
      while (k < words.length && words[k]!.startsWith('-')) {
        k += globalValueFlags.has(words[k]!) ? 2 : 1
      }
      const word = words[k]
      if (word !== undefined) {
        const names = node.children.filter((c) => !c.hidden).map((c) => c.name)
        const close = closestMatches(word, names)
        return usageFail(
          `unknown command '${[...node.path, word].join(' ')}'${close.length > 0 ? `; did you mean ${close.join(', ')}?` : ''}`,
        )
      }
      // A group with no default: name a command.
      base.io.stderr(renderHelp(helpEntry(node, scope), width, spec.name))
      return EXIT.usage
    }

    const flags: FlagSpec = {
      ...command.flags,
      ...globals,
      ...(node.path.length === 0 ? VERSION_FLAGS : {}),
      ...BUILTIN_FLAGS,
    }
    const cli = defineCli({
      name: [spec.name, ...node.path].join(' '),
      summary: node.summary,
      flags,
      positionals: [...(command.positionals ?? [])],
      autoHelp: false,
    })
    const parsed = cli.parse(words, base.io)
    if (parsed.status === 'help') return EXIT.ok
    if (parsed.status === 'error') return usageFail(parsed.message)
    const values = parsed.values as FlagValues<FlagSpec> & { json: boolean; all: boolean }
    // `help --all` reads it; anywhere else it only modifies `--help`.
    if (values.all && command !== helpCommand) {
      return usageFail('--all goes with --help: "--help --all"')
    }

    const json = values.json
    const own: Record<string, unknown> = {}
    const globalValues: Record<string, unknown> = {}
    for (const key of Object.keys(command.flags ?? {})) own[key] = values[key]
    for (const key of Object.keys(globals)) globalValues[key] = values[key]
    const ctx: CommandContext & { all: boolean } = {
      ...base,
      app: { name: spec.name, version: spec.version },
      path: node.path,
      json,
      color: colorEnabled(base, { json }),
      width,
      all: values.all,
      warn: (message) => base.io.stderr(`${spec.name}: warning: ${message}\n`),
      note: (message) => base.io.stderr(`${spec.name}: ${message}\n`),
    }
    const input = { flags: own, globals: globalValues, positionals: parsed.positionals, rest }

    try {
      if (isInteractive(command)) {
        if (json)
          return usageFail(
            `'${[spec.name, ...node.path].join(' ')}' is interactive and has no JSON form`,
          )
        return (await command.run(input as never, ctx)) ?? EXIT.ok
      }
      const result = await command.run(input as never, ctx)
      const output = isOutcome(result) ? result.output : result
      const exit = isOutcome(result) ? result.exit : EXIT.ok
      const kind = kindOf(command, node.path, spec.name)
      const doc = { schemaVersion: command.schemaVersion ?? 1, kind, ...(output as object) }
      if (spec.checkOutput === true) {
        const checked = documentZod(command.output, kind, doc.schemaVersion).safeParse(doc)
        if (!checked.success) {
          throw new Error(
            `'${[spec.name, ...node.path].join(' ')}' output does not match its schema: ${checked.error.message}`,
          )
        }
      }
      if (json) base.io.stdout(`${JSON.stringify(doc, null, 2)}\n`)
      else if (command.text !== undefined) base.io.stdout(command.text(output, ctx))
      else base.io.stdout(`${JSON.stringify(output, null, 2)}\n`)
      return exit
    } catch (err) {
      if (err instanceof UsageError) return usageFail(err.message)
      if (err instanceof CommandError) {
        return fail(err.message, err.exit, err.hint !== undefined ? `${err.hint}\n` : '')
      }
      const failure = failureOf(err)
      if (failure !== null) {
        base.io.stderr(renderFailure(failure, spec.name))
        return exitCodeFor(failure)
      }
      throw err
    }
  }

  return {
    name: spec.name,
    version: spec.version,
    summary: spec.summary,
    run,
    main: run,
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
}
