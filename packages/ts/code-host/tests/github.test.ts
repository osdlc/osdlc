/**
 * Tests for `GithubCodeHost` (`../src/github.ts`): the mapping from `@osdlc/typed-gh`'s
 * `PullRequest` shape to `CodeHostPr` and `PrFacts`, and the REST calls the adapter
 * makes through `gh api`. All calls go through a fake `CommandRunner`, so nothing
 * touches the network.
 */

import { describe, expect, test } from 'vitest'

import { actionsJobId, detectBlockedChecks, codeHostPrFrom, GithubCodeHost } from '../src/github.ts'
import { CommentNotFoundError } from '../src/types.ts'
import { Gh } from '@osdlc/typed-gh'
import { FailureError, unwrap } from '@osdlc/result'
import type { CommandResult, CommandRunner } from '@osdlc/command-seam'
import type { PullRequest } from '@osdlc/typed-gh'

function ok(stdout: string): CommandResult {
  return { exitCode: 0, stdout, stderr: '' }
}

function fail(stderr = 'gh failed'): CommandResult {
  return { exitCode: 1, stdout: '', stderr }
}

/** One `--slurp`ed `prActivity` page with these timeline nodes and review threads. */
function activityPage(nodes: unknown[], threads: unknown[] = []) {
  return {
    data: {
      repository: {
        pullRequest: {
          timelineItems: { nodes },
          reviewThreads: { totalCount: threads.length, nodes: threads },
        },
      },
    },
  }
}

/**
 * Scripts `pr view` and `pr list` from fixed payloads, and `prActivity`'s GraphQL call from
 * `activity` (no activity by default). Any other `api` call reads `restResponses`, shifted in
 * call order.
 */
function fakeGh(opts: {
  view?: Record<string, unknown> | null
  list?: Record<string, unknown>[] | null
  activity?: CommandResult
  restResponses?: CommandResult[]
}): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = []
  let restIdx = 0
  const restResponses = opts.restResponses ?? [ok('[]')]
  const activity = opts.activity ?? ok(JSON.stringify([activityPage([])]))
  return {
    calls,
    runner: {
      run(argv) {
        calls.push([...argv])
        if (argv[0] === 'pr' && argv[1] === 'view') {
          return opts.view === undefined || opts.view === null
            ? fail('not found')
            : ok(JSON.stringify(opts.view))
        }
        if (argv[0] === 'pr' && argv[1] === 'list') {
          return opts.list === undefined || opts.list === null
            ? fail()
            : ok(JSON.stringify(opts.list))
        }
        if (argv[0] === 'api' && argv[1] === 'graphql') return activity
        if (argv[0] === 'api') {
          const r = restResponses[Math.min(restIdx, restResponses.length - 1)]!
          restIdx += 1
          return r
        }
        return ok('')
      },
    },
  }
}

const BASE_PR = {
  number: 42,
  state: 'OPEN',
  title: 't',
  url: 'https://github.com/o/r/pull/42',
  isDraft: false,
  baseRefName: 'main',
  headRefName: 'task/x',
  headRefOid: 'sha1',
  isCrossRepository: false,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  reviewDecision: '',
  author: { login: 'author-one' },
  labels: [],
  statusCheckRollup: [],
  comments: [],
  reviews: [],
  mergedAt: null,
  createdAt: null,
  updatedAt: null,
}

