/**
 * `AsyncGh` has the same methods as `Gh`, and returns Promises. Use it to ask
 * about many branches at once without blocking the event loop. Queries take
 * `AsyncCallOptions`: a timeout and an `AbortSignal`.
 */

import { expect, test } from 'bun:test'

import {
  AsyncGh,
  type AsyncCallOptions,
  type AsyncCommandRunner,
  type PullRequest,
} from '@osdlc/typed-gh'

test('find the open pull request for each branch at once', async () => {
  const runner: AsyncCommandRunner = {
    run: async (argv) => {
      // gh's head: search is a prefix match; openPrFor keeps the exact branch.
      const head = argv[argv.indexOf('--search') + 1]!.slice('head:'.length)
      const rows = head === 'feature/a' ? [{ number: 1, headRefName: 'feature/a' }] : []
      return { exitCode: 0, stdout: JSON.stringify(rows), stderr: '' }
    },
  }
  const gh = new AsyncGh('/repo', { runner })
  const call: AsyncCallOptions = { timeoutMs: 10_000, signal: new AbortController().signal }

  const prs: (PullRequest | null)[] = await Promise.all(
    ['feature/a', 'feature/b'].map((branch) => gh.openPrFor(branch, { limit: 3, ...call })),
  )

  expect(prs.map((pr) => pr?.number ?? null)).toEqual([1, null])
})
