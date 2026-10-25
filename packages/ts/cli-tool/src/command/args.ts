/**
 * A command's input as one JSON object, for the adapters: each flag and each
 * positional is a property, named as the command declares it. The MCP and
 * HTTP adapters take this object instead of a command line, and it is checked
 * against the same declaration the parser reads.
 */

import type { FlagDecl, FlagSpec, PositionalDecl } from '../define-cli.ts'
import { UsageError } from './define.ts'

/** What {@link inputFromArgs} gives: the values a command's `run` receives. */
export interface ParsedArgs {
  flags: Record<string, unknown>
  positionals: string[]
  rest: string[]
}

const isStringArray = (v: unknown): v is string[] =>
  Array.isArray(v) && v.every((x) => typeof x === 'string')

function flagValue(name: string, decl: FlagDecl, value: unknown): unknown {
  const wrong = (what: string): never => {
    throw new UsageError(`'${name}' takes ${what}`)
  }
  switch (decl.kind) {
    case 'boolean':
      if (value === undefined) return decl.negatable === true
      return typeof value === 'boolean' ? value : wrong('true or false')
    case 'tristate':
      if (value === undefined) return undefined
      return typeof value === 'boolean' ? value : wrong('true or false')
    case 'count':
      if (value === undefined) return 0
      return Number.isInteger(value) && (value as number) >= 0 ? value : wrong('a whole number')
    case 'string':
      if (value === undefined) {
        if (decl.required === true) throw new UsageError(`'${name}' is required`)
        return decl.default
      }
      return typeof value === 'string' ? value : wrong('a string')
    case 'enum':
      if (value === undefined) {
        if (decl.required === true) throw new UsageError(`'${name}' is required`)
        return decl.default
      }
      return typeof value === 'string' && decl.choices.includes(value)
        ? value
        : wrong(`one of ${decl.choices.join(', ')}`)
    case 'list':
      if (value === undefined) return decl.default === undefined ? undefined : [...decl.default]
      return isStringArray(value) ? [...value] : wrong('an array of strings')
  }
}

/**
 * Check `args` against `flags` and `positionals` and return what `run`
 * receives. An unknown property, a wrong type or a missing required value is
 * a {@link UsageError}. Defaults apply as on the command line.
 */
export function inputFromArgs(
  flags: FlagSpec,
  positionals: readonly PositionalDecl[],
  args: unknown,
): ParsedArgs {
  if (args === undefined || args === null) args = {}
  if (typeof args !== 'object' || Array.isArray(args)) {
    throw new UsageError('the arguments must be a JSON object')
  }
  const given = args as Record<string, unknown>
  const known = new Set([...Object.keys(flags), ...positionals.map((p) => p.name), 'rest'])
  for (const key of Object.keys(given)) {
    if (!known.has(key)) throw new UsageError(`unknown argument '${key}'`)
  }
  const out: Record<string, unknown> = {}
  for (const [name, decl] of Object.entries(flags)) out[name] = flagValue(name, decl, given[name])

  const words: string[] = []
  let gap: string | undefined
  for (const p of positionals) {
    const value = given[p.name]
    if (
      value === undefined ||
      (p.variadic === true && isStringArray(value) && value.length === 0)
    ) {
      if (p.required === true) throw new UsageError(`'${p.name}' is required`)
      gap ??= p.name
      continue
    }
    // The command line has no way to skip a positional and give a later one.
    if (gap !== undefined) throw new UsageError(`'${p.name}' needs '${gap}' too`)
    if (p.variadic === true) {
      if (!isStringArray(value)) throw new UsageError(`'${p.name}' takes an array of strings`)
      words.push(...value)
    } else {
      if (typeof value !== 'string') throw new UsageError(`'${p.name}' takes a string`)
      words.push(value)
    }
  }

  const rest = given['rest']
  if (rest !== undefined && !isStringArray(rest)) {
    throw new UsageError(`'rest' takes an array of strings`)
  }
  return { flags: out, positionals: words, rest: rest ?? [] }
}
