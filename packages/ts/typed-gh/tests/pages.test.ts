/**
 * Reading every page: `api` with `paginate`, `graphql` (whole and partial),
 * `nodesAt`, and the `readOnly` flag every verb carries.
 */

import { FailureError } from '@osdlc/result'
import { describe, expect, expectTypeOf, test } from 'vitest'

import * as pkg from '../src/index.ts'
import {
  AsyncGh,
  Gh,
  api,
  fromTarget,
  graphql,
  nodesAt,
  type CommandResult,
  type GhVerb,
  type GraphqlOptions,
  type GraphqlPage,
  type GraphqlVariable,
  type PartialNodes,
} from '../src/index.ts'

const out = (body: unknown): CommandResult => ({
  exitCode: 0,
  stdout: JSON.stringify(body),
  stderr: '',
})

describe('api with paginate', () => {
  test('asks for every page, slurped', () => {
    expect(api('repos/o/r/branches', { paginate: true }).argv).toEqual([
      'api',
      '--paginate',
      '--slurp',
      'repos/o/r/branches',
    ])
  })

  test('joins pages of arrays into one array', () => {
    const res = api('x', { paginate: true }).parse(out([[1, 2], [3]]))
    expect(res.body).toEqual([1, 2, 3])
    expect(res.ok).toBe(true)
  })

  test('keeps pages of objects as a list of pages', () => {
    const pages = [
      { total_count: 2, items: [1] },
      { total_count: 2, items: [2] },
    ]
    expect(api('x', { paginate: true }).parse(out(pages)).body).toEqual(pages)
  })

  test('cannot be combined with headers or an etag', () => {
    expect(() => api('x', { paginate: true, includeHeaders: true })).toThrow(RangeError)
    expect(() => api('x', { paginate: true, etag: '"abc"' })).toThrow(RangeError)
  })

  test('a failed call is ok: false with no body', () => {
    const res = api('x', { paginate: true }).parse({ exitCode: 1, stdout: '', stderr: 'boom' })
    expect(res).toMatchObject({ ok: false, body: null, stderr: 'boom' })
  })

  test('an endpoint that reads as a flag throws RangeError', () => {
    expect(() => api('--method=DELETE')).toThrow(RangeError)
  })
})

