/**
 * Help, as data first. One {@link HelpEntry} per node of the tree, built from
 * the declarations, and one text renderer over it, so `help` and
 * `help --json` say the same things.
 */

import { z } from 'zod'

import type { FlagDecl, FlagSpec, PositionalDecl } from '../define-cli.ts'
import { EXIT } from '../exit.ts'
import { EXIT_FAILURE } from '../failure.ts'
import { columns, wrapText } from '../wrap.ts'
import { isInteractive, type Command } from './define.ts'
import { kebab } from './schema.ts'

/**
 * A node of the tree after the app has placed it.
 * @experimental
 */
export interface Placed {
  /** The selecting word, or the app name at the root. */
  name: string
  path: readonly string[]
  summary: string
  description: string | undefined
  /** The command that runs at this node: the command itself, or a group's default. */
  command: Command | undefined
  /** Whether the node is a group. */
  group: boolean
  hidden: boolean
  children: readonly Placed[]
}

/**
 * One flag, as help shows it.
 * @experimental
 */
export interface HelpFlag {
  name: string
  /** How it is typed: `-C, --dir <path>`. */
  spelling: string
  kind: FlagDecl['kind']
  help: string
  /** True for a flag every command of the app takes. */
  global: boolean
  hidden: boolean
  required: boolean
  choices?: string[]
  default?: unknown
}

/**
 * One positional argument, as help shows it.
 * @experimental
 */
export interface HelpPositional {
  name: string
  help: string
  required: boolean
  variadic: boolean
}

/**
 * One exit code and its meaning.
 * @experimental
 */
export interface HelpExit {
  code: number
  meaning: string
}

/**
 * One node of the command tree, as help shows it.
 * @experimental
 */
export interface HelpEntry {
  name: string
  path: string[]
  /** The full command: `tool config get`. */
  command: string
  summary: string
  group: boolean
  /** True when the node runs something: a command, or a group with a default. */
  runs: boolean
  interactive: boolean
  /** The usage line, for a node that runs. */
  usage?: string
  description?: string
  flags?: HelpFlag[]
  positionals?: HelpPositional[]
  exits?: HelpExit[]
  examples?: string[]
  /** The child nodes, when expanded. */
  commands?: HelpEntry[]
  /** How many child nodes there are when they are not expanded. */
  more?: number
}

/**
 * The Zod schema of {@link HelpEntry}.
 * @experimental
 */
export const HelpEntrySchema: z.ZodType<unknown> = z.lazy(() =>
  z.object({
    name: z.string(),
    path: z.array(z.string()),
    command: z.string(),
    summary: z.string(),
    group: z.boolean(),
    runs: z.boolean(),
    interactive: z.boolean(),
    usage: z.string().optional(),
    description: z.string().optional(),
    flags: z
      .array(
        z.object({
          name: z.string(),
          spelling: z.string(),
          kind: z.enum(['boolean', 'tristate', 'string', 'enum', 'list', 'count']),
          help: z.string(),
          global: z.boolean(),
          hidden: z.boolean(),
          required: z.boolean(),
          choices: z.array(z.string()).optional(),
          default: z.unknown().optional(),
        }),
      )
      .optional(),
    positionals: z
      .array(
        z.object({
          name: z.string(),
          help: z.string(),
          required: z.boolean(),
          variadic: z.boolean(),
        }),
      )
      .optional(),
    exits: z.array(z.object({ code: z.number().int(), meaning: z.string() })).optional(),
    examples: z.array(z.string()).optional(),
    commands: z.array(HelpEntrySchema).optional(),
    more: z.number().int().optional(),
  }),
)

/**
 * The exit codes every app has, in order.
 * @experimental
 */
