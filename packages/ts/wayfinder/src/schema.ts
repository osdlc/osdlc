/**
 * `@osdlc/wayfinder/schema`: JSON Schemas (draft 2020-12) for every document
 * `way` prints with `--json`, keyed by each document's `kind`. Every document
 * is an object with `schemaVersion` and `kind` first. `way schema` prints the
 * same schemas with each command's input.
 *
 * The task, report and catalog shapes are `@osdlc/system-model/schema`'s,
 * re-exported here. Browser-safe: no Node built-in.
 */

import { z } from 'zod'

import { GENERATED_SCHEMAS, GENERATED_VERSIONS } from './document-schemas.generated.ts'
import { CatalogOutput, ProvidersOutput, QueryOutput, RunOutput } from './documents.ts'

export {
  CATALOG_SCHEMA_VERSION,
  catalogSchema,
  paramSchema,
  runnerReportSchema,
  taskSchema,
  toolInfoSchema,
} from '@osdlc/system-model/schema'

/** A JSON Schema document, as a plain object. */
export type JsonSchema = Readonly<Record<string, unknown>>

/**
 * The `kind` of each document `way` prints: `catalog` (`list`), `query`,
 * `run`, `providers`, `config-<name>` for each `config` subcommand, `trust`,
 * `guide`, `clean`, `help`, `schema`, `error` for a failure and `version`
 * for `--version`.
 */
export type DocumentKind = keyof typeof GENERATED_VERSIONS

/** Every {@link DocumentKind}. */
export const DOCUMENT_KINDS = Object.keys(GENERATED_VERSIONS) as readonly DocumentKind[]

/**
 * The `schemaVersion` of each document, as each command declares it. Raised
 * when a document changes incompatibly.
 */
export const DOCUMENT_VERSIONS: Readonly<Record<DocumentKind, number>> = GENERATED_VERSIONS

/** The documents wayfinder declares itself, as Zod. */
const OUTPUTS: Partial<Record<DocumentKind, z.ZodObject>> = {
  catalog: CatalogOutput,
  query: QueryOutput,
  providers: ProvidersOutput,
  run: RunOutput,
}

/**
 * The Zod schema of a whole document: `schemaVersion` and `kind`, then the
 * command's output. The same envelope `@osdlc/cli-tool` prints. A document
 * wayfinder does not declare itself is read from its JSON Schema.
 */
export function documentZod(kind: DocumentKind): z.ZodObject {
  const output = OUTPUTS[kind]
  if (output === undefined) {
    return z.fromJSONSchema(GENERATED_SCHEMAS[kind] as never) as unknown as z.ZodObject
  }
  return z
    .object({ schemaVersion: z.literal(DOCUMENT_VERSIONS[kind]), kind: z.literal(kind) })
    .extend(output.shape)
}

function jsonSchema(kind: DocumentKind): JsonSchema {
  const generated = GENERATED_SCHEMAS[kind]
  if (generated !== undefined) return generated
  return z.toJSONSchema(documentZod(kind), { io: 'input', unrepresentable: 'any' }) as JsonSchema
}

/** `way list --json`: the catalog with its groups, cache verdicts and unknowns. */
export const catalogDocumentSchema: JsonSchema = jsonSchema('catalog')
/** `way query --json`: the matching tasks, best first. */
export const queryDocumentSchema: JsonSchema = jsonSchema('query')
/** `way providers --json`: every registered tool. */
export const providersDocumentSchema: JsonSchema = jsonSchema('providers')
/** `way run --json`: what ran, or with `--dry-run` what would. */
export const runDocumentSchema: JsonSchema = jsonSchema('run')
/** `way trust --json`: what a grant, a removal, `--show` or `--list` found. */
export const trustDocumentSchema: JsonSchema = jsonSchema('trust')
/** `way clean --json`: what was removed, or with `--dry-run` what would be. */
export const cleanDocumentSchema: JsonSchema = jsonSchema('clean')

/** Every document schema, by `kind`. */
export const DOCUMENT_SCHEMAS: Readonly<Record<DocumentKind, JsonSchema>> = Object.fromEntries(
  DOCUMENT_KINDS.map((kind) => [kind, jsonSchema(kind)]),
) as Record<DocumentKind, JsonSchema>