describe('GithubCodeHost.getPr', () => {
  test('maps a settled PR and its activity to CodeHostPr', () => {
    const { runner, calls } = fakeGh({ view: BASE_PR })
    const pr = unwrap(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null }))

    expect(pr).not.toBeNull()
    expect(pr!.number).toBe(42)
    expect(pr!.state).toBe('open')
    expect(pr!.mergeable).toBe('mergeable')
    expect(pr!.reviewDecision).toBeNull()
    expect(pr!.headRef).toBe('task/x')
    expect(pr!.headSha).toBe('sha1')
    expect(pr!.activity).toEqual([])
    expect(calls[0]).toEqual(['pr', 'view', '42', '--json', expect.anything()])
    // Comments and reviews come from `prActivity`, not `pr view`.
    expect(calls[0]![4]!.split(',')).not.toContain('comments')
    expect(calls[1]!.slice(0, 2)).toEqual(['api', 'graphql'])
  })

  test('activity: comments and reviews keep node ids; an inline comment takes REST ids', () => {
    const user = (login: string) => ({ __typename: 'User', login })
    const text = (restId: string, body: string) => ({
      fullDatabaseId: restId,
      body,
      lastEditedAt: null,
      url: `https://github.com/o/r/pull/42#${restId}`,
    })
    const inline = {
      id: 'PRRC_1',
      author: user('reviewer'),
      createdAt: '2026-01-01T00:00:00Z',
      ...text('9', 'nit'),
      lastEditedAt: '2026-01-01T00:05:00Z',
      path: 'a.ts',
      line: null,
      originalLine: 3,
      outdated: true,
      replyTo: null,
    }
    const review = {
      __typename: 'PullRequestReview',
      id: 'PRR_1',
      author: user('reviewer'),
      state: 'COMMENTED',
      submittedAt: '2026-01-01T00:01:00Z',
      ...text('55', ''),
      comments: { totalCount: 1, nodes: [inline] },
    }
    // A reply-only review: GitHub's timeline leaves it out, the review threads hold it.
    const reply = {
      ...inline,
      id: 'PRRC_2',
      author: { __typename: 'Bot', login: 'github-actions' },
      createdAt: '2026-01-01T00:10:00Z',
      ...text('10', 'fixed'),
      replyTo: { id: 'PRRC_1', fullDatabaseId: '9' },
      pullRequestReview: {
        ...review,
        id: 'PRR_2',
        submittedAt: '2026-01-01T00:10:00Z',
        ...text('56', ''),
      },
    }
    const comment = {
      __typename: 'IssueComment',
      id: 'IC_1',
      author: user('author-one'),
      createdAt: '2026-01-01T00:20:00Z',
      ...text('4204154439', 'thanks'),
      lastEditedAt: '2026-01-01T00:21:00Z',
    }
    const commit = {
      __typename: 'PullRequestCommit',
      id: 'PURC_1',
      commit: { oid: 'abc', committedDate: '2026-01-01T00:15:00Z', messageHeadline: 'fix' },
    }
    const thread = {
      comments: { totalCount: 2, nodes: [{ ...inline, pullRequestReview: review }, reply] },
    }
    const { runner } = fakeGh({
      view: BASE_PR,
      activity: ok(JSON.stringify([activityPage([review, commit, comment], [thread])])),
    })
    const pr = unwrap(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null }))!
    expect(pr.activity.map((a) => [a.kind, a.id])).toEqual([
      ['review', 'PRR_1'],
      ['review-comment', '9'],
      ['review', 'PRR_2'],
      ['review-comment', '10'],
      ['comment', 'IC_1'],
    ])
    expect(pr.activity[1]).toEqual({
      id: '9',
      kind: 'review-comment',
      author: { login: 'reviewer', isBot: false },
      at: '2026-01-01T00:00:00Z',
      editedAt: '2026-01-01T00:05:00Z',
      body: 'nit',
      reviewState: null,
      location: { file: 'a.ts', line: 3, threadId: '9', url: 'https://github.com/o/r/pull/42#9' },
    })
    expect(pr.activity[3]).toMatchObject({
      author: { login: 'github-actions', isBot: true },
      location: { threadId: '9' },
    })
    expect(pr.activity[0]).toMatchObject({ reviewState: 'COMMENTED', location: null })
    expect(pr.activity[4]).toMatchObject({ editedAt: '2026-01-01T00:21:00Z', body: 'thanks' })
  })

  test('activity that cannot be read is a failure, never less activity', () => {
    const { runner } = fakeGh({ view: BASE_PR, activity: ok(JSON.stringify([{ data: {} }])) })
    expect(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null })).toMatchObject({
      ok: false,
      error: { kind: 'unreadable', host: 'github' },
    })
  })

  test('a failed activity call is a failure', () => {
    const { runner } = fakeGh({ view: BASE_PR, activity: fail('HTTP 502') })
    expect(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null })).toMatchObject({
      ok: false,
      error: { host: 'github' },
    })
  })

  test('a PR gone by the time its activity is read is absent', () => {
    const { runner } = fakeGh({
      view: BASE_PR,
      activity: fail('gh: Could not resolve to a PullRequest with the number of 42.'),
    })
    expect(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null })).toEqual({
      ok: true,
      value: null,
    })
  })

  test('mergeStateStatus DIRTY maps to conflicting even when mergeable alone would not', () => {
    const { runner } = fakeGh({
      view: { ...BASE_PR, mergeable: 'UNKNOWN', mergeStateStatus: 'DIRTY' },
    })
    const codeHost = new GithubCodeHost('/repo', { runner })
    expect(unwrap(codeHost.getPr(42, { since: null }))!.mergeable).toBe('conflicting')
  })

  test('a failed gh is a failure, not an absent PR', () => {
    const { runner } = fakeGh({ view: null })
    const codeHost = new GithubCodeHost('/repo', { runner })
    expect(codeHost.getPr(42, { since: null })).toMatchObject({
      ok: false,
      error: { kind: 'exit', host: 'github' },
    })
  })

  test('checks rollup: any failure wins, else any pending, else none/success', () => {
    const failing = fakeGh({
      view: {
        ...BASE_PR,
        statusCheckRollup: [
          { name: 'a', conclusion: 'SUCCESS' },
          { name: 'b', conclusion: 'FAILURE' },
        ],
      },
    }).runner
    const pr1 = unwrap(new GithubCodeHost('/repo', { runner: failing }).getPr(42, { since: null }))!
    expect(pr1.checks.rollup).toBe('failure')
    expect(pr1.checks.failing).toEqual(['b'])

    const pending = fakeGh({
      view: {
        ...BASE_PR,
        statusCheckRollup: [{ name: 'a', status: 'IN_PROGRESS', conclusion: null }],
      },
    }).runner
    const pr2 = unwrap(new GithubCodeHost('/repo', { runner: pending }).getPr(42, { since: null }))!
    expect(pr2.checks.rollup).toBe('pending')

    const none = fakeGh({ view: { ...BASE_PR, statusCheckRollup: [] } }).runner
    const pr3 = unwrap(new GithubCodeHost('/repo', { runner: none }).getPr(42, { since: null }))!
    expect(pr3.checks.rollup).toBe('none')
  })

  test('a failing check with a detailsUrl surfaces in failingUrls', () => {
    const { runner } = fakeGh({
      view: {
        ...BASE_PR,
        statusCheckRollup: [
          { name: 'build', conclusion: 'FAILURE', detailsUrl: 'https://x/build' },
        ],
      },
    })
    const pr = unwrap(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null }))!
    // The URL is not an Actions job link, so there is no id and no
    // annotations call is made. `blocked` stays empty.
    expect(pr.checks.failingUrls).toEqual([{ name: 'build', url: 'https://x/build' }])
    expect(pr.checks.blocked).toEqual([])
  })

  test('no failing checks: never fetches annotations (only the activity call runs)', () => {
    const { runner, calls } = fakeGh({ view: BASE_PR })
    const pr = unwrap(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null }))!
    expect(pr.checks.blocked).toEqual([])
    expect(calls.filter((c) => c[0] === 'api')).toHaveLength(1) // the activity fetch only
  })

  test('a billing/spending-limit-blocked check is classified into `checks.blocked`, not silently dropped', () => {
    const jobUrl = 'https://github.com/o/r/actions/runs/999/job/12345'
    const { runner, calls } = fakeGh({
      view: {
        ...BASE_PR,
        statusCheckRollup: [{ name: 'ci', conclusion: 'FAILURE', detailsUrl: jobUrl }],
      },
      restResponses: [
        // The shape GitHub sends for this system annotation, copied from a
        // real blocked check run (`gh api repos/<owner>/<repo>/check-runs/<id>/annotations`).
        ok(
          JSON.stringify([
            {
              message:
                "The job was not started because recent account payments have failed or your spending limit needs to be increased. Please check the 'Billing & plans' section in your settings",
              annotation_level: 'failure',
              path: '.github',
            },
          ]),
        ), // check-run annotations
      ],
    })
    const pr = unwrap(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null }))!
    expect(pr.checks.blocked).toEqual(['ci'])
    const annotationsCall = calls.find(
      (c) => c[1] === 'repos/{owner}/{repo}/check-runs/12345/annotations',
    )
    expect(annotationsCall).toBeDefined()
  })

  test('a user-step annotation that merely mentions "was not started" is NOT blocked', () => {
    // A test step's own `::error::` output becomes an annotation too. A
    // pattern that matched "was not started" anywhere in the message would
    // read this real failure as blocked. The anchored prefix and the
    // `annotation_level` and `path` checks each reject it.
    const jobUrl = 'https://github.com/o/r/actions/runs/999/job/12345'
    const { runner } = fakeGh({
      view: {
        ...BASE_PR,
        statusCheckRollup: [{ name: 'e2e', conclusion: 'FAILURE', detailsUrl: jobUrl }],
      },
      restResponses: [
        ok(
          JSON.stringify([
            {
              message: 'Error: dev server was not started within 30s',
              annotation_level: 'failure',
              path: 'test/e2e.spec.ts',
            },
          ]),
        ),
      ],
    })
    const pr = unwrap(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null }))!
    expect(pr.checks.blocked).toEqual([])
  })

  test('a genuinely failing check (no "was not started" annotation) is NOT blocked', () => {
    const jobUrl = 'https://github.com/o/r/actions/runs/999/job/12345'
    const { runner } = fakeGh({
      view: {
        ...BASE_PR,
        statusCheckRollup: [{ name: 'ci', conclusion: 'FAILURE', detailsUrl: jobUrl }],
      },
      restResponses: [ok(JSON.stringify([{ message: 'Process completed with exit code 1.' }]))],
    })
    const pr = unwrap(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null }))!
    expect(pr.checks.blocked).toEqual([])
  })

  test('a failed annotations fetch degrades to not-blocked, not a throw', () => {
    const jobUrl = 'https://github.com/o/r/actions/runs/999/job/12345'
    const { runner } = fakeGh({
      view: {
        ...BASE_PR,
        statusCheckRollup: [{ name: 'ci', conclusion: 'FAILURE', detailsUrl: jobUrl }],
      },
      restResponses: [fail('rate limited')],
    })
    const pr = unwrap(new GithubCodeHost('/repo', { runner }).getPr(42, { since: null }))!
    expect(pr.checks.blocked).toEqual([])
  })
})

