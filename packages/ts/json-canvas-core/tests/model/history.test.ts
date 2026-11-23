import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import type { ICanvasContent, ITextNode } from '../../src/types.ts'
import { SnapshotHistory } from '../../src/model/history.ts'
import type { CanvasOperation } from '../../src/model/types.ts'

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
      {
        id: 'node3',
        type: 'text',
        x: 300,
        y: 0,
        width: 100,
        height: 50,
        text: 'Node 3',
      },
    ],
    edges: [{ id: 'edge1', fromNode: 'node1', toNode: 'node2' }],
  }
}

function addNode(history: SnapshotHistory, id: string): void {
  history.execute({
    type: 'createNode',
    node: { id, type: 'text', x: 0, y: 0, width: 100, height: 50, text: id },
  })
}

// =============================================================================
// Basic History Tests
// =============================================================================

describe('SnapshotHistory', () => {
  describe('basic operations', () => {
    it('should start with empty stacks', () => {
      const history = new SnapshotHistory(createEmptyCanvas())
      expect(history.canUndo()).toBe(false)
      expect(history.canRedo()).toBe(false)
      expect(history.undoSize).toBe(0)
      expect(history.redoSize).toBe(0)
    })

    it('should track executed operations', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      history.execute({
        type: 'createNode',
        node: {
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Test',
        },
      })

      expect(history.canUndo()).toBe(true)
      expect(history.canRedo()).toBe(false)
      expect(history.undoSize).toBe(1)
    })

    it('should clear redo stack when new operation is executed', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      // Execute, undo, then execute new
      history.execute({
        type: 'createNode',
        node: {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Test',
        },
      })
      history.undo()
      expect(history.canRedo()).toBe(true)

      history.execute({
        type: 'createNode',
        node: {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          text: 'New',
        },
      })
      expect(history.canRedo()).toBe(false)
    })

    it('should clear all history', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      history.execute({
        type: 'createNode',
        node: {
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Test',
        },
      })
      history.clear()

      expect(history.canUndo()).toBe(false)
      expect(history.undoSize).toBe(0)
    })
  })

  describe('max size limit', () => {
    it('should enforce max size with lazy pruning', () => {
      const history = new SnapshotHistory(createEmptyCanvas(), { maxSize: 2 })

      // With lazy pruning at 120%, we need to exceed threshold
      // maxSize=2, threshold=2.4 -> prunes at 3 operations
      history.execute({
        type: 'createNode',
        node: {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        },
      })
      history.execute({
        type: 'createNode',
        node: {
          id: 'n2',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '2',
        },
      })
      history.execute({
        type: 'createNode',
        node: {
          id: 'n3',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '3',
        },
      })

      // After pruning, should be back to maxSize
      expect(history.undoSize).toBe(2)
    })
  })
})

// =============================================================================
// Undo Tests
// =============================================================================

