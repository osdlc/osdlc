/**
 * Follow what happened on a pull request: comments, reviews and their inline
 * comments, commits and changes of state, as one list in timeline order.
 * `prActivity` is experimental. Pass `since` to read only what is new.
 */

import { expect, test } from 'vitest'

import {
  Gh,
  prActivity,
  type CommandRunner,
  type PrActivityItem,
  type PrActivityKind,
  type PrActivityOptions,
} from '@osdlc/typed-gh'

/** What `gh api graphql --paginate --slurp` prints for a one-page timeline. */
const timeline = (nodes: unknown[]) =>
  JSON.stringify([{ data: { repository: { pullRequest: { timelineItems: { nodes } } } } }])

test("a pull request's activity, and what is new since the last look", () => {
  const runner: CommandRunner = {
    run: () => ({
      exitCode: 0,
      stdout: timeline([
        {
          __typename: 'IssueComment',
          id: 'IC_1',
          author: { __typename: 'User', login: 'octocat' },
          createdAt: '2026-11-05T09:30:00Z',
          body: 'Rebased onto main.',
        },
        {
          __typename: 'PullRequestReview',
          id: 'PRR_1',
          author: { __typename: 'Bot', login: 'review-bot' },
          state: 'CHANGES_REQUESTED',
          submittedAt: '2026-11-05T10:00:00Z',
          comments: {
            totalCount: 1,
            nodes: [{ id: 'PRRC_1', path: 'src/fetch.ts', line: 12, body: 'Retry here too?' }],
          },
        },
        {
          __typename: 'MergedEvent',
          id: 'ME_1',
          createdAt: '2026-11-05T11:00:00Z',
          commit: { oid: 'abc1234' },
        },
      ]),
      stderr: '',
    }),
  }
  const gh = new Gh({ repo: 'acme/widgets', runner })

  const opts: PrActivityOptions = { since: '2026-11-05T09:00:00Z' }
  const activity = gh.prActivity(9, opts)
  const rows: PrActivityItem[] = activity?.rows ?? []

  const kinds: PrActivityKind[] = rows.map((r) => r.kind)
  expect(kinds).toEqual(['comment', 'review', 'review-comment', 'merged'])
  expect(activity?.truncated).toBe(false)

  // Narrow on `kind` to read a kind's own fields.
  const asks = rows.flatMap((r) => (r.kind === 'review-comment' ? [`${r.path}:${r.line}`] : []))
  expect(asks).toEqual(['src/fetch.ts:12'])
  expect(rows.some((r) => r.actor?.isBot === true)).toBe(true)

  // The verb is data: `since` goes to GitHub in UTC.
  expect(prActivity(9, opts).argv).toContain('since=2026-11-05T09:00:00.000Z')
})
