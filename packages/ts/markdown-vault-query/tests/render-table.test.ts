import { test } from 'vitest'
import assert from 'node:assert/strict'
import { renderTable } from '../src/render-table.ts'

test('renderTable sizes columns over more rows than a call can take arguments', () => {
  // Spreading one argument per row into Math.max overflows V8's stack
  // somewhere past ~125k arguments; a query over a large vault has that many.
  const rows = Array.from({ length: 200_000 }, (_, i) => [String(i)])
  const lines = renderTable(['n'], rows).split('\n')
  assert.equal(lines.length, rows.length + 2)
  assert.equal(lines[1], '------')
  assert.equal(lines[2], '0     ')
})
