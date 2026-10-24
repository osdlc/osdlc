/**
 * Run a verb through a runner of your own. `runVerb` applies everything the
 * verb carries: its `env` (the host, as `GH_HOST`), its `input` (a review's
 * payload on stdin), its timeout and its checked contract. Calling
 * `verb.parse(runner.run(verb.argv))` yourself drops `env` and `input`
 * without an error. `runVerbAsync` is the same for an `AsyncCommandRunner`.
 */

import { expect, test } from 'vitest'

import {
  repoList,
  runVerb,
  runVerbAsync,
  type AsyncCommandRunner,
  type CommandRunOptions,
  type CommandRunner,
  type RunVerbAsyncOptions,
  type RunVerbOptions,
} from '@osdlc/typed-gh'

// A plain `(binary, argv, opts) => result` function becomes a runner like this.
const exec = (_binary: string, _argv: string[], _opts: CommandRunOptions) => ({
  exitCode: 0,
  stdout: '[]',
  stderr: '',
})
const runner: CommandRunner = { run: (argv, opts) => exec('gh', argv, opts ?? {}) }

const options: RunVerbOptions = { cwd: '/repo', timeoutMs: 5_000 }
const asyncOptions: RunVerbAsyncOptions = { ...options, signal: new AbortController().signal }

test('the host reaches the runner as env', () => {
  let seen: CommandRunOptions | undefined
  const spy: CommandRunner = {
    run: (argv, opts) => {
      seen = opts
      return runner.run(argv, opts)
    },
  }
  const verb = repoList('acme', {}, { hostname: 'ghe.example.com' })

  expect(runVerb(verb, spy, options)).toEqual({ rows: [], truncated: false })
  expect(seen?.env?.GH_HOST).toBe('ghe.example.com')
  expect(seen?.timeoutMs).toBe(5_000)
})

test('the async form does the same', async () => {
  let seen: CommandRunOptions | undefined
  const asyncRunner: AsyncCommandRunner = {
    run: async (argv, opts) => {
      seen = opts
      return runner.run(argv, opts)
    },
  }
  const verb = repoList('acme', {}, { hostname: 'ghe.example.com' })

  await runVerbAsync(verb, asyncRunner, asyncOptions)
  expect(seen?.env?.GH_HOST).toBe('ghe.example.com')
})
