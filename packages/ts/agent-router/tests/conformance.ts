/**
 * Runs the agent-router conformance suite's cases against this package.
 *
 * The suite is `packages/conformance/agent-router/`, one file per section
 * (`packages/conformance/agent-router/constants.json` and so on), and this package is its
 * reference implementation. `conformance-write.ts` calls {@link run} to write
 * each case's `expect`, and `conformance.test.ts` calls it to check them, so
 * the two cannot drift.
 *
 * A catalogue in an input is `layers`: the string `snapshot` stands for the
 * shipped snapshot layer (the `snapshot_layer` section holds a copy, so the
 * Rust crate need not read this package's `src/`), any other string names a
 * case of the `named_layers` section, and an object is a literal layer.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { EFFORT_LEVELS } from '@osdlc/agent-call/models'

import { resolveBinding, type Binding } from '../src/binding.ts'
import { layerCatalogue } from '../src/catalogue/layers.ts'
import { deriveOfferings } from '../src/catalogue/offerings.ts'
import { queryCatalogue, type CatalogueQuery, type MappingPolicy } from '../src/catalogue/query.ts'
import { MachineCatalogueSchema, SnapshotLayerSchema } from '../src/catalogue/schema.ts'
import { SNAPSHOT_LAYER } from '../src/catalogue/snapshot.ts'
import type { CatalogueLayer } from '../src/catalogue/types.ts'
import { DEFAULT_CHAIN_ORDER, expandChain } from '../src/chains.ts'
import { BUILTIN_CLASSIFY_RULES, classify, parameterCount } from '../src/classify.ts'
import {
  AVAILABILITY_REASONS,
  checkContext,
  chooseFromProfile,
  PROFILE_SKIP_REASONS,
  skipReasonText,
  validateProfile,
  type AvailabilityReason,
  type Choice,
  type ChooseContext,
  type ContextCheck,
  type ProfileSkipReason,
} from '../src/choose.ts'
import { contextArgs, defaultWindow, formatSize, parseSize } from '../src/context.ts'
import { adjustEffort, effortAdjustedMessage } from '../src/effort.ts'
import { BUILTIN_PROFILES, parseProfile, parseProfiles, type Profile } from '../src/profile.ts'
import { formatRef, parseRef, type Ref, type Trait } from '../src/ref.ts'
import { resolveRef, type ResolveContext } from '../src/resolve.ts'
import {
  formatWhen,
  matchRule,
  parseRouting,
  ROUTING_KEYS,
  shadowedRules,
  type RouteRequest,
  type RoutingRule,
  type RoutingVocabulary,
  type RoutingWhen,
} from '../src/routing.ts'
import { checkRef, type CheckContext } from '../src/validity.ts'
import { expandWildcard } from '../src/wildcard.ts'

/** The suite's directory, by its path in the repository: `packages/conformance/agent-router/`. */
export const SUITE_DIR = join(import.meta.dirname, '../../../conformance/agent-router')

export interface Case {
  name: string
  input: Record<string, unknown>
  expect?: unknown
  error?: { kind: string }
  platforms?: string[]
  skip?: Record<string, string>
}

export interface Suite {
  family: string
  reference: string
  referenceVersion: string
  sections: Record<string, { description: string; cases: Case[] }>
}

/** One suite file: it holds one section, named as the file is. */
export interface SectionFile {
  /** The file's name without `.json`, which is also its section's name. */
  name: string
  path: string
  suite: Suite
}

/** The keys a case may set. */
export const CASE_KEYS = ['name', 'input', 'expect', 'error', 'platforms', 'skip']

/** Every section file of the suite, by section name. */
export function readSections(): Map<string, SectionFile> {
  const out = new Map<string, SectionFile>()
  for (const file of readdirSync(SUITE_DIR).filter((n) => n.endsWith('.json'))) {
    const path = join(SUITE_DIR, file)
    const name = file.slice(0, -'.json'.length)
    out.set(name, { name, path, suite: JSON.parse(readFileSync(path, 'utf8')) as Suite })
  }
  return out
}

// ---------------------------------------------------------------- catalogues

