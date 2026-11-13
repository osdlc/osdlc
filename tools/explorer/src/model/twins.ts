import type { EcoEdge, EcoNode, Ecosystem, Layer, Repo, State } from './types'
import { STATES, edgeId } from './types'

/**
 * What the graph draws: one card per node, except that a twin pair shares one card. The data keeps
 * both nodes and their twin edge; only the view merges them.
 */
export interface DisplayNode {
  /** The TypeScript member's id for a twin pair, else the node's own id. */
  id: string
  /** One node, or a twin pair with the TypeScript member first. */
  members: EcoNode[]
  /** Every state any member is in. */
  states: State[]
  layer: string
}

/** One drawn edge. Edges of the same kind between the same two cards collapse into one. */
export interface DisplayEdge extends EcoEdge {
  /** The data edges it stands for, in data order. */
  members: EcoEdge[]
}

export interface DisplayGraph {
  layers: Layer[]
  repos: Repo[]
  nodes: DisplayNode[]
  edges: DisplayEdge[]
  /** The card a node id is drawn on, for both members of a twin pair. */
  displayIdOf: Map<string, string>
}

export function isTwinCard(node: DisplayNode): boolean {
  return node.members.length > 1
}

function unionStates(lists: readonly (readonly State[])[]): State[] {
  return STATES.filter((state) => lists.some((list) => list.includes(state)))
}

/** A twin pair as one card, TypeScript first; every other node as its own card. */
export function groupTwins(eco: Ecosystem): DisplayGraph {
  const byId = new Map(eco.nodes.map((node) => [node.id, node]))
  const displayIdOf = new Map<string, string>()
  const nodes: DisplayNode[] = []

  for (const node of eco.nodes) {
    if (displayIdOf.has(node.id)) continue
    const twin = node.twin === null ? undefined : byId.get(node.twin)
    const paired = twin !== undefined && twin.twin === node.id && !displayIdOf.has(twin.id)
    const members = paired ? [node, twin].sort((a, b) => rankLanguage(a) - rankLanguage(b)) : [node]
    const primary = members[0]!
    for (const member of members) displayIdOf.set(member.id, primary.id)
    nodes.push({
      id: primary.id,
      members,
      states: unionStates(members.map((m) => m.states)),
      layer: primary.layer,
    })
  }

  const collapsed = new Map<string, DisplayEdge>()
  for (const edge of eco.edges) {
    const from = displayIdOf.get(edge.from)
    const to = displayIdOf.get(edge.to)
    // The twin edge, and anything else inside a pair, has no card to run between.
    if (from === undefined || to === undefined || from === to) continue
    const key = edgeId({ from, to, kind: edge.kind })
    const existing = collapsed.get(key)
    if (existing) {
      existing.members.push(edge)
      existing.states = unionStates([existing.states, edge.states])
      continue
    }
    const display: DisplayEdge = { from, to, kind: edge.kind, states: [...edge.states], members: [edge] }
    if (edge.note !== undefined) display.note = edge.note
    if (edge.overlap !== undefined) display.overlap = edge.overlap
    collapsed.set(key, display)
  }

  return { layers: eco.layers, repos: eco.repos, nodes, edges: [...collapsed.values()], displayIdOf }
}

function rankLanguage(node: EcoNode): number {
  return node.language === 'ts' ? 0 : 1
}

/** The card for a node id, or null when no node has that id. */
export function displayIdFor(graph: DisplayGraph, id: string): string | null {
  return graph.displayIdOf.get(id) ?? null
}

/** The data edge's drawn edge id. */
export function displayEdgeIdOf(graph: DisplayGraph, edge: EcoEdge): string {
  const from = graph.displayIdOf.get(edge.from) ?? edge.from
  const to = graph.displayIdOf.get(edge.to) ?? edge.to
  return edgeId({ from, to, kind: edge.kind })
}

