// The fixture vectors shared with the Rust twin (packages/rust/agent-router;
// see docs/planning/decisions/D-05). Each area is a function and a list of named inputs; the
// expected output is what this package computes, so the Rust crate is checked
// against the TypeScript behaviour. Files land in `fixtures/<area>/<name>.json`
// as arrays of `{ name, input, expected }`, plus `fixtures/manifest.json`.
//
// Regenerate with `node scripts/emit-fixtures.ts`; `node scripts/emit-fixtures.ts
// --check` fails when the committed files differ (`pnpm run check:extra`, the
// one drift gate).
//
// Inputs are plain JSON. A catalogue is `layers`: the string "snapshot" stands
// for the shipped snapshot layer, anything else is a literal layer.
import { layerCatalogue } from '../src/catalogue/layers.ts'
import { deriveOfferings } from '../src/catalogue/offerings.ts'
import { queryCatalogue, type CatalogueQuery, type MappingPolicy } from '../src/catalogue/query.ts'
import { MachineCatalogueSchema, SnapshotLayerSchema } from '../src/catalogue/schema.ts'
import { SNAPSHOT_LAYER } from '../src/catalogue/snapshot.ts'
import type { CatalogueLayer } from '../src/catalogue/types.ts'
import { DEFAULT_CHAIN_ORDER, expandChain } from '../src/chains.ts'
import { BUILTIN_CLASSIFY_RULES, classify, parameterCount } from '../src/classify.ts'
import { resolveBinding, type Binding } from '../src/binding.ts'
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
import { formatRef, parseRef, type Ref, type Trait } from '../src/ref.ts'
import { EFFORT_LEVELS } from '@osdlc/agent-call/models'
import { BUILTIN_PROFILES, parseProfile, parseProfiles, type Profile } from '../src/profile.ts'
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

export type Vector = { name: string; input: unknown; expected: unknown }
export type AreaVector = { name: string; input: unknown }
export type Area = {
  /** Path under `fixtures/`, without `.json`. */
  file: string
  /** What the vectors check; goes in the manifest. */
  description: string
  run: (input: any) => unknown
  vectors: AreaVector[]
}

type LayerSpec = string | CatalogueLayer

/** Layers named in a vector's `layers`, besides `snapshot`; written to `fixtures/layers.json`. */
const NAMED_LAYERS: Record<string, CatalogueLayer> = {}
type CatalogueInput = { layers: LayerSpec[]; policy?: MappingPolicy }

function layers(input: { layers: LayerSpec[] }): CatalogueLayer[] {
  return input.layers.map((l) => {
    if (typeof l !== 'string') return l
    if (l === 'snapshot') return SNAPSHOT_LAYER
    const named = NAMED_LAYERS[l]
    if (named === undefined) throw new Error(`unknown named layer ${l}`)
    return named
  })
}

function query(input: CatalogueInput): CatalogueQuery {
  return queryCatalogue(layerCatalogue(layers(input)), input.policy)
}

const v = (name: string, input: unknown): AreaVector => ({ name, input })

// ---------------------------------------------------------------- catalogues

/** A small catalogue with one of everything the validity, context and chain rules look at. */
const MINI_LAYER: CatalogueLayer = {
  source: 'snapshot',
  observed_at: '2026-10-01',
  providers: {
    anthropic: { kind: 'anthropic' },
    openai: { kind: 'openai' },
    ollama: { kind: 'ollama' },
  },
  tools: {
    alpha: {
      serves: ['anthropic'],
      openness: 'closed',
      modes: ['headless'],
      efforts: ['low', 'medium', 'high'],
      aliases: { big: 'anthropic/big-2' },
      prefer_alias: true,
    },
    beta: {
      serves: ['openai'],
      openness: 'closed',
      modes: ['headless'],
      efforts: ['medium', 'high'],
    },
    gamma: {
      serves: ['anthropic', 'ollama'],
      openness: 'open',
      modes: ['headless', 'interactive'],
      effort: { via: 'flag', name: '--effort' },
      efforts: [],
    },
    delta: {
      serves: ['anthropic'],
      openness: 'curated',
      modes: ['headless'],
      offers: [
        { model: 'anthropic/small-1', native_name: 'tiny', efforts: ['low'] },
        { model: 'anthropic/big-2', native_name: 'large', context: { default: 100000 } },
      ],
    },
  },
  models: {
    'anthropic/big-2': {
      family: 'claude-opus',
      release_date: '2026-05-01',
      context: { default: 200000, max: 1000000 },
      efforts: ['low', 'medium', 'high'],
      traits: ['agent', 'reasoning', 'long-context'],
    },
    'anthropic/big-1': {
      family: 'claude-opus',
      release_date: '2026-01-01',
      traits: ['agent'],
      status: 'deprecated',
      deprecated_on: '2026-09-01',
    },
    'anthropic/small-1': { family: 'claude-haiku', release_date: '2026-03-01', traits: ['agent'] },
    'anthropic/mid-1': { family: 'claude-sonnet', release_date: '2026-04-01', traits: ['agent'] },
    'anthropic/gone-1': { family: 'claude-sonnet', traits: ['agent'], status: 'withdrawn' },
    'anthropic/embed-1': {
      family: 'claude-haiku',
      release_date: '2026-06-01',
      traits: ['embedding'],
    },
    'anthropic/plain-1': { family: 'claude-haiku', release_date: '2026-02-01' },
    'openai/gpt-x': { family: 'gpt-sol', traits: ['agent'] },
    'ollama/qwen3:4b': { traits: ['agent', 'local'] },
    'ollama/llama3:70b': { traits: ['agent', 'local'] },
    'ollama/nomic:1b': { traits: ['embedding', 'local'] },
  },
  offerings: [
    // alpha runs big-2 at 200k, though the model reaches 1m elsewhere.
    { tool: 'alpha', model: 'anthropic/big-2', context: { default: 200000, max: 200000 } },
  ],
}

/** Three image-output models in the fast/standard family: one without tool calling, one that calls tools, and one embedding model. */
const IMAGE_LAYER: CatalogueLayer = {
  source: 'config',
  observed_at: '2026-10-09',
  models: {
    'google/test-image': {
      family: 'gemini-flash',
      release_date: '2026-10-08',
      traits: ['vision', 'image-out'],
      status: 'current',
    },
    'google/test-image-agent': {
      family: 'gemini-flash',
      release_date: '2026-10-07',
      traits: ['agent', 'image-out'],
      status: 'current',
    },
    'google/test-image-embed': {
      family: 'gemini-flash',
      release_date: '2026-10-06',
      traits: ['embedding', 'image-out'],
      status: 'current',
    },
  },
}
NAMED_LAYERS['image'] = IMAGE_LAYER

const SNAP: LayerSpec = 'snapshot'
const IMAGE: LayerSpec = 'image'
const MINI: LayerSpec = 'mini'
const MINI_CONFIG: LayerSpec = 'mini-config'

// A config layer over the mini catalogue: adds a provider, serves, an offering row, removes one.
const MINI_CONFIG_LAYER: CatalogueLayer = {
  source: 'config',
  observed_at: '2026-10-20',
  providers: {
    corp: {
      kind: 'openai-compatible',
      endpoint: 'https://llm.corp.example/v1',
      key_env: 'CORP_KEY',
    },
  },
  tools: {
    gamma: { serves: ['corp', { provider: 'ollama', via: '--oss' }], prefer_alias: false },
    epsilon: {
      serves: ['corp'],
      openness: 'open',
      modes: ['headless'],
      headless: { args: ['-p', '{prompt}'], prompt_via: 'argv' },
    },
  },
  models: { 'corp/house-1': { family: 'house', traits: ['agent'], observed_at: '2026-10-19' } },
  offerings: [
    { tool: 'beta', model: 'anthropic/small-1', native_name: 'borrowed' },
    { tool: 'alpha', model: 'anthropic/plain-1', remove: true },
    { tool: 'zeta', model: 'anthropic/mid-1' },
  ],
}

NAMED_LAYERS.mini = MINI_LAYER
NAMED_LAYERS['mini-config'] = MINI_CONFIG_LAYER

// ---------------------------------------------------------------- reference

const PARSE_TEXTS: [string, string][] = [
  // The README's reference table.
  ['table-tool-only', 'claude'],
  ['table-tool-tier', 'claude/max'],
  ['table-family', 'claude/opus'],
  ['table-exact-model', 'claude/opus-5.5'],
  ['table-model-effort', 'claude/opus-5.5@high'],
  ['table-tool-effort', 'claude@high'],
  ['table-local-model', 'pi/qwen2.5-coder:7b'],
  ['table-provider-model', 'pi/ollama/qwen2.5-coder:7b'],
  ['table-ctx-effort', 'claude/opus[ctx=1m]@high'],
  ['table-tier-ctx-max', 'claude/max[ctx=max]'],
  ['table-wildcard-tier', '*/fast'],
  ['table-wildcard-trait', '*/fast[local]'],
  ['trait-vision', 'claude/fast[vision]'],
  ['trait-image-out', 'claude/standard[image-out]'],
  ['wildcard-image-out', '*/standard[image-out]'],
  ['wildcard-vision-and-image-out', '*/standard[vision,image-out]'],
  // Parsing rules.
  ['model-keeps-punctuation', 'claude/opus;v2'],
  ['model-holds-two-ats', 'foo/bar@v1@high'],
  ['tier-with-trait', 'claude/fast[local]'],
  ['tier-with-ctx-and-traits-sorted', 'claude/standard[reasoning,agent,ctx=200k]@low'],
  ['ctx-decimal-k', 'claude/opus[ctx=500k]'],
  ['ctx-two-m', 'claude/opus[ctx=2m]'],
  ['ctx-not-whole-m', 'claude/opus[ctx=1500k]'],
  ['wildcard-all-traits', '*/max[local,agent,embedding,reasoning,long-context]'],
  ['model-with-slash-and-colon', 'opencode/ollama/qwen3:4b@high'],
  ['tool-with-digits-and-hyphen', 'cursor-agent2/max'],
  // Typed errors.
  ['err-empty', ''],
  ['err-whitespace-space', 'claude/opus high'],
  ['err-whitespace-tab', 'claude\t'],
  ['err-whitespace-nbsp', 'claude/opus '],
  ['err-empty-tool', '/opus'],
  ['err-empty-tool-effort', '@high'],
  ['err-invalid-tool-case', 'Claude/max'],
  ['err-invalid-tool-leading-digit', '1claude'],
  ['err-invalid-tool-underscore', 'my_tool/max'],
  ['err-empty-model', 'claude/'],
  ['err-empty-effort', 'claude/opus@'],
  ['err-empty-effort-after-qualifiers', 'claude/max[ctx=1m]@'],
  ['err-bare-wildcard', '*'],
  ['err-wildcard-model-name', '*/opus'],
  ['err-wildcard-empty-model', '*/'],
  ['err-traits-need-tier-model', 'claude/opus[local]'],
  ['err-traits-need-tier-tool', 'claude[local]'],
  ['err-native-bracket-size', 'claude/opus[1m]'],
  ['err-native-bracket-digits', 'claude/opus[200]'],
  ['err-native-bracket-context-key', 'cursor/opus[context=1m]'],
  ['err-unknown-trait', 'claude/fast[nosuch]'],
  ['err-unknown-qualifier-key', 'claude/opus[effort=high]'],
  ['err-empty-qualifier-group', 'claude/opus[]'],
  ['err-empty-qualifier-item', 'claude/fast[local,]'],
  ['err-duplicate-trait', 'claude/fast[local,local]'],
  ['err-duplicate-ctx', 'claude/opus[ctx=1m,ctx=2m]'],
  ['err-bad-ctx-unit', 'claude/opus[ctx=1g]'],
  ['err-bad-ctx-decimal', 'claude/opus[ctx=1.5m]'],
  ['err-bad-ctx-leading-zero', 'claude/opus[ctx=01m]'],
  ['err-bad-ctx-uppercase', 'claude/opus[ctx=1M]'],
  ['err-close-without-open', 'claude/opus]'],
  ['err-qualifiers-mid-reference', 'claude/opus[ctx=1m]/x'],
  ['err-two-qualifier-groups', 'claude/max[local][agent]'],
  ['err-at-before-qualifiers', 'claude/opus@high[ctx=1m]'],
  ['err-quote-in-text', 'claude/"opus"x y'],
  // An effort must be one of EFFORT_LEVELS, wherever it stands.
  ['err-unknown-effort', 'claude/max@hgih'],
  ['err-unknown-effort-on-a-wildcard', '*/max@hgih'],
  ['err-unknown-effort-on-the-tool', 'pi@off'],
  ['err-unknown-effort-after-an-at-in-the-model', 'pi/user@host/model'],
  ['err-unknown-effort-after-qualifiers', 'claude/max[ctx=1m]@ultra'],
  // A model string a CLI would read as a flag, or with an invisible character.
  ['err-invalid-model-long-flag', 'claude/--dangerously-skip-permissions'],
  ['err-invalid-model-short-flag', 'codex/-c'],
  ['err-invalid-model-flag-after-a-slash', 'pi/ollama/-x'],
  ['err-invalid-model-zero-width', 'claude/opus\u200b'],
  ['err-invalid-model-bidi', 'claude/opus\u202e'],
  ['err-invalid-model-nul', 'claude/op\u0000us'],
  ['err-invalid-model-bell', 'claude/opus\u0007'],
  ['err-invalid-model-next-line', 'claude/opus\u0085'],
  ['model-may-hold-a-hyphen-inside', 'pi/ollama/qwen-x'],
  // ctx= is bounded: the largest size is Number.MAX_SAFE_INTEGER tokens.
  ['ctx-at-the-largest-size', 'claude/opus[ctx=9007199254740k]'],
  ['err-ctx-above-the-largest-size', 'claude/opus[ctx=9007199254741k]'],
  ['err-ctx-far-above-the-largest-size', 'claude/opus[ctx=99999999999999999999999m]'],
]

const REF_FORMATS: [string, Ref][] = [
  ['tool-only', { tool: 'claude' }],
  ['tier', { tool: 'claude', model: 'max' }],
  ['model-effort', { tool: 'claude', model: 'opus-5.5', effort: 'high' }],
  [
    'ctx-tokens-whole-m',
    { tool: 'claude', model: 'opus', qualifiers: { ctx: 1_000_000, traits: [] } },
  ],
  ['ctx-tokens-k', { tool: 'claude', model: 'opus', qualifiers: { ctx: 200_000, traits: [] } }],
  [
    'ctx-rounds-down-to-k',
    { tool: 'antigravity', model: 'pro', qualifiers: { ctx: 1_048_576, traits: [] } },
  ],
  ['ctx-under-1k', { tool: 'claude', model: 'opus', qualifiers: { ctx: 900, traits: [] } }],
  ['ctx-max', { tool: 'claude', model: 'max', qualifiers: { ctx: 'max', traits: [] } }],
  [
    'traits-sorted',
    { tool: '*', model: 'fast', qualifiers: { traits: ['reasoning', 'local', 'agent'] } },
  ],
  [
    'ctx-first-then-traits',
    {
      tool: 'claude',
      model: 'max',
      qualifiers: { ctx: 2_000_000, traits: ['local'] },
      effort: 'low',
    },
  ],
  ['empty-qualifiers-prints-nothing', { tool: 'claude', model: 'max', qualifiers: { traits: [] } }],
]