describe('actionsJobId', () => {
  test('extracts the job id from an Actions job details URL', () => {
    expect(actionsJobId('https://github.com/o/r/actions/runs/1/job/2')).toBe('2')
    expect(actionsJobId('https://github.com/o/r/actions/runs/1/job/2?pr=3')).toBe('2')
  })

  test('null for a URL not shaped like an Actions job link', () => {
    expect(actionsJobId('https://x/build')).toBeNull()
    expect(actionsJobId('https://circleci.com/gh/o/r/123')).toBeNull()
  })
})

describe('detectBlockedChecks', () => {
  test('only calls the annotations endpoint for checks with a resolvable Actions job id', () => {
    const calls: string[][] = []
    const runner = {
      run(argv: string[]) {
        calls.push([...argv])
        return { exitCode: 0, stdout: '[]', stderr: '' }
      },
    }
    const gh = new Gh('/repo', { runner })
    detectBlockedChecks(gh, [
      { name: 'no-url-shape', url: 'https://third-party.example/build/1' },
      { name: 'actions', url: 'https://github.com/o/r/actions/runs/1/job/9' },
    ])
    expect(calls).toEqual([['api', 'repos/{owner}/{repo}/check-runs/9/annotations']])
  })
})

describe('GithubCodeHost.listPrs', () => {
  test('maps the cheap listing fields, including isDraft and updatedAt', () => {
    const { runner, calls } = fakeGh({
      list: [
        {
          number: 1,
          headRefName: 'a',
          author: { login: 'x' },
          labels: [{ name: 'l1' }],
          isDraft: true,
          updatedAt: '2026-01-02T03:04:05Z',
        },
        { number: 2, headRefName: 'b', author: null, labels: [], isDraft: false },
      ],
    })
    const rows = new GithubCodeHost('/repo', { runner }).listPrs({ state: 'open' })
    expect(unwrap(rows)).toEqual([
      {
        number: 1,
        headRef: 'a',
        author: { login: 'x', isBot: false },
        labels: ['l1'],
        isDraft: true,
        updatedAt: '2026-01-02T03:04:05Z',
      },
      { number: 2, headRef: 'b', author: null, labels: [], isDraft: false, updatedAt: null },
    ])
    // `fakeGh` returns the same `pr list` payload whatever `--json` fields
    // were asked for, but the real `gh` returns only the fields it was asked
    // for. So the payload alone cannot catch a missing field. Check the argv.
    const listCall = calls.find((c) => c[0] === 'pr' && c[1] === 'list')
    const jsonFlagIdx = listCall?.indexOf('--json') ?? -1
    const requested = jsonFlagIdx >= 0 ? listCall![jsonFlagIdx + 1] : undefined
    expect(requested).toContain('author')
    expect(requested).toContain('labels')
    expect(requested).toContain('updatedAt')
    expect(requested).toContain('isDraft')
  })

  test('null when gh fails', () => {
    const { runner } = fakeGh({ list: null })
    expect(new GithubCodeHost('/repo', { runner }).listPrs({}).ok).toBe(false)
  })
})

