import ELK from 'elkjs/lib/elk.bundled.js'
import { describe, expect, it } from 'vitest'
import { parseEcosystem } from '../src/model/data'
import { computeLayout } from '../src/model/layout'
import { groupTwins } from '../src/model/twins'

// Checks the real data against data/SCHEMA.md whenever it is present.
const modules = import.meta.glob<unknown>('../data/ecosystem.json', { eager: true, import: 'default' })
const raw = Object.values(modules)[0]

describe.skipIf(raw === undefined)('data/ecosystem.json', () => {
  it('follows the SCHEMA.md rules', () => {
    expect(parseEcosystem(raw).problems).toEqual([])
  })

  it('backs every overlap edge with a kind and a note', () => {
    const { eco } = parseEcosystem(raw)
    const overlaps = eco.edges.filter((edge) => edge.kind === 'overlaps')
    expect(overlaps.length).toBeGreaterThan(0)
    for (const edge of overlaps) {
      expect(edge.overlap, `${edge.from} -- ${edge.to}`).toMatch(/^(copy|partial)$/)
      expect(edge.note?.trim(), `${edge.from} -- ${edge.to}`).toBeTruthy()
    }
  })

  it('lays out with every card inside its layer band', { timeout: 20000 }, async () => {
    const graph = groupTwins(parseEcosystem(raw).eco)
    const layout = await computeLayout(graph, new ELK())
    expect(Object.keys(layout.positions)).toHaveLength(graph.nodes.length)
    for (const node of graph.nodes) {
      const band = layout.bands.find((b) => b.id === node.layer)!
      const y = layout.positions[node.id]!.y
      expect(y).toBeGreaterThanOrEqual(band.y)
      expect(y).toBeLessThanOrEqual(band.y + band.height)
    }
  })
})