const SIZE_PARSE = [
  '1k',
  '200k',
  '1m',
  '2m',
  '999k',
  '10m',
  '',
  '1',
  '1000',
  '1M',
  '1K',
  '0k',
  '01m',
  'max',
  '1.5m',
  'k',
  'm',
  '1km',
  ' 1k',
  '-1k',
  '1g',
  '9007199254740k',
  '9007199254741k',
  '9007199254m',
  '9007199255m',
  '99999999999999999999999m',
]
const SIZE_FORMAT = [
  0, 1, 999, 1_000, 1_500, 200_000, 1_000_000, 1_048_576, 1_050_000, 262_144, 2_000_000, 1_999_999,
]

// ------------------------------------------------------------------- effort

const EFFORT_CASES: [string, string, string[]][] = [
  ['supported-kept', 'high', ['low', 'high']],
  ['up-preferred', 'medium', ['low', 'high']],
  ['down-when-up-missing', 'max', ['high', 'xhigh']],
  ['up-one-step', 'low', ['medium']],
  ['down-one-step', 'high', ['medium']],
  ['xhigh-down-to-high', 'xhigh', ['low', 'medium', 'high']],
  ['two-steps-up-is-no-match', 'low', ['high']],
  ['two-steps-from-none', 'none', ['low', 'medium']],
  ['none-up-to-minimal', 'none', ['minimal', 'low']],
  ['max-two-steps-above-high', 'max', ['low', 'medium', 'high']],
  ['empty-supported', 'medium', []],
  ['off-scale-unsupported', 'ultra', ['max']],
  ['off-scale-supported-is-kept', 'off', ['off']],
  ['minimal-up-to-low', 'minimal', ['low', 'max']],
]

// ----------------------------------------------------------------- validity

const VALIDITY_CASES: { name: string; ref: string; layers: LayerSpec[]; ctx?: CheckContext }[] = [
  // README validity table, on the shipped snapshot.
  { name: 'snap-ok-tool', ref: 'claude', layers: [SNAP] },
  { name: 'snap-ok-tier', ref: 'claude/max', layers: [SNAP] },
  { name: 'snap-ok-family-alias', ref: 'claude/opus', layers: [SNAP] },
  { name: 'snap-ok-effort', ref: 'claude/opus@high', layers: [SNAP] },
  { name: 'snap-ok-effort-one-step-from-supported', ref: 'antigravity@xhigh', layers: [SNAP] },
  { name: 'snap-ok-tool-effort', ref: 'claude@high', layers: [SNAP] },
  { name: 'snap-ok-provider-model', ref: 'pi/ollama/qwen3:4b', layers: [SNAP] },
  { name: 'snap-error-unknown-tool', ref: 'nosuch/max', layers: [SNAP] },
  { name: 'snap-error-unknown-tool-wildcard', ref: '*/fast', layers: [SNAP] },
  { name: 'snap-error-no-tier-entry', ref: 'cursor/fast', layers: [SNAP] },
  { name: 'snap-error-provider-not-served', ref: 'codex/sonnet', layers: [SNAP] },
  { name: 'snap-error-model-not-offered', ref: 'cursor/claude-haiku-5-5', layers: [SNAP] },
  { name: 'snap-error-effort-too-far', ref: 'claude/opus@none', layers: [SNAP] },
  { name: 'snap-error-effort-two-steps', ref: 'antigravity@max', layers: [SNAP] },
  { name: 'snap-error-effort-tool-level', ref: 'antigravity/pro@max', layers: [SNAP] },
  {
    name: 'snap-error-provider-prefix-not-served',
    ref: 'codex/anthropic/whatever',
    layers: [SNAP],
  },
  { name: 'snap-warning-unknown-model', ref: 'claude/brand-new-model', layers: [SNAP] },
  {
    name: 'snap-strict-error-unknown-model',
    ref: 'claude/brand-new-model',
    layers: [SNAP],
    ctx: { strict: true },
  },
  { name: 'snap-strict-ok-known-model', ref: 'claude/opus', layers: [SNAP], ctx: { strict: true } },
  {
    name: 'snap-unknown-model-effort-checked-against-tool',
    ref: 'antigravity/brand-new@max',
    layers: [SNAP],
  },
  {
    name: 'snap-known-tools-narrows-hint',
    ref: 'codex/sonnet',
    layers: [SNAP],
    ctx: { knownTools: ['codex', 'pi'] },
  },
  {
    name: 'snap-known-tools-excludes-tool',
    ref: 'claude/max',
    layers: [SNAP],
    ctx: { knownTools: ['codex'] },
  },
  // The mini catalogue: skip, warning, hints, efforts lists.
  { name: 'mini-skip-withdrawn', ref: 'alpha/gone-1', layers: [MINI] },
  { name: 'mini-skip-withdrawn-by-key', ref: 'gamma/anthropic/gone-1', layers: [MINI] },
  { name: 'mini-warning-deprecated', ref: 'alpha/big-1', layers: [MINI] },
  {
    name: 'mini-strict-warning-deprecated-stays',
    ref: 'alpha/big-1',
    layers: [MINI],
    ctx: { strict: true },
  },
  { name: 'mini-ok-alias-native-name', ref: 'alpha/big', layers: [MINI] },
  { name: 'mini-ok-effort-adjusts', ref: 'beta/gpt-x@low', layers: [MINI] },
  { name: 'mini-error-effort-lists-levels', ref: 'beta/gpt-x@max', layers: [MINI] },
  { name: 'mini-error-no-effort-tool', ref: 'gamma/big-2@low', layers: [MINI] },
  { name: 'mini-error-no-effort-tool-default-model', ref: 'gamma@low', layers: [MINI] },
  { name: 'mini-error-provider-not-served-hint-first-tool', ref: 'beta/big-2', layers: [MINI] },
  {
    name: 'mini-error-provider-not-served-hint-keeps-effort',
    ref: 'beta/big-2@high',
    layers: [MINI],
  },
  {
    name: 'mini-error-provider-not-served-hint-by-key',
    ref: 'beta/anthropic/big-2',
    layers: [MINI],
  },
  { name: 'mini-error-model-not-offered-curated', ref: 'delta/mid-1', layers: [MINI] },
  {
    name: 'mini-error-model-not-offered-curated-keeps-effort',
    ref: 'delta/mid-1@medium',
    layers: [MINI],
  },
  { name: 'mini-error-provider-not-served-by-id', ref: 'beta/mid-1', layers: [MINI] },
  { name: 'mini-error-no-tier-entry', ref: 'beta/max', layers: [MINI] },
  { name: 'mini-ok-tier-resolves-to-alias', ref: 'alpha/max', layers: [MINI] },
  { name: 'mini-error-model-effort-intersection', ref: 'alpha/big-2@max', layers: [MINI] },
  { name: 'mini-ok-curated-native-name', ref: 'delta/tiny', layers: [MINI] },
  { name: 'mini-error-curated-offering-efforts', ref: 'delta/tiny@high', layers: [MINI] },
  {
    name: 'mini-hint-order-follows-known-tools',
    ref: 'beta/big-2',
    layers: [MINI],
    ctx: { knownTools: ['beta', 'gamma', 'alpha'] },
  },
  { name: 'mini-config-layer-ok-new-tool', ref: 'epsilon/house-1', layers: [MINI, MINI_CONFIG] },
  { name: 'mini-config-layer-removed-offering', ref: 'alpha/plain-1', layers: [MINI, MINI_CONFIG] },
]

// ------------------------------------------------------------------ context

const ARGS_CASES: {
  name: string
  tool: string
  model?: string
  ctx: number
  defaultContext?: number
}[] = [
  { name: 'claude-under-default-unchanged', tool: 'claude', model: 'opus', ctx: 200_000 },
  { name: 'claude-above-default-gets-1m', tool: 'claude', model: 'opus', ctx: 1_000_000 },
  { name: 'claude-above-default-no-model', tool: 'claude', ctx: 500_000 },
  { name: 'claude-above-1m-unchecked', tool: 'claude', model: 'opus', ctx: 5_000_000 },
  { name: 'claude-just-above-1m-unchecked', tool: 'claude', model: 'opus', ctx: 1_001_000 },
  { name: 'claude-under-default-no-model', tool: 'claude', ctx: 100_000 },
  { name: 'cursor-bracket', tool: 'cursor', model: 'claude-opus-5-5-medium', ctx: 1_000_000 },
  { name: 'cursor-bracket-rounds-down', tool: 'cursor', model: 'x', ctx: 1_048_576 },
  { name: 'cursor-no-model', tool: 'cursor', ctx: 1_000_000 },
  { name: 'ollama-num-ctx', tool: 'ollama', model: 'qwen3:4b', ctx: 32_000 },
  { name: 'ollama-num-ctx-no-model', tool: 'ollama', ctx: 8_000 },
  {
    name: 'codex-covered-by-default-window',
    tool: 'codex',
    model: 'gpt-6.1-sol',
    ctx: 200_000,
    defaultContext: 272_000,
  },
  {
    name: 'codex-equal-to-default-window',
    tool: 'codex',
    model: 'gpt-6.1-sol',
    ctx: 272_000,
    defaultContext: 272_000,
  },
  {
    name: 'codex-above-default-window',
    tool: 'codex',
    model: 'gpt-6.1-sol',
    ctx: 500_000,
    defaultContext: 272_000,
  },
  { name: 'codex-no-known-window', tool: 'codex', model: 'gpt-6.1-sol', ctx: 100_000 },
  { name: 'unknown-tool-covered-no-model', tool: 'grok', ctx: 10_000, defaultContext: 20_000 },
  { name: 'pi-no-form', tool: 'pi', model: 'x', ctx: 64_000 },
]

const DEFAULT_WINDOW_CASES: { name: string; layers: LayerSpec[]; tool: string; model?: string }[] =
  [
    { name: 'snap-codex-offering-default', layers: [SNAP], tool: 'codex', model: 'gpt-6.1-sol' },
    { name: 'snap-claude-no-default', layers: [SNAP], tool: 'claude', model: 'opus' },
    { name: 'snap-no-model', layers: [SNAP], tool: 'codex' },
    { name: 'snap-unknown-model', layers: [SNAP], tool: 'codex', model: 'nosuch' },
    { name: 'snap-unknown-tool', layers: [SNAP], tool: 'nosuch', model: 'opus' },
    { name: 'mini-offering-wins-over-model', layers: [MINI], tool: 'alpha', model: 'big' },
    { name: 'mini-curated-offering-default', layers: [MINI], tool: 'delta', model: 'large' },
    {
      name: 'mini-model-default-when-offering-has-none',
      layers: [MINI],
      tool: 'gamma',
      model: 'anthropic/big-2',
    },
    {
      name: 'mini-max-is-never-a-default',
      layers: [MINI],
      tool: 'alpha',
      model: 'anthropic/mid-1',
    },
  ]

const CHECK_CASES: {
  name: string
  layers: LayerSpec[]
  tool: string
  model?: string
  want?: number | 'max'
  required?: number
}[] = [
  // README context table.
  { name: 'none-asked-is-ok', layers: [MINI], tool: 'alpha', model: 'big' },
  {
    name: 'error-ctx-above-offered-anywhere',
    layers: [MINI],
    tool: 'alpha',
    model: 'big',
    want: 2_000_000,
  },
  {
    name: 'skip-offers-less-on-this-tool',
    layers: [MINI],
    tool: 'alpha',
    model: 'big',
    want: 1_000_000,
  },
  {
    name: 'skip-profile-context-wins',
    layers: [MINI],
    tool: 'alpha',
    model: 'big',
    required: 1_000_000,
  },
  {
    name: 'skip-profile-context-equal-to-want',
    layers: [MINI],
    tool: 'alpha',
    model: 'big',
    want: 500_000,
    required: 500_000,
  },
  {
    name: 'skip-want-larger-than-profile',
    layers: [MINI],
    tool: 'alpha',
    model: 'big',
    want: 600_000,
    required: 300_000,
  },
  { name: 'ok-within-size', layers: [MINI], tool: 'alpha', model: 'big', want: 150_000 },
  { name: 'ok-equal-to-size', layers: [MINI], tool: 'alpha', model: 'big', want: 200_000 },
  {
    name: 'ok-profile-context-only',
    layers: [MINI],
    tool: 'alpha',
    model: 'big',
    required: 100_000,
  },
  {
    name: 'ok-larger-of-want-and-profile',
    layers: [MINI],
    tool: 'alpha',
    model: 'big',
    want: 100_000,
    required: 150_000,
  },
  {
    name: 'ctx-max-is-the-size-on-the-tool',
    layers: [MINI],
    tool: 'alpha',
    model: 'big',
    want: 'max',
  },
  {
    name: 'ctx-max-with-profile-context',
    layers: [MINI],
    tool: 'alpha',
    model: 'big',
    want: 'max',
    required: 100_000,
  },
  {
    name: 'ctx-max-skips-when-profile-context-too-big',
    layers: [MINI],
    tool: 'alpha',
    model: 'big',
    want: 'max',
    required: 400_000,
  },
  {
    name: 'ok-other-tool-reaches-more',
    layers: [MINI],
    tool: 'gamma',
    model: 'anthropic/big-2',
    want: 1_000_000,
  },
  {
    name: 'unchecked-model-without-size',
    layers: [MINI],
    tool: 'alpha',
    model: 'anthropic/mid-1',
    want: 500_000,
  },
  {
    name: 'unchecked-keeps-profile-context-floor',
    layers: [MINI],
    tool: 'alpha',
    model: 'anthropic/mid-1',
    want: 100_000,
    required: 300_000,
  },
  {
    name: 'unchecked-ctx-max-has-no-context',
    layers: [MINI],
    tool: 'alpha',
    model: 'anthropic/mid-1',
    want: 'max',
  },
  {
    name: 'unchecked-unknown-model',
    layers: [MINI],
    tool: 'alpha',
    model: 'nosuch',
    want: 100_000,
  },
  { name: 'unchecked-no-model', layers: [MINI], tool: 'alpha', want: 100_000 },
  {
    name: 'curated-offering-smaller-than-model',
    layers: [MINI],
    tool: 'delta',
    model: 'large',
    want: 200_000,
  },
  {
    name: 'curated-offering-error-above-anywhere',
    layers: [MINI],
    tool: 'delta',
    model: 'large',
    want: 1_200_000,
  },
  {
    name: 'snap-codex-skip-below-window',
    layers: [SNAP],
    tool: 'codex',
    model: 'gpt-6.1-sol',
    want: 900_000,
  },
  {
    name: 'snap-codex-ok-in-window',
    layers: [SNAP],
    tool: 'codex',
    model: 'gpt-6.1-sol',
    want: 500_000,
  },
  { name: 'snap-claude-1m', layers: [SNAP], tool: 'claude', model: 'opus', want: 1_000_000 },
  {
    name: 'snap-claude-error-far-above',
    layers: [SNAP],
    tool: 'claude',
    model: 'opus',
    want: 50_000_000,
  },
]

