import assert from 'node:assert/strict'
import type { ICanvasContent, INode } from '@osdlc/json-canvas-core'
import { describe, expect, it } from 'vitest'
import { nextTick, watch, watchEffect } from 'vue'
import { useCanvasViewModel } from '../../src/composables/useCanvasViewModel.ts'

// =============================================================================
// Test Helpers
// =============================================================================

function createEmptyCanvas(): ICanvasContent {
  return { nodes: [], edges: [] }
}

function createMockNode(id: string, x: number, y: number, width: number, height: number): INode {
  return { id, type: 'text', x, y, width, height, text: 'test' }
}

function createCanvasWithNodes(): ICanvasContent {
  return {
    nodes: [
      createMockNode('n1', 0, 0, 100, 100),
      createMockNode('n2', 150, 0, 100, 100),
      createMockNode('n3', 0, 150, 100, 100),
    ],
    edges: [
      {
        id: 'e1',
        fromNode: 'n1',
        toNode: 'n2',
        fromSide: 'right',
        toSide: 'left',
      },
    ],
  }
}

// =============================================================================
// Initialization Tests
// =============================================================================

describe('useCanvasViewModel', () => {
  describe('initialization', () => {
    it('should initialize with default viewport values', () => {
      const { scale, panX, panY, zoomPercent } = useCanvasViewModel(createEmptyCanvas())

      expect(scale.value).toBe(1)
      expect(panX.value).toBe(0)
      expect(panY.value).toBe(0)
      expect(zoomPercent.value).toBe(100)
    })

    it('should initialize with empty selection', () => {
      const { selectedNodeIds, selectedEdgeId, selectedNodes, selectedEdge } =
        useCanvasViewModel(createEmptyCanvas())

      expect(selectedNodeIds.value.size).toBe(0)
      expect(selectedEdgeId.value).toBeNull()
      expect(selectedNodes.value).toEqual([])
      expect(selectedEdge.value).toBeNull()
    })

    it('should use default config when none provided', () => {
      const { config } = useCanvasViewModel(createEmptyCanvas())

      expect(config.snapThreshold).toBe(8)
      expect(config.resizeBoundary).toBe(8)
    })

    it('should merge custom config with defaults', () => {
      const { config } = useCanvasViewModel(createEmptyCanvas(), {
        snapThreshold: 16,
      })

      expect(config.snapThreshold).toBe(16)
      expect(config.resizeBoundary).toBe(8)
    })

    it('should expose the underlying viewModel', () => {
      const { viewModel } = useCanvasViewModel(createEmptyCanvas())

      expect(viewModel).toBeDefined()
      expect(viewModel.scale).toBe(1)
    })
  })

  // ===========================================================================
  // Viewport Tests
  // ===========================================================================

  describe('viewport', () => {
    it('should update scale reactively', async () => {
      const { scale, zoomPercent, setScale } = useCanvasViewModel(createEmptyCanvas())

      expect(scale.value).toBe(1)

      setScale(1.5)
      await nextTick()

      expect(scale.value).toBe(1.5)
      expect(zoomPercent.value).toBe(150)
    })

    it('should update pan reactively', async () => {
      const { panX, panY, setPan } = useCanvasViewModel(createEmptyCanvas())

      expect(panX.value).toBe(0)
      expect(panY.value).toBe(0)

      setPan(100, 200)
      await nextTick()

      expect(panX.value).toBe(100)
      expect(panY.value).toBe(200)
    })

    it('should zoom in and out', async () => {
      const { scale, zoomIn, zoomOut } = useCanvasViewModel(createEmptyCanvas(), { zoomSpeed: 0.1 })

      expect(scale.value).toBe(1)

      zoomIn()
      await nextTick()
      expect(scale.value).toBeCloseTo(1.1)

      zoomOut()
      await nextTick()
      expect(scale.value).toBeCloseTo(1.0)
    })

    it('should clamp scale to config bounds', async () => {
      const { scale, setScale } = useCanvasViewModel(createEmptyCanvas(), {
        minScale: 0.5,
        maxScale: 2.0,
      })

      setScale(0.1)
      await nextTick()
      expect(scale.value).toBe(0.5)

      setScale(5.0)
      await nextTick()
      expect(scale.value).toBe(2.0)
    })

    it('should convert screen to canvas coordinates', () => {
      const { screenToCanvas, setScale, setPan } = useCanvasViewModel(createEmptyCanvas())

      // At scale 1, pan 0
      let point = screenToCanvas(150, 200, 50, 100)
      expect(point.x).toBe(100)
      expect(point.y).toBe(100)

      // With pan
      setPan(50, 50)
      point = screenToCanvas(150, 200, 50, 100)
      expect(point.x).toBe(50)
      expect(point.y).toBe(50)

      // With scale
      setScale(2)
      point = screenToCanvas(150, 200, 50, 100)
      expect(point.x).toBe(25)
      expect(point.y).toBe(25)
    })
  })

  // ===========================================================================
  // Reactivity Tests
  // ===========================================================================

  describe('reactivity', () => {
    it('should notify a watcher on every selection change', async () => {
      const { selectedNodeIds, selectNode, clearSelection } =
        useCanvasViewModel(createCanvasWithNodes())

      const sizes: number[] = []
      const stop = watch(selectedNodeIds, (ids) => {
        sizes.push(ids.size)
      })

      selectNode('n1')
      await nextTick()
      selectNode('n2', true)
      await nextTick()
      clearSelection()
      await nextTick()
      stop()

      expect(sizes).toEqual([1, 2, 0])
    })

    it('should re-run an effect that reads the selection', async () => {
      const { selectedNodeIds, selectNode } = useCanvasViewModel(createCanvasWithNodes())

      let runs = 0
      const stop = watchEffect(() => {
        void selectedNodeIds.value.size
        runs++
      })
      expect(runs).toBe(1)

      selectNode('n1')
      await nextTick()
      stop()

      expect(runs).toBe(2)
    })
  })

  // ===========================================================================
  // Selection Tests
  // ===========================================================================

  describe('selection', () => {
    it('should select a node reactively', async () => {
      const { selectedNodeIds, selectedNodes, selectNode } =
        useCanvasViewModel(createCanvasWithNodes())

      expect(selectedNodeIds.value.size).toBe(0)

      selectNode('n1')
      await nextTick()

      expect(selectedNodeIds.value.has('n1')).toBe(true)
      expect(selectedNodes.value).toHaveLength(1)
      expect(selectedNodes.value[0]?.id).toBe('n1')
    })

    it('should select multiple nodes', async () => {
      const { selectedNodeIds, selectNodes } = useCanvasViewModel(createCanvasWithNodes())

      selectNodes(['n1', 'n2'])
      await nextTick()

      expect(selectedNodeIds.value.size).toBe(2)
      expect(selectedNodeIds.value.has('n1')).toBe(true)
      expect(selectedNodeIds.value.has('n2')).toBe(true)
    })

    it('should add to selection', async () => {
      const { selectedNodeIds, selectNode } = useCanvasViewModel(createCanvasWithNodes())

      selectNode('n1')
      selectNode('n2', true)
      await nextTick()

      expect(selectedNodeIds.value.size).toBe(2)
    })

    it('should select an edge reactively', async () => {
      const { selectedEdgeId, selectedEdge, selectEdge } =
        useCanvasViewModel(createCanvasWithNodes())

      expect(selectedEdgeId.value).toBeNull()

      selectEdge('e1')
      await nextTick()

      expect(selectedEdgeId.value).toBe('e1')
      expect(selectedEdge.value?.id).toBe('e1')
    })

    it('should clear selection when selecting edge', async () => {
      const { selectedNodeIds, selectedEdgeId, selectNode, selectEdge } =
        useCanvasViewModel(createCanvasWithNodes())

      selectNode('n1')
      await nextTick()
      expect(selectedNodeIds.value.size).toBe(1)

      selectEdge('e1')
      await nextTick()
      expect(selectedNodeIds.value.size).toBe(0)
      expect(selectedEdgeId.value).toBe('e1')
    })

    it('should toggle node selection', async () => {
      const { selectedNodeIds, toggleNodeSelection } = useCanvasViewModel(createCanvasWithNodes())

      toggleNodeSelection('n1')
      await nextTick()
      expect(selectedNodeIds.value.has('n1')).toBe(true)

      toggleNodeSelection('n1')
      await nextTick()
      expect(selectedNodeIds.value.has('n1')).toBe(false)
    })

    it('should clear selection', async () => {
      const { selectedNodeIds, selectNodes, clearSelection } =
        useCanvasViewModel(createCanvasWithNodes())

      selectNodes(['n1', 'n2', 'n3'])
      await nextTick()
      expect(selectedNodeIds.value.size).toBe(3)

      clearSelection()
      await nextTick()
      expect(selectedNodeIds.value.size).toBe(0)
    })

    it('should select all nodes', async () => {
      const { selectedNodeIds, selectAll } = useCanvasViewModel(createCanvasWithNodes())

      selectAll()
      await nextTick()

      expect(selectedNodeIds.value.size).toBe(3)
    })

    it('should select nodes in rect', async () => {
      const { selectedNodeIds, selectNodesInRect } = useCanvasViewModel(createCanvasWithNodes())

      // Select only left column (n1 and n3)
      selectNodesInRect({ x: -10, y: -10, width: 120, height: 300 })
      await nextTick()

      expect(selectedNodeIds.value.has('n1')).toBe(true)
      expect(selectedNodeIds.value.has('n2')).toBe(false)
      expect(selectedNodeIds.value.has('n3')).toBe(true)
    })

    it('should check if node is selected', () => {
      const { isNodeSelected, selectNode } = useCanvasViewModel(createCanvasWithNodes())

      expect(isNodeSelected('n1')).toBe(false)

      selectNode('n1')
      expect(isNodeSelected('n1')).toBe(true)
      expect(isNodeSelected('n2')).toBe(false)
    })
  })

  // ===========================================================================
  // Query Methods Tests
  // ===========================================================================

  describe('query methods', () => {
    it('should find node at point', () => {
      const { findNodeAtPoint } = useCanvasViewModel(createCanvasWithNodes())

      const node = findNodeAtPoint({ x: 50, y: 50 })
      expect(node?.id).toBe('n1')

      const noNode = findNodeAtPoint({ x: 500, y: 500 })
      expect(noNode).toBeNull()
    })

    it('should get resize direction for node', () => {
      const { viewModel, getResizeDirectionForNode } = useCanvasViewModel(createCanvasWithNodes())
      const node = viewModel.nodes[0]
      // Passed to a function that wants an `INode`, so chaining cannot carry
      // it — and the second expectation below is `toBeNull()`, which chaining
      // would have made pass on an absent node.
      assert.ok(node, 'the fixture canvas must have a first node')

      const direction = getResizeDirectionForNode({ x: 0, y: 50 }, node)
      expect(direction).toBe('w')

      const noDirection = getResizeDirectionForNode({ x: 50, y: 50 }, node)
      expect(noDirection).toBeNull()
    })

    it('should calculate snap for drag', () => {
      const { selectNode, calculateSnapForDrag } = useCanvasViewModel(createCanvasWithNodes(), {
        snapThreshold: 10,
      })

      selectNode('n1')
      // Moving n1 close to n2 (at x=150)
      const result = calculateSnapForDrag(145, 0)

      // Should snap to align with n2
      expect(result.dx).toBe(150)
    })

    it('should return original deltas when snap disabled', () => {
      const { selectNode, calculateSnapForDrag } = useCanvasViewModel(createCanvasWithNodes(), {
        snapEnabled: false,
      })

      selectNode('n1')
      const result = calculateSnapForDrag(50, 30)

      expect(result.dx).toBe(50)
      expect(result.dy).toBe(30)
    })

    it('should get node bounding box', () => {
      const { getNodeBoundingBox } = useCanvasViewModel(createCanvasWithNodes())

      const bounds = getNodeBoundingBox()
      expect(bounds).not.toBeNull()
      expect(bounds?.left).toBe(0)
      expect(bounds?.top).toBe(0)
      expect(bounds?.right).toBe(250) // n2's right edge
      expect(bounds?.bottom).toBe(250) // n3's bottom edge
    })

    it('should get selection bounding box', () => {
      const { selectNodes, getSelectionBoundingBox } = useCanvasViewModel(createCanvasWithNodes())

      selectNodes(['n1', 'n3'])
      const bounds = getSelectionBoundingBox()

      expect(bounds).not.toBeNull()
      expect(bounds?.left).toBe(0)
      expect(bounds?.right).toBe(100)
      expect(bounds?.bottom).toBe(250)
    })

    it('should return null for empty selection bounding box', () => {
      const { getSelectionBoundingBox } = useCanvasViewModel(createCanvasWithNodes())

      const bounds = getSelectionBoundingBox()
      expect(bounds).toBeNull()
    })
  })

  // ===========================================================================
  // Canvas Reference Tests
  // ===========================================================================

  describe('canvas reference', () => {
    it('should update canvas reference', () => {
      const { viewModel, setCanvas } = useCanvasViewModel(createCanvasWithNodes())

      expect(viewModel.nodes).toHaveLength(3)

      const newCanvas = createEmptyCanvas()
      setCanvas(newCanvas)

      expect(viewModel.nodes).toHaveLength(0)
    })

    it('should recompute the selected edge and nodes after a content swap', () => {
      const canvas = createCanvasWithNodes()
      const { selectedEdge, selectedNodes, selectEdge, selectNode, setCanvas } =
        useCanvasViewModel(canvas)

      selectEdge('e1')
      expect(selectedEdge.value?.color).toBeUndefined()
      // Same ids, new content: an edit to the selected edge.
      setCanvas({ ...canvas, edges: [{ ...canvas.edges[0]!, color: '2' }] })
      expect(selectedEdge.value?.color).toBe('2')

      selectNode('n1')
      expect(selectedNodes.value[0]?.x).toBe(0)
      setCanvas({
        ...canvas,
        nodes: canvas.nodes.map((n) => (n.id === 'n1' ? { ...n, x: 40 } : n)),
      })
      expect(selectedNodes.value[0]?.x).toBe(40)
    })

    it('should serve the new canvas objects from selectedNodes and selectedEdge after setCanvas', () => {
      const canvas = createCanvasWithNodes()
      const { selectNode, selectedNodes, selectedEdge, selectEdge, setCanvas } =
        useCanvasViewModel(canvas)

      selectNode('n1')
      expect(selectedNodes.value[0]?.x).toBe(0)

      // A move keeps n1 selected, so no selectionChange fires.
      setCanvas({
        ...canvas,
        nodes: canvas.nodes.map((n) => (n.id === 'n1' ? { ...n, x: 300 } : n)),
      })
      expect(selectedNodes.value[0]?.x).toBe(300)

      selectEdge('e1')
      expect(selectedEdge.value?.label).toBeUndefined()
      setCanvas({ ...canvas, edges: canvas.edges.map((e) => ({ ...e, label: 'moved' })) })
      expect(selectedEdge.value?.label).toBe('moved')
    })
  })
})
