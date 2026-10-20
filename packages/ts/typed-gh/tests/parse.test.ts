/**
 * The parser — the shape hazards it exists to absorb.
 *
 * The fixtures mirror real `gh` output field-for-field (captured from
 * `gh pr view --json …` against a live PR), because every bug this layer can
 * have is a bug about what GitHub actually sends: an empty string where a
 * null was expected, a login that carries `[bot]` on one transport and not
 * the other, two node types in one array.
 */

import { describe, expect, test } from 'bun:test'

import { anyCheckFailed, normalizeAuthorLogin, parsePullRequest, parsePrUrl } from '../index.ts'
import { parseActor, parseCheckRun } from '../parse.ts'

/** A real `gh pr view --json` payload, trimmed to the fields under test. */
const LIVE_PR = {
  author: { id: 'MDQ6VXNlcjU2OTk0', is_bot: false, login: 'octocat', name: 'The Octocat' },
  baseRefName: 'feature/dispatcher',
  createdAt: '2026-08-28T04:42:15Z',
  headRefName: 'feature/executor',
  headRefOid: 'cb3a85c77d6cc786233a1f61d627469d1666d925',
  isDraft: false,
  labels: [],
  mergeStateStatus: 'DIRTY',
  mergeable: 'CONFLICTING',
  mergedAt: null,
  number: 1491,
  reviewDecision: '',
  state: 'OPEN',
  statusCheckRollup: [
    {
      __typename: 'CheckRun',
      completedAt: '2026-08-28T04:48:09Z',
      conclusion: 'SUCCESS',
      name: 'Cloudflare Pages: dev',
      startedAt: '2026-08-28T04:48:09Z',
      status: 'COMPLETED',
      workflowName: '',
    },
  ],
  title: 'feat: the agent executor',
  updatedAt: '2026-08-28T04:48:10Z',
  url: 'https://github.com/acme/widgets/pull/1491',
}

describe('parsePullRequest — a live payload', () => {
  test("reads every field, and folds gh's empty-string reviewDecision to null", () => {
    const pr = parsePullRequest(LIVE_PR)!
    expect(pr.number).toBe(1491)
    expect(pr.mergeable).toBe('CONFLICTING')
    expect(pr.mergeStateStatus).toBe('DIRTY')
    expect(pr.headRefOid).toBe('cb3a85c77d6cc786233a1f61d627469d1666d925')
    expect(pr.baseRefName).toBe('feature/dispatcher')
    expect(pr.author).toEqual({ login: 'octocat', isBot: false })
    // gh sends "" for "nobody has decided yet"; the model says null.
    expect(pr.reviewDecision).toBeNull()
    expect(pr.mergedAt).toBeNull()
    expect(pr.checks).toEqual([
      {
        name: 'Cloudflare Pages: dev',
        status: 'COMPLETED',
        conclusion: 'SUCCESS',
        verdict: 'success',
        url: null,
      },
    ])
  })

  test('a field that was never requested lands at its not-known value', () => {
    const pr = parsePullRequest({ number: 7 })!
    expect(pr.mergeable).toBe('UNKNOWN')
    expect(pr.mergeStateStatus).toBe('UNKNOWN')
    expect(pr.reviewDecision).toBeNull()
    expect(pr.author).toBeNull()
    expect(pr.labels).toEqual([])
    expect(pr.checks).toEqual([])
    expect(pr.isDraft).toBe(false)
  })

  test('no usable number is not a pull request', () => {
    expect(parsePullRequest({ title: 'x' })).toBeNull()
    expect(parsePullRequest({ number: '12' })).toBeNull()
    expect(parsePullRequest(null)).toBeNull()
    expect(parsePullRequest([])).toBeNull()
  })
})

describe('comments and reviews carry an id', () => {
  test('GraphQL (string node id) and REST (numeric id) both stringify through', () => {
    const pr = parsePullRequest({
      number: 1,
      comments: [
        { id: 'IC_kwDOabc123', author: { login: 'a' }, body: 'graphql shape', createdAt: 't1' },
        { id: 2100000001, user: { login: 'b' }, body: 'rest shape', created_at: 't2' },
      ],
      reviews: [{ id: 987654321, user: { login: 'c' }, state: 'APPROVED', submitted_at: 't3' }],
    })!
    expect(pr.comments[0]!.id).toBe('IC_kwDOabc123')
    expect(pr.comments[1]!.id).toBe('2100000001')
    expect(pr.reviews[0]!.id).toBe('987654321')
  })

  test('a comment/review with no id at all lands at null, not a crash', () => {
    const pr = parsePullRequest({
      number: 1,
      comments: [{ author: { login: 'a' }, body: 'x' }],
      reviews: [{ author: { login: 'a' }, state: 'COMMENTED' }],
    })!
    expect(pr.comments[0]!.id).toBeNull()
    expect(pr.reviews[0]!.id).toBeNull()
  })
})