// ----------------------------------------------------------------- catalogue

const SNAPSHOT_BASE = {
  source: 'snapshot',
  observed_at: '2026-10-09',
  tools: {
    claude: {
      binary: 'claude',
      serves: ['anthropic'],
      openness: 'closed',
      modes: ['headless', 'interactive'],
      model: { via: 'flag', name: '--model' },
      effort: { via: 'flag', name: '--effort' },
      context: { via: 'suffix', name: '[1m]' },
      efforts: ['low', 'medium', 'high'],
      aliases: { opus: 'anthropic/claude-opus-5-5' },
      prefer_alias: true,
      checked_against: '2.1.295',
      verify: ['aliases'],
      observed_at: '2026-10-09',
    },
  },
  providers: {
    anthropic: {
      kind: 'anthropic',
      endpoint: 'https://api.anthropic.com',
      key_env: 'ANTHROPIC_API_KEY',
    },
  },
  models: {
    'anthropic/claude-opus-5-5': {
      family: 'claude-opus',
      release_date: '2026-09-01',
      context: { default: 200000, max: 1000000, variants: ['1m'] },
      efforts: ['low', 'medium', 'high'],
      cost: { input: 5, output: 25.5 },
      traits: ['agent', 'reasoning'],
      status: 'current',
      observed_at: '2026-10-09',
    },
  },
  offerings: [
    {
      tool: 'claude',
      model: 'anthropic/claude-opus-5-5',
      native_name: 'opus',
      via: 'x',
      efforts: ['low'],
      context: { default: 1000 },
      remove: false,
    },
  ],
}

type Doc = Record<string, any>
/** A copy of `base` with `mutate` applied. */
function mut(base: Doc, mutate: (d: Doc) => void): Doc {
  const d = structuredClone(base)
  mutate(d)
  return d
}

const SNAPSHOT_DOCS: [string, Doc][] = [
  ['accept-full', SNAPSHOT_BASE],
  [
    'accept-minimal',
    { source: 'snapshot', observed_at: '2026-10-09', tools: {}, providers: {}, models: {} },
  ],
  ['accept-leap-day', mut(SNAPSHOT_BASE, (d) => (d.observed_at = '2028-02-29'))],
  ['accept-takes-none', mut(SNAPSHOT_BASE, (d) => (d.tools.claude.context = { via: 'none' }))],
  // Efforts are words on EFFORT_LEVELS; a tool's own word (pi's `off`) is refused.
  [
    'accept-efforts-on-the-scale',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.efforts = ['none', 'max'])),
  ],
  [
    'reject-effort-off-the-scale',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.efforts = ['off', 'low'])),
  ],
  [
    'accept-takes-every-via',
    mut(SNAPSHOT_BASE, (d) => {
      d.tools.claude.model = { via: 'config', name: '-c' }
      d.tools.claude.effort = { via: 'bracket', name: 'effort' }
    }),
  ],
  [
    'accept-serves-via',
    mut(
      SNAPSHOT_BASE,
      (d) =>
        (d.tools.claude.serves = [
          'anthropic',
          { provider: 'ollama', via: '--oss --local-provider ollama' },
        ]),
    ),
  ],
  [
    'accept-headless',
    mut(
      SNAPSHOT_BASE,
      (d) =>
        (d.tools.claude.headless = {
          args: ['-p', '{prompt}', '--model', '{model}'],
          prompt_via: 'argv',
        }),
    ),
  ],
  [
    'accept-headless-stdin',
    mut(
      SNAPSHOT_BASE,
      (d) => (d.tools.claude.headless = { args: ['--effort', '{effort}'], prompt_via: 'stdin' }),
    ),
  ],
  [
    'accept-curated-offers',
    mut(SNAPSHOT_BASE, (d) => {
      d.tools.claude.openness = 'curated'
      d.tools.claude.offers = [
        {
          model: 'anthropic/claude-opus-5-5',
          native_name: 'opus-medium',
          efforts: ['low'],
          context: { default: 100000 },
        },
      ]
    }),
  ],
  [
    'accept-model-key-with-colon-and-slash',
    mut(SNAPSHOT_BASE, (d) => (d.models['ollama/qwen3:4b'] = { traits: ['local'] })),
  ],
  [
    'accept-every-trait',
    mut(
      SNAPSHOT_BASE,
      (d) =>
        (d.models['anthropic/claude-opus-5-5'].traits = [
          'local',
          'agent',
          'embedding',
          'reasoning',
          'long-context',
        ]),
    ),
  ],
  [
    'accept-every-provider-kind',
    mut(SNAPSHOT_BASE, (d) => {
      for (const kind of ['openai', 'google', 'ollama', 'lmstudio', 'openai-compatible'])
        d.providers[kind] = { kind }
    }),
  ],
  [
    'accept-withdrawn',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].status = 'withdrawn')),
  ],
  ['reject-wrong-source', mut(SNAPSHOT_BASE, (d) => (d.source = 'config'))],
  ['reject-missing-source', mut(SNAPSHOT_BASE, (d) => delete d.source)],
  ['reject-missing-tools', mut(SNAPSHOT_BASE, (d) => delete d.tools)],
  ['reject-missing-models', mut(SNAPSHOT_BASE, (d) => delete d.models)],
  ['reject-unknown-top-level-key', mut(SNAPSHOT_BASE, (d) => (d.extra = 1))],
  ['reject-bad-date-format', mut(SNAPSHOT_BASE, (d) => (d.observed_at = '2026-1-9'))],
  ['reject-impossible-date', mut(SNAPSHOT_BASE, (d) => (d.observed_at = '2026-02-30'))],
  ['reject-leap-day-in-common-year', mut(SNAPSHOT_BASE, (d) => (d.observed_at = '2027-02-29'))],
  ['reject-month-13', mut(SNAPSHOT_BASE, (d) => (d.observed_at = '2026-13-01'))],
  ['reject-datetime', mut(SNAPSHOT_BASE, (d) => (d.observed_at = '2026-10-09T00:00:00Z'))],
  [
    'reject-tool-id-uppercase',
    mut(SNAPSHOT_BASE, (d) => {
      d.tools.Claude = d.tools.claude
      delete d.tools.claude
    }),
  ],
  [
    'reject-provider-id-underscore',
    mut(SNAPSHOT_BASE, (d) => (d.providers.my_prov = { kind: 'ollama' })),
  ],
  ['reject-model-key-without-slash', mut(SNAPSHOT_BASE, (d) => (d.models.opus = {}))],
  [
    'reject-model-key-uppercase-provider',
    mut(SNAPSHOT_BASE, (d) => (d.models['Anthropic/x'] = {})),
  ],
  ['reject-model-key-id-leading-dash', mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/-x'] = {}))],
  ['reject-unknown-tool-key', mut(SNAPSHOT_BASE, (d) => (d.tools.claude.unknown = true))],
  [
    'reject-unknown-model-key',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].provider = 'anthropic')),
  ],
  ['reject-unknown-provider-key', mut(SNAPSHOT_BASE, (d) => (d.providers.anthropic.name = 'x'))],
  [
    'reject-unknown-context-key',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].context.window = 1)),
  ],
  [
    'reject-unknown-cost-key',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].cost.cache = 1)),
  ],
  [
    'reject-negative-cost',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].cost.input = -1)),
  ],
  [
    'reject-zero-context',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].context.max = 0)),
  ],
  [
    'reject-fractional-context',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].context.max = 1.5)),
  ],
  [
    'reject-negative-context',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].context.default = -5)),
  ],
  [
    'reject-empty-variant',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].context.variants = [''])),
  ],
  [
    'reject-unknown-trait',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].traits = ['telepathy'])),
  ],
  [
    'reject-unknown-status',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].status = 'retired')),
  ],
  [
    'reject-blank-serves-via',
    mut(
      SNAPSHOT_BASE,
      (d) => (d.tools.claude.serves = ['anthropic', { provider: 'ollama', via: '   ' }]),
    ),
  ],
  ['reject-blank-offering-via', mut(SNAPSHOT_BASE, (d) => (d.offerings[0].via = ' \t'))],
  [
    'reject-a-proto-tool-key',
    mut(SNAPSHOT_BASE, (d) => {
      d.tools = { ...d.tools, ...JSON.parse('{"__proto__": {"serves": []}}') }
    }),
  ],
  [
    'reject-a-proto-alias-key',
    mut(SNAPSHOT_BASE, (d) => {
      d.tools.claude.aliases = JSON.parse('{"__proto__": "anthropic/claude-opus-5-5"}')
    }),
  ],
  [
    'reject-empty-efforts-item',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].efforts = ['low', ''])),
  ],
  [
    'reject-null-family',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].family = null)),
  ],
  ['reject-null-serves', mut(SNAPSHOT_BASE, (d) => (d.tools.claude.serves = null))],
  ['reject-null-offerings', mut(SNAPSHOT_BASE, (d) => (d.offerings = null))],
  [
    'reject-empty-family',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].family = '')),
  ],
  [
    'reject-bad-release-date',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].release_date = 'yesterday')),
  ],
  [
    'reject-empty-deprecated-on',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].deprecated_on = '')),
  ],
  [
    'reject-alias-with-leading-dash',
    mut(SNAPSHOT_BASE, (d) => (d.models['anthropic/claude-opus-5-5'].aliases = ['-opus'])),
  ],
  ['reject-unknown-openness', mut(SNAPSHOT_BASE, (d) => (d.tools.claude.openness = 'ajar'))],
  ['reject-unknown-mode', mut(SNAPSHOT_BASE, (d) => (d.tools.claude.modes = ['batch']))],
  [
    'reject-takes-none-with-name',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.context = { via: 'none', name: 'x' })),
  ],
  [
    'reject-takes-flag-without-name',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.model = { via: 'flag' })),
  ],
  [
    'reject-takes-empty-name',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.model = { via: 'flag', name: '' })),
  ],
  [
    'reject-takes-unknown-via',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.model = { via: 'magic', name: 'x' })),
  ],
  [
    'reject-takes-extra-key',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.model = { via: 'flag', name: 'x', extra: 1 })),
  ],
  [
    'reject-serves-bad-provider-id',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.serves = ['Anthropic'])),
  ],
  [
    'reject-serves-via-empty',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.serves = [{ provider: 'ollama', via: '' }])),
  ],
  [
    'reject-serves-via-extra-key',
    mut(
      SNAPSHOT_BASE,
      (d) => (d.tools.claude.serves = [{ provider: 'ollama', via: 'x', extra: 1 }]),
    ),
  ],
  [
    'reject-alias-bad-model-key',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.aliases = { opus: 'opus' })),
  ],
  [
    'reject-offer-bad-native-name',
    mut(
      SNAPSHOT_BASE,
      (d) => (d.tools.claude.offers = [{ model: 'anthropic/x', native_name: '--flag' }]),
    ),
  ],
  [
    'reject-offer-extra-key',
    mut(
      SNAPSHOT_BASE,
      (d) => (d.tools.claude.offers = [{ model: 'anthropic/x', native_name: 'x', extra: 1 }]),
    ),
  ],
  [
    'reject-headless-no-args',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.headless = { args: [], prompt_via: 'stdin' })),
  ],
  [
    'reject-headless-slot-inside-argument',
    mut(
      SNAPSHOT_BASE,
      (d) =>
        (d.tools.claude.headless = { args: ['--model={model}', '{prompt}'], prompt_via: 'argv' }),
    ),
  ],
  [
    'reject-headless-duplicate-slot',
    mut(
      SNAPSHOT_BASE,
      (d) =>
        (d.tools.claude.headless = {
          args: ['{model}', '{model}', '{prompt}'],
          prompt_via: 'argv',
        }),
    ),
  ],
  [
    'reject-headless-argv-without-prompt',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.headless = { args: ['-p'], prompt_via: 'argv' })),
  ],
  [
    'reject-headless-stdin-with-prompt',
    mut(
      SNAPSHOT_BASE,
      (d) => (d.tools.claude.headless = { args: ['{prompt}'], prompt_via: 'stdin' }),
    ),
  ],
  [
    'reject-headless-unknown-prompt-via',
    mut(
      SNAPSHOT_BASE,
      (d) => (d.tools.claude.headless = { args: ['{prompt}'], prompt_via: 'file' }),
    ),
  ],
  ['reject-tool-observed-at-bad', mut(SNAPSHOT_BASE, (d) => (d.tools.claude.observed_at = 'soon'))],
  ['reject-empty-binary', mut(SNAPSHOT_BASE, (d) => (d.tools.claude.binary = ''))],
  [
    'reject-empty-checked-against',
    mut(SNAPSHOT_BASE, (d) => (d.tools.claude.checked_against = '')),
  ],
  ['reject-empty-verify-item', mut(SNAPSHOT_BASE, (d) => (d.tools.claude.verify = ['']))],
  [
    'reject-unknown-provider-kind',
    mut(SNAPSHOT_BASE, (d) => (d.providers.anthropic.kind = 'bedrock')),
  ],
  [
    'reject-endpoint-not-a-url',
    mut(SNAPSHOT_BASE, (d) => (d.providers.anthropic.endpoint = 'not a url')),
  ],
  [
    'reject-key-env-holds-a-key',
    mut(SNAPSHOT_BASE, (d) => (d.providers.anthropic.key_env = 'sk-ant-1234 abc')),
  ],
  [
    'reject-key-env-leading-digit',
    mut(SNAPSHOT_BASE, (d) => (d.providers.anthropic.key_env = '1KEY')),
  ],
  [
    'reject-offering-missing-tool',
    mut(SNAPSHOT_BASE, (d) => (d.offerings = [{ model: 'anthropic/x' }])),
  ],
  [
    'reject-offering-bad-model-key',
    mut(SNAPSHOT_BASE, (d) => (d.offerings = [{ tool: 'claude', model: 'x' }])),
  ],
  [
    'reject-offering-extra-key',
    mut(SNAPSHOT_BASE, (d) => (d.offerings = [{ tool: 'claude', model: 'anthropic/x', extra: 1 }])),
  ],
  [
    'reject-offering-remove-not-boolean',
    mut(
      SNAPSHOT_BASE,
      (d) => (d.offerings = [{ tool: 'claude', model: 'anthropic/x', remove: 'yes' }]),
    ),
  ],
  ['reject-tools-not-an-object', mut(SNAPSHOT_BASE, (d) => (d.tools = []))],
  ['reject-null-document', null as unknown as Doc],
]

