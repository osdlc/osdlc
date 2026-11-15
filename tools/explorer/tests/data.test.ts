import { describe, expect, it } from 'vitest'
import raw from '../data/fixture.json'
import { parseEcosystem, pickDataset } from '../src/model/data'

describe('pickDataset', () => {
  it('prefers ecosystem.json over the fixture', () => {
    const picked = pickDataset({ '../../data/fixture.json': { a: 1 }, '../../data/ecosystem.json': { b: 2 } })
    expect(picked).toEqual({ source: 'ecosystem.json', raw: { b: 2 } })
  })

  it('falls back to the fixture', () => {
    expect(pickDataset({ '../../data/fixture.json': { a: 1 } }).source).toBe('fixture.json')
  })

  it('throws when neither file is there', () => {
    expect(() => pickDataset({})).toThrow(/Neither/)
  })
})

describe('parseEcosystem', () => {
  it('reads the fixture without problems', () => {
    const { eco, problems } = parseEcosystem(raw)
    expect(problems).toEqual([])
    expect(eco.nodes.length).toBeGreaterThanOrEqual(8)
    expect(eco.nodes.length).toBeLessThanOrEqual(12)
  })

  it('fills defaults for missing optional fields', () => {
    const { eco } = parseEcosystem({
      layers: [{ id: 'l', label: 'L' }],
      nodes: [{ id: 'a', layer: 'l', states: ['present'], repo: { present: 'r' } }],
    })
    expect(eco.nodes[0]).toMatchObject({ name: 'a', notes: [], tasks: [], links: [], twin: null })
    expect(eco.nodes[0]?.repo).toEqual({ present: 'r', target: null })
  })

  it('reports each SCHEMA rule it breaks', () => {
    const { eco, problems } = parseEcosystem({
      layers: [{ id: 'l', label: 'L' }],
      nodes: [
        { id: 'ts', language: 'ts', layer: 'l', states: ['present'], twin: 'rs', repo: { present: 'r', target: 'r' } },
        { id: 'rs', language: 'rust', layer: 'nope', states: ['target'], twin: null },
        { id: 'ts', layer: 'l', states: ['present'] },
      ],
      edges: [
        { from: 'ts', to: 'ghost', kind: 'depends', states: ['present'] },
        { from: 'ts', to: 'rs', kind: 'twin', states: ['present'] },
      ],
    })
    expect(problems).toEqual([
      'Node id "ts" is used twice; the first one is kept.',
      'Node "ts" is absent from target but has a target repo or path.',
      'Twins "ts" and "rs" do not name each other.',
      'Node "rs" names unknown layer "nope".',
      'Edge ts -> ghost names a node that does not exist; it is skipped.',
      'Edge ts -> rs is in present, where one of its nodes is absent.',
      'Twin edge ts -> rs should run from the Rust crate to the TypeScript package.',
    ])
    expect(eco.edges).toHaveLength(1)
  })

  it('reads overlap edges and checks their rules', () => {
    const { eco, problems } = parseEcosystem({
      layers: [{ id: 'l', label: 'L' }],
      nodes: [
        { id: 'a', language: 'rust', layer: 'l', states: ['present'], twin: 'b' },
        { id: 'b', language: 'ts', layer: 'l', states: ['present'], twin: 'a' },
        { id: 'c', layer: 'l', states: ['present'] },
      ],
      edges: [
        { from: 'c', to: 'b', kind: 'overlaps', overlap: 'copy', states: ['present'], note: 'c copies b.' },
        { from: 'b', to: 'c', kind: 'overlaps', overlap: 'partial', states: ['present'], note: 'Again.' },
        { from: 'a', to: 'b', kind: 'overlaps', overlap: 'partial', states: ['present'], note: 'Twins.' },
        { from: 'a', to: 'c', kind: 'overlaps', overlap: 'fork', states: ['present'] },
        { from: 'c', to: 'a', kind: 'depends', overlap: 'copy', states: ['present'] },
      ],
    })
    expect(eco.edges[0]).toMatchObject({ kind: 'overlaps', overlap: 'copy', note: 'c copies b.' })
    expect(problems).toEqual([
      'Overlap edge b -- c is listed twice.',
      'Overlap edge a -- b joins twins; twins have their own edge.',
      'Overlap edge a -- c needs overlap: copy or partial.',
      'Overlap edge a -- c needs a note saying what overlaps.',
      'Edge c -> a has overlap but is not an overlaps edge.',
    ])
  })

  it('rejects input that is not an object', () => {
    expect(() => parseEcosystem([])).toThrow()
  })
})
