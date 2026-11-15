import { describe, expect, test } from 'vitest'

import { layerCatalogue } from '../../src/catalogue/layers.ts'
import { queryCatalogue } from '../../src/catalogue/query.ts'
import { BUILTIN_QUERY } from '../../src/catalogue/snapshot.ts'
import type { CatalogueLayer } from '../../src/catalogue/types.ts'

describe('the shipped snapshot through the query API', () => {
  test('AC-1: effortsFor(claude) contains xhigh', () => {
    expect(BUILTIN_QUERY.effortsFor('claude')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
  })

  test("AC-1: findModel('claude', 'fable') resolves", () => {
    const found = BUILTIN_QUERY.findModel('claude', 'fable')
    expect(found?.model.key).toBe('anthropic/claude-fable-5-1')
    expect(found?.offering.native_name).toBe('fable')
  })

  test('knownTools is the one tool list', () => {
    expect(BUILTIN_QUERY.knownTools().sort()).toEqual([
      'antigravity',
      'claude',
      'codex',
      'cursor',
      'opencode',
      'pi',
    ])
  })

  test('tierModel is the head of each tool chain', () => {
    expect(BUILTIN_QUERY.tierModel('claude', 'fast')).toBe('haiku')
    expect(BUILTIN_QUERY.tierModel('claude', 'max')).toBe('opus')
    expect(BUILTIN_QUERY.tierModel('pi', 'max')).toBe('anthropic/claude-opus-5-5')
    expect(BUILTIN_QUERY.tierModel('cursor', 'fast')).toBeUndefined()
    expect(BUILTIN_QUERY.tierModel('nosuch', 'max')).toBeUndefined()
  })

  test('every claude and codex tier names an offered model', () => {
    for (const tool of ['claude', 'codex']) {
      for (const tier of ['fast', 'standard', 'max'] as const) {
        const name = BUILTIN_QUERY.tierModel(tool, tier)!
        expect(BUILTIN_QUERY.findModel(tool, name)).toBeDefined()
      }
    }
  })

  test('antigravity takes low to high; an open tool names provider/id', () => {
    expect(BUILTIN_QUERY.effortsFor('antigravity')).toEqual(['low', 'medium', 'high'])
    expect(BUILTIN_QUERY.offering('opencode', 'anthropic/claude-opus-5-5')?.native_name).toBe(
      'anthropic/claude-opus-5-5',
    )
    expect(BUILTIN_QUERY.offering('pi', 'openai/gpt-6.1-sol')?.native_name).toBe(
      'openai/gpt-6.1-sol',
    )
  })
})

describe('queryCatalogue', () => {
  const layer: CatalogueLayer = {
    source: 'snapshot',
    observed_at: '2026-10-01',
    providers: { p: { kind: 'openai' } },
    models: {
      'p/m-1': { aliases: ['m-1-20260101'], efforts: ['none', 'low', 'high', 'max'] },
      'p/m-2': {},
    },
    tools: {
      t: {
        binary: 't',
        serves: ['p'],
        openness: 'closed',
        modes: ['headless'],
        efforts: ['low', 'medium', 'high'],
        aliases: { best: 'p/m-1' },
      },
      bare: { binary: 'b', serves: ['p'], openness: 'closed', modes: ['headless'] },
    },
    offerings: [{ tool: 't', model: 'p/m-2', efforts: ['medium'] }],
  }
  const q = queryCatalogue(layerCatalogue([layer]))

  test('findModel matches native name, key, id, model alias and tool alias', () => {
    for (const name of ['m-1', 'p/m-1', 'm-1-20260101', 'best']) {
      expect(q.findModel('t', name)?.model.key).toBe('p/m-1')
    }
    expect(q.findModel('t', 'nope')).toBeUndefined()
    expect(q.findModel('nosuch', 'm-1')).toBeUndefined()
  })

  test('effortsFor: the model levels the tool can pass; an offering row wins', () => {
    expect(q.effortsFor('t')).toEqual(['low', 'medium', 'high'])
    expect(q.effortsFor('t', 'm-1')).toEqual(['low', 'high'])
    expect(q.effortsFor('t', 'm-2')).toEqual(['medium'])
    expect(q.effortsFor('t', 'unknown')).toEqual(['low', 'medium', 'high'])
    expect(q.effortsFor('bare')).toBeUndefined()
    expect(q.effortsFor('bare', 'm-1')).toEqual(['none', 'low', 'high', 'max'])
    expect(q.effortsFor('nosuch')).toBeUndefined()
  })

  test('modelsFor and tools', () => {
    expect(q.modelsFor('t').map((m) => m.key)).toEqual(['p/m-1', 'p/m-2'])
    expect(q.tools().map((t) => t.id)).toEqual(['t', 'bare'])
  })
})