const MACHINE_BASE = {
  version: 1,
  refreshed_at: '2026-10-20',
  layers: [
    {
      source: 'models.dev',
      observed_at: '2026-10-20',
      models: {
        'anthropic/new-1': { family: 'claude-opus', release_date: '2026-10-19', traits: ['agent'] },
      },
    },
    {
      source: 'probe:ollama',
      observed_at: '2026-10-20',
      models: { 'ollama/qwen3:4b': { traits: ['agent', 'local'], context: { default: 4096 } } },
    },
    {
      source: 'probe:cursor',
      observed_at: '2026-10-20',
      tools: { cursor: { offers: [{ model: 'anthropic/new-1', native_name: 'new-1-high' }] } },
    },
  ],
}

const MACHINE_DOCS: [string, Doc][] = [
  ['accept-full', MACHINE_BASE],
  ['accept-no-layers', { version: 1, refreshed_at: '2026-10-20', layers: [] }],
  [
    'accept-layer-without-tables',
    {
      version: 1,
      refreshed_at: '2026-10-20',
      layers: [{ source: 'models.dev', observed_at: '2026-10-20' }],
    },
  ],
  [
    'accept-probe-with-hyphen',
    mut(MACHINE_BASE, (d) => (d.layers[1].source = 'probe:my-runtime2')),
  ],
  ['reject-version-2', mut(MACHINE_BASE, (d) => (d.version = 2))],
  ['reject-version-string', mut(MACHINE_BASE, (d) => (d.version = '1'))],
  ['reject-missing-version', mut(MACHINE_BASE, (d) => delete d.version)],
  ['reject-missing-refreshed-at', mut(MACHINE_BASE, (d) => delete d.refreshed_at)],
  ['reject-bad-refreshed-at', mut(MACHINE_BASE, (d) => (d.refreshed_at = '20 Oct 2026'))],
  ['reject-missing-layers', mut(MACHINE_BASE, (d) => delete d.layers)],
  ['reject-unknown-top-level-key', mut(MACHINE_BASE, (d) => (d.extra = true))],
  ['reject-source-snapshot', mut(MACHINE_BASE, (d) => (d.layers[0].source = 'snapshot'))],
  ['reject-source-config', mut(MACHINE_BASE, (d) => (d.layers[0].source = 'config'))],
  [
    'reject-source-probe-uppercase',
    mut(MACHINE_BASE, (d) => (d.layers[1].source = 'probe:Ollama')),
  ],
  ['reject-source-probe-empty', mut(MACHINE_BASE, (d) => (d.layers[1].source = 'probe:'))],
  ['reject-source-bare-probe', mut(MACHINE_BASE, (d) => (d.layers[1].source = 'probe'))],
  ['reject-layer-missing-observed-at', mut(MACHINE_BASE, (d) => delete d.layers[0].observed_at)],
  [
    'reject-layer-bad-observed-at',
    mut(MACHINE_BASE, (d) => (d.layers[0].observed_at = '2026-02-30')),
  ],
  ['reject-layer-unknown-key', mut(MACHINE_BASE, (d) => (d.layers[0].providers = {}))],
  ['reject-layer-null-models', mut(MACHINE_BASE, (d) => (d.layers[0].models = null))],
  ['reject-layer-model-key-bad', mut(MACHINE_BASE, (d) => (d.layers[0].models = { new: {} }))],
  [
    'reject-layer-model-unknown-key',
    mut(MACHINE_BASE, (d) => (d.layers[0].models['anthropic/new-1'].provider = 'anthropic')),
  ],
  [
    'reject-layer-tool-id-bad',
    mut(MACHINE_BASE, (d) => (d.layers[2].tools = { Cursor: { offers: [] } })),
  ],
  ['reject-layer-tool-missing-offers', mut(MACHINE_BASE, (d) => (d.layers[2].tools.cursor = {}))],
  [
    'reject-layer-tool-only-offers-allowed',
    mut(MACHINE_BASE, (d) => (d.layers[2].tools.cursor.serves = ['anthropic'])),
  ],
  [
    'reject-layer-offer-bad-model-key',
    mut(MACHINE_BASE, (d) => (d.layers[2].tools.cursor.offers[0].model = 'new-1')),
  ],
  [
    'reject-layer-offer-bad-native-name',
    mut(MACHINE_BASE, (d) => (d.layers[2].tools.cursor.offers[0].native_name = '-x')),
  ],
  [
    'reject-layer-offer-extra-key',
    mut(MACHINE_BASE, (d) => (d.layers[2].tools.cursor.offers[0].via = 'x')),
  ],
  ['reject-layers-not-an-array', mut(MACHINE_BASE, (d) => (d.layers = {}))],
  ['reject-string-document', 'catalogue' as unknown as Doc],
]

const LAYER_CASES: { name: string; layers: LayerSpec[]; summary?: boolean; strict?: boolean }[] = [
  { name: 'single-layer', layers: [MINI] },
  { name: 'config-over-mini', layers: [MINI, MINI_CONFIG] },
  { name: 'empty-layer', layers: [{ source: 'snapshot', observed_at: '2026-10-01' }] },
  {
    name: 'higher-layer-replaces-a-field-and-keeps-provenance',
    layers: [
      MINI,
      {
        source: 'models.dev',
        observed_at: '2026-10-10',
        models: { 'anthropic/small-1': { context: { default: 8000 }, observed_at: '2026-10-09' } },
      },
    ],
  },
  {
    name: 'serves-adds-and-replaces-by-provider',
    layers: [
      MINI,
      {
        source: 'config',
        observed_at: '2026-10-20',
        tools: { gamma: { serves: [{ provider: 'anthropic', via: '--via' }, 'openai'] } },
      },
    ],
  },
  {
    name: 'problems-missing-required-fields',
    layers: [
      {
        source: 'config',
        observed_at: '2026-10-20',
        tools: {
          bare: { efforts: ['low'] },
          nomodes: { serves: ['x'], openness: 'closed' },
          noserves: { modes: ['headless'] },
        },
        providers: { nokind: { endpoint: 'https://example.com' } },
      },
    ],
  },
  {
    name: 'problems-bad-model-keys',
    layers: [
      {
        source: 'config',
        observed_at: '2026-10-20',
        providers: { p: { kind: 'ollama' } },
        models: {
          noslash: {},
          '/lead': {},
          'trail/': {},
          'p/ok': {},
          'p/named': { provider: 'q' },
        },
      },
    ],
  },
  {
    name: 'problems-dangling-references',
    layers: [
      {
        source: 'config',
        observed_at: '2026-10-20',
        providers: { p: { kind: 'ollama' } },
        tools: {
          t: {
            serves: ['p', 'ghost'],
            openness: 'curated',
            modes: ['headless'],
            aliases: { a: 'p/missing' },
            offers: [{ model: 'p/also-missing', native_name: 'x' }],
          },
        },
        models: { 'orphan/m': {} },
        offerings: [{ tool: 'nobody', model: 'p/m' }],
      },
    ],
  },
  {
    name: 'problems-unknown-model-row-but-not-a-removal',
    layers: [
      MINI,
      {
        source: 'config',
        observed_at: '2026-10-20',
        offerings: [
          { tool: 'alpha', model: 'anthropic/missing-1' },
          { tool: 'alpha', model: 'anthropic/missing-2', remove: true },
        ],
      },
    ],
  },
  {
    name: 'problems-unknown-model-removal-row-under-strict',
    strict: true,
    layers: [
      MINI,
      {
        source: 'config',
        observed_at: '2026-10-20',
        offerings: [{ tool: 'alpha', model: 'anthropic/missing-2', remove: true }],
      },
    ],
  },
  {
    name: 'problems-unknown-model-add-and-removal-rows-under-strict',
    strict: true,
    layers: [
      MINI,
      {
        source: 'config',
        observed_at: '2026-10-20',
        offerings: [
          { tool: 'alpha', model: 'anthropic/missing-1', remove: true },
          { tool: 'alpha', model: 'anthropic/missing-2' },
        ],
      },
    ],
  },
  {
    name: 'binary-defaults-to-the-tool-id',
    layers: [
      {
        source: 'snapshot',
        observed_at: '2026-10-01',
        providers: { p: { kind: 'ollama' } },
        tools: {
          cursor: {
            binary: 'cursor-agent',
            serves: ['p'],
            openness: 'closed',
            modes: ['headless'],
          },
        },
      },
      {
        source: 'config',
        observed_at: '2026-10-02',
        tools: { mine: { serves: ['p'], openness: 'closed', modes: ['interactive'] } },
      },
    ],
  },
  { name: 'snapshot-summary', layers: [SNAP], summary: true },
  { name: 'snapshot-and-config-summary', layers: [SNAP, MINI_CONFIG], summary: true },
]

const OFFERING_CASES: { name: string; layers: LayerSpec[]; lines?: boolean }[] = [
  { name: 'mini-closed-curated-open', layers: [MINI] },
  { name: 'mini-with-config-rows', layers: [MINI, MINI_CONFIG] },
  { name: 'snapshot', layers: [SNAP], lines: true },
  {
    name: 'row-for-unknown-model-is-named-by-its-id',
    layers: [
      MINI,
      {
        source: 'config',
        observed_at: '2026-10-20',
        offerings: [{ tool: 'beta', model: 'openai/future-9' }],
      },
    ],
  },
  {
    name: 'row-replaces-derived-and-keeps-via',
    layers: [
      MINI,
      {
        source: 'config',
        observed_at: '2026-10-20',
        offerings: [
          { tool: 'gamma', model: 'ollama/qwen3:4b', native_name: 'qwen-small', efforts: ['low'] },
        ],
      },
      {
        source: 'config',
        observed_at: '2026-10-21',
        tools: { gamma: { serves: [{ provider: 'ollama', via: '--oss' }] } },
        offerings: [{ tool: 'gamma', model: 'ollama/qwen3:4b' }],
      },
    ],
  },
  {
    name: 'row-without-native-name-keeps-curated-name',
    layers: [
      MINI,
      {
        source: 'config',
        observed_at: '2026-10-20',
        offerings: [{ tool: 'delta', model: 'anthropic/big-2', context: { max: 500000 } }],
      },
    ],
  },
  {
    name: 'remove-then-readd',
    layers: [
      MINI,
      {
        source: 'config',
        observed_at: '2026-10-20',
        offerings: [
          { tool: 'alpha', model: 'anthropic/mid-1', remove: true },
          { tool: 'alpha', model: 'anthropic/mid-1', native_name: 'back' },
        ],
      },
    ],
  },
  {
    name: 'native-name-first-alias-for-the-model',
    layers: [
      {
        source: 'snapshot',
        observed_at: '2026-10-01',
        providers: { a: { kind: 'anthropic' } },
        tools: {
          t: {
            serves: ['a'],
            openness: 'closed',
            modes: ['headless'],
            aliases: { first: 'a/m', second: 'a/m' },
            prefer_alias: true,
          },
        },
        models: { 'a/m': {} },
      },
    ],
  },
  {
    name: 'prefer-alias-off-uses-the-id',
    layers: [
      {
        source: 'snapshot',
        observed_at: '2026-10-01',
        providers: { a: { kind: 'anthropic' } },
        tools: {
          t: { serves: ['a'], openness: 'closed', modes: ['headless'], aliases: { first: 'a/m' } },
        },
        models: { 'a/m': {} },
      },
    ],
  },
]

const QUERY_POLICY_PINS: MappingPolicy = {
  pins: { 'alpha/max': 'big-1', 'beta/fast': 'future-model', 'gamma/standard': 'mid-1' },
}
const QUERY_POLICY_ORDER: MappingPolicy = { order: ['gamma', 'beta'] }
const QUERY_POLICY_CLASSIFY: MappingPolicy = {
  classify: [
    { provider: 'anthropic', families: { 'claude-haiku': 'unclassified' } },
    {
      match: [
        { id: 'qwen*', tier: 'standard' },
        { id: '*:70b', tier: 'max' },
      ],
    },
  ],
}

type QueryCase = {
  name: string
  layers: LayerSpec[]
  policy?: MappingPolicy
  op: string
  args: unknown[]
}
const q = (
  name: string,
  op: string,
  args: unknown[],
  layersOf: LayerSpec[] = [MINI],
  policy?: MappingPolicy,
): QueryCase => ({ name, layers: layersOf, op, args, ...(policy ? { policy } : {}) })

