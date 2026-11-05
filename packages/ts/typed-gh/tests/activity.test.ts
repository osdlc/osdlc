/**
 * `prActivity`: a pull request's timeline as one typed list, through
 * GraphQL `timelineItems`, with `since` and the three call styles.
 */

import { FailureError } from '@osdlc/result'
import { describe, expect, test } from 'vitest'

import {
  AsyncGh,
  Gh,
  prActivity,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type PrActivityItem,
} from '../src/index.ts'

/** A `Gh` and an `AsyncGh` on fake runners that answer `result`, and the argv each ran. */
function clients(result: CommandResult, target: { repo?: string; hostname?: string } = {}) {
  const seen: string[][] = []
  const sync: CommandRunner = {
    run(argv) {
      seen.push([...argv])
      return result
    },
  }
  const async: AsyncCommandRunner = {
    async run(argv) {
      seen.push([...argv])
      return result
    },
  }
  return {
    gh: new Gh('/repo', { runner: sync, ...target }),
    agh: new AsyncGh('/repo', { runner: async, ...target }),
    seen,
  }
}

const ok = (body: unknown): CommandResult => ({
  exitCode: 0,
  stdout: JSON.stringify(body),
  stderr: '',
})

/** One `--slurp`ed page's `data` with these timeline nodes. */
const page = (nodes: unknown[]) => ({
  data: { repository: { pullRequest: { timelineItems: { nodes } } } },
})

const user = (login: string) => ({ __typename: 'User', login })

const comment = {
  __typename: 'IssueComment',
  id: 'IC_1',
  author: user('octocat'),
  createdAt: '2026-11-01T10:00:00Z',
  fullDatabaseId: '4204154439',
  body: 'Looks close.',
  lastEditedAt: null,
  url: 'https://github.com/o/r/pull/7#issuecomment-4204154439',
}

const inline = {
  id: 'PRRC_1',
  author: { __typename: 'Bot', login: 'review-bot' },
  createdAt: '2026-11-01T11:00:00Z',
  fullDatabaseId: '99',
  body: 'Retry here too?',
  lastEditedAt: '2026-11-01T11:05:00Z',
  url: 'https://github.com/o/r/pull/7#discussion_r99',
  path: 'src/fetch.ts',
  line: 12,
  originalLine: 10,
  outdated: false,
  replyTo: null,
}

const review = {
  __typename: 'PullRequestReview',
  id: 'PRR_1',
  author: { __typename: 'Bot', login: 'review-bot' },
  state: 'COMMENTED',
  submittedAt: '2026-11-01T11:01:00Z',
  fullDatabaseId: '55',
  body: 'One question.',
  lastEditedAt: null,
  url: 'https://github.com/o/r/pull/7#pullrequestreview-55',
  comments: {
    totalCount: 2,
    nodes: [inline, { ...inline, id: 'PRRC_2', replyTo: { id: 'PRRC_1' }, line: null }],
  },
}

const commit = {
  __typename: 'PullRequestCommit',
  id: 'PURC_1',
  commit: {
    oid: 'abc123',
    committedDate: '2026-11-01T12:00:00Z',
    messageHeadline: 'Retry the fetch',
    author: { user: user('octocat') },
  },
}

const events = [
  {
    __typename: 'HeadRefForcePushedEvent',
    id: 'HRFPE_1',
    actor: user('octocat'),
    createdAt: '2026-11-01T13:00:00Z',
    beforeCommit: { oid: 'abc123' },
    afterCommit: { oid: 'def456' },
  },
  {
    __typename: 'BaseRefChangedEvent',
    id: 'BRCE_1',
    actor: user('octocat'),
    createdAt: '2026-11-01T13:30:00Z',
    previousRefName: 'main',
    currentRefName: 'release',
  },
  {
    __typename: 'ReadyForReviewEvent',
    id: 'RFRE_1',
    actor: user('octocat'),
    createdAt: '2026-11-01T14:00:00Z',
  },
  {
    __typename: 'ConvertToDraftEvent',
    id: 'CTDE_1',
    actor: user('octocat'),
    createdAt: '2026-11-01T14:10:00Z',
  },
  {
    __typename: 'ClosedEvent',
    id: 'CE_1',
    actor: user('octocat'),
    createdAt: '2026-11-01T15:00:00Z',
  },
  { __typename: 'ReopenedEvent', id: 'RE_1', actor: null, createdAt: '2026-11-01T15:10:00Z' },
  {
    __typename: 'MergedEvent',
    id: 'ME_1',
    actor: user('octocat'),
    createdAt: '2026-11-01T16:00:00Z',
    commit: { oid: 'fff000' },
  },
]

