import { describe, expect, it } from 'vitest'
import type { ICanvasContent } from '../../src/types.ts'
import type {
  AlignNodesOperation,
  BatchOperation,
  CanvasOperation,
  CreateEdgeOperation,
  CreateNodeOperation,
  DeleteEdgesOperation,
  DeleteNodesOperation,
  DistributeNodesOperation,
  DuplicateNodesOperation,
  ErrorCode,
  MatchNodeSizeOperation,
  MoveNodesOperation,
  OperationError,
  OperationResult,
  ResizeNodesOperation,
  UpdateEdgeOperation,
  UpdateNodeOperation,
} from '../../src/model/types.ts'
import { failure, isOperationError, success } from '../../src/model/types.ts'

// =============================================================================
// Result Type Tests
// =============================================================================

describe('Result helpers', () => {
  const emptyCanvas: ICanvasContent = { nodes: [], edges: [] }

  describe('success', () => {
    it('should create a success result with canvas', () => {
      const result = success(emptyCanvas)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.canvas).toEqual(emptyCanvas)
      }
    })

    it('should include created IDs when provided', () => {
      const result = success(emptyCanvas, { nodeIds: ['test-123'] })
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.canvas).toEqual(emptyCanvas)
        expect(result.created?.nodeIds).toEqual(['test-123'])
      }
    })
  })

  describe('failure', () => {
    it('should create a failure result with error', () => {
      const result = failure('NODE_NOT_FOUND', 'Node with ID "abc" not found')
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.code).toBe('NODE_NOT_FOUND')
        expect(result.error.message).toBe('Node with ID "abc" not found')
        expect(result.error.details).toBeUndefined()
      }
    })

    it('should include details when provided', () => {
      const result = failure('VALIDATION_FAILED', 'Invalid operation', {
        field: 'color',
        value: 'invalid',
      })
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.details).toEqual({
          field: 'color',
          value: 'invalid',
        })
      }
    })
  })
})

describe('OperationResult type narrowing', () => {
  const emptyCanvas: ICanvasContent = { nodes: [], edges: [] }

  it('should narrow to success branch correctly', () => {
    const result: OperationResult = success(emptyCanvas)
    if (result.success) {
      // TypeScript should know canvas is ICanvasContent here
      const canvas: ICanvasContent = result.canvas
      expect(canvas).toEqual(emptyCanvas)
    }
  })

  it('should narrow to failure branch correctly', () => {
    const result: OperationResult = failure('INVALID_OPERATION', 'test')
    if (!result.success) {
      // TypeScript should know error exists here
      const error: OperationError = result.error
      expect(error.code).toBe('INVALID_OPERATION')
    }
  })
})

describe('isOperationError', () => {
  it('should return true for operation errors', () => {
    const error = { code: 'NODE_NOT_FOUND', message: 'Not found' }
    expect(isOperationError(error)).toBe(true)
  })

  it('should return false for regular errors', () => {
    const error = new Error('Something went wrong')
    expect(isOperationError(error)).toBe(false)
  })

  it('should return false for non-objects', () => {
    expect(isOperationError('string')).toBe(false)
    expect(isOperationError(42)).toBe(false)
    expect(isOperationError(null)).toBe(false)
    expect(isOperationError(undefined)).toBe(false)
  })
})

// =============================================================================
// Error Code Tests
// =============================================================================

describe('ErrorCode', () => {
  it('should accept all valid error codes', () => {
    const validCodes: ErrorCode[] = [
      'NODE_NOT_FOUND',
      'EDGE_NOT_FOUND',
      'ID_ALREADY_EXISTS',
      'INVALID_COLOR',
      'INVALID_POSITION',
      'INVALID_DIMENSIONS',
      'INVALID_NODE_TYPE',
      'INVALID_EDGE_ENDPOINT',
      'INVALID_OPERATION',
      'INSUFFICIENT_NODES',
      'VALIDATION_FAILED',
    ]
    expect(validCodes).toHaveLength(11)
  })
})

// =============================================================================
// Node Operation Type Tests
// =============================================================================

