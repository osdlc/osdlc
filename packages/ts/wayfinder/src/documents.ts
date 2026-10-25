/**
 * The JSON documents wayfinder prints, as Zod schemas. Each command declares
 * one as its output; `schema.ts` turns them into the JSON Schemas the
 * `./schema` entry exports. The task and report shapes come from
 * `@osdlc/system-model/schema`, so they cannot drift from the library.
 */

import { z } from 'zod'

import {
  CATALOG_SCHEMA_VERSION,
  catalogSchema,
  runnerReportSchema,
  taskSchema,
  type JsonSchema,
} from '@osdlc/system-model/schema'

/** A schema embedded in another one: without its own `$schema`. */
function embedded(schema: JsonSchema): z.ZodType {
  const { $schema: _, ...rest } = schema
  return z.fromJSONSchema(rest as never)
}

const catalogProperties = (catalogSchema as { properties: Record<string, JsonSchema> }).properties

/** A `Task` from system-model. */
export const TaskZ = embedded(taskSchema)
/** A `RunnerReport` from system-model. */
export const RunnerReportZ = embedded(runnerReportSchema)

/** One row group and the runners in it. */
export const GroupZ = z.object({
  id: z.enum(['tasks', 'dependencies', 'tools', 'hooks']),
  title: z.string(),
  runners: z.array(z.string()),
})

/** One runner's cache verdict. */
export const CacheStateZ = z.object({
  runner: z.string(),
  state: z.enum(['fresh', 'stale', 'miss']),
  reason: z.enum(['changed', 'max-age', 'excludes', 'exec', 'version', 'tool']).optional(),
  ageMs: z.number().optional().describe('Age of the stored probe. 0 when probed just now.'),
  estimateMs: z.number().nullable().describe('Expected refresh time. Null when never measured.'),
  slow: z.boolean(),
  cost: z.enum(['cheap', 'slow']).optional(),
  probeMs: z.number().optional().describe('How long the probe took, when it ran in this call.'),
})

/** One thing wayfinder could not know, with the label every surface shows. */
export const UnknownZ = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('withheld'),
    runner: z.string(),
    reason: z.enum(['untrusted', 'exec-off']),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('parameters'),
    runner: z.string(),
    reason: z.enum(['exec-withheld', 'tool-missing', 'tool-failed', 'not-read', 'editor-variable']),
    tasks: z.array(z.string()),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('stale'),
    runner: z.string(),
    reason: z.enum(['changed', 'max-age', 'excludes', 'exec', 'version', 'tool']).optional(),
    ageMs: z.number().optional(),
    label: z.string(),
  }),
  z.object({
    kind: z.literal('binary'),
    runner: z.string(),
    binary: z.string(),
    label: z.string(),
  }),
])

/** The filter a listing applied. Absent fields were not given. */
export const FilterZ = z.object({
  query: z.string().optional(),
  mode: z.enum(['fuzzy', 'exact']).optional(),
  servicesOnly: z.boolean().optional(),
  declaredOnly: z.boolean().optional(),
  maxDepth: z.number().int().optional(),
})

/** `way list --json`: the catalog with its groups, cache verdicts and unknowns. */
export const CatalogOutput = z.object({
  root: embedded(catalogProperties['root']!),
  generatedAt: embedded(catalogProperties['generatedAt']!),
  discovery: embedded(catalogProperties['discovery']!),
  allowExec: z.boolean(),
  reports: z.array(RunnerReportZ),
  groups: z.array(GroupZ),
  cache: z.array(CacheStateZ),
  unknowns: z.array(UnknownZ),
  filter: FilterZ,
})

/** The catalog document's `schemaVersion`: the catalog's own. */
export const CATALOG_DOCUMENT_VERSION = CATALOG_SCHEMA_VERSION

/** `way query --json`: the matching tasks, best first. */
export const QueryOutput = z.object({
  root: z.string(),
  filter: FilterZ,
  tasks: z.array(TaskZ),
  cache: z.array(CacheStateZ),
  unknowns: z.array(UnknownZ),
})

/** One registered tool. */
export const ProviderZ = z.object({
  id: z.string(),
  roles: z.array(z.enum(['runner', 'packageManager', 'toolManager', 'hookManager'])),
  kind: z.enum(['parse', 'exec']).nullable().describe("The runner role's kind; null with none."),
  binary: z.string().nullable(),
  onPath: z.boolean().nullable().describe('Whether binary is on the PATH; null with no binary.'),
  source: z.enum(['built-in', 'custom']),
  module: z.string().optional().describe('The module a custom tool came from.'),
})

/** `way providers --json`. */
export const ProvidersOutput = z.object({ providers: z.array(ProviderZ) })

/** `way run --json`: what ran, or with `--dry-run` what would run. */
export const RunOutput = z.object({
  task: z.string().describe('The task id.'),
  display: z.string(),
  argv: z.array(z.string()).min(1),
  cwd: z.string().describe('Absolute.'),
  env: z.record(z.string(), z.string()).describe('Variables the arguments set.'),
  ran: z.boolean(),
  exit: z.number().int().nullable().describe("The task's exit code; null when it did not run."),
  unknowns: z.array(UnknownZ),
})

export type CatalogDocumentBody = z.input<typeof CatalogOutput>
export type QueryDocumentBody = z.input<typeof QueryOutput>
export type ProvidersDocumentBody = z.input<typeof ProvidersOutput>
export type RunDocumentBody = z.input<typeof RunOutput>