describe('graphql', () => {
  const Q = 'query($endCursor: String) { viewer { login } }'

  test('sends the query last, strings with -f and the rest with -F', () => {
    expect(graphql('query { a }', { s: 'x', n: 3, b: true, z: null }).argv).toEqual([
      'api',
      'graphql',
      '-f',
      's=x',
      '-F',
      'n=3',
      '-F',
      'b=true',
      '-F',
      'z=null',
      '-f',
      'query=query { a }',
    ])
  })

  test('fromTarget comes from the target, or is left for gh to fill', () => {
    const vars = { owner: fromTarget('owner'), name: fromTarget('repo') }
    const filled = graphql('query { a }', vars, {}, { repo: 'acme/widgets', hostname: 'h.io' })
    expect(filled.argv.slice(0, 8)).toEqual([
      'api',
      'graphql',
      '--hostname',
      'h.io',
      '-f',
      'owner=acme',
      '-f',
      'name=widgets',
    ])
    expect(graphql('query { a }', vars).argv.slice(2, 6)).toEqual([
      '-F',
      'owner={owner}',
      '-F',
      'name={repo}',
    ])
  })

  test('a plain string is sent as written, even {owner}', () => {
    const vars = { branch: '{owner}', other: '{repo}' }
    for (const target of [undefined, { repo: 'acme/widgets' }]) {
      expect(graphql('query { a }', vars, {}, target).argv).toEqual([
        'api',
        'graphql',
        '-f',
        'branch={owner}',
        '-f',
        'other={repo}',
        '-f',
        'query=query { a }',
      ])
    }
  })

  test('fromTarget takes owner or repo only', () => {
    expect(() => fromTarget('branch' as 'owner')).toThrow(RangeError)
    expect(Object.isFrozen(fromTarget('owner'))).toBe(true)
    const forged = { x: { fromTarget: 'branch' } } as unknown as Record<string, GraphqlVariable>
    expect(() => graphql('query { a }', forged)).toThrow(RangeError)
  })

  test('paginate slurps the pages and needs $endCursor', () => {
    expect(graphql(Q, {}, { paginate: true }).argv.slice(2, 4)).toEqual(['--paginate', '--slurp'])
    expect(() => graphql('query { a }', {}, { paginate: true })).toThrow(RangeError)
  })

  test('refuses a mutation or a subscription', () => {
    expect(() => graphql('mutation { x }')).toThrow(RangeError)
    expect(() => graphql('  # a comment\n  mutation M { x }')).toThrow(RangeError)
    expect(() => graphql('subscription { x }')).toThrow(RangeError)
    expect(() => graphql('query mutationCount { x }')).not.toThrow()
  })

  test('refuses a mutation hidden after a query, a fragment or a leading comma', () => {
    expect(() => graphql('query A { a } mutation B { addStar(input: {}) { id } }')).toThrow(
      RangeError,
    )
    expect(() => graphql('fragment F on User { login } mutation { x }')).toThrow(RangeError)
    expect(() => graphql(', mutation { x }')).toThrow(RangeError)
    // A keyword inside a string, a comment or a selection is not an operation.
    expect(() =>
      graphql('query { search(query: "mutation") { mutation } } # mutation'),
    ).not.toThrow()
  })

  test('refuses the variable names gh lifts into the request', () => {
    expect(() => graphql('query A { a }', { operationName: 'B' })).toThrow(RangeError)
    expect(() => graphql('query { a }', { query: 'mutation { x }' })).toThrow(RangeError)
  })

  test('refuses a variable name that is not a GraphQL name', () => {
    expect(() => graphql('query { a }', { 'a=b': 'x' })).toThrow(RangeError)
  })

  test("returns each page's data", () => {
    expect(graphql('query { a }').parse(out({ data: { a: 1 } }))).toEqual([{ a: 1 }])
    const pages = [{ data: { a: 1 } }, { data: { a: 2 } }]
    expect(graphql(Q, {}, { paginate: true }).parse(out(pages))).toEqual([{ a: 1 }, { a: 2 }])
  })

  test('null on a failed, unparseable or partial result', () => {
    const verb = graphql(Q, {}, { paginate: true })
    expect(verb.parse({ exitCode: 1, stdout: '', stderr: '' })).toBeNull()
    expect(verb.parse({ exitCode: 0, stdout: 'not json', stderr: '' })).toBeNull()
    expect(verb.parse(out({ data: {} }))).toBeNull()
    expect(
      verb.parse(out([{ data: { a: 1 } }, { errors: [{ message: 'x' }], data: null }])),
    ).toBeNull()
    expect(
      verb.parse(out([{ data: { a: 1 } }, { errors: [{ message: 'x' }], data: { a: 2 } }])),
    ).toBeNull()
    expect(verb.parse(out([{ data: { a: 1 } }, {}]))).toBeNull()
    expect(verb.parse(out([{ data: { a: 1 } }, null]))).toBeNull()
    expect(verb.parse(out([{ data: { a: 1 }, errors: [] }]))).toEqual([{ a: 1 }])
  })
})

/**
 * What gh prints for a GraphQL response with `errors`: the body on stdout,
 * `gh: <messages>` on stderr, and exit 1. With `--paginate --slurp`, the pages
 * up to and including the one with errors, as an array.
 */
const ghErrored = (body: unknown, message = 'Could not resolve'): CommandResult => ({
  exitCode: 1,
  stdout: JSON.stringify(body),
  stderr: `gh: ${message}\n`,
})

/** An aliased batch where `b` was deleted: `b` is null and one error names it. */
const BATCH = {
  data: { a: { number: 1 }, b: null },
  errors: [
    {
      type: 'NOT_FOUND',
      path: ['b'],
      locations: [{ line: 1, column: 20 }],
      message: 'Could not resolve to a PullRequest with the number of 2.',
    },
  ],
}

