// Runs the built package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit, such as an unrewritten `.ts` import,
// passes every other check and fails on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. `package-checks ts` copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import {
  CanvasViewModel,
  SnapshotHistory,
  executeOperation,
  normalizeCanvas,
  validateCanvasData,
} from '@osdlc/json-canvas-core'

const input = JSON.parse(
  '{"nodes":[{"id":"a","type":"text","x":0,"y":0,"width":10,"height":10,"text":"hi"}]}',
)
assert.equal(validateCanvasData(input).valid, true)
const canvas = normalizeCanvas(input)
assert.deepEqual(canvas.edges, [])

const result = executeOperation(canvas, { type: 'moveNodes', nodeIds: ['a'], deltaX: 5, deltaY: 0 })
assert.equal(result.success, true)
assert.equal(result.canvas.nodes[0].x, 5)
assert.equal(canvas.nodes[0].x, 0)

const history = new SnapshotHistory(canvas)
history.execute({ type: 'moveNodes', nodeIds: ['a'], deltaX: 5, deltaY: 0 })
assert.equal(history.current.nodes[0].x, 5)
history.undo()
assert.equal(history.current.nodes[0].x, 0)

const view = new CanvasViewModel(canvas).selectNode('a')
assert.deepEqual([...view.selectedNodeIds], ['a'])

console.log('json-canvas-core smoke: OK')
