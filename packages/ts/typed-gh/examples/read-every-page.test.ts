/**
 * Read a whole list, not its first page. `api` with `paginate` joins REST
 * pages into one array. `graphql` returns each page's `data`, or null when
 * any page failed or came back partial; `nodesAt` joins one connection.
 */

import { expect, test } from 'vitest'

import {
  Gh,
  graphql,
  nodesAt,
  prMerge,
  prView,
  type CommandRunner,
  type GraphqlOptions,
  type GraphqlVariable,
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
  const variables: Record<string, GraphqlVariable> = { owner: '{owner}', name: '{repo}' }
  const opts: GraphqlOptions = { paginate: true }

  const pages = gh.graphql(query, variables, opts)

  expect(nodesAt(pages, ['repository', 'labels'])).toEqual([{ name: 'bug' }, { name: 'docs' }])
  expect(graphql(query, variables, opts).argv).toContain('--paginate')
})

test('a page with errors is no answer at all', () => {
  const stdout = JSON.stringify({ data: { viewer: null }, errors: [{ message: 'rate limited' }] })
  const gh = new Gh('/repo', { runner: answering(stdout) })

  expect(gh.graphql('query { viewer { login } }')).toBeNull()
})

test('a verb says whether it only reads', () => {
  expect(prView(7).readOnly).toBe(true)
  expect(prMerge(7, { method: 'squash', headSha: 'abc' }).readOnly).toBe(false)
})
