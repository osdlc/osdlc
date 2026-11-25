// The README quick start and the operation engine, through the package name.
import { expect, test } from 'vitest'
import {
  executeBatch,
  executeOperation,
  isOperationError,
  type ICanvasContent,
} from '@osdlc/json-canvas-core'

test('quick start: an operation returns a new canvas', () => {
  // #region quick-start
  const canvas = { nodes: [], edges: [] }

  const result = executeOperation(canvas, {
    type: 'createNode',
    node: { type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hello' },
  })
  if (result.success) {
    expect(result.canvas.nodes.length).toEqual(1)
    expect(result.created?.nodeIds).toHaveLength(1) // the generated id
    expect(canvas.nodes.length).toEqual(0) // the input is never changed
  }
  // #endregion quick-start

  expect(result.success).toBe(true)
  if (!result.success) return
  expect(result.canvas.nodes).toHaveLength(1)
  expect(result.created?.nodeIds).toHaveLength(1)
  expect(canvas.nodes).toHaveLength(0)
})

test('a failed operation returns an error and does not throw', () => {
  // #region failure
  const canvas: ICanvasContent = { nodes: [], edges: [] }

  const result = executeOperation(canvas, { type: 'deleteNodes', nodeIds: ['missing'] })
  if (!result.success) {
    expect(result.error.code).toEqual('NODE_NOT_FOUND')
    expect(result.error.message).toBe('Node with ID "missing" not found')
  }
  // #endregion failure

  expect(result).toEqual({
    success: false,
    error: expect.objectContaining({ code: 'NODE_NOT_FOUND' }),
  })
})

test('a batch applies every operation or none', () => {
  // #region batch
  const canvas: ICanvasContent = { nodes: [], edges: [] }
  const box = { type: 'text', x: 0, y: 0, width: 100, height: 50, text: '' } as const

  const ok = executeBatch(canvas, [
    { type: 'createNode', node: { ...box, id: 'a' } },
    { type: 'createNode', node: { ...box, id: 'b', x: 300 } },
    { type: 'createEdge', edge: { fromNode: 'a', toNode: 'b' } },
  ])
  if (ok.success) {
    expect(ok.canvas.nodes.length).toEqual(2)
    expect(ok.created?.edgeIds?.length).toEqual(1)
  }

  // The second operation fails, so the first one is not applied either.
  const failed = executeBatch(canvas, [
    { type: 'createNode', node: { ...box, id: 'a' } },
    { type: 'createEdge', edge: { fromNode: 'a', toNode: 'nowhere' } },
  ])
  expect(failed.success).toEqual(false)
  // #endregion batch

  expect(ok.success && ok.canvas.nodes.length).toBe(2)
  expect(ok.success && ok.created?.edgeIds?.length).toBe(1)
  expect(failed.success).toBe(false)
  expect(canvas.nodes).toHaveLength(0)
})

test('the operations that arrange nodes', () => {
  // #region arrange
  const node = (id: string, x: number, y: number) =>
    ({ id, type: 'text', x, y, width: 100, height: 50, text: id }) as const
  const canvas: ICanvasContent = {
    nodes: [node('a', 0, 0), node('b', 130, 40), node('c', 400, 90)],
    edges: [],
  }
  const nodeIds = ['a', 'b', 'c']

  const aligned = executeOperation(canvas, { type: 'alignNodes', nodeIds, direction: 'top' })
  const spread = executeOperation(canvas, {
    type: 'distributeNodes',
    nodeIds,
    direction: 'horizontal',
  })
  const moved = executeOperation(canvas, { type: 'moveNodes', nodeIds, deltaX: 10, deltaY: 20 })
  const sized = executeOperation(canvas, { type: 'resizeNodes', nodeIds, width: 80, height: 40 })
  const matched = executeOperation(canvas, {
    type: 'matchNodeSize',
    nodeIds: ['b', 'a'],
    dimension: 'both',
  })
  const copies = executeOperation(canvas, {
    type: 'duplicateNodes',
    nodeIds: ['a'],
    offsetX: 20,
    offsetY: 20,
  })
  // #endregion arrange

  expect(aligned.success && aligned.canvas.nodes.map((n) => n.y)).toEqual([0, 0, 0])
  expect(spread.success && spread.canvas.nodes.map((n) => n.x)).toEqual([0, 200, 400])
  expect(moved.success && moved.canvas.nodes[0]).toMatchObject({ x: 10, y: 20 })
  expect(sized.success && sized.canvas.nodes[2]).toMatchObject({ width: 80, height: 40 })
  expect(matched.success && matched.canvas.nodes[1]).toMatchObject({ width: 100, height: 50 })
  expect(copies.success && copies.canvas.nodes).toHaveLength(4)
})

test('the operations that edit nodes and edges', () => {
  // #region edit
  const canvas: ICanvasContent = {
    nodes: [
      { id: 'a', type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'a' },
      { id: 'b', type: 'text', x: 200, y: 0, width: 100, height: 50, text: 'b' },
    ],
    edges: [{ id: 'e', fromNode: 'a', toNode: 'b' }],
  }

  const renamed = executeOperation(canvas, {
    type: 'updateNode',
    nodeId: 'a',
    updates: { text: 'renamed', color: '4' },
  })
  const relabelled = executeOperation(canvas, {
    type: 'updateEdge',
    edgeId: 'e',
    updates: { label: 'next' },
  })
  const unlinked = executeOperation(canvas, { type: 'deleteEdges', edgeIds: ['e'] })
  // Deleting a node deletes the edges that touch it.
  const removed = executeOperation(canvas, { type: 'deleteNodes', nodeIds: ['a'] })
  // #endregion edit

  expect(renamed.success && renamed.canvas.nodes[0]).toMatchObject({ text: 'renamed', color: '4' })
  expect(relabelled.success && relabelled.canvas.edges[0]?.label).toBe('next')
  expect(unlinked.success && unlinked.canvas.edges).toHaveLength(0)
  expect(removed.success && removed.canvas.edges).toHaveLength(0)
})

test('isOperationError recognises an operation error in a catch', () => {
  // #region is-operation-error
  isOperationError({ code: 'NODE_NOT_FOUND', message: 'gone' }) // true
  isOperationError(new Error('boom')) // false
  // #endregion is-operation-error

  expect(isOperationError({ code: 'NODE_NOT_FOUND', message: 'gone' })).toBe(true)
  expect(isOperationError(new Error('boom'))).toBe(false)
  expect(isOperationError(null)).toBe(false)
})