describe('graphql with partial', () => {
  const Q = 'query($endCursor: String) { viewer { login } }'
  const partial = { partial: true } as const

  test('sends the same argv as the whole form', () => {
    expect(graphql(Q, { n: 1 }, { paginate: true, partial: true }).argv).toEqual(
      graphql(Q, { n: 1 }, { paginate: true }).argv,
    )
    expect(graphql('query { a }', undefined, partial).argv).toEqual(graphql('query { a }').argv)
  })

  test("returns each page's data with its errors, read into GraphqlError", () => {
    const pages = graphql('query { a }', {}, partial).parse(out(BATCH))
    expect(pages).toEqual([
      {
        data: { a: { number: 1 }, b: null },
        errors: [
          {
            message: 'Could not resolve to a PullRequest with the number of 2.',
            type: 'NOT_FOUND',
            path: ['b'],
          },
        ],
      },
    ])
  })

  test('a page with no errors has an empty errors list', () => {
    const verb = graphql('query { a }', {}, partial)
    expect(verb.parse(out({ data: { a: 1 } }))).toEqual([{ data: { a: 1 }, errors: [] }])
    expect(verb.parse(out({ data: { a: 1 }, errors: null }))).toEqual([
      { data: { a: 1 }, errors: [] },
    ])
  })

  test('the exit 1 gh gives a response with errors is an answer', () => {
    const verb = graphql('query { a }', {}, partial)
    expect(verb.absent?.(ghErrored(BATCH))).toBe(true)
    expect(verb.parse(ghErrored(BATCH))?.[0]?.errors).toHaveLength(1)
  })

  test('any other non-zero exit is a failure, even with output', () => {
    const verb = graphql(Q, {}, { paginate: true, partial: true })
    const twoWholePages = JSON.stringify([{ data: { a: 1 } }, { data: { a: 2 } }])
    const cases: CommandResult[] = [
      { exitCode: 1, stdout: '', stderr: 'gh: HTTP 401' },
      // A network error before the first page: gh closes an empty slurp.
      { exitCode: 1, stdout: '[]', stderr: 'dial tcp: no such host' },
      // A network error on page 3, after two whole pages.
      { exitCode: 1, stdout: twoWholePages, stderr: 'dial tcp: no such host' },
      // An HTTP error body with no data.
      ghErrored([{ message: 'Bad credentials' }], 'Bad credentials (HTTP 401)'),
      // Errors about the whole query: no data to read.
      ghErrored([{ data: null, errors: [{ type: 'RATE_LIMITED', message: 'rate' }] }]),
      ghErrored([{ errors: [{ message: 'syntax' }] }]),
    ]
    for (const r of cases) {
      expect(verb.absent?.(r)).toBe(false)
      expect(verb.parse(r)).toBeNull()
    }
  })

  test('null when the output does not parse or a page has no data object', () => {
    const verb = graphql(Q, {}, { paginate: true, partial: true })
    expect(verb.parse({ exitCode: 0, stdout: 'not json', stderr: '' })).toBeNull()
    expect(verb.parse(out({ data: { a: 1 } }))).toBeNull()
    expect(verb.parse(out([{ data: { a: 1 } }, null]))).toBeNull()
    expect(verb.parse(out([{ data: { a: 1 } }, {}]))).toBeNull()
    expect(verb.parse(out([{ data: { a: 1 } }, { data: 'x' }]))).toBeNull()
    const noData = [{ data: { a: 1 } }, { data: null, errors: [{ message: 'x' }] }]
    expect(verb.parse(out(noData))).toBeNull()
  })

  test('paginate keeps every page, the last one partial', () => {
    const verb = graphql(Q, {}, { paginate: true, partial: true })
    const first = {
      data: { repo: { prs: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [1] } } },
    }
    const last = {
      data: { repo: { prs: { pageInfo: { hasNextPage: false }, nodes: [null] } } },
      errors: [{ message: 'gone', path: ['repo', 'prs', 'nodes', 0] }],
    }
    const pages = verb.parse(ghErrored([first, last]))
    expect(pages).toHaveLength(2)
    expect(pages?.[0]?.errors).toEqual([])
    expect(pages?.[1]?.errors).toEqual([
      { message: 'gone', type: null, path: ['repo', 'prs', 'nodes', 0] },
    ])
  })

  test('paginate fails when gh stopped at a page with errors that has a next page', () => {
    const verb = graphql(Q, {}, { paginate: true, partial: true })
    const stopped = {
      data: { repo: { prs: { pageInfo: { hasNextPage: true, endCursor: 'c2' }, nodes: [null] } } },
      errors: [{ message: 'gone', path: ['repo', 'prs', 'nodes', 0] }],
    }
    expect(verb.absent?.(ghErrored([stopped]))).toBe(false)
    expect(verb.parse(ghErrored([stopped]))).toBeNull()
    // A next page named anywhere in the page counts, even inside a list.
    const nested = { data: { x: [{ pageInfo: { hasNextPage: true } }] }, errors: [{}] }
    expect(verb.parse(ghErrored([nested]))).toBeNull()
  })

  test('without paginate, a next page is the caller to follow, not a short answer', () => {
    const verb = graphql('query { a }', {}, partial)
    const page = {
      data: { repo: { prs: { pageInfo: { hasNextPage: true, endCursor: 'c1' }, nodes: [null] } } },
      errors: [{ message: 'gone' }],
    }
    expect(verb.parse(ghErrored(page))).toEqual([
      { data: page.data, errors: [{ message: 'gone', type: null, path: [] }] },
    ])
  })

  test('reads odd error entries leniently and still counts them', () => {
    const verb = graphql('query { a }', {}, partial)
    const read = (errors: unknown) => verb.parse(ghErrored({ data: { a: 1 }, errors }))?.[0]?.errors
    expect(read('flat out')).toEqual([{ message: 'flat out', type: null, path: [] }])
    expect(read(['s', 7, null, { message: 3, type: 4, path: ['a', { x: 1 }] }])).toEqual([
      { message: 's', type: null, path: [] },
      { message: '', type: null, path: [] },
      { message: '', type: null, path: [] },
      { message: '', type: null, path: [] },
    ])
    expect(read([{ message: 'm', path: ['a', 0, 'b'] }])).toEqual([
      { message: 'm', type: null, path: ['a', 0, 'b'] },
    ])
    // An empty errors list is no error, so exit 1 with it is a failure.
    expect(verb.parse(ghErrored({ data: { a: 1 }, errors: [] }))).toBeNull()
  })

  test('the checks of the whole form still apply', () => {
    expect(() => graphql('mutation { x }', {}, partial)).toThrow(RangeError)
    expect(() => graphql('query { a }', {}, { paginate: true, partial: true })).toThrow(RangeError)
    expect(() => graphql('query { a }', { query: 'x' }, partial)).toThrow(RangeError)
  })

  test('partial: false is the whole form', () => {
    const verb = graphql('query { a }', {}, { partial: false })
    expect(verb.absent).toBeUndefined()
    expect(verb.parse(out(BATCH))).toBeNull()
  })

  test('the verb is typed by its options', () => {
    expectTypeOf(graphql('query { a }', {}, partial).parse).returns.toEqualTypeOf<
      GraphqlPage[] | null
    >()
    expectTypeOf(graphql('query { a }').parse).returns.toEqualTypeOf<unknown[] | null>()
    const opts: GraphqlOptions = {}
    expectTypeOf(graphql('query { a }', {}, opts).parse).returns.toEqualTypeOf<unknown[] | null>()
  })
})

