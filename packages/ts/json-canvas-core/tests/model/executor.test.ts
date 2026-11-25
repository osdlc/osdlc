import assert from 'node:assert/strict'
import { describe, expect, it } from 'vitest'
import type { ICanvasContent, ITextNode } from '../../src/types.ts'
import { executeBatch, executeOperation, generateId } from '../../src/model/executor.ts'
import type {
  AlignNodesOperation,
  CreateEdgeOperation,
  CreateNodeOperation,
  DeleteEdgesOperation,
  DeleteNodesOperation,
  DistributeNodesOperation,
  DuplicateNodesOperation,
  MatchNodeSizeOperation,
  MoveNodesOperation,
  OperationResult,
  ResizeNodesOperation,
  UpdateEdgeOperation,
  UpdateNodeOperation,
} from '../../src/model/types.ts'

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

// =============================================================================
// generateId Tests
// =============================================================================

describe('generateId', () => {
  it('should generate unique IDs', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateId())
    }
    expect(ids.size).toBe(100)
  })

  it('should generate string IDs', () => {
    const id = generateId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })
})

// =============================================================================
// CreateNode Tests
// =============================================================================

describe('CreateNodeOperation', () => {
  it('should create a node with auto-generated ID', () => {
    const canvas = createEmptyCanvas()
    const op: CreateNodeOperation = {
      type: 'createNode',
      node: { type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hello' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes).toHaveLength(1)
      expect(result.created?.nodeIds).toHaveLength(1)
      expect((result.canvas.nodes[0] as ITextNode).text).toBe('Hello')
    }
  })

  it('should create a node with provided ID', () => {
    const canvas = createEmptyCanvas()
    const op: CreateNodeOperation = {
      type: 'createNode',
      node: {
        id: 'custom-id',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Hello',
      },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[0]?.id).toBe('custom-id')
      expect(result.created?.nodeIds).toEqual(['custom-id'])
    }
  })

  it('should not modify original canvas (immutability)', () => {
    const canvas = createEmptyCanvas()
    const op: CreateNodeOperation = {
      type: 'createNode',
      node: { type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hello' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    expect(canvas.nodes).toHaveLength(0) // Original unchanged
    if (result.success) {
      expect(result.canvas.nodes).toHaveLength(1) // New canvas has node
    }
  })

  it('should fail if ID already exists', () => {
    const canvas = createCanvasWithNodes()
    const op: CreateNodeOperation = {
      type: 'createNode',
      node: {
        id: 'node1',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Duplicate',
      },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('ID_ALREADY_EXISTS')
    }
  })

  it('should fail with invalid color', () => {
    const canvas = createEmptyCanvas()
    const op: CreateNodeOperation = {
      type: 'createNode',
      node: {
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Hello',
        color: 'invalid',
      },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_COLOR')
    }
  })

  it('should accept valid preset color', () => {
    const canvas = createEmptyCanvas()
    const op: CreateNodeOperation = {
      type: 'createNode',
      node: {
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'Hello',
        color: '3',
      },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
  })

  it('should fail with a non-finite position', () => {
    const canvas = createEmptyCanvas()
    const op: CreateNodeOperation = {
      type: 'createNode',
      node: {
        type: 'text',
        x: Number.NaN,
        y: 0,
        width: 100,
        height: 50,
        text: 'Hello',
      },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_POSITION')
    }
  })

  it('should fail with a non-positive width', () => {
    const canvas = createEmptyCanvas()
    const op: CreateNodeOperation = {
      type: 'createNode',
      node: {
        type: 'text',
        x: 0,
        y: 0,
        width: -50,
        height: 50,
        text: 'Hello',
      },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_DIMENSIONS')
    }
  })

  it('should fail with a non-finite height', () => {
    const canvas = createEmptyCanvas()
    const op: CreateNodeOperation = {
      type: 'createNode',
      node: {
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: Number.POSITIVE_INFINITY,
        text: 'Hello',
      },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_DIMENSIONS')
    }
  })
})

// =============================================================================
// DeleteNodes Tests
// =============================================================================

describe('DeleteNodesOperation', () => {
  it('should delete a single node', () => {
    const canvas = createCanvasWithNodes()
    const op: DeleteNodesOperation = {
      type: 'deleteNodes',
      nodeIds: ['node3'],
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes).toHaveLength(2)
      expect(result.canvas.nodes.find((n) => n.id === 'node3')).toBeUndefined()
    }
  })

  it('should delete multiple nodes', () => {
    const canvas = createCanvasWithNodes()
    const op: DeleteNodesOperation = {
      type: 'deleteNodes',
      nodeIds: ['node1', 'node3'],
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes).toHaveLength(1)
      expect(result.canvas.nodes[0]?.id).toBe('node2')
    }
  })

  it('should also delete connected edges', () => {
    const canvas = createCanvasWithNodes()
    const op: DeleteNodesOperation = {
      type: 'deleteNodes',
      nodeIds: ['node1'],
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.edges).toHaveLength(0) // edge1 connected to node1
    }
  })

  it('should fail if node not found', () => {
    const canvas = createCanvasWithNodes()
    const op: DeleteNodesOperation = {
      type: 'deleteNodes',
      nodeIds: ['nonexistent'],
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('NODE_NOT_FOUND')
    }
  })
})