/** `-f`/`-F` pairs of an argv, as `{ name: value }`. */
function variables(argv: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  for (let i = 0; i < argv.length - 1; i++) {
    if (argv[i] !== '-f' && argv[i] !== '-F') continue
    const pair = argv[i + 1]!
    const eq = pair.indexOf('=')
    out[pair.slice(0, eq)] = pair.slice(eq + 1)
  }
  return out
}

describe('the prActivity verb', () => {
  test('pages through timelineItems over GraphQL, read-only', () => {
    const verb = prActivity(7)
    expect(verb.argv.slice(0, 4)).toEqual(['api', 'graphql', '--paginate', '--slurp'])
    expect(verb.readOnly).toBe(true)
    expect(verb.checked).toBe(false)
    const vars = variables(verb.argv)
    expect(vars).toMatchObject({ owner: '{owner}', name: '{repo}', number: '7' })
    expect(vars).not.toHaveProperty('since')
    expect(vars['query']).toContain('timelineItems(first: 100, after: $endCursor, since: $since')
    expect(verb.argv).toEqual(expect.arrayContaining(['-F', 'number=7']))
  })

  test("the timeline's pageInfo comes before any other, so gh follows the timeline", () => {
    const query = variables(prActivity(7).argv)['query']!
    expect(query.match(/pageInfo/g)).toHaveLength(1)
    expect(query.indexOf('pageInfo')).toBeLessThan(query.indexOf('nodes'))
  })

  test('names the target repository and host', () => {
    const argv = prActivity(7, {}, { repo: 'acme/widgets', hostname: 'github.acme.com' }).argv
    expect(argv.slice(2, 4)).toEqual(['--hostname', 'github.acme.com'])
    expect(variables(argv)).toMatchObject({ owner: 'acme', name: 'widgets' })
  })

  test('sends since in UTC', () => {
    expect(variables(prActivity(7, { since: '2026-11-05T10:30:00+01:00' }).argv)['since']).toBe(
      '2026-11-05T09:30:00.000Z',
    )
    expect(variables(prActivity(7, { since: '2028-02-29T23:30:00-01:00' }).argv)['since']).toBe(
      '2028-03-01T00:30:00.000Z',
    )
    expect(variables(prActivity(7, { since: '2026-11-05T09:30Z' }).argv)['since']).toBe(
      '2026-11-05T09:30:00.000Z',
    )
    expect(prActivity(7, { since: '2026-11-05T09:30:00Z' }).argv).toEqual(
      expect.arrayContaining(['-f', 'since=2026-11-05T09:30:00.000Z']),
    )
  })

  test('null and empty since mean no since', () => {
    for (const since of [null, '', undefined]) {
      expect(variables(prActivity(7, { since }).argv)).not.toHaveProperty('since')
    }
  })

  test.each([
    '2026-11-05',
    '2026-11-05T09:30:00',
    'yesterday',
    '-1',
    '2026-13-45T09:30:00Z',
    '2026-02-30T09:30:00Z',
    '2026-04-31T09:30:00Z',
    '2026-11-05T24:00:00Z',
    ' 2026-11-05T09:30:00Z',
  ])('since %p throws RangeError', (since) => {
    expect(() => prActivity(7, { since })).toThrow(RangeError)
  })

  test.each([0, -1, 1.5, Number.NaN, 2 ** 53])('number %p throws RangeError', (number) => {
    expect(() => prActivity(number)).toThrow(RangeError)
  })

  test('a bad target throws RangeError', () => {
    expect(() => prActivity(7, {}, { repo: 'not a slug' })).toThrow(RangeError)
  })
})

