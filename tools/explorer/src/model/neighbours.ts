import { isOverlap } from './relations'
import type { DisplayGraph } from './twins'
import type { EcoEdge, EcoNode, ViewMode } from './types'
import { edgeId } from './types'
import { inView } from './view'

export interface Neighbour {
  edge: EcoEdge
  /** The node at the other end. */
  node: EcoNode
  /** The card member this edge belongs to; on a twin card the panel names it. */
  via: EcoNode
  /** The drawn edge that carries this data edge, for selecting it. */
  displayEdgeId: string
}

export interface Neighbours {
  /** Edges from the card: what it depends on, implements or extends. */
  dependsOn: Neighbour[]
  /** Edges into the card: what depends on it. */
  usedBy: Neighbour[]
  /** Overlap edges either way: the other node that does some of the same job. */
  overlaps: Neighbour[]
}

/**
 * A card's neighbours over the data edges in the view, for every member of the card. Edges inside
 * a twin pair, the twin edge among them, are not drawn and are left out. Overlap edges are
 * undirected, so they go in `overlaps` whichever end the card is.
 */
export function neighboursOf(graph: DisplayGraph, id: string, view: ViewMode): Neighbours {
  const byId = new Map(graph.nodes.flatMap((card) => card.members.map((member) => [member.id, member] as const)))
  const result: Neighbours = { dependsOn: [], usedBy: [], overlaps: [] }
  for (const display of graph.edges) {
    if (display.from !== id && display.to !== id) continue
    const displayEdgeId = edgeId(display)
    for (const edge of display.members) {
      if (!inView(edge.states, view)) continue
      const outgoing = display.from === id
      const via = byId.get(outgoing ? edge.from : edge.to)
      const node = byId.get(outgoing ? edge.to : edge.from)
      if (!via || !node) continue
      const list = isOverlap(edge) ? result.overlaps : outgoing ? result.dependsOn : result.usedBy
      list.push({ edge, node, via, displayEdgeId })
    }
  }
  const byName = (a: Neighbour, b: Neighbour) => a.node.name.localeCompare(b.node.name) || a.via.name.localeCompare(b.via.name)
  result.dependsOn.sort(byName)
  result.usedBy.sort(byName)
  result.overlaps.sort(byName)
  return result
}

/** Every edge touching the node, for highlighting. */
export function incidentEdges(edges: readonly EcoEdge[], id: string): EcoEdge[] {
  return edges.filter((edge) => edge.from === id || edge.to === id)
}
