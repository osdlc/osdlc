<template>
  <div
    :style="{
      '--scale': scale,
      '--pan-x': `${panOffsetX}px`,
      '--pan-y': `${panOffsetY}px`,
      cursor: currentCursor,
    }"
    :class="[
      'vjc-wrapper',
      {
        'vjc-will-pan': isSpacePressed,
        'vjc-theme-dark': theme === 'dark',
        'vjc-editable': !readonly,
      },
    ]"
  >
    <div class="vjc-container">
      <div
        ref="canvasContainerRef"
        class="vjc-canvas-container"
        :tabindex="readonly ? -1 : 0"
        @focusin="handleFocus"
        @focusout="handleFocusOut"
      >
        <svg class="vjc-edges">
          <defs>
            <!-- End arrow marker (points right) -->
            <marker
              id="arrowhead"
              markerWidth="10"
              markerHeight="8"
              refX="9"
              refY="4"
              orient="auto"
            >
              <polygon points="0 0, 10 4, 0 8" />
            </marker>
            <!-- Start arrow marker (points left) -->
            <marker
              id="arrowhead-start"
              markerWidth="10"
              markerHeight="8"
              refX="1"
              refY="4"
              orient="auto"
            >
              <polygon points="10 0, 0 4, 10 8" />
            </marker>
          </defs>
          <g class="vjc-edge-paths" />
          <g class="vjc-edge-labels" />
          <!-- The edge being drawn from a side anchor, following the pointer -->
          <path v-if="edgeDraftPath" :d="edgeDraftPath" class="vjc-edge-draft" />
        </svg>

        <div class="vjc-nodes">
          <template v-for="node in sortedNodes" :key="node.id">
            <!-- `nodeComponents` is bound only when set, rather than as a
                 plain `:node-components`. Vue treats a passed `undefined` as
                 absent and applies the default, but exactOptionalPropertyTypes
                 will not let an optional prop receive an explicit undefined. -->
            <CanvasNode
              :node="node"
              :scale="1"
              :translate-x="1"
              :translate-y="1"
              v-bind="nodeComponents !== undefined ? { nodeComponents } : {}"
              :editing="editingNodeId === node.id"
              :selected="selectedNodeIds.has(node.id)"
              @edit-commit="commitTextEdit"
              @edit-cancel="cancelTextEdit"
            />
          </template>
        </div>

        <!-- Marquee selection box -->
        <div v-if="isMarqueeSelecting" class="vjc-marquee-selection" :style="marqueeStyle" />

        <!-- Snap guides overlay -->
        <!-- eslint-disable vue/no-static-inline-styles -->
        <svg
          v-if="activeSnapGuides.length > 0"
          class="vjc-snap-guides"
          :style="{
            transform: `translate(${panOffsetX}px, ${panOffsetY}px) scale(${scale})`,
            transformOrigin: '0 0',
          }"
        >
          <!-- eslint-enable vue/no-static-inline-styles -->
          <line
            v-for="(guide, index) in activeSnapGuides"
            :key="index"
            :x1="guide.type === 'vertical' ? guide.position : -10000"
            :y1="guide.type === 'horizontal' ? guide.position : -10000"
            :x2="guide.type === 'vertical' ? guide.position : 10000"
            :y2="guide.type === 'horizontal' ? guide.position : 10000"
            class="vjc-snap-guide-line"
          />
        </svg>

        <!-- Zoom controls. Undo/redo are editing chrome and drop out under
             `readonly`; the zoom group stays, because panning and zooming a
             board you cannot change is exactly what a reader wants. -->
        <div class="vjc-controls">
          <template v-if="!readonly">
            <button
              :disabled="!canUndo"
              :title="`Undo (Ctrl+Z)${undoStackSize > 0 ? ` - ${undoStackSize} action${undoStackSize === 1 ? '' : 's'}` : ''}`"
              class="vjc-undo-btn"
              @click="undo"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M3 7v6h6" />
                <path d="M3 13a9 9 0 1 0 3-7.7L3 7" />
              </svg>
            </button>
            <button
              :disabled="!canRedo"
              :title="`Redo (Ctrl+Shift+Z)${redoStackSize > 0 ? ` - ${redoStackSize} action${redoStackSize === 1 ? '' : 's'}` : ''}`"
              class="vjc-redo-btn"
              @click="redo"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M21 7v6h-6" />
                <path d="M21 13a9 9 0 1 1-3-7.7L21 7" />
              </svg>
            </button>
            <span class="vjc-controls-separator" />
          </template>
          <button title="Zoom out (Ctrl+-)" @click="handleZoomOut">-</button>
          <span class="zoom-level" :title="`${zoomPercent}%`">{{ zoomPercent }}%</span>
          <button title="Zoom in (Ctrl++)" @click="handleZoomIn">+</button>
          <button title="Fit to viewport (Ctrl+0)" @click="handleZoomReset">Fit</button>
        </div>

        <!-- Output panel (collapsible, auto-updates) -->
        <OutputPanel v-if="!readonly" :canvas-content="canvasContent" />

        <!-- History panel (collapsible, shows undo/redo history) -->
        <HistoryPanel
          v-if="!readonly"
          :entries="historyEntries"
          :can-undo="canUndo"
          :can-redo="canRedo"
          @go-to="goToHistoryEntry"
          @undo="undo"
          @redo="redo"
        />

        <!-- Canvas toolbar -->
        <div v-if="!readonly" class="vjc-toolbar">
          <button class="toolbar-btn" title="Add text node" @click="handleAddTextNode">
            <span class="toolbar-icon">+</span>
            <span class="toolbar-label">Add Note</span>
          </button>
        </div>

        <!-- Floating edit panel -->
        <EditPanel
          v-if="!readonly"
          :selected-nodes="selectedNodesArray"
          :selected-edge="selectedEdgeObject"
          :edge-midpoint="selectedEdgeMidpoint"
          :pan-x="panOffsetX"
          :pan-y="panOffsetY"
          :scale="scale"
          @update:node="handleNodeUpdate"
          @update:nodes="handleNodesUpdate"
          @update:edge="handleEdgeUpdate"
          @delete="deleteSelection"
        />

        <!-- Context menu -->
        <ContextMenu
          v-if="!readonly"
          :visible="contextMenuVisible"
          :x="contextMenuX"
          :y="contextMenuY"
          :selected-nodes="selectedNodesArray"
          @close="hideContextMenu"
          @align="handleAlign"
          @distribute="handleDistribute"
          @match-size="handleMatchSize"
          @duplicate="handleDuplicate"
          @delete="deleteSelection"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts">
/** Counts mounted boards, so each one's SVG marker ids are its own. */
let boardCount = 0
</script>

<script setup lang="ts">
import {
  type AlignDirection,
  type BoundingBox,
  bezierMidpoint,
  calculateControlPoints,
  calculateSnap,
  type CanvasOperation,
  getResizeDirection as coreGetResizeDirection,
  type Direction,
  type DistributeDirection,
  getAnchorPoint,
  getBoundingBoxFromNodes,
  type ICanvasContent,
  type IEdge,
  type INode,
  isTextNode,
  type ITextNode,
  MAX_SCALE,
  MIN_SCALE,
  normalizeCanvas,
  pointInRect,
  RESIZE_CURSORS,
  type OperationResult,
  type ResizeDirection,
  resolveColor,
  type SizeDimension,
  type SnapGuide,
  sortNodesForRendering,
  ZOOM_SPEED,
} from '@osdlc/json-canvas-core'
import {
  type Component,
  computed,
  nextTick,
  onMounted,
  onUnmounted,
  type PropType,
  ref,
  toRaw,
  watch,
} from 'vue'
import { useCanvasOperations, useCanvasViewModel } from '../../composables/index.ts'
import CanvasNode from '../CanvasNode/index.vue'
import ContextMenu from '../ContextMenu/index.vue'
import EditPanel from '../EditPanel/index.vue'
import HistoryPanel from '../HistoryPanel/index.vue'
import OutputPanel from '../OutputPanel/index.vue'

const props = defineProps({
  canvasContent: {
    type: Object as PropType<ICanvasContent>,
    default: () => ({ nodes: [], edges: [] }),
  },
  /**
   * Host-supplied components for node content, keyed by node type.
   *
   * A component here replaces the built-in rendering of that node type's
   * BODY — the string-renderer markdown for `text`, the icon-and-filename
   * card for `file`, the domain card for `link` — while the node chrome
   * (position, size, border, selection, drag) stays the library's. Each
   * component receives the node as its `node` prop. This is the seam that
   * lets a host render a file node as a live preview of the file it points
   * at, async and framework-native, instead of pre-rendering strings.
   */
  nodeComponents: {
    type: Object as PropType<Partial<Record<'text' | 'file' | 'link', Component>>>,
    default: undefined,
  },
  /**
   * Color scheme. `dark` applies the `.vjc-theme-dark` palette; hosts that
   * map `--vjc-*` variables onto their own tokens can leave this alone.
   */
  theme: {
    type: String as PropType<'light' | 'dark'>,
    default: 'light',
  },
  /**
   * Draw the board, but do not let anyone change it.
   *
   * A host that has nowhere to WRITE a canvas back to needs this: the
   * component otherwise accepts every edit into an in-memory copy that is
   * discarded on unmount, which promises a change it cannot keep.
   *
   * Hiding the editing chrome in host CSS is not the same thing. The keyboard
   * shortcuts are bound on `window` — Delete, Backspace, mod+A, mod+Z, Space —
   * so a board that merely LOOKS read-only still deletes nodes and still takes
   * those chords away from the application around it.
   *
   * What stays on: panning (background drag and two-finger scroll), zooming
   * (wheel, the zoom buttons, and the mod+=/-/0 chords), and the fit control.
   */
  readonly: {
    type: Boolean,
    default: false,
  },
})

// Prefixes this board's dynamic marker ids. `url(#id)` resolves against the
// whole document, so a shared id would point one board's edges at another's
// markers, which vanish when that board redraws.
const markerIdPrefix = `vjc-${++boardCount}`

// Instance-scoped interaction state (not module-level to support multiple instances)
const draggedElement = ref<HTMLElement | null>(null)
const panStartX = ref(0)
const panStartY = ref(0)

// AbortController for cleaning up window/document event listeners
const eventAbortController = ref<AbortController | null>(null)

// Re-fits the board when the CONTAINER resizes; see `viewportTouched`.
let resizeObserver: ResizeObserver | null = null

