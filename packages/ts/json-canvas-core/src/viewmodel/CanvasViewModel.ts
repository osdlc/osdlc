import type { BoundingBox, Point, Rect, ResizeDirection, SnapResult } from '../geometry/index.ts'
import {
  calculateSnap,
  getBoundingBoxFromNodes,
  getResizeDirection,
  nodeIntersectsRect,
  pointInRect,
} from '../geometry/index.ts'
import type { ICanvasContent, IEdge, INode } from '../types.ts'
import { mergeConfig } from './defaults.ts'
import type { SelectionState, ViewModelConfig, ViewModelEvent, ViewportState } from './types.ts'

type EventCallback = () => void

/**
 * A framework-agnostic state container for canvas editing: the canvas being
 * shown, the selection, the viewport (scale and pan) and queries that use the
 * configuration. It emits an event when selection, viewport or canvas
 * changes, so any UI layer can subscribe. It never changes the canvas: apply
 * operations to it and hand the result to `setCanvas`.
 */
export class CanvasViewModel {
  private _canvas: ICanvasContent
  private _config: Required<ViewModelConfig>
  private _viewport: ViewportState
  private _selection: SelectionState
  private _listeners: Map<ViewModelEvent, Set<EventCallback>>

  constructor(canvas: ICanvasContent, config?: ViewModelConfig) {
    this._canvas = canvas
    this._config = mergeConfig(config)
    this._viewport = { scale: 1, panX: 0, panY: 0 }
    this._selection = { nodeIds: new Set(), edgeId: null }
    this._listeners = new Map()
  }

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  /** Read-only access to merged configuration */
  get config(): Readonly<Required<ViewModelConfig>> {
    return this._config
  }

  // ---------------------------------------------------------------------------
  // Canvas Reference
  // ---------------------------------------------------------------------------

  /** Get all nodes */
  get nodes(): readonly INode[] {
    return this._canvas.nodes
  }

  /** Get all edges */
  get edges(): readonly IEdge[] {
    return this._canvas.edges
  }

  /**
   * Update canvas reference (e.g., after undo/redo). Emits 'canvasChange' when
   * the reference changes. Selected node/edge ids the new content no longer
   * contains are dropped, so `selectedNodeIds` cannot hand out ids that
   * `selectedNodes` filters away; emits 'selectionChange' only when something
   * was actually dropped. Returns this for chaining.
   */
  setCanvas(canvas: ICanvasContent): this {
    const changed = canvas !== this._canvas
    this._canvas = canvas

    let dropped = false

    if (this._selection.nodeIds.size > 0) {
      const liveNodeIds = new Set(canvas.nodes.map((n) => n.id))
      for (const id of this._selection.nodeIds) {
        if (!liveNodeIds.has(id)) {
          this._selection.nodeIds.delete(id)
          dropped = true
        }
      }
    }

    const edgeId = this._selection.edgeId
    if (edgeId !== null && !canvas.edges.some((e) => e.id === edgeId)) {
      this._selection.edgeId = null
      dropped = true
    }

    if (dropped) {
      this.emit('selectionChange')
    }
    if (changed) {
      this.emit('canvasChange')
    }
    return this
  }

  // ---------------------------------------------------------------------------
  // Viewport
  // ---------------------------------------------------------------------------

  /** Zoom scale. 1 is 100%. */
  get scale(): number {
    return this._viewport.scale
  }

  /** Horizontal pan offset, in screen pixels. */
  get panX(): number {
    return this._viewport.panX
  }

  /** Vertical pan offset, in screen pixels. */
  get panY(): number {
    return this._viewport.panY
  }

  /** The scale as a whole-number percentage. */
  get zoomPercent(): number {
    return Math.round(this._viewport.scale * 100)
  }

  /** Set zoom scale (clamped to config bounds). Returns this for chaining. */
  setScale(scale: number): this {
    const clamped = Math.max(this._config.minScale, Math.min(this._config.maxScale, scale))
    if (clamped !== this._viewport.scale) {
      this._viewport.scale = clamped
      this.emit('viewportChange')
    }
    return this
  }

