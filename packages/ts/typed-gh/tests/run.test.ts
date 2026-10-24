/**
 * `runVerb` / `runVerbAsync`: a verb run through a caller's runner keeps its
 * `env`, `input`, timeout and checked contract, and both clients use them.
 */

import { FailureError } from '@osdlc/result'
import { describe, expect, test } from 'vitest'

import {
  AsyncGh,
  Gh,
  createReview,
  prView,
  repoList,
  runVerb,
  runVerbAsync,
  searchPrs,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunOptions,
  type CommandRunner,
} from '../src/index.ts'

const ok = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '' })

function spy(result: CommandResult) {
  const calls: { argv: string[]; opts: CommandRunOptions | undefined }[] = []
  const runner: CommandRunner & AsyncCommandRunner = {
    run: ((argv: string[], opts?: CommandRunOptions) => {
      calls.push({ argv: [...argv], opts })
      return result
    }) as never,
  }
  return { calls, runner }
}

const HOST = { hostname: 'ghe.example.com' }

describe('runVerb', () => {
  test('passes env, cwd and timeoutMs to the runner', () => {
    const { calls, runner } = spy(ok('[]'))
    runVerb(repoList('acme', {}, HOST), runner, { cwd: '/repo', timeoutMs: 1_000 })
    expect(calls[0]!.opts).toMatchObject({
      cwd: '/repo',
      timeoutMs: 1_000,
      env: { GH_HOST: 'ghe.example.com' },
    })
    const search = spy(ok('[]'))
    runVerb(searchPrs('x', {}, HOST), search.runner, { cwd: '/repo' })
    expect(search.calls[0]!.opts?.env).toEqual({ GH_HOST: 'ghe.example.com' })
  })

  test('passes input (stdin) to the runner', () => {
    const { calls, runner } = spy(ok('{"html_url":"u"}'))
    const verb = createReview(1, { commitId: 'abc', body: 'b', comments: [] })
    runVerb(verb, runner, { cwd: '/repo' })
    expect(calls[0]!.opts?.input).toBe(verb.input)
    expect(verb.input).toBeDefined()
  })

  test('omits options the verb and caller do not set', () => {
    const { calls, runner } = spy(ok('{"number":1}'))
    runVerb(prView('1', ['number']), runner, { cwd: '/repo' })
    expect(calls[0]!.opts).toEqual({ cwd: '/repo' })
  })

  test('throws the classified failure for a failed unchecked read', () => {
    const { runner } = spy({ exitCode: 1, stdout: '', stderr: 'boom' })
    expect(() => runVerb(repoList('acme', {}), runner, { cwd: '/repo' })).toThrow(FailureError)
  })

  test('answers null when gh says there is no such thing', () => {
    const { runner } = spy({ exitCode: 1, stdout: '', stderr: 'no pull requests found for branch' })
    expect(runVerb(prView('1', ['number']), runner, { cwd: '/repo' })).toBeNull()
  })
})

describe('runVerbAsync', () => {
  test('passes env, input, timeoutMs and signal', async () => {
    const { calls, runner } = spy(ok('{"html_url":"u"}'))
    const signal = new AbortController().signal
    const verb = createReview(1, { commitId: 'abc', body: 'b', comments: [] })
    await runVerbAsync(verb, runner, { cwd: '/repo', timeoutMs: 7, signal })
    expect(calls[0]!.opts).toMatchObject({
      cwd: '/repo',
      timeoutMs: 7,
      signal,
      input: verb.input,
    })
  })

  test('rejects with the classified failure', async () => {
    const { runner } = spy({ exitCode: 1, stdout: '', stderr: 'boom' })
    await expect(runVerbAsync(repoList('acme', {}), runner, { cwd: '/repo' })).rejects.toThrow(
      FailureError,
    )
  })
})

describe('the clients go through it', () => {
  test('Gh and AsyncGh send the host as env', async () => {
    const a = spy(ok('[]'))
    new Gh('/repo', { runner: a.runner, ...HOST }).repoList('acme')
    const b = spy(ok('[]'))
    await new AsyncGh('/repo', { runner: b.runner, ...HOST }).repoList('acme')
    expect(a.calls[0]!.opts?.env).toEqual({ GH_HOST: 'ghe.example.com' })
    expect(b.calls[0]!.opts?.env).toEqual({ GH_HOST: 'ghe.example.com' })
  })
})
