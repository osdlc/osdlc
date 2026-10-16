// Runs the BUILT package under Node, which no other check does: `bun test`
// resolves the `bun` export condition to the TypeScript sources, so dist/ is
// compiled and never executed. A broken emit — an unrewritten `.ts` import, a
// dependency with no dist/ of its own — passes every other gate and fails on
// the consumer's machine.
//
// Deliberately not a test-runner suite: it must run from the extracted
// snapshot with only `dist/` and production dependencies present.

import { strict as assert } from 'node:assert'
import { spawnRunner, runChecked, CommandFailed, asAsync, withDefaults } from './dist/index.js'
import { fakeProcess, fakeRunner } from './dist/testing.js'

const runner = spawnRunner('node')
const ok = runner.run(['-e', "process.stdout.write('hi')"], { cwd: process.cwd() })
assert.equal(ok.exitCode, 0)
assert.equal(ok.stdout, 'hi')

const bad = runner.run(['-e', "process.stderr.write('boom'); process.exit(3)"], {
  cwd: process.cwd(),
})
assert.equal(bad.exitCode, 3)
assert.match(bad.stderr, /boom/)

// `run` never throws; `runChecked` does.
assert.throws(
  () => runChecked(runner, ['-e', 'process.exit(1)'], { cwd: process.cwd() }),
  (e) => e instanceof CommandFailed && e.argv.length === 2,
)

// detail joins both streams, empty ones dropped — the reason it exists is a
// command that explains itself on stdout while git reports failure on stderr.
const both = new CommandFailed(['x'], { exitCode: 1, stdout: 'why\n', stderr: 'what\n' })
assert.equal(both.detail, 'what\nwhy')
assert.equal(new CommandFailed(['x'], { exitCode: 1, stdout: 'only\n', stderr: '' }).detail, 'only')

// env merges over the parent environment.
const withEnv = runner.run(['-e', "process.stdout.write(process.env.SMOKE_VAR ?? '')"], {
  cwd: process.cwd(),
  env: { SMOKE_VAR: 'set' },
})
assert.equal(withEnv.stdout, 'set')

const async = asAsync(runner)
const viaAsync = await async.run(['-e', "process.stdout.write('async')"], { cwd: process.cwd() })
assert.equal(viaAsync.stdout, 'async')

// An invalid timeoutMs is a caller error.
assert.throws(() => runner.run(['-e', ''], { cwd: process.cwd(), timeoutMs: 0 }), RangeError)

const bound = withDefaults(runner, { cwd: process.cwd() })
assert.equal(bound.run(['-e', "process.stdout.write('bound')"]).stdout, 'bound')

// The /testing entry point, built.
const fake = fakeRunner({ 'rev-parse HEAD': { stdout: 'abc\n' } })
assert.equal(runChecked(fake.runner, ['rev-parse', 'HEAD'], { cwd: '/' }).stdout, 'abc\n')
const proc = fakeProcess()
proc.kill()
assert.equal((await proc.exited).reason, 'abort')

console.log('command-seam smoke: OK')
