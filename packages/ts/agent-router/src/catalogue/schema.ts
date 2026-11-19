import { EFFORT_LEVELS } from '@osdlc/agent-call/models'
import { z } from 'zod'

import { ChainsSchema, PinsSchema } from '../chains.ts'
import { ClassifyRuleSchema } from '../classify.ts'
import { deepFreeze } from '../freeze.ts'
import { protoSafeRecord as record } from '../record.ts'
import { isEffortLevel, TOOL_ID_PATTERN, TRAITS, unknownEffortMessage } from '../ref.ts'
import type { MappingPolicy } from './query.ts'
import { PROVIDER_KINDS, type CatalogueLayer } from './types.ts'

/** An environment variable name: `key_env` names the variable, never holds a key. */
export const KEY_ENV_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/

/**
 * A model id or a name a tool is handed (`--model <name>`): letters, digits and
 * `._:/-`, never starting with `-`, so no CLI reads it as a flag.
 */
export const NATIVE_NAME_PATTERN = /^[A-Za-z0-9._:/][A-Za-z0-9._:/-]*$/

/** `provider/id`; the id may itself hold `/` and `:` (`ollama/qwen3:4b`), as {@link NATIVE_NAME_PATTERN} allows. */
export const MODEL_KEY_PATTERN = new RegExp(
  `^[a-z][a-z0-9-]*\\/${NATIVE_NAME_PATTERN.source.slice(1)}`,
)

const IdSchema = z.string().regex(TOOL_ID_PATTERN, 'must be a lower-case identifier')
const ModelKeySchema = z.string().regex(MODEL_KEY_PATTERN, 'must be provider/id')
const NativeNameSchema = z
  .string()
  .regex(NATIVE_NAME_PATTERN, 'must be letters, digits and ._:/-, not starting with -')
/**
 * Efforts on agent-call's scale, the words a reference may name; an adapter translates each. The
 * `meta` enum carries the check into the generated JSON Schema, which cannot express a refine.
 */
const EffortsSchema = z.array(
  // A plain boolean, not a type guard: rows stay `string[]` for hosts that build them.
  z
    .string()
    .refine((e): boolean => isEffortLevel(e), {
      error: (issue) => unknownEffortMessage(String(issue.input)),
    })
    .meta({ enum: [...EFFORT_LEVELS] }),
)
/** A launch mode: whitespace-separated flags (`viaArgs`), at least one. */
const ViaSchema = z.string().regex(/\S/, 'must hold at least one flag')

const TakesSchema = z
  .discriminatedUnion('via', [
    z
      .object({ via: z.enum(['flag', 'config', 'suffix', 'bracket']), name: z.string().min(1) })
      .strict(),
    z.object({ via: z.literal('none') }).strict(),
  ])
  .describe(
    '`{via: flag|config|suffix|bracket, name}`, or `{via: none}` when the tool takes no such setting.',
  )

const ServesEntrySchema = z.union([
  IdSchema,
  z
    .object({
      provider: IdSchema,
      via: ViaSchema.describe(
        'The launch mode that reaches this provider, e.g. `--oss --local-provider ollama`.',
      ),
    })
    .strict(),
])

const ContextSchema = z
  .object({
    default: z
      .number()
      .int()
      .positive()
      .optional()
      .describe('Context size in tokens when nothing selects one.'),
    max: z.number().int().positive().optional().describe('Largest context size in tokens.'),
    variants: z
      .array(z.string().min(1))
      .optional()
      .describe('Named variants a tool selects, e.g. `1m`.'),
  })
  .strict()

/** The slots a headless template's arguments may hold, each filled as one whole argument. */
export const HEADLESS_SLOTS = deepFreeze(['{prompt}', '{model}', '{effort}'] as const)

/**
 * What is wrong with a headless template's slots, or `null`: a slot must be a
 * whole argument (never part of one), appear at most once, and `{prompt}`
 * appears exactly when the prompt travels in the arguments.
 */
export function headlessTemplateProblem(template: {
  args: readonly string[]
  prompt_via: 'argv' | 'stdin'
}): string | null {
  for (const [i, arg] of template.args.entries()) {
    const inside = HEADLESS_SLOTS.find((slot) => arg !== slot && arg.includes(slot))
    if (inside !== undefined) {
      return `args[${i}]: ${inside} must be a whole argument, not part of '${arg}'`
    }
  }
  for (const slot of HEADLESS_SLOTS) {
    if (template.args.filter((a) => a === slot).length > 1) return `${slot} appears more than once`
  }
  const prompt = template.args.includes('{prompt}')
  if (template.prompt_via === 'argv' && !prompt) return 'prompt_via: argv needs a {prompt} slot'
  if (template.prompt_via === 'stdin' && prompt) return 'prompt_via: stdin takes no {prompt} slot'
  return null
}