describe('Undo operations', () => {
  describe('createNode undo', () => {
    it('should undo createNode by restoring previous state', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      history.execute({
        type: 'createNode',
        node: {
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Test',
        },
      })
      expect(history.current.nodes).toHaveLength(1)

      history.undo()
      expect(history.current.nodes).toHaveLength(0)
    })
  })

  describe('deleteNodes undo', () => {
    it('should undo deleteNodes by restoring previous state', () => {
      const initialCanvas = createCanvasWithNodes()
      const history = new SnapshotHistory(initialCanvas)
      const originalNode = { ...initialCanvas.nodes[0] }

      history.execute({
        type: 'deleteNodes',
        nodeIds: ['node1'],
      })
      expect(history.current.nodes).toHaveLength(2)
      expect(history.current.edges).toHaveLength(0) // Edge connected to node1 deleted

      history.undo()
      expect(history.current.nodes).toHaveLength(3)
      expect(history.current.edges).toHaveLength(1) // Edge restored
      const restoredNode = history.current.nodes.find((n) => n.id === 'node1')
      expect(restoredNode).toMatchObject(originalNode)
    })
  })

  describe('updateNode undo', () => {
    it('should undo updateNode by restoring previous state', () => {
      const history = new SnapshotHistory(createCanvasWithNodes())

      history.execute({
        type: 'updateNode',
        nodeId: 'node1',
        updates: { x: 500, color: '3' },
      })
      const updated = history.current.nodes[0]
      assert.ok(updated, 'node1 should still be on the canvas after update')
      expect(updated.x).toBe(500)

      history.undo()
      const restored = history.current.nodes[0]
      assert.ok(restored, 'node1 should still be on the canvas after undo')
      expect(restored.x).toBe(0)
      expect(restored.color).toBeUndefined()
    })
  })

  describe('moveNodes undo', () => {
    it('should undo moveNodes by restoring previous state', () => {
      const history = new SnapshotHistory(createCanvasWithNodes())

      history.execute({
        type: 'moveNodes',
        nodeIds: ['node1', 'node2'],
        deltaX: 100,
        deltaY: 50,
      })
      expect(history.current.nodes[0]?.x).toBe(100)
      expect(history.current.nodes[0]?.y).toBe(50)

      history.undo()
      expect(history.current.nodes[0]?.x).toBe(0)
      expect(history.current.nodes[0]?.y).toBe(0)
    })
  })

  describe('resizeNodes undo', () => {
    it('should undo resizeNodes by restoring previous state', () => {
      const initialCanvas = createCanvasWithNodes()
      const history = new SnapshotHistory(initialCanvas)
      const original = initialCanvas.nodes[0]
      assert.ok(original, 'the fixture canvas should contain node1')
      const originalWidth = original.width
      const originalHeight = original.height

      history.execute({
        type: 'resizeNodes',
        nodeIds: ['node1'],
        width: 200,
        height: 150,
      })
      expect(history.current.nodes[0]?.width).toBe(200)
      expect(history.current.nodes[0]?.height).toBe(150)

      history.undo()
      expect(history.current.nodes[0]?.width).toBe(originalWidth)
      expect(history.current.nodes[0]?.height).toBe(originalHeight)
    })
  })

  describe('alignNodes undo', () => {
    it('should undo alignNodes by restoring previous state', () => {
      const initialCanvas = createCanvasWithNodes()
      const history = new SnapshotHistory(initialCanvas)
      const originalNode2 = initialCanvas.nodes[1]
      assert.ok(originalNode2, 'the fixture canvas should contain node2')
      const originalX = originalNode2.x

      history.execute({
        type: 'alignNodes',
        nodeIds: ['node1', 'node2', 'node3'],
        direction: 'left',
      })
      expect(history.current.nodes[1]?.x).toBe(0)

      history.undo()
      expect(history.current.nodes[1]?.x).toBe(originalX)
    })
  })

  describe('no-op operations', () => {
    it('should not record an undo step for an operation that changes nothing', () => {
      const history = new SnapshotHistory(createCanvasWithNodes())
      const align: CanvasOperation = {
        type: 'alignNodes',
        nodeIds: ['node1', 'node2', 'node3'],
        direction: 'left',
      }

      history.execute(align)
      expect(history.undoSize).toBe(1)

      const before = history.current
      const result = history.execute(align)
      expect(result.success).toBe(true)
      expect(history.current).toBe(before)
      expect(history.undoSize).toBe(1)
    })

    it('should keep the redo stack when an operation changes nothing', () => {
      const history = new SnapshotHistory(createCanvasWithNodes())
      addNode(history, 'extra')
      history.undo()
      expect(history.canRedo()).toBe(true)

      // node1 and node2 already share a size.
      history.execute({ type: 'matchNodeSize', nodeIds: ['node1', 'node2'], dimension: 'both' })
      expect(history.canRedo()).toBe(true)

      history.executeBatch([
        { type: 'alignNodes', nodeIds: ['node1', 'node2', 'node3'], direction: 'top' },
      ])
      expect(history.canRedo()).toBe(true)
    })
  })

  describe('duplicateNodes undo', () => {
    it('should undo duplicateNodes by restoring previous state', () => {
      const history = new SnapshotHistory(createCanvasWithNodes())

      history.execute({
        type: 'duplicateNodes',
        nodeIds: ['node1'],
        offsetX: 20,
        offsetY: 20,
      })
      expect(history.current.nodes).toHaveLength(4)

      history.undo()
      expect(history.current.nodes).toHaveLength(3)
    })
  })

  describe('createEdge undo', () => {
    it('should undo createEdge by restoring previous state', () => {
      const history = new SnapshotHistory(createCanvasWithNodes())

      history.execute({
        type: 'createEdge',
        edge: { fromNode: 'node2', toNode: 'node3' },
      })
      expect(history.current.edges).toHaveLength(2)

      history.undo()
      expect(history.current.edges).toHaveLength(1)
    })
  })

  describe('deleteEdges undo', () => {
    it('should undo deleteEdges by restoring previous state', () => {
      const history = new SnapshotHistory(createCanvasWithNodes())

      history.execute({
        type: 'deleteEdges',
        edgeIds: ['edge1'],
      })
      expect(history.current.edges).toHaveLength(0)

      history.undo()
      expect(history.current.edges).toHaveLength(1)
      expect(history.current.edges[0]?.id).toBe('edge1')
    })
  })

  describe('updateEdge undo', () => {
    it('should undo updateEdge by restoring previous state', () => {
      const history = new SnapshotHistory(createCanvasWithNodes())

      history.execute({
        type: 'updateEdge',
        edgeId: 'edge1',
        updates: { label: 'Updated', color: '2' },
      })
      const updatedEdge = history.current.edges[0]
      assert.ok(updatedEdge, 'edge1 should still be on the canvas after update')
      expect(updatedEdge.label).toBe('Updated')

      history.undo()
      const restoredEdge = history.current.edges[0]
      assert.ok(restoredEdge, 'edge1 should still be on the canvas after undo')
      expect(restoredEdge.label).toBeUndefined()
      expect(restoredEdge.color).toBeUndefined()
    })
  })

  describe('undo when nothing to undo', () => {
    it('should return error when nothing to undo', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      const result = history.undo()
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('INVALID_OPERATION')
      }
    })
  })
})