describe('author logins — the two transports', () => {
  test('a REST [bot] suffix folds to the GraphQL shape, so the two compare', () => {
    expect(normalizeAuthorLogin('github-actions[bot]')).toBe('github-actions')
    expect(normalizeAuthorLogin('github-actions')).toBe('github-actions')
    // Only a trailing suffix, and only one.
    expect(normalizeAuthorLogin('a[bot]b')).toBe('a[bot]b')
  })

  test('the suffix marks a bot even when is_bot is absent', () => {
    expect(parseActor({ login: 'github-actions[bot]' })).toEqual({
      login: 'github-actions',
      isBot: true,
    })
    expect(parseActor({ login: 'octocat', is_bot: false })).toEqual({
      login: 'octocat',
      isBot: false,
    })
    expect(parseActor({ login: '' })).toBeNull()
    expect(parseActor(undefined)).toBeNull()
  })

  test('a login that is only `[bot]` is no author, like an empty login', () => {
    expect(parseActor({ login: '[bot]' })).toBeNull()
    expect(parseActor({ login: '[bot]', is_bot: true })).toBeNull()
    expect(parsePullRequest({ number: 1, author: { login: '[bot]' } })?.author).toBeNull()
  })

  test("REST's `user` node is read as well as GraphQL's `author`", () => {
    const rest = parsePullRequest({
      number: 1,
      user: { login: 'octocat' },
      created_at: '2026-01-01T00:00:00Z',
    })!
    expect(rest.author).toEqual({ login: 'octocat', isBot: false })
    expect(rest.createdAt).toBe('2026-01-01T00:00:00Z')
  })
})

describe('statusCheckRollup — two node types, one verdict axis', () => {
  test('a running check is pending, never a pass', () => {
    expect(parseCheckRun({ name: 'build', status: 'IN_PROGRESS', conclusion: null })).toEqual({
      name: 'build',
      status: 'IN_PROGRESS',
      conclusion: null,
      verdict: 'pending',
      url: null,
    })
    expect(parseCheckRun({ name: 'q', status: 'QUEUED', conclusion: null })?.verdict).toBe(
      'pending',
    )
  })

  test('the failing conclusions, and the ones that are merely not a pass', () => {
    const verdict = (conclusion: string) =>
      parseCheckRun({ name: 'c', status: 'COMPLETED', conclusion })?.verdict
    expect(verdict('FAILURE')).toBe('failure')
    expect(verdict('TIMED_OUT')).toBe('failure')
    expect(verdict('CANCELLED')).toBe('failure')
    expect(verdict('STARTUP_FAILURE')).toBe('failure')
    expect(verdict('SUCCESS')).toBe('success')
    expect(verdict('SKIPPED')).toBe('neutral')
    expect(verdict('NEUTRAL')).toBe('neutral')
    // Deliberately neutral: a human must act, but the build is not broken.
    expect(verdict('ACTION_REQUIRED')).toBe('neutral')
  })

  test('a legacy StatusContext is folded onto the same axis', () => {
    expect(parseCheckRun({ context: 'ci/legacy', state: 'FAILURE' })).toEqual({
      name: 'ci/legacy',
      status: null,
      conclusion: null,
      verdict: 'failure',
      url: null,
    })
    expect(parseCheckRun({ context: 'ci/legacy', state: 'SUCCESS' })?.verdict).toBe('success')
    expect(parseCheckRun({ context: 'ci/legacy', state: 'PENDING' })?.verdict).toBe('pending')
    expect(parseCheckRun({ context: 'ci/legacy', state: 'ERROR' })?.verdict).toBe('failure')
  })

  test('anyCheckFailed ignores pending and neutral', () => {
    const pr = parsePullRequest({
      number: 1,
      statusCheckRollup: [
        { name: 'a', status: 'COMPLETED', conclusion: 'SUCCESS' },
        { name: 'b', status: 'IN_PROGRESS', conclusion: null },
        { name: 'c', status: 'COMPLETED', conclusion: 'SKIPPED' },
      ],
    })!
    expect(anyCheckFailed(pr.checks)).toBe(false)

    const red = parsePullRequest({
      number: 1,
      statusCheckRollup: [{ name: 'a', status: 'COMPLETED', conclusion: 'FAILURE' }],
    })!
    expect(anyCheckFailed(red.checks)).toBe(true)
  })

  test('an unparseable rollup node is dropped, not fatal', () => {
    const pr = parsePullRequest({
      number: 1,
      statusCheckRollup: [null, {}, { name: 'ok', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    })!
    expect(pr.checks.map((c) => c.name)).toEqual(['ok'])
  })
})

describe('parsePrUrl', () => {
  const ref = { owner: 'acme', repo: 'widgets', number: 1937 }

  test('the canonical URL', () => {
    expect(parsePrUrl('https://github.com/acme/widgets/pull/1937')).toEqual(ref)
  })

  test('the shapes an address bar produces', () => {
    for (const url of [
      'https://github.com/acme/widgets/pull/1937/',
      'https://github.com/acme/widgets/pull/1937/files',
      'https://github.com/acme/widgets/pull/1937?diff=split',
      'https://github.com/acme/widgets/pull/1937#issuecomment-1',
      'http://www.github.com/acme/widgets/pull/1937',
      'github.com/acme/widgets/pull/1937',
      '  https://GitHub.com/acme/widgets/pull/1937  ',
    ]) {
      expect(parsePrUrl(url)).toEqual(ref)
    }
  })

  test('not a PR URL', () => {
    for (const url of [
      'https://github.com/acme/widgets',
      'https://github.com/acme/widgets/issues/1937',
      'https://github.com/acme/widgets/pull/',
      'https://github.com/acme/widgets/pull/abc',
      'https://ghe.example.com/acme/widgets/pull/1',
      'git@github.com:acme/widgets.git',
      '1937',
      '',
    ]) {
      expect(parsePrUrl(url)).toBeNull()
    }
  })
})
