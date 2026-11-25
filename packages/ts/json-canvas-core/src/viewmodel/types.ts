/** Configuration for CanvasViewModel; every field is optional, defaulted otherwise. */
export interface ViewModelConfig {
  // Resize/interaction boundaries
  /** Size of resize handle hit area in pixels. Default: 8 */
  resizeBoundary?: number
  /** Minimum node width in pixels. Default: 100 */
  minNodeWidth?: number
  /** Minimum node height in pixels. Default: 50 */
  minNodeHeight?: number

  // Snapping
  /** Distance in pixels at which snap engages. Default: 8 */
  snapThreshold?: number
  /** Whether snapping is enabled. Default: true */
  snapEnabled?: boolean

  // Viewport constraints
  /** Minimum zoom scale (0.1 = 10%). Default: 0.1 */
  minScale?: number
  /** Maximum zoom scale (3.0 = 300%). Default: 3.0 */
  maxScale?: number
  /** Zoom increment per step. Default: 0.1 */
  zoomSpeed?: number

  // Node creation defaults
  /** Default width for new nodes. Default: 200 */
  defaultNodeWidth?: number
  /** Default height for new nodes. Default: 100 */
  defaultNodeHeight?: number
}

/** The zoom scale and pan offset of the view. */
export interface ViewportState {
  /** Current zoom scale (1.0 = 100%) */
  scale: number
  /** Horizontal pan offset in pixels */
  panX: number
  /** Vertical pan offset in pixels */
  panY: number
}

/**
 * Selection state for nodes and edges.
 */
export interface SelectionState {
  /** Set of selected node IDs */
  nodeIds: Set<string>
  /** ID of selected edge, or null if no edge selected */
  edgeId: string | null
}

/**
 * Events emitted by CanvasViewModel. 'canvasChange' fires when setCanvas swaps
 * in a different canvas, so `selectedNodes`/`selectedEdge` may return new objects.
 */
export type ViewModelEvent = 'selectionChange' | 'viewportChange' | 'canvasChange'
