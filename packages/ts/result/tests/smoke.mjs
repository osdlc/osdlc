// Runs the BUILT package under Node. The unit tests run the TypeScript source
// (vitest.config.ts aliases the package name to it), so dist/ is compiled but
// never run anywhere else. A broken emit passes every other check and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'

import {
  andThen,
  attempt,
  attemptAsync,
  describe,
  err,
  FailureError,
  isErr,
  isFailure,
  isOk,
  map,
  mapErr,
  match,
  ok,
  unwrap,
  unwrapOr,
} from '@osdlc/result'

assert.deepEqual(ok(1), { ok: true, value: 1 })
assert.deepEqual(err('x'), { ok: false, error: 'x' })
assert.ok(isOk(ok(1)) && isErr(err(1)))
assert.deepEqual(
  map(ok(2), (n) => n * 2),
  ok(4),
)
assert.deepEqual(
  mapErr(err('a'), (s) => s + 'b'),
  err('ab'),
)
assert.deepEqual(
  andThen(ok(1), (n) => ok(n + 1)),
  ok(2),
)
assert.equal(unwrapOr(err('x'), 9), 9)
assert.equal(match(ok(1), { ok: (n) => n, err: () => -1 }), 1)

const failure = { kind: 'k', message: 'It broke.', hint: 'Fix it.' }
assert.equal(describe(failure), 'It broke. Fix it.')
assert.ok(isFailure(failure))
assert.throws(
  () => unwrap(err(failure)),
  (e) => e instanceof FailureError && e.failure === failure && e.message === 'It broke.',
)
assert.ok(
  isErr(
    attempt(
      () => JSON.parse('{'),
      (t) => t,
    ),
  ),
)
assert.ok(
  isOk(
    await attemptAsync(
      async () => 1,
      (t) => t,
    ),
  ),
)

console.log('result smoke: OK')