describe('graphql with partial, through the clients', () => {
  const answering = (r: CommandResult) => ({ run: () => r })
  const Q = 'query { a: pullRequest(number: 1) { number } b: pullRequest(number: 2) { number } }'

  test('the plain method returns the partial pages gh exited 1 over', () => {
    const gh = new Gh('/repo', { runner: answering(ghErrored(BATCH)) })
    const pages = gh.graphql(Q, {}, { partial: true })
    expect(pages[0]?.data).toEqual({ a: { number: 1 }, b: null })
    expect(pages[0]?.errors.map((e) => e.path)).toEqual([['b']])
    // The whole form still throws.
    expect(() => gh.graphql(Q)).toThrow(FailureError)
    expect(gh.soft.graphql(Q)).toBeNull()
  })

  test('the output of an exit 1 answer is read once', () => {
    const errored = ghErrored(BATCH)
    let reads = 0
    const r: CommandResult = {
      ...errored,
      get stdout() {
        reads += 1
        return errored.stdout
      },
    }
    const gh = new Gh('/repo', { runner: answering(r) })
    expect(gh.graphql(Q, {}, { partial: true })[0]?.errors).toHaveLength(1)
    expect(reads).toBe(1)
  })

  test('try and soft keep the partial form and its type', () => {
    const gh = new Gh('/repo', { runner: answering(ghErrored(BATCH)) })
    const tried = gh.try.graphql(Q, undefined, { partial: true })
    expect(tried.ok && tried.value[0]?.errors).toHaveLength(1)
    expect(gh.soft.graphql(Q, {}, { partial: true })?.[0]?.data).toEqual(BATCH.data)
    expectTypeOf(() => gh.graphql(Q, {}, { partial: true })).returns.toEqualTypeOf<GraphqlPage[]>()
    expectTypeOf(() => gh.graphql(Q)).returns.toEqualTypeOf<unknown[]>()
    expectTypeOf(() => gh.soft.graphql(Q, {}, { partial: true })).returns.toEqualTypeOf<
      GraphqlPage[] | null
    >()
    expectTypeOf(() => gh.soft.graphql(Q)).returns.toEqualTypeOf<unknown[] | null>()
    if (tried.ok) expectTypeOf(tried.value).toEqualTypeOf<GraphqlPage[]>()
  })

  test('a response with no data still throws, and soft is null', () => {
    const r = ghErrored({ errors: [{ type: 'RATE_LIMITED', message: 'API rate limit exceeded' }] })
    const gh = new Gh('/repo', { runner: answering(r) })
    expect(() => gh.graphql(Q, {}, { partial: true })).toThrow(FailureError)
    expect(gh.soft.graphql(Q, {}, { partial: true })).toBeNull()
    expect(gh.try.graphql(Q, {}, { partial: true }).ok).toBe(false)
  })

  test('output that exited 0 but is not pages throws unreadable', () => {
    const gh = new Gh('/repo', { runner: answering(out({ data: null })) })
    const tried = gh.try.graphql(Q, {}, { partial: true })
    expect(!tried.ok && tried.error.kind).toBe('unreadable')
  })

  test('output cut short is a failure, whatever it holds', () => {
    const r: CommandResult = { ...ghErrored(BATCH), outputIncomplete: true }
    const gh = new Gh('/repo', { runner: answering(r) })
    expect(gh.soft.graphql(Q, {}, { partial: true })).toBeNull()
  })

  test('AsyncGh resolves the partial pages, and rejects without data', async () => {
    const gh = new AsyncGh('/repo', { runner: { run: async () => ghErrored(BATCH) } })
    const pages = await gh.graphql(Q, {}, { partial: true, timeoutMs: 1000 })
    expect(pages[0]?.errors[0]?.type).toBe('NOT_FOUND')
    await expect(gh.graphql(Q)).rejects.toBeInstanceOf(FailureError)
    expectTypeOf(gh.graphql(Q, {}, { partial: true })).toEqualTypeOf<Promise<GraphqlPage[]>>()
    expectTypeOf(gh.soft.graphql(Q, {}, { partial: true })).toEqualTypeOf<
      Promise<GraphqlPage[] | null>
    >()
    const tried = await gh.try.graphql(Q, {}, { partial: true })
    if (tried.ok) expectTypeOf(tried.value).toEqualTypeOf<GraphqlPage[]>()
    const failing = new AsyncGh('/repo', { runner: { run: async () => ghErrored([]) } })
    expect(await failing.soft.graphql(Q, {}, { partial: true })).toBeNull()
  })
})