export const UNIVERSAL_EXITS: readonly HelpExit[] = [
  { code: EXIT.ok, meaning: 'the command did what it was asked' },
  { code: EXIT.error, meaning: 'a well-formed command failed against the state it found' },
  { code: EXIT.usage, meaning: 'the command cannot run as typed; fix the command line' },
  { code: EXIT_FAILURE.missingTool, meaning: 'a program the run needs is not installed' },
  {
    code: EXIT_FAILURE.service,
    meaning: 'a service refused the caller or gave an unusable answer',
  },
  { code: EXIT_FAILURE.repository, meaning: 'there is no repository or remote to work on' },
  { code: EXIT_FAILURE.unreachable, meaning: 'a service could not be reached; try again later' },
]

function spelling(name: string, decl: FlagDecl): string {
  const short = decl.short === undefined ? '' : `-${decl.short}, `
  const long = kebab(name)
  switch (decl.kind) {
    case 'boolean':
      return `${short}--${decl.negatable === true ? 'no-' : ''}${long}`
    case 'tristate':
      return `${short}--${long}, --no-${long}`
    case 'count':
      return `${short}--${long}`
    default:
      return `${short}--${long} <${decl.valueName ?? 'value'}>`
  }
}

function helpFlags(flags: FlagSpec, global: boolean): HelpFlag[] {
  return Object.entries(flags).map(([name, decl]) => {
    const choices = decl.kind === 'enum' ? [...decl.choices] : undefined
    const def =
      decl.kind === 'string' || decl.kind === 'enum' || decl.kind === 'list'
        ? decl.default
        : undefined
    return {
      name,
      spelling: spelling(name, decl),
      kind: decl.kind,
      help: decl.help,
      global,
      hidden: decl.hidden === true,
      required: (decl.kind === 'string' || decl.kind === 'enum') && decl.required === true,
      ...(choices !== undefined ? { choices } : {}),
      ...(def !== undefined ? { default: def } : {}),
    }
  })
}

function positionalUsage(p: PositionalDecl): string {
  const inner = p.variadic === true ? `${p.name}...` : p.name
  return p.required === true ? `<${inner}>` : `[${inner}]`
}

/**
 * What {@link helpEntry} needs from the app.
 * @experimental
 */
export interface HelpScope {
  appName: string
  /** The app's global flags, shown on every command. */
  globals: FlagSpec
  /** The flags only the root takes, such as `--version`. */
  rootFlags: FlagSpec
  /** The flags every command takes: `--json`, `--help`, `--all`. */
  builtins: FlagSpec
}

/**
 * Options for how much of the tree {@link helpEntry} includes.
 * @experimental
 */
export interface HelpDepth {
  /** How many levels of child nodes to expand. 1 lists the children. Default 1. */
  depth?: number
  /** Include long descriptions, hidden flags and commands, exit codes and examples. */
  full?: boolean
}

/**
 * The help for `node`, expanded to `depth` levels.
 * @experimental
 */
export function helpEntry(node: Placed, scope: HelpScope, opts: HelpDepth = {}): HelpEntry {
  const depth = opts.depth ?? 1
  const full = opts.full === true
  const command = [scope.appName, ...node.path].join(' ')
  const runs = node.command !== undefined
  const entry: HelpEntry = {
    name: node.name,
    path: [...node.path],
    command,
    summary: node.summary,
    group: node.group,
    runs,
    interactive: node.command !== undefined && isInteractive(node.command),
  }
  const children = node.children.filter((c) => full || !c.hidden)
  const cmd = node.command
  const positionals = cmd?.positionals ?? []
  if (cmd !== undefined) {
    const sub = children.length > 0 ? ' [<command>]' : ''
    entry.usage = [command + sub, '[options]', ...positionals.map(positionalUsage)].join(' ')
    entry.positionals = positionals.map((p) => ({
      name: p.name,
      help: p.help ?? '',
      required: p.required === true,
      variadic: p.variadic === true,
    }))
  } else if (children.length > 0) {
    entry.usage = `${command} <command> [options]`
  }
  const flags = [
    ...helpFlags(cmd?.flags ?? {}, false),
    ...helpFlags(scope.globals, true),
    ...(node.path.length === 0 ? helpFlags(scope.rootFlags, true) : []),
    ...helpFlags(scope.builtins, true),
  ]
  entry.flags = full ? flags : flags.filter((f) => !f.hidden)
  if (full) {
    entry.exits = [
      ...UNIVERSAL_EXITS,
      ...Object.entries(cmd?.exits ?? {}).map(([code, meaning]) => ({
        code: Number(code),
        meaning,
      })),
    ]
    if (cmd?.examples !== undefined) {
      entry.examples = cmd.examples.map((e) => `${scope.appName} ${e}`)
    }
  }
  const description = node.description ?? node.command?.description
  if (full && description !== undefined) entry.description = description
  if (children.length > 0) {
    if (depth > 0)
      entry.commands = children.map((c) => helpEntry(c, scope, { depth: depth - 1, full }))
    else entry.more = children.length
  }
  return entry
}