  /** Set pan offset. Returns this for chaining. */
  setPan(x: number, y: number): this {
    if (x !== this._viewport.panX || y !== this._viewport.panY) {
      this._viewport.panX = x
      this._viewport.panY = y
      this.emit('viewportChange')
    }
    return this
  }

  /** Increase zoom by configured step. Returns this for chaining. */
  zoomIn(): this {
    this.setScale(this._viewport.scale + this._config.zoomSpeed)
    return this
  }

  /** Decrease zoom by configured step. Returns this for chaining. */
  zoomOut(): this {
    this.setScale(this._viewport.scale - this._config.zoomSpeed)
    return this
  }

  /**
   * Convert screen coordinates to canvas coordinates.
   * @param screenX - Screen X coordinate
   * @param screenY - Screen Y coordinate
   * @param containerLeft - Left offset of canvas container
   * @param containerTop - Top offset of canvas container
   */
  screenToCanvas(
    screenX: number,
    screenY: number,
    containerLeft: number,
    containerTop: number,
  ): Point {
    return {
      x: (screenX - containerLeft - this._viewport.panX) / this._viewport.scale,
      y: (screenY - containerTop - this._viewport.panY) / this._viewport.scale,
    }
  }

  // ---------------------------------------------------------------------------
  // Selection
  // ---------------------------------------------------------------------------

  /** Ids of the selected nodes. */
  get selectedNodeIds(): ReadonlySet<string> {
    return this._selection.nodeIds
  }

  /** Id of the selected edge, or `null`. */
  get selectedEdgeId(): string | null {
    return this._selection.edgeId
  }

  /** The selected nodes that are on the current canvas. */
  get selectedNodes(): INode[] {
    return this._canvas.nodes.filter((n) => this._selection.nodeIds.has(n.id))
  }

  /** The selected edge, or `null` when none is selected or it is not on the canvas. */
  get selectedEdge(): IEdge | null {
    if (!this._selection.edgeId) return null
    return this._canvas.edges.find((e) => e.id === this._selection.edgeId) ?? null
  }

  /** True when the node is selected. */
  isNodeSelected(nodeId: string): boolean {
    return this._selection.nodeIds.has(nodeId)
  }

  /**
   * Select a single node. Clears the edge selection, and the node selection unless
   * addToSelection is true. Returns this for chaining.
   */
  selectNode(nodeId: string, addToSelection: boolean = false): this {
    if (!addToSelection) {
      this._selection.nodeIds.clear()
    }
    this._selection.edgeId = null
    this._selection.nodeIds.add(nodeId)
    this.emit('selectionChange')
    return this
  }

  /**
   * Select multiple nodes. Clears the edge selection, and the node selection unless
   * addToSelection is true. Returns this for chaining.
   */
  selectNodes(nodeIds: string[], addToSelection: boolean = false): this {
    if (!addToSelection) {
      this._selection.nodeIds.clear()
    }
    this._selection.edgeId = null
    for (const id of nodeIds) {
      this._selection.nodeIds.add(id)
    }
    this.emit('selectionChange')
    return this
  }

  /** Select an edge. Clears node selection. Returns this for chaining. */
  selectEdge(edgeId: string): this {
    this._selection.nodeIds.clear()
    this._selection.edgeId = edgeId
    this.emit('selectionChange')
    return this
  }

  /** Toggle node selection state. Returns this for chaining. */
  toggleNodeSelection(nodeId: string): this {
    if (this._selection.nodeIds.has(nodeId)) {
      this._selection.nodeIds.delete(nodeId)
    } else {
      this._selection.nodeIds.add(nodeId)
    }
    this._selection.edgeId = null
    this.emit('selectionChange')
    return this
  }

