import { describe, expect, test } from 'vitest'

import { diffCatalogues, tierTable, unclassifiedFamilies } from '../../src/catalogue/diff.ts'
import { layerCatalogue } from '../../src/catalogue/layers.ts'
import { queryCatalogue } from '../../src/catalogue/query.ts'
import { BUILTIN_QUERY, SNAPSHOT_LAYER } from '../../src/catalogue/snapshot.ts'
import type { CatalogueLayer } from '../../src/catalogue/types.ts'

const LAYER: CatalogueLayer = {
  source: 'models.dev',
  observed_at: '2026-10-10',
  models: {
    'anthropic/claude-opus-6': {
      family: 'claude-opus',
      release_date: '2026-10-08',
      context: { max: 1_000_000 },
      traits: ['agent'],
    },
    'anthropic/claude-nova-1': {
      family: 'claude-nova',
      release_date: '2026-10-08',
      traits: ['agent'],
    },
    'anthropic/claude-nova-embed': { family: 'claude-nova', traits: ['embedding'] },
  },
}
const after = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER, LAYER]))

describe('diffCatalogues', () => {
  test('new models, tier moves and newly unclassified families', () => {
    const diff = diffCatalogues(BUILTIN_QUERY, after)
    expect(diff.newModels).toEqual([
      'anthropic/claude-nova-1',
      'anthropic/claude-nova-embed',
      'anthropic/claude-opus-6',
    ])
    expect(diff.goneModels).toEqual([])
    expect(diff.tierMoves).toContainEqual({
      key: 'claude/max',
      from: 'opus',
      to: 'claude-opus-6',
    })
    expect(diff.newlyUnclassified).toEqual([
      { family: 'anthropic/claude-nova', models: ['anthropic/claude-nova-1'] },
    ])
  })

  test('a model the after side lacks is gone; a family unclassified before is not new', () => {
    const diff = diffCatalogues(after, BUILTIN_QUERY)
    expect(diff.goneModels).toContain('anthropic/claude-opus-6')
    expect(diff.newlyUnclassified).toEqual([])
    expect(unclassifiedFamilies(BUILTIN_QUERY).map((f) => f.family)).toContain(
      'anthropic/claude-fable',
    )
  })

  test('no change, no diff; a pin shows in the tier table', () => {
    expect(diffCatalogues(BUILTIN_QUERY, BUILTIN_QUERY)).toEqual({
      newModels: [],
      goneModels: [],
      tierMoves: [],
      newlyUnclassified: [],
    })
    const pinned = queryCatalogue(layerCatalogue([SNAPSHOT_LAYER, LAYER]), {
      pins: { 'claude/max': 'opus' },
    })
    expect(tierTable(pinned)['claude/max']).toBe('opus')
  })
})
