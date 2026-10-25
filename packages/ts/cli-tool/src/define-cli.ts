/**
 * Declaring a CLI's flags, built on commander. Nothing writes to a process
 * stream, nothing calls `process.exit`, and a usage error comes back as a
 * value. Help renders from the same declaration
 * the parser reads, so the two cannot disagree.
 */

import { Command, CommanderError, Option } from 'commander'

import type { CliIo } from './io.ts'
import { DEFAULT_WIDTH, wrapText } from './wrap.ts'

/** What every flag declares. */
export interface FlagCommon {
  help: string
  short?: string
  /** Left out of the short help. `help({ all: true })` shows it. */
  hidden?: boolean
}

/** A flag that is present or absent. */
export interface BooleanFlag extends FlagCommon {
  kind: 'boolean'
  /**
   * Start true and spell the flag `--no-<name>`, for a default-on flag that
   * exists to opt out.
   */
  negatable?: boolean
}

/**
 * A flag with three states: `--exec` true, `--no-exec` false, absent
 * `undefined`. A boolean with a default cannot say "the command line did not
 * mention this", so a value from a configuration layer could never take
 * effect.
 */
export interface TristateFlag extends FlagCommon {
  kind: 'tristate'
  /** Help for the `--no-` form. Defaults to {@link FlagCommon.help}. */
  offHelp?: string
}

/** A flag taking one value. */
export interface StringFlag extends FlagCommon {
  kind: 'string'
  /** What the value is called in the help: `--config <path>`. */
  valueName?: string
  default?: string
  /** Refuse the run when it is absent. */
  required?: boolean
}

/** A flag taking one of a fixed set of values. */
export interface EnumFlag<C extends string = string> extends FlagCommon {
  kind: 'enum'
  valueName?: string
  choices: readonly C[]
  default?: C
  /** Refuse the run when it is absent. */
  required?: boolean
}

/** A flag taking several values: comma-joined, repeated, or both. */
export interface ListFlag extends FlagCommon {
  kind: 'list'
  valueName?: string
  /**
   * Omit it and an unmentioned flag parses to `undefined` rather than `[]`,
   * for the reason {@link TristateFlag} gives. Pass `[]` where empty is the
   * default.
   */
  default?: readonly string[]
  /** Split a single occurrence on commas (`--scope a,b`). On by default. */
  commaSeparated?: boolean
}

/** A flag counted by how many times it appears: `-vv`. */
export interface CountFlag extends FlagCommon {
  kind: 'count'
}

/**
 * The declaration of one flag, of any kind: boolean, tristate, string, enum,
 * list or count.
 */
export type FlagDecl = BooleanFlag | TristateFlag | StringFlag | EnumFlag | ListFlag | CountFlag

/**
 * The flags of a command line, keyed by the name each value is read under.
 */
export type FlagSpec = Record<string, FlagDecl>

/**
 * What one declaration parses to.
 *
 * A `default` or `required: true` makes the value certain. Commander fills in
 * a default and refuses a run that lacks a required flag, so neither reaches a
 * handler as `undefined`. Without either, the type must say the flag may be
 * absent. That is the purpose of {@link TristateFlag} and of a
 * {@link ListFlag} with no default.
 */
type FlagValue<D extends FlagDecl> = D extends BooleanFlag
  ? boolean
  : D extends TristateFlag
    ? boolean | undefined
    : D extends CountFlag
      ? number
      : D extends ListFlag
        ? D extends { default: readonly string[] }
          ? string[]
          : string[] | undefined
        : D extends EnumFlag<infer C>
          ? D extends { default: string } | { required: true }
            ? C
            : C | undefined
          : D extends { default: string } | { required: true }
            ? string
            : string | undefined

/**
 * The parsed values of a command line's flags, keyed like the declaration.
 */
export type FlagValues<F extends FlagSpec> = { [K in keyof F]: FlagValue<F[K]> }

/**
 * The declaration of one positional argument.
 */
export interface PositionalDecl {
  name: string
  help?: string
  /** Takes the rest of the command line. Only the last positional may. */
  variadic?: boolean
  required?: boolean
}

/**
 * The declaration of a command line: its name, summary, flags and positional
 * arguments.
 */
