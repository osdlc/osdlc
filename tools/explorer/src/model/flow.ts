import type { Change, EcoEdge, ViewMode } from './types'
import { edgeId } from './types'
import { cardFace, changeInView, type CardFace } from './card'
import type { HandleSide, Point } from './layout'
import { edgeHandles } from './layout'
import { cardMatchesQuery } from './filters'
import { isOverlap, overlapLabel } from './relations'
import type { DisplayEdge, DisplayGraph, DisplayNode } from './twins'
import { CHANGE_LABEL } from './view'

export type Selection = { type: 'node'; id: string } | { type: 'edge'; id: string } | null

/** What a node card needs to draw itself. */
export interface CardData extends CardFace {
  node: DisplayNode
  /** Overlap edges touching the card among the edges drawn. */
  overlaps: number
  selected: boolean
  dimmed: boolean
  matched: boolean
}

export interface FlowNodeSpec {
  id: string
  type: 'eco'
  position: Point
  data: CardData
}

export interface FlowEdgeSpec {
  id: string
  source: string
  target: string
  sourceHandle: string
  targetHandle: string
  /** Overlaps are straight, so they never lie on top of a curved dependency edge between the same pair. */
  type: 'default' | 'straight'
  label?: string
  class: string
  /**
   * Colour token for the arrowhead; markers take inline style, so a CSS variable works. Null for
   * an edge with no direction, which gets no arrowhead.
   */
  markerColor: string | null
  data: { edge: DisplayEdge; change: Change }
}

export function sourceHandleId(side: HandleSide): string {
  return `s-${side}`
}

export function targetHandleId(side: HandleSide): string {
  return `t-${side}`
}

interface FocusSet {
  nodes: Set<string>
  edges: Set<string>
}

/** The nodes and edges to keep bright while something is selected, or null for no focus. */
export function focusOf(edges: readonly EcoEdge[], selection: Selection): FocusSet | null {
  if (selection === null) return null
  if (selection.type === 'node') {
    const focus: FocusSet = { nodes: new Set([selection.id]), edges: new Set() }
    for (const edge of edges) {
      if (edge.from !== selection.id && edge.to !== selection.id) continue
      focus.edges.add(edgeId(edge))
      focus.nodes.add(edge.from)
      focus.nodes.add(edge.to)
    }
    return focus
  }
  const edge = edges.find((e) => edgeId(e) === selection.id)
  if (!edge) return null
  return { nodes: new Set([edge.from, edge.to]), edges: new Set([selection.id]) }
}

export interface FlowInput {
  graph: DisplayGraph
  nodes: readonly DisplayNode[]
  edges: readonly DisplayEdge[]
  positions: Record<string, Point>
  view: ViewMode
  selection: Selection
  query: string
}

const MARKER_COLOR: Record<Change, string> = {
  both: 'var(--edge-both)',
  removed: 'var(--removed)',
  added: 'var(--added)',
}

const CHANGE_MARK: Record<Change, string> = { both: '', removed: '−', added: '+' }

/** An overlap's tag, with its change spelled out in Compare so colour is not the only signal. */
export function overlapEdgeLabel(edge: EcoEdge, change: Change): string {
  const tag = overlapLabel(edge)
  return change === 'both' ? tag : `${tag} · ${CHANGE_MARK[change]} ${CHANGE_LABEL[change]}`
}

/**
 * Vue Flow nodes and edges for what is visible. Nodes come out in reading order (row by row, left
 * to right), which is also the Tab order.
 */
export function toFlow(input: FlowInput): { nodes: FlowNodeSpec[]; edges: FlowEdgeSpec[] } {
  const { graph, positions, view, selection, query } = input
  const focus = focusOf(input.edges, selection)
  const searching = query.trim() !== ''
  const overlapCount = new Map<string, number>()
  for (const edge of input.edges) {
    if (!isOverlap(edge)) continue
    for (const id of [edge.from, edge.to]) overlapCount.set(id, (overlapCount.get(id) ?? 0) + 1)
  }

  const nodes: FlowNodeSpec[] = input.nodes
    .filter((node) => positions[node.id] !== undefined)
    .map((node) => {
      const matched = searching && cardMatchesQuery(node, query, view)
      return {
        id: node.id,
        type: 'eco' as const,
        position: positions[node.id]!,
        data: {
          ...cardFace(node, view, graph.repos),
          node,
          overlaps: overlapCount.get(node.id) ?? 0,
          selected: selection?.type === 'node' && selection.id === node.id,
          dimmed: (focus !== null && !focus.nodes.has(node.id)) || (searching && !matched),
          matched,
        },
      }
    })
    .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)

  const edges: FlowEdgeSpec[] = input.edges.flatMap((edge) => {
    const from = positions[edge.from]
    const to = positions[edge.to]
    if (!from || !to) return []
    const id = edgeId(edge)
    const change = changeInView(edge.states, view)
    const sides = edgeHandles(from, to)
    const overlap = isOverlap(edge)
    const classes = ['eco-edge', `eco-edge--${change}`]
    if (overlap) classes.push('eco-edge--overlap')
    if (focus) classes.push(focus.edges.has(id) ? 'is-focused' : 'is-dimmed')
    const spec: FlowEdgeSpec = {
      id,
      source: edge.from,
      target: edge.to,
      sourceHandle: sourceHandleId(sides.source),
      targetHandle: targetHandleId(sides.target),
      type: overlap ? 'straight' : 'default',
      class: classes.join(' '),
      markerColor: overlap ? null : MARKER_COLOR[change],
      data: { edge, change },
    }
    if (overlap) spec.label = overlapEdgeLabel(edge, change)
    // Twins sit side by side, joined by a short line with no room for a label.
    else if (edge.kind !== 'depends' && edge.kind !== 'twin') spec.label = edge.kind
    return [spec]
  })

  return { nodes, edges }
}
