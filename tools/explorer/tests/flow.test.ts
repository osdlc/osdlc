import ELK from 'elkjs/lib/elk.bundled.js'
import { beforeAll, describe, expect, it } from 'vitest'
import { emptyFilters, visibleGraph } from '../src/model/filters'
import { toFlow, type FlowInput } from '../src/model/flow'
import { computeLayout, type Layout } from '../src/model/layout'
import type { Selection } from '../src/model/flow'
import { groupTwins } from '../src/model/twins'
import type { ViewMode } from '../src/model/types'
import { fixture } from './fixture'

const graph = groupTwins(fixture)
let layout: Layout
beforeAll(async () => {
  layout = await computeLayout(graph, new ELK())
})

function flowFor(view: ViewMode, selection: Selection = null, query = '', relations = emptyFilters().relations) {
  const shown = visibleGraph(graph, view, { ...emptyFilters(), relations })
  const input: FlowInput = { graph, ...shown, positions: layout.positions, view, selection, query }
  return toFlow(input)
}

const card = (flow: ReturnType<typeof flowFor>, id: string) => flow.nodes.find((n) => n.id === id)!.data

describe('toFlow', () => {
  it('keeps every node at the same position in every view', () => {
    for (const view of ['present', 'target'] as const) {
      for (const n of flowFor(view).nodes) {
        expect(n.position).toEqual(flowFor('compare').nodes.find((c) => c.id === n.id)!.position)
      }
    }
  })

  it('colours by change only in compare', () => {
    expect(card(flowFor('compare'), 'markdown-db').change).toBe('removed')
    expect(card(flowFor('compare'), 'corpus-schema').change).toBe('both')
    expect(card(flowFor('present'), 'markdown-db').change).toBe('both')
    const edge = flowFor('compare').edges.find((e) => e.id === 'markdown-astro->markdown-vault:depends')!
    expect(edge.class).toContain('eco-edge--removed')
  })

  it('shows the move badge in compare only', () => {
    expect(card(flowFor('compare'), 'corpus-schema').move).toEqual({ from: 'osdlc', to: 'markdown' })
    expect(card(flowFor('target'), 'corpus-schema').move).toBeNull()
    expect(card(flowFor('present'), 'corpus-schema').repo).toBe('osdlc')
  })

  it('dims everything not touching the selected card', () => {
    const flow = flowFor('compare', { type: 'node', id: 'markdown-corpus-ts' })
    expect(card(flow, 'markdown-corpus-ts').selected).toBe(true)
    expect(card(flow, 'markdown-link').dimmed).toBe(false)
    expect(card(flow, 'markdown-astro').dimmed).toBe(false)
    expect(card(flow, 'markdown-db').dimmed).toBe(true)
    const focused = flow.edges.filter((e) => e.class.includes('is-focused')).map((e) => e.id)
    expect(focused.sort()).toEqual([
      'corpus-schema->markdown-corpus-ts:reads',
      'markdown-astro->markdown-corpus-ts:depends',
      'markdown-corpus-ts->etag-write:depends',
      'markdown-corpus-ts->frontmatter-lossless:depends',
      'markdown-corpus-ts->markdown-link:depends',
      'markdown-vault->markdown-corpus-ts:overlaps',
    ])
  })

  it('marks search matches and fades the rest', () => {
    const flow = flowFor('compare', null, 'corpus')
    expect(card(flow, 'markdown-corpus-ts').matched).toBe(true)
    expect(card(flow, 'etag-write').dimmed).toBe(true)
  })

  it('labels edges that are not plain dependencies, and draws no twin edge', () => {
    const edges = flowFor('compare').edges
    expect(edges.find((e) => e.id === 'corpus-schema->corpus-schema-spec:implements')?.label).toBe('implements')
    expect(edges.find((e) => e.id === 'corpus-schema->markdown-link:depends')?.label).toBeUndefined()
    expect(edges.some((e) => e.data.edge.kind === 'twin')).toBe(false)
  })

  it('draws overlaps with no arrowhead and a ≈ tag that says when the overlap goes away', () => {
    const overlap = flowFor('compare').edges.find((e) => e.id === 'markdown-db->corpus-schema:overlaps')!
    expect(overlap.markerColor).toBeNull()
    expect(overlap.class).toContain('eco-edge--overlap')
    expect(overlap.class).toContain('eco-edge--removed')
    expect(overlap.label).toBe('≈ copy · − going away')
    const present = flowFor('present').edges.find((e) => e.id === 'markdown-vault->markdown-corpus-ts:overlaps')!
    expect(present.label).toBe('≈ overlap')
    expect(present.type).toBe('straight')
    expect(flowFor('compare').edges.find((e) => e.id === 'corpus-schema->markdown-link:depends')?.markerColor).not.toBeNull()
  })

  it('counts the overlap edges drawn at each card', () => {
    expect(card(flowFor('compare'), 'markdown-corpus-ts').overlaps).toBe(1)
    expect(card(flowFor('compare'), 'markdown-link').overlaps).toBe(0)
    expect(card(flowFor('target'), 'markdown-corpus-ts').overlaps).toBe(0)
    expect(card(flowFor('compare', null, '', ['dependencies']), 'markdown-corpus-ts').overlaps).toBe(0)
  })

  it('draws a twin pair as one card with a logo per member in the view', () => {
    const pair = card(flowFor('compare'), 'markdown-link')
    expect([pair.title, pair.subtitle]).toEqual(['@osdlc/markdown-link', 'markdown-link'])
    expect(pair.members.map((m) => m.logo)).toEqual(['typescript', 'rust'])
    expect(pair.kind).toBe('package + crate')
    expect(card(flowFor('present'), 'corpus-schema').members.map((m) => m.logo)).toEqual(['typescript'])
    expect(card(flowFor('compare'), 'corpus-schema-spec').members.map((m) => m.logo)).toEqual(['markdown'])
    expect(flowFor('compare').nodes.map((n) => n.id)).not.toContain('markdown-link-rs')
  })

  it('emits nodes in reading order', () => {
    const ys = flowFor('compare').nodes.map((n) => n.position.y)
    expect(ys).toEqual([...ys].sort((a, b) => a - b))
  })
})
