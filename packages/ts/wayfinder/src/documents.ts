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
/** A `Catalog` from system-model: what a probe returns. */
export const CatalogZ = embedded(catalogSchema)

/** One row group and the runners in it. */
export const GroupZ = z.object({
  id: z.enum(['tasks', 'dependencies', 'tools', 'hooks', 'skills']),
  title: z.string(),
  runners: z.array(z.string()).describe('The runners whose reports fill it. Empty for skills.'),
})

/** One agent skill. Its text comes from files, so filter it before a terminal shows it. */
export const SkillZ = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  argumentHint: z.string().nullable().describe('What to type after /<name>.'),
  path: z.string().describe('The skill file: relative to the root inside it, else absolute.'),
  scope: z.string(),
  origin: z.string().describe('project, user, local, managed, or plugin:<id>.'),
  harnesses: z.array(z.string()).describe('The agents that read this skill file.'),
  invoke: z.string().describe('What the run action copies: /<name>.'),
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
    reason: z.enum(['untrusted', 'tool-untrusted', 'exec-off']),
    missing: z
      .array(z.string())
      .optional()
      .describe('The trust scopes the runner still needs: way trust --scope <id> for each.'),
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
  source: z
    .enum(['fresh', 'cached'])
    .describe(
      'fresh: every runner was probed in this call. cached: under --cached, the rows came from the last saved listing, which checks no files, or else from the stored probes, where cache[] says which runners were stale or probed now.',
    ),
  storedAt: z
    .string()
    .nullable()
    .describe(
      'With source cached, when the oldest stored rows were probed (ISO 8601). Null when fresh.',
    ),
  reports: z.array(RunnerReportZ),
  groups: z.array(GroupZ),
  skills: z
    .array(SkillZ)
    .describe('Agent skills, the Skills group. The skills setting chooses which.'),
  cache: z.array(CacheStateZ),
  unknowns: z.array(UnknownZ),
  trustedTools: z
    .array(z.string())
    .describe(
      'The tool ids trusted on their own here. Empty when the repository is trusted as a whole.',
    ),
  filter: FilterZ,
})

/**
 * One line `list --progress` sends while it probes, before the catalog
 * document: which runners have not answered, and the one that just did or
 * the agent skills.
 */
export const CatalogProgressOutput = z.object({
  pending: z.array(z.string()).describe('The runners that have not answered yet, in report order.'),
  total: z.number().int().describe('How many runners the probe reports.'),
  report: RunnerReportZ.optional().describe(
    'The runner that answered. Absent on the first line, which only names the runners, on the skills line, and when omitted is set.',
  ),
  omitted: z
    .string()
    .optional()
    .describe(
      'A runner that answered with a report too large for one line. Its rows come with the catalog document.',
    ),
  cache: CacheStateZ.optional().describe("The answered runner's cache verdict."),
  unknowns: z
    .array(UnknownZ)
    .optional()
    .describe('What could not be read about the answered runner.'),
  skills: z
    .array(SkillZ)
    .optional()
    .describe(
      'The agent skills, on a line of their own once they are read, filtered like the document. No line when there are none or they are too large for one; they come with the catalog document.',
    ),
})

/** The catalog document's `schemaVersion`: the catalog's own. */
export const CATALOG_DOCUMENT_VERSION = CATALOG_SCHEMA_VERSION

/** `way query --json`: the matching tasks, best first. */
export const QueryOutput = z.object({
  root: z.string(),
  filter: FilterZ,
  source: z
    .enum(['fresh', 'cached'])
    .describe(
      'fresh: every runner was probed in this call. cached: under --cached, the rows came from the last saved listing, which checks no files, or else from the stored probes, where cache[] says which runners were stale or probed now.',
    ),
  storedAt: z
    .string()
    .nullable()
    .describe(
      'With source cached, when the oldest stored rows were probed (ISO 8601). Null when fresh.',
    ),
  tasks: z.array(TaskZ),
  skills: z.array(SkillZ).describe('The matching agent skills, best first.'),
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
  homepage: z.string().nullable().describe("The tool's site, http or https only."),
  description: z.string().nullable(),
  ecosystem: z.string().nullable(),
  language: z.string().describe('The language label, or "any language".'),
})

/** `way providers --json`. */
export const ProvidersOutput = z.object({ providers: z.array(ProviderZ) })

/** `way run --json`: what ran, or with `--dry-run` what would run. */
export const RunOutput = z.object({
  task: z.string().describe('The task id.'),
  display: z.string(),
  argv: z.array(z.string()).min(1),
  command: z
    .string()
    .describe(
      'argv as one shell line, after a cd for a task with its own directory: what the text form prints.',
    ),
  cwd: z.string().describe('Absolute.'),
  env: z.record(z.string(), z.string()).describe('Variables the arguments set.'),
  ran: z.boolean(),
  exit: z.number().int().nullable().describe("The task's exit code; null when it did not run."),
  unknowns: z.array(UnknownZ),
})

export type CatalogDocumentBody = z.input<typeof CatalogOutput>
export type CatalogProgressBody = z.input<typeof CatalogProgressOutput>
export type QueryDocumentBody = z.input<typeof QueryOutput>
export type ProvidersDocumentBody = z.input<typeof ProvidersOutput>
export type RunDocumentBody = z.input<typeof RunOutput>