// Pointer capture state for preventing text selection outside component
const capturedPointerId = ref<number | null>(null)
const captureElement = ref<HTMLElement | null>(null)

/**
 * Capture pointer events to prevent text selection when dragging outside component bounds.
 * This ensures all pointer events are routed to the capturing element even when
 * the pointer moves outside the component.
 */
function capturePointer(e: PointerEvent, element: HTMLElement) {
  if (capturedPointerId.value !== null) return // Already capturing
  try {
    element.setPointerCapture(e.pointerId)
    capturedPointerId.value = e.pointerId
    captureElement.value = element
  } catch {
    // Pointer capture may fail in some edge cases, ignore
  }
}

/**
 * Release pointer capture when drag operation ends.
 */
function releasePointer() {
  if (capturedPointerId.value !== null && captureElement.value) {
    try {
      captureElement.value.releasePointerCapture(capturedPointerId.value)
    } catch {
      // Pointer may already be released, ignore
    }
  }
  capturedPointerId.value = null
  captureElement.value = null
}

const canvasContainerRef = ref<HTMLElement | null>(null)

function scopedQuerySelector<T extends Element>(selector: string): T | null {
  return canvasContainerRef.value?.querySelector<T>(selector) ?? null
}

function scopedQuerySelectorAll<T extends Element>(selector: string): NodeListOf<T> {
  return (
    canvasContainerRef.value?.querySelectorAll<T>(selector) ??
    document.querySelectorAll<T>('__never_match__')
  )
}

/**
 * A press, click or double-click on the board itself rather than on something
 * drawn on it: the container, the nodes layer, or the board's own SVG layers
 * (edges, snap guides). An SVG anywhere else — a toolbar icon, an icon a host
 * node component renders — belongs to that button or node, not the board.
 */
function isBackgroundTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false
  if (target === canvasContainerRef.value) return true
  if (target.classList.contains('vjc-nodes')) return true
  return target.closest('.vjc-edges, .vjc-snap-guides') !== null
}

// Look a node up inside this board. Two boards on one page can hold nodes with the same id, so a
// lookup never reaches the global document.
function scopedGetElementById(id: string): HTMLElement | null {
  // An attribute selector rather than `#${CSS.escape(id)}`: node ids come
  // from canvas files and can hold any characters, and `CSS.escape` is
  // missing in some DOM implementations (jsdom).
  return (
    canvasContainerRef.value?.querySelector<HTMLElement>(
      `[id="${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`,
    ) ?? null
  )
}

const emit = defineEmits<{
  /**
   * The board changed through a committed operation — an edit, an undo, a
   * redo, a history jump. The payload is the new immutable canvas snapshot;
   * a host that persists boards writes THIS, not the prop it passed in.
   * The prop watch below skips a value that is identity-equal to the current
   * snapshot, so echoing the payload straight back is free.
   */
  change: [content: ICanvasContent]
}>()

// The spec makes `nodes` and `edges` optional; everything past the input seam
// reads both, so the prop is normalized here and in the prop watch below.
const {
  canvas: canvasContent,
  execute: executeOperation,
  executeBatch: executeBatchOperation,
  undo: historyUndo,
  redo: historyRedo,
  canUndo,
  canRedo,
  undoStackSize,
  redoStackSize,
  historyEntries,
  goToHistoryEntry: historyGoTo,
  reset: resetOperations,
} = useCanvasOperations(normalizeCanvas(props.canvasContent))

const READONLY_REFUSAL = {
  code: 'INVALID_OPERATION',
  message: 'This canvas is read-only',
} as const

/**
 * Every mutation in this component goes through here, which is what makes
 * `readonly` a guarantee rather than a set of hidden buttons: the handlers
 * below are also switched off one by one, but even a path that is missed —
 * or added later — cannot reach the history stack through this seam.
 *
 * Refusing leaves the history empty, so `canUndo`/`canRedo` stay false and
 * undo/redo are no-ops for the same reason.
 *
 * A committed change is also the output seam: `change` fires here (and in
 * the undo/redo/goto wrappers) with the new snapshot, never anywhere else.
 */
function execute(operation: CanvasOperation): OperationResult {
  if (props.readonly) {
    return {
      success: false,
      error: { ...READONLY_REFUSAL, details: { operation: operation.type } },
    }
  }
  const result = executeOperation(operation)
  if (result.success) emit('change', canvasContent.value)
  return result
}

/** `execute` for several operations as one undoable unit, same seam rules. */
function executeBatch(operations: CanvasOperation[]): OperationResult {
  if (props.readonly) {
    return {
      success: false,
      error: { ...READONLY_REFUSAL, details: { operations: operations.length } },
    }
  }
  const result = executeBatchOperation(operations)
  if (result.success) emit('change', canvasContent.value)
  return result
}

function undo(): void {
  if (props.readonly || !canUndo.value) return
  const result = historyUndo()
  if (result.success) {
    emit('change', canvasContent.value)
    nextTick(() => drawEdges())
  }
}

function redo(): void {
  if (props.readonly || !canRedo.value) return
  const result = historyRedo()
  if (result.success) {
    emit('change', canvasContent.value)
    nextTick(() => drawEdges())
  }
}

function goToHistoryEntry(index: number): void {
  // Jumping to the entry the board is already on succeeds without changing
  // anything, and `change` is only for a committed change.
  const before = canvasContent.value
  const result = historyGoTo(index)
  if (result.success && canvasContent.value !== before) {
    emit('change', canvasContent.value)
    nextTick(() => drawEdges())
  }
}

// ============================================================================
// ViewModel - manages viewport (scale, pan) and selection state
// ============================================================================

const {
  // Viewport state (reactive)
  scale,
  panX: panOffsetX,
  panY: panOffsetY,
  zoomPercent,
  setScale,
  setPan,
  screenToCanvas,
  // Selection state (reactive)
  selectedNodeIds,
  selectedEdgeId,
  selectedNodes: selectedNodesArray,
  selectedEdge: selectedEdgeObject,
  isNodeSelected,
  selectNode: vmSelectNode,
  selectNodes: vmSelectNodes,
  selectEdge: vmSelectEdge,
  toggleNodeSelection: vmToggleNodeSelection,
  clearSelection: vmClearSelection,
  selectAll: vmSelectAll,
  selectNodesInRect: vmSelectNodesInRect,
  // Canvas reference
  setCanvas,
} = useCanvasViewModel(canvasContent.value)

// Keep ViewModel in sync when canvas changes (undo/redo)
watch(canvasContent, (newCanvas) => {
  setCanvas(newCanvas)
})

// The INPUT seam: a new `canvasContent` prop value replaces the board.
//
// A value that is the same object is our own `change` payload coming back
// through the host's binding and is ignored — so `:canvas-content` + `@change`
// round-trips without loops. The comparison is on the raw objects, because a
// host that keeps the payload in a `ref` or a `reactive` object reads it back
// as a reactive proxy of the payload. Anything else is an external replace
// (another editor wrote the file, the host switched boards): the history
// resets — undoing across someone else's save would resurrect a board the host
// no longer holds — the selection clears (its ids may not exist anymore), and
// the edges redraw once the new nodes are in the DOM. An untouched viewport is
// re-fitted to the new board, which keeps "untouched means fitted" true; a
// viewport the reader moved stays where they put it.
watch(
  () => props.canvasContent,
  (next) => {
    if (toRaw(next) === toRaw(canvasContent.value)) return
    resetOperations(normalizeCanvas(next))
    vmClearSelection()
    editingNodeId.value = null
    edgeDraft.value = null
    nextTick(() => {
      if (!viewportTouched.value) adjustCanvasToViewport()
      updateSelectionVisuals()
      drawEdges()
    })
  },
)

// ============================================================================
// Focus State - keyboard handlers only work when canvas is focused
// ============================================================================

// Focus-WITHIN, not exact focus: a click on one of the board's own buttons
// (toolbar, undo/redo, zoom, the panels) moves focus to that button, and the
// board must keep answering its shortcuts and the wheel afterwards. So the
// container listens to the bubbling `focusin`/`focusout`, and a `focusout`
// whose new target is still inside the board is not a blur.
const isFocused = ref(false)

function handleFocus() {
  isFocused.value = true
}

function handleFocusOut(e: FocusEvent) {
  const next = e.relatedTarget
  if (next instanceof Node && canvasContainerRef.value?.contains(next)) return
  handleBlur()
  // A focused control that is removed (the edit panel's delete button) or
  // disabled (Undo after the last undo) drops focus to nowhere, with no new
  // target. That is not the user leaving the board, so focus goes back to the
  // container. Checked after a microtask: the removal or disabling may still
  // be under way when the focusout fires.
  const lost = e.target
  if (next !== null || !(lost instanceof HTMLElement) || lost === canvasContainerRef.value) return
  queueMicrotask(() => {
    const container = canvasContainerRef.value
    if (!container || props.readonly) return
    const gone = !lost.isConnected || (lost as HTMLButtonElement).disabled === true
    const active = document.activeElement
    const focusWentNowhere = active === null || active === document.body || active === lost
    if (gone && focusWentNowhere) container.focus({ preventScroll: true })
  })
}

// Calculate midpoint for selected edge (for panel positioning)
const selectedEdgeMidpoint = computed(() => {
  const edge = selectedEdgeObject.value
  if (!edge) return null

  const fromNode = scopedGetElementById(edge.fromNode)
  const toNode = scopedGetElementById(edge.toNode)
  if (!fromNode || !toNode) return null

  const fromSide = edge.fromSide ?? 'right'
  const toSide = edge.toSide ?? 'left'
  const fromPoint = getAnchorPoint(fromNode, fromSide)
  const toPoint = getAnchorPoint(toNode, toSide)

  // Use core geometry functions for bezier calculations
  const { control1, control2 } = calculateControlPoints(fromPoint, toPoint, fromSide, toSide)

  return bezierMidpoint({
    start: fromPoint,
    control1,
    control2,
    end: toPoint,
  })
})

// Selection functions - wrap ViewModel methods and update DOM visuals
function selectNode(nodeId: string, addToSelection = false) {
  vmSelectNode(nodeId, addToSelection)
  updateSelectionVisuals()
}

function selectEdge(edgeId: string) {
  vmSelectEdge(edgeId)
  updateSelectionVisuals()
  updateEdgeSelectionVisuals()
}

function toggleNodeSelection(nodeId: string) {
  vmToggleNodeSelection(nodeId)
  updateSelectionVisuals()
}

