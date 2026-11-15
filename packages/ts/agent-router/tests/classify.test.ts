import { describe, expect, test } from 'vitest'

import { layerCatalogue } from '../src/catalogue/layers.ts'
import { queryCatalogue } from '../src/catalogue/query.ts'
import { BUILTIN_CATALOGUE, BUILTIN_QUERY, SNAPSHOT_LAYER } from '../src/catalogue/snapshot.ts'
import type { CatalogueLayer, Model } from '../src/catalogue/types.ts'
import { expandChain } from '../src/chains.ts'
import {
  BUILTIN_CLASSIFY_RULES,
  classify,
  classifyModel,
  ClassifyRuleSchema,
  parameterCount,
} from '../src/classify.ts'
import { TIERS } from '../src/ref.ts'

const placed = classify(BUILTIN_CATALOGUE)

function model(key: string, extra: Partial<Model> = {}): Model {
  const [provider, id] = [key.slice(0, key.indexOf('/')), key.slice(key.indexOf('/') + 1)]
  return { key, provider, id, status: 'current', traits: ['agent'], ...extra }
}

describe('the shipped rules over the shipped snapshot', () => {
  test('AC-1: anthropic haiku is fast, sonnet standard, opus max', () => {
    expect(placed['anthropic/claude-haiku-5-5']).toBe('fast')
    expect(placed['anthropic/claude-haiku-4-5']).toBe('fast')
    expect(placed['anthropic/claude-sonnet-5-5']).toBe('standard')
    expect(placed['anthropic/claude-opus-5-5']).toBe('max')
    expect(placed['anthropic/claude-opus-4-5']).toBe('max')
  })

  test('AC-1: a family no rule names (fable) is unclassified and absent from every chain', () => {
    expect(placed['anthropic/claude-fable-5-1']).toBe('unclassified')
    expect(placed['anthropic/claude-fable-5']).toBe('unclassified')
    for (const tier of TIERS) {
      const models = expandChain(tier, [], BUILTIN_QUERY).entries.map((e) => e.model)
      expect(models).not.toContain('anthropic/claude-fable-5-1')
      expect(models).not.toContain('anthropic/claude-fable-5')
    }
  })

  test('openai: luna fast, sol standard, astra max; the rest unclassified', () => {
    expect(placed['openai/gpt-6-luna']).toBe('fast')
    expect(placed['openai/gpt-6.1-sol']).toBe('standard')
    expect(placed['openai/gpt-6-astra']).toBe('max')
    expect(placed['openai/gpt-5.6-terra']).toBe('unclassified')
    expect(placed['openai/gpt-4o-mini']).toBe('unclassified')
    expect(placed['openai/text-embedding-3-small']).toBe('unclassified')
  })

  test('google: flash-lite fast, flash standard, pro max; embeddings unclassified', () => {
    expect(placed['google/gemini-3.5-flash-lite']).toBe('fast')
    expect(placed['google/gemini-3.8-flash']).toBe('standard')
    expect(placed['google/gemini-3.1-pro-preview']).toBe('max')
    expect(placed['google/gemini-embedding-2']).toBe('unclassified')
  })

  test('local runtimes place by parameter count, agent models only', () => {
    const rules = BUILTIN_CLASSIFY_RULES
    expect(classifyModel(model('ollama/qwen3:4b'), rules)).toBe('fast')
    expect(classifyModel(model('ollama/gemma-4-26b-a4b-it'), rules)).toBe('standard')
    expect(classifyModel(model('lmstudio/llama3.1:70b'), rules)).toBe('max')
    expect(classifyModel(model('ollama/qwen3:4b', { traits: ['embedding'] }), rules)).toBe(
      'unclassified',
    )
    expect(classifyModel(model('ollama/mystery'), rules)).toBe('unclassified')
  })
})

describe('classifyModel', () => {
  test('the first matching rule wins, so a project rule can place a new family', () => {
    const fable = model('anthropic/claude-fable-6', { family: 'claude-fable' })
    expect(classifyModel(fable, BUILTIN_CLASSIFY_RULES)).toBe('unclassified')
    const rules = [
      { provider: 'anthropic', families: { 'claude-fable': 'max' as const } },
      ...BUILTIN_CLASSIFY_RULES,
    ]
    expect(classifyModel(fable, rules)).toBe('max')
  })

  test('a rule can unclassify on purpose; id globs match in order', () => {
    const rules = [
      { provider: 'openai', match: [{ id: '*-mini', tier: 'fast' as const }] },
      { provider: 'openai', match: [{ id: 'gpt-*', tier: 'standard' as const }] },
      { families: { 'gpt-sol': 'unclassified' as const } },
    ]
    expect(classifyModel(model('openai/gpt-5-mini'), rules)).toBe('fast')
    expect(classifyModel(model('openai/gpt-5'), rules)).toBe('standard')
    expect(classifyModel(model('openai/o3', { family: 'gpt-sol' }), rules)).toBe('unclassified')
  })

  test('parameterCount reads the size off an id', () => {
    expect(parameterCount('qwen3:4b')).toBe(4)
    expect(parameterCount('llama3.1:70b')).toBe(70)
    expect(parameterCount('gemma-4-26b-a4b-it')).toBe(26)
    expect(parameterCount('phi3:3.8b')).toBe(3.8)
    expect(parameterCount('mistral')).toBeUndefined()
  })

  test('the schema refuses a rule that matches nothing and a bad threshold', () => {
    expect(ClassifyRuleSchema.safeParse({ provider: 'openai' }).success).toBe(false)
    expect(ClassifyRuleSchema.safeParse({ by_parameters: { fast: '10B' } }).success).toBe(false)
    expect(ClassifyRuleSchema.safeParse({ families: { x: 'huge' } }).success).toBe(false)
    for (const rule of BUILTIN_CLASSIFY_RULES) {
      expect(ClassifyRuleSchema.safeParse(rule).success).toBe(true)
    }
  })

  test('a local model a config layer adds joins its chain', () => {
    const layer: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-09',
      models: { 'ollama/qwen3:4b': { traits: ['agent', 'local'], release_date: '2026-01-01' } },
    }
    const q = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER, layer]))
    expect(q.tierOf('ollama/qwen3:4b')).toBe('fast')
    const local = expandChain('fast', ['local'], q).entries
    expect(local.map((e) => `${e.tool}/${e.native_name}`)).toEqual([
      'codex/qwen3:4b',
      'pi/ollama/qwen3:4b',
      'opencode/ollama/qwen3:4b',
    ])
  })
})
