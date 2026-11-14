import { describe, expect, test } from 'vitest'

import { layerCatalogue } from '../../src/catalogue/layers.ts'
import { configLayer } from '../../src/catalogue/schema.ts'
import { SNAPSHOT_LAYER } from '../../src/catalogue/snapshot.ts'
import type { CatalogueLayer } from '../../src/catalogue/types.ts'

const snapshot: CatalogueLayer = {
  source: 'snapshot',
  observed_at: '2026-10-01',
  providers: { anthropic: { kind: 'anthropic' }, corp: { kind: 'openai-compatible' } },
  tools: {
    t: {
      binary: 't',
      serves: ['anthropic'],
      openness: 'closed',
      modes: ['headless'],
      efforts: ['low', 'high'],
      observed_at: '2026-09-30',
    },
  },
  models: { 'anthropic/m-1': { efforts: ['low'] } },
}

describe('layerCatalogue', () => {
  test('AC-4: a higher layer overrides a snapshot fact and the row takes its provenance', () => {
    const config: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-09',
      tools: { t: { efforts: ['xhigh'] } },
    }
    const cat = layerCatalogue([snapshot, config])
    const t = cat.tools.t!
    expect(t.efforts).toEqual(['xhigh'])
    expect(t.source).toBe('config')
    expect(t.observed_at).toBe('2026-10-09')
    expect(t.fields.efforts).toEqual({ source: 'config', observed_at: '2026-10-09' })
    // A field the config left alone keeps the snapshot row's own date.
    expect(t.binary).toBe('t')
    expect(t.fields.binary).toEqual({ source: 'snapshot', observed_at: '2026-09-30' })
  })

  test('serves adds across layers', () => {
    const config: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-09',
      tools: { t: { serves: ['corp'] } },
    }
    const cat = layerCatalogue([snapshot, config])
    expect(cat.tools.t?.serves).toEqual(['anthropic', 'corp'])
  })

  test('defaults: takes none, status current, provider and id from the key', () => {
    const cat = layerCatalogue([snapshot])
    expect(cat.tools.t?.model).toEqual({ via: 'none' })
    expect(cat.models['anthropic/m-1']).toMatchObject({
      provider: 'anthropic',
      id: 'm-1',
      status: 'current',
    })
  })

  test('an incomplete row is left out with a problem; a dangling reference is reported', () => {
    const config: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-09',
      tools: {
        grok: { headless: { args: ['{prompt}'], prompt_via: 'argv' } },
        t: { serves: ['xai'] },
      },
      providers: { nokind: { endpoint: 'https://x.example' } },
      offerings: [{ tool: 'nosuch', model: 'anthropic/m-1' }],
    }
    const cat = layerCatalogue([snapshot, config])
    expect(cat.tools.grok).toBeUndefined()
    expect(cat.providers.nokind).toBeUndefined()
    expect(cat.problems.map((p) => p.message).sort()).toEqual([
      "offering names unknown tool 'nosuch'",
      "provider 'nokind' has no kind",
      "tool 'grok' has no serves, openness, modes",
      "tool 't' serves unknown provider 'xai'",
    ])
  })

  test('an offering row naming a model the catalogue lacks is a problem; a removal warns', () => {
    const config: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-09',
      offerings: [
        { tool: 't', model: 'anthropic/m-2', native_name: 'm2' },
        { tool: 't', model: 'anthropic/m-1-typo', remove: true },
      ],
    }
    const cat = layerCatalogue([snapshot, config])
    expect(cat.problems.map((p) => p.message)).toEqual([
      "offering names unknown model 'anthropic/m-2'",
    ])
    expect(cat.warnings.map((p) => p.message)).toEqual([
      "offering removes unknown model 'anthropic/m-1-typo'",
    ])
  })

  test('under strict, a removal row naming an unknown model is a problem', () => {
    const config: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-09',
      offerings: [{ tool: 't', model: 'anthropic/m-1-typo', remove: true }],
    }
    const cat = layerCatalogue([snapshot, config], { strict: true })
    expect(cat.problems.map((p) => p.message)).toEqual([
      "offering removes unknown model 'anthropic/m-1-typo'",
    ])
    expect(cat.warnings).toEqual([])
  })

  test('does not mutate its inputs', () => {
    const copy = structuredClone(snapshot)
    const cat = layerCatalogue([snapshot])
    cat.tools.t!.efforts!.push('max')
    expect(snapshot).toEqual(copy)
  })

  test('the README config example layers over the snapshot without problems', () => {
    const cat = layerCatalogue([
      SNAPSHOT_LAYER,
      configLayer(
        {
          providers: {
            corp: {
              kind: 'openai-compatible',
              endpoint: 'https://llm.example/v1',
              key_env: 'CORP_KEY',
            },
            xai: {
              kind: 'openai-compatible',
              endpoint: 'https://api.x.ai/v1',
              key_env: 'XAI_API_KEY',
            },
          },
          tools: {
            opencode: { serves: ['corp'] },
            grok: {
              serves: ['xai'],
              openness: 'closed',
              modes: ['headless'],
              headless: { args: ['-p', '{prompt}', '--model', '{model}'], prompt_via: 'argv' },
            },
          },
        },
        '2026-10-09',
      ),
    ])
    expect(cat.problems).toEqual([])
    expect(cat.tools.opencode?.serves).toContain('corp')
    expect(cat.tools.opencode?.serves).toContain('anthropic')
    expect(cat.tools.grok?.source).toBe('config')
    // A declared tool runs as its id; a built-in one as the snapshot names it.
    expect(cat.tools.grok?.binary).toBe('grok')
    expect(cat.tools.cursor?.binary).toBe('cursor-agent')
  })
})
