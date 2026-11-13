import type { ElkExtendedEdge, ElkNode, LayoutOptions } from 'elkjs/lib/elk-api'
import type { EdgeKind, Layer } from './types'

/**
 * What the layout needs: an Ecosystem fits, and so does the display graph, whose twin pairs are
 * already one card.
 */
export interface LayoutGraph {
  layers: readonly Layer[]
  nodes: readonly { id: string; layer: string; twin?: string | null }[]
  edges: readonly { from: string; to: string; kind: EdgeKind }[]
}

export const NODE_WIDTH = 264
export const NODE_HEIGHT = 84
/** Room left of the nodes for the band labels. */
export const BAND_GUTTER = 170
const BAND_PAD_X = 32
const BAND_PAD_Y = 28
const COLUMN_WIDTH = NODE_WIDTH + 32
const ROW_HEIGHT = NODE_HEIGHT + 40
/** Extra space between the last row of one layer and the first row of the next. */
const LAYER_GAP = 48
/** The width-to-height ratio the packed graph aims for when the caller does not pass one. */
const DEFAULT_ASPECT = 1.4

export interface Point {
  x: number
  y: number
}

export interface Band {
  id: string
  label: string
  summary: string
  x: number
  y: number
  width: number
  height: number
}

export interface Layout {
  positions: Record<string, Point>
  bands: Band[]
}

/** The slice of the ELK API the layout uses, so tests can pass the real thing or a stub. */
export interface LayoutEngine {
  layout(graph: ElkNode): Promise<ElkNode>
}

const LAYOUT_OPTIONS: LayoutOptions = {
  'elk.algorithm': 'layered',
  'elk.direction': 'DOWN',
  // Each data layer is an ELK partition, so layers stack in `layers` order.
  'elk.partitioning.activate': 'true',
  // Laying out components apart would break the partition order across them.
  'elk.separateConnectedComponents': 'false',
  'elk.spacing.nodeNode': '36',
  'elk.layered.spacing.nodeNodeBetweenLayers': '72',
  // NETWORK_SIMPLEX takes seconds on ~60 nodes; only ELK's order is used, so the fast one will do.
  'elk.layered.nodePlacement.strategy': 'BRANDES_KOEPF',
  'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
}

/** Index of each layer id in `layers`. A node with an unknown layer goes below the last one. */
export function partitionOf(eco: LayoutGraph): (layerId: string) => number {
  const index = new Map(eco.layers.map((layer, i) => [layer.id, i]))
  return (layerId) => index.get(layerId) ?? eco.layers.length
}

/**
 * The ELK input over the union of both states, so a node's position never depends on the view.
 * Twin edges are left out so twins share an ELK row. Each edge points from the upper layer to the lower
 * one, whichever way the data says it runs, so ELK never has to reverse it against the partitions.
 */
export function buildLayoutGraph(eco: LayoutGraph): ElkNode {
  const partition = partitionOf(eco)
  const layerOf = new Map(eco.nodes.map((node) => [node.id, partition(node.layer)]))
  const children: ElkNode[] = eco.nodes
    .map((node, order) => ({ node, order }))
    .sort((a, b) => partition(a.node.layer) - partition(b.node.layer) || a.order - b.order)
    .map(({ node }) => ({
      id: node.id,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      layoutOptions: { 'elk.partitioning.partition': String(partition(node.layer)) },
    }))

  const seen = new Set<string>()
  const edges: ElkExtendedEdge[] = []
  for (const edge of eco.edges) {
    if (edge.kind === 'twin') continue
    const fromLayer = layerOf.get(edge.from)
    const toLayer = layerOf.get(edge.to)
    if (fromLayer === undefined || toLayer === undefined) continue
    const [source, target] = fromLayer <= toLayer ? [edge.from, edge.to] : [edge.to, edge.from]
    const key = `${source}->${target}`
    if (seen.has(key) || source === target) continue
    seen.add(key)
    edges.push({ id: `e${edges.length}`, sources: [source], targets: [target] })
  }

  return { id: 'root', layoutOptions: LAYOUT_OPTIONS, children, edges }
}

/**
 * One band per layer that has nodes, spanning the full width. Neighbouring bands meet halfway
 * between their nodes, so the bands tile without gaps.
 */
export function bandsFor(eco: LayoutGraph, positions: Record<string, Point>): Band[] {
  const points = Object.values(positions)
  if (points.length === 0) return []
  const minX = Math.min(...points.map((p) => p.x))
  const maxX = Math.max(...points.map((p) => p.x)) + NODE_WIDTH
  const x = minX - BAND_GUTTER
  const width = maxX - x + BAND_PAD_X

  const partition = partitionOf(eco)
  const extents = new Map<number, { top: number; bottom: number }>()
  for (const node of eco.nodes) {
    const position = positions[node.id]
    if (!position) continue
    const index = partition(node.layer)
    const extent = extents.get(index)
    const top = position.y
    const bottom = position.y + NODE_HEIGHT
    extents.set(index, extent ? { top: Math.min(extent.top, top), bottom: Math.max(extent.bottom, bottom) } : { top, bottom })
  }

  const ordered = [...extents].sort(([a], [b]) => a - b)
  return ordered.map(([index, extent], i) => {
    const previous = ordered[i - 1]?.[1]
    const next = ordered[i + 1]?.[1]
    const top = previous ? (previous.bottom + extent.top) / 2 : extent.top - BAND_PAD_Y
    const bottom = next ? (extent.bottom + next.top) / 2 : extent.bottom + BAND_PAD_Y
    const layer = eco.layers[index]
    return {
      id: layer?.id ?? '__unlayered',
      label: layer?.label ?? 'No layer',
      summary: layer?.summary ?? 'Nodes whose layer is not in the layers list.',
      x,
      y: top,
      width,
      height: bottom - top,
    }
  })
}

