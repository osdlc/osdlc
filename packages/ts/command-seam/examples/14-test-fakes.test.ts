/**
 * Need: fast, deterministic unit tests for code that runs git and supervises
 * a server, with small helpers so each test states only what differs.
 *
 * `@osdlc/command-seam/testing` has the fakes, kept out of the main entry so
 * production code never imports them. `fakeRunner` answers from a table keyed
 * by argv (each argument quoted with `shellQuote`), or a function, and
 * records every call. `asyncRunner` is the same fake for async code.
 * `fakeProcess` is a managed-process handle the test ends by hand.
 */

import { expect, test } from 'vitest'

import {
  resolveRunner,
  runChecked,
  runCheckedAsync,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
  type CommandRunner,
  type ManagedProcessExit,
  type ManagedProcessRunner,
} from '@osdlc/command-seam'
import {
  fakeProcess,
  fakeRunner,
  type FakeCall,
  type FakeProcess,
  type FakeProcessOptions,
  type FakeRunner,
} from '@osdlc/command-seam/testing'

// ---- Code under test --------------------------------------------------------

/** The short sha of HEAD in `repo`. */
function headSha(repo: string, runner?: CommandRunner): string {
  const git = resolveRunner('git', runner)
  return runChecked(git, ['rev-parse', '--short', 'HEAD'], { cwd: repo }).stdout.trim()
}

/** The current branch of `repo`, read without blocking. */
async function currentBranch(repo: string, git: AsyncCommandRunner): Promise<string> {
  return (await runCheckedAsync(git, ['branch', '--show-current'], { cwd: repo })).stdout.trim()
}

/** Start a dev server and stop it once `ready` resolves. */
async function serveUntil(
  ready: Promise<void>,
  runner: ManagedProcessRunner,
): Promise<ManagedProcessExit> {
  const server = runner.run(['server.js', '--port', '0'], { cwd: '/app' })
  await ready
  server.kill()
  return server.exited
}

/** Run a server until it stops, and say why it stopped. */
async function whyServerStopped(runner: ManagedProcessRunner): Promise<string> {
  const exit = await runner.run(['server.js'], { cwd: '/app' }).exited
  if (exit.reason === 'signal') return `killed by ${String(exit.signal)}`
  return `exited ${exit.exitCode}`
}

// ---- Test helpers ---------------------------------------------------------------

/** Each call's argv, joined, for a compact assertion. */
function argvs(calls: FakeCall<AsyncCommandRunOptions>[]): string[] {
  return calls.map((c) => c.argv.join(' '))
}

/** The calls a fake runner received, as argvs. */
function argvsOf(fake: FakeRunner): string[] {
  return argvs(fake.calls)
}

/** A server fake for these tests, so each one states only what differs. */
function fakeServer(opts: FakeProcessOptions = {}): FakeProcess {
  return fakeProcess({ pid: 7, ...opts })
}

// ---- Tests --------------------------------------------------------------------

test('fakeRunner answers by argv and records each call', () => {
  const { runner, calls } = fakeRunner({ 'rev-parse --short HEAD': { stdout: 'abc1234\n' } })

  expect(headSha('/repo', runner)).toBe('abc1234')
  expect(calls).toEqual([{ argv: ['rev-parse', '--short', 'HEAD'], opts: { cwd: '/repo' } }])
})

test('an answer can be a failure, and a missing answer fails too', () => {
  const failing = fakeRunner({
    'rev-parse --short HEAD': { exitCode: 128, stderr: 'fatal: not a git repository' },
  })
  const empty = fakeRunner({})

  expect(() => headSha('/tmp', failing.runner)).toThrow('fatal: not a git repository')
  expect(() => headSha('/repo', empty.runner)).toThrow(
    'fakeRunner: no answer for: rev-parse --short HEAD',
  )
  expect(argvsOf(empty)).toEqual(['rev-parse --short HEAD'])
})

test('an answer function sees the call, and asyncRunner serves async code', async () => {
  const { asyncRunner, calls } = fakeRunner((argv, opts) =>
    argv[0] === 'branch' ? { stdout: `${opts.cwd === '/a' ? 'main' : 'dev'}\n` } : undefined,
  )

  expect(await currentBranch('/a', asyncRunner)).toBe('main')
  expect(await currentBranch('/b', asyncRunner)).toBe('dev')
  // Async options reach the fake and are recorded, typed.
  await asyncRunner.run(['branch'], { cwd: '/a', processGroup: true })
  expect(calls.at(-1)?.opts.processGroup).toBe(true)
})

test('a key quotes an argument the way shellQuote does, and a miss prints that key', () => {
  const { runner } = fakeRunner({
    "commit -m 'Fix login'": { stdout: '[main abc1234] Fix login\n' },
  })

  expect(runner.run(['commit', '-m', 'Fix login'], { cwd: '/repo' }).stdout).toContain('abc1234')
  // Two words are a different argv, so they get no answer.
  expect(runner.run(['commit', '-m', 'Fix', 'login'], { cwd: '/repo' }).error).toBe(
    'fakeRunner: no answer for: commit -m Fix login',
  )
})

test('fakeProcess: the code under test kills it, and exited reports the stop', async () => {
  const proc = fakeProcess()

  const exit = await serveUntil(Promise.resolve(), proc.runner)

  expect(proc.calls[0]?.argv).toEqual(['server.js', '--port', '0'])
  expect(proc.signals).toEqual(['SIGTERM'])
  expect(exit).toEqual({ exitCode: 1, signal: 'SIGTERM', neverExited: true, reason: 'abort' })
})

test('fakeProcess: the test ends it with an exit of its choosing', async () => {
  // A server that handles SIGTERM, keeps running, then exits 0 on its own.
  const proc = fakeServer({ exitOnKill: false })
  const server = proc.runner.run(['server.js'], { cwd: '/app' })

  server.kill()
  proc.exit({ exitCode: 0 })

  expect(await server.exited).toEqual({ exitCode: 0, signal: null })
  expect(proc.signals).toEqual(['SIGTERM'])
  expect(server.pid).toBeGreaterThan(0)
})

test('fakeProcess: a server killed from outside reports a signal death', async () => {
  const proc = fakeServer()
  const stopped = whyServerStopped(proc.runner)

  // Something other than the code under test sends SIGTERM. This is the shape
  // managedProcessRunner reports for it.
  proc.exit({ exitCode: 1, signal: 'SIGTERM', neverExited: true, reason: 'signal' })

  expect(await stopped).toBe('killed by SIGTERM')
})
