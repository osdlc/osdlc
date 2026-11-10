import { describe, expect, it } from 'vitest'
import { cardFace, titleOf } from '../src/model/card'
import { parseEcosystem } from '../src/model/data'
import { displayEdgeIdOf, groupTwins } from '../src/model/twins'
import { edgeId } from '../src/model/types'
import { fixture, node } from './fixture'

const graph = groupTwins(fixture)
const cardOf = (id: string) => graph.nodes.find((n) => n.id === id)!

describe('groupTwins', () => {
  it('draws each twin pair as one card, TypeScript member first, and every other node alone', () => {
    expect(graph.nodes).toHaveLength(fixture.nodes.length - 3)
    expect(cardOf('markdown-link').members.map((m) => m.id)).toEqual(['markdown-link', 'markdown-link-rs'])
    // The TypeScript member names the card even when it is listed second in the data.
    expect(cardOf('markdown-corpus-ts').members.map((m) => m.id)).toEqual(['markdown-corpus-ts', 'markdown-corpus'])
    expect(cardOf('etag-write').members).toHaveLength(1)
  })

  it('gives a card every state any member is in', () => {
    expect(cardOf('corpus-schema').states).toEqual(['present', 'target'])
    expect(cardOf('markdown-db').states).toEqual(['present'])
  })

  it('maps both member ids to the card', () => {
    expect(graph.displayIdOf.get('markdown-link-rs')).toBe('markdown-link')
    expect(graph.displayIdOf.get('markdown-corpus')).toBe('markdown-corpus-ts')
    expect(graph.displayIdOf.get('etag-write')).toBe('etag-write')
  })

  it('drops the twin edge and attaches every member edge to the card', () => {
    expect(graph.edges.some((e) => e.kind === 'twin')).toBe(false)
    const ids = graph.edges.map(edgeId)
    expect(ids).toContain('markdown-corpus-ts->markdown-link:depends')
    expect(ids.some((id) => id.includes('markdown-link-rs') || id.startsWith('markdown-corpus->'))).toBe(false)
  })

  it('collapses edges of one kind between the same two cards, keeping both states and every data edge', () => {
    // markdown-corpus -> markdown-link-rs (present, target) and markdown-corpus-ts -> markdown-link (target).
    const edge = graph.edges.find((e) => edgeId(e) === 'markdown-corpus-ts->markdown-link:depends')!
    expect(edge.states).toEqual(['present', 'target'])
    expect(edge.members.map((m) => `${m.from}->${m.to}`)).toEqual([
      'markdown-corpus->markdown-link-rs',
      'markdown-corpus-ts->markdown-link',
    ])
  })

  it('reads a present-only and a target-only member edge as both states', () => {
    const { eco } = parseEcosystem({
      layers: [{ id: 'l', label: 'L' }],
      nodes: [
        { id: 'a', language: 'ts', layer: 'l', states: ['present', 'target'], twin: 'a-rs' },
        { id: 'a-rs', language: 'rust', layer: 'l', states: ['present', 'target'], twin: 'a' },
        { id: 'c', layer: 'l', states: ['present', 'target'] },
      ],
      edges: [
        { from: 'a-rs', to: 'a', kind: 'twin', states: ['present', 'target'] },
        { from: 'c', to: 'a', kind: 'depends', states: ['present'] },
        { from: 'c', to: 'a-rs', kind: 'depends', states: ['target'] },
        { from: 'c', to: 'a-rs', kind: 'reads', states: ['target'] },
      ],
    })
    const small = groupTwins(eco)
    expect(small.edges.map((e) => `${edgeId(e)} ${e.states.join('+')}`)).toEqual([
      'c->a:depends present+target',
      'c->a:reads target',
    ])
  })

  it('finds the drawn edge for a data edge', () => {
    const data = fixture.edges.find((e) => e.from === 'markdown-corpus' && e.to === 'markdown-link-rs')!
    expect(displayEdgeIdOf(graph, data)).toBe('markdown-corpus-ts->markdown-link:depends')
  })
})

describe('twin cards', () => {
  it('titles a pair with the TypeScript name and the crate under it, or one name when they match', () => {
    expect(titleOf([node('markdown-link'), node('markdown-link-rs')])).toEqual({
      title: '@osdlc/markdown-link',
      subtitle: 'markdown-link',
    })
    const same = { ...node('markdown-link-rs'), name: '@osdlc/markdown-link' }
    expect(titleOf([node('markdown-link'), same])).toEqual({ title: '@osdlc/markdown-link (TS + Rust)', subtitle: null })
  })

  it('badges the member that differs from its twin in Compare', () => {
    // corpus-schema moves repo; its Rust twin is new and does not move.
    const badges = cardFace(cardOf('corpus-schema'), 'compare', fixture.repos).members.map((m) => m.badge?.mark ?? null)
    expect(badges).toEqual(['⇢', '+'])
    // markdown-corpus-ts is new; its Rust twin is in both states.
    const corpus = cardFace(cardOf('markdown-corpus-ts'), 'compare', fixture.repos).members.map((m) => m.badge?.mark ?? null)
    expect(corpus).toEqual(['+', null])
    // Twins that match get no badges.
    expect(cardFace(cardOf('markdown-link'), 'compare', fixture.repos).members.every((m) => m.badge === null)).toBe(true)
  })

  it('shows only the members in a single-state view, with no badges', () => {
    const present = cardFace(cardOf('corpus-schema'), 'present', fixture.repos)
    expect(present.members.map((m) => m.id)).toEqual(['corpus-schema'])
    expect(present.title).toBe(node('corpus-schema').name)
    expect(present.subtitle).toBeNull()
  })

  it('lists both repos when the members live apart', () => {
    // In present only the TypeScript member exists; in Compare it is shown in its target repo.
    expect(cardFace(cardOf('corpus-schema'), 'present', fixture.repos).repo).toBe('osdlc')
    expect(cardFace(cardOf('corpus-schema'), 'target', fixture.repos).repo).toBe('markdown')
    const apart = { ...cardOf('markdown-link'), members: [node('markdown-link'), { ...node('markdown-link-rs'), repo: { present: 'sksizer/dev', target: 'sksizer/dev' } }] }
    expect(cardFace(apart, 'present', fixture.repos).repo).toBe('osdlc / dev')
  })

  it('shows both versions only when they differ', () => {
    expect(cardFace(cardOf('markdown-link'), 'compare', fixture.repos).versions).toBe('0.3.0 / 0.5.0')
    expect(cardFace(cardOf('markdown-corpus-ts'), 'present', fixture.repos).versions).toBeNull()
  })
})
