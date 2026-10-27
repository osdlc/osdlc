/**
 * JSON Schema for a command's input and output, derived from its declaration.
 * Nothing here is written by hand, so the schema cannot drift from the parser
 * or the output contract.
 */

import { z } from 'zod'

import { kebab, type FlagDecl, type FlagSpec, type PositionalDecl } from '../define-cli.ts'
import { type DataCommand, type OutputSchema } from './define.ts'

/**
 * A JSON Schema document, as a plain object.
 * @experimental
 */
export type JsonSchema = Record<string, unknown>

/**
 * `httpPort` → `http-port`, as `defineCli` spells the flag.
 * @experimental
 */
export { kebab }

function flagSchema(name: string, decl: FlagDecl): JsonSchema {
  const cli: Record<string, unknown> = {
    flag:
      decl.kind === 'boolean' && decl.negatable === true
        ? `--no-${kebab(name)}`
        : `--${kebab(name)}`,
  }
  if (decl.short !== undefined) cli['short'] = `-${decl.short}`
  if (decl.kind === 'tristate') cli['off'] = `--no-${kebab(name)}`
  const base: JsonSchema = { description: decl.help, 'x-cli': cli }
  switch (decl.kind) {
    case 'boolean':
      return { ...base, type: 'boolean', default: decl.negatable === true }
    case 'tristate':
      return { ...base, type: 'boolean' }
    case 'count':
      return { ...base, type: 'integer', minimum: 0, default: 0 }
    case 'string':
      return {
        ...base,
        type: 'string',
        ...(decl.default !== undefined ? { default: decl.default } : {}),
      }
    case 'enum':
      return {
        ...base,
        type: 'string',
        enum: [...decl.choices],
        ...(decl.default !== undefined ? { default: decl.default } : {}),
      }
    case 'list':
      return {
        ...base,
        type: 'array',
        items: { type: 'string' },
        ...(decl.default !== undefined ? { default: [...decl.default] } : {}),
      }
  }
}

/**
 * The JSON Schema of a command line: one property per flag (its key, with
 * the spelling under `x-cli`) and one per positional (with its index under
 * `x-cli.positional`). The words after `--` are the `rest` property.
 * @experimental
 */
export function inputSchema(
  flags: FlagSpec,
  positionals: readonly PositionalDecl[] = [],
): JsonSchema {
  const properties: Record<string, JsonSchema> = {}
  const required: string[] = []
  for (const [name, decl] of Object.entries(flags)) {
    properties[name] = flagSchema(name, decl)
    if ((decl.kind === 'string' || decl.kind === 'enum') && decl.required === true) {
      required.push(name)
    }
  }
  positionals.forEach((p, index) => {
    const one: JsonSchema = { type: 'string' }
    properties[p.name] = {
      ...(p.variadic === true ? { type: 'array', items: one } : one),
      ...(p.help !== undefined ? { description: p.help } : {}),
      'x-cli': { positional: index, ...(p.variadic === true ? { variadic: true } : {}) },
    }
    if (p.required === true) required.push(p.name)
  })
  properties['rest'] = {
    type: 'array',
    items: { type: 'string' },
    description: 'words after --, passed through unparsed',
    'x-cli': { rest: true },
  }
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties,
    ...(required.length > 0 ? { required } : {}),
    additionalProperties: false,
  }
}

/**
 * The Zod schema of a data command's JSON document: its output with
 * `schemaVersion` and `kind` fixed in front.
 * @experimental
 */
export function documentZod(
  output: OutputSchema,
  kind: string,
  schemaVersion: number,
): z.ZodObject {
  return z
    .object({ schemaVersion: z.literal(schemaVersion), kind: z.literal(kind) })
    .extend(output.shape)
}

/**
 * The JSON Schema of the document a data command prints under `--json`.
 * @experimental
 */
export function documentSchema(command: DataCommand, kind: string): JsonSchema {
  return z.toJSONSchema(documentZod(command.output, kind, command.schemaVersion ?? 1), {
    io: 'input',
    unrepresentable: 'any',
  }) as JsonSchema
}
