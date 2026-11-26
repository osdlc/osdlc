// =============================================================================
// useCanvasViewModel - Vue composable for canvas viewport and selection state
// =============================================================================

import type {
  BoundingBox,
  ICanvasContent,
  IEdge,
  INode,
  Point,
  Rect,
  ResizeDirection,
  SnapResult,
  ViewModelConfig,
} from '@osdlc/json-canvas-core'
import { CanvasViewModel } from '@osdlc/json-canvas-core'
import type { ComputedRef } from 'vue'
import { computed, onUnmounted, shallowRef } from 'vue'

/**
 * Return type for the useCanvasViewModel composable.
 */
export interface UseCanvasViewModelReturn {
  // -------------------------------------------------------------------------
  // Viewport (reactive)
  // -------------------------------------------------------------------------

  /** Current zoom scale (1.0 = 100%). Reactive. */
  scale: ComputedRef<number>

  /** Horizontal pan offset in pixels. Reactive. */
  panX: ComputedRef<number>

  /** Vertical pan offset in pixels. Reactive. */
  panY: ComputedRef<number>

  /** Current zoom as percentage (e.g., 100 for 100%). Reactive. */
  zoomPercent: ComputedRef<number>

  /** Set the zoom scale (clamped to config bounds). */
  setScale: (scale: number) => void

  /** Set pan offset. */
  setPan: (x: number, y: number) => void

  /** Increase zoom by configured step. */
  zoomIn: () => void

  /** Decrease zoom by configured step. */
  zoomOut: () => void

  /** Convert screen coordinates to canvas coordinates. */
  screenToCanvas: (
    screenX: number,
    screenY: number,
    containerLeft: number,
    containerTop: number,
  ) => Point

  // -------------------------------------------------------------------------
  // Selection (reactive)
  // -------------------------------------------------------------------------

  /** Set of selected node IDs. Reactive. */
  selectedNodeIds: ComputedRef<ReadonlySet<string>>

  /** ID of selected edge, or null. Reactive. */
  selectedEdgeId: ComputedRef<string | null>

  /** Array of selected node objects. Reactive. */
  selectedNodes: ComputedRef<INode[]>

  /** Selected edge object, or null. Reactive. */
  selectedEdge: ComputedRef<IEdge | null>

  /** Check if a node is selected. */
  isNodeSelected: (nodeId: string) => boolean

  /** Select a single node. Clears other selection unless addToSelection is true. */
  selectNode: (nodeId: string, addToSelection?: boolean) => void

  /** Select multiple nodes. Clears other selection unless addToSelection is true. */
  selectNodes: (nodeIds: string[], addToSelection?: boolean) => void

  /** Select an edge. Clears node selection. */
  selectEdge: (edgeId: string) => void

  /** Toggle node selection state. */
  toggleNodeSelection: (nodeId: string) => void

  /** Clear all selection. */
  clearSelection: () => void

  /** Select all nodes. */
  selectAll: () => void

  /** Select nodes intersecting a rectangle. */
  selectNodesInRect: (rect: Rect) => void

  // -------------------------------------------------------------------------
  // Query Methods
  // -------------------------------------------------------------------------

  /** Find the topmost node at a canvas point. */
  findNodeAtPoint: (point: Point) => INode | null

  /** Get resize direction for a point relative to a node. */
  getResizeDirectionForNode: (point: Point, node: INode) => ResizeDirection

  /** Calculate snap adjustments for a drag operation. */
  calculateSnapForDrag: (dx: number, dy: number) => SnapResult

  /** Get bounding box of all nodes. */
  getNodeBoundingBox: () => BoundingBox | null

  /** Get bounding box of selected nodes. */
  getSelectionBoundingBox: () => BoundingBox | null

  // -------------------------------------------------------------------------
  // Configuration
  // -------------------------------------------------------------------------

  /** Read-only access to merged configuration. */
  config: Readonly<Required<ViewModelConfig>>

  // -------------------------------------------------------------------------
  // Canvas Reference
  // -------------------------------------------------------------------------

  /** Update the canvas reference (e.g., after undo/redo). */
  setCanvas: (canvas: ICanvasContent) => void

  /** Direct access to the ViewModel instance for advanced use cases (e.g., method chaining). */
  viewModel: CanvasViewModel
}

/**
 * Vue composable that wraps CanvasViewModel with reactivity.
 *
 * Provides reactive state for viewport (zoom/pan) and selection,
 * along with query methods for hit testing and snap calculations. Internal:
 * the package root does not export it.
 *
 * @example
 * ```vue
 * <script setup lang="ts">
 * import { useCanvasViewModel } from '../../composables'
 *
 * const {
 *   scale,
 *   panX,
 *   panY,
 *   selectedNodeIds,
 *   selectNode,
 *   clearSelection,
 *   zoomIn,
 *   zoomOut,
 * } = useCanvasViewModel(canvas.value)
 *
 * // Selection is reactive
 * watch(selectedNodeIds, (ids) => {
 *   console.log('Selected:', [...ids])
 * })
 * </script>
 * ```
 */
