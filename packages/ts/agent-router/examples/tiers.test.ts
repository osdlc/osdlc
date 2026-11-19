import { describe, expect, test } from 'vitest'
import {
  BUILTIN_CLASSIFY_RULES,
  DEFAULT_CHAIN_ORDER,
  PIN_KEY_PATTERN,
  PinsSchema,
  classify,
  classifyModel,
  expandChain,
  expandWildcard,
  layerCatalogue,
  parseRef,
  pinKey,
  queryCatalogue,
  type CatalogueLayer,
  type ClassifyRule,
  type Model,
} from '@osdlc/agent-router'

// A tiny catalogue of our own, so nothing here depends on the shipped snapshot.
const layer: CatalogueLayer = {
  source: 'config',
  observed_at: '2026-01-01',
  providers: { acme: { kind: 'openai-compatible' } },
  tools: { runner: { serves: ['acme'], openness: 'closed', modes: ['headless'] } },
  models: {
    'acme/mini-1': { family: 'acme-mini', traits: ['agent'], release_date: '2026-01-01' },
    'acme/pro-1': { family: 'acme-pro', traits: ['agent'], release_date: '2026-02-01' },
    'acme/pro-2': { family: 'acme-pro', traits: ['agent'], release_date: '2026-03-01' },
    'acme/embed-1': { family: 'acme-pro', traits: ['embedding'], release_date: '2026-03-01' },
  },
}
const rules: ClassifyRule[] = [
  { provider: 'acme', families: { 'acme-mini': 'fast', 'acme-pro': 'max' } },
]
const catalogue = layerCatalogue([layer])
const query = queryCatalogue(catalogue, { classify: rules })

function model(id: string, provider: string, family?: string): Model {
  return {
    key: `${provider}/${id}`,
    provider,
    id,
    ...(family ? { family } : {}),
    status: 'current',
  }
}

describe('classifying models', () => {
  test('classifyModel places a model by family', () => {
    expect(classifyModel(model('pro-1', 'acme', 'acme-pro'), rules)).toBe('max')
  })

  test('a model no rule places is unclassified', () => {
    expect(classifyModel(model('other', 'acme', 'acme-other'), rules)).toBe('unclassified')
  })

  test('a rule can place by id glob', () => {
    const glob: ClassifyRule[] = [{ match: [{ id: 'acme-*', tier: 'standard' }] }]
    expect(classifyModel(model('acme-mid', 'acme'), glob)).toBe('standard')
  })

  test('a rule can place a local model by the parameter count in its id', () => {
    const bySize: ClassifyRule[] = [
      { provider: 'ollama', by_parameters: { fast: '<10B', max: '>=40B' } },
    ]
    expect(classifyModel(model('qwen3:4b', 'ollama'), bySize)).toBe('fast')
    expect(classifyModel(model('llama3.1:70b', 'ollama'), bySize)).toBe('max')
  })

  test('classify places every model of a catalogue, keyed provider/id', () => {
    expect(classify(catalogue, rules)).toMatchObject({
      'acme/mini-1': 'fast',
      'acme/pro-1': 'max',
      'acme/pro-2': 'max',
    })
  })

  test('BUILTIN_CLASSIFY_RULES are the rules used when none are given', () => {
    const sonnet = model('claude-sonnet-x', 'anthropic', 'claude-sonnet')
    expect(BUILTIN_CLASSIFY_RULES.length).toBeGreaterThan(0)
    expect(classifyModel(sonnet, BUILTIN_CLASSIFY_RULES)).toBe('standard')
    expect(classify(catalogue)['acme/pro-1']).toBe('unclassified')
  })
})

describe('chains and pins', () => {
  test('expandChain lists a tier newest model first, across tools', () => {
    const chain = expandChain('max', [], query)
    expect(chain.entries.map((e) => `${e.tool} ${e.native_name}`)).toEqual([
      'runner pro-2',
      'runner pro-1',
    ])
    expect(chain.entries[0]).toMatchObject({ tier: 'max', pinned: false, model: 'acme/pro-2' })
  })

  test('expandChain reports a model that lacks a requested trait', () => {
    const chain = expandChain('max', ['vision'], query)
    expect(chain.entries).toEqual([])
    expect(chain.skipped[0]).toMatchObject({ tool: 'runner', reason: 'missing-trait' })
  })

  test('DEFAULT_CHAIN_ORDER is the tool order when a config sets none', () => {
    expect(DEFAULT_CHAIN_ORDER[0]).toBe('claude')
    expect(DEFAULT_CHAIN_ORDER).toContain('codex')
  })

  test('pinKey and PIN_KEY_PATTERN name a pin as tool/tier', () => {
    expect(pinKey('runner', 'max')).toBe('runner/max')
    expect(PIN_KEY_PATTERN.test(pinKey('runner', 'max'))).toBe(true)
    expect(PIN_KEY_PATTERN.test('runner')).toBe(false)
  })

  test('a pin heads its tool in the chain, flagged', () => {
    const pinned = queryCatalogue(catalogue, { classify: rules, pins: { 'runner/max': 'pro-1' } })
    const [first] = expandChain('max', [], pinned).entries
    expect(first).toMatchObject({ native_name: 'pro-1', pinned: true })
  })

  test('PinsSchema accepts tool/tier keys and rejects other keys', () => {
    expect(PinsSchema.safeParse({ 'runner/max': 'pro-1' }).success).toBe(true)
    expect(PinsSchema.safeParse({ runner: 'pro-1' }).success).toBe(false)
  })
})

describe('wildcards', () => {
  test('expandWildcard resolves the chain of a tier across every known tool', () => {
    const ref = parseRef('*/max@high')
    if (!ref.ok) throw new Error(ref.error.message)
    const expansion = expandWildcard(ref.value, { catalogue: query })
    expect(expansion.entries.map((e) => e.text)).toEqual(['runner/max@high', 'runner/pro-1@high'])
    expect(expansion.entries.map((e) => e.model)).toEqual(['pro-2', 'pro-1'])
    // The embedding model is passed over, with the reason.
    expect(expansion.skipped.map((x) => x.reason)).toEqual(['not-agent'])
  })

  test('knownTools keeps only the tools a caller has', () => {
    const ref = parseRef('*/max')
    if (!ref.ok) throw new Error(ref.error.message)
    const none = expandWildcard(ref.value, { catalogue: query, knownTools: ['claude'] })
    expect(none.entries).toEqual([])
  })
})