export interface CliDecl<F extends FlagSpec> {
  /** The binary's name, as it appears in help and error messages. */
  name: string
  /** One line under the usage banner. */
  summary: string
  flags: F
  positionals?: readonly PositionalDecl[]
  /** Text after the options list, such as examples and config-file locations. */
  epilogue?: string
  /**
   * Used instead of {@link epilogue} in the short help. Omit it and the short
   * help drops the epilogue.
   */
  shortEpilogue?: string
  /**
   * Let commander own `-h, --help`: it prints and the parse reports `help`.
   *
   * Set it false for a tool with two help tiers. Commander acts as soon as it
   * reads `--help`, so it can never see `--help --all` together. The
   * tool then declares `help` in `flags` and renders the tier itself.
   */
  autoHelp?: boolean
  /**
   * The width help is wrapped to. The epilogues are reflowed to it when the
   * help is rendered: lines that start at column 0 are prose and are filled
   * again, indented lines are kept as written (see `wrapText`). Default 80.
   */
  width?: number
}

/**
 * What parsing an argv gives: the values, a request for help that was already
 * written, or an error message.
 */
export type ParseResult<F extends FlagSpec> =
  | { status: 'ok'; values: FlagValues<F>; positionals: string[] }
  | { status: 'help' }
  | { status: 'error'; message: string }

/**
 * A declared command line: parse an argv into typed values, and render its
 * help and usage text.
 */
export interface Cli<F extends FlagSpec> {
  /**
   * Read `argv`: the arguments after the binary name, never `process.argv`.
   *
   * `help` means `--help` was asked for and already written to `io`. The
   * caller returns {@link EXIT.ok} without doing anything else. `error`
   * carries commander's own wording, with no prefix and no trailing newline,
   * so the caller decides how to present it.
   */
  parse(argv: readonly string[], io: CliIo): ParseResult<F>
  /**
   * The rendered help text, for a caller that wants to print it itself.
   *
   * `{ all: true }` is the complete tier: `hidden` flags appear and the full
   * epilogue is used.
   */
  help(options?: { all?: boolean }): string
}

