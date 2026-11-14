import { describe, expect, test } from 'vitest'

import { layerCatalogue } from '../../src/catalogue/layers.ts'
import { modelsDevRow, modelsDevRows, type ModelsDevApi } from '../../src/catalogue/models-dev.ts'
import { RouterConfigSchema } from '../../src/catalogue/schema.ts'
import { SNAPSHOT_LAYER } from '../../src/catalogue/snapshot.ts'
import type { CatalogueLayer } from '../../src/catalogue/types.ts'

const API: ModelsDevApi = {
  anthropic: {
    models: {
      'claude-opus-6': {
        id: 'claude-opus-6',
        family: 'claude-opus',
        tool_call: true,
        reasoning: true,
        reasoning_options: [{ type: 'effort', values: ['low', 'high'] }],
        limit: { context: 1_000_000 },
      },
      // A budget_tokens-only entry names no levels.
      'claude-sonnet-5': {
        id: 'claude-sonnet-5',
        family: 'claude-sonnet',
        tool_call: true,
        reasoning_options: [{ type: 'budget_tokens' }],
      },
      'claude-image': {
        id: 'claude-image',
        modalities: { input: ['text', 'image'], output: ['image'] },
      },
      // Text output without tool calling is kept, without the agent trait.
      'claude-plain': { id: 'claude-plain', modalities: { input: ['text'], output: ['text'] } },
      'claude-voice': { id: 'claude-voice', modalities: { output: ['audio'] }, tool_call: true },
      'claude-clip': { id: 'claude-clip', modalities: { output: ['video'] } },
    },
  },
  ollama: { models: { 'qwen3:8b': { id: 'qwen3:8b', tool_call: true } } },
  xai: { models: { 'grok-5': { id: 'grok-5', tool_call: true } } },
}

describe('modelsDevRow', () => {
  test('keeps only efforts on the EFFORT_LEVELS scale', () => {
    const row = modelsDevRow({
      id: 'x',
      tool_call: true,
      reasoning_options: [{ type: 'effort', values: ['off', 'low', 'ultra', 'high'] }],
    })
    expect(row.efforts).toEqual(['low', 'high'])
  })

  test('a list with no level on the scale falls back to the prior row', () => {
    const row = modelsDevRow(
      { id: 'x', tool_call: true, reasoning_options: [{ type: 'effort', values: ['off'] }] },
      { efforts: ['high'] },
    )
    expect(row.efforts).toEqual(['high'])
  })

  test('without models.dev efforts, the prior efforts and aliases are kept', () => {
    const row = modelsDevRow({ id: 'x', tool_call: true }, { efforts: ['high'], aliases: ['x-1'] })
    expect(row).toMatchObject({ efforts: ['high'], aliases: ['x-1'], traits: ['agent'] })
  })

  test('without a prior, a model with no effort entry has no efforts', () => {
    expect(modelsDevRow({ id: 'x', tool_call: true }).efforts).toBeUndefined()
  })
})

describe('modelsDevRows', () => {
  const rows = modelsDevRows(API, SNAPSHOT_LAYER.providers ?? {})

  test('keeps known cloud providers; local runtimes get no rows; unknown ones are counted', () => {
    expect(Object.keys(rows.models)).toEqual([
      'anthropic/claude-image',
      'anthropic/claude-opus-6',
      'anthropic/claude-plain',
      'anthropic/claude-sonnet-5',
    ])
    expect(rows.unknownProviders).toEqual(['xai'])
  })

  test('image-output models get image-out (and vision for image input); plain text models no agent', () => {
    expect(rows.models['anthropic/claude-image']?.traits).toEqual(['vision', 'image-out'])
    expect(rows.models['anthropic/claude-plain']?.traits).toBeUndefined()
    expect(rows.models['anthropic/claude-opus-6']?.traits).toEqual([
      'agent',
      'reasoning',
      'long-context',
    ])
  })

  test('AC-1b: an effort entry lands sourced models.dev; budget_tokens keeps the snapshot', () => {
    const layer: CatalogueLayer = {
      source: 'models.dev',
      observed_at: '2026-10-10',
      models: rows.models,
    }
    const cat = layerCatalogue([SNAPSHOT_LAYER, layer])
    const opus = cat.models['anthropic/claude-opus-6']
    expect(opus?.efforts).toEqual(['low', 'high'])
    expect(opus?.fields.efforts).toEqual({ source: 'models.dev', observed_at: '2026-10-10' })
    const sonnet = cat.models['anthropic/claude-sonnet-5']
    expect(sonnet?.efforts).toEqual(SNAPSHOT_LAYER.models?.['anthropic/claude-sonnet-5']?.efforts)
    expect(sonnet?.efforts).toBeDefined()
    expect(sonnet?.fields.efforts?.source).toBe('snapshot')
    expect(sonnet?.fields.family?.source).toBe('models.dev')
  })
})