describe('GithubCodeHost.listPrDetails', () => {
  test('maps the survey fields and asks gh for reviews and --repo', () => {
    const { runner, calls } = fakeGh({
      list: [
        {
          ...BASE_PR,
          number: 5,
          title: 'T',
          url: 'https://github.com/o/r/pull/5',
          baseRefName: 'main',
          headRefName: 'feat',
          headRefOid: 'abc123',
          isDraft: true,
          isCrossRepository: true,
          labels: [{ name: 'keep' }],
          reviews: [{ state: 'APPROVED', author: { login: 'x' } }],
        },
      ],
    })
    const rows = new GithubCodeHost('/repo', { runner }).listPrDetails({
      limit: 7,
      repo: 'other/repo',
    })
    expect(unwrap(rows)).toEqual([
      {
        number: 5,
        title: 'T',
        url: 'https://github.com/o/r/pull/5',
        baseRef: 'main',
        headRef: 'feat',
        headSha: 'abc123',
        isDraft: true,
        labels: ['keep'],
        reviewCount: 1,
        isCrossRepository: true,
      },
    ])
    const call = calls.find((c) => c[0] === 'pr' && c[1] === 'list')!
    expect(call[call.indexOf('--repo') + 1]).toBe('other/repo')
    expect(call[call.indexOf('--json') + 1]).toContain('reviews')
    // One past the limit, so typed-gh can tell a full page from a cut-short one.
    expect(call[call.indexOf('--limit') + 1]).toBe('8')
  })

  test('null when gh fails', () => {
    const { runner } = fakeGh({ list: null })
    expect(new GithubCodeHost('/repo', { runner }).listPrDetails({}).ok).toBe(false)
  })
})

