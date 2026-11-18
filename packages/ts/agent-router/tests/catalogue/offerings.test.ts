import { describe, expect, test } from 'vitest'

import { layerCatalogue } from '../../src/catalogue/layers.ts'
import { deriveOfferings, nativeName } from '../../src/catalogue/offerings.ts'
import type { CatalogueLayer } from '../../src/catalogue/types.ts'

const base: CatalogueLayer = {
  source: 'snapshot',
  observed_at: '2026-10-01',
  providers: {
    anthropic: { kind: 'anthropic' },
    openai: { kind: 'openai' },
    ollama: { kind: 'ollama' },
  },
  models: {
    'anthropic/opus-1': { family: 'opus' },
    'anthropic/sonnet-1': { family: 'sonnet' },
    'openai/gpt-1': {},
    'ollama/qwen:4b': {},
  },
  tools: {
    closedtool: {
      binary: 'closed',
      serves: ['anthropic', { provider: 'ollama', via: '--local' }],
      openness: 'closed',
      modes: ['headless'],
    },
  },
}

const pairs = (layers: CatalogueLayer[]): string[] =>
  deriveOfferings(layerCatalogue(layers))
    .map((o) => `${o.tool} ${o.model}`)
    .sort()

describe('deriveOfferings', () => {
  test('AC-2: a closed tool offers serves times the provider models', () => {
    expect(pairs([base])).toEqual([
      'closedtool anthropic/opus-1',
      'closedtool anthropic/sonnet-1',
      'closedtool ollama/qwen:4b',
    ])
    const local = deriveOfferings(layerCatalogue([base])).find((o) => o.model === 'ollama/qwen:4b')
    expect(local?.via).toBe('--local')
  })

  test('AC-2: a router.offerings row adds one and removes one', () => {
    const config: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-09',
      offerings: [
        { tool: 'closedtool', model: 'openai/gpt-1' },
        { tool: 'closedtool', model: 'anthropic/sonnet-1', remove: true },
      ],
    }
    expect(pairs([base, config])).toEqual([
      'closedtool anthropic/opus-1',
      'closedtool ollama/qwen:4b',
      'closedtool openai/gpt-1',
    ])
    const added = deriveOfferings(layerCatalogue([base, config])).find(
      (o) => o.model === 'openai/gpt-1',
    )
    expect(added).toMatchObject({
      native_name: 'gpt-1',
      source: 'config',
      observed_at: '2026-10-09',
    })
  })

  test('a curated tool offers only its own list', () => {
    const curated: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-09',
      tools: {
        cur: {
          binary: 'cur',
          serves: ['anthropic'],
          openness: 'curated',
          modes: ['headless'],
          offers: [
            { model: 'anthropic/opus-1', native_name: 'opus-1-thinking', efforts: ['high'] },
          ],
        },
      },
    }
    const cur = deriveOfferings(layerCatalogue([base, curated])).filter((o) => o.tool === 'cur')
    expect(cur).toEqual([
      expect.objectContaining({
        model: 'anthropic/opus-1',
        native_name: 'opus-1-thinking',
        efforts: ['high'],
      }),
    ])
  })

  test('a row that replaces a curated offering keeps the fields it leaves out', () => {
    const curated: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-09',
      tools: {
        cur: {
          binary: 'cur',
          serves: ['anthropic'],
          openness: 'curated',
          modes: ['headless'],
          offers: [
            {
              model: 'anthropic/opus-1',
              native_name: 'opus-1-thinking',
              efforts: ['high'],
              context: { default: 100_000 },
            },
          ],
        },
      },
    }
    const row: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-10',
      offerings: [{ tool: 'cur', model: 'anthropic/opus-1', context: { default: 200_000 } }],
    }
    const cur = deriveOfferings(layerCatalogue([base, curated, row])).filter(
      (o) => o.tool === 'cur',
    )
    expect(cur).toEqual([
      expect.objectContaining({
        model: 'anthropic/opus-1',
        native_name: 'opus-1-thinking',
        efforts: ['high'],
        context: { default: 200_000 },
        source: 'config',
        observed_at: '2026-10-10',
      }),
    ])
  })

  test('a router.offerings row with no native_name names a curated tool’s model by its own name', () => {
    const curated: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-09',
      tools: {
        cur: {
          binary: 'cur',
          serves: ['anthropic'],
          openness: 'curated',
          modes: ['headless'],
          offers: [{ model: 'anthropic/opus-1', native_name: 'opus-1-thinking' }],
        },
      },
    }
    const config: CatalogueLayer = {
      source: 'config',
      observed_at: '2026-10-10',
      offerings: [{ tool: 'cur', model: 'anthropic/opus-1', context: { max: 1_000_000 } }],
    }
    const cur = deriveOfferings(layerCatalogue([base, curated, config])).filter(
      (o) => o.tool === 'cur',
    )
    expect(cur).toEqual([
      expect.objectContaining({
        model: 'anthropic/opus-1',
        native_name: 'opus-1-thinking',
        context: { max: 1_000_000 },
        observed_at: '2026-10-10',
      }),
    ])
  })
})

describe('AC-3: native_name order', () => {
  const opus = { key: 'anthropic/opus-1', provider: 'anthropic', id: 'opus-1' }

  test('1: the tool alias when the tool declares aliases and sets prefer_alias', () => {
    const tool = {
      openness: 'closed' as const,
      aliases: { opus: 'anthropic/opus-1' },
      prefer_alias: true,
    }
    expect(nativeName(tool, opus, 'curated-name')).toBe('opus')
    expect(nativeName({ ...tool, prefer_alias: false }, opus)).toBe('opus-1')
  })

  test('2: else the curated tool’s own name', () => {
    expect(nativeName({ openness: 'curated' }, opus, 'opus-1-thinking-high')).toBe(
      'opus-1-thinking-high',
    )
  })

  test('3: else the provider’s model id', () => {
    expect(nativeName({ openness: 'closed' }, opus)).toBe('opus-1')
  })

  test('4: provider/id for a multi-provider tool', () => {
    expect(nativeName({ openness: 'open' }, opus)).toBe('anthropic/opus-1')
    expect(
      nativeName(
        { openness: 'open' },
        { key: 'ollama/qwen:4b', provider: 'ollama', id: 'qwen:4b' },
      ),
    ).toBe('ollama/qwen:4b')
  })
})
