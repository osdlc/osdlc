// Runs the built package under Node, which no other check does. The unit tests
// run the TypeScript source (vitest.config.ts aliases the package name to it),
// so dist/ is compiled but never run. A broken build output passes every other
// check and fails on the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.
//
// It uses a fake runner, so it needs no `gh` binary and no network.

import { strict as assert } from 'node:assert'

import { AsyncGh, CommandFailed, Gh, parsePrUrl, parsePullRequest } from '@osdlc/typed-gh'

const answer = (stdout, exitCode = 0) => ({
  exitCode,
  stdout,
  stderr: exitCode ? 'gh: failed' : '',
})

/** A runner that records each argv and answers with `result`. */
function fake(result) {
  const calls = []
  return {
    calls,
    runner: {
      run: (argv) => {
        calls.push(argv)
        return result
      },
    },
  }
}

// A query returns a parsed value.
const ok = fake(answer('[{"number":7,"title":"Add retries"}]'))
const prs = new Gh('/repo', { runner: ok.runner }).prList().rows
assert.equal(prs?.length, 1)
assert.equal(prs?.[0]?.number, 7)
assert.equal(
  prs?.[0]?.mergeable,
  'UNKNOWN',
  'a field the query did not ask for takes its not-known value',
)
assert.equal(ok.calls[0]?.[0], 'pr')

// A failed query throws instead of returning an empty list. `soft` is null and `try` a classified failure.
const broken = new Gh('/repo', { runner: fake(answer('', 1)).runner })
assert.throws(
  () => broken.prList(),
  (e) => e.name === 'FailureError' && e.failure.cause instanceof CommandFailed,
)
assert.equal(broken.soft.prList(), null)
assert.equal(broken.try.prList().ok, false)

// A failed mutation throws the classified failure, carrying the argv. Its cause is the CommandFailed.
const failing = new Gh('/repo', { runner: fake(answer('', 1)).runner })
assert.throws(
  () => failing.editPrBody(7, 'new body'),
  (e) =>
    e.name === 'FailureError' &&
    e.failure.cause instanceof CommandFailed &&
    e.failure.argv.includes('7'),
)

// The awaitable client follows the same contract.
const asyncGh = new AsyncGh('/repo', {
  runner: { run: async () => answer('[]') },
})
assert.deepEqual(await asyncGh.prList(), { rows: [], truncated: false })

// Parsers are pure.
assert.equal(parsePullRequest({ number: 7 })?.reviewDecision, null)
assert.ok(parsePrUrl('https://github.com/osdlc/osdlc/pull/7'))

console.log('typed-gh smoke: OK')