type LayerSpec = string | CatalogueLayer
type CatalogueInput = { layers: LayerSpec[]; policy?: MappingPolicy }

let namedLayers: Map<string, CatalogueLayer> | undefined

/** The layers the `named_layers` section holds, by case name. Their inputs are written by hand. */
function named(): Map<string, CatalogueLayer> {
  if (namedLayers === undefined) {
    const section = readSections().get('named_layers')
    if (section === undefined) throw new Error('the suite has no named_layers section')
    namedLayers = new Map(
      section.suite.sections['named_layers']!.cases.map((c) => [
        c.name,
        c.input['layer'] as CatalogueLayer,
      ]),
    )
  }
  return namedLayers
}

function layers(input: { layers: LayerSpec[] }): CatalogueLayer[] {
  return input.layers.map((l) => {
    if (typeof l !== 'string') return l
    if (l === 'snapshot') return SNAPSHOT_LAYER
    const layer = named().get(l)
    if (layer === undefined) throw new Error(`unknown named layer ${l}`)
    return layer
  })
}

function query(input: CatalogueInput): CatalogueQuery {
  return queryCatalogue(layerCatalogue(layers(input)), input.policy)
}

type QueryCase = {
  layers: LayerSpec[]
  policy?: MappingPolicy
  op: string
  args: unknown[]
}

function queryResult(input: QueryCase): unknown {
  const cq = query(input)
  const [a, b] = input.args as [string, string | undefined]
  const keyOf = (m: { key: string }) => m.key
  switch (input.op) {
    case 'tools':
      return cq.tools().map((t) => t.id)
    case 'knownTools':
      return cq.knownTools()
    case 'modelsFor':
      return cq.modelsFor(a).map(keyOf)
    case 'findModel': {
      const f = cq.findModel(a, b!)
      return f === undefined ? null : { model: f.model.key, native_name: f.offering.native_name }
    }
    case 'offering':
      return cq.offering(a, b!) ?? null
    case 'tierOf':
      return cq.tierOf(a)
    case 'tierModel':
      return cq.tierModel(a, b as 'fast') ?? null
    case 'pinned':
      return cq.pinned(a, b as 'fast')
    case 'effortsFor':
      return cq.effortsFor(a, b) ?? null
    default:
      throw new Error(`unknown query op ${input.op}`)
  }
}

function schemaAccepted(schema: { safeParse: (x: unknown) => { success: boolean } }) {
  return (input: { document: unknown }) => ({ accepted: schema.safeParse(input.document).success })
}

function plainCatalogueSummary(c: ReturnType<typeof layerCatalogue>) {
  return {
    tools: Object.keys(c.tools),
    providers: Object.keys(c.providers),
    models: Object.keys(c.models).length,
    offeringRows: c.offeringRows.length,
    problems: c.problems,
    warnings: c.warnings,
    fieldSources: Object.fromEntries(
      Object.entries(c.tools).map(([id, t]) => [
        id,
        [t.source, t.observed_at, Object.keys(t.fields).length],
      ]),
    ),
  }
}

// ----------------------------------------------------- resolve, walk, routing

/** What a reference resolves against: a catalogue plus `knownTools` and `strict`. */
type ResolveInput = CatalogueInput & { knownTools?: string[]; strict?: boolean }

function resolveContext(input: ResolveInput): ResolveContext {
  return {
    catalogue: query(input),
    ...(input.knownTools !== undefined ? { knownTools: input.knownTools } : {}),
    ...(input.strict !== undefined ? { strict: input.strict } : {}),
  }
}

/** The result of a parse that can fail on a shape: the zod message is not mirrored, so it is dropped. */
function withoutShapeMessage<T extends { ok: boolean }>(r: T): unknown {
  if (r.ok) return r
  const error = (r as unknown as { error: { kind: string } }).error
  if (error.kind !== 'invalid-shape') return r
  const { message: _message, ...rest } = error as { kind: string; message?: string }
  return { ok: false, error: rest }
}

/** What an availability callback answers for the entry whose text is the key; unlisted entries are available. */
type Scripted = Record<string, { reason: AvailabilityReason; detail?: string }>

