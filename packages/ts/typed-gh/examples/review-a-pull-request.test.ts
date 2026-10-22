/**
 * Read a pull request's diff, then post a review with an inline comment.
 * `createReview` is experimental: it always posts a `COMMENT` review, and each
 * inline comment sits on one line of the new side of the diff.
 */

import { expect, test } from 'vitest'

import {
  Gh,
  type CommandRunner,
  type CreateReviewOptions,
  type ReviewComment,
} from '@osdlc/typed-gh'

test('read the diff and post a review', () => {
  const calls: { argv: string[]; input: string | undefined }[] = []
  const runner: CommandRunner = {
    run(argv, opts) {
      calls.push({ argv, input: opts?.input })
      const stdout =
        argv[0] === 'pr'
          ? 'diff --git a/src/fetch.ts b/src/fetch.ts\n'
          : JSON.stringify({
              html_url: 'https://github.com/acme/widgets/pull/9#pullrequestreview-1',
            })
      return { exitCode: 0, stdout, stderr: '' }
    },
  }
  const gh = new Gh('/repo', { runner })

  const diff = gh.prDiff(9)
  const comment: ReviewComment = { path: 'src/fetch.ts', line: 12, body: 'Retry here too?' }
  const review: CreateReviewOptions = {
    commitId: 'abc1234',
    body: 'One question.',
    comments: [comment],
  }
  const url = gh.createReview(9, review)

  expect(diff).toContain('src/fetch.ts')
  expect(url).toBe('https://github.com/acme/widgets/pull/9#pullrequestreview-1')
  expect(calls[0]!.argv).toEqual(['pr', 'diff', '9'])
  expect(calls[1]!.argv).toEqual([
    'api',
    '--method',
    'POST',
    'repos/{owner}/{repo}/pulls/9/reviews',
    '--input',
    '-',
  ])
  expect(JSON.parse(calls[1]!.input!)).toEqual({
    commit_id: 'abc1234',
    body: 'One question.',
    event: 'COMMENT',
    comments: [{ path: 'src/fetch.ts', line: 12, side: 'RIGHT', body: 'Retry here too?' }],
  })
})