function commandRows(
  entries: readonly HelpEntry[],
  indent: string,
): { term: string; text: string }[] {
  const rows: { term: string; text: string }[] = []
  for (const e of entries) {
    const more = e.more !== undefined ? ` (${e.more} command${e.more === 1 ? '' : 's'})` : ''
    rows.push({ term: `${indent}${e.name}`, text: e.summary + more })
    if (e.commands !== undefined) rows.push(...commandRows(e.commands, `${indent}  `))
  }
  return rows
}

/**
 * Render `entry` as help text, wrapped to `width`.
 * @experimental
 */
export function renderHelp(entry: HelpEntry, width: number, appName: string): string {
  const parts: string[] = [`${entry.command} — ${entry.summary}`]
  if (entry.usage !== undefined) parts.push(`usage: ${entry.usage}`)
  if (entry.description !== undefined) parts.push(wrapText(entry.description.trim(), width))
  if (entry.commands !== undefined && entry.commands.length > 0) {
    parts.push(`commands:\n${columns(commandRows(entry.commands, ''), width)}`)
  }
  if (entry.positionals !== undefined && entry.positionals.some((p) => p.help !== '')) {
    parts.push(
      `arguments:\n${columns(
        entry.positionals.map((p) => ({ term: p.name, text: p.help })),
        width,
      )}`,
    )
  }
  if (entry.flags !== undefined && entry.flags.length > 0) {
    const own = entry.flags.filter((f) => !f.global)
    const global = entry.flags.filter((f) => f.global)
    const row = (f: HelpFlag): { term: string; text: string } => {
      const extra = [
        f.choices !== undefined ? `one of ${f.choices.join(', ')}` : '',
        f.default !== undefined ? `default ${JSON.stringify(f.default)}` : '',
        f.required ? 'required' : '',
      ].filter(Boolean)
      return {
        term: f.spelling,
        text: extra.length > 0 ? `${f.help} (${extra.join('; ')})` : f.help,
      }
    }
    if (own.length > 0) parts.push(`options:\n${columns(own.map(row), width)}`)
    parts.push(`global options:\n${columns(global.map(row), width)}`)
  }
  if (entry.exits !== undefined) {
    parts.push(
      `exit codes:\n${columns(
        entry.exits.map((e) => ({ term: String(e.code), text: e.meaning })),
        width,
      )}`,
    )
  }
  if (entry.examples !== undefined && entry.examples.length > 0) {
    parts.push(`examples:\n${entry.examples.map((e) => `  ${e}`).join('\n')}`)
  }
  if (entry.description === undefined && entry.exits === undefined) {
    const target = [appName, 'help', ...entry.path].join(' ')
    parts.push(wrapText(`More: "${target} --all" shows every command, flag and exit code.`, width))
  }
  return `${parts.join('\n\n')}\n`
}

/**
 * The one-line usage hint printed under a usage error.
 * @experimental
 */
export function usageHint(entry: HelpEntry, appName: string): string {
  const target = [appName, 'help', ...entry.path].join(' ')
  return `${entry.usage !== undefined ? `usage: ${entry.usage}\n` : ''}See "${target}".\n`
}