/** `httpPort` → `http-port`. */
function kebab(name: string): string {
  return name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/**
 * Refuse a name whose long form starts with `no-`.
 *
 * Commander reads `--no-cache` as the negation of a `cache` option and files
 * the parsed value under `cache`, so a flag declared `noCache` would be
 * declared, rendered and parsed under three different keys and always read
 * back as its default. Spell the flag positively and use `negatable` or
 * `tristate` for the opt-out form.
 */
function assertNotNegated(name: string): void {
  if (kebab(name).startsWith('no-')) {
    throw new Error(
      `defineCli: flag '${name}' renders as '--${kebab(name)}', which commander reads as a ` +
        `negation. Declare it positively and use kind 'tristate', or 'boolean' with ` +
        `negatable: true, for the off form.`,
    )
  }
}

function optionFlags(name: string, decl: Exclude<FlagDecl, TristateFlag>): string {
  const long = kebab(name)
  const short = decl.short === undefined ? '' : `-${decl.short}, `
  if (decl.kind === 'boolean') return `${short}--${decl.negatable === true ? 'no-' : ''}${long}`
  if (decl.kind === 'count') return `${short}--${long}`
  const value = decl.valueName ?? 'value'
  return `${short}--${long} <${value}>`
}

/** A tristate becomes two options with no default on either. See {@link TristateFlag}. */
function buildOptions(name: string, decl: FlagDecl): Option[] {
  assertNotNegated(name)
  if (decl.kind === 'tristate') {
    const long = kebab(name)
    const short = decl.short === undefined ? '' : `-${decl.short}, `
    return [
      new Option(`${short}--${long}`, decl.help),
      new Option(`--no-${long}`, decl.offHelp ?? decl.help),
    ]
  }
  return [buildOption(name, decl)]
}

function buildOption(name: string, decl: Exclude<FlagDecl, TristateFlag>): Option {
  const option = new Option(optionFlags(name, decl), decl.help)
  switch (decl.kind) {
    case 'boolean':
      // No explicit default: commander renders "(default: false)" in the help
      // for every boolean that has one. `parse` fills the value in afterwards.
      return option
    case 'count':
      return option.argParser((_, previous: number | undefined) => (previous ?? 0) + 1)
    case 'enum': {
      const withChoices = option.choices([...decl.choices])
      if (decl.default !== undefined) return withChoices.default(decl.default)
      return decl.required === true ? withChoices.makeOptionMandatory(true) : withChoices
    }
    case 'list': {
      const split = decl.commaSeparated !== false
      // No `.default()`. Commander passes a custom argParser the option's
      // current value as `previous`, so a declared default would be present on
      // the first occurrence and be appended to rather than replaced. `parse`
      // fills the default in afterwards, where an explicitly given flag has
      // already won.
      return option.argParser((value: string, previous: string[] | undefined) => [
        ...(previous ?? []),
        ...(split ? value.split(',').map((part) => part.trim()) : [value]),
      ])
    }
    case 'string':
      return decl.required === true
        ? option.makeOptionMandatory(true)
        : decl.default === undefined
          ? option
          : option.default(decl.default)
  }
}

/**
 * Build a CLI from its declaration.
 *
 * The commander command is rebuilt on each `parse` call rather than kept. A
 * `Command` keeps parsed state, so a reused one leaks the previous run's
 * values into the next.
 */
export function defineCli<F extends FlagSpec>(decl: CliDecl<F>): Cli<F> {
  const build = (io: CliIo, all = true): Command => {
    const command = new Command(decl.name)
      .description(decl.summary)
      .exitOverride()
      // Commander tolerates excess arguments by default once a positional is
      // declared, which silently drops a mistyped flag value.
      .allowExcessArguments(false)
      .helpOption(decl.autoHelp === false ? false : '-h, --help', 'show this message')
      .configureOutput({
        writeOut: (text) => io.stdout(text),
        writeErr: (text) => io.stderr(text),
        // Left on, commander prints the message as well as throwing it.
        outputError: () => {},
      })
    const width = decl.width ?? DEFAULT_WIDTH
    command.configureHelp({ helpWidth: width })
    const epilogue = all ? decl.epilogue : decl.shortEpilogue
    if (epilogue !== undefined) command.addHelpText('after', `\n${wrapText(epilogue, width)}`)
    for (const [name, flag] of Object.entries(decl.flags)) {
      for (const option of buildOptions(name, flag)) {
        command.addOption(flag.hidden === true && !all ? option.hideHelp() : option)
      }
    }
    for (const positional of decl.positionals ?? []) {
      const inner = positional.variadic === true ? `${positional.name}...` : positional.name
      const wrapped = positional.required === true ? `<${inner}>` : `[${inner}]`
      command.argument(wrapped, positional.help ?? '')
    }
    return command
  }

  return {
    parse(argv, io) {
      const command = build(io)
      try {
        command.parse([...argv], { from: 'user' })
      } catch (err) {
        if (!(err instanceof CommanderError)) throw err
        // Commander has already written the help text.
        if (err.code.startsWith('commander.help')) return { status: 'help' }
        // Commander prefixes its messages with `error: `. The caller adds its
        // own prefix, and both together would read "tooly: error: unknown option".
        return { status: 'error', message: err.message.replace(/^error:\s*/, '') }
      }
      // Fill in the defaults `buildOption` deliberately withheld. A negatable
      // boolean is not among them: commander starts a lone `--no-x` at true.
      const values = command.opts() as Record<string, unknown>
      for (const [name, flag] of Object.entries(decl.flags)) {
        if (values[name] !== undefined) continue
        if (flag.kind === 'boolean') values[name] = false
        else if (flag.kind === 'count') values[name] = 0
        else if (flag.kind === 'list' && flag.default !== undefined) {
          values[name] = [...flag.default]
        }
      }
      return {
        status: 'ok',
        values: values as FlagValues<F>,
        positionals: command.args,
      }
    },
    help(options) {
      // `outputHelp`, not `helpInformation`. The latter renders only the
      // generated body and drops anything added with `addHelpText`, so the
      // epilogue would be missing from the string a caller prints after a
      // usage error.
      let text = ''
      build(
        {
          stdout: (chunk) => {
            text += chunk
          },
          stderr: () => {},
        },
        options?.all ?? true,
      ).outputHelp()
      return text
    },
  }
}
