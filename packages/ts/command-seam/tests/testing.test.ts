/** `@osdlc/command-seam/testing`: the fakes' edge cases. Scenario 14 shows the main use. */

import { describe, expect, test } from 'vitest'

import { asAsync, ran, runJson, shellRunnerAsync, stopProcess } from '../index.ts'
import { fakeNeverExited, fakeProcess, fakeRunner } from '../testing.ts'

const cwd = '/repo'

describe('fakeRunner', () => {
  test('an unanswered call reports a failed spawn that names the argv', () => {
    const { runner } = fakeRunner({})
    const r = runner.run(['status', '-s'], { cwd })
    expect(r).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '',
      neverExited: true,
      reason: 'spawn',
      error: 'fakeRunner: no answer for: status -s',
    })
    expect(ran(r)).toBe(false)
  })

  test('only own keys answer, so argv like `constructor` is unanswered', () => {
    const { runner } = fakeRunner({ ok: { stdout: 'y' } })
    expect(runner.run(['constructor'], { cwd }).reason).toBe('spawn')
    expect(runner.run(['toString'], { cwd }).reason).toBe('spawn')
    expect(runner.run(['ok'], { cwd }).stdout).toBe('y')
  })

  test('an answer keeps every field it sets', () => {
    const { runner } = fakeRunner({
      x: { exitCode: 1, neverExited: true, reason: 'timeout', error: 'timed out after 5ms' },
    })
    expect(runner.run(['x'], { cwd })).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '',
      neverExited: true,
      reason: 'timeout',
      error: 'timed out after 5ms',
    })
  })

  test('calls hold copies, so a caller mutating argv or opts later does not rewrite them', () => {
    const { runner, calls } = fakeRunner(() => ({}))
    const argv = ['a']
    const opts = { cwd, env: { A: '1' } }
    runner.run(argv, opts)
    argv.push('b')
    opts.cwd = '/elsewhere'
    expect(calls).toEqual([{ argv: ['a'], opts: { cwd, env: { A: '1' } } }])
  })

  test('works through asAsync and runJson', async () => {
    const { runner, calls } = fakeRunner({ 'api user': { stdout: '{"login":"me"}' } })
    const sync = runJson<{ login: string }>(runner, ['api', 'user'], { cwd })
    const async = await asAsync(runner).run(['api', 'user'], { cwd, timeoutMs: 5 })
    expect(sync.ok && sync.value.login).toBe('me')
    expect(async.stdout).toBe('{"login":"me"}')
    expect(calls.map((c) => c.opts.timeoutMs)).toEqual([undefined, 5])
  })

  test('records async options passed through asAsync', async () => {
    const { runner, calls } = fakeRunner(() => ({}))
    const signal = new AbortController().signal
    let spawned = false
    await asAsync(runner).run(['x'], {
      cwd,
      signal,
      processGroup: true,
      onSpawn: () => (spawned = true),
    })
    expect(calls[0]?.opts.signal).toBe(signal)
    expect(calls[0]?.opts.processGroup).toBe(true)
    expect(spawned).toBe(false)
  })
})

describe('fakeRunner keys', () => {
  test('a key quotes each argument, so an argument with a space is one quoted word', () => {
    const { runner } = fakeRunner({ "tag -m 'Release 1.2.0'": { stdout: 'one' } })
    expect(runner.run(['tag', '-m', 'Release 1.2.0'], { cwd }).stdout).toBe('one')
    expect(runner.run(['tag', '-m', 'Release', '1.2.0'], { cwd }).error).toBe(
      'fakeRunner: no answer for: tag -m Release 1.2.0',
    )
  })

  test('a first argument with = needs no quotes, unlike shellJoin', () => {
    const { runner } = fakeRunner({ '--git-dir=/r status': { stdout: 'x' } })
    expect(runner.run(['--git-dir=/r', 'status'], { cwd }).stdout).toBe('x')
    expect(runner.run(['--git-dir=/r', 'log'], { cwd }).error).toBe(
      'fakeRunner: no answer for: --git-dir=/r log',
    )
  })

  test('the miss message prints the key that would answer the call', () => {
    const { runner } = fakeRunner({})
    const argv = ['rev-parse', '@{upstream}', "it's", '']
    const key = "rev-parse '@{upstream}' 'it'\\''s' ''"
    expect(runner.run(argv, { cwd }).error).toBe(`fakeRunner: no answer for: ${key}`)
    expect(fakeRunner({ [key]: { stdout: 'y' } }).runner.run(argv, { cwd }).stdout).toBe('y')
  })
})

describe('fakeRunner asyncRunner', () => {
  test('shares the answers and the calls with runner', async () => {
    const { runner, asyncRunner, calls } = fakeRunner({ status: { stdout: 'clean' } })
    runner.run(['status'], { cwd })
    const r = await asyncRunner.run(['status'], { cwd, processGroup: true })
    expect(r.stdout).toBe('clean')
    expect(calls.map((c) => c.opts.processGroup)).toEqual([undefined, true])
  })

  test('drives an async shell runner with no extra wrapper', async () => {
    const { asyncRunner, calls } = fakeRunner(() => ({ exitCode: 2 }))
    const r = await shellRunnerAsync(asyncRunner).run('tsc', { cwd })
    expect(r.exitCode).toBe(2)
    expect(calls[0]?.argv).toEqual(['-c', '--', 'tsc'])
  })
})