// =============================================================================
// UpdateNode Tests
// =============================================================================

describe('UpdateNodeOperation', () => {
  it('should update node position', () => {
    const canvas = createCanvasWithNodes()
    const op: UpdateNodeOperation = {
      type: 'updateNode',
      nodeId: 'node1',
      updates: { x: 500, y: 300 },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[0]?.x).toBe(500)
      expect(result.canvas.nodes[0]?.y).toBe(300)
    }
  })

  it('should update node dimensions', () => {
    const canvas = createCanvasWithNodes()
    const op: UpdateNodeOperation = {
      type: 'updateNode',
      nodeId: 'node1',
      updates: { width: 200, height: 100 },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[0]?.width).toBe(200)
      expect(result.canvas.nodes[0]?.height).toBe(100)
    }
  })

  it('should fail if node not found', () => {
    const canvas = createCanvasWithNodes()
    const op: UpdateNodeOperation = {
      type: 'updateNode',
      nodeId: 'nonexistent',
      updates: { x: 100 },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('NODE_NOT_FOUND')
    }
  })

  it('should fail with invalid color', () => {
    const canvas = createCanvasWithNodes()
    const op: UpdateNodeOperation = {
      type: 'updateNode',
      nodeId: 'node1',
      updates: { color: 'bad-color' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_COLOR')
    }
  })

  it('should fail with non-positive width', () => {
    const canvas = createCanvasWithNodes()
    const op: UpdateNodeOperation = {
      type: 'updateNode',
      nodeId: 'node1',
      updates: { width: 0 },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_DIMENSIONS')
    }
  })

  it('should fail with NaN width', () => {
    const canvas = createCanvasWithNodes()
    const op: UpdateNodeOperation = {
      type: 'updateNode',
      nodeId: 'node1',
      updates: { width: Number.NaN },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_DIMENSIONS')
    }
  })

  it('should fail with infinite height', () => {
    const canvas = createCanvasWithNodes()
    const op: UpdateNodeOperation = {
      type: 'updateNode',
      nodeId: 'node1',
      updates: { height: Number.POSITIVE_INFINITY },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_DIMENSIONS')
    }
  })

  it('should fail rather than delete a required content field set to undefined', () => {
    const canvas = createCanvasWithNodes()
    // A real `undefined` in the payload is the input under test, and
    // exactOptionalPropertyTypes stops a typed caller writing it — so the same
    // cast the sibling test uses, for the same reason: this is the untyped
    // caller's shape, and the runtime has to survive it.
    const op = {
      type: 'updateNode',
      nodeId: 'node1',
      updates: { text: undefined },
    } as unknown as UpdateNodeOperation

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('VALIDATION_FAILED')
    }
    expect((canvas.nodes[0] as ITextNode).text).toBe('Node 1')
  })

  it('should judge the required content field against the type the update sets', () => {
    const canvas = createCanvasWithNodes()
    // `NodeUpdate` does not declare `type`, but untyped callers diff a node
    // into a plain record and send it — hence the cast.
    const op = {
      type: 'updateNode',
      nodeId: 'node1',
      updates: { type: 'link', url: 'https://example.com', text: undefined },
    } as unknown as UpdateNodeOperation

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[0]).toMatchObject({
        type: 'link',
        url: 'https://example.com',
      })
    }
  })

  it('should still clear an optional field set to undefined', () => {
    const canvas = createCanvasWithNodes()
    const first = canvas.nodes[0]
    assert.ok(first, 'the fixture canvas should contain node1')
    first.color = '3'

    // As above: an explicit `undefined` from an untyped caller, which is
    // precisely what this test asserts still clears the field.
    const op = {
      type: 'updateNode',
      nodeId: 'node1',
      updates: { color: undefined },
    } as unknown as UpdateNodeOperation

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[0]?.color).toBeUndefined()
    }
  })
})