describe('Node operation types', () => {
  describe('CreateNodeOperation', () => {
    it('should allow node without id (auto-generated)', () => {
      const op: CreateNodeOperation = {
        type: 'createNode',
        node: {
          type: 'text',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          text: 'Hello',
        },
      }
      expect(op.type).toBe('createNode')
      expect(op.node.id).toBeUndefined()
    })

    it('should allow node with explicit id', () => {
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
      expect(op.node.id).toBe('custom-id')
    })
  })

  describe('DeleteNodesOperation', () => {
    it('should accept array of node IDs', () => {
      const op: DeleteNodesOperation = {
        type: 'deleteNodes',
        nodeIds: ['node1', 'node2', 'node3'],
      }
      expect(op.nodeIds).toHaveLength(3)
    })
  })

  describe('UpdateNodeOperation', () => {
    it('should allow partial updates', () => {
      const op: UpdateNodeOperation = {
        type: 'updateNode',
        nodeId: 'node1',
        updates: { x: 100, y: 200 },
      }
      expect(op.updates.x).toBe(100)
      expect(op.updates.width).toBeUndefined()
    })
  })

  describe('MoveNodesOperation', () => {
    it('should accept delta values', () => {
      const op: MoveNodesOperation = {
        type: 'moveNodes',
        nodeIds: ['node1', 'node2'],
        deltaX: 50,
        deltaY: -30,
      }
      expect(op.deltaX).toBe(50)
      expect(op.deltaY).toBe(-30)
    })
  })

  describe('ResizeNodesOperation', () => {
    it('should accept new dimensions', () => {
      const op: ResizeNodesOperation = {
        type: 'resizeNodes',
        nodeIds: ['node1'],
        width: 200,
        height: 150,
      }
      expect(op.width).toBe(200)
      expect(op.height).toBe(150)
    })
  })

  describe('AlignNodesOperation', () => {
    it('should accept all align directions', () => {
      const directions = ['left', 'right', 'top', 'bottom', 'center-h', 'center-v'] as const
      for (const direction of directions) {
        const op: AlignNodesOperation = {
          type: 'alignNodes',
          nodeIds: ['node1', 'node2'],
          direction,
        }
        expect(op.direction).toBe(direction)
      }
    })
  })

  describe('DistributeNodesOperation', () => {
    it('should accept horizontal and vertical directions', () => {
      const horizontal: DistributeNodesOperation = {
        type: 'distributeNodes',
        nodeIds: ['node1', 'node2', 'node3'],
        direction: 'horizontal',
      }
      expect(horizontal.direction).toBe('horizontal')

      const vertical: DistributeNodesOperation = {
        type: 'distributeNodes',
        nodeIds: ['node1', 'node2', 'node3'],
        direction: 'vertical',
      }
      expect(vertical.direction).toBe('vertical')
    })
  })

  describe('MatchNodeSizeOperation', () => {
    it('should accept width, height, and both dimensions', () => {
      const dimensions = ['width', 'height', 'both'] as const
      for (const dimension of dimensions) {
        const op: MatchNodeSizeOperation = {
          type: 'matchNodeSize',
          nodeIds: ['node1', 'node2'],
          dimension,
        }
        expect(op.dimension).toBe(dimension)
      }
    })
  })

  describe('DuplicateNodesOperation', () => {
    it('should accept offset values', () => {
      const op: DuplicateNodesOperation = {
        type: 'duplicateNodes',
        nodeIds: ['node1', 'node2'],
        offsetX: 20,
        offsetY: 20,
      }
      expect(op.offsetX).toBe(20)
      expect(op.offsetY).toBe(20)
    })
  })
})

// =============================================================================
// Edge Operation Type Tests
// =============================================================================

describe('Edge operation types', () => {
  describe('CreateEdgeOperation', () => {
    it('should allow edge without id (auto-generated)', () => {
      const op: CreateEdgeOperation = {
        type: 'createEdge',
        edge: {
          fromNode: 'node1',
          toNode: 'node2',
        },
      }
      expect(op.edge.id).toBeUndefined()
    })

    it('should allow edge with explicit id', () => {
      const op: CreateEdgeOperation = {
        type: 'createEdge',
        edge: {
          id: 'custom-edge-id',
          fromNode: 'node1',
          toNode: 'node2',
          fromSide: 'right',
          toSide: 'left',
        },
      }
      expect(op.edge.id).toBe('custom-edge-id')
    })
  })

  describe('DeleteEdgesOperation', () => {
    it('should accept array of edge IDs', () => {
      const op: DeleteEdgesOperation = {
        type: 'deleteEdges',
        edgeIds: ['edge1', 'edge2'],
      }
      expect(op.edgeIds).toHaveLength(2)
    })
  })

  describe('UpdateEdgeOperation', () => {
    it('should allow partial updates', () => {
      const op: UpdateEdgeOperation = {
        type: 'updateEdge',
        edgeId: 'edge1',
        updates: { color: '3', label: 'Updated' },
      }
      expect(op.updates.color).toBe('3')
      expect(op.updates.label).toBe('Updated')
    })
  })
})

// =============================================================================
// Batch Operation Tests
// =============================================================================

describe('BatchOperation', () => {
  it('should contain multiple operations', () => {
    const op: BatchOperation = {
      type: 'batch',
      operations: [
        { type: 'moveNodes', nodeIds: ['node1'], deltaX: 10, deltaY: 0 },
        { type: 'updateNode', nodeId: 'node1', updates: { color: '2' } },
      ],
    }
    expect(op.operations).toHaveLength(2)
  })

  it('should allow nested batch operations', () => {
    const op: BatchOperation = {
      type: 'batch',
      operations: [
        {
          type: 'batch',
          operations: [{ type: 'deleteNodes', nodeIds: ['node1'] }],
        },
      ],
    }
    expect(op.operations[0]?.type).toBe('batch')
  })
})

// =============================================================================
// CanvasOperation Union Tests
// =============================================================================

describe('CanvasOperation union', () => {
  it('should discriminate operation types in switch', () => {
    const operations: CanvasOperation[] = [
      {
        type: 'createNode',
        node: { type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hi' },
      },
      { type: 'deleteNodes', nodeIds: ['node1'] },
      { type: 'createEdge', edge: { fromNode: 'a', toNode: 'b' } },
      { type: 'batch', operations: [] },
    ]

    const types: string[] = []
    for (const op of operations) {
      switch (op.type) {
        case 'createNode':
          types.push('create-node')
          break
        case 'deleteNodes':
          types.push('delete-nodes')
          break
        case 'createEdge':
          types.push('create-edge')
          break
        case 'batch':
          types.push('batch')
          break
        default:
          types.push('other')
      }
    }

    expect(types).toEqual(['create-node', 'delete-nodes', 'create-edge', 'batch'])
  })
})
