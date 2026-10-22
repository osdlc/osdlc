/**
 * Merge a pull request only if its head is still the commit you judged, and
 * check its review threads first. The branch is not deleted; that is yours
 * to do.
 */

import { expect, test } from 'vitest'

import {
  CommandFailed,
  Gh,
  type CommandResult,
  type CommandRunner,
  type PrMergeMethod,
  type ReviewThread,
} from '@osdlc/typed-gh'

/** A runner that records each call's argv and answers every call with `result`. */
function answering(result: CommandResult) {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return result
    },
  }
  return { runner, calls }
}

test('merge, pinned to the head commit that was judged', () => {
  const { runner, calls } = answering({ exitCode: 0, stdout: '', stderr: '' })
  const method: PrMergeMethod = 'squash'

  new Gh('/repo', { runner }).prMerge(9, { method, headSha: 'abc1234' })

  expect(calls).toEqual([['pr', 'merge', '9', '--squash', '--match-head-commit', 'abc1234']])
})

test('GitHub refuses the merge when the head moved, and that throws', () => {
  const { runner } = answering({ exitCode: 1, stdout: '', stderr: 'head commit changed' })

  expect(() => new Gh('/repo', { runner }).prMerge(9, { method: 'merge', headSha: 'abc' })).toThrow(
    CommandFailed,
  )
})

const threadsReply = JSON.stringify({
  data: {
    repository: {
      pullRequest: {
        reviewThreads: {
          pageInfo: { hasNextPage: false },
          nodes: [
            {
              isResolved: true,
              isOutdated: false,
              comments: { nodes: [{ author: { login: 'a' } }] },
            },
            {
              isResolved: false,
              isOutdated: false,
              comments: { nodes: [{ author: { login: 'b' } }] },
            },
          ],
        },
      },
    },
  },
})

test('read the review threads, and see which are still open', () => {
  const { runner } = answering({ exitCode: 0, stdout: threadsReply, stderr: '' })

  const threads: ReviewThread[] | null = new Gh('/repo', { runner }).prReviewThreads(9)

  expect(threads?.filter((t) => !t.isResolved).map((t) => t.lastCommentAuthor)).toEqual(['b'])
})

test('threads that could not be read in full throw, which is not "no threads"', () => {
  const { runner } = answering({ exitCode: 1, stdout: '', stderr: 'boom' })

  expect(() => new Gh('/repo', { runner }).prReviewThreads(9)).toThrow()
  expect(new Gh('/repo', { runner }).soft.prReviewThreads(9)).toBeNull()
})
