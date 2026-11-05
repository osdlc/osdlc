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
  prDiff,
  prView,
  raw,
  rawChecked,
  repoList,
  runVerb,
  runVerbAsync,
  searchPrs,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunOptions,
  type CommandRunner,
  type GhFailure,
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

describe('raw and rawChecked as verbs', () => {
  const FAIL: CommandResult = { exitCode: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' }
  const NO_GH: CommandResult = {
    exitCode: 1,
    stdout: '',
    stderr: '',
    neverExited: true,
    reason: 'spawn',
    error: 'spawn gh ENOENT',
  }
  const PARTIAL: CommandResult = { ...ok('half'), outputIncomplete: true }
  const opts = { cwd: '/repo' }

  /** The `GhFailure` that `run` throws or rejects with. */
  async function failureOf(run: () => unknown): Promise<GhFailure> {
    try {
      await run()
    } catch (error) {
      if (error instanceof FailureError) return error.failure as GhFailure
      throw error
    }
    throw new Error('expected a failure')
  }

  test('raw runs argv as given, adding no --repo, host or stdin', () => {
    const { calls, runner } = spy(ok('x'))
    runVerb(raw(['api', 'user']), runner, { cwd: '/repo', timeoutMs: 3 })
    expect(calls).toEqual([{ argv: ['api', 'user'], opts: { cwd: '/repo', timeoutMs: 3 } }])
  })

  test('the verbs copy argv, so a later change to the array does not reach the run', () => {
    const argv = ['api', 'user']
    const a = raw(argv)
    const b = rawChecked(argv)
    argv.push('--paginate')
    expect(a.argv).toEqual(['api', 'user'])
    expect(b.argv).toEqual(['api', 'user'])
  })

  test('raw returns the result as it came: a failure, gh missing, output cut short', async () => {
    for (const result of [ok('fine'), FAIL, NO_GH, PARTIAL]) {
      expect(runVerb(raw(['x']), spy(result).runner, opts)).toEqual(result)
      expect(await runVerbAsync(raw(['x']), spy(result).runner, opts)).toEqual(result)
    }
  })

  test('rawChecked returns the result when gh exits 0 with its whole output', async () => {
    expect(runVerb(rawChecked(['x']), spy(ok('fine')).runner, opts).stdout).toBe('fine')
    expect(await runVerbAsync(rawChecked(['x']), spy(ok('')).runner, opts)).toEqual(ok(''))
  })

  test('rawChecked throws the classified failure, with argv, for a non-zero exit', async () => {
    const thrown = await failureOf(() =>
      runVerb(rawChecked(['api', 'user']), spy(FAIL).runner, opts),
    )
    expect(thrown).toMatchObject({ kind: 'not-authenticated', argv: ['api', 'user'], exitCode: 1 })
    const rejected = await failureOf(() =>
      runVerbAsync(rawChecked(['api', 'user']), spy(FAIL).runner, opts),
    )
    expect(rejected).toEqual(thrown)
  })

  test('rawChecked throws not-installed when gh never ran', async () => {
    const failure = await failureOf(() => runVerb(rawChecked(['x']), spy(NO_GH).runner, opts))
    expect(failure.kind).toBe('not-installed')
    expect(failure.hint).toContain('https://cli.github.com')
  })

  test('rawChecked throws for output cut short, though gh exited 0', async () => {
    expect(() => runVerb(rawChecked(['x']), spy(PARTIAL).runner, opts)).toThrow(FailureError)
    await expect(runVerbAsync(rawChecked(['x']), spy(PARTIAL).runner, opts)).rejects.toThrow(
      FailureError,
    )
  })

  test('runVerbAsync passes the signal and timeout to both', async () => {
    const signal = new AbortController().signal
    for (const verb of [raw(['x']), rawChecked(['x'])]) {
      const { calls, runner } = spy(ok(''))
      await runVerbAsync(verb, runner, { cwd: '/repo', timeoutMs: 4, signal })
      expect(calls[0]!.opts).toEqual({ cwd: '/repo', timeoutMs: 4, signal })
    }
  })

  test('a tool needs no Gh for a diff and a raw checked call', () => {
    const { calls, runner } = spy(ok('the diff'))
    expect(runVerb(prDiff(7), runner, opts)).toBe('the diff')
    runVerb(rawChecked(['api', 'repos/{owner}/{repo}/pulls/7/files']), runner, opts)
    expect(calls.map((c) => c.argv)).toEqual([
      ['pr', 'diff', '7'],
      ['api', 'repos/{owner}/{repo}/pulls/7/files'],
    ])
  })
})

describe('the clients go through it', () => {
  test('Gh and AsyncGh run raw and rawChecked as the verbs do', async () => {
    const want = spy(ok('x'))
    runVerb(raw(['api', 'user']), want.runner, { cwd: '/repo', timeoutMs: 5 })
    runVerb(rawChecked(['api', 'user']), want.runner, { cwd: '/repo', timeoutMs: 5 })
    const a = spy(ok('x'))
    const gh = new Gh('/repo', { runner: a.runner })
    expect(gh.raw(['api', 'user'], { timeoutMs: 5 })).toEqual(ok('x'))
    expect(gh.rawChecked(['api', 'user'], { timeoutMs: 5 })).toEqual(ok('x'))
    const b = spy(ok('x'))
    const agh = new AsyncGh('/repo', { runner: b.runner })
    expect(await agh.raw(['api', 'user'], { timeoutMs: 5 })).toEqual(ok('x'))
    expect(await agh.rawChecked(['api', 'user'], { timeoutMs: 5 })).toEqual(ok('x'))
    expect(a.calls).toEqual(want.calls)
    expect(b.calls).toEqual(want.calls)
  })

  test('AsyncGh.raw rejects, and does not throw, when the runner throws', async () => {
    const throwing: AsyncCommandRunner = {
      run: () => {
        throw new Error('runner broke')
      },
    }
    const agh = new AsyncGh('/repo', { runner: throwing })
    const pending = agh.raw(['x'])
    await expect(pending).rejects.toThrow('runner broke')
    await expect(agh.rawChecked(['x'])).rejects.toThrow('runner broke')
  })

  test('Gh and AsyncGh send the host as env and the timeout through', async () => {
    const a = spy(ok('[]'))
    new Gh('/repo', { runner: a.runner, ...HOST }).repoList('acme', { timeoutMs: 9 })
    const b = spy(ok('[]'))
    await new AsyncGh('/repo', { runner: b.runner, ...HOST }).repoList('acme', { timeoutMs: 9 })
    for (const { calls } of [a, b]) {
      expect(calls[0]!.opts).toMatchObject({ timeoutMs: 9, env: { GH_HOST: 'ghe.example.com' } })
    }
  })

  test('openPrFor passes its timeout through on both clients', async () => {
    const a = spy(ok('[]'))
    new Gh('/repo', { runner: a.runner }).openPrFor('feature/x', { timeoutMs: 7 })
    const b = spy(ok('[]'))
    await new AsyncGh('/repo', { runner: b.runner }).openPrFor('feature/x', { timeoutMs: 7 })
    for (const { calls } of [a, b]) expect(calls[0]!.opts?.timeoutMs).toBe(7)
  })
})

describe('output cut short (outputIncomplete) is a failure', () => {
  const PARTIAL: CommandResult = {
    exitCode: 0,
    stdout: 'diff --git a/x b/x\n',
    stderr: '',
    outputIncomplete: true,
  }

  test('a checked verb, an unchecked read and rawChecked throw; try and soft report it', () => {
    const gh = new Gh('/repo', { runner: spy(PARTIAL).runner })
    expect(() => gh.prDiff(7)).toThrow(FailureError)
    expect(() => gh.prList()).toThrow(FailureError)
    expect(() => gh.rawChecked(['pr', 'diff', '7'])).toThrow(FailureError)
    expect(gh.try.prList().ok).toBe(false)
    expect(gh.soft.prView(7)).toBeNull()
  })

  test('AsyncGh rejects the same way', async () => {
    const gh = new AsyncGh('/repo', { runner: spy(PARTIAL).runner })
    await expect(gh.prDiff(7)).rejects.toBeInstanceOf(FailureError)
    await expect(gh.prList()).rejects.toBeInstanceOf(FailureError)
    await expect(gh.rawChecked(['pr', 'diff', '7'])).rejects.toBeInstanceOf(FailureError)
    expect((await gh.try.prList()).ok).toBe(false)
    expect(await gh.soft.prView(7)).toBeNull()
  })

  test('runVerb throws for it', () => {
    expect(() => runVerb(prView(7), spy(PARTIAL).runner, { cwd: '/repo' })).toThrow(FailureError)
  })
})