function clearSelection() {
  vmClearSelection()
  updateSelectionVisuals()
  updateEdgeSelectionVisuals()
}

function selectAllNodes() {
  vmSelectAll()
  updateSelectionVisuals()
}

function updateSelectionVisuals() {
  scopedQuerySelectorAll<HTMLElement>('.node').forEach((node) => {
    const element = node as HTMLElement
    const nodeId = element.id
    if (selectedNodeIds.value.has(nodeId)) {
      element.classList.add('is-selected')
    } else {
      element.classList.remove('is-selected')
    }
  })
}

function updateEdgeSelectionVisuals() {
  scopedQuerySelectorAll<SVGPathElement>('.vjc-edge-paths path').forEach((path) => {
    if (path.dataset.edgeId === selectedEdgeId.value) {
      path.classList.add('is-selected')
    } else {
      path.classList.remove('is-selected')
    }
  })
}

// ============================================================================
// Marquee Selection
// ============================================================================

const isMarqueeSelecting = ref(false)
const marqueeStart = ref({ x: 0, y: 0 })
const marqueeEnd = ref({ x: 0, y: 0 })
// The selection when the marquee began. Each update is this plus whatever the
// rectangle covers NOW, so a node the rectangle swept and then left drops out.
let marqueeBaseSelection: string[] = []

const marqueeRect = computed(() => ({
  x: Math.min(marqueeStart.value.x, marqueeEnd.value.x),
  y: Math.min(marqueeStart.value.y, marqueeEnd.value.y),
  width: Math.abs(marqueeEnd.value.x - marqueeStart.value.x),
  height: Math.abs(marqueeEnd.value.y - marqueeStart.value.y),
}))

const marqueeStyle = computed(() => ({
  left: `${marqueeRect.value.x * scale.value + panOffsetX.value}px`,
  top: `${marqueeRect.value.y * scale.value + panOffsetY.value}px`,
  width: `${marqueeRect.value.width * scale.value}px`,
  height: `${marqueeRect.value.height * scale.value}px`,
}))

function updateSelectionFromMarquee(addToSelection: boolean) {
  const rect = marqueeRect.value
  if (addToSelection) {
    vmSelectNodes(marqueeBaseSelection, false)
  } else {
    vmClearSelection()
  }
  // Select nodes that intersect the marquee rectangle
  vmSelectNodesInRect(rect)
  updateSelectionVisuals()
}

// ============================================================================
// Resize State
// ============================================================================

const RESIZE_BOUNDARY = 8

const hoverResizeDirection = ref<ResizeDirection>(null)
const isResizing = ref(false)
const resizeNodeId = ref<string | null>(null)
const resizeStartNode = ref<{
  x: number
  y: number
  width: number
  height: number
} | null>(null)
const resizeStartMouse = ref({ x: 0, y: 0 })

// Data positions, at drag start, of every node the drag moves: the selection
// plus the children of each selected group. The preview places each one at
// start + offset, and commitDragOperation commits the same offset.
const dragStartPositions = ref<Map<string, { x: number; y: number }>>(new Map())
// Bounds of the selection at drag start, which the snap projects from.
const dragStartBounds = ref<BoundingBox | null>(null)
// The (snapped) offset the preview currently shows, in canvas units.
const dragOffset = ref({ x: 0, y: 0 })

const MIN_WIDTH = 100
const MIN_HEIGHT = 50

// Computed cursor based on state
const currentCursor = computed(() => {
  if (isPanning.value || isBackgroundPanning.value) return 'grabbing'
  if (isResizing.value && hoverResizeDirection.value)
    return RESIZE_CURSORS[hoverResizeDirection.value]
  if (hoverResizeDirection.value) return RESIZE_CURSORS[hoverResizeDirection.value]
  return 'grab' // Default to grab cursor for Obsidian-style pan
})

function getResizeDirection(mouseX: number, mouseY: number, node: INode): ResizeDirection {
  // Use core function with scale-adjusted boundary
  return coreGetResizeDirection({ x: mouseX, y: mouseY }, node, RESIZE_BOUNDARY / scale.value)
}

function findNodeAtPoint(x: number, y: number): INode | null {
  // Check in reverse paint order (top-most first). The board paints
  // `sortedNodes`, not the raw array — groups are hoisted to the bottom —
  // so hit testing has to walk that same order or it picks the node under
  // the one the user sees.
  const boundary = RESIZE_BOUNDARY / scale.value
  const sorted = [...sortedNodes.value].reverse()
  for (const node of sorted) {
    if (pointInRect({ x, y }, node, boundary)) {
      return node
    }
  }
  return null
}

// ============================================================================
// Snap and Alignment
// ============================================================================

const SNAP_THRESHOLD = 8 // pixels (in canvas coordinates)
const activeSnapGuides = ref<SnapGuide[]>([])
const isAltPressed = ref(false) // Alt disables snapping
const isCtrlPressed = ref(false) // Ctrl also disables snapping
// Note: Shift for axis constraint is handled via e.shiftKey in the drag handler

// Track drag start for axis constraint
const dragStartPoint = ref<{ x: number; y: number } | null>(null)
const dragAxis = ref<'x' | 'y' | null>(null)

/**
 * Snap the drag's TOTAL offset from where it started, not each pointermove's
 * delta: a per-event delta smaller than the threshold is snapped straight
 * back, so a node already aligned with a neighbour could not be dragged
 * slowly along that axis.
 */
function applySnap(dx: number, dy: number): { dx: number; dy: number; guides: SnapGuide[] } {
  // Alt or Ctrl disables snapping
  if (isAltPressed.value || isCtrlPressed.value) return { dx, dy, guides: [] }

  const dragBounds = dragStartBounds.value
  if (!dragBounds) return { dx, dy, guides: [] }

  // Every node that moves with the drag — the selection AND the children of
  // any selected group — is out of the target set, or a group would snap to
  // its own children at their pre-drag positions.
  const targetNodes = canvasContent.value.nodes.filter(
    (n: INode) => !dragStartPositions.value.has(n.id),
  )

  // Use core snap calculation with scale-adjusted threshold
  return calculateSnap(dragBounds, targetNodes, dx, dy, SNAP_THRESHOLD / scale.value)
}

// ============================================================================
// Context Menu
// ============================================================================

const contextMenuVisible = ref(false)
const contextMenuX = ref(0)
const contextMenuY = ref(0)

function showContextMenu(x: number, y: number) {
  contextMenuX.value = x
  contextMenuY.value = y
  contextMenuVisible.value = true
}

function hideContextMenu() {
  contextMenuVisible.value = false
}

function handleAlign(direction: AlignDirection) {
  if (selectedNodeIds.value.size < 2) return

  const nodeIds = [...selectedNodeIds.value]

  const result = execute({
    type: 'alignNodes',
    nodeIds,
    direction,
  })

  if (result.success) {
    // Update DOM to reflect changes
    for (const nodeId of nodeIds) {
      const node = canvasContent.value.nodes.find((n: INode) => n.id === nodeId)
      const el = scopedGetElementById(nodeId)
      if (node && el) {
        el.style.left = `${node.x}px`
        el.style.top = `${node.y}px`
      }
    }
    drawEdges()
  }
}

function handleDistribute(direction: DistributeDirection) {
  if (selectedNodeIds.value.size < 3) return

  const nodeIds = [...selectedNodeIds.value]

  const result = execute({
    type: 'distributeNodes',
    nodeIds,
    direction,
  })

  if (result.success) {
    // Update DOM to reflect changes
    for (const nodeId of nodeIds) {
      const node = canvasContent.value.nodes.find((n: INode) => n.id === nodeId)
      const el = scopedGetElementById(nodeId)
      if (node && el) {
        el.style.left = `${node.x}px`
        el.style.top = `${node.y}px`
      }
    }
    drawEdges()
  }
}

function handleMatchSize(dimension: SizeDimension) {
  if (selectedNodeIds.value.size < 2) return

  const nodeIds = [...selectedNodeIds.value]

  const result = execute({
    type: 'matchNodeSize',
    nodeIds,
    dimension,
  })

  if (result.success) {
    // Update DOM to reflect changes
    for (const nodeId of nodeIds) {
      const node = canvasContent.value.nodes.find((n: INode) => n.id === nodeId)
      const el = scopedGetElementById(nodeId)
      if (node && el) {
        el.style.width = `${node.width}px`
        el.style.height = `${node.height}px`
      }
    }
    drawEdges()
  }
}

function handleDuplicate() {
  const nodeIds = [...selectedNodeIds.value]
  if (nodeIds.length === 0) return

  const result = execute({
    type: 'duplicateNodes',
    nodeIds,
    offsetX: 20,
    offsetY: 20,
  })

  if (!result.success) return

  const newIds = result.created?.nodeIds ?? []

  // Select the new nodes
  vmSelectNodes(newIds)

  // Wait for Vue to render the new nodes before painting selection/edges
  nextTick(() => {
    updateSelectionVisuals()
    drawEdges()
  })
}

// ============================================================================
// Node Creation
// ============================================================================

function getCanvasPoint(e: MouseEvent): { x: number; y: number } {
  const container = canvasContainerRef.value
  if (!container) return { x: 0, y: 0 }
  const rect = container.getBoundingClientRect()
  // Use ViewModel's screenToCanvas for coordinate conversion
  return screenToCanvas(e.clientX, e.clientY, rect.left, rect.top)
}

function createTextNode(x: number, y: number, text = 'New note') {
  const width = 200
  const height = 100

  const result = execute({
    type: 'createNode',
    node: {
      type: 'text',
      x: x - width / 2,
      y: y - height / 2,
      width,
      height,
      text,
    } as Omit<ITextNode, 'id'>,
  })

  if (result.success && result.created?.nodeIds?.[0]) {
    const nodeId = result.created.nodeIds[0]
    return result.canvas.nodes.find((n: INode) => n.id === nodeId) ?? null
  }
  return null
}

// ============================================================================
// Node Deletion
// ============================================================================

function deleteSelectedNodes() {
  const nodeIds = [...selectedNodeIds.value]
  if (nodeIds.length === 0) return

  const result = execute({
    type: 'deleteNodes',
    nodeIds,
  })

  if (result.success) {
    // Clear selection (all selected nodes were deleted)
    vmClearSelection()
    updateSelectionVisuals()
    drawEdges()
  }
}

