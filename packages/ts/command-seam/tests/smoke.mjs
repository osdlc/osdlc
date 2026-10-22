// Runs the BUILT package under Node, which no other check does: `bun test`
// resolves the `bun` export condition to the TypeScript sources, so dist/ is
// compiled and never executed. A broken emit — an unrewritten `.ts` import, a
// dependency with no dist/ of its own — passes every other gate and fails on
// the consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  classifyFailure,
  spawnRunner,
  spawnRunnerBytes,
  runChecked,
  CommandFailed,
  asAsync,
  managedProcessRunner,
  withDefaults,
} from '@osdlc/command-seam'
import { fakeProcess, fakeRunner } from '@osdlc/command-seam/testing'

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

// Bytes: stdout as written, never decoded.
const bytes = spawnRunnerBytes('node').run(
  ['-e', 'process.stdout.write(Buffer.from([0xff, 0x00, 0x80]))'],
  { cwd: process.cwd() },
)
assert.deepEqual([...bytes.stdout], [0xff, 0x00, 0x80])

// stdio: both streams to one fd, in the order the child wrote them.
const dir = mkdtempSync(join(tmpdir(), 'command-seam-smoke-'))
try {
  const log = join(dir, 'log')
  const fd = openSync(log, 'w')
  const handle = managedProcessRunner('sh').run(['-c', 'echo a; echo b >&2; echo c'], {
    cwd: process.cwd(),
    stdio: { stdout: fd, stderr: fd },
  })
  closeSync(fd)
  assert.equal((await handle.exited).exitCode, 0)
  assert.equal(readFileSync(log, 'utf8'), 'a\nb\nc\n')
} finally {
  rmSync(dir, { recursive: true, force: true })
}

// The /testing entry point, built.
const fake = fakeRunner({ 'rev-parse HEAD': { stdout: 'abc\n' } })
assert.equal(runChecked(fake.runner, ['rev-parse', 'HEAD'], { cwd: '/' }).stdout, 'abc\n')
const proc = fakeProcess()
proc.kill()
assert.equal((await proc.exited).reason, 'abort')

// A failure is classified, and CommandFailed carries it.
const missing = spawnRunner('command-seam-no-such-binary').run([], { cwd: '/' })
assert.equal(classifyFailure(missing, { binary: 'x' })?.kind, 'not-installed')
assert.equal(classifyFailure({ exitCode: 0, stdout: '', stderr: '' }), null)
assert.throws(
  () => runChecked(spawnRunner('command-seam-no-such-binary'), [], { cwd: '/' }),
  (e) => e instanceof CommandFailed && e.failure.kind === 'not-installed',
)

console.log('command-seam smoke: OK')
