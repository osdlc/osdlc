import { describe, expect, it } from 'vitest'
import { executeBatch, executeOperation } from '../../src/model/executor.ts'
import type { CanvasOperation } from '../../src/model/types.ts'
import type { ICanvasContent, INode } from '../../src/types.ts'

const node = (id: string, x: number, y: number, width = 100, height = 50): INode => ({
  id,
  type: 'text',
  x,
  y,
  width,
  height,
  text: id,
})

/** Three nodes of different sizes, spread on both axes, with an edge between the first two. */
function canvas(): ICanvasContent {
  return {
    nodes: [node('a', 0, 0, 100, 40), node('b', 200, 100, 60, 80), node('c', 500, 300, 100, 20)],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
  }
}

const ids = ['a', 'b', 'c']

function nodesOf(result: ReturnType<typeof executeOperation>): INode[] {
  if (!result.success) throw new Error(result.error.message)
  return result.canvas.nodes
}

describe('alignNodes', () => {
  it('aligns bottom edges to the lowest one', () => {
    const nodes = nodesOf(
      executeOperation(canvas(), { type: 'alignNodes', nodeIds: ids, direction: 'bottom' }),
    )
    // The lowest bottom edge is node c's: 300 + 20.
    expect(nodes.map((n) => n.y + n.height)).toEqual([320, 320, 320])
  })

  it('aligns top edges to the highest one', () => {
    const nodes = nodesOf(
      executeOperation(canvas(), { type: 'alignNodes', nodeIds: ids, direction: 'top' }),
    )
    expect(nodes.map((n) => n.y)).toEqual([0, 0, 0])
  })

  it('centres horizontally on the mean of the centres', () => {
    const nodes = nodesOf(
      executeOperation(canvas(), { type: 'alignNodes', nodeIds: ids, direction: 'center-h' }),
    )
    // Centres 50, 230 and 550 average 276.67.
    const centres = nodes.map((n) => n.x + n.width / 2)
    for (const centre of centres) expect(centre).toBeCloseTo(830 / 3)
    expect(nodes.map((n) => n.y)).toEqual([0, 100, 300])
  })

  it('centres vertically on the mean of the centres', () => {
    const nodes = nodesOf(
      executeOperation(canvas(), { type: 'alignNodes', nodeIds: ids, direction: 'center-v' }),
    )
    // Centres 20, 140 and 310 average 156.67.
    const centres = nodes.map((n) => n.y + n.height / 2)
    for (const centre of centres) expect(centre).toBeCloseTo(470 / 3)
    expect(nodes.map((n) => n.x)).toEqual([0, 200, 500])
  })

  it('fails when a node is missing', () => {
    const result = executeOperation(canvas(), {
      type: 'alignNodes',
      nodeIds: ['a', 'nope'],
      direction: 'left',
    })
    expect(result).toMatchObject({ success: false, error: { code: 'NODE_NOT_FOUND' } })
  })
})

describe('distributeNodes', () => {
  it('spreads vertically with equal gaps, whatever the order of ids', () => {
    const nodes = nodesOf(
      executeOperation(canvas(), {
        type: 'distributeNodes',
        nodeIds: ['c', 'a', 'b'],
        direction: 'vertical',
      }),
    )
    const [a, b, c] = nodes
    // The span is 0 to 320, the heights add up to 140, so each gap is 90.
    expect(a?.y).toBe(0)
    expect(b?.y).toBe(40 + 90)
    expect(c?.y).toBe(300)
    expect((b?.y ?? 0) - ((a?.y ?? 0) + (a?.height ?? 0))).toBe(90)
    expect((c?.y ?? 0) - ((b?.y ?? 0) + (b?.height ?? 0))).toBe(90)
  })

  it('fails when a node is missing', () => {
    const result = executeOperation(canvas(), {
      type: 'distributeNodes',
      nodeIds: ['a', 'b', 'nope'],
      direction: 'vertical',
    })
    expect(result).toMatchObject({ success: false, error: { code: 'NODE_NOT_FOUND' } })
  })

  it('fails with fewer than 3 nodes in the vertical direction too', () => {
    const result = executeOperation(canvas(), {
      type: 'distributeNodes',
      nodeIds: ['a', 'b'],
      direction: 'vertical',
    })
    expect(result).toMatchObject({ success: false, error: { code: 'INSUFFICIENT_NODES' } })
  })
})

