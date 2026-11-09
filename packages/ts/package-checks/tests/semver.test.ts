import { strict as assert } from 'node:assert'

import { test } from 'vitest'

import { nextBreaking, semverOutcome, semverTable } from '@osdlc/package-checks'

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

test('a semver-checks exit code maps to a row, and a problem when it fails the run', () => {
  assert.deepEqual(semverOutcome(0, 'a', [0, 2, 5], 'crates.io'), {
    baseline: '0.2.5 (crates.io)',
    result: 'pass: no breaking change found',
  })
  const broke = semverOutcome(100, 'a', [0, 2, 5], 'git tag a/v0.2.5')
  assert.equal(broke.result, 'fail: breaking, set 0.3.0')
  assert.match(
    broke.problem!,
    /^a has a breaking change against 0\.2\.5 \(git tag a\/v0\.2\.5\)\. Set `version = "0\.3\.0"`/,
  )
  // 1 is also what a command that never ran reports, such as a missing cargo-semver-checks.
  for (const code of [1, 101]) {
    const failed = semverOutcome(code, 'a', [1, 0, 0], 'crates.io')
    assert.equal(failed.result, `error: cargo semver-checks exited ${code}`)
    assert.equal(failed.problem, `cargo semver-checks could not check a (exit ${code}).`)
  }
})