function deleteSelectedEdge() {
  if (!selectedEdgeId.value) return

  const result = execute({
    type: 'deleteEdges',
    edgeIds: [selectedEdgeId.value],
  })

  if (result.success) {
    vmSelectEdge('')
    drawEdges()
  }
}

function deleteSelection() {
  if (selectedNodeIds.value.size > 0) {
    deleteSelectedNodes()
  }
  if (selectedEdgeId.value) {
    deleteSelectedEdge()
  }
}

// ============================================================================
// In-place text editing
// ============================================================================

/** The text node whose body is currently a textarea, or null. */
const editingNodeId = ref<string | null>(null)

function beginTextEdit(nodeId: string) {
  if (props.readonly) return
  editingNodeId.value = nodeId
}

function commitTextEdit(nodeId: string, text: string) {
  // Only an edit that is still open commits. Closing the editor from outside
  // (an external replace) unmounts the focused textarea, and the blur that
  // causes would otherwise write the stale draft back over the new text.
  // The cost: text typed into that editor and not yet committed is dropped,
  // because the board it was typed against is gone and the host's new text
  // wins.
  if (editingNodeId.value !== nodeId) return
  editingNodeId.value = null
  const node = canvasContent.value.nodes.find((n: INode) => n.id === nodeId)
  if (!node || !isTextNode(node) || node.text === text) return
  execute({
    type: 'updateNode',
    nodeId,
    updates: { text },
  })
}

function cancelTextEdit() {
  editingNodeId.value = null
}

// ============================================================================
// Edge creation (anchor drag)
// ============================================================================

/**
 * The edge being drawn: pressed on one of a node's side anchors, not yet
 * released. `toPoint` follows the pointer in canvas coordinates; the dashed
 * draft path in the template renders from it.
 */
const edgeDraft = ref<{
  fromNode: string
  fromSide: Direction
  toPoint: { x: number; y: number }
} | null>(null)

const edgeDraftPath = computed(() => {
  const draft = edgeDraft.value
  if (!draft) return null
  const fromEl = scopedGetElementById(draft.fromNode)
  if (!fromEl) return null
  const from = getAnchorPoint(fromEl, draft.fromSide)
  return `M ${from.x} ${from.y} L ${draft.toPoint.x} ${draft.toPoint.y}`
})

/** The side of `node` nearest to a canvas-space point — where a dropped edge lands. */
function nearestSide(node: INode, point: { x: number; y: number }): Direction {
  const byDistance: Array<[number, Direction]> = [
    [Math.abs(point.x - node.x), 'left'],
    [Math.abs(node.x + node.width - point.x), 'right'],
    [Math.abs(point.y - node.y), 'top'],
    [Math.abs(node.y + node.height - point.y), 'bottom'],
  ]
  byDistance.sort((a, b) => a[0] - b[0])
  return byDistance[0]![1]
}

/** Pointer released over the board while drawing an edge. */
function finishEdgeDraft(e: PointerEvent) {
  const draft = edgeDraft.value
  if (!draft) return
  edgeDraft.value = null

  const point = getCanvasPoint(e)
  const targetNode = findNodeAtPoint(point.x, point.y)
  if (!targetNode || targetNode.id === draft.fromNode) return

  const result = execute({
    type: 'createEdge',
    edge: {
      fromNode: draft.fromNode,
      fromSide: draft.fromSide,
      toNode: targetNode.id,
      toSide: nearestSide(targetNode, point),
    },
  })
  if (result.success) drawEdges()
}

// ============================================================================
// Edit Panel Handlers
// ============================================================================

/**
 * The properties of `updated` that differ from `current`. A key `current` has
 * and `updated` lacks was REMOVED — that is how the edit panel clears an
 * optional property ("No color", an emptied label) — and maps to `undefined`,
 * which the core update operations apply as a deletion.
 */
function diffItem<T extends { id: string }>(current: T, updated: T): Record<string, unknown> {
  const updates: Record<string, unknown> = {}
  const keys = new Set([...Object.keys(current), ...Object.keys(updated)])
  for (const key of keys as Set<keyof T & string>) {
    if (key !== 'id' && updated[key] !== current[key]) {
      updates[key] = updated[key]
    }
  }
  return updates
}

/** The updateNode operation that turns the current node into `updatedNode`, or null if none. */
function nodeUpdateOperation(updatedNode: INode): CanvasOperation | null {
  const currentNode = canvasContent.value.nodes.find((n: INode) => n.id === updatedNode.id)
  if (!currentNode) return null
  const updates = diffItem(currentNode, updatedNode)
  if (Object.keys(updates).length === 0) return null
  return { type: 'updateNode', nodeId: updatedNode.id, updates }
}

function handleNodeUpdate(updatedNode: INode) {
  const operation = nodeUpdateOperation(updatedNode)
  if (operation) execute(operation)
}

/** Several nodes changed by one user action: one undoable unit, one `change`. */
function handleNodesUpdate(updatedNodes: INode[]) {
  const operations = updatedNodes
    .map(nodeUpdateOperation)
    .filter((op): op is CanvasOperation => op !== null)
  if (operations.length === 1) execute(operations[0]!)
  else if (operations.length > 1) executeBatch(operations)
}

function handleEdgeUpdate(updatedEdge: IEdge) {
  // Find the current edge to compute what changed
  const currentEdge = canvasContent.value.edges.find((e: IEdge) => e.id === updatedEdge.id)
  if (!currentEdge) return

  // Compute the updates (properties that differ, removed ones included)
  const updates = diffItem(currentEdge, updatedEdge)

  // Only execute if there are actual changes
  if (Object.keys(updates).length > 0) {
    const result = execute({
      type: 'updateEdge',
      edgeId: updatedEdge.id,
      updates,
    })

    if (result.success) {
      drawEdges()
    }
  }
}

function commitDragOperation() {
  if (dragStartPositions.value.size === 0) return

  // Get the first node to calculate delta (all moved by same amount)
  const firstEntry = dragStartPositions.value.values().next().value
  if (!firstEntry) return

  // Round to integers for data model (canvas data uses integer positions)
  const offset = dragOffset.value
  dragOffset.value = { x: 0, y: 0 }
  const deltaX = Math.round(firstEntry.x + offset.x) - firstEntry.x
  const deltaY = Math.round(firstEntry.y + offset.y) - firstEntry.y

  // Only issue operation if there was actual movement
  if (deltaX === 0 && deltaY === 0) {
    dragStartPositions.value.clear()
    return
  }

  const nodeIds = [...dragStartPositions.value.keys()]
  execute({
    type: 'moveNodes',
    nodeIds,
    deltaX,
    deltaY,
  })

  dragStartPositions.value.clear()
}

function commitResizeOperation() {
  if (!resizeNodeId.value || !resizeStartNode.value) return

  const nodeEl = scopedGetElementById(resizeNodeId.value)
  if (!nodeEl) return

  // Round to integers for data model
  const newX = Math.round(parseFloat(nodeEl.style.left) || 0)
  const newY = Math.round(parseFloat(nodeEl.style.top) || 0)
  const newWidth = Math.round(parseFloat(nodeEl.style.width) || nodeEl.offsetWidth)
  const newHeight = Math.round(parseFloat(nodeEl.style.height) || nodeEl.offsetHeight)

  // Check if anything changed
  const start = resizeStartNode.value
  if (
    newX === start.x &&
    newY === start.y &&
    newWidth === start.width &&
    newHeight === start.height
  ) {
    return
  }

  execute({
    type: 'updateNode',
    nodeId: resizeNodeId.value,
    updates: {
      x: newX,
      y: newY,
      width: newWidth,
      height: newHeight,
    },
  })
}

// Sort nodes so groups render below other nodes (per JSON Canvas spec)
const sortedNodes = computed(() => sortNodesForRendering(canvasContent.value.nodes))

const isSpacePressed = ref(false)
const isPanning = ref(false)
const isDragging = ref(false)
const isBackgroundPanning = ref(false)

/**
 * Whether the user has taken the viewport somewhere — panned or zoomed on
 * purpose. While false, a container resize re-fits the board (the pane was
 * dragged wider, a sidebar collapsed); once true, resizes leave the viewport
 * alone, because a re-fit would stomp the place the reader chose. The Fit
 * control resets it: "fitted" is a state worth keeping across resizes.
 */
const viewportTouched = ref(false)

// Handle blur - reset keyboard state and all interaction states when focus leaves the board
function handleBlur() {
  isFocused.value = false
  // Reset any pressed keys when losing focus
  isSpacePressed.value = false
  isAltPressed.value = false
  isCtrlPressed.value = false

  // Reset all interaction states to prevent stuck states
  if (isDragging.value) {
    if (draggedElement.value) {
      draggedElement.value.classList.remove('is-dragging')
    }
    isDragging.value = false
    draggedElement.value = null
    commitDragOperation()
    drawEdges()
  }

  if (isResizing.value) {
    commitResizeOperation()
    isResizing.value = false
    resizeNodeId.value = null
    resizeStartNode.value = null
    hoverResizeDirection.value = null
    drawEdges()
  }

  isPanning.value = false
  isBackgroundPanning.value = false
  isMarqueeSelecting.value = false
  activeSnapGuides.value = []
  dragStartPoint.value = null
  dragAxis.value = null

  // Release any captured pointer
  releasePointer()
}

/** Non-group nodes whose bounds are fully inside the group's (partial overlap doesn't count). */
function findChildNodes(groupElement: HTMLElement): HTMLElement[] {
  const groupX = parseFloat(groupElement.style.left) || 0
  const groupY = parseFloat(groupElement.style.top) || 0
  const groupWidth = parseFloat(groupElement.style.width) || groupElement.offsetWidth
  const groupHeight = parseFloat(groupElement.style.height) || groupElement.offsetHeight
  const groupRight = groupX + groupWidth
  const groupBottom = groupY + groupHeight

  const children: HTMLElement[] = []

  scopedQuerySelectorAll<HTMLElement>('.node').forEach((node) => {
    const nodeElement = node as HTMLElement

    // Skip the group itself (but include nested groups as children)
    if (nodeElement === groupElement) {
      return
    }

    const nodeX = parseFloat(nodeElement.style.left) || 0
    const nodeY = parseFloat(nodeElement.style.top) || 0
    const nodeWidth = parseFloat(nodeElement.style.width) || nodeElement.offsetWidth
    const nodeHeight = parseFloat(nodeElement.style.height) || nodeElement.offsetHeight
    const nodeRight = nodeX + nodeWidth
    const nodeBottom = nodeY + nodeHeight

    // Check if node is fully contained within the group
    if (
      nodeX >= groupX &&
      nodeY >= groupY &&
      nodeRight <= groupRight &&
      nodeBottom <= groupBottom
    ) {
      children.push(nodeElement)
    }
  })

  return children
}