const QUERY_CASES: QueryCase[] = [
  // The shipped snapshot, per the README.
  q('snap-efforts-claude', 'effortsFor', ['claude'], [SNAP]),
  q('snap-efforts-antigravity', 'effortsFor', ['antigravity'], [SNAP]),
  q('snap-efforts-claude-fable', 'effortsFor', ['claude', 'fable'], [SNAP]),
  q('snap-efforts-unknown-tool', 'effortsFor', ['nosuch'], [SNAP]),
  q('snap-find-claude-fable', 'findModel', ['claude', 'fable'], [SNAP]),
  q('snap-find-claude-opus', 'findModel', ['claude', 'opus'], [SNAP]),
  q('snap-find-codex-by-key', 'findModel', ['codex', 'openai/gpt-6.1-sol'], [SNAP]),
  q('snap-find-pi-provider-id', 'findModel', ['pi', 'anthropic/claude-opus-5-5'], [SNAP]),
  q('snap-find-missing', 'findModel', ['claude', 'gpt-6-sol'], [SNAP]),
  q('snap-known-tools', 'knownTools', [], [SNAP]),
  q('snap-tier-claude-fast', 'tierModel', ['claude', 'fast'], [SNAP]),
  q('snap-tier-claude-standard', 'tierModel', ['claude', 'standard'], [SNAP]),
  q('snap-tier-claude-max', 'tierModel', ['claude', 'max'], [SNAP]),
  q('snap-tier-codex-fast', 'tierModel', ['codex', 'fast'], [SNAP]),
  q('snap-tier-codex-standard', 'tierModel', ['codex', 'standard'], [SNAP]),
  q('snap-tier-codex-max', 'tierModel', ['codex', 'max'], [SNAP]),
  q('snap-tier-pi-max', 'tierModel', ['pi', 'max'], [SNAP]),
  q('snap-tier-opencode-standard', 'tierModel', ['opencode', 'standard'], [SNAP]),
  q('snap-tier-cursor-fast-none', 'tierModel', ['cursor', 'fast'], [SNAP]),
  q('snap-tier-antigravity-standard', 'tierModel', ['antigravity', 'standard'], [SNAP]),
  q('snap-tier-unknown-tool', 'tierModel', ['nosuch', 'max'], [SNAP]),
  q('snap-pin-moves-tier', 'tierModel', ['codex', 'max'], [SNAP], {
    pins: { 'codex/max': 'gpt-6.1-sol' },
  }),
  q('snap-pinned-true', 'pinned', ['codex', 'max'], [SNAP], {
    pins: { 'codex/max': 'gpt-6.1-sol' },
  }),
  q('snap-pinned-false', 'pinned', ['codex', 'fast'], [SNAP], {
    pins: { 'codex/max': 'gpt-6.1-sol' },
  }),
  q('snap-offering-opencode', 'offering', ['opencode', 'anthropic/claude-opus-5-5'], [SNAP]),
  q('snap-offering-codex-context', 'offering', ['codex', 'openai/gpt-6.1-sol'], [SNAP]),
  q('snap-offering-missing', 'offering', ['codex', 'anthropic/claude-opus-5-5'], [SNAP]),
  q('snap-tier-of-opus', 'tierOf', ['anthropic/claude-opus-5-5'], [SNAP]),
  q('snap-tier-of-fable-unclassified', 'tierOf', ['anthropic/claude-fable-5-1'], [SNAP]),
  q('snap-tier-of-unknown-key', 'tierOf', ['nosuch/model'], [SNAP]),
  q('snap-models-for-claude', 'modelsFor', ['claude'], [SNAP]),
  q('snap-models-for-cursor', 'modelsFor', ['cursor'], [SNAP]),
  q('snap-models-for-unknown-tool', 'modelsFor', ['nosuch'], [SNAP]),
  // The mini catalogue.
  q('mini-find-by-native-name', 'findModel', ['alpha', 'big']),
  q('mini-find-by-key', 'findModel', ['alpha', 'anthropic/big-2']),
  q('mini-find-by-id', 'findModel', ['alpha', 'big-2']),
  q('mini-find-by-tool-alias-after-native-name-miss', 'findModel', ['gamma', 'big']),
  q('mini-find-curated-native-name', 'findModel', ['delta', 'tiny']),
  q('mini-find-curated-hides-id', 'findModel', ['delta', 'small-1']),
  q('mini-find-open-tool-provider-id', 'findModel', ['gamma', 'ollama/qwen3:4b']),
  q('mini-efforts-tool-only', 'effortsFor', ['alpha']),
  q('mini-efforts-model-intersects-tool', 'effortsFor', ['alpha', 'big']),
  q('mini-efforts-model-without-own-list', 'effortsFor', ['beta', 'gpt-x']),
  q('mini-efforts-offering-own-list', 'effortsFor', ['delta', 'tiny']),
  q('mini-efforts-tool-with-empty-list', 'effortsFor', ['gamma', 'big-2']),
  q('mini-efforts-unknown-model-falls-back-to-tool', 'effortsFor', ['alpha', 'nosuch']),
  q('mini-efforts-tool-without-list-uses-model', 'effortsFor', ['delta', 'large']),
  q('mini-models-for-alpha-in-offering-order', 'modelsFor', ['alpha']),
  q('mini-models-for-open-tool', 'modelsFor', ['gamma']),
  q('mini-models-for-curated', 'modelsFor', ['delta']),
  q('mini-tools', 'tools', []),
  q('mini-known-tools', 'knownTools', []),
  q('mini-tier-alpha-max-newest-current', 'tierModel', ['alpha', 'max']),
  q('mini-tier-alpha-fast-skips-embedding-and-plain', 'tierModel', ['alpha', 'fast']),
  q('mini-tier-alpha-standard-skips-withdrawn', 'tierModel', ['alpha', 'standard']),
  q('mini-tier-gamma-max-open-tool-native-name', 'tierModel', ['gamma', 'max']),
  q('mini-tier-gamma-fast', 'tierModel', ['gamma', 'fast']),
  q('mini-tier-beta-standard', 'tierModel', ['beta', 'standard']),
  q('mini-tier-beta-max-none', 'tierModel', ['beta', 'max']),
  q('mini-tier-delta-max-curated-name', 'tierModel', ['delta', 'max']),
  q('mini-tier-delta-fast-curated-name', 'tierModel', ['delta', 'fast']),
  q('mini-pin-heads-the-tool', 'tierModel', ['alpha', 'max'], [MINI], QUERY_POLICY_PINS),
  q(
    'mini-pin-for-unknown-model-is-returned-as-written',
    'tierModel',
    ['beta', 'fast'],
    [MINI],
    QUERY_POLICY_PINS,
  ),
  q('mini-pin-other-tier-untouched', 'tierModel', ['alpha', 'fast'], [MINI], QUERY_POLICY_PINS),
  q('mini-pinned-true', 'pinned', ['gamma', 'standard'], [MINI], QUERY_POLICY_PINS),
  q('mini-pinned-false', 'pinned', ['gamma', 'max'], [MINI], QUERY_POLICY_PINS),
  q(
    'mini-classify-policy-unclassifies-haiku',
    'tierModel',
    ['alpha', 'fast'],
    [MINI],
    QUERY_POLICY_CLASSIFY,
  ),
  q(
    'mini-classify-policy-match-globs',
    'tierOf',
    ['ollama/qwen3:4b'],
    [MINI],
    QUERY_POLICY_CLASSIFY,
  ),
  q(
    'mini-classify-policy-glob-70b',
    'tierOf',
    ['ollama/llama3:70b'],
    [MINI],
    QUERY_POLICY_CLASSIFY,
  ),
  q('mini-tier-of-local-by-parameters-fast', 'tierOf', ['ollama/qwen3:4b']),
  q('mini-tier-of-local-by-parameters-max', 'tierOf', ['ollama/llama3:70b']),
  q('mini-tier-of-embedding-needs-agent-trait', 'tierOf', ['ollama/nomic:1b']),
  q('mini-tier-of-family-rule', 'tierOf', ['anthropic/big-2']),
  q('mini-tier-of-unclassified-family', 'tierOf', ['corp/house-1'], [MINI, MINI_CONFIG]),
  q('mini-offering-with-via', 'offering', ['gamma', 'ollama/qwen3:4b'], [MINI, MINI_CONFIG]),
  q('mini-offering-curated-efforts', 'offering', ['delta', 'anthropic/small-1']),
  q('mini-offering-row-context', 'offering', ['alpha', 'anthropic/big-2']),
  q('mini-config-adds-tool-model', 'findModel', ['epsilon', 'house-1'], [MINI, MINI_CONFIG]),
  q('mini-config-borrowed-offering', 'findModel', ['beta', 'borrowed'], [MINI, MINI_CONFIG]),
  q('mini-chain-order-policy', 'tierModel', ['beta', 'standard'], [MINI], QUERY_POLICY_ORDER),
]

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

const CLASSIFY_IDS = [
  'qwen3:4b',
  'llama3.1:70b',
  'gemma-4-26b-a4b-it',
  'gemma-4-31b-it',
  'qwen2.5-coder:7b',
  'phi:3.8b',
  'tiny:0.5b',
  'model-8B',
  'x:7bit',
  'x:7b',
  'name-70B-instruct',
  'nosize',
  'v2:latest',
  'a-b-c',
  'big:405b',
  'q:3b-instruct',
  'x:7bx-8b',
  '',
]

const CLASSIFY_PLACEMENT_CASES: { name: string; layers: LayerSpec[]; policy?: MappingPolicy }[] = [
  { name: 'snapshot', layers: [SNAP] },
  { name: 'mini', layers: [MINI] },
  { name: 'mini-policy-first-rule-wins', layers: [MINI], policy: QUERY_POLICY_CLASSIFY },
  {
    name: 'mini-policy-require-traits-and-parameters',
    layers: [MINI],
    policy: {
      classify: [
        {
          provider: ['ollama'],
          require_traits: ['embedding'],
          match: [{ id: 'nomic*', tier: 'fast' }],
        },
        { provider: 'ollama', by_parameters: { fast: '<=4B', standard: '<=70B', max: '>70B' } },
      ],
    },
  },
  {
    name: 'mini-policy-families-without-provider',
    layers: [MINI],
    policy: {
      classify: [{ families: { 'claude-sonnet': 'max', gpt: 'fast', 'claude-opus': 'standard' } }],
    },
  },
]

const CHAIN_CASES: {
  name: string
  layers: LayerSpec[]
  policy?: MappingPolicy
  tier: string
  traits: Trait[]
}[] = [
  { name: 'snap-fast', layers: [SNAP], tier: 'fast', traits: [] },
  { name: 'snap-standard', layers: [SNAP], tier: 'standard', traits: [] },
  { name: 'snap-max', layers: [SNAP], tier: 'max', traits: [] },
  { name: 'snap-fast-local', layers: [SNAP], tier: 'fast', traits: ['local'] },
  { name: 'snap-max-reasoning', layers: [SNAP], tier: 'max', traits: ['reasoning'] },
  {
    name: 'snap-max-pin-heads-run',
    layers: [SNAP],
    policy: { pins: { 'codex/max': 'gpt-6.1-sol' } },
    tier: 'max',
    traits: [],
  },
  {
    name: 'snap-max-order',
    layers: [SNAP],
    policy: { order: ['pi', 'claude'] },
    tier: 'max',
    traits: [],
  },
  {
    name: 'image-standard-image-out-takes-image-models',
    layers: [SNAP, IMAGE],
    tier: 'standard',
    traits: ['image-out'],
  },
  {
    name: 'image-standard-never-takes-image-models',
    layers: [SNAP, IMAGE],
    tier: 'standard',
    traits: [],
  },
  {
    name: 'image-standard-vision-never-takes-image-models',
    layers: [SNAP, IMAGE],
    tier: 'standard',
    traits: ['vision'],
  },
  {
    name: 'image-standard-pinned-image-model-not-agent',
    layers: [SNAP, IMAGE],
    policy: { pins: { 'antigravity/standard': 'test-image' } },
    tier: 'standard',
    traits: [],
  },
  { name: 'mini-max', layers: [MINI], tier: 'max', traits: [] },
  { name: 'mini-fast-skips-embedding-and-non-agent', layers: [MINI], tier: 'fast', traits: [] },
  { name: 'mini-standard-skips-withdrawn', layers: [MINI], tier: 'standard', traits: [] },
  {
    name: 'mini-max-trait-filter-hit',
    layers: [MINI],
    tier: 'max',
    traits: ['reasoning', 'long-context'],
  },
  { name: 'mini-max-trait-filter-miss', layers: [MINI], tier: 'max', traits: ['local'] },
  {
    name: 'mini-pin-known-model-not-repeated',
    layers: [MINI],
    policy: { pins: { 'alpha/max': 'big-2' } },
    tier: 'max',
    traits: [],
  },
  {
    name: 'mini-pin-deprecated-model-allowed',
    layers: [MINI],
    policy: QUERY_POLICY_PINS,
    tier: 'max',
    traits: [],
  },
  {
    name: 'mini-pin-unknown-model-stays',
    layers: [MINI],
    policy: QUERY_POLICY_PINS,
    tier: 'fast',
    traits: [],
  },
  {
    name: 'mini-pin-unknown-model-fails-trait-filter',
    layers: [MINI],
    policy: QUERY_POLICY_PINS,
    tier: 'fast',
    traits: ['agent'],
  },
  {
    name: 'mini-pin-embedding-model-skipped',
    layers: [MINI],
    policy: { pins: { 'alpha/fast': 'embed-1' } },
    tier: 'fast',
    traits: [],
  },
  {
    name: 'mini-pin-model-without-agent-trait',
    layers: [MINI],
    policy: { pins: { 'alpha/fast': 'plain-1' } },
    tier: 'fast',
    traits: [],
  },
  {
    name: 'mini-order-policy',
    layers: [MINI],
    policy: QUERY_POLICY_ORDER,
    tier: 'max',
    traits: [],
  },
  { name: 'mini-local-by-parameters', layers: [MINI], tier: 'fast', traits: ['local'] },
  {
    name: 'mini-newest-first-then-larger-context',
    layers: [
      {
        source: 'snapshot',
        observed_at: '2026-10-01',
        providers: { a: { kind: 'anthropic' } },
        tools: { t: { serves: ['a'], openness: 'closed', modes: ['headless'] } },
        models: {
          'a/old': { family: 'claude-opus', release_date: '2026-01-01', traits: ['agent'] },
          'a/new-small': {
            family: 'claude-opus',
            release_date: '2026-06-01',
            traits: ['agent'],
            context: { default: 100 },
          },
          'a/new-big': {
            family: 'claude-opus',
            release_date: '2026-06-01',
            traits: ['agent'],
            context: { max: 500, default: 50 },
          },
          'a/undated': { family: 'claude-opus', traits: ['agent'] },
          'a/same-a': { family: 'claude-opus', release_date: '2026-06-01', traits: ['agent'] },
          'a/same-b': { family: 'claude-opus', release_date: '2026-06-01', traits: ['agent'] },
        },
      },
    ],
    tier: 'max',
    traits: [],
  },
]

// ------------------------------------------------------------------- areas

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
  if (!p.ok) throw new Error(`fixture profile does not parse: ${p.error.message}`)
  return p.value
}

function parsedProfiles(config: unknown): Record<string, Profile> {
  const p = parseProfiles(config)
  if (!p.ok) throw new Error(`fixture profiles do not parse: ${p.error.message}`)
  return p.value
}

function parsedRef(text: string): Ref {
  const r = parseRef(text)
  if (!r.ok) throw new Error(`fixture reference ${text} does not parse`)
  return r.value
}

type WildcardCase = ResolveInput & { name: string; ref: string }

const WILDCARD_CASES: WildcardCase[] = [
  { name: 'mini-fast', layers: [MINI], ref: '*/fast' },
  { name: 'mini-standard', layers: [MINI], ref: '*/standard' },
  { name: 'mini-max', layers: [MINI], ref: '*/max' },
  { name: 'mini-fast-trait-local', layers: [MINI], ref: '*/fast[local]' },
  { name: 'mini-max-traits-hit', layers: [MINI], ref: '*/max[reasoning,long-context]' },
  { name: 'mini-max-keeps-ctx-qualifier', layers: [MINI], ref: '*/max[ctx=500k]' },
  { name: 'mini-max-effort-moves-up', layers: [MINI], ref: '*/max@high' },
  { name: 'mini-max-effort-unresolved-where-none', layers: [MINI], ref: '*/max@medium' },
  { name: 'mini-fast-known-tools', layers: [MINI], knownTools: ['alpha', 'delta'], ref: '*/fast' },
  { name: 'mini-standard-no-candidate', layers: [MINI], knownTools: ['delta'], ref: '*/standard' },
  {
    name: 'mini-max-pin-is-the-head',
    layers: [MINI],
    policy: { pins: { 'alpha/max': 'big-2' } },
    knownTools: ['alpha'],
    ref: '*/max',
  },
  {
    name: 'mini-max-order-policy',
    layers: [MINI],
    policy: { order: ['delta', 'alpha'] },
    ref: '*/max',
  },
  {
    name: 'mini-max-order-policy-repeats-a-tool',
    layers: [MINI],
    policy: { order: ['alpha', 'delta', 'alpha'] },
    ref: '*/max',
  },
  { name: 'image-standard-image-out', layers: [SNAP, IMAGE], ref: '*/standard[image-out]' },
  { name: 'image-standard-plain', layers: [SNAP, IMAGE], ref: '*/standard' },
  {
    name: 'image-standard-pinned-image-model-traced',
    layers: [SNAP, IMAGE],
    policy: { pins: { 'antigravity/standard': 'test-image' } },
    knownTools: ['antigravity'],
    ref: '*/standard',
  },
  { name: 'not-a-wildcard-names-a-model', layers: [MINI], ref: 'alpha/big' },
  { name: 'not-a-wildcard-names-no-model', layers: [MINI], ref: 'alpha' },
  {
    name: 'snapshot-fast-two-tools',
    layers: [SNAP],
    knownTools: ['claude', 'codex'],
    ref: '*/fast',
  },
  {
    name: 'snapshot-max-local-trait',
    layers: [SNAP],
    knownTools: ['claude', 'pi'],
    ref: '*/max[local]',
  },
]