describe('reading the timeline', () => {
  const all = prActivity(7).parse(ok([page([comment, review, commit]), page(events)]))

  test('every kind, in timeline order across pages, each review before its comments', () => {
    expect(all?.truncated).toBe(false)
    expect(all?.rows.map((r) => [r.kind, r.id])).toEqual([
      ['comment', 'IC_1'],
      ['review', 'PRR_1'],
      ['review-comment', 'PRRC_1'],
      ['review-comment', 'PRRC_2'],
      ['commit', 'PURC_1'],
      ['head-force-pushed', 'HRFPE_1'],
      ['base-changed', 'BRCE_1'],
      ['ready-for-review', 'RFRE_1'],
      ['converted-to-draft', 'CTDE_1'],
      ['closed', 'CE_1'],
      ['reopened', 'RE_1'],
      ['merged', 'ME_1'],
    ])
  })

  test('a comment carries its text and REST id', () => {
    expect(all?.rows[0]).toEqual({
      kind: 'comment',
      id: 'IC_1',
      at: '2026-11-01T10:00:00Z',
      actor: { login: 'octocat', isBot: false },
      body: 'Looks close.',
      editedAt: null,
      url: comment.url,
      restId: '4204154439',
    })
  })

  test('a review and its inline comments; a Bot actor is a bot', () => {
    const [, r, c1, c2] = all!.rows
    expect(r).toMatchObject({
      kind: 'review',
      state: 'COMMENTED',
      at: '2026-11-01T11:01:00Z',
      actor: { login: 'review-bot', isBot: true },
      restId: '55',
    })
    expect(c1).toEqual({
      kind: 'review-comment',
      id: 'PRRC_1',
      at: '2026-11-01T11:00:00Z',
      actor: { login: 'review-bot', isBot: true },
      body: 'Retry here too?',
      editedAt: '2026-11-01T11:05:00Z',
      url: inline.url,
      restId: '99',
      reviewId: 'PRR_1',
      path: 'src/fetch.ts',
      line: 12,
      originalLine: 10,
      outdated: false,
      replyToId: null,
    })
    expect(c2).toMatchObject({ replyToId: 'PRRC_1', line: null })
  })

  test('a commit, and the events with fields of their own', () => {
    const byId = new Map(all!.rows.map((r) => [r.id, r]))
    expect(byId.get('PURC_1')).toEqual({
      kind: 'commit',
      id: 'PURC_1',
      at: '2026-11-01T12:00:00Z',
      actor: { login: 'octocat', isBot: false },
      sha: 'abc123',
      headline: 'Retry the fetch',
    })
    expect(byId.get('HRFPE_1')).toMatchObject({ beforeSha: 'abc123', afterSha: 'def456' })
    expect(byId.get('BRCE_1')).toMatchObject({ from: 'main', to: 'release' })
    expect(byId.get('ME_1')).toMatchObject({ sha: 'fff000' })
    expect(byId.get('RE_1')).toEqual({
      kind: 'reopened',
      id: 'RE_1',
      at: '2026-11-01T15:10:00Z',
      actor: null,
    })
  })

  test('a field GitHub left out gets its "not known" value', () => {
    const bare = prActivity(7).parse(
      ok([
        page([
          { __typename: 'PullRequestReview', id: 'PRR_2', comments: { nodes: [{ id: 'PRRC_3' }] } },
          { __typename: 'PullRequestCommit', id: 'PURC_2', commit: { oid: 'aaa' } },
          { __typename: 'HeadRefForcePushedEvent', id: 'HRFPE_2', beforeCommit: null },
          { __typename: 'MergedEvent', id: 'ME_2' },
        ]),
      ]),
    )
    expect(bare?.rows).toEqual([
      {
        kind: 'review',
        id: 'PRR_2',
        at: null,
        actor: null,
        state: '',
        body: '',
        editedAt: null,
        url: '',
        restId: null,
      },
      {
        kind: 'review-comment',
        id: 'PRRC_3',
        at: null,
        actor: null,
        body: '',
        editedAt: null,
        url: '',
        restId: null,
        reviewId: 'PRR_2',
        path: '',
        line: null,
        originalLine: null,
        outdated: false,
        replyToId: null,
      },
      { kind: 'commit', id: 'PURC_2', at: null, actor: null, sha: 'aaa', headline: '' },
      {
        kind: 'head-force-pushed',
        id: 'HRFPE_2',
        at: null,
        actor: null,
        beforeSha: null,
        afterSha: null,
      },
      { kind: 'merged', id: 'ME_2', at: null, actor: null, sha: null },
    ])
  })

  test('a pending review has no time yet', () => {
    const pending = { ...review, state: 'PENDING', submittedAt: null }
    expect(prActivity(7).parse(ok([page([pending])]))?.rows[0]).toMatchObject({
      kind: 'review',
      state: 'PENDING',
      at: null,
    })
  })

  test('a review with more inline comments than were read is truncated', () => {
    const many = { ...review, comments: { ...review.comments, totalCount: 101 } }
    const read = prActivity(7).parse(ok([page([comment]), page([many])]))
    expect(read?.truncated).toBe(true)
    expect(read?.rows).toHaveLength(4)
  })

  test('a type the query did not ask for is skipped', () => {
    const labeled = { __typename: 'LabeledEvent', id: 'LE_1', createdAt: '2026-11-01T10:00:00Z' }
    expect(
      prActivity(7)
        .parse(ok([page([labeled, comment])]))
        ?.rows.map((r) => r.id),
    ).toEqual(['IC_1'])
  })

  test('no activity is an empty list, not null', () => {
    expect(prActivity(7).parse(ok([page([])]))).toEqual({ rows: [], truncated: false })
  })

  test.each([
    [
      'a page without the timeline',
      [page([comment]), { data: { repository: { pullRequest: null } } }],
    ],
    ['a page with errors', [page([comment]), { ...page([]), errors: [{ message: 'timeout' }] }]],
    ['a node that is not an object', [page([comment, 'x'])]],
    ['a node with no id', [page([{ ...comment, id: undefined }])]],
    ['a commit with no oid', [page([{ ...commit, commit: { committedDate: 'x' } }])]],
    ['a review with no comment list', [page([{ ...review, comments: null }])]],
    ['an inline comment with no id', [page([{ ...review, comments: { nodes: [{ body: 'x' }] } }])]],
    ['an answer that is not a list of pages', page([comment])],
  ])('%s is no answer', (_name, body) => {
    expect(prActivity(7).parse(ok(body))).toBeNull()
  })

  test('a failed call is null', () => {
    expect(prActivity(7).parse({ exitCode: 1, stdout: '', stderr: 'boom' })).toBeNull()
  })
})

