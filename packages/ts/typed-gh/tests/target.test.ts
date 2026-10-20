/**
 * The repository and host a client names. Every verb takes an optional
 * target and puts it in its argv: `--repo` on `pr`, `issue` and `label`
 * verbs, `--hostname` and filled `{owner}/{repo}` on `api` verbs. With no
 * target, the argv is what it was before targets existed.
 */

import { describe, expect, test } from 'bun:test'

import {
  AsyncGh,
  Gh,
  api,
  authStatus,
  createLabel,
  createPr,
  createReview,
  editLabel,
  editPr,
  issueCommentEdit,
  issueList,
  issueView,
  labelList,
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
  type CommandRunner,
  type GhTarget,
  type GhVerb,
} from '../index.ts'

const TARGET: GhTarget = { repo: 'acme/widgets', hostname: 'ghe.acme.com' }
const QUALIFIED = 'ghe.acme.com/acme/widgets'

/** Each `pr`, `issue` and `label` verb, built with a target. */
const REPO_VERBS: [string, (t?: GhTarget) => GhVerb<unknown>][] = [
  ['prList', (t) => prList({}, t)],
  ['prView', (t) => prView(7, ['number'], t)],
  ['prBody', (t) => prBody(7, t)],
  ['prDiff', (t) => prDiff(7, t)],
  ['prComment', (t) => prComment(7, 'hi', t)],
  ['createPr', (t) => createPr({ head: 'h', base: 'main', title: 't', body: 'b' }, t)],
  ['editPr', (t) => editPr(7, { title: 't' }, t)],
  ['prUpdateBranch', (t) => prUpdateBranch(7, 'merge', t)],
  ['prSetDraft', (t) => prSetDraft(7, true, t)],
  ['prMerge', (t) => prMerge(7, { method: 'squash', headSha: 'abc' }, t)],
  ['issueList', (t) => issueList({}, t)],
  ['issueView', (t) => issueView(7, t)],
  ['setIssueLabel', (t) => setIssueLabel(7, null, 'x', t)],
  ['labelList', (t) => labelList({}, t)],
  ['createLabel', (t) => createLabel({ name: 'x', color: 'fff', description: '' }, t)],
  ['editLabel', (t) => editLabel('x', { color: 'fff' }, t)],
]

describe('a target on a pr, issue or label verb', () => {
  for (const [name, build] of REPO_VERBS) {
    test(`${name} passes --repo host/owner/name`, () => {
      const argv = build(TARGET).argv
      expect(argv[argv.indexOf('--repo') + 1]).toBe(QUALIFIED)
    })

    test(`${name} passes no --repo without a target`, () => {
      expect(build().argv).not.toContain('--repo')
    })
  }

  test('a repo with no hostname goes as owner/name', () => {
    expect(prView(7, ['number'], { repo: 'acme/widgets' }).argv).toEqual([
      'pr',
      'view',
      '7',
      '--repo',
      'acme/widgets',
      '--json',
      'number',
    ])
  })

  test("prList's own repo option overrides the target's repo, and keeps its host", () => {
    const argv = prList({ repo: 'acme/gadgets' }, TARGET).argv
    expect(argv[argv.indexOf('--repo') + 1]).toBe('ghe.acme.com/acme/gadgets')
  })

  test('a hostname with no repo adds nothing: gh uses the clone', () => {
    expect(prBody(7, { hostname: 'ghe.acme.com' }).argv).toEqual(prBody(7).argv)
  })
})

describe('a target on an api verb', () => {
  test('api fills {owner}/{repo} and passes --hostname', () => {
    expect(api('repos/{owner}/{repo}/pulls', {}, TARGET).argv).toEqual([
      'api',
      '--hostname',
      'ghe.acme.com',
      'repos/acme/widgets/pulls',
    ])
  })

  test('without a target, gh fills the placeholders', () => {
    expect(api('repos/{owner}/{repo}/pulls').argv).toEqual(['api', 'repos/{owner}/{repo}/pulls'])
  })

  test('issueCommentEdit and createReview fill the endpoint', () => {
    expect(issueCommentEdit('12', 'b', TARGET).argv).toContain(
      'repos/acme/widgets/issues/comments/12',
    )
    const review = createReview(7, { commitId: 'abc', body: 'b', comments: [] }, TARGET).argv
    expect(review).toContain('repos/acme/widgets/pulls/7/reviews')
    expect(review.slice(0, 3)).toEqual(['api', '--hostname', 'ghe.acme.com'])
  })

  test('prReviewThreads sends the owner and name as plain strings', () => {
    const argv = prReviewThreads(7, TARGET).argv
    expect(argv).toContain('owner=acme')
    expect(argv).toContain('name=widgets')
    expect(argv[argv.indexOf('owner=acme') - 1]).toBe('-f')
    expect(prReviewThreads(7).argv).toContain('owner={owner}')
  })

  test('authStatus asks about the target host', () => {
    expect(authStatus(TARGET).argv).toEqual(['auth', 'status', '--hostname', 'ghe.acme.com'])
    expect(authStatus().argv).toEqual(['auth', 'status'])
  })
})

describe('an invalid target', () => {
  for (const bad of [
    { repo: 'widgets' },
    { repo: 'acme/widgets/extra' },
    { repo: '--evil/x' },
    { hostname: 'https://ghe.acme.com' },
    { hostname: 'ghe.acme.com/path' },
    { hostname: '-x' },
  ]) {
    test(`throws RangeError for ${JSON.stringify(bad)}`, () => {
      expect(() => prBody(7, bad)).toThrow(RangeError)
      expect(() => api('user', {}, bad)).toThrow(RangeError)
      expect(() => new Gh('/repo', bad)).toThrow(RangeError)
      expect(() => new AsyncGh('/repo', bad)).toThrow(RangeError)
    })
  }

  test('prList checks its own repo option too', () => {
    expect(() => prList({ repo: 'not a slug' })).toThrow(RangeError)
  })
})

describe('the clients', () => {
  test('Gh passes its target to each call, and at() and withRepo() keep the rest', () => {
    const calls: string[][] = []
    const runner: CommandRunner = {
      run(argv) {
        calls.push([...argv])
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const gh = new Gh('/repo', { runner, ...TARGET })
    gh.prBody(1)
    gh.at('/other').prBody(2)
    gh.withRepo('acme/gadgets').prBody(3)
    gh.authStatus()
    expect(calls.slice(0, 3).map((c) => c[c.indexOf('--repo') + 1])).toEqual([
      QUALIFIED,
      QUALIFIED,
      'ghe.acme.com/acme/gadgets',
    ])
    expect(calls[3]).toEqual(['auth', 'status', '--hostname', 'ghe.acme.com'])
    expect(gh.withRepo('acme/gadgets').cwd).toBe('/repo')
    expect(() => gh.withRepo('nope')).toThrow(RangeError)
  })

  test('AsyncGh does the same', async () => {
    const calls: string[][] = []
    const runner: AsyncCommandRunner = {
      async run(argv) {
        calls.push([...argv])
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const gh = new AsyncGh('/repo', { runner, ...TARGET })
    await gh.prBody(1)
    await gh.withRepo('acme/gadgets').at('/other').prBody(2)
    expect(calls.map((c) => c[c.indexOf('--repo') + 1])).toEqual([
      QUALIFIED,
      'ghe.acme.com/acme/gadgets',
    ])
  })
})
