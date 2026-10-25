/**
 * `@osdlc/wayfinder/schema`: JSON Schemas (draft 2020-12) for the documents
 * `way` prints with `--json`, keyed by each document's `kind`. Every document
 * is an object with `schemaVersion` and `kind` first. `way schema` prints the
 * same schemas with each command's input.
 *
 * The task, report and catalog shapes are `@osdlc/system-model/schema`'s,
 * re-exported here.
 */

import { z } from 'zod'

import {
  CATALOG_DOCUMENT_VERSION,
  CatalogOutput,
  ProvidersOutput,
  QueryOutput,
  RunOutput,
} from './documents.ts'

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

/** The `kind` of each document `way` prints. */
export type DocumentKind = 'catalog' | 'query' | 'providers' | 'run'

/** The `schemaVersion` of each document. Raised when a document changes incompatibly. */
export const DOCUMENT_VERSIONS: Readonly<Record<DocumentKind, number>> = {
  catalog: CATALOG_DOCUMENT_VERSION,
  query: 1,
  providers: 1,
  run: 1,
}

const OUTPUTS: Record<DocumentKind, z.ZodObject> = {
  catalog: CatalogOutput,
  query: QueryOutput,
  providers: ProvidersOutput,
  run: RunOutput,
}

/**
 * The Zod schema of a whole document: `schemaVersion` and `kind`, then the
 * command's output. The same envelope `@osdlc/cli-tool` prints.
 */
export function documentZod(kind: DocumentKind): z.ZodObject {
  return z
    .object({ schemaVersion: z.literal(DOCUMENT_VERSIONS[kind]), kind: z.literal(kind) })
    .extend(OUTPUTS[kind].shape)
}

function jsonSchema(kind: DocumentKind): JsonSchema {
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

/** Every document schema, by `kind`. */
export const DOCUMENT_SCHEMAS: Readonly<Record<DocumentKind, JsonSchema>> = {
  catalog: catalogDocumentSchema,
  query: queryDocumentSchema,
  providers: providersDocumentSchema,
  run: runDocumentSchema,
}
