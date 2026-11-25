import assert from 'node:assert/strict'
import { type ICanvasContent, isTextNode, type ITextNode } from '@osdlc/json-canvas-core'
import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { useCanvasOperations } from '../../src/composables/useCanvasOperations.ts'

// =============================================================================
// Test Helpers
// =============================================================================

function createEmptyCanvas(): ICanvasContent {
  return { nodes: [], edges: [] }
}

function createCanvasWithNodes(): ICanvasContent {
  return {
    nodes: [
      {
        id: 'node1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Node 1',
      },
      {
        id: 'node2',
        type: 'text',
        x: 150,
        y: 0,
        width: 100,
        height: 50,
        text: 'Node 2',
      },
    ],
    edges: [{ id: 'edge1', fromNode: 'node1', toNode: 'node2' }],
  }
}

/**
 * Create a text node for testing. Uses type assertion to work around
 * the Omit<INode, 'id'> type limitation with discriminated unions.
 */
function textNode(
  props: Partial<ITextNode> & {
    x: number
    y: number
    width: number
    height: number
    text: string
  },
) {
  return { type: 'text' as const, ...props } as Omit<ITextNode, 'id'> & {
    id?: string
  }
}

// =============================================================================
// Basic Setup Tests
// =============================================================================

describe('useCanvasOperations', () => {
  describe('initialization', () => {
    it('should initialize with provided canvas', () => {
      const initial = createEmptyCanvas()
      const { canvas } = useCanvasOperations(initial)

      expect(canvas.value.nodes).toEqual([])
      expect(canvas.value.edges).toEqual([])
    })

    it('should initialize with canUndo/canRedo as false', () => {
      const { canUndo, canRedo } = useCanvasOperations(createEmptyCanvas())

      expect(canUndo.value).toBe(false)
      expect(canRedo.value).toBe(false)
    })

    it('should initialize with null lastResult', () => {
      const { lastResult } = useCanvasOperations(createEmptyCanvas())

      expect(lastResult.value).toBeNull()
    })

    it('should initialize with zero stack sizes', () => {
      const { undoStackSize, redoStackSize } = useCanvasOperations(createEmptyCanvas())

      expect(undoStackSize.value).toBe(0)
      expect(redoStackSize.value).toBe(0)
    })
  })

  // =============================================================================
  // Execute Tests
  // =============================================================================

  describe('execute', () => {
    it('should execute createNode operation', () => {
      const { canvas, execute } = useCanvasOperations(createEmptyCanvas())

      const result = execute({
        type: 'createNode',
        node: textNode({ x: 0, y: 0, width: 100, height: 50, text: 'Test' }),
      })

      expect(result.success).toBe(true)
      expect(canvas.value.nodes).toHaveLength(1)
      expect(canvas.value.nodes[0]?.type).toBe('text')
    })

    it('should update lastResult after execute', () => {
      const { execute, lastResult } = useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({ x: 0, y: 0, width: 100, height: 50, text: 'Test' }),
      })

      expect(lastResult.value).not.toBeNull()
      expect(lastResult.value?.success).toBe(true)
    })

    it('should update canUndo after execute', () => {
      const { execute, canUndo } = useCanvasOperations(createEmptyCanvas())

      expect(canUndo.value).toBe(false)

      execute({
        type: 'createNode',
        node: textNode({ x: 0, y: 0, width: 100, height: 50, text: 'Test' }),
      })

      expect(canUndo.value).toBe(true)
    })

    it('should return error for invalid operation', () => {
      const { execute } = useCanvasOperations(createEmptyCanvas())

      const result = execute({
        type: 'deleteNodes',
        nodeIds: ['nonexistent'],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NODE_NOT_FOUND')
      }
    })
  })

  // =============================================================================
  // ExecuteBatch Tests
  // =============================================================================

  describe('executeBatch', () => {
    it('should execute multiple operations as single unit', () => {
      const { canvas, executeBatch, undoStackSize } = useCanvasOperations(createEmptyCanvas())

      const result = executeBatch([
        {
          type: 'createNode',
          node: textNode({
            id: 'n1',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            text: '1',
          }),
        },
        {
          type: 'createNode',
          node: textNode({
            id: 'n2',
            x: 100,
            y: 0,
            width: 100,
            height: 50,
            text: '2',
          }),
        },
        { type: 'createEdge', edge: { fromNode: 'n1', toNode: 'n2' } },
      ])

      expect(result.success).toBe(true)
      expect(canvas.value.nodes).toHaveLength(2)
      expect(canvas.value.edges).toHaveLength(1)
      expect(undoStackSize.value).toBe(1) // Single undo entry
    })

    it('should handle empty batch', () => {
      const { executeBatch, undoStackSize } = useCanvasOperations(createEmptyCanvas())

      const result = executeBatch([])

      expect(result.success).toBe(true)
      expect(undoStackSize.value).toBe(0)
    })
  })

  // =============================================================================
  // Undo/Redo Tests
  // =============================================================================

  describe('undo', () => {
    it('should undo the last operation', () => {
      const { canvas, execute, undo } = useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({ x: 0, y: 0, width: 100, height: 50, text: 'Test' }),
      })
      expect(canvas.value.nodes).toHaveLength(1)

      const result = undo()
      expect(result.success).toBe(true)
      expect(canvas.value.nodes).toHaveLength(0)
    })

    it('should update canUndo/canRedo after undo', () => {
      const { execute, undo, canUndo, canRedo } = useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({ x: 0, y: 0, width: 100, height: 50, text: 'Test' }),
      })
      expect(canUndo.value).toBe(true)
      expect(canRedo.value).toBe(false)

      undo()
      expect(canUndo.value).toBe(false)
      expect(canRedo.value).toBe(true)
    })

    it('should return error when nothing to undo', () => {
      const { undo } = useCanvasOperations(createEmptyCanvas())

      const result = undo()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_OPERATION')
      }
    })
  })

  describe('redo', () => {
    it('should redo an undone operation', () => {
      const { canvas, execute, undo, redo } = useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({
          id: 'n1',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Test',
        }),
      })
      undo()
      expect(canvas.value.nodes).toHaveLength(0)

      const result = redo()
      expect(result.success).toBe(true)
      expect(canvas.value.nodes).toHaveLength(1)
    })

    it('should clear redo stack when new operation is executed', () => {
      const { execute, undo, canRedo } = useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({
          id: 'n1',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Test',
        }),
      })
      undo()
      expect(canRedo.value).toBe(true)

      execute({
        type: 'createNode',
        node: textNode({
          id: 'n2',
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          text: 'New',
        }),
      })
      expect(canRedo.value).toBe(false)
    })

    it('should return error when nothing to redo', () => {
      const { redo } = useCanvasOperations(createEmptyCanvas())

      const result = redo()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_OPERATION')
      }
    })
  })

  // =============================================================================
  // Checkpoint/Revert Tests
  // =============================================================================

  describe('checkpoint and revertTo', () => {
    it('should create checkpoint and revert to it', () => {
      const { canvas, execute, checkpoint, revertTo } = useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({
          id: 'n1',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        }),
      })

      const cp = checkpoint()

      execute({
        type: 'createNode',
        node: textNode({
          id: 'n2',
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          text: '2',
        }),
      })
      execute({
        type: 'createNode',
        node: textNode({
          id: 'n3',
          x: 200,
          y: 0,
          width: 100,
          height: 50,
          text: '3',
        }),
      })
      expect(canvas.value.nodes).toHaveLength(3)

      const result = revertTo(cp)
      expect(result.success).toBe(true)
      expect(canvas.value.nodes).toHaveLength(1)
      expect(canvas.value.nodes[0]?.id).toBe('n1')
    })
  })

  // =============================================================================
  // Reset Tests
  // =============================================================================

  describe('reset', () => {
    it('should reset canvas to new state', () => {
      const { canvas, execute, reset, canUndo } = useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({ x: 0, y: 0, width: 100, height: 50, text: 'Test' }),
      })
      expect(canvas.value.nodes).toHaveLength(1)
      expect(canUndo.value).toBe(true)

      reset(createCanvasWithNodes())

      expect(canvas.value.nodes).toHaveLength(2)
      expect(canUndo.value).toBe(false)
    })

    it('should clear lastResult', () => {
      const { execute, reset, lastResult } = useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({ x: 0, y: 0, width: 100, height: 50, text: 'Test' }),
      })
      expect(lastResult.value).not.toBeNull()

      reset(createEmptyCanvas())
      expect(lastResult.value).toBeNull()
    })
  })

  // =============================================================================
  // Clear History Tests
  // =============================================================================

  describe('clearHistory', () => {
    it('should clear history without changing canvas', () => {
      const { canvas, execute, clearHistory, canUndo, undoStackSize } =
        useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({ x: 0, y: 0, width: 100, height: 50, text: 'Test' }),
      })
      expect(canvas.value.nodes).toHaveLength(1)
      expect(canUndo.value).toBe(true)

      clearHistory()

      expect(canvas.value.nodes).toHaveLength(1) // Canvas unchanged
      expect(canUndo.value).toBe(false)
      expect(undoStackSize.value).toBe(0)
    })
  })

  // =============================================================================
  // History Options Tests
  // =============================================================================

  describe('history options', () => {
    it('should respect maxSize option', () => {
      const { execute, undoStackSize } = useCanvasOperations(createEmptyCanvas(), { maxSize: 2 })

      execute({
        type: 'createNode',
        node: textNode({
          id: 'n1',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        }),
      })
      execute({
        type: 'createNode',
        node: textNode({
          id: 'n2',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '2',
        }),
      })
      execute({
        type: 'createNode',
        node: textNode({
          id: 'n3',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '3',
        }),
      })

      expect(undoStackSize.value).toBe(2)
    })
  })

  // =============================================================================
  // Reactivity Tests
  // =============================================================================

  describe('reactivity', () => {
    it('should trigger canvas reactivity after execute', async () => {
      const { canvas, execute } = useCanvasOperations(createEmptyCanvas())
      const initialLength = canvas.value.nodes.length

      execute({
        type: 'createNode',
        node: textNode({ x: 0, y: 0, width: 100, height: 50, text: 'Test' }),
      })

      await nextTick()
      expect(canvas.value.nodes.length).not.toBe(initialLength)
    })

    it('should trigger canvas reactivity after undo', async () => {
      const { canvas, execute, undo } = useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({ x: 0, y: 0, width: 100, height: 50, text: 'Test' }),
      })
      expect(canvas.value.nodes).toHaveLength(1)

      undo()

      await nextTick()
      expect(canvas.value.nodes).toHaveLength(0)
    })
  })

  // =============================================================================
  // Complex Workflow Tests
  // =============================================================================

  describe('complex workflows', () => {
    it('should handle batch undo correctly', () => {
      const { canvas, executeBatch, undo } = useCanvasOperations(createEmptyCanvas())

      executeBatch([
        {
          type: 'createNode',
          node: textNode({
            id: 'n1',
            x: 0,
            y: 0,
            width: 100,
            height: 50,
            text: '1',
          }),
        },
        {
          type: 'createNode',
          node: textNode({
            id: 'n2',
            x: 100,
            y: 0,
            width: 100,
            height: 50,
            text: '2',
          }),
        },
      ])
      expect(canvas.value.nodes).toHaveLength(2)

      undo()
      expect(canvas.value.nodes).toHaveLength(0) // Both undone at once
    })

    it('should preserve node data through undo/redo', () => {
      const { canvas, execute, undo, redo } = useCanvasOperations(createEmptyCanvas())

      execute({
        type: 'createNode',
        node: textNode({
          id: 'test-id',
          x: 42,
          y: 24,
          width: 100,
          height: 50,
          text: 'Hello',
          color: '3',
        }),
      })

      undo()
      redo()

      const node = canvas.value.nodes[0]
      // Asserted rather than cast: `as ITextNode` would hide the `| undefined`
      // and claim the node kind unchecked.
      assert.ok(node, 'undo then redo must restore the node')
      assert.ok(isTextNode(node), 'the restored node must still be a text node')
      expect(node.id).toBe('test-id')
      expect(node.x).toBe(42)
      expect(node.y).toBe(24)
      expect(node.text).toBe('Hello')
      expect(node.color).toBe('3')
    })
  })
})
