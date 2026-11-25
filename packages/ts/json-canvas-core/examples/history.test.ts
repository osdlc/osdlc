// Undo, redo and checkpoints.
import { expect, test } from 'vitest'
import { SnapshotHistory } from '@osdlc/json-canvas-core'

const box = { type: 'text', x: 0, y: 0, width: 100, height: 50, text: '' } as const

test('undo and redo', () => {
  // #region undo-redo
  const history = new SnapshotHistory({ nodes: [], edges: [] })

  history.execute({ type: 'createNode', node: { ...box, id: 'a' } })
  history.execute({ type: 'moveNodes', nodeIds: ['a'], deltaX: 50, deltaY: 0 })
  expect(history.current.nodes[0]?.x).toEqual(50)

  history.undo()
  expect(history.current.nodes[0]?.x).toEqual(0)
  history.canRedo() // true

  history.redo()
  expect(history.current.nodes[0]?.x).toEqual(50)
  // #endregion undo-redo

  expect(history.current.nodes[0]?.x).toBe(50)
  expect(history.undoSize).toBe(2)
  expect(history.redoSize).toBe(0)
  expect(history.canUndo()).toBe(true)
})

test('a batch is one undo step', () => {
  // #region history-batch
  const history = new SnapshotHistory({ nodes: [], edges: [] })

  history.executeBatch([
    { type: 'createNode', node: { ...box, id: 'a' } },
    { type: 'createNode', node: { ...box, id: 'b' } },
  ])
  expect(history.undoSize).toEqual(1)
  history.undo()
  expect(history.current.nodes.length).toEqual(0)
  // #endregion history-batch

  expect(history.current.nodes).toHaveLength(0)
  expect(history.redoSize).toBe(1)
})

test('a checkpoint is an opaque handle to a state', () => {
  // #region checkpoint
  const history = new SnapshotHistory({ nodes: [], edges: [] })
  history.execute({ type: 'createNode', node: { ...box, id: 'a' } })

  const saved = history.checkpoint()
  history.execute({ type: 'createNode', node: { ...box, id: 'b' } })
  history.execute({ type: 'deleteNodes', nodeIds: ['a'] })

  history.revertTo(saved)
  history.current.nodes.map((n) => n.id) // ['a']
  // #endregion checkpoint

  expect(history.current.nodes.map((n) => n.id)).toEqual(['a'])
})

test('clear keeps the canvas and drops the steps', () => {
  // #region clear
  const history = new SnapshotHistory({ nodes: [], edges: [] }, { maxSize: 100 })
  const stale = history.checkpoint()
  history.execute({ type: 'createNode', node: { ...box, id: 'a' } })

  history.clear()
  history.canUndo() // false
  expect(history.revertTo(stale).success).toEqual(false) // the state is gone
  // #endregion clear

  expect(history.canUndo()).toBe(false)
  expect(history.revertTo(stale).success).toBe(false)
  expect(history.current.nodes).toHaveLength(1)
})

test('the entry list shows every state', () => {
  // #region entries
  const history = new SnapshotHistory({ nodes: [], edges: [] })
  history.execute({ type: 'createNode', node: { ...box, id: 'a' } })
  history.execute({ type: 'createNode', node: { ...box, id: 'b' } })
  history.undo()

  history.getEntries().map((e) => `${e.position}: ${e.summary}`)
  // ['past: 0 nodes, 0 edges', 'current: 1 nodes, 0 edges', 'future: 2 nodes, 0 edges']
  history.goToEntry(2) // redoes to the newest state
  // #endregion entries

  expect(history.current.nodes).toHaveLength(2)
  expect(history.getEntries().map((e) => e.position)).toEqual(['past', 'past', 'current'])
})