describe('a batch runs every operation type', () => {
  it('applies the node arrangement operations in order', () => {
    const operations: CanvasOperation[] = [
      { type: 'alignNodes', nodeIds: ids, direction: 'left' },
      { type: 'distributeNodes', nodeIds: ids, direction: 'vertical' },
      { type: 'matchNodeSize', nodeIds: ids, dimension: 'width' },
      { type: 'moveNodes', nodeIds: ['a'], deltaX: 5, deltaY: 5 },
      { type: 'resizeNodes', nodeIds: ['b'], width: 10, height: 10 },
      { type: 'updateNode', nodeId: 'c', updates: { color: '2' } },
    ]
    const result = executeBatch(canvas(), operations)

    expect(result.success).toBe(true)
    if (!result.success) return
    const [a, b, c] = result.canvas.nodes
    expect(a).toMatchObject({ x: 5, y: 5, width: 100 })
    expect(b).toMatchObject({ x: 0, width: 10, height: 10 })
    expect(c).toMatchObject({ x: 0, y: 300, width: 100, color: '2' })
  })

  it('collects the ids that duplicate and the edge operations create', () => {
    const result = executeBatch(canvas(), [
      { type: 'duplicateNodes', nodeIds: ['a', 'b'], offsetX: 10, offsetY: 10 },
      { type: 'createEdge', edge: { id: 'e2', fromNode: 'b', toNode: 'c' } },
      { type: 'updateEdge', edgeId: 'e2', updates: { label: 'two' } },
      { type: 'deleteEdges', edgeIds: ['e'] },
      { type: 'deleteNodes', nodeIds: ['c'] },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    // Two copies were created. Deleting node c took edge e2 with it.
    expect(result.created?.nodeIds).toHaveLength(2)
    expect(result.created?.edgeIds).toEqual(['e2'])
    expect(result.canvas.nodes).toHaveLength(4)
    expect(result.canvas.edges).toEqual([])
  })

  it('runs a nested batch as one unit and merges its created ids', () => {
    const result = executeBatch(canvas(), [
      {
        type: 'batch',
        operations: [
          { type: 'duplicateNodes', nodeIds: ['a'], offsetX: 0, offsetY: 100 },
          { type: 'createEdge', edge: { id: 'n1', fromNode: 'a', toNode: 'c' } },
          {
            type: 'batch',
            operations: [{ type: 'createEdge', edge: { id: 'n2', fromNode: 'b', toNode: 'c' } }],
          },
        ],
      },
      { type: 'duplicateNodes', nodeIds: ['b'], offsetX: 0, offsetY: 100 },
    ])

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.created?.nodeIds).toHaveLength(2)
    expect(result.created?.edgeIds).toEqual(['n1', 'n2'])
  })

  it('stops at a failure inside a nested batch and returns its error', () => {
    const input = canvas()
    const result = executeBatch(input, [
      { type: 'moveNodes', nodeIds: ['a'], deltaX: 1, deltaY: 1 },
      {
        type: 'batch',
        operations: [
          { type: 'moveNodes', nodeIds: ['b'], deltaX: 1, deltaY: 1 },
          { type: 'deleteEdges', edgeIds: ['missing'] },
        ],
      },
    ])

    expect(result).toMatchObject({ success: false, error: { code: 'EDGE_NOT_FOUND' } })
    expect(input).toEqual(canvas())
  })

  it('rejects an operation type it does not know, inside and outside a batch', () => {
    const unknown = { type: 'rotateNodes' } as unknown as CanvasOperation

    expect(executeOperation(canvas(), unknown)).toMatchObject({
      success: false,
      error: { code: 'INVALID_OPERATION' },
    })
    expect(executeBatch(canvas(), [unknown])).toMatchObject({
      success: false,
      error: { code: 'INVALID_OPERATION', message: 'Unknown operation type: rotateNodes' },
    })
  })
})

describe('duplicateNodes', () => {
  it('copies the nodes, not the edges between them', () => {
    const result = executeOperation(canvas(), {
      type: 'duplicateNodes',
      nodeIds: ['a', 'b'],
      offsetX: 0,
      offsetY: 10,
    })

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.canvas.nodes).toHaveLength(5)
    expect(result.canvas.edges).toHaveLength(1)
  })
})