describe('nodesAt', () => {
  const page = (nodes: unknown) => ({ repo: { prs: { nodes } } })

  test('joins one connection across pages', () => {
    expect(nodesAt([page([1, 2]), page([3])], ['repo', 'prs'])).toEqual([1, 2, 3])
    expect(nodesAt([], ['repo', 'prs'])).toEqual([])
  })

  test('null when pages is null, or any page lacks the path or its nodes', () => {
    expect(nodesAt(null, ['repo'])).toBeNull()
    expect(nodesAt([page([1]), { repo: null }], ['repo', 'prs'])).toBeNull()
    expect(nodesAt([page([1]), { repo: { prs: {} } }], ['repo', 'prs'])).toBeNull()
    expect(nodesAt([page([1]), page('x')], ['repo', 'prs'])).toBeNull()
  })
})

describe('nodesAt with partial', () => {
  const page = (nodes: unknown, errors: GraphqlPage['errors'] = []): GraphqlPage => ({
    data: { repo: { prs: { nodes } } },
    errors,
  })
  const gone = { message: 'gone', type: 'NOT_FOUND', path: ['repo', 'prs', 'nodes', 1] }
  const other = { message: 'elsewhere', type: null, path: ['viewer'] }
  const partial = { partial: true } as const

  test('joins the nodes and every error of every page', () => {
    const joined = nodesAt([page([1]), page([2, null], [gone, other])], ['repo', 'prs'], partial)
    expect(joined).toEqual({ nodes: [1, 2, null], errors: [gone, other] })
    expectTypeOf(joined).toEqualTypeOf<PartialNodes | null>()
    expect(nodesAt([], ['repo', 'prs'], partial)).toEqual({ nodes: [], errors: [] })
  })

  test('null when pages is null, a page is not a GraphqlPage, or the connection is missing', () => {
    expect(nodesAt(null, ['repo'], partial)).toBeNull()
    // The connection itself failed: there are no nodes to give.
    const failed: GraphqlPage = { data: { repo: null }, errors: [gone] }
    expect(nodesAt([page([1]), failed], ['repo', 'prs'], partial)).toBeNull()
    expect(nodesAt([page([1]), page('x')], ['repo', 'prs'], partial)).toBeNull()
    const notPage = [null] as unknown as GraphqlPage[]
    const noErrors = [{ data: { repo: { prs: { nodes: [] } } } }] as unknown as GraphqlPage[]
    expect(nodesAt(notPage, ['repo', 'prs'], partial)).toBeNull()
    expect(nodesAt(noErrors, ['repo', 'prs'], partial)).toBeNull()
  })

  test('reads the pages of a partial graphql call', () => {
    const verb = graphql('query($endCursor: String) { a }', {}, { paginate: true, partial: true })
    const pages = verb.parse(
      ghErrored([
        { data: { repo: { prs: { pageInfo: { hasNextPage: true }, nodes: [1] } } } },
        {
          data: { repo: { prs: { pageInfo: { hasNextPage: false }, nodes: [2, null] } } },
          errors: [gone],
        },
      ]),
    )
    expect(nodesAt(pages, ['repo', 'prs'], partial)).toEqual({
      nodes: [1, 2, null],
      errors: [gone],
    })
  })

  test('the plain form does not read partial pages as data', () => {
    expect(nodesAt([page([1])], ['repo', 'prs'])).toBeNull()
  })
})

