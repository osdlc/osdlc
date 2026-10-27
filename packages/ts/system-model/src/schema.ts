/**
 * `@osdlc/system-model/schema`: JSON Schemas (draft 2020-12) for the shapes
 * this package prints as JSON: `Param`, `Task`, `RunnerReport`, `Catalog` and
 * `ToolInfo`, the JSON-safe part of a `ToolDef`.
 *
 * Each schema is a plain object, so a host can embed one in its own document
 * schema. Objects allow properties a schema does not list, so a reader built
 * on this version still accepts a later one that adds an optional field.
 *
 * The value lists of the enum-shaped fields (`ALL_ROLE_NAMES` and the rest)
 * are exported too, so a host that builds its own schema, such as with
 * `z.enum`, takes the values from here.
 *
 * Browser-safe: no Node built-in and no dependency.
 */

import { ALL_PROVIDER_KINDS } from './contract.ts'
import {
  ALL_CACHE_STATES,
  ALL_PARAMETERS_UNKNOWN_REASONS,
  ALL_STALE_REASONS,
  CATALOG_SCHEMA_VERSION,
} from './model.ts'
import { ALL_PROBE_COSTS, ALL_ROLE_NAMES } from './tool.ts'

export {
  ALL_CACHE_STATES,
  ALL_PARAMETERS_UNKNOWN_REASONS,
  ALL_PROBE_COSTS,
  ALL_PROVIDER_KINDS,
  ALL_ROLE_NAMES,
  ALL_STALE_REASONS,
  CATALOG_SCHEMA_VERSION,
}

/** A JSON Schema document, as a plain object. */
export type JsonSchema = Readonly<Record<string, unknown>>

const DRAFT = 'https://json-schema.org/draft/2020-12/schema'

const str = { type: 'string' } as const
const bool = { type: 'boolean' } as const
const strings = { type: 'array', items: str } as const
const oneOf = (...values: string[]) => ({ enum: values })

function object(
  properties: Record<string, unknown>,
  required: readonly string[],
  description?: string,
): JsonSchema {
  return {
    type: 'object',
    ...(description === undefined ? {} : { description }),
    properties,
    required: [...required],
  }
}

const binding: JsonSchema = {
  description: 'How a value reaches the command. Absent means positional.',
  oneOf: [
    object({ kind: { const: 'positional' } }, ['kind']),
    object({ kind: { const: 'flag' }, flag: str, key: str }, ['kind', 'flag']),
    object({ kind: { const: 'switch' }, flag: str }, ['kind', 'flag']),
    object({ kind: { const: 'assign' }, name: str }, ['kind']),
    object({ kind: { const: 'env' }, name: str }, ['kind', 'name']),
  ],
}

/** The JSON Schema of a `Param`. */
export const paramSchema: JsonSchema = {
  $schema: DRAFT,
  title: 'Param',
  ...object(
    {
      name: str,
      required: bool,
      variadic: bool,
      default: str,
      binding,
      doc: str,
      choices: strings,
    },
    ['name', 'required', 'variadic'],
    'A task parameter.',
  ),
}

const dependsOn = { ...strings, description: 'Ids of tasks in the same report that run first.' }

/** The JSON Schema of a `Task`. */
export const taskSchema: JsonSchema = {
  $schema: DRAFT,
  title: 'Task',
  ...object(
    {
      id: str,
      runner: str,
      path: strings,
      argv: { ...strings, minItems: 1 },
      cwd: str,
      display: str,
      parameters: { type: 'array', items: withoutDraft(paramSchema) },
      parametersUnknown: oneOf(...ALL_PARAMETERS_UNKNOWN_REASONS),
      source: str,
      origin: oneOf('declared', 'synthesized'),
      doc: str,
      detail: str,
      dependsOn,
      dependsOnUnresolved: strings,
      tags: strings,
      persistent: object({ value: bool, declared: bool }, ['value', 'declared']),
      executes: oneOf('local', 'remote', 'container'),
    },
    [
      'id',
      'runner',
      'path',
      'argv',
      'cwd',
      'display',
      'parameters',
      'source',
      'origin',
      'tags',
      'persistent',
      'executes',
    ],
    'One runnable command. `argv` runs; `display` is for showing.',
  ),
}

const chainSegment = object({ label: str, hint: str }, ['label', 'hint'])
const brand = object({ icon: str, color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' } }, [])

/** The JSON Schema of a `RunnerReport`. */
export const runnerReportSchema: JsonSchema = {
  $schema: DRAFT,
  title: 'RunnerReport',
  ...object(
    {
      runner: str,
      status: oneOf('absent', 'ok', 'error'),
      tasks: { type: 'array', items: withoutDraft(taskSchema) },
      diagnostics: {
        type: 'array',
        items: object({ severity: oneOf('info', 'warning', 'error'), message: str, source: str }, [
          'severity',
          'message',
        ]),
      },
      chain: { type: 'array', items: chainSegment },
      brand,
      tool: object({ binary: str, found: bool, path: str }, ['binary', 'found']),
      skippedForExec: bool,
    },
    ['runner', 'status', 'tasks', 'diagnostics', 'chain', 'skippedForExec'],
    "One runner's slice of a catalog.",
  ),
}

/** The JSON Schema of a `Catalog`. */
export const catalogSchema: JsonSchema = {
  $schema: DRAFT,
  title: 'Catalog',
  ...object(
    {
      kind: { const: 'catalog' },
      schemaVersion: { const: CATALOG_SCHEMA_VERSION },
      root: str,
      generatedAt: { type: 'string', format: 'date-time' },
      discovery: oneOf('git', 'walk'),
      allowExec: bool,
      reports: { type: 'array', items: withoutDraft(runnerReportSchema) },
    },
    ['kind', 'schemaVersion', 'root', 'generatedAt', 'discovery', 'allowExec', 'reports'],
    'Every runner report for one profile.',
  ),
}

/** The JSON Schema of a `ToolInfo`, the JSON-safe part of a `ToolDef`. */
export const toolInfoSchema: JsonSchema = {
  $schema: DRAFT,
  title: 'ToolInfo',
  ...object(
    {
      id: str,
      homepage: { type: 'string', format: 'uri' },
      description: str,
      brand,
      binary: str,
      commandWords: strings,
      ecosystem: str,
      markers: {
        type: 'array',
        items: object(
          {
            files: str,
            tier: oneOf('manifest', 'dependency', 'files', 'content'),
            workspaceRoot: bool,
          },
          ['files', 'tier'],
        ),
      },
      roles: {
        type: 'array',
        items: oneOf(...ALL_ROLE_NAMES),
      },
      runner: object(
        {
          kind: oneOf(...ALL_PROVIDER_KINDS),
          chain: { type: 'array', items: chainSegment },
          probe: object(
            { timeoutMs: { type: 'number', exclusiveMinimum: 0 }, cost: oneOf(...ALL_PROBE_COSTS) },
            [],
          ),
          watch: strings,
        },
        ['kind'],
      ),
    },
    ['id', 'markers', 'roles'],
    "A tool's data without its functions.",
  ),
}

/** A schema embedded in another one: the same object without its own `$schema`. */
function withoutDraft(schema: JsonSchema): JsonSchema {
  const { $schema: _, ...rest } = schema
  return rest
}
