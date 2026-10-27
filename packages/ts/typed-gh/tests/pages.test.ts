/**
 * Reading every page: `api` with `paginate`, `graphql`, `nodesAt`, and the
 * `readOnly` flag every verb carries.
 */

import { describe, expect, test } from 'vitest'

import * as pkg from '../src/index.ts'
import { api, graphql, nodesAt, type CommandResult, type GhVerb } from '../src/index.ts'

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

  test('{owner} and {repo} come from the target, or are left for gh to fill', () => {
    const vars = { owner: '{owner}', name: '{repo}' }
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

  test('a verb that is not read-only is checked; prDiff is the one checked read', () => {
    for (const [name, build] of Object.entries(VERBS)) {
      const verb = build()
      if (!verb.readOnly) expect(verb.checked).toBe(true)
      if (verb.checked && verb.readOnly) expect(name).toBe('prDiff')
    }
  })
})