/**
 * Each layer's nodes in reading order: ELK's rows top to bottom, left to right within a row, with a
 * twin moved next to its partner when both are in the layer.
 */
export function layerOrder(eco: LayoutGraph, elkPositions: Record<string, Point>): string[][] {
  const partition = partitionOf(eco)
  const twinOf = new Map(eco.nodes.map((node) => [node.id, node.twin ?? null]))
  const layers: { id: string; position: Point }[][] = []
  for (const node of eco.nodes) {
    const position = elkPositions[node.id]
    if (!position) continue
    ;(layers[partition(node.layer)] ??= []).push({ id: node.id, position })
  }
  return layers
    .filter((layer) => layer !== undefined)
    .map((layer) => {
      const sorted = layer
        .sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x)
        .map((entry) => entry.id)
      const inLayer = new Set(sorted)
      const ordered: string[] = []
      const placed = new Set<string>()
      for (const id of sorted) {
        if (placed.has(id)) continue
        ordered.push(id)
        placed.add(id)
        const twin = twinOf.get(id)
        if (twin && inLayer.has(twin) && !placed.has(twin)) {
          ordered.push(twin)
          placed.add(twin)
        }
      }
      return ordered
    })
}

/** How many columns to wrap layers at, so the whole graph comes out near `aspect` (width / height). */
export function chooseColumns(layerSizes: number[], aspect = DEFAULT_ASPECT): number {
  const widest = Math.max(1, ...layerSizes)
  let best = widest
  let bestScore = Number.POSITIVE_INFINITY
  for (let columns = Math.min(3, widest); columns <= widest; columns++) {
    const rows = layerSizes.reduce((sum, size) => sum + Math.ceil(size / columns), 0)
    const width = columns * COLUMN_WIDTH
    const height = rows * ROW_HEIGHT + Math.max(0, layerSizes.length - 1) * LAYER_GAP
    const score = Math.abs(Math.log(width / height / aspect))
    if (score < bestScore) {
      best = columns
      bestScore = score
    }
  }
  return best
}

/** Wraps each layer into centred rows of at most `columns` nodes, layers stacked in order. */
export function packLayers(layers: string[][], columns: number): Record<string, Point> {
  const positions: Record<string, Point> = {}
  let y = 0
  for (const layer of layers) {
    for (let start = 0; start < layer.length; start += columns) {
      const row = layer.slice(start, start + columns)
      const offset = ((columns - row.length) * COLUMN_WIDTH) / 2
      row.forEach((id, i) => {
        positions[id] = { x: offset + i * COLUMN_WIDTH, y }
      })
      y += ROW_HEIGHT
    }
    y += LAYER_GAP
  }
  return positions
}

/**
 * ELK orders the nodes to cut edge crossings; the packing then wraps wide layers into rows so ~60
 * nodes still fit a screen. `aspect` is the width-to-height ratio of the space the graph will fill.
 */
export async function computeLayout(eco: LayoutGraph, engine: LayoutEngine, aspect = DEFAULT_ASPECT): Promise<Layout> {
  const result = await engine.layout(buildLayoutGraph(eco))
  const elkPositions: Record<string, Point> = {}
  for (const child of result.children ?? []) {
    elkPositions[child.id] = { x: child.x ?? 0, y: child.y ?? 0 }
  }
  const layers = layerOrder(eco, elkPositions)
  const positions = packLayers(layers, chooseColumns(layers.map((layer) => layer.length), aspect))
  return { positions, bands: bandsFor(eco, positions) }
}

/** The rectangle that holds every band, labels included. */
export function boundsOf(bands: readonly Band[]): { x: number; y: number; width: number; height: number } | null {
  if (bands.length === 0) return null
  const x = Math.min(...bands.map((b) => b.x))
  const y = Math.min(...bands.map((b) => b.y))
  const right = Math.max(...bands.map((b) => b.x + b.width))
  const bottom = Math.max(...bands.map((b) => b.y + b.height))
  return { x, y, width: right - x, height: bottom - y }
}

export type HandleSide = 'top' | 'bottom' | 'left' | 'right'

/**
 * Which sides of the two cards an edge leaves and enters by: bottom to top going down, top to
 * bottom going up, and side to side within one row.
 */
export function edgeHandles(from: Point, to: Point): { source: HandleSide; target: HandleSide } {
  const rowTolerance = NODE_HEIGHT / 2
  if (Math.abs(from.y - to.y) < rowTolerance) {
    return from.x <= to.x ? { source: 'right', target: 'left' } : { source: 'left', target: 'right' }
  }
  return from.y < to.y ? { source: 'bottom', target: 'top' } : { source: 'top', target: 'bottom' }
}
