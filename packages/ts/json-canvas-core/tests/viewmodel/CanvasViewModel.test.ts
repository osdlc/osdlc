import assert from 'node:assert/strict'
import { describe, expect, it, vi } from 'vitest'
import type { ICanvasContent, INode } from '../../src/types.ts'
import { CanvasViewModel } from '../../src/viewmodel/CanvasViewModel.ts'
import { DEFAULT_CONFIG } from '../../src/viewmodel/defaults.ts'

function createMockCanvas(
  nodes: INode[] = [],
  edges: ICanvasContent['edges'] = [],
): ICanvasContent {
  return { nodes, edges }
}

function createMockNode(id: string, x: number, y: number, width: number, height: number): INode {
  return { id, type: 'text', x, y, width, height, text: 'test' }
}

describe('CanvasViewModel', () => {
  describe('constructor', () => {
    it('should initialize with empty canvas', () => {
      const canvas = createMockCanvas()
      const vm = new CanvasViewModel(canvas)

      expect(vm.nodes).toEqual([])
      expect(vm.edges).toEqual([])
    })

    it('should use default config when none provided', () => {
      const canvas = createMockCanvas()
      const vm = new CanvasViewModel(canvas)

      expect(vm.config).toEqual(DEFAULT_CONFIG)
    })

    it('should merge partial config with defaults', () => {
      const canvas = createMockCanvas()
      const vm = new CanvasViewModel(canvas, { snapThreshold: 16 })

      expect(vm.config.snapThreshold).toBe(16)
      expect(vm.config.resizeBoundary).toBe(DEFAULT_CONFIG.resizeBoundary)
    })

    it('should initialize viewport at default values', () => {
      const canvas = createMockCanvas()
      const vm = new CanvasViewModel(canvas)

      expect(vm.scale).toBe(1)
      expect(vm.panX).toBe(0)
      expect(vm.panY).toBe(0)
      expect(vm.zoomPercent).toBe(100)
    })

    it('should initialize with empty selection', () => {
      const canvas = createMockCanvas()
      const vm = new CanvasViewModel(canvas)

      expect(vm.selectedNodeIds.size).toBe(0)
      expect(vm.selectedEdgeId).toBeNull()
      expect(vm.selectedNodes).toEqual([])
      expect(vm.selectedEdge).toBeNull()
    })
  })

  describe('canvas reference', () => {
    it('should return nodes from canvas', () => {
      const nodes = [createMockNode('n1', 0, 0, 100, 100)]
      const canvas = createMockCanvas(nodes)
      const vm = new CanvasViewModel(canvas)

      expect(vm.nodes).toEqual(nodes)
    })

    it('should return edges from canvas', () => {
      const edges = [
        {
          id: 'e1',
          fromNode: 'n1',
          toNode: 'n2',
          fromSide: 'right' as const,
          toSide: 'left' as const,
        },
      ]
      const canvas = createMockCanvas([], edges)
      const vm = new CanvasViewModel(canvas)

      expect(vm.edges).toEqual(edges)
    })

    it('should update canvas reference with setCanvas', () => {
      const canvas1 = createMockCanvas([createMockNode('n1', 0, 0, 100, 100)])
      const canvas2 = createMockCanvas([createMockNode('n2', 50, 50, 100, 100)])
      const vm = new CanvasViewModel(canvas1)

      expect(vm.nodes[0]?.id).toBe('n1')

      vm.setCanvas(canvas2)
      expect(vm.nodes[0]?.id).toBe('n2')
    })

    it('should drop selected node ids the new canvas no longer contains', () => {
      const canvas1 = createMockCanvas([
        createMockNode('n1', 0, 0, 100, 100),
        createMockNode('n2', 150, 0, 100, 100),
      ])
      const canvas2 = createMockCanvas([createMockNode('n1', 0, 0, 100, 100)])
      const vm = new CanvasViewModel(canvas1)
      vm.selectNodes(['n1', 'n2'])

      vm.setCanvas(canvas2)

      expect([...vm.selectedNodeIds]).toEqual(['n1'])
      expect(vm.isNodeSelected('n2')).toBe(false)
    })

    it('should clear a selected edge the new canvas no longer contains', () => {
      const edge = {
        id: 'e1',
        fromNode: 'n1',
        toNode: 'n2',
        fromSide: 'right' as const,
        toSide: 'left' as const,
      }
      const vm = new CanvasViewModel(createMockCanvas([], [edge]))
      vm.selectEdge('e1')

      vm.setCanvas(createMockCanvas())

      expect(vm.selectedEdgeId).toBeNull()
    })

    it('should emit selectionChange only when setCanvas drops selection', () => {
      const canvas1 = createMockCanvas([
        createMockNode('n1', 0, 0, 100, 100),
        createMockNode('n2', 150, 0, 100, 100),
      ])
      const vm = new CanvasViewModel(canvas1)
      vm.selectNode('n2')
      const callback = vi.fn()
      vm.on('selectionChange', callback)

      // Same ids present: a pure content swap must stay silent.
      vm.setCanvas(
        createMockCanvas([
          createMockNode('n1', 5, 5, 100, 100),
          createMockNode('n2', 155, 5, 100, 100),
        ]),
      )
      expect(callback).not.toHaveBeenCalled()

      vm.setCanvas(createMockCanvas([createMockNode('n1', 0, 0, 100, 100)]))
      expect(callback).toHaveBeenCalledTimes(1)
    })

    it('should emit canvasChange when setCanvas swaps in a new canvas', () => {
      const canvas1 = createMockCanvas([createMockNode('n1', 0, 0, 100, 100)])
      const vm = new CanvasViewModel(canvas1)
      vm.selectNode('n1')
      const callback = vi.fn()
      vm.on('canvasChange', callback)

      vm.setCanvas(canvas1)
      expect(callback).not.toHaveBeenCalled()

      // The selected node moved: selectedNodes now reads a different object.
      vm.setCanvas(createMockCanvas([createMockNode('n1', 300, 0, 100, 100)]))
      expect(callback).toHaveBeenCalledTimes(1)
      expect(vm.selectedNodes[0]?.x).toBe(300)
    })
  })

  describe('viewport', () => {
    describe('setScale', () => {
      it('should set scale within bounds', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        vm.setScale(1.5)
        expect(vm.scale).toBe(1.5)
        expect(vm.zoomPercent).toBe(150)
      })

      it('should clamp scale to minScale', () => {
        const vm = new CanvasViewModel(createMockCanvas(), { minScale: 0.5 })
        vm.setScale(0.1)
        expect(vm.scale).toBe(0.5)
      })

      it('should clamp scale to maxScale', () => {
        const vm = new CanvasViewModel(createMockCanvas(), { maxScale: 2.0 })
        vm.setScale(5.0)
        expect(vm.scale).toBe(2.0)
      })

      it('should emit viewportChange event', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        const callback = vi.fn()
        vm.on('viewportChange', callback)

        vm.setScale(1.5)
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should not emit if scale unchanged', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        const callback = vi.fn()
        vm.on('viewportChange', callback)

        vm.setScale(1) // Same as initial
        expect(callback).not.toHaveBeenCalled()
      })
    })

    describe('setPan', () => {
      it('should set pan values', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        vm.setPan(100, 200)

        expect(vm.panX).toBe(100)
        expect(vm.panY).toBe(200)
      })

      it('should emit viewportChange event', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        const callback = vi.fn()
        vm.on('viewportChange', callback)

        vm.setPan(100, 200)
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should not emit if pan unchanged', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        const callback = vi.fn()
        vm.on('viewportChange', callback)

        vm.setPan(0, 0) // Same as initial
        expect(callback).not.toHaveBeenCalled()
      })
    })

    describe('zoomIn/zoomOut', () => {
      it('should increase scale by zoomSpeed', () => {
        const vm = new CanvasViewModel(createMockCanvas(), { zoomSpeed: 0.1 })
        vm.zoomIn()
        expect(vm.scale).toBeCloseTo(1.1)
      })

      it('should decrease scale by zoomSpeed', () => {
        const vm = new CanvasViewModel(createMockCanvas(), { zoomSpeed: 0.1 })
        vm.zoomOut()
        expect(vm.scale).toBeCloseTo(0.9)
      })
    })

    describe('screenToCanvas', () => {
      it('should convert screen coords to canvas coords at scale 1', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        const point = vm.screenToCanvas(150, 200, 50, 100)

        expect(point.x).toBe(100) // 150 - 50 - 0
        expect(point.y).toBe(100) // 200 - 100 - 0
      })

      it('should account for pan offset', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        vm.setPan(50, 50)
        const point = vm.screenToCanvas(150, 200, 50, 100)

        expect(point.x).toBe(50) // (150 - 50 - 50) / 1
        expect(point.y).toBe(50) // (200 - 100 - 50) / 1
      })

      it('should account for scale', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        vm.setScale(2)
        const point = vm.screenToCanvas(150, 200, 50, 100)

        expect(point.x).toBe(50) // (150 - 50 - 0) / 2
        expect(point.y).toBe(50) // (200 - 100 - 0) / 2
      })
    })
  })

  describe('selection', () => {
    const createCanvasWithNodes = () =>
      createMockCanvas([
        createMockNode('n1', 0, 0, 100, 100),
        createMockNode('n2', 150, 0, 100, 100),
        createMockNode('n3', 0, 150, 100, 100),
      ])

    describe('selectNode', () => {
      it('should select a single node', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectNode('n1')

        expect(vm.selectedNodeIds.has('n1')).toBe(true)
        expect(vm.selectedNodeIds.size).toBe(1)
      })

      it('should clear previous selection by default', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectNode('n1')
        vm.selectNode('n2')

        expect(vm.selectedNodeIds.has('n1')).toBe(false)
        expect(vm.selectedNodeIds.has('n2')).toBe(true)
      })

      it('should add to selection when addToSelection is true', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectNode('n1')
        vm.selectNode('n2', true)

        expect(vm.selectedNodeIds.has('n1')).toBe(true)
        expect(vm.selectedNodeIds.has('n2')).toBe(true)
      })

      it('should clear edge selection', () => {
        const canvas = createMockCanvas(
          [createMockNode('n1', 0, 0, 100, 100)],
          [
            {
              id: 'e1',
              fromNode: 'n1',
              toNode: 'n2',
              fromSide: 'right',
              toSide: 'left',
            },
          ],
        )
        const vm = new CanvasViewModel(canvas)
        vm.selectEdge('e1')
        vm.selectNode('n1')

        expect(vm.selectedEdgeId).toBeNull()
      })

      it('should clear edge selection when adding to selection', () => {
        const edge = {
          id: 'e1',
          fromNode: 'n1',
          toNode: 'n2',
          fromSide: 'right' as const,
          toSide: 'left' as const,
        }
        const vm = new CanvasViewModel(createMockCanvas(createCanvasWithNodes().nodes, [edge]))
        vm.selectEdge('e1')
        vm.selectNode('n1', true)

        expect(vm.selectedEdgeId).toBeNull()
        expect([...vm.selectedNodeIds]).toEqual(['n1'])
      })

      it('should emit selectionChange event', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        const callback = vi.fn()
        vm.on('selectionChange', callback)

        vm.selectNode('n1')
        expect(callback).toHaveBeenCalledTimes(1)
      })
    })

    describe('selectNodes', () => {
      it('should select multiple nodes', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectNodes(['n1', 'n2'])

        expect(vm.selectedNodeIds.has('n1')).toBe(true)
        expect(vm.selectedNodeIds.has('n2')).toBe(true)
        expect(vm.selectedNodeIds.size).toBe(2)
      })

      it('should add to existing selection', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectNode('n1')
        vm.selectNodes(['n2', 'n3'], true)

        expect(vm.selectedNodeIds.size).toBe(3)
      })

      it('should clear edge selection when adding to selection', () => {
        const edge = {
          id: 'e1',
          fromNode: 'n1',
          toNode: 'n2',
          fromSide: 'right' as const,
          toSide: 'left' as const,
        }
        const vm = new CanvasViewModel(createMockCanvas(createCanvasWithNodes().nodes, [edge]))

        vm.selectEdge('e1')
        vm.selectNodes(['n1'], true)

        expect(vm.selectedEdgeId).toBeNull()
        expect([...vm.selectedNodeIds]).toEqual(['n1'])
      })
    })

    describe('selectEdge', () => {
      it('should select an edge', () => {
        const canvas = createMockCanvas(
          [],
          [
            {
              id: 'e1',
              fromNode: 'n1',
              toNode: 'n2',
              fromSide: 'right',
              toSide: 'left',
            },
          ],
        )
        const vm = new CanvasViewModel(canvas)
        vm.selectEdge('e1')

        expect(vm.selectedEdgeId).toBe('e1')
        expect(vm.selectedEdge?.id).toBe('e1')
      })

      it('should clear node selection', () => {
        const canvas = createMockCanvas(
          [createMockNode('n1', 0, 0, 100, 100)],
          [
            {
              id: 'e1',
              fromNode: 'n1',
              toNode: 'n2',
              fromSide: 'right',
              toSide: 'left',
            },
          ],
        )
        const vm = new CanvasViewModel(canvas)
        vm.selectNode('n1')
        vm.selectEdge('e1')

        expect(vm.selectedNodeIds.size).toBe(0)
      })
    })

    describe('toggleNodeSelection', () => {
      it('should add node if not selected', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.toggleNodeSelection('n1')

        expect(vm.selectedNodeIds.has('n1')).toBe(true)
      })

      it('should remove node if already selected', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectNode('n1')
        vm.toggleNodeSelection('n1')

        expect(vm.selectedNodeIds.has('n1')).toBe(false)
      })

      it('should clear edge selection', () => {
        const canvas = createMockCanvas(
          [createMockNode('n1', 0, 0, 100, 100)],
          [
            {
              id: 'e1',
              fromNode: 'n1',
              toNode: 'n2',
              fromSide: 'right',
              toSide: 'left',
            },
          ],
        )
        const vm = new CanvasViewModel(canvas)
        vm.selectEdge('e1')
        vm.toggleNodeSelection('n1')

        expect(vm.selectedEdgeId).toBeNull()
      })
    })

    describe('clearSelection', () => {
      it('should clear all selection', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectNodes(['n1', 'n2'])
        vm.clearSelection()

        expect(vm.selectedNodeIds.size).toBe(0)
        expect(vm.selectedEdgeId).toBeNull()
      })

      it('should emit selectionChange if there was selection', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectNode('n1')

        const callback = vi.fn()
        vm.on('selectionChange', callback)

        vm.clearSelection()
        expect(callback).toHaveBeenCalledTimes(1)
      })

      it('should not emit if already empty', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        const callback = vi.fn()
        vm.on('selectionChange', callback)

        vm.clearSelection()
        expect(callback).not.toHaveBeenCalled()
      })
    })

    describe('selectAll', () => {
      it('should select all nodes', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectAll()

        expect(vm.selectedNodeIds.size).toBe(3)
        expect(vm.selectedNodeIds.has('n1')).toBe(true)
        expect(vm.selectedNodeIds.has('n2')).toBe(true)
        expect(vm.selectedNodeIds.has('n3')).toBe(true)
      })
    })

    describe('selectNodesInRect', () => {
      it('should select nodes intersecting rectangle', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        // Rectangle covering n1 and n3 (left column)
        vm.selectNodesInRect({ x: -10, y: -10, width: 120, height: 300 })

        expect(vm.selectedNodeIds.has('n1')).toBe(true)
        expect(vm.selectedNodeIds.has('n2')).toBe(false)
        expect(vm.selectedNodeIds.has('n3')).toBe(true)
      })
    })

    describe('selectedNodes getter', () => {
      it('should return array of selected node objects', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectNodes(['n1', 'n3'])

        const selected = vm.selectedNodes
        expect(selected).toHaveLength(2)
        expect(selected.map((n) => n.id)).toContain('n1')
        expect(selected.map((n) => n.id)).toContain('n3')
      })
    })

    describe('isNodeSelected', () => {
      it('should return true for selected nodes', () => {
        const vm = new CanvasViewModel(createCanvasWithNodes())
        vm.selectNode('n1')

        expect(vm.isNodeSelected('n1')).toBe(true)
        expect(vm.isNodeSelected('n2')).toBe(false)
      })
    })
  })

  describe('query methods', () => {
    describe('findNodeAtPoint', () => {
      it('should find node containing point', () => {
        const canvas = createMockCanvas([createMockNode('n1', 100, 100, 200, 150)])
        const vm = new CanvasViewModel(canvas)

        const node = vm.findNodeAtPoint({ x: 150, y: 150 })
        expect(node?.id).toBe('n1')
      })

      it('should return null if no node at point', () => {
        const canvas = createMockCanvas([createMockNode('n1', 100, 100, 200, 150)])
        const vm = new CanvasViewModel(canvas)

        const node = vm.findNodeAtPoint({ x: 50, y: 50 })
        expect(node).toBeNull()
      })

      it('should return topmost node (last in array)', () => {
        const canvas = createMockCanvas([
          createMockNode('n1', 100, 100, 200, 150),
          createMockNode('n2', 150, 125, 100, 100), // Overlapping
        ])
        const vm = new CanvasViewModel(canvas)

        const node = vm.findNodeAtPoint({ x: 175, y: 150 })
        expect(node?.id).toBe('n2')
      })
    })

    describe('getResizeDirectionForNode', () => {
      it('should return resize direction near edge', () => {
        const canvas = createMockCanvas([createMockNode('n1', 100, 100, 200, 150)])
        const vm = new CanvasViewModel(canvas)
        const node = vm.nodes[0]
        assert.ok(node, 'the view model should expose n1')

        const direction = vm.getResizeDirectionForNode({ x: 100, y: 175 }, node)
        expect(direction).toBe('w')
      })

      it('should return null when not near edge', () => {
        const canvas = createMockCanvas([createMockNode('n1', 100, 100, 200, 150)])
        const vm = new CanvasViewModel(canvas)
        const node = vm.nodes[0]
        assert.ok(node, 'the view model should expose n1')

        const direction = vm.getResizeDirectionForNode({ x: 200, y: 175 }, node)
        expect(direction).toBeNull()
      })
    })

    describe('calculateSnapForDrag', () => {
      it('should return original deltas when snap disabled', () => {
        const vm = new CanvasViewModel(createMockCanvas(), {
          snapEnabled: false,
        })
        vm.selectNode('n1')

        const result = vm.calculateSnapForDrag(50, 30)
        expect(result.dx).toBe(50)
        expect(result.dy).toBe(30)
        expect(result.guides).toHaveLength(0)
      })

      it('should return original deltas when no selection', () => {
        const vm = new CanvasViewModel(createMockCanvas())

        const result = vm.calculateSnapForDrag(50, 30)
        expect(result.dx).toBe(50)
        expect(result.dy).toBe(30)
      })

      it('should calculate snap against non-selected nodes', () => {
        const canvas = createMockCanvas([
          createMockNode('n1', 0, 0, 100, 100),
          createMockNode('n2', 200, 0, 100, 100),
        ])
        const vm = new CanvasViewModel(canvas, { snapThreshold: 10 })
        vm.selectNode('n1')

        // Move n1 right, should snap to n2's left edge at 200
        // n1's right edge is at 100, moving by 95 puts it at 195
        // That's within 10px of 200, should snap to 200
        const result = vm.calculateSnapForDrag(95, 0)

        expect(result.dx).toBe(100) // Snapped to align right edge at 200
      })
    })

    describe('getNodeBoundingBox', () => {
      it('should return bounds of all nodes', () => {
        const canvas = createMockCanvas([
          createMockNode('n1', 0, 0, 100, 100),
          createMockNode('n2', 200, 150, 100, 100),
        ])
        const vm = new CanvasViewModel(canvas)

        const bounds = vm.getNodeBoundingBox()
        expect(bounds).toEqual({
          left: 0,
          top: 0,
          right: 300,
          bottom: 250,
          centerX: 150,
          centerY: 125,
          width: 300,
          height: 250,
        })
      })

      it('should return null for empty canvas', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        expect(vm.getNodeBoundingBox()).toBeNull()
      })
    })

    describe('getSelectionBoundingBox', () => {
      it('should return bounds of selected nodes only', () => {
        const canvas = createMockCanvas([
          createMockNode('n1', 0, 0, 100, 100),
          createMockNode('n2', 200, 150, 100, 100),
          createMockNode('n3', 500, 500, 100, 100),
        ])
        const vm = new CanvasViewModel(canvas)
        vm.selectNodes(['n1', 'n2'])

        const bounds = vm.getSelectionBoundingBox()
        expect(bounds?.right).toBe(300)
        expect(bounds?.bottom).toBe(250)
      })

      it('should return null when nothing selected', () => {
        const vm = new CanvasViewModel(createMockCanvas())
        expect(vm.getSelectionBoundingBox()).toBeNull()
      })
    })
  })

  describe('events', () => {
    it('should allow subscribing to events', () => {
      const vm = new CanvasViewModel(createMockCanvas())
      const callback = vi.fn()

      vm.on('selectionChange', callback)
      vm.selectNode('n1')

      expect(callback).toHaveBeenCalled()
    })

    it('should allow unsubscribing from events', () => {
      const vm = new CanvasViewModel(createMockCanvas())
      const callback = vi.fn()

      vm.on('selectionChange', callback)
      vm.off('selectionChange', callback)
      vm.selectNode('n1')

      expect(callback).not.toHaveBeenCalled()
    })

    it('should support multiple listeners', () => {
      const vm = new CanvasViewModel(createMockCanvas())
      const callback1 = vi.fn()
      const callback2 = vi.fn()

      vm.on('selectionChange', callback1)
      vm.on('selectionChange', callback2)
      vm.selectNode('n1')

      expect(callback1).toHaveBeenCalled()
      expect(callback2).toHaveBeenCalled()
    })

    it('should handle different event types independently', () => {
      const vm = new CanvasViewModel(createMockCanvas())
      const selectionCallback = vi.fn()
      const viewportCallback = vi.fn()

      vm.on('selectionChange', selectionCallback)
      vm.on('viewportChange', viewportCallback)

      vm.selectNode('n1')
      expect(selectionCallback).toHaveBeenCalledTimes(1)
      expect(viewportCallback).not.toHaveBeenCalled()

      vm.setScale(1.5)
      expect(selectionCallback).toHaveBeenCalledTimes(1)
      expect(viewportCallback).toHaveBeenCalledTimes(1)
    })
  })

  describe('method chaining', () => {
    it('should return this from viewport methods for chaining', () => {
      const vm = new CanvasViewModel(createMockCanvas())

      const result = vm.setScale(1.5).setPan(100, 200).zoomIn().zoomOut()

      expect(result).toBe(vm)
      expect(vm.scale).toBeCloseTo(1.5)
      expect(vm.panX).toBe(100)
      expect(vm.panY).toBe(200)
    })

    it('should return this from selection methods for chaining', () => {
      const canvas = createMockCanvas([
        createMockNode('n1', 0, 0, 100, 100),
        createMockNode('n2', 150, 0, 100, 100),
        createMockNode('n3', 0, 150, 100, 100),
      ])
      const vm = new CanvasViewModel(canvas)

      const result = vm.selectNode('n1').selectNode('n2', true).toggleNodeSelection('n1')

      expect(result).toBe(vm)
      expect(vm.selectedNodeIds.has('n1')).toBe(false)
      expect(vm.selectedNodeIds.has('n2')).toBe(true)
    })

    it('should return this from clearSelection for chaining', () => {
      const canvas = createMockCanvas([createMockNode('n1', 0, 0, 100, 100)])
      const vm = new CanvasViewModel(canvas)

      const result = vm.selectNode('n1').clearSelection().selectNode('n1')

      expect(result).toBe(vm)
      expect(vm.selectedNodeIds.size).toBe(1)
    })

    it('should return this from setCanvas for chaining', () => {
      const canvas1 = createMockCanvas([createMockNode('n1', 0, 0, 100, 100)])
      const canvas2 = createMockCanvas([createMockNode('n2', 50, 50, 100, 100)])
      const vm = new CanvasViewModel(canvas1)

      const result = vm.setCanvas(canvas2).selectNode('n2')

      expect(result).toBe(vm)
      expect(vm.nodes[0]?.id).toBe('n2')
    })

    it('should return this from event methods for chaining', () => {
      const vm = new CanvasViewModel(createMockCanvas())
      const callback = vi.fn()

      const result = vm.on('selectionChange', callback).off('selectionChange', callback)

      expect(result).toBe(vm)
    })

    it('should allow complex chained operations', () => {
      const canvas = createMockCanvas([
        createMockNode('n1', 0, 0, 100, 100),
        createMockNode('n2', 150, 0, 100, 100),
      ])
      const callback = vi.fn()

      const vm = new CanvasViewModel(canvas)
        .on('selectionChange', callback)
        .setScale(1.5)
        .setPan(50, 50)
        .selectNodes(['n1', 'n2'])

      expect(vm.scale).toBe(1.5)
      expect(vm.panX).toBe(50)
      expect(vm.selectedNodeIds.size).toBe(2)
      expect(callback).toHaveBeenCalled()
    })
  })
})