// =============================================================================
// Redo Tests
// =============================================================================

describe('Redo operations', () => {
  it('should redo an undone operation', () => {
    const history = new SnapshotHistory(createEmptyCanvas())

    history.execute({
      type: 'createNode',
      node: {
        id: 'n1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Test',
      },
    })
    history.undo()
    expect(history.current.nodes).toHaveLength(0)

    history.redo()
    expect(history.current.nodes).toHaveLength(1)
  })

  it('should support multiple undo/redo cycles', () => {
    const history = new SnapshotHistory(createEmptyCanvas())

    history.execute({
      type: 'createNode',
      node: {
        id: 'n1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Test',
      },
    })

    // Undo and redo multiple times
    for (let i = 0; i < 3; i++) {
      history.undo()
      expect(history.current.nodes).toHaveLength(0)
      history.redo()
      expect(history.current.nodes).toHaveLength(1)
    }
  })

  it('should return error when nothing to redo', () => {
    const history = new SnapshotHistory(createEmptyCanvas())

    const result = history.redo()
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_OPERATION')
    }
  })
})

// =============================================================================
// Batch Operations Tests
// =============================================================================

describe('Batch operations', () => {
  it('should execute batch as single undo unit', () => {
    const history = new SnapshotHistory(createEmptyCanvas())

    history.executeBatch([
      {
        type: 'createNode',
        node: {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        },
      },
      {
        type: 'createNode',
        node: {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          text: '2',
        },
      },
      { type: 'createEdge', edge: { fromNode: 'n1', toNode: 'n2' } },
    ])

    expect(history.current.nodes).toHaveLength(2)
    expect(history.current.edges).toHaveLength(1)
    expect(history.undoSize).toBe(1) // Single entry for entire batch

    history.undo()
    expect(history.current.nodes).toHaveLength(0)
    expect(history.current.edges).toHaveLength(0)
  })

  it('should handle empty batch', () => {
    const history = new SnapshotHistory(createEmptyCanvas())

    const result = history.executeBatch([])
    expect(result.success).toBe(true)
    expect(history.undoSize).toBe(0)
  })

  it('should report created IDs from every operation, not just the last', () => {
    const history = new SnapshotHistory(createEmptyCanvas())

    const result = history.executeBatch([
      {
        type: 'createNode',
        node: {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        },
      },
      {
        type: 'createNode',
        node: {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          text: '2',
        },
      },
    ])

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.created?.nodeIds).toEqual(['n1', 'n2'])
    }
  })
})

