/**
 * Read a whole list, not its first page. `api` with `paginate` joins REST
 * pages into one array. `graphql` returns each page's `data`, or null when
 * any page failed or came back partial. `nodesAt` joins one connection.
 * With `partial: true`, `graphql` keeps a partial answer as `{ data, errors }`
 * per page, and a capped read pages itself.
 */

import { expect, test } from 'vitest'

import {
  fromTarget,
  Gh,
  graphql,
  nodesAt,
  prMerge,
  prView,
  type CommandRunner,
  type FromTarget,
  type GraphqlError,
  type GraphqlOptions,
  type GraphqlPage,
  type GraphqlPartialOptions,
  type GraphqlVariable,
  type PartialNodes,
} from '@osdlc/typed-gh'

const answering = (stdout: string): CommandRunner => ({
  run: () => ({ exitCode: 0, stdout, stderr: '' }),
})

test('every branch, across REST pages', () => {
  const pages = JSON.stringify([[{ name: 'main' }], [{ name: 'release' }]])
  const gh = new Gh('/repo', { runner: answering(pages), repo: 'acme/widgets' })

  const res = gh.api('repos/{owner}/{repo}/branches', { paginate: true })

  expect(res.ok).toBe(true)
  expect(res.body).toEqual([{ name: 'main' }, { name: 'release' }])
})

test('every label, across GraphQL pages', () => {
  const page = (names: string[]) => ({
    data: { repository: { labels: { nodes: names.map((name) => ({ name })) } } },
  })
  const stdout = JSON.stringify([page(['bug']), page(['docs'])])
  const gh = new Gh('/repo', { runner: answering(stdout) })
  const query = `query($owner: String!, $name: String!, $endCursor: String) {
    repository(owner: $owner, name: $name) {
      labels(first: 100, after: $endCursor) { pageInfo { hasNextPage endCursor } nodes { name } }
    }
  }`
  // The client has no repo, so gh fills these from the clone. A plain string
  // such as '{owner}' would be sent as written.
  const owner: FromTarget = fromTarget('owner')
  const variables: Record<string, GraphqlVariable> = { owner, name: fromTarget('repo') }
  const opts: GraphqlOptions = { paginate: true }

  const pages = gh.graphql(query, variables, opts)

  expect(nodesAt(pages, ['repository', 'labels'])).toEqual([{ name: 'bug' }, { name: 'docs' }])
  const argv = graphql(query, variables, opts).argv
  expect(argv).toContain('--paginate')
  expect(argv).toEqual(expect.arrayContaining(['-F', 'owner={owner}', '-F', 'name={repo}']))
})

test('a page with errors is no answer at all', () => {
  const stdout = JSON.stringify({ data: { viewer: null }, errors: [{ message: 'rate limited' }] })
  const gh = new Gh('/repo', { runner: answering(stdout) })

  expect(() => gh.graphql('query { viewer { login } }')).toThrow()
  expect(gh.soft.graphql('query { viewer { login } }')).toBeNull()
})

test('a batch of aliased lookups keeps the ones that worked', () => {
  // gh prints a response with errors and exits 1. The partial form reads it.
  const stdout = JSON.stringify({
    data: { repository: { a: { title: 'Fix the build' }, b: null } },
    errors: [
      {
        type: 'NOT_FOUND',
        path: ['repository', 'b'],
        message: 'Could not resolve to a PullRequest with the number of 2.',
      },
    ],
  })
  const gh = new Gh('/repo', {
    runner: { run: () => ({ exitCode: 1, stdout, stderr: 'gh: Could not resolve' }) },
    repo: 'acme/widgets',
  })
  const query = `query($owner: String!, $name: String!) {
    repository(owner: $owner, name: $name) {
      a: pullRequest(number: 1) { title }
      b: pullRequest(number: 2) { title }
    }
  }`
  const opts: GraphqlPartialOptions = { partial: true }

  const [page]: GraphqlPage[] = gh.graphql(
    query,
    { owner: fromTarget('owner'), name: fromTarget('repo') },
    opts,
  )

  expect(page?.data).toEqual({ repository: { a: { title: 'Fix the build' }, b: null } })
  const missing: GraphqlError[] = [...(page?.errors ?? [])]
  expect(missing.map((e) => [e.type, e.path])).toEqual([['NOT_FOUND', ['repository', 'b']]])
  // The whole form still treats the same answer as a failure.
  expect(gh.soft.graphql(query)).toBeNull()
})

test('the nodes of a connection, with the errors of its pages', () => {
  const pages: GraphqlPage[] = [
    {
      data: { repository: { labels: { nodes: [{ name: 'bug' }, null] } } },
      errors: [{ message: 'gone', type: null, path: ['repository', 'labels', 'nodes', 1] }],
    },
  ]

  const joined: PartialNodes | null = nodesAt(pages, ['repository', 'labels'], { partial: true })

  expect(joined?.nodes).toEqual([{ name: 'bug' }, null])
  expect(joined?.errors[0]?.path).toEqual(['repository', 'labels', 'nodes', 1])
})

test('at most two pages, by paging yourself', () => {
  // `paginate` has no cap: gh follows every page. Leave it off and pass the
  // cursor yourself to stop early.
  const page = (names: string[], endCursor: string | null) => ({
    data: {
      repository: {
        labels: {
          pageInfo: { hasNextPage: endCursor !== null, endCursor },
          nodes: names.map((name) => ({ name })),
        },
      },
    },
  })
  const answers = [page(['bug'], 'c1'), page(['docs'], 'c2'), page(['never read'], null)]
  const asked: string[][] = []
  const gh = new Gh('/repo', {
    runner: {
      run: (argv) => {
        asked.push(argv)
        return { exitCode: 0, stdout: JSON.stringify(answers[asked.length - 1]), stderr: '' }
      },
    },
  })
  const query = `query($endCursor: String) {
    repository(owner: "acme", name: "widgets") {
      labels(first: 100, after: $endCursor) { pageInfo { hasNextPage endCursor } nodes { name } }
    }
  }`

  interface PageInfo {
    hasNextPage: boolean
    endCursor: string | null
  }
  const labels: unknown[] = []
  let endCursor: string | null = null
  for (let n = 0; n < 2; n += 1) {
    const [data]: unknown[] = gh.graphql(query, { endCursor })
    labels.push(...(nodesAt([data], ['repository', 'labels']) ?? []))
    const info: PageInfo = (data as { repository: { labels: { pageInfo: PageInfo } } }).repository
      .labels.pageInfo
    if (!info.hasNextPage) break
    endCursor = info.endCursor
  }

  expect(labels).toEqual([{ name: 'bug' }, { name: 'docs' }])
  expect(asked).toHaveLength(2)
  expect(asked[1]).toEqual(expect.arrayContaining(['-f', 'endCursor=c1']))
})

test('a verb says whether it only reads', () => {
  expect(prView(7).readOnly).toBe(true)
  expect(prMerge(7, { method: 'squash', headSha: 'abc' }).readOnly).toBe(false)
})