onMounted(() => {
  // Initialize AbortController for cleanup
  eventAbortController.value = new AbortController()
  const signal = eventAbortController.value.signal

  adjustCanvasToViewport()
  drawEdges()

  // Fit follows the frame: the mount-time fit above used the container's
  // mount-time size, and panes get dragged, sidebars collapse, windows
  // rotate. Only while the viewport is untouched — a resize never stomps a
  // pan or zoom the reader chose. (`ResizeObserver` batches to the frame,
  // so no extra debounce.)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (viewportTouched.value) return
      adjustCanvasToViewport()
    })
    resizeObserver.observe(canvasContainerRef.value!)
  }

  // Wheel/touchpad gesture handling:
  // - Two-finger scroll (no ctrlKey) → pan canvas
  // - Pinch-to-zoom (ctrlKey is set by browser for pinch gestures) → zoom canvas
  const canvasContainerEl = canvasContainerRef.value!
  if (!canvasContainerEl) {
    console.warn('Canvas container ref not available')
    return
  }

  // The input-layer counterpart to `execute()`/`executeBatch()`: every
  // listener whose whole job is an edit goes through here, so a new one
  // cannot forget the check. The test is per event because `readonly` is a
  // live prop, and it runs before the handler, so a refused gesture keeps no
  // `preventDefault`, no `stopPropagation` and no pointer capture — a link
  // inside a rendered text node still gets its click.
  const onEditGesture = <E extends Event>(el: EventTarget, type: string, fn: (e: E) => void) => {
    el.addEventListener(type, (e) => {
      if (props.readonly) return
      fn(e as E)
    })
  }

  // Accumulate scroll deltas and apply them in animation frame for smooth performance
  let pendingDeltaX = 0
  let pendingDeltaY = 0
  let pendingZoom: { deltaY: number; mouseX: number; mouseY: number } | null = null
  let wheelRAF: number | null = null

  // Track if we started a marquee or background pan (to differentiate from click)
  // These must be declared before the pointermove handler that uses them
  let marqueeStarted = false
  let marqueeStartEvent: PointerEvent | null = null
  let bgPanStartEvent: PointerEvent | null = null
  let bgPanStartX = 0
  let bgPanStartY = 0
  // A pan or marquee that began on an edge takes pointer capture only once the
  // press moves past the click threshold. Capture moves the click to the
  // container, and a click that stays on the edge is what selects it.
  let deferredCapture = false

  /** Past the 5px click threshold since `start`. */
  function movedPastClick(start: PointerEvent, e: PointerEvent): boolean {
    return Math.abs(e.clientX - start.clientX) > 5 || Math.abs(e.clientY - start.clientY) > 5
  }

  function applyWheelUpdates() {
    wheelRAF = null

    if (pendingZoom) {
      // Apply zoom
      const delta = pendingZoom.deltaY > 0 ? -ZOOM_SPEED : ZOOM_SPEED
      const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale.value + delta))
      const scaleRatio = newScale / scale.value

      // Calculate new pan values (zoom towards cursor)
      const newPanX = pendingZoom.mouseX - (pendingZoom.mouseX - panOffsetX.value) * scaleRatio
      const newPanY = pendingZoom.mouseY - (pendingZoom.mouseY - panOffsetY.value) * scaleRatio

      // Update viewport via ViewModel
      setScale(newScale)
      setPan(newPanX, newPanY)

      pendingZoom = null
    } else if (pendingDeltaX !== 0 || pendingDeltaY !== 0) {
      // Apply pan via ViewModel
      setPan(panOffsetX.value - pendingDeltaX, panOffsetY.value - pendingDeltaY)
      pendingDeltaX = 0
      pendingDeltaY = 0
    }
  }

  canvasContainerEl.addEventListener(
    'wheel',
    (e) => {
      // Only handle wheel events when canvas is focused or actively interacting
      // This allows page scroll to work when canvas is embedded in scrollable page
      if (!isFocused.value && !isDragging.value && !isPanning.value && !isBackgroundPanning.value) {
        return // Let the event bubble for page scroll
      }
      // Text fields (the in-place editor, a host's form controls) and the
      // side panels scroll themselves. Focus-within keeps the board focused
      // while focus sits in one of them, so they are exempted by target.
      if (
        !isDragging.value &&
        !isPanning.value &&
        !isBackgroundPanning.value &&
        (e.target as Element | null)?.closest?.(
          'textarea, input, select, [contenteditable]:not([contenteditable="false"]), .vjc-history-panel, .output-panel',
        )
      ) {
        return
      }

      e.preventDefault()
      viewportTouched.value = true

      if (e.ctrlKey || e.metaKey) {
        // Pinch-to-zoom gesture (browser sets ctrlKey for trackpad pinch)
        const rect = canvasContainerEl.getBoundingClientRect()
        pendingZoom = {
          deltaY: e.deltaY,
          mouseX: e.clientX - rect.left,
          mouseY: e.clientY - rect.top,
        }
        // Clear any pending pan
        pendingDeltaX = 0
        pendingDeltaY = 0
      } else {
        // Two-finger scroll → accumulate pan deltas
        pendingDeltaX += e.deltaX
        pendingDeltaY += e.deltaY
        // Clear any pending zoom
        pendingZoom = null
      }

      // Schedule update on next animation frame (batches multiple events)
      if (wheelRAF === null) {
        wheelRAF = requestAnimationFrame(applyWheelUpdates)
      }
    },
    { passive: false },
  )

  // ===== Edge creation ======
  // Pressing a side anchor starts an edge draft; the node-drag handler below
  // ignores anchor presses, so the two gestures never race.
  onEditGesture<PointerEvent>(canvasContainerEl, 'pointerdown', (e) => {
    if (isSpacePressed.value || e.button !== 0) return
    const anchorEl = (e.target as HTMLElement).closest<HTMLElement>('[data-anchor-side]')
    if (!anchorEl) return
    const fromNode = anchorEl.dataset.anchorNode
    const fromSide = anchorEl.dataset.anchorSide as Direction
    if (!fromNode) return
    e.preventDefault()
    e.stopPropagation()
    edgeDraft.value = { fromNode, fromSide, toPoint: getCanvasPoint(e) }
    capturePointer(e, canvasContainerEl)
  })

  // ===== Drag nodes ======
  // ONE delegated pointerdown on the container rather than a listener per
  // node element: nodes created, duplicated, or replaced wholesale by a new
  // `canvasContent` prop are draggable the moment Vue renders them, with no
  // per-node wiring to forget. Drag, resize and selection all start here, so
  // the whole handler is an edit gesture.
  onEditGesture<PointerEvent>(canvasContainerEl, 'pointerdown', (event) => {
    // Primary button drags; a right-click only selects (below). Any other
    // button is left alone.
    if (isSpacePressed.value || (event.button !== 0 && event.button !== 2)) return

    const target = event.target as HTMLElement
    // Presses inside interactive content — the in-place editor, form
    // controls a host component rendered, edge anchors — are not drags.
    if (target.closest('textarea, input, select, [contenteditable="true"], [data-anchor-side]')) {
      return
    }
    const nodeElement = target.closest<HTMLElement>('.node')
    if (!nodeElement) return
    const nodeId = nodeElement.id

    // A right-click drags and resizes nothing. On a node outside the
    // selection it makes that node the selection, so the context menu acts on
    // the node under the pointer; inside the selection it keeps all of it.
    if (event.button === 2) {
      if (!isNodeSelected(nodeId)) selectNode(nodeId, false)
      return
    }

    // Use the same point-based node finding as hover detection for consistency
    const point = getCanvasPoint(event)
    const nodeAtPoint = findNodeAtPoint(point.x, point.y)
    if (nodeAtPoint) {
      const direction = getResizeDirection(point.x, point.y, nodeAtPoint)
      if (direction) {
        // Start resize on the node found at this point (may differ from clicked element)
        event.preventDefault()
        event.stopPropagation()
        isResizing.value = true
        resizeNodeId.value = nodeAtPoint.id
        resizeStartNode.value = {
          x: nodeAtPoint.x,
          y: nodeAtPoint.y,
          width: nodeAtPoint.width,
          height: nodeAtPoint.height,
        }
        resizeStartMouse.value = { x: event.clientX, y: event.clientY }
        hoverResizeDirection.value = direction
        selectNode(nodeAtPoint.id, event.shiftKey)
        // Capture pointer for resize to prevent text selection outside
        capturePointer(event, canvasContainerEl)
        return
      }
    }

    if (event.ctrlKey || event.metaKey) {
      toggleNodeSelection(nodeId)
      // A press that deselected the node is not a drag: the drag commits
      // only selected nodes, so this one would move on screen but not in data.
      if (!isNodeSelected(nodeId)) return
    } else if (event.shiftKey) {
      // `true`: add to the selection rather than replace it.
      selectNode(nodeId, true)
    } else {
      // Leave an existing multi-selection alone, so a press inside it drags
      // the whole group rather than collapsing the selection to one node.
      if (!isNodeSelected(nodeId)) {
        selectNode(nodeId, false)
      }
    }

    isDragging.value = true
    dragStartPoint.value = { x: event.clientX, y: event.clientY }
    dragAxis.value = null
    dragOffset.value = { x: 0, y: 0 }
    draggedElement.value = nodeElement
    nodeElement.classList.add('is-dragging')

    // Capture initial positions of all selected nodes for undo/redo
    dragStartPositions.value.clear()
    const selectedData = canvasContent.value.nodes.filter((n: INode) =>
      selectedNodeIds.value.has(n.id),
    )
    for (const node of selectedData) {
      dragStartPositions.value.set(node.id, { x: node.x, y: node.y })
    }
    dragStartBounds.value = getBoundingBoxFromNodes(selectedData)

    // Every selected group carries the nodes inside it, whichever selected
    // node was grabbed. Tracking their start positions puts them in
    // commitDragOperation's moveNodes too — otherwise their on-screen drag
    // is DOM-only and the data model never picks up the move.
    for (const node of selectedData) {
      if (node.type !== 'group') continue
      const groupEl = scopedGetElementById(node.id)
      if (!groupEl) continue
      for (const child of findChildNodes(groupEl)) {
        if (dragStartPositions.value.has(child.id)) continue
        const childNode = canvasContent.value.nodes.find((n: INode) => n.id === child.id)
        if (childNode) {
          dragStartPositions.value.set(child.id, { x: childNode.x, y: childNode.y })
        }
      }
    }

    // NO pointer capture yet: capture retargets every later event of the
    // press — including the second click of a double-click — to the capture
    // element, which breaks dblclick-to-edit on a node. The
    // pointermove drag branch captures on the first actual movement, which
    // is soon enough to keep text selection from bleeding outside.
  })

  // Consolidated pointermove handler for drag, resize, background pan, and marquee
  window.addEventListener(
    'pointermove',
    (e) => {
      // Handle edge drawing
      if (edgeDraft.value) {
        edgeDraft.value = { ...edgeDraft.value, toPoint: getCanvasPoint(e) }
        return
      }

      // Handle resize
      if (
        isResizing.value &&
        resizeNodeId.value &&
        resizeStartNode.value &&
        hoverResizeDirection.value
      ) {
        const nodeElement = scopedGetElementById(resizeNodeId.value)
        const nodeData = canvasContent.value.nodes.find((n: INode) => n.id === resizeNodeId.value)
        if (!nodeElement || !nodeData) return

        const dx = (e.clientX - resizeStartMouse.value.x) / scale.value
        const dy = (e.clientY - resizeStartMouse.value.y) / scale.value
        const direction = hoverResizeDirection.value

        let newX = resizeStartNode.value.x
        let newY = resizeStartNode.value.y
        let newWidth = resizeStartNode.value.width
        let newHeight = resizeStartNode.value.height

        // Apply resize based on direction
        if (direction.includes('e')) {
          newWidth = Math.max(MIN_WIDTH, resizeStartNode.value.width + dx)
        }
        if (direction.includes('w')) {
          const widthChange = Math.min(dx, resizeStartNode.value.width - MIN_WIDTH)
          newWidth = resizeStartNode.value.width - widthChange
          newX = resizeStartNode.value.x + widthChange
        }
        if (direction.includes('s')) {
          newHeight = Math.max(MIN_HEIGHT, resizeStartNode.value.height + dy)
        }
        if (direction.includes('n')) {
          const heightChange = Math.min(dy, resizeStartNode.value.height - MIN_HEIGHT)
          newHeight = resizeStartNode.value.height - heightChange
          newY = resizeStartNode.value.y + heightChange
        }

        // Update DOM only. Every committed operation comes back from the
        // executor as a frozen Immer snapshot, so writing the live preview
        // into `nodeData` throws; `commitResizeOperation` reads the final
        // geometry back off these styles on pointerup anyway.
        nodeElement.style.left = `${newX}px`
        nodeElement.style.top = `${newY}px`
        nodeElement.style.width = `${newWidth}px`
        nodeElement.style.height = `${newHeight}px`

        drawEdges()
        return
      }

      // Handle space+drag panning
      if (isPanning.value) {
        setPan(e.clientX - panStartX.value, e.clientY - panStartY.value)
        return
      }

      // Handle background panning (Obsidian-style)
      if (isBackgroundPanning.value) {
        if (deferredCapture && bgPanStartEvent && movedPastClick(bgPanStartEvent, e)) {
          deferredCapture = false
          capturePointer(e, canvasContainerEl)
        }
        setPan(e.clientX - bgPanStartX, e.clientY - bgPanStartY)
        return
      }

      // Handle marquee selection (Shift+drag)
      if (marqueeStartEvent && !isDragging.value && !isResizing.value) {
        const dx = Math.abs(e.clientX - marqueeStartEvent.clientX)
        const dy = Math.abs(e.clientY - marqueeStartEvent.clientY)

        // Start marquee after moving a few pixels (to differentiate from click)
        if (dx > 5 || dy > 5) {
          if (deferredCapture) {
            deferredCapture = false
            capturePointer(e, canvasContainerEl)
          }
          if (!marqueeStarted) {
            marqueeStarted = true
            isMarqueeSelecting.value = true
            const point = getCanvasPoint(marqueeStartEvent)
            marqueeStart.value = point
            marqueeEnd.value = point
          }

          if (isMarqueeSelecting.value) {
            marqueeEnd.value = getCanvasPoint(e)
            // Live update selection during drag
            updateSelectionFromMarquee(e.shiftKey)
          }
        }
        return
      }

      // Handle drag
      if (isDragging.value && draggedElement.value) {
        // First movement of the press: NOW capture the pointer (see the
        // pointerdown handler for why not earlier).
        capturePointer(e, canvasContainerEl)

        const origin = dragStartPoint.value
        if (!origin) return
        // The offset from where the press started, not since the last event.
        let dx = (e.clientX - origin.x) / scale.value
        let dy = (e.clientY - origin.y) / scale.value

        // Apply axis constraint if Shift is held
        if (e.shiftKey) {
          // Determine axis based on which direction has more movement
          if (dragAxis.value === null) {
            if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
              dragAxis.value = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
            }
          }

          if (dragAxis.value === 'x') {
            dy = 0
          } else if (dragAxis.value === 'y') {
            dx = 0
          }
        } else {
          // Reset axis when Shift is released
          dragAxis.value = null
        }

        // Apply snapping (unless Alt is held)
        const snapped = applySnap(dx, dy)
        dragOffset.value = { x: snapped.dx, y: snapped.dy }
        activeSnapGuides.value = snapped.guides

        // Place every moving node — the selection and any selected group's
        // children — at its start position plus the offset.
        for (const [id, start] of dragStartPositions.value) {
          const nodeEl = scopedGetElementById(id)
          if (!nodeEl) continue
          nodeEl.style.left = `${start.x + snapped.dx}px`
          nodeEl.style.top = `${start.y + snapped.dy}px`
        }

        drawEdges()
        return
      }

      // Update resize cursor on hover (only when not in any interaction).
      // A read-only board never shows a resize cursor, because there is no
      // resize behind it — the pointer keeps the grab cursor that says the
      // one thing a press here does do, which is pan.
      if (
        !props.readonly &&
        !isDragging.value &&
        !isPanning.value &&
        !isMarqueeSelecting.value &&
        !isResizing.value &&
        !isBackgroundPanning.value
      ) {
        const point = getCanvasPoint(e)
        const node = findNodeAtPoint(point.x, point.y)
        if (node) {
          const direction = getResizeDirection(point.x, point.y, node)
          hoverResizeDirection.value = direction
        } else {
          hoverResizeDirection.value = null
        }
      }
    },
    { signal },
  )

  // ===== Panning & Keyboard shortcuts ======
  window.addEventListener(
    'keydown',
    (e) => {
      // Track modifier keys globally (even without focus) to prevent stuck state
      if (e.key === 'Alt') {
        isAltPressed.value = true
      }
      if (e.key === 'Control') {
        isCtrlPressed.value = true
      }

      // Only process action shortcuts when canvas is focused
      if (!isFocused.value) return

      const isMod = e.ctrlKey || e.metaKey
      // With Shift (or Caps Lock) held, browsers report the shifted letter —
      // Ctrl+Shift+Z arrives as key 'Z' — so letter chords match lowercased.
      const key = e.key.toLowerCase()

      // Don't handle shortcuts while focus is on a control inside the board
      // (focus-within keeps isFocused true there): a form field or editable
      // content keeps its own keys, and a focused button keeps Space, which
      // activates it.
      const activeElement = document.activeElement
      if (
        activeElement?.closest(
          'textarea, input, select, [contenteditable]:not([contenteditable="false"])',
        )
      ) {
        return
      }
      if (e.code === 'Space' && activeElement?.closest('button, a[href], [role="button"]')) {
        return
      }

      // ── View chords ───────────────────────────────────────────────────
      // Zooming is not editing, so these survive `readonly` and are matched
      // before the guard below rather than after it.

      // Zoom in: Ctrl/Cmd + = or +
      if (isMod && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        handleZoomIn()
        return
      }

      // Zoom out: Ctrl/Cmd + -
      if (isMod && e.key === '-') {
        e.preventDefault()
        handleZoomOut()
        return
      }

      // Reset zoom: Ctrl/Cmd + 0
      if (isMod && e.key === '0') {
        e.preventDefault()
        handleZoomReset()
        return
      }

      // ── Editing and selection chords ──────────────────────────────────
      // Everything past this line changes the board or its selection, and
      // nearly all of it calls `preventDefault()`. This listener is on
      // `window`, so a board that merely hides its editing chrome still takes
      // Delete, Backspace, mod+A, mod+Z and Space away from the application
      // around it — and then discards the edit it made with them. Returning
      // here is what makes `readonly` true of the keyboard as well as of the
      // toolbar, and it covers any chord added below without a second list to
      // keep in step.
      if (props.readonly) return

      // Pan mode (Space key)
      if (e.code === 'Space') {
        e.preventDefault()
        isSpacePressed.value = true
        return
      }

      // Escape: clear selection
      if (e.key === 'Escape') {
        clearSelection()
        return
      }

      // Delete/Backspace: delete selected nodes
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeIds.value.size > 0) {
          e.preventDefault()
          deleteSelectedNodes()
        }
        return
      }

      // Ctrl/Cmd + A: select all nodes
      if (isMod && key === 'a') {
        e.preventDefault()
        selectAllNodes()
        return
      }

      // Undo: Ctrl/Cmd + Z (without Shift)
      if (isMod && key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
        return
      }

      // Redo: Ctrl/Cmd + Shift + Z or Ctrl/Cmd + Y
      if ((isMod && key === 'z' && e.shiftKey) || (isMod && key === 'y')) {
        e.preventDefault()
        redo()
        return
      }
    },
    { signal },
  )

  window.addEventListener(
    'keyup',
    (e) => {
      if (e.code === 'Space') {
        isSpacePressed.value = false
      }
      if (e.key === 'Alt') {
        isAltPressed.value = false
      }
      if (e.key === 'Control') {
        isCtrlPressed.value = false
      }
    },
    { signal },
  )

  // ===== Canvas click handlers ======
  const canvasContainer = canvasContainerEl

  // Pointerdown on canvas background: check for resize, marquee (Shift), or pan
  // Use pointerdown instead of mousedown to enable pointer capture
  canvasContainer.addEventListener('pointerdown', (e) => {
    // Primary or middle button. A right-click must leave the selection alone
    // for the contextmenu handler, which runs after (or, on macOS, before)
    // the release that would otherwise read as a background click and clear
    // it.
    if (e.button !== 0 && e.button !== 1) return
    const target = e.target as Element
    // Only handle if clicking on background (not on a node or the chrome)
    if (isBackgroundTarget(target)) {
      // A press on an edge may still be a click that selects it, so its
      // pan or marquee captures the pointer only once it moves.
      deferredCapture = !props.readonly && target.closest('.vjc-edge-paths path') !== null
      const capture = () => {
        if (!deferredCapture) capturePointer(e, canvasContainerEl)
      }
      // Check if we're in a node's resize boundary zone (outside the node but within 8px)
      // Skipped on a read-only board, along with the Shift+drag marquee below:
      // the resize handles are an editing gesture, and with both out of the way
      // every press on the background pans, whatever modifier is held.
      const point = props.readonly ? null : getCanvasPoint(e)
      const nodeAtPoint = point ? findNodeAtPoint(point.x, point.y) : null
      if (point && nodeAtPoint) {
        const direction = getResizeDirection(point.x, point.y, nodeAtPoint)
        if (direction) {
          // Start resize - we clicked in the outer boundary zone
          e.preventDefault()
          e.stopPropagation()
          isResizing.value = true
          resizeNodeId.value = nodeAtPoint.id
          resizeStartNode.value = {
            x: nodeAtPoint.x,
            y: nodeAtPoint.y,
            width: nodeAtPoint.width,
            height: nodeAtPoint.height,
          }
          resizeStartMouse.value = { x: e.clientX, y: e.clientY }
          hoverResizeDirection.value = direction
          selectNode(nodeAtPoint.id, e.shiftKey)
          // Capture pointer for resize
          capturePointer(e, canvasContainerEl)
          return
        }
      }

      // Shift+drag = marquee selection, otherwise = pan
      if (e.shiftKey && !props.readonly) {
        marqueeStartEvent = e
        marqueeStarted = false
        marqueeBaseSelection = [...selectedNodeIds.value]
        // Capture pointer for marquee selection
        capture()
      } else {
        // Start background panning (Obsidian-style).
        // No `preventDefault()` here: canceling a pointerdown suppresses the
        // derived mouse events — mousedown, click, and the dblclick that
        // creates a text node — in a real browser (jsdom does not model
        // this). Text-selection during the pan is already prevented by the
        // wrapper's `user-select: none` and the pointer capture.
        bgPanStartEvent = e
        bgPanStartX = e.clientX - panOffsetX.value
        bgPanStartY = e.clientY - panOffsetY.value
        isBackgroundPanning.value = true
        viewportTouched.value = true
        // Capture pointer for background panning
        capture()
      }
    }
  })

  // Double-click: edit a text node in place, or create one on the background
  // A read-only board creates nothing, so the double-click is left to the
  // browser and its own text selection.
  onEditGesture<MouseEvent>(canvasContainer, 'dblclick', (e) => {
    const target = e.target as HTMLElement

    // On a text node: open the in-place editor
    const nodeElement = target.closest<HTMLElement>('.node')
    if (nodeElement) {
      const node = canvasContent.value.nodes.find((n: INode) => n.id === nodeElement.id)
      if (node && isTextNode(node)) {
        beginTextEdit(node.id)
      }
      return
    }

    // Only create if double-clicking on the background
    if (isBackgroundTarget(target)) {
      const point = getCanvasPoint(e)
      const newNode = createTextNode(point.x, point.y)

      if (newNode) {
        // Wait for Vue to render the new node, then select it
        nextTick(() => {
          selectNode(newNode.id, false)
          drawEdges()
        })
      }
    }
  })

  // ===== Edge click handlers ======
  // Selecting an edge exists to open the edit panel on it, which is what
  // makes the click an edit gesture.
  const canvasEdgesSvg = scopedQuerySelector<SVGElement>('.vjc-edges')
  if (canvasEdgesSvg) {
    onEditGesture<MouseEvent>(canvasEdgesSvg, 'click', (e) => {
      const target = e.target as SVGElement
      if (target.tagName === 'path') {
        // Each drawn path carries its edge's id, so an edge that was not drawn
        // does not shift the match for the ones after it.
        const edgeId = (target as SVGPathElement).dataset.edgeId
        if (edgeId !== undefined && canvasContent.value.edges.some((edge) => edge.id === edgeId)) {
          e.stopPropagation()
          selectEdge(edgeId)
        }
      }
    })
  }

  // ===== Context menu ======
  // A read-only board keeps the browser's own menu. Every entry in ours —
  // align, distribute, match size, duplicate, delete — edits, so there is
  // nothing left to show, and suppressing the browser menu to show nothing
  // would take "copy" and "inspect" away for no gain.
  onEditGesture<MouseEvent>(canvasContainer, 'contextmenu', (e) => {
    e.preventDefault()

    if (selectedNodeIds.value.size > 0) {
      // The menu is `position: fixed`, but the container's `contain: layout
      // paint` makes the container its containing block, so the position is
      // measured from the container's origin, not the viewport's.
      const rect = canvasContainer.getBoundingClientRect()
      showContextMenu(e.clientX - rect.left, e.clientY - rect.top)
    }
  })

  // Close context menu on click elsewhere
  window.addEventListener(
    'click',
    () => {
      hideContextMenu()
    },
    { signal },
  )

  // Close context menu on escape
  window.addEventListener(
    'keydown',
    (e) => {
      if (e.key === 'Escape') {
        hideContextMenu()
      }
    },
    { signal },
  )

  // ===== Panning (Space+drag) ======
  window.addEventListener(
    'pointerdown',
    (e) => {
      if (isSpacePressed.value && !isDragging.value) {
        isPanning.value = true
        viewportTouched.value = true
        panStartX.value = e.clientX - panOffsetX.value
        panStartY.value = e.clientY - panOffsetY.value
        // Capture pointer for space+drag panning
        capturePointer(e, canvasContainerEl)
      }
    },
    { signal },
  )

  // Note: Space+drag pointermove is handled in the consolidated pointermove handler above

  // ===== Consolidated pointerup handler =====
  // Handles all pointer release events: drag, resize, pan, marquee
  window.addEventListener(
    'pointerup',
    (e) => {
      // 0. Handle edge-draft end (create the edge if it landed on a node)
      if (edgeDraft.value) {
        finishEdgeDraft(e)
        releasePointer()
        return
      }

      // 1. Handle node drag end
      if (isDragging.value && draggedElement.value) {
        draggedElement.value.classList.remove('is-dragging')
        isDragging.value = false
        draggedElement.value = null
        activeSnapGuides.value = []
        dragStartPoint.value = null
        dragAxis.value = null
        commitDragOperation()
        drawEdges()
      }

      // 2. Handle background pan end
      if (isBackgroundPanning.value) {
        const dx = bgPanStartEvent ? Math.abs(e.clientX - bgPanStartEvent.clientX) : 0
        const dy = bgPanStartEvent ? Math.abs(e.clientY - bgPanStartEvent.clientY) : 0
        // If no significant movement, a primary press is a click that clears
        // the selection. A middle press only ever pans.
        if (dx < 5 && dy < 5 && bgPanStartEvent?.button === 0) {
          clearSelection()
        }
        isBackgroundPanning.value = false
        bgPanStartEvent = null
      }

      // 3. Handle space+drag pan end
      if (isPanning.value) {
        isPanning.value = false
      }

      // 4. Handle marquee end
      if (isMarqueeSelecting.value) {
        isMarqueeSelecting.value = false
        updateSelectionFromMarquee(e.shiftKey)
      } else if (marqueeStartEvent && !marqueeStarted) {
        // It was a click (not a drag) - clear selection
        if (isBackgroundTarget(e.target)) {
          clearSelection()
        }
      }
      marqueeStartEvent = null
      marqueeStarted = false

      // 5. Handle resize end
      if (isResizing.value) {
        commitResizeOperation()
        isResizing.value = false
        resizeNodeId.value = null
        resizeStartNode.value = null
        hoverResizeDirection.value = null
        drawEdges()
      }

      // Always release pointer capture at the end
      releasePointer()
    },
    { signal },
  )

  // ===== Pointer cancel handler =====
  // Handles cases where pointer capture is lost unexpectedly, or the browser
  // takes the gesture over (a native drag of an image inside a node). The
  // preview lives only in inline styles, so an open drag or resize is
  // committed — as pointerup and the blur handler do — rather than left drawn
  // but unsaved.
  window.addEventListener(
    'pointercancel',
    () => {
      const wasEditing = isDragging.value || isResizing.value
      if (isDragging.value) commitDragOperation()
      if (isResizing.value) commitResizeOperation()

      // Reset all interaction states
      draggedElement.value?.classList.remove('is-dragging')
      isDragging.value = false
      draggedElement.value = null
      isPanning.value = false
      isBackgroundPanning.value = false
      isMarqueeSelecting.value = false
      isResizing.value = false
      resizeNodeId.value = null
      resizeStartNode.value = null
      hoverResizeDirection.value = null
      activeSnapGuides.value = []
      dragStartPoint.value = null
      dragAxis.value = null
      marqueeStartEvent = null
      marqueeStarted = false
      bgPanStartEvent = null
      edgeDraft.value = null

      if (wasEditing) drawEdges()
      releasePointer()
    },
    { signal },
  )

  // ===== Window blur handler =====
  // Safety reset when browser window loses focus
  window.addEventListener(
    'blur',
    () => {
      // A drag or resize previews in the DOM only, so commit it before the
      // reset, as pointerup does — otherwise the node stays where it was
      // dropped on screen while the model keeps the old geometry.
      const wasEditing = isDragging.value || isResizing.value
      if (isDragging.value) commitDragOperation()
      if (isResizing.value) commitResizeOperation()

      // Reset all interaction states
      if (isDragging.value && draggedElement.value) {
        draggedElement.value.classList.remove('is-dragging')
      }
      isDragging.value = false
      draggedElement.value = null
      isPanning.value = false
      isBackgroundPanning.value = false
      isMarqueeSelecting.value = false
      isResizing.value = false
      resizeNodeId.value = null
      resizeStartNode.value = null
      hoverResizeDirection.value = null
      activeSnapGuides.value = []
      dragStartPoint.value = null
      dragAxis.value = null
      isSpacePressed.value = false
      isAltPressed.value = false
      isCtrlPressed.value = false
      marqueeStartEvent = null
      marqueeStarted = false
      bgPanStartEvent = null
      edgeDraft.value = null

      if (wasEditing) drawEdges()
      releasePointer()
    },
    { signal },
  )
})

