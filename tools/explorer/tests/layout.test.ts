import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import {
  NODE_HEIGHT,
  buildLayoutGraph,
  chooseColumns,
  computeLayout,
  edgeHandles,
  layerOrder,
  packLayers,
} from '../src/model/layout'
import { fixture, node } from './fixture'

describe('buildLayoutGraph', () => {
  const graph = buildLayoutGraph(fixture)

  it('includes every node from both states, once', () => {
    expect(graph.children?.map((c) => c.id).sort()).toEqual(fixture.nodes.map((n) => n.id).sort())
  })

  it('puts each node in its layer partition', () => {
    const astro = graph.children?.find((c) => c.id === 'markdown-astro')
    const etag = graph.children?.find((c) => c.id === 'etag-write')
    expect(astro?.layoutOptions?.['elk.partitioning.partition']).toBe('0')
    expect(etag?.layoutOptions?.['elk.partitioning.partition']).toBe('4')
  })

  it('leaves out twin edges and keeps one edge per pair', () => {
    const pairs = graph.edges?.map((e) => `${e.sources[0]}>${e.targets[0]}`) ?? []
    expect(pairs).not.toContain('markdown-link-rs>markdown-link')
    expect(new Set(pairs).size).toBe(pairs.length)
  })

  it('points edges down the layers even when the data points up', () => {
    const flipped = {
      ...fixture,
      edges: [{ from: 'etag-write', to: 'markdown-astro', kind: 'depends' as const, states: ['present' as const] }],
    }
    expect(buildLayoutGraph(flipped).edges?.[0]).toMatchObject({ sources: ['markdown-astro'], targets: ['etag-write'] })
  })
})

describe('computeLayout', () => {
  it('stacks layers in order, with bands that do not overlap', { timeout: 20000 }, async () => {
    const layout = await computeLayout(fixture, new ELK())
    const y = (id: string) => layout.positions[id]?.y ?? Number.NaN
    expect(y('markdown-astro')).toBeLessThan(y('corpus-schema'))
    expect(y('corpus-schema')).toBeLessThan(y('markdown-corpus'))
    expect(y('markdown-corpus')).toBeLessThan(y('markdown-link'))
    expect(y('markdown-link')).toBeLessThan(y('etag-write'))
    expect(y('markdown-link')).toBe(y('markdown-link-rs'))

    expect(layout.bands.map((b) => b.id)).toEqual(fixture.layers.map((l) => l.id))
    for (let i = 1; i < layout.bands.length; i++) {
      const above = layout.bands[i - 1]!
      expect(layout.bands[i]!.y).toBeCloseTo(above.y + above.height)
    }
    for (const n of fixture.nodes) {
      const band = layout.bands.find((b) => b.id === node(n.id).layer)!
      expect(y(n.id)).toBeGreaterThanOrEqual(band.y)
      expect(y(n.id) + NODE_HEIGHT).toBeLessThanOrEqual(band.y + band.height)
    }
  })

  it('gives the same positions on every run', async () => {
    const a = await computeLayout(fixture, new ELK())
    const b = await computeLayout(fixture, new ELK())
    expect(a.positions).toEqual(b.positions)
  })
})

describe('layerOrder', () => {
  it('reads each layer row by row and puts twins side by side', () => {
    const positions = {
      'markdown-link': { x: 0, y: 0 },
      'frontmatter-lossless': { x: 100, y: 0 },
      'markdown-link-rs': { x: 200, y: 0 },
      'etag-write': { x: 0, y: 500 },
    }
    expect(layerOrder(fixture, positions)).toEqual([
      ['markdown-link', 'markdown-link-rs', 'frontmatter-lossless'],
      ['etag-write'],
    ])
  })
})

describe('packing', () => {
  it('wraps a layer wider than the column count onto more rows', () => {
    const positions = packLayers([['a', 'b', 'c'], ['d']], 2)
    expect(positions.a!.y).toBe(positions.b!.y)
    expect(positions.c!.y).toBeGreaterThan(positions.a!.y)
    expect(positions.d!.y).toBeGreaterThan(positions.c!.y)
    // A short row is centred.
    expect(positions.c!.x).toBeCloseTo((positions.a!.x + positions.b!.x) / 2)
  })

  it('picks fewer columns for one wide layer than the layer has nodes', () => {
    expect(chooseColumns([16, 8, 7, 6, 5, 4, 4, 1, 7])).toBeLessThan(16)
    expect(chooseColumns([2, 1])).toBeLessThanOrEqual(2)
  })
})

describe('edgeHandles', () => {
  it('runs bottom to top going down and top to bottom going up', () => {
    expect(edgeHandles({ x: 0, y: 0 }, { x: 0, y: 200 })).toEqual({ source: 'bottom', target: 'top' })
    expect(edgeHandles({ x: 0, y: 200 }, { x: 0, y: 0 })).toEqual({ source: 'top', target: 'bottom' })
  })

  it('runs side to side within a row', () => {
    expect(edgeHandles({ x: 0, y: 0 }, { x: 300, y: 0 })).toEqual({ source: 'right', target: 'left' })
    expect(edgeHandles({ x: 300, y: 0 }, { x: 0, y: 0 })).toEqual({ source: 'left', target: 'right' })
  })
})