type ProfileParseCase = { name: string; value: unknown }

const PROFILE_PARSE_CASES: ProfileParseCase[] = [
  { name: 'bare-list', value: ['claude/fast', 'codex/fast'] },
  { name: 'bare-list-one-entry', value: ['claude'] },
  {
    name: 'bare-list-wildcard-and-qualifiers',
    value: ['*/fast[local]', 'claude/opus[ctx=1m]@high'],
  },
  { name: 'long-form-order-only', value: { order: ['claude/standard'] } },
  {
    name: 'long-form-host-and-context',
    value: { order: ['claude/standard', 'codex/standard'], host: 'tmux', context: '1m' },
  },
  { name: 'long-form-context-200k', value: { order: ['claude/fast'], context: '200k' } },
  { name: 'empty-list', value: [] },
  { name: 'long-form-empty-order', value: { order: [] } },
  { name: 'long-form-missing-order', value: { host: 'tmux' } },
  { name: 'long-form-unknown-key', value: { order: ['claude/fast'], headless: true } },
  { name: 'long-form-host-not-a-string', value: { order: ['claude/fast'], host: 3 } },
  { name: 'long-form-host-null', value: { order: ['claude/fast'], host: null } },
  { name: 'long-form-context-not-a-string', value: { order: ['claude/fast'], context: 1000000 } },
  { name: 'list-with-a-number', value: ['claude/fast', 3] },
  { name: 'a-string', value: 'claude/fast' },
  { name: 'a-number', value: 7 },
  { name: 'null', value: null },
  { name: 'invalid-ref-names-the-index', value: ['claude/fast', 'claude/opus[1m]'] },
  { name: 'invalid-ref-first-wins', value: ['', 'claude/opus[1m]'] },
  { name: 'invalid-ref-wildcard-without-tier', value: ['claude/fast', '*'] },
  { name: 'invalid-ref-in-long-form', value: { order: ['nope nope'], context: '1m' } },
  { name: 'invalid-context-fraction', value: { order: ['claude/fast'], context: '1.5m' } },
  { name: 'invalid-context-zero', value: { order: ['claude/fast'], context: '0k' } },
  { name: 'invalid-context-no-unit', value: { order: ['claude/fast'], context: '1000' } },
  {
    name: 'invalid-context-above-the-largest-size',
    value: { order: ['claude/fast'], context: '99999999999999999999999m' },
  },
  {
    name: 'invalid-ref-before-invalid-context',
    value: { order: ['claude/opus[1m]'], context: 'big' },
  },
]

const PROFILES_PARSE_CASES: ProfileParseCase[] = [
  { name: 'no-section-gives-the-builtins', value: {} },
  {
    name: 'a-section-beside-the-builtins',
    value: {
      mechanical: ['pi/qwen2.5-coder:7b', 'claude/fast', 'codex/fast'],
      reviewer: { order: ['codex/max', 'claude/opus-5.5@high'], host: 'tmux', context: '200k' },
    },
  },
  { name: 'redefining-default-replaces-it-whole', value: { default: ['claude/max'] } },
  {
    name: 'redefining-small-keeps-the-builtin-position',
    value: { zeta: ['claude/fast'], small: { order: ['codex/fast'], context: '1m' } },
  },
  { name: 'a-profile-with-a-shape-error', value: { good: ['claude/fast'], bad: [] } },
  { name: 'a-profile-with-an-unknown-key', value: { bad: { order: ['claude/fast'], nope: 1 } } },
  { name: 'a-bad-ref-names-the-profile', value: { mine: ['claude/fast', 'claude/opus[1m]'] } },
  {
    name: 'a-bad-context-names-the-profile',
    value: { mine: { order: ['claude/fast'], context: 'x' } },
  },
  {
    name: 'the-first-bad-profile-wins',
    value: { a: ['bad ref'], b: { order: ['claude/fast'], context: 'x' } },
  },
  {
    // Keys are not alphabetical: `z` reports before `a`, so a sorted map would change the answer.
    name: 'profile-order-follows-the-section-not-the-alphabet',
    value: { zeta: ['bad ref'], alpha: ['claude/opus[1m]'] },
  },
  {
    name: 'a-builtin-is-checked-too-when-overridden-badly',
    value: { default: ['claude/opus[1m]'] },
  },
  { name: 'top-level-array', value: [['claude/fast']] },
  { name: 'top-level-null', value: null },
  { name: 'top-level-string', value: 'default' },
  // JSON.parse (and a YAML load) makes `__proto__` an own key; it is refused, not dropped.
  {
    name: 'a-proto-key-is-refused',
    value: JSON.parse('{"ok": ["claude"], "__proto__": ["claude/fast"]}'),
  },
]

type WalkCase = ResolveInput & {
  name: string
  /** A profile in config form (`parseProfile` reads it). */
  profile: unknown
  /** What the availability callback answers, by entry text; an entry not listed is available. */
  availability?: Scripted
}

const AVAILABILITY_ROWS: [AvailabilityReason, string | undefined][] = [
  ['not-installed', undefined],
  ['not-signed-in', 'ANTHROPIC_API_KEY is not set'],
  ['over-budget', undefined],
  ['cooling-down', 'rate limited until 14:00'],
  ['provider-unreachable', 'ollama is not answering on :11434'],
  ['model-not-present', 'ollama does not list qwen3:4b'],
  ['not-launchable', 'no headless launch for gamma'],
  ['other-tool', undefined],
  ['untrusted-fork', 'cursor may not run on a fork'],
]

const WALK_CASES: WalkCase[] = [
  // One row of the README skip-reason table each: an entry set aside, the next one taken.
  ...AVAILABILITY_ROWS.map(([reason, detail]): WalkCase => ({
    name: `skip-${reason}${detail === undefined ? '' : '-with-detail'}`,
    layers: [MINI],
    profile: ['alpha/standard', 'beta/standard'],
    availability: { 'alpha/standard': { reason, ...(detail !== undefined ? { detail } : {}) } },
  })),
  {
    name: 'skip-not-agent-from-a-wildcard',
    layers: [MINI],
    knownTools: ['alpha'],
    profile: ['*/fast'],
  },
  {
    name: 'image-out-wildcard-takes-an-image-model',
    layers: [SNAP, IMAGE],
    knownTools: ['antigravity'],
    profile: ['*/standard[image-out]'],
  },
  {
    name: 'plain-wildcard-never-picks-an-image-model',
    layers: [SNAP, IMAGE],
    knownTools: ['antigravity'],
    profile: ['*/standard'],
  },
  {
    name: 'skip-pinned-image-model-not-agent',
    layers: [SNAP, IMAGE],
    policy: { pins: { 'antigravity/standard': 'test-image' } },
    knownTools: ['antigravity'],
    profile: ['*/standard'],
  },
  {
    name: 'skip-missing-trait-on-a-tier-entry',
    layers: [MINI],
    profile: ['alpha/standard[reasoning]', 'beta/standard'],
  },
  {
    name: 'skip-missing-trait-from-a-wildcard',
    layers: [MINI],
    profile: ['*/max[local]'],
    knownTools: ['alpha', 'gamma'],
  },
  {
    name: 'skip-unresolved-wildcard-candidate',
    layers: [MINI],
    knownTools: ['alpha', 'gamma'],
    profile: ['*/max@high'],
  },
  { name: 'skip-withdrawn-model', layers: [MINI], profile: ['alpha/gone-1', 'beta/standard'] },
  {
    name: 'skip-below-context-entry',
    layers: [MINI],
    profile: ['alpha/big[ctx=500k]', 'delta/large'],
  },
  {
    name: 'skip-below-context-from-the-profile',
    layers: [MINI],
    profile: { order: ['alpha/big', 'gamma/anthropic/big-2'], context: '500k' },
  },
  {
    name: 'skip-below-context-wildcard-candidate',
    layers: [MINI],
    knownTools: ['alpha', 'beta', 'delta'],
    profile: ['*/max[ctx=500k]', 'beta/standard'],
  },
  {
    name: 'skip-no-candidate-wildcard',
    layers: [MINI],
    knownTools: ['delta'],
    profile: ['*/standard', 'delta/tiny'],
  },
  // The walk's other outcomes.
  { name: 'first-entry-is-taken', layers: [MINI], profile: ['alpha/standard', 'beta/standard'] },
  {
    name: 'none-when-every-entry-is-unavailable',
    layers: [MINI],
    profile: ['alpha/standard', 'beta/standard'],
    availability: {
      'alpha/standard': { reason: 'not-installed' },
      'beta/standard': { reason: 'over-budget', detail: 'weekly cap' },
    },
  },
  {
    name: 'none-when-every-entry-is-skipped-by-the-catalogue',
    layers: [MINI],
    profile: ['alpha/gone-1', 'alpha/standard[reasoning]'],
  },
  {
    // The same entry twice: a skip belongs to its entry, not its text, so only the chosen
    // entry's own cooling skip is dropped and the later duplicate's stays listed.
    name: 'a-duplicate-cooling-entry-keeps-the-other-skip',
    layers: [MINI],
    profile: ['alpha/standard', 'alpha/standard'],
    availability: { 'alpha/standard': { reason: 'cooling-down' } },
  },
  {
    name: 'cooling-entry-yields-to-an-available-one',
    layers: [MINI],
    profile: ['alpha/standard', 'beta/standard'],
    availability: { 'alpha/standard': { reason: 'cooling-down' } },
  },
  {
    name: 'all-cooling-takes-the-first-cooling-entry',
    layers: [MINI],
    profile: ['alpha/standard', 'beta/standard', 'gamma/standard'],
    availability: {
      'alpha/standard': { reason: 'cooling-down', detail: 'reset at 14:00' },
      'beta/standard': { reason: 'cooling-down' },
      'gamma/standard': { reason: 'not-installed' },
    },
  },
  {
    name: 'one-cooling-entry-among-unavailable-is-taken',
    layers: [MINI],
    profile: ['alpha/standard', 'beta/standard'],
    availability: {
      'alpha/standard': { reason: 'not-installed' },
      'beta/standard': { reason: 'cooling-down' },
    },
  },
  {
    name: 'invalid-unknown-tool',
    layers: [MINI],
    profile: ['nope/fast', 'alpha/standard'],
  },
  {
    name: 'invalid-collects-every-error',
    layers: [MINI],
    profile: ['nope/fast', 'beta/fast', 'alpha/big@none', 'alpha/standard'],
  },
  {
    name: 'invalid-ctx-beyond-the-model-anywhere',
    layers: [MINI],
    profile: ['alpha/big[ctx=2m]', 'alpha/standard'],
  },
  {
    name: 'invalid-strict-unknown-model',
    layers: [MINI],
    strict: true,
    profile: ['alpha/not-a-model', 'alpha/standard'],
  },
  {
    name: 'invalid-tool-outside-known-tools',
    layers: [MINI],
    knownTools: ['alpha'],
    profile: ['beta/standard'],
  },
  // Warnings and notes the trace carries.
  { name: 'warning-deprecated-model', layers: [MINI], profile: ['alpha/big-1'] },
  { name: 'warning-unknown-model', layers: [MINI], profile: ['alpha/mystery-9'] },
  { name: 'warning-effort-moved-up', layers: [MINI], profile: ['alpha/standard@minimal'] },
  { name: 'warning-effort-moved-down', layers: [MINI], profile: ['beta/standard@xhigh'] },
  {
    name: 'warning-context-not-checked',
    layers: [MINI],
    profile: ['alpha/standard[ctx=100k]'],
  },
  {
    name: 'warning-context-not-checked-from-the-profile',
    layers: [MINI],
    profile: { order: ['alpha/standard'], context: '200k' },
  },
  {
    name: 'context-max-becomes-the-offered-size',
    layers: [MINI],
    profile: ['alpha/big[ctx=max]'],
  },
  {
    name: 'context-met-by-the-profile',
    layers: [MINI],
    profile: { order: ['alpha/big'], context: '100k' },
  },
  {
    name: 'pinned-tier-is-traced',
    layers: [MINI],
    policy: { pins: { 'alpha/standard': 'mid-1' } },
    profile: ['alpha/standard'],
  },
  { name: 'tool-default-model', layers: [MINI], profile: ['alpha', 'beta'] },
  {
    name: 'tool-default-model-with-effort-unchecked',
    layers: [MINI],
    profile: ['delta@high'],
  },
  {
    name: 'wildcard-candidate-with-effort-unchecked-warns',
    layers: [SNAP],
    knownTools: ['opencode'],
    profile: ['*/fast@high'],
    // Everything before the first candidate the catalogue declares no levels for is out.
    availability: Object.fromEntries(
      [
        'opencode/fast@high',
        'opencode/openai/gpt-6-luna@high',
        'opencode/google/gemini-3.5-flash-lite@high',
        'opencode/google/gemini-flash-lite-latest@high',
        'opencode/openai/gpt-5.6-luna@high',
        'opencode/google/gemini-3.1-flash-lite@high',
      ].map((ref) => [ref, { reason: 'not-installed' }]),
    ),
  },
  {
    name: 'wildcard-expands-then-first-available-is-taken',
    layers: [MINI],
    knownTools: ['alpha', 'gamma'],
    profile: ['*/fast'],
    availability: { 'alpha/fast': { reason: 'not-installed' } },
  },
  {
    name: 'wildcard-all-unavailable-is-none',
    layers: [MINI],
    knownTools: ['delta'],
    profile: ['*/fast'],
    availability: { 'delta/fast': { reason: 'provider-unreachable' } },
  },
  {
    name: 'a-chosen-entry-is-not-in-skipped',
    layers: [MINI],
    knownTools: ['alpha', 'beta'],
    profile: ['*/max', 'beta/standard'],
    availability: {
      'alpha/max': { reason: 'not-installed' },
      'alpha/claude-nope': { reason: 'over-budget' },
    },
  },
  // The built-in profiles on the shipped snapshot.
  {
    name: 'builtin-default-skips-an-uninstalled-tool',
    layers: [SNAP],
    knownTools: ['claude', 'codex'],
    profile: BUILTIN_PROFILES.default!,
    availability: { 'claude/standard': { reason: 'not-installed' } },
  },
  {
    name: 'builtin-small-first-entry',
    layers: [SNAP],
    knownTools: ['claude', 'codex'],
    profile: BUILTIN_PROFILES.small!,
  },
  {
    name: 'snapshot-reviewer-profile',
    layers: [SNAP],
    profile: ['codex/max', 'claude/opus-5.5@high'],
    availability: { 'codex/max': { reason: 'not-signed-in', detail: 'codex login' } },
  },
  {
    name: 'snapshot-ctx-and-effort',
    layers: [SNAP],
    profile: ['claude/opus[ctx=1m]@high', 'codex/max'],
  },
]