// Cleanup all event listeners when component unmounts
onUnmounted(() => {
  // Abort all window/document event listeners registered with the AbortController
  if (eventAbortController.value) {
    eventAbortController.value.abort()
    eventAbortController.value = null
  }

  resizeObserver?.disconnect()
  resizeObserver = null

  // Reset interaction state
  draggedElement.value = null
})

/**
 * Fit every node into the canvas CONTAINER — not into the browser window.
 *
 * The container is the right frame of reference whenever this component is
 * embedded rather than given the whole page: an app pane, the scrollable demo,
 * a split view. Measuring `window.innerWidth`/`innerHeight` instead centres the
 * board on the window, which puts most of it outside a narrower container with
 * no indication that anything is there. In a full-page mount the two measures
 * agree.
 */
function adjustCanvasToViewport() {
  const nodes = scopedQuerySelectorAll<HTMLElement>('.node')
  if (nodes.length === 0) return

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity

  nodes.forEach((node) => {
    const nodeElement = node as HTMLDivElement

    const x = parseFloat(nodeElement.style.left) || 0
    const y = parseFloat(nodeElement.style.top) || 0
    const width = parseFloat(nodeElement.style.width) || nodeElement.offsetWidth
    const height = parseFloat(nodeElement.style.height) || nodeElement.offsetHeight

    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x + width)
    minY = Math.min(minY, y)
    maxY = Math.max(maxY, y + height)
  })

  const boundingBoxWidth = maxX - minX
  const boundingBoxHeight = maxY - minY
  const rect = canvasContainerRef.value?.getBoundingClientRect()
  // A container with no layout yet (mount before paint) falls back to the
  // window rather than dividing by zero.
  const viewportWidth = rect?.width || window.innerWidth
  const viewportHeight = rect?.height || window.innerHeight

  const scaleX = viewportWidth / (boundingBoxWidth + 80)
  const scaleY = viewportHeight / (boundingBoxHeight + 80)

  setScale(Math.min(scaleX, scaleY, 1)) // Ensure the scale is not more than 1
  // Centre with the scale actually applied: setScale clamps to the minimum,
  // and centring with the unclamped value puts a very wide board off-centre.
  const newScale = scale.value
  setPan(
    (viewportWidth - boundingBoxWidth * newScale) / 2 - minX * newScale,
    (viewportHeight - boundingBoxHeight * newScale) / 2 - minY * newScale,
  )
}