describe('GithubCodeHost.parsePrUrl / prForBranch', () => {
  test('parsePrUrl delegates to typed-gh, tagging the code host name', () => {
    const { runner } = fakeGh({})
    const codeHost = new GithubCodeHost('/repo', { runner })
    expect(codeHost.parsePrUrl('https://github.com/o/r/pull/9')).toEqual({
      codeHost: 'github',
      host: 'github.com',
      owner: 'o',
      repo: 'r',
      number: 9,
    })
    expect(codeHost.parsePrUrl('https://GitHub.Acme.com/o/r/pull/9')?.host).toBe('github.acme.com')
    expect(codeHost.parsePrUrl('not a url')).toBeNull()
  })

  test('prForBranch resolves the exact-match open PR for a branch', () => {
    const { runner } = fakeGh({ list: [{ ...BASE_PR, headRefName: 'task/x' }] })
    const codeHost = new GithubCodeHost('/repo', { runner })
    expect(unwrap(codeHost.prForBranch('task/x'))).toBe(42)
  })
})

/** A minimal parsed `PullRequest`, the `@osdlc/typed-gh` shape `codeHostPrFrom` takes. `BASE_PR` above is `gh`'s raw `--json` payload instead, for the `fakeGh` tests. */
const PARSED_PR: PullRequest = {
  number: 42,
  state: 'OPEN',
  title: 't',
  body: '',
  url: 'https://github.com/o/r/pull/42',
  isDraft: false,
  baseRefName: 'main',
  headRefName: 'task/x',
  headRefOid: 'sha1',
  baseRefOid: null,
  isCrossRepository: false,
  headRepositoryOwner: null,
  mergeable: 'MERGEABLE',
  mergeStateStatus: 'CLEAN',
  reviewDecision: null,
  author: { login: 'author-one', isBot: false },
  labels: [],
  checks: [],
  comments: [],
  reviews: [],
  mergedAt: null,
  createdAt: null,
  updatedAt: null,
}

