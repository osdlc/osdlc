import { strict as assert } from 'node:assert'

import { test } from 'vitest'

import { nextBreaking, semverTable } from '@osdlc/package-checks'

test('the next breaking version follows Cargo rules', () => {
  assert.deepEqual(nextBreaking([0, 0, 3]), [0, 0, 4])
  assert.deepEqual(nextBreaking([0, 2, 5]), [0, 3, 0])
  assert.deepEqual(nextBreaking([1, 2, 5]), [2, 0, 0])
})

test('the report is a markdown table', () => {
  assert.equal(
    semverTable([{ name: 'a', version: '0.1.0', baseline: '-', result: 'skipped: not published' }]),
    '| crate | version | baseline | result |\n|---|---|---|---|\n| a | 0.1.0 | - | skipped: not published |',
  )
})