/**
 * Get or create a colored arrow marker in this board's `defs`.
 * SVG markers don't inherit colors from paths, so we create unique markers per color.
 * An uncoloured edge's marker takes the theme's `--vjc-color-ui-3`, resolved on
 * this board's wrapper when the marker is made.
 */
function getOrCreateMarker(
  defs: Element,
  type: 'end' | 'start',
  color: string | null | undefined,
): string {
  // Read on the wrapper, which declares the theme's variables.
  const wrapper = canvasContainerRef.value?.closest('.vjc-wrapper')
  const defaultColor =
    (wrapper && getComputedStyle(wrapper).getPropertyValue('--vjc-color-ui-3').trim()) || '#5e0641'
  const markerColor = color || defaultColor
  const colorId = markerColor.replace('#', '')
  const kind = type === 'end' ? 'arrowhead' : 'arrowhead-start'
  const markerId = `${markerIdPrefix}-${kind}-${colorId}`

  // Check if this board already has the marker
  if (defs.querySelector(`[id="${markerId}"]`)) {
    return markerId
  }

  // Create new marker
  const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker')
  marker.setAttribute('id', markerId)
  marker.setAttribute('markerWidth', '10')
  marker.setAttribute('markerHeight', '8')
  marker.setAttribute('refX', type === 'end' ? '9' : '1')
  marker.setAttribute('refY', '4')
  marker.setAttribute('orient', 'auto')

  const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon')
  polygon.setAttribute('points', type === 'end' ? '0 0, 10 4, 0 8' : '10 0, 0 4, 10 8')
  polygon.setAttribute('fill', markerColor)

  marker.appendChild(polygon)
  defs.appendChild(marker)

  return markerId
}