describe('fakeNeverExited', () => {
  test('fills the fields the runners set together for each reason', () => {
    const base = { exitCode: 1, neverExited: true }
    expect(fakeNeverExited('spawn')).toEqual({ ...base, reason: 'spawn', error: 'fake: spawn' })
    expect(fakeNeverExited('timeout')).toEqual({
      ...base,
      reason: 'timeout',
      signal: 'SIGKILL',
      error: 'fake: timeout',
    })
    expect(fakeNeverExited('abort')).toEqual({ ...base, reason: 'abort', error: 'fake: abort' })
    expect(fakeNeverExited('signal')).toEqual({ ...base, reason: 'signal', signal: 'SIGTERM' })
    expect(fakeNeverExited('output')).toEqual({
      ...base,
      reason: 'output',
      signal: 'SIGKILL',
      error: 'fake: output',
    })
  })

  test('fields override the defaults', () => {
    expect(fakeNeverExited('signal', { signal: 'SIGINT', stderr: 'partial' })).toEqual({
      exitCode: 1,
      neverExited: true,
      reason: 'signal',
      signal: 'SIGINT',
      stderr: 'partial',
    })
  })

  test('as an answer, the run did not happen', () => {
    const { runner } = fakeRunner({ fetch: fakeNeverExited('timeout') })
    const r = runner.run(['fetch'], { cwd })
    expect(ran(r)).toBe(false)
    expect(r).toMatchObject({ stdout: '', stderr: '', reason: 'timeout' })
  })
})

describe('fakeProcess', () => {
  test('defaults: a positive pid, and kill() ends it as an abort', async () => {
    const proc = fakeProcess()
    expect(proc.pid).toBe(4242)
    proc.kill('SIGINT')
    expect(await proc.exited).toEqual({
      exitCode: 1,
      signal: 'SIGINT',
      neverExited: true,
      reason: 'abort',
    })
  })

  test('a numeric signal is reported by name; signal 0 and unknown numbers end nothing', async () => {
    const proc = fakeProcess({ pid: 7 })
    proc.kill(0)
    proc.kill(999)
    proc.kill(9)
    expect(proc.signals).toEqual([0, 999, 9])
    expect((await proc.exited).signal).toBe('SIGKILL')
  })

  test('only the first end counts', async () => {
    const proc = fakeProcess()
    proc.exit({ exitCode: 3 })
    proc.kill()
    proc.exit({ exitCode: 4 })
    expect(await proc.exited).toEqual({ exitCode: 3, signal: null })
    expect(proc.signals).toEqual(['SIGTERM'])
  })

  test('exitOnKill: false records the signal and keeps running', async () => {
    const proc = fakeProcess({ exitOnKill: false })
    let done = false
    void proc.exited.then(() => (done = true))
    proc.kill()
    await Promise.resolve()
    expect(done).toBe(false)
    proc.exit({ exitCode: 1, signal: 'SIGKILL', neverExited: true, reason: 'signal' })
    expect((await proc.exited).reason).toBe('signal')
  })

  test('exitOnKill as a list: only those signals end it, numbers included', async () => {
    const proc = fakeProcess({ exitOnKill: ['SIGKILL'] })
    let done = false
    void proc.exited.then(() => (done = true))
    proc.kill()
    proc.kill('SIGINT')
    await Promise.resolve()
    expect(done).toBe(false)
    proc.kill(9)
    expect(await proc.exited).toEqual({
      exitCode: 1,
      signal: 'SIGKILL',
      neverExited: true,
      reason: 'abort',
    })
    expect(proc.signals).toEqual(['SIGTERM', 'SIGINT', 9])
  })

  test('exitOnKill: [] is the same as false', async () => {
    const proc = fakeProcess({ exitOnKill: [] })
    proc.kill('SIGKILL')
    proc.exit({ exitCode: 0 })
    expect(await proc.exited).toEqual({ exitCode: 0, signal: null })
  })

  test('stopProcess escalates to SIGKILL on a fake that survives SIGTERM', async () => {
    const proc = fakeProcess({ exitOnKill: ['SIGKILL'] })
    expect((await stopProcess(proc, { graceMs: 1 })).signal).toBe('SIGKILL')
    expect(proc.signals).toEqual(['SIGTERM', 'SIGKILL'])
  })

  test('runner returns the same handle and records each call', () => {
    const proc = fakeProcess()
    const a = proc.runner.run(['a'], { cwd, processGroup: true })
    const b = proc.runner.run(['b'], { cwd })
    expect(a).toBe(b)
    expect(proc.calls).toEqual([
      { argv: ['a'], opts: { cwd, processGroup: true } },
      { argv: ['b'], opts: { cwd } },
    ])
  })
})