// =============================================================================
// MoveNodes Tests
// =============================================================================

describe('MoveNodesOperation', () => {
  it('should move single node by delta', () => {
    const canvas = createCanvasWithNodes()
    const original = canvas.nodes[0]
    assert.ok(original, 'the fixture canvas should contain node1')
    const originalX = original.x
    const originalY = original.y

    const op: MoveNodesOperation = {
      type: 'moveNodes',
      nodeIds: ['node1'],
      deltaX: 50,
      deltaY: -30,
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[0]?.x).toBe(originalX + 50)
      expect(result.canvas.nodes[0]?.y).toBe(originalY - 30)
    }
  })

  it('should move multiple nodes together', () => {
    const canvas = createCanvasWithNodes()
    const op: MoveNodesOperation = {
      type: 'moveNodes',
      nodeIds: ['node1', 'node2'],
      deltaX: 100,
      deltaY: 100,
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[0]?.x).toBe(100)
      expect(result.canvas.nodes[1]?.x).toBe(250)
    }
  })

  it('should fail if any node not found', () => {
    const canvas = createCanvasWithNodes()
    const op: MoveNodesOperation = {
      type: 'moveNodes',
      nodeIds: ['node1', 'nonexistent'],
      deltaX: 10,
      deltaY: 10,
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('NODE_NOT_FOUND')
    }
  })
})

// =============================================================================
// ResizeNodes Tests
// =============================================================================

describe('ResizeNodesOperation', () => {
  it('should resize nodes to new dimensions', () => {
    const canvas = createCanvasWithNodes()
    const op: ResizeNodesOperation = {
      type: 'resizeNodes',
      nodeIds: ['node1', 'node2'],
      width: 200,
      height: 150,
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[0]?.width).toBe(200)
      expect(result.canvas.nodes[0]?.height).toBe(150)
      expect(result.canvas.nodes[1]?.width).toBe(200)
      expect(result.canvas.nodes[1]?.height).toBe(150)
    }
  })

  it('should fail with non-positive dimensions', () => {
    const canvas = createCanvasWithNodes()
    const op: ResizeNodesOperation = {
      type: 'resizeNodes',
      nodeIds: ['node1'],
      width: -10,
      height: 100,
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_DIMENSIONS')
    }
  })

  it('should fail with non-finite dimensions', () => {
    const canvas = createCanvasWithNodes()
    const op: ResizeNodesOperation = {
      type: 'resizeNodes',
      nodeIds: ['node1', 'node2'],
      width: Number.NaN,
      height: 100,
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_DIMENSIONS')
    }
  })
})

// =============================================================================
// AlignNodes Tests
// =============================================================================