function drawEdges() {
  const pathContainer = scopedQuerySelector<SVGGElement>('.vjc-edge-paths')
  const labelContainer = scopedQuerySelector<SVGGElement>('.vjc-edge-labels')
  const svg = scopedQuerySelector<SVGElement>('.vjc-edges')
  if (!pathContainer || !labelContainer || !svg) return

  const defs = svg.querySelector('defs')
  if (!defs) return

  pathContainer.innerHTML = '' // Clear existing edges for redraw
  labelContainer.innerHTML = '' // Clear existing labels for redraw

  // Clear dynamically created markers (keep the default ones)
  defs.querySelectorAll('marker:not(#arrowhead):not(#arrowhead-start)').forEach((m) => m.remove())

  canvasContent.value.edges.forEach((edge: IEdge) => {
    const fromNode = scopedGetElementById(edge.fromNode)
    const toNode = scopedGetElementById(edge.toNode)

    if (fromNode && toNode) {
      const fromSide = edge.fromSide ?? 'right'
      const toSide = edge.toSide ?? 'left'
      const fromPoint = getAnchorPoint(fromNode, fromSide)
      const toPoint = getAnchorPoint(toNode, toSide)

      // Use core geometry for control point calculation
      const { control1, control2 } = calculateControlPoints(fromPoint, toPoint, fromSide, toSide)

      const d = `M ${fromPoint.x} ${fromPoint.y} C ${control1.x} ${control1.y}, ${control2.x} ${control2.y}, ${toPoint.x} ${toPoint.y}`

      // Create path element
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', d)
      path.setAttribute('fill', 'none')
      // The click and selection code find the edge through this, not by position.
      path.dataset.edgeId = edge.id
      // A redraw replaces every path, so the selection highlight is set here
      // too, not only by updateEdgeSelectionVisuals.
      if (edge.id === selectedEdgeId.value) path.classList.add('is-selected')

      // Apply edge color
      const edgeColor = resolveColor(edge.color)
      if (edgeColor) {
        path.setAttribute('stroke', edgeColor)
        path.style.setProperty('--edge-color', edgeColor)
      }

      // Apply end marker (default is arrow)
      const toEnd = edge.toEnd ?? 'arrow'
      if (toEnd === 'arrow') {
        const markerId = getOrCreateMarker(defs, 'end', edgeColor)
        path.setAttribute('marker-end', `url(#${markerId})`)
      }

      // Apply start marker (default is none)
      const fromEnd = edge.fromEnd ?? 'none'
      if (fromEnd === 'arrow') {
        const markerId = getOrCreateMarker(defs, 'start', edgeColor)
        path.setAttribute('marker-start', `url(#${markerId})`)
      }

      pathContainer.appendChild(path)

      // Render edge label if present
      if (edge.label) {
        // Use core geometry for bezier midpoint
        const mid = bezierMidpoint({
          start: fromPoint,
          control1,
          control2,
          end: toPoint,
        })

        // Create label background
        const labelBg = document.createElementNS('http://www.w3.org/2000/svg', 'rect')

        // Create label text
        const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text')
        labelText.setAttribute('x', String(mid.x))
        labelText.setAttribute('y', String(mid.y))
        labelText.setAttribute('text-anchor', 'middle')
        labelText.setAttribute('dominant-baseline', 'middle')
        labelText.setAttribute('class', 'vjc-edge-label')
        labelText.textContent = edge.label

        // Apply label color to match edge. An inline style, because the
        // `.vjc-edge-label` rule in index.css outranks a `fill` attribute.
        if (edgeColor) {
          labelText.style.fill = edgeColor
        }

        // Add background rect (sized after text is added to DOM)
        labelBg.setAttribute('class', 'vjc-edge-label-bg')
        labelBg.setAttribute('rx', '4')
        labelBg.setAttribute('ry', '4')

        labelContainer.appendChild(labelBg)
        labelContainer.appendChild(labelText)

        // Size background to fit text
        const bbox = labelText.getBBox()
        const padding = 4
        labelBg.setAttribute('x', String(bbox.x - padding))
        labelBg.setAttribute('y', String(bbox.y - padding / 2))
        labelBg.setAttribute('width', String(bbox.width + padding * 2))
        labelBg.setAttribute('height', String(bbox.height + padding))
      }
    }
  })
}

function handleZoomIn() {
  viewportTouched.value = true
  setScale(Math.min(scale.value + ZOOM_SPEED, MAX_SCALE))
}

function handleZoomOut() {
  viewportTouched.value = true
  setScale(Math.max(scale.value - ZOOM_SPEED, MIN_SCALE))
}

function handleZoomReset() {
  adjustCanvasToViewport()
  viewportTouched.value = false
}

function handleAddTextNode() {
  // Create node at center of visible viewport
  const container = canvasContainerRef.value
  if (!container) return
  const rect = container.getBoundingClientRect()
  const centerX = (rect.width / 2 - panOffsetX.value) / scale.value
  const centerY = (rect.height / 2 - panOffsetY.value) / scale.value

  const newNode = createTextNode(centerX, centerY)

  if (newNode) {
    // Wait for Vue to render the new node, then select it
    nextTick(() => {
      selectNode(newNode.id, false)
      drawEdges()
    })
  }
}

/** `execute` for the exposed API: the edges are painted by hand, so redraw them after a success. */
function executeAndRedraw(operation: CanvasOperation): OperationResult {
  const result = execute(operation)
  if (result.success) nextTick(() => drawEdges())
  return result
}

/** `executeBatch` for the exposed API, with the same redraw. */
function executeBatchAndRedraw(operations: CanvasOperation[]): OperationResult {
  const result = executeBatch(operations)
  if (result.success) nextTick(() => drawEdges())
  return result
}

/**
 * The imperative half of the contract, for hosts that drive the board from
 * outside — a command palette, a toolbar of their own, a save-triggered
 * refit. Everything here emits `change` like the built-in chrome. `execute`,
 * `executeBatch`, `undo` and `redo` refuse under `readonly`. The edges are
 * painted by hand, so a successful `execute` or `executeBatch` redraws them
 * once Vue has rendered the nodes.
 */
defineExpose({
  execute: executeAndRedraw,
  executeBatch: executeBatchAndRedraw,
  undo,
  redo,
  fitToView: handleZoomReset,
})
</script>