export function useCanvasViewModel(
  initialCanvas: ICanvasContent,
  config?: ViewModelConfig,
): UseCanvasViewModelReturn {
  const viewModel = new CanvasViewModel(initialCanvas, config)

  // Version counter to trigger reactivity on state changes
  const version = shallowRef(0)
  // Selection gets its own counter so panning does not invalidate it: a pan
  // bumps `version` on every pointermove and wheel event.
  const selectionVersion = shallowRef(0)
  // Content gets its own counter too: a content swap (every edit, undo or
  // redo) changes only the objects `selectedNodes`/`selectedEdge` return, so
  // it should not invalidate the viewport computeds.
  const contentVersion = shallowRef(0)

  const onStateChange = () => {
    version.value++
  }
  const onSelectionChange = () => {
    version.value++
    selectionVersion.value++
  }
  const onCanvasChange = () => {
    contentVersion.value++
  }
  viewModel.on('selectionChange', onSelectionChange)
  viewModel.on('viewportChange', onStateChange)
  // A content swap keeps the selected ids but changes the objects
  // `selectedNodes`/`selectedEdge` return, so those must recompute.
  viewModel.on('canvasChange', onCanvasChange)

  onUnmounted(() => {
    viewModel.off('selectionChange', onSelectionChange)
    viewModel.off('viewportChange', onStateChange)
    viewModel.off('canvasChange', onCanvasChange)
  })

  // ---------------------------------------------------------------------------
  // Reactive getters (re-evaluate when version changes)
  // ---------------------------------------------------------------------------

  const scale = computed(() => {
    void version.value
    return viewModel.scale
  })

  const panX = computed(() => {
    void version.value
    return viewModel.panX
  })

  const panY = computed(() => {
    void version.value
    return viewModel.panY
  })

  const zoomPercent = computed(() => {
    void version.value
    return viewModel.zoomPercent
  })

  // A fresh Set rather than the ViewModel's own: `viewModel.selectedNodeIds`
  // hands back the one instance every selection call mutates in place, so
  // forwarding it hands Vue the same reference every time and it concludes
  // nothing changed.
  const selectedNodeIds = computed<ReadonlySet<string>>(() => {
    void selectionVersion.value
    return new Set(viewModel.selectedNodeIds)
  })

  const selectedEdgeId = computed(() => {
    void version.value
    return viewModel.selectedEdgeId
  })

  const selectedNodes = computed(() => {
    void version.value
    void contentVersion.value
    return viewModel.selectedNodes
  })

  const selectedEdge = computed(() => {
    void version.value
    void contentVersion.value
    return viewModel.selectedEdge
  })

  return {
    // Viewport
    scale,
    panX,
    panY,
    zoomPercent,
    setScale: (s) => viewModel.setScale(s),
    setPan: (x, y) => viewModel.setPan(x, y),
    zoomIn: () => viewModel.zoomIn(),
    zoomOut: () => viewModel.zoomOut(),
    screenToCanvas: (sx, sy, cl, ct) => viewModel.screenToCanvas(sx, sy, cl, ct),

    // Selection
    selectedNodeIds,
    selectedEdgeId,
    selectedNodes,
    selectedEdge,
    isNodeSelected: (id) => viewModel.isNodeSelected(id),
    selectNode: (id, add) => viewModel.selectNode(id, add),
    selectNodes: (ids, add) => viewModel.selectNodes(ids, add),
    selectEdge: (id) => viewModel.selectEdge(id),
    toggleNodeSelection: (id) => viewModel.toggleNodeSelection(id),
    clearSelection: () => viewModel.clearSelection(),
    selectAll: () => viewModel.selectAll(),
    selectNodesInRect: (rect) => viewModel.selectNodesInRect(rect),

    // Queries
    findNodeAtPoint: (p) => viewModel.findNodeAtPoint(p),
    getResizeDirectionForNode: (p, n) => viewModel.getResizeDirectionForNode(p, n),
    calculateSnapForDrag: (dx, dy) => viewModel.calculateSnapForDrag(dx, dy),
    getNodeBoundingBox: () => viewModel.getNodeBoundingBox(),
    getSelectionBoundingBox: () => viewModel.getSelectionBoundingBox(),

    // Config
    config: viewModel.config,

    // Canvas update
    setCanvas: (c) => viewModel.setCanvas(c),

    // Direct access
    viewModel,
  }
}
