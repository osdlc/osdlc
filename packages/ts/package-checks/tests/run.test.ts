import { strict as assert } from 'node:assert'

import { test } from 'vitest'

import { capture, failureLine, RunFailed } from '@osdlc/package-checks'

const script = "process.stderr.write('first\\nsecond: the reason\\n'); process.exit(3)"

test('a failed command keeps all of its stderr', () => {
  let caught: unknown
  try {
    capture(process.execPath, ['-e', script], process.cwd())
  } catch (e) {
    caught = e
  }
  assert.ok(caught instanceof RunFailed)
  assert.match(caught.message, /first\nsecond: the reason/)
})

test('a command that fails silently reports its exit code', () => {
  assert.throws(
    () => capture(process.execPath, ['-e', 'process.exit(4)'], process.cwd()),
    (e: Error) => e instanceof RunFailed && e.message.endsWith('failed: exit 4'),
  )
})

test('the report shows a failed command and a shape error whole, and anything else by its first line', () => {
  const failed = new RunFailed(
    'node smoke.mjs failed: file:///x/smoke.mjs:2\nError: the reason',
    '',
  )
  assert.equal(failureLine('@x/a', failed), `FAILED: @x/a: ${failed.message}`)
  const shape = Object.assign(new Error('not in the shape:\n  one\n  two'), { shape: true })
  assert.equal(failureLine('@x/a', shape), `FAILED: @x/a: ${shape.message}`)
  assert.equal(failureLine('@x/a', new Error('top\nstack')), 'FAILED: @x/a: top')
})