describe('prActivity on the clients', () => {
  const answer = ok([page([comment])])

  test('both clients run the verb and return the list', async () => {
    const f = clients(answer, { repo: 'acme/widgets' })
    const want = { rows: [expect.objectContaining({ id: 'IC_1' })], truncated: false }
    expect(f.gh.prActivity(7, { since: '2026-11-01T00:00:00Z' })).toEqual(want)
    expect(await f.agh.prActivity(7, { since: '2026-11-01T00:00:00Z' })).toEqual(want)
    expect(f.seen[0]).toEqual(f.seen[1])
    expect(variables(f.seen[0]!)).toMatchObject({
      owner: 'acme',
      name: 'widgets',
      number: '7',
      since: '2026-11-01T00:00:00.000Z',
    })
  })

  test('no such pull request is null in every call style', async () => {
    const f = clients({
      exitCode: 1,
      stdout: '',
      stderr: 'gh: Could not resolve to a PullRequest with the number of 99.',
    })
    expect(f.gh.prActivity(99)).toBeNull()
    expect(f.gh.try.prActivity(99)).toEqual({ ok: true, value: null })
    expect(f.gh.soft.prActivity(99)).toBeNull()
    expect(await f.agh.prActivity(99)).toBeNull()
    expect(await f.agh.try.prActivity(99)).toEqual({ ok: true, value: null })
  })

  test('a wrong repository is a not-found failure, not an absent PR', () => {
    const f = clients({
      exitCode: 1,
      stdout: '',
      stderr: "gh: Could not resolve to a Repository with the name 'acme/nope'.",
    })
    expect(() => f.gh.prActivity(7)).toThrow(FailureError)
    const tried = f.gh.try.prActivity(7)
    expect(tried.ok === false && tried.error.kind).toBe('not-found')
  })

  test('a failed call throws, rejects, is a failure through try and null through soft', async () => {
    const f = clients({ exitCode: 1, stdout: '', stderr: 'gh: HTTP 401: Bad credentials' })
    expect(() => f.gh.prActivity(7)).toThrow(FailureError)
    await expect(f.agh.prActivity(7)).rejects.toBeInstanceOf(FailureError)
    const tried = f.gh.try.prActivity(7)
    expect(tried.ok === false && tried.error.kind).toBe('not-authenticated')
    expect(f.gh.soft.prActivity(7)).toBeNull()
    expect(await f.agh.soft.prActivity(7)).toBeNull()
  })

  test('an answer that cannot be read whole throws unreadable', async () => {
    const f = clients(ok([page([comment]), { data: {} }]))
    const tried = f.gh.try.prActivity(7)
    expect(tried.ok === false && tried.error.kind).toBe('unreadable')
    const atried = await f.agh.try.prActivity(7)
    expect(atried.ok === false && atried.error.kind).toBe('unreadable')
  })

  test('a bad argument throws on Gh and rejects on AsyncGh, before gh runs', async () => {
    const f = clients(answer)
    expect(() => f.gh.prActivity(7, { since: 'last week' })).toThrow(RangeError)
    await expect(f.agh.prActivity(0)).rejects.toBeInstanceOf(RangeError)
    expect(f.seen).toEqual([])
  })

  test('narrowing on kind reaches the fields of that kind', () => {
    const rows: PrActivityItem[] = clients(ok([page([review])])).gh.prActivity(7)?.rows ?? []
    const paths = rows.flatMap((r) => (r.kind === 'review-comment' ? [r.path] : []))
    expect(paths).toEqual(['src/fetch.ts', 'src/fetch.ts'])
  })
})