  /** Clear all selection. Returns this for chaining. */
  clearSelection(): this {
    if (this._selection.nodeIds.size > 0 || this._selection.edgeId !== null) {
      this._selection.nodeIds.clear()
      this._selection.edgeId = null
      this.emit('selectionChange')
    }
    return this
  }

  /** Select all nodes. Returns this for chaining. */
  selectAll(): this {
    this._selection.edgeId = null
    for (const node of this._canvas.nodes) {
      this._selection.nodeIds.add(node.id)
    }
    this.emit('selectionChange')
    return this
  }

  /** Select nodes intersecting a rectangle. Returns this for chaining. */
  selectNodesInRect(rect: Rect): this {
    this._selection.edgeId = null
    for (const node of this._canvas.nodes) {
      if (nodeIntersectsRect(node, rect)) {
        this._selection.nodeIds.add(node.id)
      }
    }
    this.emit('selectionChange')
    return this
  }

  // ---------------------------------------------------------------------------
  // Query Methods (use config values)
  // ---------------------------------------------------------------------------

  /**
   * The last node in the canvas array whose bounds, widened by `resizeBoundary`, contain the
   * point, or `null`.
   */
  findNodeAtPoint(point: Point): INode | null {
    // Tests the array in reverse, so the last node in it wins. A renderer that paints groups
    // below other nodes (`sortNodesForRendering`) can disagree: see T-02 in
    // docs/planning/tasks/T-02-hit-testing-follows-paint-order.md in the package source.
    // The resize band counts as a hit, so a point just outside a node still finds it.
    const nodes = [...this._canvas.nodes].reverse()
    for (const node of nodes) {
      if (pointInRect(point, node, this._config.resizeBoundary)) {
        return node
      }
    }
    return null
  }

  /**
   * Which resize handle of `node` the point is on, using the configured `resizeBoundary`,
   * or `null` when it is on none.
   *
   * @experimental The query methods that read configuration may change in any release.
   */
  getResizeDirectionForNode(point: Point, node: INode): ResizeDirection {
    return getResizeDirection(point, node, this._config.resizeBoundary)
  }

  /**
   * Snaps a drag of the selected nodes by `dx`, `dy` to the edges and centres of the
   * unselected nodes, within `snapThreshold`. Returns the drag unchanged, with no guides,
   * when snapping is off or nothing is selected.
   *
   * @experimental The query methods that read configuration may change in any release.
   */
  calculateSnapForDrag(dx: number, dy: number): SnapResult {
    if (!this._config.snapEnabled) {
      return { dx, dy, guides: [] }
    }

    const selectedNodes = this.selectedNodes
    const dragBounds = getBoundingBoxFromNodes(selectedNodes)
    if (!dragBounds) {
      return { dx, dy, guides: [] }
    }

    const targetNodes = this._canvas.nodes.filter((n) => !this._selection.nodeIds.has(n.id))

    return calculateSnap(dragBounds, targetNodes, dx, dy, this._config.snapThreshold)
  }

  /** The box around every node, or `null` for an empty canvas. */
  getNodeBoundingBox(): BoundingBox | null {
    return getBoundingBoxFromNodes(this._canvas.nodes)
  }

  /** The box around the selected nodes, or `null` when none is selected. */
  getSelectionBoundingBox(): BoundingBox | null {
    return getBoundingBoxFromNodes(this.selectedNodes)
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  /** Subscribe to an event. Returns this for chaining. */
  on(event: ViewModelEvent, callback: EventCallback): this {
    if (!this._listeners.has(event)) {
      this._listeners.set(event, new Set())
    }
    this._listeners.get(event)?.add(callback)
    return this
  }

  /** Unsubscribe from an event. Returns this for chaining. */
  off(event: ViewModelEvent, callback: EventCallback): this {
    this._listeners.get(event)?.delete(callback)
    return this
  }

  private emit(event: ViewModelEvent): void {
    this._listeners.get(event)?.forEach((cb) => {
      cb()
    })
  }
}
