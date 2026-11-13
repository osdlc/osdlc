import type { EcoNode, Ecosystem, ViewMode } from './types'
import { RELATIONS, relationCounts, relationOf, type Relation } from './relations'
import type { DisplayEdge, DisplayGraph, DisplayNode } from './twins'
import { inView, repoInView, reposOf } from './view'

/** An empty list means "no filter" for the node facets. `relations` lists the edge groups shown. */
export interface Filters {
  languages: string[]
  kinds: string[]
  repos: string[]
  relations: Relation[]
  query: string
}

export function emptyFilters(): Filters {
  return { languages: [], kinds: [], repos: [], relations: [...RELATIONS], query: '' }
}

/** True when any filter differs from `emptyFilters()`. */
export function hasFilters(filters: Filters): boolean {
  const narrowed = filters.languages.length + filters.kinds.length + filters.repos.length > 0
  return narrowed || filters.query !== '' || RELATIONS.some((r) => !filters.relations.includes(r))
}

export interface FacetOption<T extends string = string> {
  value: T
  count: number
}

export interface Facets {
  languages: FacetOption[]
  kinds: FacetOption[]
  repos: FacetOption[]
  /** Counted in edges, not nodes. */
  relations: FacetOption<Relation>[]
}

function countBy(values: string[]): FacetOption[] {
  const counts = new Map<string, number>()
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1)
  return [...counts].map(([value, count]) => ({ value, count }))
}

/**
 * The values each filter can take, with node counts, in first-seen order (repos in `repos` order).
 * Relations come with edge counts.
 */
export function facetsOf(eco: Ecosystem): Facets {
  const repoCounts = countBy(eco.nodes.flatMap(reposOf))
  const repoOrder = eco.repos.map((repo) => repo.id)
  const rank = (id: string) => {
    const index = repoOrder.indexOf(id)
    return index === -1 ? repoOrder.length : index
  }
  return {
    languages: countBy(eco.nodes.map((node) => node.language)),
    kinds: countBy(eco.nodes.map((node) => node.kind)),
    repos: repoCounts.sort((a, b) => rank(a.value) - rank(b.value)),
    relations: relationCounts(eco),
  }
}

/** Repos a node counts as being in for the repo filter: the view's repo, or both repos in Compare. */
function filterReposOf(node: EcoNode, view: ViewMode): string[] {
  if (view === 'compare') return reposOf(node)
  const repo = repoInView(node, view)
  return repo === null ? [] : [repo]
}

export function passesFilters(node: EcoNode, filters: Filters, view: ViewMode): boolean {
  if (filters.languages.length > 0 && !filters.languages.includes(node.language)) return false
  if (filters.kinds.length > 0 && !filters.kinds.includes(node.kind)) return false
  if (filters.repos.length > 0 && !filterReposOf(node, view).some((repo) => filters.repos.includes(repo))) {
    return false
  }
  return true
}

/** Search matches id, name, purpose and paths, case-insensitively. An empty query matches nothing. */
export function matchesQuery(node: EcoNode, query: string): boolean {
  const needle = query.trim().toLowerCase()
  if (needle === '') return false
  const haystack = [node.id, node.name, node.purpose, node.path.present ?? '', node.path.target ?? '']
  return haystack.some((text) => text.toLowerCase().includes(needle))
}

/** The members of a card that exist in the view. */
export function membersInView(node: DisplayNode, view: ViewMode): EcoNode[] {
  return node.members.filter((member) => inView(member.states, view))
}

/** A card matches when any member in the view does. */
export function cardMatchesQuery(node: DisplayNode, query: string, view: ViewMode): boolean {
  return membersInView(node, view).some((member) => matchesQuery(member, query))
}

export interface VisibleGraph {
  nodes: DisplayNode[]
  edges: DisplayEdge[]
}

/**
 * Cards in the view with a member that passes the filters, and the edges in the view whose ends
 * are both shown and whose relation is switched on. The relation toggles hide edges only, never
 * cards.
 */
export function visibleGraph(graph: DisplayGraph, view: ViewMode, filters: Filters): VisibleGraph {
  const nodes = graph.nodes.filter((node) =>
    membersInView(node, view).some((member) => passesFilters(member, filters, view)),
  )
  const shown = new Set(nodes.map((node) => node.id))
  const edges = graph.edges.filter(
    (edge) =>
      inView(edge.states, view) &&
      shown.has(edge.from) &&
      shown.has(edge.to) &&
      filters.relations.includes(relationOf(edge.kind)),
  )
  return { nodes, edges }
}