describe('codeHostPrFrom', () => {
  test('commits and changes of state are not activity', () => {
    const pr = codeHostPrFrom(PARSED_PR, [
      { kind: 'commit', id: 'PURC_1', at: null, actor: null, sha: 'a', headline: 'h' },
      { kind: 'closed', id: 'CE_1', at: null, actor: null },
    ])
    expect(pr.activity).toEqual([])
  })

  test('an inline comment GitHub sent no REST id for keeps its node id', () => {
    const pr = codeHostPrFrom(PARSED_PR, [
      {
        kind: 'review-comment',
        id: 'PRRC_1',
        at: null,
        actor: null,
        body: '',
        editedAt: null,
        url: '',
        restId: null,
        reviewId: 'PRR_1',
        path: 'a.ts',
        line: null,
        originalLine: null,
        outdated: false,
        replyToId: null,
        replyToRestId: null,
      },
    ])
    expect(pr.activity[0]).toMatchObject({
      id: 'PRRC_1',
      location: { file: 'a.ts', threadId: 'PRRC_1' },
    })
  })

  test('headIsFork follows isCrossRepository', () => {
    expect(codeHostPrFrom({ ...PARSED_PR, isCrossRepository: true }, []).headIsFork).toBe(true)
    expect(codeHostPrFrom({ ...PARSED_PR, isCrossRepository: false }, []).headIsFork).toBe(false)
  })
})

