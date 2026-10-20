// Runs the BUILT package under Node. check-packages.mjs copies this file into a
// clean project that installed the tarball, so it imports the package by name
// and no other repo file. It is not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { index, intersects } from '@osdlc/intersect'
import { filesInScope } from '@osdlc/intersect/fs'
import { intersects as segmentsIntersect } from '@osdlc/intersect/segments'

assert.equal(intersects('src/api/**', 'src/**/*.ts'), true)
assert.equal(intersects('src/api/**', 'src/web/**'), false)
assert.deepEqual(index([{ id: 'api', patterns: 'src/api/**' }]).applicableTo('src/api/x.ts'), [
  'api',
])

assert.equal(segmentsIntersect(['a', '**'], ['a', 'b']), true)

const cwd = mkdtempSync(join(tmpdir(), 'intersect-smoke-'))
try {
  mkdirSync(join(cwd, 'src'))
  writeFileSync(join(cwd, 'src', 'a.ts'), '')
  assert.deepEqual(await filesInScope('src/**', { cwd }), ['src/a.ts'])
} finally {
  rmSync(cwd, { recursive: true, force: true })
}

process.stdout.write('intersect smoke: OK\n')
