import { describe, expect, it } from 'vitest'
import {
  cardMatchesQuery,
  emptyFilters,
  facetsOf,
  hasFilters,
  matchesQuery,
  visibleGraph,
} from '../src/model/filters'
import { groupTwins } from '../src/model/twins'
import { edgeId } from '../src/model/types'
import { fixture, node } from './fixture'

const graph = groupTwins(fixture)
const ids = (items: { id: string }[]) => items.map((item) => item.id).sort()
const card = (id: string) => graph.nodes.find((n) => n.id === id)!

describe('visibleGraph by view', () => {
  it('compare shows every card and drawn edge', () => {
    const shown = visibleGraph(graph, 'compare', emptyFilters())
    expect(shown.nodes).toHaveLength(graph.nodes.length)
    expect(shown.edges).toHaveLength(graph.edges.length)
  })

  it('present keeps a twin card whose other member is target-only, and drops target-only edges', () => {
    const shown = visibleGraph(graph, 'present', emptyFilters())
    expect(ids(shown.nodes)).toContain('markdown-corpus-ts')
    expect(ids(shown.nodes)).toContain('markdown-db')
    expect(shown.edges.every((edge) => edge.states.includes('present'))).toBe(true)
  })

  it('target hides present-only cards and edges', () => {
    const shown = visibleGraph(graph, 'target', emptyFilters())
    expect(ids(shown.nodes)).toContain('corpus-schema')
    expect(ids(shown.nodes)).not.toContain('markdown-vault')
    expect(shown.edges.every((edge) => edge.states.includes('target'))).toBe(true)
  })
})

describe('visibleGraph filters', () => {
  it('keeps a twin card when either member matches the language', () => {
    const shown = visibleGraph(graph, 'compare', { ...emptyFilters(), languages: ['rust'] })
    expect(ids(shown.nodes)).toEqual(['corpus-schema', 'markdown-corpus-ts', 'markdown-link'])
    expect(shown.edges.map(edgeId).sort()).toEqual([
      'corpus-schema->markdown-corpus-ts:reads',
      'corpus-schema->markdown-link:depends',
      'markdown-corpus-ts->markdown-link:depends',
    ])
  })

  it('checks only the members in the view', () => {
    // corpus-schema's Rust member is target-only, so in present the card is TypeScript only.
    const rust = { ...emptyFilters(), languages: ['rust'] }
    expect(ids(visibleGraph(graph, 'present', rust).nodes)).not.toContain('corpus-schema')
    expect(ids(visibleGraph(graph, 'target', rust).nodes)).toContain('corpus-schema')
  })

  it('filters by kind', () => {
    const shown = visibleGraph(graph, 'compare', { ...emptyFilters(), kinds: ['spec'] })
    expect(ids(shown.nodes)).toEqual(['corpus-schema-spec'])
  })

  it('matches a moving node on either repo in compare, and on the view repo otherwise', () => {
    const repos = { ...emptyFilters(), repos: ['osdlc/osdlc'] }
    expect(ids(visibleGraph(graph, 'compare', repos).nodes)).toContain('corpus-schema')
    expect(ids(visibleGraph(graph, 'present', repos).nodes)).toContain('corpus-schema')
    expect(ids(visibleGraph(graph, 'target', repos).nodes)).not.toContain('corpus-schema')
  })
})

describe('visibleGraph relations', () => {
  it('shows every relation the filter offers by default', () => {
    expect(emptyFilters().relations).toEqual(['dependencies', 'structure', 'overlaps'])
  })

  it('keeps only the edges of the relations switched on, and every card', () => {
    const shown = visibleGraph(graph, 'compare', { ...emptyFilters(), relations: ['overlaps'] })
    expect(shown.nodes).toHaveLength(graph.nodes.length)
    expect(shown.edges.map(edgeId).sort()).toEqual([
      'markdown-db->corpus-schema:overlaps',
      'markdown-vault->markdown-corpus-ts:overlaps',
    ])
  })

  it('groups edge kinds into dependencies and structure', () => {
    const kinds = (relation: 'dependencies' | 'structure') => [
      ...new Set(visibleGraph(graph, 'compare', { ...emptyFilters(), relations: [relation] }).edges.map((e) => e.kind)),
    ]
    expect(kinds('dependencies').sort()).toEqual(['depends'])
    expect(kinds('structure').sort()).toEqual(['implements', 'reads'])
  })

  it('counts a hidden relation as a filter', () => {
    expect(hasFilters(emptyFilters())).toBe(false)
    expect(hasFilters({ ...emptyFilters(), relations: ['overlaps'] })).toBe(true)
    expect(hasFilters({ ...emptyFilters(), query: 'x' })).toBe(true)
  })
})

describe('matchesQuery', () => {
  it('matches name, id, purpose and path case-insensitively', () => {
    expect(matchesQuery(node('markdown-link'), 'LINK')).toBe(true)
    expect(matchesQuery(node('etag-write'), 'atomic')).toBe(true)
    expect(matchesQuery(node('markdown-db'), 'skillwright/packages')).toBe(true)
    expect(matchesQuery(node('etag-write'), 'zzz')).toBe(false)
  })

  it('matches nothing for an empty query', () => {
    expect(matchesQuery(node('etag-write'), '  ')).toBe(false)
  })

  it('matches a twin card on either member in the view', () => {
    expect(cardMatchesQuery(card('markdown-link'), 'packages/rust/markdown-link', 'compare')).toBe(true)
    expect(cardMatchesQuery(card('corpus-schema'), 'packages/rust/corpus-schema', 'present')).toBe(false)
  })
})

describe('facetsOf', () => {
  it('counts nodes per value and keeps repos in data order', () => {
    const facets = facetsOf(fixture)
    expect(facets.repos.map((r) => r.value)).toEqual(['osdlc/osdlc', 'osdlc/markdown', 'sksizer/dev'])
    expect(facets.languages.find((l) => l.value === 'rust')?.count).toBe(3)
  })

  it('counts data edges per relation the filter offers', () => {
    const relations = Object.fromEntries(facetsOf(fixture).relations.map((r) => [r.value, r.count]))
    expect(relations).toEqual({ dependencies: 12, structure: 4, overlaps: 2 })
  })
})