describe('AlignNodesOperation', () => {
  it('should align nodes to left', () => {
    const canvas = createCanvasWithNodes()
    const op: AlignNodesOperation = {
      type: 'alignNodes',
      nodeIds: ['node1', 'node2', 'node3'],
      direction: 'left',
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[0]?.x).toBe(0)
      expect(result.canvas.nodes[1]?.x).toBe(0)
      expect(result.canvas.nodes[2]?.x).toBe(0)
    }
  })

  it('should align nodes to right', () => {
    const canvas = createCanvasWithNodes()
    const op: AlignNodesOperation = {
      type: 'alignNodes',
      nodeIds: ['node1', 'node2', 'node3'],
      direction: 'right',
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      // All nodes should end at the rightmost edge (node3 at 300 + 100 = 400)
      const [first, second, third] = result.canvas.nodes
      assert.ok(first, 'node1 should survive the align')
      assert.ok(second, 'node2 should survive the align')
      assert.ok(third, 'node3 should survive the align')
      expect(first.x + first.width).toBe(400)
      expect(second.x + second.width).toBe(400)
      expect(third.x + third.width).toBe(400)
    }
  })

  it('should fail with fewer than 2 nodes', () => {
    const canvas = createCanvasWithNodes()
    const op: AlignNodesOperation = {
      type: 'alignNodes',
      nodeIds: ['node1'],
      direction: 'left',
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INSUFFICIENT_NODES')
    }
  })
})

// =============================================================================
// DistributeNodes Tests
// =============================================================================

describe('DistributeNodesOperation', () => {
  it('should distribute nodes horizontally', () => {
    const canvas: ICanvasContent = {
      nodes: [
        {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          text: '1',
        },
        {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 0,
          width: 50,
          height: 50,
          text: '2',
        },
        {
          id: 'n3',
          type: 'text',
          x: 300,
          y: 0,
          width: 50,
          height: 50,
          text: '3',
        },
      ],
      edges: [],
    }

    const op: DistributeNodesOperation = {
      type: 'distributeNodes',
      nodeIds: ['n1', 'n2', 'n3'],
      direction: 'horizontal',
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      // First and last should stay in place, middle should be evenly distributed
      expect(result.canvas.nodes[0]?.x).toBe(0)
      expect(result.canvas.nodes[2]?.x).toBe(300)
    }
  })

  it('should fail with fewer than 3 nodes', () => {
    const canvas = createCanvasWithNodes()
    const op: DistributeNodesOperation = {
      type: 'distributeNodes',
      nodeIds: ['node1', 'node2'],
      direction: 'horizontal',
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INSUFFICIENT_NODES')
    }
  })
})

// =============================================================================
// MatchNodeSize Tests
// =============================================================================

describe('MatchNodeSizeOperation', () => {
  it('should match width to first node', () => {
    const canvas: ICanvasContent = {
      nodes: [
        {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: '1',
        },
        {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 0,
          width: 50,
          height: 50,
          text: '2',
        },
      ],
      edges: [],
    }

    const op: MatchNodeSizeOperation = {
      type: 'matchNodeSize',
      nodeIds: ['n1', 'n2'],
      dimension: 'width',
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[1]?.width).toBe(200)
      expect(result.canvas.nodes[1]?.height).toBe(50) // Unchanged
    }
  })

  it('should match both dimensions', () => {
    const canvas: ICanvasContent = {
      nodes: [
        {
          id: 'n1',
          type: 'text',
          x: 0,
          y: 0,
          width: 200,
          height: 100,
          text: '1',
        },
        {
          id: 'n2',
          type: 'text',
          x: 100,
          y: 0,
          width: 50,
          height: 50,
          text: '2',
        },
      ],
      edges: [],
    }

    const op: MatchNodeSizeOperation = {
      type: 'matchNodeSize',
      nodeIds: ['n1', 'n2'],
      dimension: 'both',
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes[1]?.width).toBe(200)
      expect(result.canvas.nodes[1]?.height).toBe(100)
    }
  })

  it('should fail with fewer than 2 nodes', () => {
    const canvas = createCanvasWithNodes()
    const op: MatchNodeSizeOperation = {
      type: 'matchNodeSize',
      nodeIds: ['node1'],
      dimension: 'width',
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INSUFFICIENT_NODES')
    }
  })
})