const HeadlessSchema = z
  .object({
    args: z
      .array(z.string())
      .min(1)
      .describe(
        'Arguments after the binary. `{prompt}`, `{model}` and `{effort}` are slots, each a whole argument.',
      ),
    prompt_via: z
      .enum(['argv', 'stdin'])
      .describe('Whether the prompt goes in the arguments or on stdin.'),
  })
  .strict()
  .superRefine((template, ctx) => {
    const problem = headlessTemplateProblem(template)
    if (problem !== null) ctx.addIssue({ code: 'custom', message: problem })
  })

/** Schema for a `CuratedOffer`. */
export const CuratedOfferSchema = z
  .object({
    model: ModelKeySchema,
    native_name: NativeNameSchema,
    efforts: EffortsSchema.optional(),
    context: ContextSchema.optional(),
  })
  .strict()

const toolFields = {
  serves: z
    .array(ServesEntrySchema)
    .optional()
    .describe(
      'Providers the tool reaches: a provider id, or `{provider, via}` when a launch mode is needed. Adds to the providers a lower layer lists.',
    ),
  openness: z
    .enum(['closed', 'curated', 'open'])
    .optional()
    .describe(
      '`closed`: one vendor; `curated`: the tool lists its own models (`offers`); `open`: any provider, models named `provider/id`.',
    ),
  modes: z
    .array(z.enum(['headless', 'interactive']))
    .optional()
    .describe('How the tool can run.'),
  model: TakesSchema.optional().describe('How the tool takes a model.'),
  effort: TakesSchema.optional().describe('How the tool takes a reasoning effort.'),
  context: TakesSchema.optional().describe('How the tool takes a context size.'),
  efforts: EffortsSchema.optional().describe(
    'The effort levels the tool can pass; `[]` when it takes none.',
  ),
  aliases: record(NativeNameSchema, ModelKeySchema)
    .optional()
    .describe(
      'The tool’s own model aliases: alias to model key (`opus: anthropic/claude-opus-5-5`).',
    ),
  prefer_alias: z
    .boolean()
    .optional()
    .describe('Hand the tool its alias for a model rather than the model id.'),
  provider_keys: z
    .boolean()
    .optional()
    .describe(
      'The tool calls each provider with that provider’s key (`key_env`, or credentials it stored), not through its own sign-in.',
    ),
  offers: z
    .array(CuratedOfferSchema)
    .optional()
    .describe('A curated tool’s own model list: `{model, native_name, efforts?, context?}`.'),
  headless: HeadlessSchema.optional().describe(
    'The headless launch template of a tool the host has no headless launcher for (a declared tool).',
  ),
}

const providerFields = {
  kind: z
    .enum(PROVIDER_KINDS)
    .optional()
    .describe('The API the provider speaks. Required for a provider the snapshot lacks.'),
  endpoint: z.url().optional().describe('Base URL of the API.'),
  key_env: z
    .string()
    .regex(KEY_ENV_PATTERN, 'must be an environment variable name, not a key')
    .optional()
    .describe('Name of the environment variable that holds the API key. Never the key itself.'),
}

/**
 * Schema for a `router.offerings` row: adds or replaces one tool and model combination, or removes
 * it with `remove: true`.
 */
export const OfferingRowSchema = z
  .object({
    tool: IdSchema.describe('The tool.'),
    model: ModelKeySchema.describe('The model key, `provider/id`.'),
    native_name: NativeNameSchema.optional().describe(
      'What the tool is given; derived when omitted.',
    ),
    via: ViaSchema.optional().describe('The launch mode this offering needs.'),
    efforts: EffortsSchema.optional().describe(
      'Effort levels on this tool, when they differ from the model’s.',
    ),
    context: ContextSchema.optional().describe(
      'Context sizes on this tool, when they differ from the model’s.',
    ),
    remove: z
      .boolean()
      .optional()
      .describe('Remove this tool and model combination instead of adding it.'),
  })
  .strict()

/**
 * The `router:` config block: the facts `providers`, `tools` and `offerings`;
 * the mapping policy `classify`, `chains` and `pins`; and `strict`, the
 * validity switch (`checkRef`). Strict at every level.
 */
export const RouterConfigSchema = z
  .object({
    providers: record(IdSchema, z.object(providerFields).strict())
      .optional()
      .describe('Providers to add or change: `{kind, endpoint, key_env}`.'),
    tools: record(IdSchema, z.object(toolFields).strict())
      .optional()
      .describe(
        'Tools to add or change. A field replaces the built-in one, except `serves`, which adds. A new tool needs `serves`, `openness` and `modes`, and runs as the command its id names, found on PATH: a declared tool is never run for `--version`, and is launched only in a trusted repository. A tool’s executable is not config: a built-in tool runs as the snapshot names it.',
      ),
    offerings: z
      .array(OfferingRowSchema)
      .optional()
      .describe('Rows that add one tool and model combination, or remove one (`remove: true`).'),
    strict: z
      .boolean()
      .optional()
      .describe(
        'Refuse a model the catalogue does not know, instead of warning. A deprecated model still only warns. Default false; CI should set it.',
      ),
    classify: z
      .array(ClassifyRuleSchema)
      .optional()
      .describe(
        'Classifier rules tried before the shipped ones; the first that matches a model places it in a tier, or `unclassified`.',
      ),
    chains: ChainsSchema.optional().describe('Category chain settings: `order`, the tool order.'),
    pins: PinsSchema.optional().describe(
      '`tool/tier` to the model that tier means on that tool (`claude/max: claude-opus-5-5`), held whatever the classifier picks.',
    ),
  })
  .strict()

