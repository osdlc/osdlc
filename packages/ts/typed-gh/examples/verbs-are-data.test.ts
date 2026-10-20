/**
 * A verb is plain data: the argv to run, whether a failure should throw, and
 * a parser for the result. Nothing runs until you hand it to a runner, so you
 * can drive the same verbs with your own runner, sync or async.
 */

import { expect, test } from 'bun:test'

import {
  PR_REF_FIELDS,
  api,
  authStatus,
  createPr,
  editPr,
  editPrBody,
  issueView,
  openPrsForBranch,
  prBody,
  prComment,
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
  type PullRequest,
} from '@osdlc/typed-gh'

const options: CommandRunOptions = { cwd: '/repo', timeoutMs: 5_000 }

test('run a verb on your own async runner', async () => {
  const runner: AsyncCommandRunner = {
    run: async () => ({ exitCode: 0, stdout: '[{"number":7}]', stderr: '' }),
  }
  const verb: GhVerb<PullRequest[] | null> = prList({ state: 'open', limit: 10 })

  const result = await runner.run(verb.argv, options)

  expect(verb.argv).toEqual([
    'pr',
    'list',
    '--state',
    'open',
    '--json',
    expect.stringContaining('number,'),
    '--limit',
    '10',
  ])
  expect(verb.parse(result)?.map((pr) => pr.number)).toEqual([7])
})

test('queries are unchecked and mutations are checked', () => {
  // A checked verb is one your runner should treat a non-zero exit as a failure for.
  const queries = [
    prList(),
    prView(7),
    prBody(7),
    issueView(7),
    api('repos/{owner}/{repo}'),
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
  ]

  expect(queries.every((verb) => !verb.checked)).toBe(true)
  expect(mutations.every((verb) => verb.checked)).toBe(true)
})

test('the cheap field set identifies a pull request and nothing more', () => {
  expect(openPrsForBranch('feature/foo').argv).toContain(PR_REF_FIELDS.join(','))
})