type ResolveCase = ResolveInput & { name: string; ref: string }

const RESOLVE_CASES: ResolveCase[] = [
  { name: 'tool-only', layers: [MINI], ref: 'alpha' },
  { name: 'tier', layers: [MINI], ref: 'alpha/standard' },
  { name: 'tier-via-alias-head', layers: [MINI], ref: 'alpha/max' },
  {
    name: 'tier-pinned',
    layers: [MINI],
    policy: { pins: { 'alpha/max': 'big-2' } },
    ref: 'alpha/max',
  },
  { name: 'named-model', layers: [MINI], ref: 'alpha/mid-1' },
  { name: 'named-by-native-name', layers: [MINI], ref: 'delta/tiny' },
  { name: 'qualifiers-ride-on-text', layers: [MINI], ref: 'alpha/standard[reasoning,ctx=200k]' },
  { name: 'effort-accepted', layers: [MINI], ref: 'alpha/standard@medium' },
  { name: 'effort-moved-up', layers: [MINI], ref: 'alpha/standard@minimal' },
  { name: 'effort-moved-up-on-beta', layers: [MINI], ref: 'beta/standard@low' },
  { name: 'effort-moved-down', layers: [MINI], ref: 'beta/standard@xhigh' },
  { name: 'effort-unchecked-without-declared-levels', layers: [MINI], ref: 'delta@high' },
  { name: 'effort-kept-on-text-as-asked', layers: [MINI], ref: 'alpha/big@xhigh' },
  { name: 'wildcard-is-an-error', layers: [MINI], ref: '*/fast' },
  { name: 'wildcard-with-effort-is-an-error', layers: [MINI], ref: '*/max@high' },
  { name: 'error-unknown-tool', layers: [MINI], ref: 'nope/fast' },
  {
    name: 'error-tool-outside-known-tools',
    layers: [MINI],
    knownTools: ['alpha'],
    ref: 'beta/standard',
  },
  { name: 'error-no-tier-entry', layers: [MINI], ref: 'beta/fast' },
  { name: 'error-provider-not-served-with-hint', layers: [SNAP], ref: 'codex/sonnet' },
  { name: 'error-provider-not-served-by-the-tool', layers: [MINI], ref: 'beta/anthropic/small-1' },
  { name: 'error-model-not-offered', layers: [MINI], ref: 'delta/mid-1' },
  { name: 'error-unsupported-effort', layers: [MINI], ref: 'alpha/big@none' },
  {
    name: 'error-effort-on-a-tool-that-takes-none',
    layers: [MINI],
    ref: 'gamma/anthropic/small-1@high',
  },
  {
    name: 'error-unknown-model-under-strict',
    layers: [MINI],
    strict: true,
    ref: 'alpha/not-a-model',
  },
  { name: 'warning-unknown-model', layers: [MINI], ref: 'alpha/not-a-model' },
  { name: 'warning-deprecated-model', layers: [MINI], ref: 'alpha/big-1' },
  {
    name: 'warning-deprecated-model-under-strict',
    layers: [MINI],
    strict: true,
    ref: 'alpha/big-1',
  },
  { name: 'skip-withdrawn-model', layers: [MINI], ref: 'alpha/gone-1' },
  { name: 'snapshot-family-name', layers: [SNAP], ref: 'claude/opus-5.5@high' },
  { name: 'snapshot-tier-effort', layers: [SNAP], ref: 'claude/max@high' },
]

type BindingCase = ResolveInput & {
  name: string
  /** A `profiles:` section; the built-in profiles are added (`parseProfiles`). */
  profiles: unknown
  binding: Binding
  availability?: Scripted
}

const BINDING_CASES: BindingCase[] = [
  {
    name: 'a-named-profile',
    layers: [MINI],
    profiles: { review: ['alpha/standard', 'beta/standard'] },
    binding: { profile: 'review' },
  },
  {
    name: 'a-named-profile-walks-with-availability',
    layers: [MINI],
    profiles: { review: ['alpha/standard', 'beta/standard'] },
    binding: { profile: 'review' },
    availability: { 'alpha/standard': { reason: 'not-installed' } },
  },
  {
    name: 'a-builtin-profile',
    layers: [MINI],
    knownTools: ['alpha', 'beta'],
    profiles: {},
    binding: { profile: 'default' },
  },
  {
    name: 'an-invalid-profile-is-an-ok-invalid-choice',
    layers: [MINI],
    profiles: { broken: ['nope/fast'] },
    binding: { profile: 'broken' },
  },
  {
    name: 'an-inline-profile-walks-with-availability',
    layers: [MINI],
    profiles: {},
    binding: { profile: ['alpha/standard', 'beta/standard'] },
    availability: { 'alpha/standard': { reason: 'not-installed' } },
  },
  {
    // Config read from YAML can carry other keys; the walk ignores them.
    name: 'an-unknown-key-is-ignored',
    layers: [MINI],
    profiles: { review: ['alpha/standard', 'beta/standard'] },
    binding: { profile: 'review', note: 'x' } as Binding,
  },
  {
    name: 'error-inline-profile-bad-ref',
    layers: [MINI],
    profiles: {},
    binding: { profile: ['alpha', 'alpha/opus[1m]'] },
  },
  {
    name: 'error-inline-profile-empty',
    layers: [MINI],
    profiles: {},
    binding: { profile: [] },
  },
  {
    name: 'error-inline-profile-non-string-entry',
    layers: [MINI],
    profiles: {},
    binding: { profile: ['alpha', 3] as unknown as string[] },
  },
  {
    name: 'error-inline-profile-object',
    layers: [MINI],
    profiles: {},
    binding: { profile: { order: ['alpha/standard'] } as unknown as string[] },
  },
  {
    name: 'error-inline-profile-null',
    layers: [MINI],
    profiles: {},
    binding: { profile: null as unknown as string[] },
  },
  {
    name: 'a-tool-reference',
    layers: [MINI],
    profiles: {},
    binding: { tool: 'alpha/mid-1' },
  },
  {
    name: 'a-tool-reference-unavailable',
    layers: [MINI],
    profiles: {},
    binding: { tool: 'alpha/mid-1' },
    availability: { 'alpha/mid-1': { reason: 'model-not-present' } },
  },
  {
    name: 'a-wildcard-tool-reference-walks-the-chain',
    layers: [MINI],
    knownTools: ['alpha', 'gamma'],
    profiles: {},
    binding: { tool: '*/fast' },
    availability: { 'alpha/fast': { reason: 'cooling-down' } },
  },
  {
    name: 'a-tool-reference-that-does-not-resolve',
    layers: [MINI],
    profiles: {},
    binding: { tool: 'nope/fast' },
  },
  {
    name: 'error-both-set',
    layers: [MINI],
    profiles: {},
    binding: { profile: 'default', tool: 'alpha' },
  },
  { name: 'error-neither-set', layers: [MINI], profiles: {}, binding: {} },
  {
    name: 'error-unknown-profile-lists-the-known-sorted',
    layers: [MINI],
    profiles: { zeta: ['alpha'], alpha: ['alpha'] },
    binding: { profile: 'nope' },
  },
  {
    name: 'error-unknown-profile-inherited-name',
    layers: [MINI],
    profiles: {},
    binding: { profile: 'constructor' },
  },
  { name: 'error-invalid-ref', layers: [MINI], profiles: {}, binding: { tool: 'alpha/opus[1m]' } },
  { name: 'error-empty-ref', layers: [MINI], profiles: {}, binding: { tool: '' } },
  {
    name: 'error-tool-a-number',
    layers: [MINI],
    profiles: {},
    binding: { tool: 5 as unknown as string },
  },
  {
    name: 'error-tool-a-list',
    layers: [MINI],
    profiles: {},
    binding: { tool: ['alpha'] as unknown as string },
  },
  {
    name: 'error-tool-null',
    layers: [MINI],
    profiles: {},
    binding: { tool: null as unknown as string },
  },
]

const ROUTING_VOCABULARY = {
  complexity: ['small', 'medium', 'large'],
  autonomy: ['supervised', 'autonomous'],
}

const ROUTING_PARSE_CASES: { name: string; value: unknown; vocabulary?: unknown }[] = [
  { name: 'empty-list', value: [] },
  {
    name: 'two-rules',
    value: [
      { when: { workflow: 'implement', complexity: 'small' }, profile: 'small' },
      { when: { workflow: 'implement', complexity: 'large', tags: ['ui', 'db'] }, profile: 'deep' },
    ],
  },
  {
    name: 'every-key',
    value: [
      {
        when: {
          workflow: 'w',
          stage: 's',
          complexity: 'c',
          impact: 'i',
          autonomy: 'a',
          tags: ['t'],
        },
        profile: 'p',
      },
    ],
  },
  { name: 'empty-when-matches-everything', value: [{ when: {}, profile: 'fallback' }] },
  {
    name: 'values-are-trimmed',
    value: [{ when: { workflow: '  implement  ', tags: [' ui '] }, profile: '  deep ' }],
  },
  {
    name: 'vocabulary-accepts',
    value: [{ when: { complexity: 'small', autonomy: 'autonomous' }, profile: 'small' }],
    vocabulary: ROUTING_VOCABULARY,
  },
  {
    name: 'vocabulary-rejects-a-value',
    value: [
      { when: { complexity: 'small' }, profile: 'small' },
      { when: { complexity: 'low' }, profile: 'small' },
    ],
    vocabulary: ROUTING_VOCABULARY,
  },
  {
    name: 'vocabulary-rejects-a-tag',
    value: [{ when: { tags: ['ui', 'nope'] }, profile: 'x' }],
    vocabulary: { tags: ['ui', 'db'] },
  },
  {
    name: 'vocabulary-first-rule-first-key-wins',
    value: [{ when: { autonomy: 'wild', complexity: 'huge' }, profile: 'x' }],
    vocabulary: ROUTING_VOCABULARY,
  },
  {
    name: 'a-key-without-a-vocabulary-takes-any-value',
    value: [{ when: { workflow: 'anything' }, profile: 'x' }],
    vocabulary: ROUTING_VOCABULARY,
  },
  { name: 'shape-not-an-array', value: { when: {}, profile: 'x' } },
  { name: 'shape-null', value: null },
  { name: 'shape-rule-not-an-object', value: [{ when: {}, profile: 'x' }, 'nope'] },
  { name: 'shape-unknown-when-key', value: [{ when: { size: 'small' }, profile: 'x' }] },
  { name: 'shape-unknown-rule-key', value: [{ when: {}, profile: 'x', extra: 1 }] },
  { name: 'shape-missing-profile', value: [{ when: { workflow: 'w' } }] },
  { name: 'shape-missing-when', value: [{ profile: 'x' }] },
  { name: 'shape-empty-profile', value: [{ when: {}, profile: '' }] },
  { name: 'shape-blank-profile', value: [{ when: {}, profile: '   ' }] },
  { name: 'shape-empty-value', value: [{ when: { workflow: '' }, profile: 'x' }] },
  { name: 'shape-empty-tags', value: [{ when: { tags: [] }, profile: 'x' }] },
  { name: 'shape-tags-not-an-array', value: [{ when: { tags: 'ui' }, profile: 'x' }] },
  { name: 'shape-blank-tag', value: [{ when: { tags: ['ui', ' '] }, profile: 'x' }] },
  { name: 'shape-value-not-a-string', value: [{ when: { workflow: 3 }, profile: 'x' }] },
  {
    name: 'shape-second-rule-index',
    value: [
      { when: {}, profile: 'x' },
      { when: {}, profile: 3 },
    ],
  },
]

const R = (when: object, profile: string): { when: object; profile: string } => ({ when, profile })

const ROUTING_MATCH_RULES = [
  R({ workflow: 'implement', complexity: 'small' }, 'small'),
  R({ workflow: 'implement', complexity: 'large' }, 'deep'),
  R({ tags: ['ui', 'design'] }, 'visual'),
  R({ workflow: 'review', stage: 'pr', impact: 'high', autonomy: 'supervised' }, 'reviewer'),
  R({ workflow: 'implement' }, 'implement'),
  R({}, 'fallback'),
]

const ROUTING_MATCH_CASES: { name: string; rules: object[]; request: object }[] = [
  {
    name: 'first-rule',
    rules: ROUTING_MATCH_RULES,
    request: { workflow: 'implement', complexity: 'small' },
  },
  {
    name: 'second-rule',
    rules: ROUTING_MATCH_RULES,
    request: { workflow: 'implement', complexity: 'large' },
  },
  {
    name: 'tags-match-any-listed',
    rules: ROUTING_MATCH_RULES,
    request: { tags: ['bug', 'design'] },
  },
  { name: 'tags-none-listed', rules: ROUTING_MATCH_RULES.slice(2, 3), request: { tags: ['bug'] } },
  {
    name: 'request-without-tags-misses-a-tags-rule',
    rules: ROUTING_MATCH_RULES.slice(2, 3),
    request: { workflow: 'x' },
  },
  {
    name: 'every-key-must-hold',
    rules: ROUTING_MATCH_RULES.slice(3, 4),
    request: { workflow: 'review', stage: 'pr', impact: 'high', autonomy: 'supervised' },
  },
  {
    name: 'one-key-off-misses',
    rules: ROUTING_MATCH_RULES.slice(3, 4),
    request: { workflow: 'review', stage: 'pr', impact: 'low', autonomy: 'supervised' },
  },
  {
    name: 'a-key-the-request-lacks-does-not-hold',
    rules: ROUTING_MATCH_RULES.slice(3, 4),
    request: { workflow: 'review', stage: 'pr', impact: 'high' },
  },
  {
    name: 'falls-through-to-the-fallback',
    rules: ROUTING_MATCH_RULES,
    request: { workflow: 'triage' },
  },
  { name: 'empty-request-matches-the-empty-when', rules: ROUTING_MATCH_RULES, request: {} },
  {
    name: 'no-rule-matches',
    rules: ROUTING_MATCH_RULES.slice(0, 2),
    request: { workflow: 'triage' },
  },
  { name: 'no-rules', rules: [], request: { workflow: 'implement' } },
  {
    name: 'order-decides',
    rules: [
      R({ workflow: 'implement' }, 'broad'),
      R({ workflow: 'implement', complexity: 'small' }, 'narrow'),
    ],
    request: { workflow: 'implement', complexity: 'small' },
  },
  {
    name: 'values-compare-exactly',
    rules: [R({ workflow: 'implement' }, 'x')],
    request: { workflow: 'Implement' },
  },
]