/** The `router:` config block, as {@link RouterConfigSchema} parses it. */
export type RouterConfig = z.infer<typeof RouterConfigSchema>

/** The mapping policy of a `router:` block: its classifier rules, chain order and pins. */
export function mappingPolicy(router: RouterConfig | undefined): MappingPolicy {
  const policy: MappingPolicy = {}
  if (router?.classify !== undefined) policy.classify = structuredClone(router.classify)
  if (router?.chains?.order !== undefined) policy.order = [...router.chains.order]
  if (router?.pins !== undefined) policy.pins = { ...router.pins }
  return policy
}

const observed = { observed_at: z.iso.date().optional() }

/** A model row as a snapshot or machine catalogue layer states it. */
export const ModelRowSchema = z
  .object({
    aliases: z.array(NativeNameSchema).optional(),
    family: z.string().min(1).optional(),
    release_date: z.iso.date().optional(),
    context: ContextSchema.optional(),
    efforts: EffortsSchema.optional(),
    cost: z
      .object({ input: z.number().nonnegative(), output: z.number().nonnegative() })
      .strict()
      .optional(),
    traits: z.array(z.enum(TRAITS)).optional(),
    status: z.enum(['current', 'deprecated', 'withdrawn']).optional(),
    deprecated_on: z.string().min(1).optional(),
    ...observed,
  })
  .strict()

/** The shipped snapshot's shape: a whole layer, strict, so a regenerated file is checked too. */
export const SnapshotLayerSchema = z
  .object({
    source: z.literal('snapshot'),
    observed_at: z.iso.date(),
    tools: record(
      IdSchema,
      z
        .object({
          ...toolFields,
          binary: z
            .string()
            .min(1)
            .optional()
            .describe('The executable when it is not the tool id (`cursor-agent` for cursor).'),
          ...observed,
          checked_against: z.string().min(1).optional(),
          verify: z.array(z.string().min(1)).optional(),
        })
        .strict(),
    ),
    providers: record(IdSchema, z.object({ ...providerFields, ...observed }).strict()),
    models: record(ModelKeySchema, ModelRowSchema),
    offerings: z
      .array(OfferingRowSchema)
      .optional()
      .describe(
        'Hand-kept tool and model facts models.dev lacks: the context window a tool runs a model with.',
      ),
  })
  .strict()

/** The `router:` config block as a catalogue layer (`source: config`); `strict` and the mapping policy are not facts and stay out. */
export function configLayer(router: RouterConfig | undefined, observedAt: string): CatalogueLayer {
  const layer: CatalogueLayer = { source: 'config', observed_at: observedAt }
  if (router?.providers !== undefined) layer.providers = structuredClone(router.providers)
  if (router?.tools !== undefined) layer.tools = structuredClone(router.tools)
  if (router?.offerings !== undefined) layer.offerings = structuredClone(router.offerings)
  return layer
}

/** The format version of the machine catalogue file this build writes and reads. */
export const MACHINE_CATALOGUE_VERSION = 1

/**
 * One layer of the machine catalogue: what models.dev or one probe reported.
 * Probes add models or a curated tool's own list; models.dev adds models.
 */
const MachineLayerSchema = z
  .object({
    source: z.union([
      z.literal('models.dev'),
      z.templateLiteral(['probe:', z.string().regex(TOOL_ID_PATTERN)]),
    ]),
    observed_at: z.iso.date(),
    models: record(ModelKeySchema, ModelRowSchema).optional(),
    tools: record(IdSchema, z.object({ offers: z.array(CuratedOfferSchema) }).strict()).optional(),
  })
  .strict()

/**
 * Schema for the machine catalogue file, which every writer shares: a format version, the refresh
 * date, and one layer per source. It is laid over the shipped snapshot and under the config layers
 * when read.
 */
export const MachineCatalogueSchema = z
  .object({
    version: z.literal(MACHINE_CATALOGUE_VERSION),
    refreshed_at: z.iso.date(),
    layers: z.array(MachineLayerSchema),
  })
  .strict()

/** A machine catalogue file, as {@link MachineCatalogueSchema} parses it. */
export type MachineCatalogue = z.infer<typeof MachineCatalogueSchema>
/** One layer of a {@link MachineCatalogue}: what models.dev or one probe reported. */
export type MachineLayer = MachineCatalogue['layers'][number]