function scripted(answers: Scripted | undefined, asked: string[]): ChooseContext['isAvailable'] {
  return (r) => {
    asked.push(r.text)
    const a = answers?.[r.text]
    return a === undefined ? { ok: true } : { ok: false, ...a }
  }
}

/** A `Choice` without the fields only the author rule sets (the Rust mirror has no author rule). */
function withoutAuthorFields(c: Choice): unknown {
  if (c.kind !== 'chosen') return c
  const { sameToolAsAuthor: _same, ...rest } = c
  return rest
}

function parsedProfile(config: unknown): Profile {
  const p = parseProfile(config)
  if (!p.ok) throw new Error(`suite profile does not parse: ${p.error.message}`)
  return p.value
}

function parsedProfiles(config: unknown): Record<string, Profile> {
  const p = parseProfiles(config)
  if (!p.ok) throw new Error(`suite profiles do not parse: ${p.error.message}`)
  return p.value
}

function parsedRef(text: string): Ref {
  const r = parseRef(text)
  if (!r.ok) throw new Error(`suite reference ${text} does not parse`)
  return r.value
}

type WalkCase = ResolveInput & {
  /** A profile in config form (`parseProfile` reads it). */
  profile: unknown
  /** What the availability callback answers, by entry text; an entry not listed is available. */
  availability?: Scripted
}

type BindingCase = ResolveInput & {
  /** A `profiles:` section; the built-in profiles are added (`parseProfiles`). */
  profiles: unknown
  binding: Binding
  availability?: Scripted
}

// ------------------------------------------------------------------ sections

