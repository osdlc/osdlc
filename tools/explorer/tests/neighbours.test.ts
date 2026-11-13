import { describe, expect, it } from 'vitest'
import { incidentEdges, neighboursOf } from '../src/model/neighbours'
import { groupTwins } from '../src/model/twins'
import { fixture } from './fixture'

const graph = groupTwins(fixture)
const names = (list: { node: { id: string } }[]) => list.map((n) => n.node.id)
const vias = (list: { node: { id: string }; via: { id: string } }[]) => list.map((n) => `${n.via.id}>${n.node.id}`)

describe('neighboursOf', () => {
  it('lists both members of a twin card, saying which member each edge is from, without the twin edge', () => {
    const { dependsOn, usedBy } = neighboursOf(graph, 'markdown-corpus-ts', 'compare')
    expect(vias(dependsOn).sort()).toEqual([
      'markdown-corpus-ts>etag-write',
      'markdown-corpus-ts>frontmatter-lossless',
      'markdown-corpus-ts>markdown-link',
      'markdown-corpus>markdown-link-rs',
    ])
    expect(vias(usedBy).sort()).toEqual([
      'markdown-corpus-ts>corpus-schema',
      'markdown-corpus-ts>markdown-astro',
      'markdown-corpus>corpus-schema-rs',
    ])
  })

  it('points each entry at the drawn edge that carries it', () => {
    const { dependsOn } = neighboursOf(graph, 'markdown-corpus-ts', 'compare')
    const rust = dependsOn.find((n) => n.via.id === 'markdown-corpus')!
    expect(rust.displayEdgeId).toBe('markdown-corpus-ts->markdown-link:depends')
  })

  it('keeps only the edges in the view', () => {
    expect(names(neighboursOf(graph, 'frontmatter-lossless', 'present').usedBy).sort()).toEqual([
      'corpus-schema',
      'markdown-db',
      'markdown-vault',
    ])
    expect(names(neighboursOf(graph, 'frontmatter-lossless', 'target').usedBy)).toEqual(['markdown-corpus-ts'])
  })

  it('lists overlaps from either end, apart from depends on and used by', () => {
    const corpus = neighboursOf(graph, 'markdown-corpus-ts', 'compare')
    expect(vias(corpus.overlaps)).toEqual(['markdown-corpus>markdown-vault'])
    const vault = neighboursOf(graph, 'markdown-vault', 'compare')
    expect(names(vault.overlaps)).toEqual(['markdown-corpus'])
    expect(names(vault.dependsOn)).toEqual(['frontmatter-lossless'])
    expect(vault.overlaps[0]?.edge.overlap).toBe('partial')
  })

  it('drops an overlap the plan removes from the target view', () => {
    expect(neighboursOf(graph, 'markdown-corpus-ts', 'target').overlaps).toEqual([])
  })

  it('carries the edge so the panel can tag its state', () => {
    const astro = neighboursOf(graph, 'markdown-astro', 'compare').dependsOn
    expect(astro.map((n) => [n.node.id, n.edge.states.join('+')])).toContainEqual(['markdown-vault', 'present'])
  })
})

describe('incidentEdges', () => {
  it('returns edges on either end', () => {
    expect(incidentEdges(fixture.edges, 'markdown-link-rs')).toHaveLength(2)
  })
})