// =============================================================================
// Checkpoint Tests
// =============================================================================

describe('Checkpoint and revert', () => {
  it('should create checkpoint and revert to it', () => {
    const history = new SnapshotHistory(createEmptyCanvas())

    // Create initial node
    history.execute({
      type: 'createNode',
      node: {
        id: 'n1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: '1',
      },
    })

    // Create checkpoint
    const checkpoint = history.checkpoint()

    // Make more changes
    history.execute({
      type: 'createNode',
      node: {
        id: 'n2',
        type: 'text',
        x: 100,
        y: 0,
        width: 100,
        height: 50,
        text: '2',
      },
    })
    history.execute({
      type: 'createNode',
      node: {
        id: 'n3',
        type: 'text',
        x: 200,
        y: 0,
        width: 100,
        height: 50,
        text: '3',
      },
    })
    expect(history.current.nodes).toHaveLength(3)

    // Revert to checkpoint
    history.revertTo(checkpoint)
    expect(history.current.nodes).toHaveLength(1)
    expect(history.current.nodes[0]?.id).toBe('n1')
  })

  it('should handle revert to initial state', () => {
    const history = new SnapshotHistory(createEmptyCanvas())

    // Checkpoint at initial state
    const checkpoint = history.checkpoint()

    // Make changes
    history.execute({
      type: 'createNode',
      node: {
        id: 'n1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: '1',
      },
    })
    expect(history.current.nodes).toHaveLength(1)

    // Revert to initial
    history.revertTo(checkpoint)
    expect(history.current.nodes).toHaveLength(0)
  })

  it.each([NaN, 1.5, Infinity])('should fail when the checkpoint is %s', (value) => {
    const history = new SnapshotHistory(createEmptyCanvas())
    addNode(history, 'n1')

    const result = history.revertTo(value)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.code).toBe('INVALID_OPERATION')
    expect(history.undoSize).toBe(1)
  })

  it('should fail with invalid checkpoint', () => {
    const history = new SnapshotHistory(createEmptyCanvas())

    const result = history.revertTo(999)
    expect(result.success).toBe(false)
  })

  it('should still revert correctly after pruning drops older entries', () => {
    const history = new SnapshotHistory(createEmptyCanvas(), { maxSize: 2 })

    addNode(history, 'n1')
    addNode(history, 'n2')
    const checkpoint = history.checkpoint()
    // Trips the prune threshold, discarding the oldest past entry.
    addNode(history, 'n3')
    expect(history.current.nodes).toHaveLength(3)

    const result = history.revertTo(checkpoint)

    expect(result.success).toBe(true)
    expect(history.current.nodes.map((n) => n.id)).toEqual(['n1', 'n2'])
  })

  it('should fail a checkpoint whose state pruning has discarded', () => {
    const history = new SnapshotHistory(createEmptyCanvas(), { maxSize: 2 })

    const checkpoint = history.checkpoint()
    addNode(history, 'n1')
    addNode(history, 'n2')
    // Trips the prune threshold, discarding the checkpointed empty state.
    addNode(history, 'n3')

    const result = history.revertTo(checkpoint)

    expect(result.success).toBe(false)
    expect(history.current.nodes).toHaveLength(3)
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('Complex workflows', () => {
  it('should handle complex undo/redo sequence', () => {
    const history = new SnapshotHistory(createEmptyCanvas())

    // Create node
    history.execute({
      type: 'createNode',
      node: {
        id: 'n1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Start',
      },
    })

    // Move it
    history.execute({
      type: 'moveNodes',
      nodeIds: ['n1'],
      deltaX: 100,
      deltaY: 100,
    })

    // Update it
    history.execute({
      type: 'updateNode',
      nodeId: 'n1',
      updates: { text: 'Modified', color: '3' },
    })

    // Verify current state
    const modified = history.current.nodes[0]
    assert.ok(modified, 'n1 should still be on the canvas')
    expect(modified.x).toBe(100)
    expect(modified.y).toBe(100)
    expect((modified as ITextNode).text).toBe('Modified')
    expect(modified.color).toBe('3')

    // Undo update
    history.undo()
    const afterUndo = history.current.nodes[0]
    assert.ok(afterUndo, 'n1 should still be on the canvas after undo')
    expect((afterUndo as ITextNode).text).toBe('Start')
    expect(afterUndo.color).toBeUndefined()

    // Undo move
    history.undo()
    expect(history.current.nodes[0]?.x).toBe(0)
    expect(history.current.nodes[0]?.y).toBe(0)

    // Redo move
    history.redo()
    expect(history.current.nodes[0]?.x).toBe(100)

    // Redo update
    history.redo()
    expect((history.current.nodes[0] as ITextNode).text).toBe('Modified')
  })

  it('should correctly handle node deletion with connected edges', () => {
    const canvas: ICanvasContent = {
      nodes: [
        {
          id: 'a',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'A',
        },
        {
          id: 'b',
          type: 'text',
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          text: 'B',
        },
        {
          id: 'c',
          type: 'text',
          x: 200,
          y: 0,
          width: 100,
          height: 50,
          text: 'C',
        },
      ],
      edges: [
        { id: 'e1', fromNode: 'a', toNode: 'b' },
        { id: 'e2', fromNode: 'b', toNode: 'c' },
      ],
    }
    const history = new SnapshotHistory(canvas)

    // Delete middle node (should remove both edges)
    history.execute({
      type: 'deleteNodes',
      nodeIds: ['b'],
    })
    expect(history.current.nodes).toHaveLength(2)
    expect(history.current.edges).toHaveLength(0)

    // Undo should restore node and both edges
    history.undo()
    expect(history.current.nodes).toHaveLength(3)
    expect(history.current.edges).toHaveLength(2)
  })

  it('should maintain immutability - original canvas unchanged', () => {
    const originalCanvas = createCanvasWithNodes()
    const history = new SnapshotHistory(originalCanvas)

    history.execute({
      type: 'moveNodes',
      nodeIds: ['node1'],
      deltaX: 100,
      deltaY: 100,
    })

    // Original canvas should be unchanged
    expect(originalCanvas.nodes[0]?.x).toBe(0)
    expect(originalCanvas.nodes[0]?.y).toBe(0)

    // History current should have the new values
    expect(history.current.nodes[0]?.x).toBe(100)
    expect(history.current.nodes[0]?.y).toBe(100)
  })
})

// =============================================================================
// History Entries Tests
// =============================================================================

describe('History entries', () => {
  describe('getEntries', () => {
    it('should return single entry for initial state', () => {
      const history = new SnapshotHistory(createEmptyCanvas())
      const entries = history.getEntries()

      expect(entries).toHaveLength(1)
      expect(entries[0]?.index).toBe(0)
      expect(entries[0]?.isCurrent).toBe(true)
      expect(entries[0]?.position).toBe('current')
      expect(entries[0]?.summary).toBe('0 nodes, 0 edges')
    })

    it('should return entries with past states', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      history.execute({
        type: 'createNode',
        node: {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        },
      })

      history.execute({
        type: 'createNode',
        node: {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          text: '2',
        },
      })

      const entries = history.getEntries()

      expect(entries).toHaveLength(3)

      // Past entries
      expect(entries[0]?.index).toBe(0)
      expect(entries[0]?.position).toBe('past')
      expect(entries[0]?.summary).toBe('0 nodes, 0 edges')

      expect(entries[1]?.index).toBe(1)
      expect(entries[1]?.position).toBe('past')
      expect(entries[1]?.summary).toBe('1 nodes, 0 edges')

      // Current entry
      expect(entries[2]?.index).toBe(2)
      expect(entries[2]?.isCurrent).toBe(true)
      expect(entries[2]?.position).toBe('current')
      expect(entries[2]?.summary).toBe('2 nodes, 0 edges')
    })

    it('should return entries with future states after undo', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      history.execute({
        type: 'createNode',
        node: {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        },
      })

      history.execute({
        type: 'createNode',
        node: {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          text: '2',
        },
      })

      // Undo once
      history.undo()

      const entries = history.getEntries()

      expect(entries).toHaveLength(3)

      // Past entry
      expect(entries[0]?.index).toBe(0)
      expect(entries[0]?.position).toBe('past')

      // Current entry (now at index 1)
      expect(entries[1]?.index).toBe(1)
      expect(entries[1]?.isCurrent).toBe(true)
      expect(entries[1]?.position).toBe('current')

      // Future entry
      expect(entries[2]?.index).toBe(2)
      expect(entries[2]?.isCurrent).toBe(false)
      expect(entries[2]?.position).toBe('future')
    })
  })

  describe('goToEntry', () => {
    it('should go to a past entry', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      history.execute({
        type: 'createNode',
        node: {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        },
      })

      history.execute({
        type: 'createNode',
        node: {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          text: '2',
        },
      })

      expect(history.current.nodes).toHaveLength(2)

      // Go back to index 0 (initial empty state)
      const result = history.goToEntry(0)
      expect(result.success).toBe(true)
      expect(history.current.nodes).toHaveLength(0)

      // Verify entries updated correctly
      const entries = history.getEntries()
      expect(entries[0]?.isCurrent).toBe(true)
      expect(entries[0]?.position).toBe('current')
      expect(entries[1]?.position).toBe('future')
      expect(entries[2]?.position).toBe('future')
    })

    it('should go to a future entry', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      history.execute({
        type: 'createNode',
        node: {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        },
      })

      history.execute({
        type: 'createNode',
        node: {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 0,
          width: 100,
          height: 50,
          text: '2',
        },
      })

      // Go back to start
      history.goToEntry(0)
      expect(history.current.nodes).toHaveLength(0)

      // Go forward to index 2
      const result = history.goToEntry(2)
      expect(result.success).toBe(true)
      expect(history.current.nodes).toHaveLength(2)
    })

    it('should stay at current entry when index matches', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      history.execute({
        type: 'createNode',
        node: {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        },
      })

      // Current is at index 1
      const result = history.goToEntry(1)
      expect(result.success).toBe(true)
      expect(history.current.nodes).toHaveLength(1)
    })

    it('should fail with invalid index', () => {
      const history = new SnapshotHistory(createEmptyCanvas())

      history.execute({
        type: 'createNode',
        node: {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: '1',
        },
      })

      // Try negative index
      let result = history.goToEntry(-1)
      expect(result.success).toBe(false)

      // Try index beyond total entries
      result = history.goToEntry(999)
      expect(result.success).toBe(false)
    })

    it.each([NaN, 1.5, Infinity])('should fail when the index is %s', (value) => {
      const history = new SnapshotHistory(createEmptyCanvas())
      addNode(history, 'n1')
      addNode(history, 'n2')

      const result = history.goToEntry(value)
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.code).toBe('INVALID_OPERATION')
      expect(history.undoSize).toBe(2)
    })
  })
})