/** Every section this implementation runs, with the function that gives a case's result. */
const RUNNERS: Record<string, (input: any) => unknown> = {
  ref_parse: (input: { text: string }) => {
    const r = parseRef(input.text)
    return r.ok
      ? { ok: true, ref: r.value, formatted: formatRef(r.value) }
      : { ok: false, error: r.error }
  },
  ref_format: (input: Ref) => formatRef(input),
  context_size: (input: { fn: 'parse' | 'format'; value: string | number }) =>
    input.fn === 'parse'
      ? (parseSize(input.value as string) ?? null)
      : formatSize(input.value as number),
  context_args: (input: { tool: string; model?: string; ctx: number; defaultContext?: number }) =>
    contextArgs(input.tool, input.model, input.ctx, input.defaultContext),
  context_default_window: (input: { layers: LayerSpec[]; tool: string; model?: string }) =>
    defaultWindow(query(input), input.tool, input.model) ?? null,
  context_check: (input: {
    layers: LayerSpec[]
    tool: string
    model?: string
    want?: number | 'max'
    required?: number
  }): ContextCheck =>
    checkContext(
      { tool: input.tool, model: input.model } as Parameters<typeof checkContext>[0],
      input.want,
      input.required,
      query(input),
    ),
  effort_adjust: (input: { effort: string; supported: string[] }) => {
    const result = adjustEffort(input.effort, input.supported)
    return {
      result: result ?? null,
      message: result?.adjusted === undefined ? null : effortAdjustedMessage(result.adjusted),
    }
  },
  validity_check_ref: (input: { layers: LayerSpec[]; ref: string; ctx?: CheckContext }) => {
    const ref = parseRef(input.ref)
    if (!ref.ok) throw new Error(`suite reference ${input.ref} does not parse`)
    return checkRef(ref.value, query(input), input.ctx)
  },
  catalogue_schema_snapshot: schemaAccepted(SnapshotLayerSchema),
  catalogue_schema_machine: schemaAccepted(MachineCatalogueSchema),
  catalogue_layers: (input: { layers: LayerSpec[]; summary?: boolean; strict?: boolean }) => {
    const c = layerCatalogue(layers(input), { strict: input.strict })
    return input.summary === true ? plainCatalogueSummary(c) : c
  },
  catalogue_offerings: (input: { layers: LayerSpec[]; lines?: boolean }) => {
    const offerings = deriveOfferings(layerCatalogue(layers(input)))
    return input.lines === true
      ? offerings.map(
          (o) =>
            `${o.tool} ${o.model} ${o.native_name}${o.via === undefined ? '' : ` via ${o.via}`}`,
        )
      : offerings
  },
  catalogue_query: queryResult,
  catalogue_classify: (
    input:
      | { fn: 'parameterCount'; id: string }
      | { fn: 'placements'; layers: LayerSpec[]; policy?: MappingPolicy },
  ) => {
    if (input.fn === 'parameterCount') return parameterCount(input.id) ?? null
    const c = layerCatalogue(layers(input))
    return classify(c, [...(input.policy?.classify ?? []), ...BUILTIN_CLASSIFY_RULES])
  },
  catalogue_chains: (input: {
    layers: LayerSpec[]
    policy?: MappingPolicy
    tier: 'fast'
    traits: Trait[]
  }) => expandChain(input.tier, input.traits, query(input)),
  wildcard_expand: (input: ResolveInput & { ref: string }) =>
    expandWildcard(parsedRef(input.ref), resolveContext(input)),
  profile_parse: (input: { value: unknown }) => withoutShapeMessage(parseProfile(input.value)),
  profile_parse_profiles: (input: { value: unknown }) =>
    withoutShapeMessage(parseProfiles(input.value)),
  walk_choose: (input: WalkCase) => {
    const profile = parsedProfile(input.profile)
    const ctx = resolveContext(input)
    const asked: string[] = []
    const choice = chooseFromProfile(profile, {
      ...ctx,
      isAvailable: scripted(input.availability, asked),
    })
    return { choice: withoutAuthorFields(choice), asked, errors: validateProfile(profile, ctx) }
  },
  walk_skip_reason_text: (input: { reason: ProfileSkipReason; detail?: string }) =>
    skipReasonText(input),
  resolve_resolve: (input: ResolveInput & { ref: string }) =>
    resolveRef(parsedRef(input.ref), resolveContext(input)),
  binding_resolve: (input: BindingCase) => {
    const asked: string[] = []
    const r = resolveBinding(input.binding, parsedProfiles(input.profiles), {
      ...resolveContext(input),
      isAvailable: scripted(input.availability, asked),
    })
    if (r.ok) return { ok: true, value: withoutAuthorFields(r.value) }
    if (r.error.kind === 'invalid-profile' && r.error.error.kind === 'invalid-shape') {
      return { ok: false, error: { kind: r.error.kind, error: { kind: 'invalid-shape' } } }
    }
    return r
  },
  routing_parse: (input: { value: unknown; vocabulary?: RoutingVocabulary }) =>
    withoutShapeMessage(parseRouting(input.value, input.vocabulary)),
  routing_match: (input: { rules: RoutingRule[]; request: RouteRequest }) =>
    matchRule(input.rules, input.request) ?? null,
  routing_shadow: (input: { rules: RoutingRule[] }) => shadowedRules(input.rules),
  routing_format_when: (input: { when: RoutingWhen }) => formatWhen(input.when),
  constants: () => ({
    effort_levels: EFFORT_LEVELS,
    default_chain_order: DEFAULT_CHAIN_ORDER,
    builtin_classify_rules: BUILTIN_CLASSIFY_RULES,
    builtin_profiles: BUILTIN_PROFILES,
    availability_reasons: AVAILABILITY_REASONS,
    profile_skip_reasons: PROFILE_SKIP_REASONS,
    routing_keys: ROUTING_KEYS,
  }),
  // A named layer's case holds the layer as its input; it is laid alone, and its problems are the result.
  named_layers: (input: { layer: CatalogueLayer }) => layerCatalogue([input.layer]).problems,
  // The shipped snapshot, which vectors name as the layer `snapshot`.
  snapshot_layer: () => SNAPSHOT_LAYER,
}

/** The sections this implementation runs. */
export const SECTION_NAMES = Object.keys(RUNNERS)

/**
 * What `section` gives for `input`, as JSON: `undefined` is dropped as a file
 * drops it, and no result at all is `null`.
 */
export function run(section: string, input: unknown): unknown {
  const runner = RUNNERS[section]
  if (runner === undefined) {
    throw new Error(`the suite has a section this implementation does not know: ${section}`)
  }
  return JSON.parse(JSON.stringify(runner(JSON.parse(JSON.stringify(input))) ?? null))
}