describe('modelsDevRows: rows that may head a tier', () => {
  const agent = (id: string, release_date?: string) => ({
    id,
    family: 'claude-opus',
    tool_call: true,
    ...(release_date === undefined ? {} : { release_date }),
  })
  const api = (...models: ReturnType<typeof agent>[]): ModelsDevApi => ({
    anthropic: { models: Object.fromEntries(models.map((m) => [m.id, m])) },
  })
  const rows = (a: ModelsDevApi) =>
    modelsDevRows(a, SNAPSHOT_LAYER.providers ?? {}, {}, '2026-10-10')

  test('a release date after today, or not an ISO date, refuses the row', () => {
    const out = rows(
      api(
        agent('claude-opus-9', '9999-01-01'),
        agent('claude-opus-8', '2026-10-11'),
        agent('claude-opus-7', 'zzzz'),
        agent('claude-opus-6', '2026-02-31'),
        agent('claude-opus-5', '2026-10-10'),
      ),
    )
    expect(Object.keys(out.models)).toEqual(['anthropic/claude-opus-5'])
    expect(out.rejected).toEqual([
      { key: 'anthropic/claude-opus-6', reason: 'release_date is not an ISO date' },
      { key: 'anthropic/claude-opus-7', reason: 'release_date is not an ISO date' },
      { key: 'anthropic/claude-opus-8', reason: 'release_date is in the future' },
      { key: 'anthropic/claude-opus-9', reason: 'release_date is in the future' },
    ])
  })

  test('an ISO date-time is kept as its day', () => {
    const out = rows(api(agent('claude-opus-6', '2026-10-08T09:30:00Z')))
    expect(out.models['anthropic/claude-opus-6']?.release_date).toBe('2026-10-08')
  })

  test('an id a CLI could read as a flag, or with other characters, refuses the row', () => {
    const out = rows(api(agent('--dangerous'), agent('opus 6'), agent('qwen3:8b/x.y_z-1')))
    expect(Object.keys(out.models)).toEqual(['anthropic/qwen3:8b/x.y_z-1'])
    expect(out.rejected.map((r) => r.key)).toEqual(['anthropic/--dangerous', 'anthropic/opus 6'])
  })

  test('a row of the wrong shape is refused, not thrown', () => {
    const odd = {
      anthropic: {
        models: {
          a: null,
          b: { ...agent('claude-opus-6'), reasoning_options: 'effort' },
        },
      },
    } as unknown as ModelsDevApi
    expect(rows(odd).rejected).toEqual([
      { key: 'anthropic/claude-opus-6', reason: 'row is malformed' },
      { key: 'anthropic/undefined', reason: 'row is malformed' },
    ])
  })

  test('a field of the wrong type refuses its row, and the other rows stay', () => {
    const odd = api(
      ...([
        { ...agent('claude-a'), family: 7 },
        { ...agent('claude-b'), limit: { context: 1.5 } },
        { ...agent('claude-c'), cost: { input: 1, output: null } },
        agent('claude-d'),
      ] as ReturnType<typeof agent>[]),
    )
    const out = rows(odd)
    expect(out.rejected.map((r) => [r.key, r.reason])).toEqual([
      ['anthropic/claude-a', 'row is malformed'],
      ['anthropic/claude-b', 'row is malformed'],
      ['anthropic/claude-c', 'row is malformed'],
    ])
    expect(Object.keys(out.models)).toEqual(['anthropic/claude-d'])
  })

  test('a dated id whose base is refused stays a row of its own', () => {
    const out = rows(api(agent('claude-x', '9999-01-01'), agent('claude-x-20261001', '2026-10-01')))
    expect(Object.keys(out.models)).toEqual(['anthropic/claude-x-20261001'])
  })
})

describe('native names in config', () => {
  test('a native name, alias or model key that starts with - is refused', () => {
    const bad = [
      { offerings: [{ tool: 'claude', model: 'anthropic/x', native_name: '-x' }] },
      { tools: { claude: { offers: [{ model: 'anthropic/x', native_name: '--model=y' }] } } },
      { tools: { claude: { aliases: { '-o': 'anthropic/x' } } } },
      { offerings: [{ tool: 'claude', model: 'anthropic/-x' }] },
      { offerings: [{ tool: 'claude', model: 'anthropic/x', native_name: 'a b' }] },
    ]
    for (const models of bad) expect(RouterConfigSchema.safeParse(models).success).toBe(false)
    expect(
      RouterConfigSchema.safeParse({
        offerings: [{ tool: 'pi', model: 'ollama/qwen3:8b', native_name: 'ollama/qwen3:8b' }],
      }).success,
    ).toBe(true)
  })
})