const ROUTING_SHADOW_CASES: { name: string; rules: object[] }[] = [
  { name: 'none-shadowed', rules: ROUTING_MATCH_RULES.slice(0, 2) },
  {
    name: 'identical-rule-is-shadowed',
    rules: [R({ workflow: 'w' }, 'a'), R({ workflow: 'w' }, 'b')],
  },
  {
    name: 'broader-earlier-shadows-narrower',
    rules: [R({ workflow: 'w' }, 'a'), R({ workflow: 'w', complexity: 'small' }, 'b')],
  },
  {
    name: 'narrower-earlier-does-not-shadow',
    rules: [R({ workflow: 'w', complexity: 'small' }, 'a'), R({ workflow: 'w' }, 'b')],
  },
  {
    name: 'empty-when-shadows-everything-after',
    rules: [R({}, 'a'), R({ workflow: 'w' }, 'b'), R({ tags: ['ui'] }, 'c')],
  },
  {
    name: 'reports-the-first-shadowing-rule',
    rules: [
      R({ stage: 's' }, 'a'),
      R({ workflow: 'w' }, 'b'),
      R({ workflow: 'w', stage: 's' }, 'c'),
    ],
  },
  {
    name: 'tags-subset-is-shadowed',
    rules: [R({ tags: ['ui', 'db'] }, 'a'), R({ tags: ['ui'] }, 'b')],
  },
  {
    name: 'tags-superset-is-not-shadowed',
    rules: [R({ tags: ['ui'] }, 'a'), R({ tags: ['ui', 'db'] }, 'b')],
  },
  {
    name: 'tags-broad-without-tags-narrow-is-not-shadowed',
    rules: [R({ tags: ['ui'] }, 'a'), R({ workflow: 'w' }, 'b')],
  },
  {
    name: 'tags-absent-in-broad-is-covered',
    rules: [R({ workflow: 'w' }, 'a'), R({ workflow: 'w', tags: ['ui'] }, 'b')],
  },
  {
    name: 'different-values-do-not-shadow',
    rules: [R({ workflow: 'a' }, 'x'), R({ workflow: 'b' }, 'y')],
  },
  { name: 'no-rules', rules: [] },
]

const ROUTING_FORMAT_CASES: { name: string; when: object }[] = [
  { name: 'empty', when: {} },
  { name: 'one-key', when: { workflow: 'implement' } },
  {
    name: 'display-order-not-insertion-order',
    when: { tags: ['ui', 'db'], complexity: 'small', workflow: 'implement' },
  },
  {
    name: 'every-key',
    when: { workflow: 'w', stage: 's', complexity: 'c', impact: 'i', autonomy: 'a', tags: ['t'] },
  },
]

const SKIP_TEXT_CASES: { name: string; reason: string; detail?: string }[] =
  PROFILE_SKIP_REASONS.flatMap((reason) => [
    { name: `${reason}-without-detail`, reason },
    { name: `${reason}-with-detail`, reason, detail: 'the detail text' },
  ])

export const AREAS: Area[] = [
  {
    file: 'ref/parse',
    description:
      'parseRef: the README reference table, the parsing rules and every typed error; `formatted` is formatRef of the parsed reference',
    run: (input: { text: string }) => {
      const r = parseRef(input.text)
      return r.ok
        ? { ok: true, ref: r.value, formatted: formatRef(r.value) }
        : { ok: false, error: r.error }
    },
    vectors: PARSE_TEXTS.map(([name, text]) => v(name, { text })),
  },
  {
    file: 'ref/format',
    description: 'formatRef: canonical qualifier order, size rounding, empty qualifiers',
    run: (input: Ref) => formatRef(input),
    vectors: REF_FORMATS.map(([name, ref]) => v(name, ref)),
  },
  {
    file: 'context/size',
    description: 'parseSize and formatSize: the `ctx=` size grammar',
    run: (input: { fn: 'parse' | 'format'; value: string | number }) =>
      input.fn === 'parse'
        ? (parseSize(input.value as string) ?? null)
        : formatSize(input.value as number),
    vectors: [
      ...SIZE_PARSE.map((t) => v(`parse-${JSON.stringify(t)}`, { fn: 'parse', value: t })),
      ...SIZE_FORMAT.map((n) => v(`format-${n}`, { fn: 'format', value: n })),
    ],
  },
  {
    file: 'context/args',
    description: 'contextArgs: a size in each tool’s own form, and when it is unchecked',
    run: (input: { tool: string; model?: string; ctx: number; defaultContext?: number }) =>
      contextArgs(input.tool, input.model, input.ctx, input.defaultContext),
    vectors: ARGS_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'context/default-window',
    description: 'defaultWindow: the offering’s default before the model’s, never a max',
    run: (input: { layers: LayerSpec[]; tool: string; model?: string }) =>
      defaultWindow(query(input), input.tool, input.model) ?? null,
    vectors: DEFAULT_WINDOW_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'context/check',
    description: 'checkContext: the README context table (error, skip, unchecked, ctx=max)',
    run: (input: {
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
    vectors: CHECK_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'effort/adjust',
    description: 'adjustEffort and effortAdjustedMessage: at most one step, up first',
    run: (input: { effort: string; supported: string[] }) => {
      const result = adjustEffort(input.effort, input.supported)
      return {
        result: result ?? null,
        message: result?.adjusted === undefined ? null : effortAdjustedMessage(result.adjusted),
      }
    },
    vectors: EFFORT_CASES.map(([name, effort, supported]) => v(name, { effort, supported })),
  },
  {
    file: 'validity/check-ref',
    description:
      'checkRef: the README validity table (error, skip, warning, ok) on the snapshot and a small catalogue',
    run: (input: { layers: LayerSpec[]; ref: string; ctx?: CheckContext }) => {
      const ref = parseRef(input.ref)
      if (!ref.ok) throw new Error(`fixture reference ${input.ref} does not parse`)
      return checkRef(ref.value, query(input), input.ctx)
    },
    vectors: VALIDITY_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'catalogue/schema-snapshot',
    description: 'SnapshotLayerSchema: documents the strict schema accepts and rejects',
    run: schemaAccepted(SnapshotLayerSchema),
    vectors: SNAPSHOT_DOCS.map(([name, document]) => v(name, { document })),
  },
  {
    file: 'catalogue/schema-machine',
    description: 'MachineCatalogueSchema: documents the strict schema accepts and rejects',
    run: schemaAccepted(MachineCatalogueSchema),
    vectors: MACHINE_DOCS.map(([name, document]) => v(name, { document })),
  },
  {
    file: 'catalogue/layers',
    description: 'layerCatalogue: layering, per-field provenance, required fields and problems',
    run: (input: { layers: LayerSpec[]; summary?: boolean; strict?: boolean }) => {
      const c = layerCatalogue(layers(input), { strict: input.strict })
      return input.summary === true ? plainCatalogueSummary(c) : c
    },
    vectors: LAYER_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'catalogue/offerings',
    description:
      'deriveOfferings and nativeName: derived rows, router.offerings add/remove, native-name order',
    run: (input: { layers: LayerSpec[]; lines?: boolean }) => {
      const offerings = deriveOfferings(layerCatalogue(layers(input)))
      return input.lines === true
        ? offerings.map(
            (o) =>
              `${o.tool} ${o.model} ${o.native_name}${o.via === undefined ? '' : ` via ${o.via}`}`,
          )
        : offerings
    },
    vectors: OFFERING_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'catalogue/query',
    description:
      'queryCatalogue: findModel, modelsFor, offering, tierOf, tierModel, pinned, effortsFor',
    run: queryResult,
    vectors: QUERY_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'catalogue/classify',
    description: 'classify and parameterCount: classifier rules, policy rules first',
    run: (
      input:
        | { fn: 'parameterCount'; id: string }
        | { fn: 'placements'; layers: LayerSpec[]; policy?: MappingPolicy },
    ) => {
      if (input.fn === 'parameterCount') return parameterCount(input.id) ?? null
      const c = layerCatalogue(layers(input))
      return classify(c, [...(input.policy?.classify ?? []), ...BUILTIN_CLASSIFY_RULES])
    },
    vectors: [
      ...CLASSIFY_IDS.map((id) =>
        v(`parameter-count-${JSON.stringify(id)}`, { fn: 'parameterCount', id }),
      ),
      ...CLASSIFY_PLACEMENT_CASES.map(({ name, ...input }) =>
        v(`placements-${name}`, { fn: 'placements', ...input }),
      ),
    ],
  },
  {
    file: 'catalogue/chains',
    description: 'expandChain: tool order, newest first, pins, trait filters and the skipped list',
    run: (input: { layers: LayerSpec[]; policy?: MappingPolicy; tier: 'fast'; traits: Trait[] }) =>
      expandChain(input.tier, input.traits, query(input)),
    vectors: CHAIN_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'wildcard/expand',
    description:
      'expandWildcard: a wildcard becomes the tier chain, kept to knownTools; the candidates resolved, the others skipped with a code',
    run: (input: ResolveInput & { ref: string }) =>
      expandWildcard(parsedRef(input.ref), resolveContext(input)),
    vectors: WILDCARD_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'profile/parse',
    description:
      'parseProfile: a bare list or the long form, typed errors by entry index; the zod text of a shape error is not mirrored',
    run: (input: { value: unknown }) => withoutShapeMessage(parseProfile(input.value)),
    vectors: PROFILE_PARSE_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'profile/parse-profiles',
    description:
      'parseProfiles: a profiles section beside the built-in profiles; an entry of the same name replaces one whole',
    run: (input: { value: unknown }) => withoutShapeMessage(parseProfiles(input.value)),
    vectors: PROFILES_PARSE_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'walk/choose',
    description:
      'chooseFromProfile under scripted availability, without the author rule: every skip-reason row of the README table, the trace text exactly, the refs the callback was asked, and validateProfile’s errors',
    run: (input: WalkCase) => {
      const profile = parsedProfile(input.profile)
      const ctx = resolveContext(input)
      const asked: string[] = []
      const choice = chooseFromProfile(profile, {
        ...ctx,
        isAvailable: scripted(input.availability, asked),
      })
      return { choice: withoutAuthorFields(choice), asked, errors: validateProfile(profile, ctx) }
    },
    vectors: WALK_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'walk/skip-reason-text',
    description:
      'skipReasonText: the trace’s wording of every skip reason, with and without a detail',
    run: (input: { reason: ProfileSkipReason; detail?: string }) => skipReasonText(input),
    vectors: SKIP_TEXT_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'resolve/resolve',
    description:
      'resolveRef: tier, pin, name and default models; effort moved or unchecked; the check riding along; every error kind',
    run: (input: ResolveInput & { ref: string }) =>
      resolveRef(parsedRef(input.ref), resolveContext(input)),
    vectors: RESOLVE_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'binding/resolve',
    description:
      'resolveBinding: a named profile, an inline profile list or a single reference (a wildcard walks the chain), and the binding errors; an inline list of the wrong shape drops its zod text, which is not mirrored',
    run: (input: BindingCase) => {
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
    vectors: BINDING_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'routing/parse',
    description:
      'parseRouting: rules with trimmed values, an optional vocabulary, and typed errors by rule index; the zod text of a shape error is not mirrored',
    run: (input: { value: unknown; vocabulary?: RoutingVocabulary }) =>
      withoutShapeMessage(parseRouting(input.value, input.vocabulary)),
    vectors: ROUTING_PARSE_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'routing/match',
    description:
      'matchRule: the first rule whose when holds for the request; every key must hold, tags match any',
    run: (input: { rules: RoutingRule[]; request: RouteRequest }) =>
      matchRule(input.rules, input.request) ?? null,
    vectors: ROUTING_MATCH_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'routing/shadow',
    description: 'shadowedRules: the rules an earlier, same-or-broader rule makes unreachable',
    run: (input: { rules: RoutingRule[] }) => shadowedRules(input.rules),
    vectors: ROUTING_SHADOW_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'routing/format-when',
    description: 'formatWhen: a when as the config writes it, in display order',
    run: (input: { when: RoutingWhen }) => formatWhen(input.when),
    vectors: ROUTING_FORMAT_CASES.map(({ name, ...input }) => v(name, input)),
  },
  {
    file: 'constants',
    description:
      'the constants the Rust crate retypes: EFFORT_LEVELS, DEFAULT_CHAIN_ORDER, the built-in classify rules and profiles, the availability and skip reasons, the routing keys',
    run: () => ({
      effort_levels: EFFORT_LEVELS,
      default_chain_order: DEFAULT_CHAIN_ORDER,
      builtin_classify_rules: BUILTIN_CLASSIFY_RULES,
      builtin_profiles: BUILTIN_PROFILES,
      availability_reasons: AVAILABILITY_REASONS,
      profile_skip_reasons: PROFILE_SKIP_REASONS,
      routing_keys: ROUTING_KEYS,
    }),
    vectors: [v('constants', {})],
  },
]

// ----------------------------------------------------------------- rendering

/** The text of a fixture file: pretty-printed JSON, trailing newline. */
export function render(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/** `{ name, input, expected }` for every vector; `expected` is round-tripped through JSON so `undefined` is dropped as the file will. */
export function expand(area: Area): Vector[] {
  const names = new Set<string>()
  return area.vectors.map(({ name, input }) => {
    if (names.has(name)) throw new Error(`${area.file}: duplicate vector name ${name}`)
    names.add(name)
    const expected = area.run(JSON.parse(JSON.stringify(input)))
    return { name, input, expected: JSON.parse(JSON.stringify(expected ?? null)) }
  })
}

/** Every file the emitter owns, by path under `fixtures/`. */
export function emit(): Map<string, string> {
  const files = new Map<string, string>()
  const manifest: { file: string; description: string; vectors: number }[] = []
  for (const area of AREAS) {
    const vectors = expand(area)
    files.set(`${area.file}.json`, render(vectors))
    manifest.push({
      file: `${area.file}.json`,
      description: area.description,
      vectors: vectors.length,
    })
  }
  files.set('layers.json', render(NAMED_LAYERS))
  files.set('manifest.json', render(manifest))
  return files
}

/** The `run` function for a fixture file, for a suite that checks committed vectors. */
export function areaFor(file: string): Area | undefined {
  return AREAS.find((a) => `${a.file}.json` === file)
}