describe('readOnly', () => {
  /** Every verb builder, called with arguments it accepts. */
  const VERBS: Record<string, () => GhVerb<unknown>> = {
    prList: () => pkg.prList(),
    prView: () => pkg.prView(1),
    prBody: () => pkg.prBody(1),
    openPrsForBranch: () => pkg.openPrsForBranch('b'),
    prReviewThreads: () => pkg.prReviewThreads(1),
    prDiff: () => pkg.prDiff(1),
    issueList: () => pkg.issueList(),
    issueView: () => pkg.issueView(1),
    labelList: () => pkg.labelList(),
    repoList: () => pkg.repoList('acme'),
    repoView: () => pkg.repoView('acme/widgets'),
    searchPrs: () => pkg.searchPrs('x'),
    api: () => pkg.api('user'),
    graphql: () => pkg.graphql('query { a }'),
    installed: () => pkg.installed(),
    authStatus: () => pkg.authStatus(),
    createPr: () => pkg.createPr({ head: 'h', base: 'b', title: 't', body: 'b' }),
    editPr: () => pkg.editPr(1, {}),
    editPrBody: () => pkg.editPrBody(1, 'b'),
    prComment: () => pkg.prComment(1, 'b'),
    prUpdateBranch: () => pkg.prUpdateBranch(1),
    prSetDraft: () => pkg.prSetDraft(1, true),
    prMerge: () => pkg.prMerge(1, { method: 'squash', headSha: 'a' }),
    createReview: () => pkg.createReview(1, { commitId: 'a', body: 'b', comments: [] }),
    issueCommentEdit: () => pkg.issueCommentEdit('1', 'b'),
    setIssueLabel: () => pkg.setIssueLabel(1, null, 'x'),
    createLabel: () => pkg.createLabel({ name: 'x', color: 'fff', description: '' }),
    editLabel: () => pkg.editLabel('x', {}),
    raw: () => pkg.raw(['api', 'user']),
    rawChecked: () => pkg.rawChecked(['api', 'user']),
  }
  const READS = new Set([
    'prList',
    'prView',
    'prBody',
    'openPrsForBranch',
    'prReviewThreads',
    'prDiff',
    'issueList',
    'issueView',
    'labelList',
    'repoList',
    'repoView',
    'searchPrs',
    'api',
    'graphql',
    'installed',
    'authStatus',
  ])

  for (const [name, build] of Object.entries(VERBS)) {
    test(`${name} is ${READS.has(name) ? 'read-only' : 'not read-only'}`, () => {
      expect(build().readOnly).toBe(READS.has(name))
    })
  }

  test('a verb that is not read-only is checked, but raw; prDiff is the one checked read', () => {
    for (const [name, build] of Object.entries(VERBS)) {
      const verb = build()
      // `raw` is the escape hatch: any argv, any exit code, returned as it came.
      if (!verb.readOnly && name !== 'raw') expect(verb.checked).toBe(true)
      if (verb.checked && verb.readOnly) expect(name).toBe('prDiff')
    }
  })
})
