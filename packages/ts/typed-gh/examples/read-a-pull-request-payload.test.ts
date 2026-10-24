/**
 * Read a `gh pr view --json` payload into the typed model, with no `gh`
 * involved. Every field has a value. One the payload lacks takes its "not
 * known" value.
 */

import { expect, test } from 'vitest'

import {
  anyCheckFailed,
  normalizeAuthorLogin,
  parsePullRequest,
  type Actor,
  type CheckConclusion,
  type CheckRun,
  type Comment,
  type Label,
  type MergeableState,
  type PullRequestState,
  type Review,
  type ReviewDecision,
  type ReviewState,
} from '@osdlc/typed-gh'

const payload = {
  number: 42,
  state: 'OPEN',
  title: 'Add retries',
  author: { login: 'dependabot[bot]' },
  labels: [{ name: 'bug', color: 'd73a4a', description: 'Something is broken' }],
  statusCheckRollup: [
    { name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS', detailsUrl: 'https://ci.test/1' },
    { name: 'lint', status: 'IN_PROGRESS', conclusion: null },
    { context: 'deploy', state: 'FAILURE' },
  ],
  comments: [{ id: 'IC_1', author: { login: 'octocat' }, body: 'Looks good.' }],
  reviews: [{ id: 'PRR_1', author: { login: 'octocat' }, body: '', state: 'APPROVED' }],
}

test('read a payload into the model', () => {
  const pr = parsePullRequest(payload)
  if (pr === null) throw new Error('the payload has no number')

  const state: PullRequestState = pr.state
  const author: Actor | null = pr.author
  const labels: Label[] = pr.labels
  const comments: Comment[] = pr.comments
  const reviews: Review[] = pr.reviews
  const reviewState: ReviewState | undefined = reviews[0]?.state

  expect(state).toBe('OPEN')
  expect(author).toEqual({ login: 'dependabot', isBot: true })
  expect(labels.map((l) => l.name)).toEqual(['bug'])
  expect(comments.map((c) => c.body)).toEqual(['Looks good.'])
  expect(reviewState).toBe('APPROVED')
})

test('a field the payload lacks takes its not-known value, never undefined', () => {
  const pr = parsePullRequest({ number: 7 })

  expect(pr?.mergeable).toBe('UNKNOWN')
  expect(pr?.reviewDecision).toBeNull()
  expect(pr?.checks).toEqual([])
})

test('a payload with no number is not a pull request', () => {
  expect(parsePullRequest({ title: 'no number' })).toBeNull()
})

test('checks fold onto one verdict, and a running check is never a pass', () => {
  const checks: CheckRun[] = parsePullRequest(payload)?.checks ?? []
  const conclusion: CheckConclusion | undefined = checks[0]?.conclusion

  expect(checks.map((c) => c.verdict)).toEqual(['success', 'pending', 'failure'])
  expect(conclusion).toBe('SUCCESS')
  expect(checks.every((c) => c.verdict === 'success')).toBe(false)
  expect(anyCheckFailed(checks)).toBe(true)
  expect(anyCheckFailed(checks.filter((c) => c.name !== 'deploy'))).toBe(false)
})

test('logins from GraphQL and REST compare equal once normalized', () => {
  expect(normalizeAuthorLogin('github-actions[bot]')).toBe(normalizeAuthorLogin('github-actions'))
})

test('the two closed enums can be matched in full', () => {
  // MergeableState and ReviewDecision are closed. A value GitHub adds reads as
  // UNKNOWN or null. So a switch over them needs no default.
  const pr = parsePullRequest({ number: 7, mergeable: 'CONFLICTING', reviewDecision: 'APPROVED' })
  const mergeable: MergeableState = pr?.mergeable ?? 'UNKNOWN'
  const decision: ReviewDecision = pr?.reviewDecision ?? null

  const canMerge = (m: MergeableState): boolean | null => {
    switch (m) {
      case 'MERGEABLE':
        return true
      case 'CONFLICTING':
        return false
      case 'UNKNOWN':
        return null
    }
  }

  expect(canMerge(mergeable)).toBe(false)
  expect(decision).toBe('APPROVED')
})