describe('GithubCodeHost.mergePr / reviewThreads', () => {
  test('mergePr pins the judged head sha', () => {
    const { runner, calls } = fakeGh({})
    new GithubCodeHost('/repo', { runner }).mergePr(42, { headSha: 'abc1234', method: 'squash' })
    expect(calls[0]).toEqual(['pr', 'merge', '42', '--squash', '--match-head-commit', 'abc1234'])
  })

  test('setDraft(false) marks ready; setDraft(true) converts back with --undo', () => {
    const { runner, calls } = fakeGh({})
    const host = new GithubCodeHost('/repo', { runner })
    host.setDraft(42, false)
    host.setDraft(42, true)
    expect(calls[0]).toEqual(['pr', 'ready', '42'])
    expect(calls[1]).toEqual(['pr', 'ready', '42', '--undo'])
  })

  test('updateComment PATCHes the issue comment by id', () => {
    const { runner, calls } = fakeGh({})
    new GithubCodeHost('/repo', { runner }).updateComment(42, '777', 'new body')
    expect(calls[0]).toEqual([
      'api',
      '-X',
      'PATCH',
      'repos/{owner}/{repo}/issues/comments/777',
      '-f',
      'body=new body',
    ])
  })

  test('updateComment throws CommentNotFoundError on HTTP 404 in stderr, not on the body text', () => {
    const gone = fakeGh({ restResponses: [fail('gh: Not Found (HTTP 404)')] })
    expect(() =>
      new GithubCodeHost('/repo', { runner: gone.runner }).updateComment(42, '777', 'x'),
    ).toThrow(CommentNotFoundError)
    // The argv holds the body; "404 not found" in it must not read as a deleted comment.
    const transient = fakeGh({ restResponses: [fail('gh: Bad Gateway (HTTP 502)')] })
    let err: unknown
    try {
      new GithubCodeHost('/repo', { runner: transient.runner }).updateComment(
        42,
        '777',
        'output: 404 not found',
      )
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(FailureError)
    expect(err).not.toBeInstanceOf(CommentNotFoundError)
  })

  test("updateComment keeps typed-gh's kind for a failure that is not a 404", () => {
    const limited = fakeGh({
      restResponses: [fail('gh: API rate limit exceeded for user ID 1. (HTTP 403)')],
    })
    let err: unknown
    try {
      new GithubCodeHost('/repo', { runner: limited.runner }).updateComment(42, '777', 'x')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(FailureError)
    expect((err as FailureError).failure.kind).toBe('rate-limited')
  })

  test('postComment takes id and created_at from the POST response, with no re-listing', () => {
    const { runner, calls } = fakeGh({
      restResponses: [ok(JSON.stringify({ id: 9001, created_at: '2026-01-02T03:04:05Z' }))],
    })
    const posted = new GithubCodeHost('/repo', { runner }).postComment(42, 'hello')
    expect(posted).toEqual({ id: '9001', createdAt: '2026-01-02T03:04:05Z' })
    expect(calls).toEqual([
      ['api', '-X', 'POST', 'repos/{owner}/{repo}/issues/42/comments', '-f', 'body=hello'],
    ])
  })

  test('postComment throws when the POST fails', () => {
    const { runner } = fakeGh({ restResponses: [fail('gh: Forbidden (HTTP 403)')] })
    expect(() => new GithubCodeHost('/repo', { runner }).postComment(42, 'x')).toThrow(FailureError)
  })

  test('a mutation throws the classified failure, so a signed-out gh reads as not-authenticated', () => {
    const { runner } = fakeGh({ restResponses: [fail('HTTP 401: Bad credentials')] })
    try {
      new GithubCodeHost('/repo', { runner }).postComment(42, 'x')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(FailureError)
      expect((e as FailureError).failure).toMatchObject({
        kind: 'not-authenticated',
        message: 'gh is not signed in to GitHub.',
      })
    }
  })

  test('updateBranch passes the style through: rebase adds --rebase, merge does not', () => {
    const { runner, calls } = fakeGh({})
    const host = new GithubCodeHost('/repo', { runner })
    host.updateBranch(7, 'rebase')
    host.updateBranch(7, 'merge')
    expect(calls[0]).toEqual(['pr', 'update-branch', '7', '--rebase'])
    expect(calls[1]).toEqual(['pr', 'update-branch', '7'])
  })

  test('reviewThreads goes through the graphql client and is a failure when it fails', () => {
    const { runner } = fakeGh({ restResponses: [fail()] })
    expect(new GithubCodeHost('/repo', { runner }).reviewThreads(42).ok).toBe(false)
  })
})

describe('GithubCodeHost.listComments', () => {
  test('maps every page, coercing ids to strings and dropping rows with no id', () => {
    const { runner, calls } = fakeGh({
      restResponses: [
        ok(
          JSON.stringify([
            [{ id: 1, body: 'a', created_at: 't1' }, { id: 'x2' }, { body: 'no id' }],
            [{ id: 3, body: 'past the first page', created_at: 't3' }],
          ]),
        ),
      ],
    })
    expect(unwrap(new GithubCodeHost('/repo', { runner }).listComments(42))).toEqual([
      { id: '1', createdAt: 't1', body: 'a' },
      { id: 'x2', createdAt: '', body: '' },
      { id: '3', createdAt: 't3', body: 'past the first page' },
    ])
    expect(calls[0]).toEqual([
      'api',
      '--paginate',
      '--slurp',
      'repos/{owner}/{repo}/issues/42/comments?per_page=100',
    ])
  })

  test('an answer that is not a list of pages is unreadable', () => {
    const { runner } = fakeGh({ restResponses: [ok(JSON.stringify([{ id: 1 }]))] })
    expect(new GithubCodeHost('/repo', { runner }).listComments(42)).toMatchObject({
      ok: false,
      error: { kind: 'unreadable', host: 'github' },
    })
  })
})

describe('GithubCodeHost.createPr', () => {
  const URL = 'https://github.com/o/r/pull/77'

  test('opens the PR and returns the number taken from the URL gh prints', () => {
    const calls: string[][] = []
    const runner: CommandRunner = {
      run(argv) {
        calls.push([...argv])
        return ok(`Creating pull request\n${URL}\n`)
      },
    }
    const out = new GithubCodeHost('/repo', { runner }).createPr({
      head: 'task/T-1',
      base: 'main',
      title: 't',
      body: 'b',
      draft: true,
    })
    expect(out).toEqual({ number: 77, url: URL })
    expect(calls[0]).toEqual([
      'pr',
      'create',
      '--head',
      'task/T-1',
      '--base',
      'main',
      '--draft',
      '--title',
      't',
      '--body',
      'b',
    ])
  })

  test('throws when gh prints a URL that names no PR', () => {
    const runner: CommandRunner = { run: () => ok('https://github.com/o/r\n') }
    expect(() =>
      new GithubCodeHost('/repo', { runner }).createPr({
        head: 'task/T-1',
        base: 'main',
        title: 't',
        body: 'b',
      }),
    ).toThrow(/naming no PR/)
  })

  test('throws when gh fails', () => {
    const runner: CommandRunner = { run: () => fail('no commits between main and task/T-1') }
    expect(() =>
      new GithubCodeHost('/repo', { runner }).createPr({
        head: 'task/T-1',
        base: 'main',
        title: 't',
        body: 'b',
      }),
    ).toThrow()
  })
})