// =============================================================================
// DuplicateNodes Tests
// =============================================================================

describe('DuplicateNodesOperation', () => {
  it('should duplicate nodes with offset', () => {
    const canvas = createCanvasWithNodes()
    const initialCount = canvas.nodes.length

    const op: DuplicateNodesOperation = {
      type: 'duplicateNodes',
      nodeIds: ['node1', 'node2'],
      offsetX: 20,
      offsetY: 20,
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes).toHaveLength(initialCount + 2)
      expect(result.created?.nodeIds).toHaveLength(2)
      // Check offset
      const newNodeId = result.created?.nodeIds?.[0]
      const newNode = result.canvas.nodes.find((n) => n.id === newNodeId)
      expect(newNode?.x).toBe(20) // original was 0
      expect(newNode?.y).toBe(20) // original was 0
    }
  })

  it('should fail if node not found', () => {
    const canvas = createCanvasWithNodes()
    const op: DuplicateNodesOperation = {
      type: 'duplicateNodes',
      nodeIds: ['nonexistent'],
      offsetX: 10,
      offsetY: 10,
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('NODE_NOT_FOUND')
    }
  })
})

// =============================================================================
// CreateEdge Tests
// =============================================================================

describe('CreateEdgeOperation', () => {
  it('should create an edge with auto-generated ID', () => {
    const canvas = createCanvasWithNodes()
    const initialCount = canvas.edges.length

    const op: CreateEdgeOperation = {
      type: 'createEdge',
      edge: { fromNode: 'node2', toNode: 'node3' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.edges).toHaveLength(initialCount + 1)
      expect(result.created?.edgeIds).toHaveLength(1)
    }
  })

  it('should create an edge with provided ID', () => {
    const canvas = createCanvasWithNodes()

    const op: CreateEdgeOperation = {
      type: 'createEdge',
      edge: { id: 'custom-edge', fromNode: 'node2', toNode: 'node3' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      const newEdge = result.canvas.edges.find((e) => e.id === 'custom-edge')
      expect(newEdge).toBeDefined()
    }
  })

  it('should fail if ID already exists', () => {
    const canvas = createCanvasWithNodes()

    const op: CreateEdgeOperation = {
      type: 'createEdge',
      edge: { id: 'edge1', fromNode: 'node2', toNode: 'node3' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('ID_ALREADY_EXISTS')
    }
  })

  it('should fail if fromNode does not exist', () => {
    const canvas = createCanvasWithNodes()

    const op: CreateEdgeOperation = {
      type: 'createEdge',
      edge: { fromNode: 'nonexistent', toNode: 'node2' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_EDGE_ENDPOINT')
    }
  })

  it('should fail if toNode does not exist', () => {
    const canvas = createCanvasWithNodes()

    const op: CreateEdgeOperation = {
      type: 'createEdge',
      edge: { fromNode: 'node1', toNode: 'nonexistent' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_EDGE_ENDPOINT')
    }
  })
})

// =============================================================================
// DeleteEdges Tests
// =============================================================================

describe('DeleteEdgesOperation', () => {
  it('should delete edges', () => {
    const canvas = createCanvasWithNodes()

    const op: DeleteEdgesOperation = {
      type: 'deleteEdges',
      edgeIds: ['edge1'],
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.edges).toHaveLength(0)
    }
  })

  it('should fail if edge not found', () => {
    const canvas = createCanvasWithNodes()

    const op: DeleteEdgesOperation = {
      type: 'deleteEdges',
      edgeIds: ['nonexistent'],
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('EDGE_NOT_FOUND')
    }
  })
})

// =============================================================================
// UpdateEdge Tests
// =============================================================================

describe('UpdateEdgeOperation', () => {
  it('should update edge properties', () => {
    const canvas = createCanvasWithNodes()

    const op: UpdateEdgeOperation = {
      type: 'updateEdge',
      edgeId: 'edge1',
      updates: { label: 'Updated', color: '3' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.edges[0]?.label).toBe('Updated')
      expect(result.canvas.edges[0]?.color).toBe('3')
    }
  })

  it('should fail if edge not found', () => {
    const canvas = createCanvasWithNodes()

    const op: UpdateEdgeOperation = {
      type: 'updateEdge',
      edgeId: 'nonexistent',
      updates: { label: 'Test' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('EDGE_NOT_FOUND')
    }
  })

  it('should fail if updated fromNode does not exist', () => {
    const canvas = createCanvasWithNodes()

    const op: UpdateEdgeOperation = {
      type: 'updateEdge',
      edgeId: 'edge1',
      updates: { fromNode: 'nonexistent' },
    }

    const result = executeOperation(canvas, op)

    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.error.code).toBe('INVALID_EDGE_ENDPOINT')
    }
  })
})

// =============================================================================
// Batch Operation Tests
// =============================================================================

describe('BatchOperation', () => {
  it('should execute multiple operations in order', () => {
    const canvas = createEmptyCanvas()

    const result = executeBatch(canvas, [
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

    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.canvas.nodes).toHaveLength(2)
      expect(result.canvas.edges).toHaveLength(1)
    }
  })

  it('should stop on first failure and not modify canvas', () => {
    const canvas = createEmptyCanvas()

    const result = executeBatch(canvas, [
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
      { type: 'deleteNodes', nodeIds: ['nonexistent'] }, // This will fail
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

    expect(result.success).toBe(false)
    // Original canvas unchanged due to immutability
    expect(canvas.nodes).toHaveLength(0)
    if (!result.success) {
      expect(result.error.code).toBe('NODE_NOT_FOUND')
    }
  })
})

// =============================================================================
// Integration Tests
// =============================================================================

describe('Integration', () => {
  it('should handle complex workflow with immutable updates', () => {
    let canvas = createEmptyCanvas()

    // Create nodes
    let result: OperationResult = executeOperation(canvas, {
      type: 'createNode',
      node: {
        id: 'a',
        type: 'text',
        x: 0,
        y: 0,
        width: 100,
        height: 50,
        text: 'A',
      },
    })
    expect(result.success).toBe(true)
    if (result.success) canvas = result.canvas

    result = executeOperation(canvas, {
      type: 'createNode',
      node: {
        id: 'b',
        type: 'text',
        x: 200,
        y: 0,
        width: 100,
        height: 50,
        text: 'B',
      },
    })
    expect(result.success).toBe(true)
    if (result.success) canvas = result.canvas

    // Create edge
    result = executeOperation(canvas, {
      type: 'createEdge',
      edge: { fromNode: 'a', toNode: 'b' },
    })
    expect(result.success).toBe(true)
    if (result.success) canvas = result.canvas

    // Move nodes
    result = executeOperation(canvas, {
      type: 'moveNodes',
      nodeIds: ['a', 'b'],
      deltaX: 50,
      deltaY: 100,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      canvas = result.canvas
      expect(canvas.nodes[0]?.x).toBe(50)
      expect(canvas.nodes[0]?.y).toBe(100)
    }

    // Duplicate
    result = executeOperation(canvas, {
      type: 'duplicateNodes',
      nodeIds: ['a'],
      offsetX: 0,
      offsetY: 200,
    })
    expect(result.success).toBe(true)
    if (result.success) {
      canvas = result.canvas
      expect(canvas.nodes).toHaveLength(3)
    }

    // Delete original
    result = executeOperation(canvas, {
      type: 'deleteNodes',
      nodeIds: ['a'],
    })
    expect(result.success).toBe(true)
    if (result.success) {
      canvas = result.canvas
      expect(canvas.nodes).toHaveLength(2)
      // Edge should also be deleted
      expect(canvas.edges).toHaveLength(0)
    }
  })
})
