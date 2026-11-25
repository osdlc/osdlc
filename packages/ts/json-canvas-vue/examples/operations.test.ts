import { type ICanvasContent, useCanvasOperations } from '@osdlc/json-canvas-vue'
import { expect, test } from 'vitest'

test('useCanvasOperations: a reactive canvas with undo, redo and checkpoints', () => {
  // #region use-canvas-operations
  const { canvas, execute, undo, redo, canUndo, canRedo } = useCanvasOperations({
    nodes: [],
    edges: [],
  })

  const result = execute({
    type: 'createNode',
    node: { type: 'text', x: 0, y: 0, width: 100, height: 50, text: 'Hello' },
  })
  expect(result.success && result.created?.nodeIds?.length).toBe(1) // the generated id
  expect(canvas.value.nodes.length).toBe(1)
  expect(canUndo.value).toBe(true)

  undo()
  expect(canvas.value.nodes.length).toBe(0)
  expect(canRedo.value).toBe(true)
  redo()
  // #endregion use-canvas-operations

  expect(canvas.value.nodes).toHaveLength(1)
  expect(canRedo.value).toBe(false)
})

test('checkpoint and revertTo return to a state', () => {
  const { canvas, execute, checkpoint, revertTo, undoStackSize } = useCanvasOperations({
    nodes: [],
    edges: [],
  })
  const box = { type: 'text', x: 0, y: 0, width: 100, height: 50, text: '' } as const
  execute({ type: 'createNode', node: { ...box, id: 'a' } })
  const mark = checkpoint()

  execute({ type: 'createNode', node: { ...box, id: 'b' } })
  execute({ type: 'createNode', node: { ...box, id: 'c' } })
  expect(canvas.value.nodes).toHaveLength(3)

  expect(revertTo(mark).success).toBe(true)
  expect(canvas.value.nodes.map((n) => n.id)).toEqual(['a'])
  expect(undoStackSize.value).toBe(1)
})

test('a batch is one step, and a failed batch changes nothing', () => {
  const { canvas, executeBatch, undo, undoStackSize } = useCanvasOperations({
    nodes: [],
    edges: [],
  })
  const box = { type: 'text', x: 0, y: 0, width: 100, height: 50, text: '' } as const

  const ok = executeBatch([
    { type: 'createNode', node: { ...box, id: 'a' } },
    { type: 'createNode', node: { ...box, id: 'b' } },
  ])
  expect(ok.success).toBe(true)
  expect(undoStackSize.value).toBe(1)

  const failed = executeBatch([
    { type: 'createNode', node: { ...box, id: 'c' } },
    { type: 'createEdge', edge: { fromNode: 'c', toNode: 'nowhere' } },
  ])
  expect(failed.success).toBe(false)
  expect(canvas.value.nodes).toHaveLength(2)

  undo()
  expect(canvas.value.nodes).toHaveLength(0)
})

test('history options and reset', () => {
  const start: ICanvasContent = { nodes: [], edges: [] }
  const { canvas, execute, reset, canUndo, undoStackSize } = useCanvasOperations(start, {
    maxSize: 2,
  })
  const box = { type: 'text', x: 0, y: 0, width: 100, height: 50, text: '' } as const
  for (const id of ['a', 'b', 'c']) execute({ type: 'createNode', node: { ...box, id } })
  expect(undoStackSize.value).toBe(2)

  reset({ nodes: [], edges: [] })
  expect(canvas.value.nodes).toHaveLength(0)
  expect(canUndo.value).toBe(false)
})
