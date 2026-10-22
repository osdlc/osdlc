// Runs the BUILT package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit, such as an unrewritten `.ts` import,
// passes every other check and fails on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import {
  gridFromCsv,
  padTable,
  readDelimited,
  readTable,
  renderTable,
  rowCellTexts,
  splitRow,
  toCsv,
} from '@osdlc/gfm-table'

assert.deepEqual(rowCellTexts('| a \\| b | c |'), ['a | b', 'c'])

const markdown = renderTable({ header: ['Name', 'Value'], rows: [['a|b', '1']] })
assert.equal(markdown, '| Name | Value |\n| --- | --- |\n| a\\|b | 1 |')
assert.equal(readTable(markdown.split('\n'))?.rows[0]?.[0]?.text, 'a|b')

assert.equal(splitRow('| a |', 10).cells[0]?.content.from, 12)
assert.equal(padTable('| a |\n|-|\n| 東京 |'), '| a    |\n| ---- |\n| 東京 |')

const grid = [
  ['a', 'b'],
  ['1', '2'],
]
assert.deepEqual(gridFromCsv(toCsv(grid)), grid)
assert.equal(readDelimited('x;y\n1;2\n').delimiter, ';')

console.log('gfm-table smoke: OK')