describe('Operations that change nothing', () => {
  function alignedPair(): ICanvasContent {
    return {
      nodes: [
        { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'A' } as ITextNode,
        { id: 'b', type: 'text', x: 0, y: 100, width: 100, height: 50, text: 'B' } as ITextNode,
      ],
      edges: [],
    }
  }

  it('execute records no undo step and keeps the redo stack', () => {
    const history = new SnapshotHistory(alignedPair())
    history.execute({ type: 'moveNodes', nodeIds: ['b'], deltaX: 10, deltaY: 0 })
    history.undo()
    expect(history.canRedo()).toBe(true)
    const before = history.current

    // Both nodes already sit at x=0, so aligning left is a no-op.
    const result = history.execute({ type: 'alignNodes', nodeIds: ['a', 'b'], direction: 'left' })
    assert(result.success)
    expect(result.canvas).toBe(before)
    expect(history.undoSize).toBe(0)
    expect(history.canRedo()).toBe(true)
  })

  it('executeBatch records no undo step and keeps the redo stack', () => {
    const history = new SnapshotHistory(alignedPair())
    history.execute({ type: 'moveNodes', nodeIds: ['b'], deltaX: 10, deltaY: 0 })
    history.undo()

    const result = history.executeBatch([
      { type: 'alignNodes', nodeIds: ['a', 'b'], direction: 'left' },
    ])
    expect(result.success).toBe(true)
    expect(history.undoSize).toBe(0)
    expect(history.canRedo()).toBe(true)
  })
})
