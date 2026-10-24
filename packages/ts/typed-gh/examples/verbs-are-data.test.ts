/**
 * A verb is plain data: the argv to run, whether a failure should throw, and
 * a parser for the result. Nothing runs until you hand it to a runner, so you
 * can drive the same verbs with your own runner, sync or async.
 */

import { expect, test } from 'vitest'

import {
  PR_REF_FIELDS,
  api,
  authStatus,
  createLabel,
  createPr,
  createReview,
  editLabel,
  editPr,
  editPrBody,
  installed,
  issueCommentEdit,
  issueList,
  issueView,
  labelList,
  openPrsForBranch,
  prBody,
  prComment,
  prDiff,
  prList,
  prMerge,
  prReviewThreads,
  prSetDraft,
  prUpdateBranch,
  prView,
  setIssueLabel,
  type AsyncCommandRunner,
  type CommandRunOptions,
  type GhVerb,
  type ListResult,
  type PullRequest,
} from '@osdlc/typed-gh'

const options: CommandRunOptions = { cwd: '/repo', timeoutMs: 5_000 }

test('run a verb on your own async runner', async () => {
  const runner: AsyncCommandRunner = {
    run: async () => ({ exitCode: 0, stdout: '[{"number":7}]', stderr: '' }),
  }
  const verb: GhVerb<ListResult<PullRequest> | null> = prList({ state: 'open', limit: 10 })

  const result = await runner.run(verb.argv, options)

  expect(verb.argv).toEqual([
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    expect.stringContaining('number,'),
    '--limit',
    '11',
  ])
  expect(verb.parse(result)?.rows.map((pr) => pr.number)).toEqual([7])
})

test('queries are unchecked and mutations are checked', () => {
  // For a checked verb, your runner should treat a non-zero exit as a failure.
  const queries = [
    prList(),
    prView(7),
    prBody(7),
    issueView(7),
    issueList({ label: 'bug', limit: 20 }),
    labelList({ limit: 50 }),
    api('repos/{owner}/{repo}'),
    installed(),
    authStatus(),
    prReviewThreads(7),
    openPrsForBranch('feature/foo'),
  ]
  const mutations = [
    createPr({ head: 'h', base: 'main', title: 't', body: 'b' }),
    editPr(7, { title: 't' }),
    editPrBody(7, 'b'),
    prComment(7, 'c'),
    prUpdateBranch(7),
    prSetDraft(7, false),
    prMerge(7, { method: 'squash', headSha: 'abc1234' }),
    setIssueLabel(7, null, 'status:triage'),
    createLabel({ name: 'bug', color: 'd73a4a', description: 'Something is wrong' }),
    editLabel('bug', { color: 'ffffff' }),
    issueCommentEdit('4204154439', 'new text'),
    createReview(7, { commitId: 'abc1234', body: 'Looks fine.', comments: [] }),
    // A read, but checked. An empty diff is a value, and a failed call throws.
    prDiff(7),
  ]

  expect(queries.every((verb) => !verb.checked)).toBe(true)
  expect(mutations.every((verb) => verb.checked)).toBe(true)
})

test('the cheap field set identifies a pull request and nothing more', () => {
  expect(openPrsForBranch('feature/foo').argv).toContain(PR_REF_FIELDS.join(','))
})
