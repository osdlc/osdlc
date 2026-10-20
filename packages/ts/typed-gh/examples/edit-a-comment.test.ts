/**
 * Rewrite one conversation comment. `issueCommentEdit` is experimental. It
 * takes the comment's numeric REST id, as text, not the GraphQL node id that
 * `prView` gives in `Comment.id`.
 */

import { expect, test } from 'bun:test'

import { Gh, type CommandRunner } from '@osdlc/typed-gh'

test('rewrite a comment by its REST id', () => {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return { exitCode: 0, stdout: '{}', stderr: '' }
    },
  }

  new Gh('/repo', { runner }).issueCommentEdit('4204154439', 'Updated: CI is green.')

  expect(calls).toEqual([
    [
      'api',
      '-X',
      'PATCH',
      'repos/{owner}/{repo}/issues/comments/4204154439',
      '-f',
      'body=Updated: CI is green.',
    ],
  ])
})
