/**
 * The README's claims, one named test each. If a README claim stops being
 * true, the test named for it fails.
 *
 * Each claim is checked on `Gh` and on `AsyncGh`, which the README says share
 * one contract.
 */

import { FailureError } from '@osdlc/result'
import { describe, expect, test } from 'vitest'

import {
  AsyncGh,
  CommandFailed,
  type GhFailure,
  Gh,
  anyCheckFailed,
  parsePullRequest,
  prView,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '../src/index.ts'
import { parseActor, parseCheckRun } from '../src/parse.ts'
import { needsMergeStateRetry } from '../src/verbs.ts'

/** A `Gh` and an `AsyncGh` on fake runners that replay `results` (the last one repeats). */
function clients(results: CommandResult[]) {
  const seen: { argv: string[]; opts: Record<string, unknown> }[] = []
  let next = 0
  const pick = () => results[Math.min(next++, results.length - 1)]!
  const syncRunner: CommandRunner = {
    run(argv, opts) {
      seen.push({ argv: [...argv], opts: { ...opts } })
      return pick()
    },
  }
  const asyncRunner: AsyncCommandRunner = {
    async run(argv, opts) {
      seen.push({ argv: [...argv], opts: { ...opts } })
      return pick()
    },
  }
  return {
    gh: new Gh('/repo', { runner: syncRunner }),
    agh: new AsyncGh('/repo', { runner: asyncRunner }),
    seen,
  }
}

const ok = (stdout = ''): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const json = (body: unknown): CommandResult => ok(JSON.stringify(body))
const FAIL: CommandResult = { exitCode: 1, stdout: '', stderr: 'gh: not authenticated' }

describe('README: the plain door throws on a failure; soft answers null; try answers a Result', () => {
  test('a failed query throws, so "no rows" and "could not ask" differ', async () => {
    const failed = clients([FAIL])
    const empty = clients([json([])])

    for (const call of [
      (c: Gh | AsyncGh) => c.prList(),
      (c: Gh | AsyncGh) => c.issueList(),
      (c: Gh | AsyncGh) => c.labelList(),
      (c: Gh | AsyncGh) => c.prBody(1),
      (c: Gh | AsyncGh) => c.prReviewThreads(1),
      (c: Gh | AsyncGh) => c.openPrFor('feature/x'),
    ]) {
      expect(() => call(failed.gh)).toThrow(FailureError)
      await expect(Promise.resolve().then(() => call(failed.agh))).rejects.toBeInstanceOf(
        FailureError,
      )
    }

    expect(empty.gh.prList()).toEqual({ rows: [], truncated: false })
    expect(await empty.agh.prList()).toEqual({ rows: [], truncated: false })
    expect(empty.gh.issueList()).toEqual({ rows: [], truncated: false })
    expect(await empty.agh.issueList()).toEqual({ rows: [], truncated: false })
    expect(empty.gh.labelList()).toEqual({ rows: [], truncated: false })
    expect(await empty.agh.labelList()).toEqual({ rows: [], truncated: false })
  })

  test('soft is null for every failed query, on both clients', async () => {
    const f = clients([FAIL])
    expect(f.gh.soft.prList()).toBeNull()
    expect(f.gh.soft.prView(1)).toBeNull()
    expect(f.gh.soft.prBody(1)).toBeNull()
    expect(f.gh.soft.issueView(1)).toBeNull()
    expect(f.gh.soft.labelList()).toBeNull()
    expect(f.gh.soft.prReviewThreads(1)).toBeNull()
    expect(f.gh.soft.openPrFor('feature/x')).toBeNull()
    expect(await f.agh.soft.prList()).toBeNull()
    expect(await f.agh.soft.prView(1)).toBeNull()
    expect(await f.agh.soft.prBody(1)).toBeNull()
    expect(await f.agh.soft.issueView(1)).toBeNull()
    expect(await f.agh.soft.prReviewThreads(1)).toBeNull()
    expect(await f.agh.soft.openPrFor('feature/x')).toBeNull()
  })

  test('try is a Result: a value on success, a GhFailure on failure, on both clients', async () => {
    const good = clients([json([])])
    expect(good.gh.try.prList()).toEqual({ ok: true, value: { rows: [], truncated: false } })
    expect(await good.agh.try.prList()).toEqual({ ok: true, value: { rows: [], truncated: false } })

    const f = clients([FAIL])
    for (const r of [f.gh.try.prList(), await f.agh.try.prList()]) {
      expect(r.ok).toBe(false)
      if (r.ok) continue
      expect(r.error).toMatchObject({ kind: 'exit', message: 'gh: not authenticated', exitCode: 1 })
      expect(r.error.cause).toBeInstanceOf(CommandFailed)
    }
  })

  test('a query for one thing answers null when GitHub says there is no such thing', async () => {
    const gone = clients([
      {
        exitCode: 1,
        stdout: '',
        stderr:
          'GraphQL: Could not resolve to a PullRequest with the number of 99. (repository.pullRequest)',
      },
    ])
    expect(gone.gh.prView(99)).toBeNull()
    expect(await gone.agh.prView(99)).toBeNull()
    expect(gone.gh.try.prView(99)).toEqual({ ok: true, value: null })
    const noIssue = clients([
      {
        exitCode: 1,
        stdout: '',
        stderr: 'GraphQL: Could not resolve to an Issue with the number of 99. (repository.issue)',
      },
    ])
    expect(noIssue.gh.issueView(99)).toBeNull()
    const noRepo = clients([
      {
        exitCode: 1,
        stdout: '',
        stderr: "GraphQL: Could not resolve to a Repository with the name 'o/r'. (repository)",
      },
    ])
    expect(noRepo.gh.repoView('o/r')).toBeNull()
  })

  test('a wrong repository is a not-found failure, not an absent PR or issue', async () => {
    const wrongRepo = clients([
      {
        exitCode: 1,
        stdout: '',
        stderr:
          "GraphQL: Could not resolve to a Repository with the name 'typo/typo'. (repository)",
      },
    ])
    expect(() => wrongRepo.gh.withRepo('typo/typo').prView(7)).toThrow(FailureError)
    expect(() => wrongRepo.gh.withRepo('typo/typo').issueView(7)).toThrow(FailureError)
    const r = wrongRepo.gh.withRepo('typo/typo').try.prView(7)
    expect(!r.ok && r.error.kind).toBe('not-found')
    await expect(wrongRepo.agh.withRepo('typo/typo').prView(7)).rejects.toThrow(FailureError)
  })

  test('the absence test reads stdout as the classifier does', () => {
    const gone = clients([
      {
        exitCode: 1,
        stdout: 'GraphQL: Could not resolve to a PullRequest with the number of 99.',
        stderr: '',
      },
    ])
    expect(gone.gh.prView(99)).toBeNull()
  })

  test('output that exited 0 but cannot be read throws an unreadable FailureError', () => {
    const bad = clients([ok('not json')])
    expect(() => bad.gh.prList()).toThrow(FailureError)
    const r = bad.gh.try.prList()
    expect(!r.ok && r.error.kind).toBe('unreadable')
    expect(bad.gh.soft.prList()).toBeNull()
  })

  test('a mutation has no soft form', () => {
    const f = clients([ok()])
    expect(() =>
      (f.gh.soft as unknown as { editPrBody(n: number, b: string): void }).editPrBody(1, 'b'),
    ).toThrow(TypeError)
  })

  test('the probes answer in every door: failure is part of their value', async () => {
    const f = clients([FAIL])
    expect(f.gh.installed()).toBe(false)
    expect(f.gh.try.installed()).toEqual({ ok: true, value: false })
    expect(f.gh.authStatus().ok).toBe(false)
    expect(f.gh.api('repos/o/r').ok).toBe(false)
    expect((await f.agh.try.api('repos/o/r')).ok).toBe(true)
  })
})

describe('README: mutations throw the classified failure, carrying argv and the full result', () => {
  const MUTATIONS: [string, (c: Gh | AsyncGh) => unknown][] = [
    ['createPr', (c) => c.createPr({ head: 'h', base: 'main', title: 't', body: 'b' })],
    ['editPr', (c) => c.editPr(1, { title: 't' })],
    ['editPrBody', (c) => c.editPrBody(1, 'b')],
    ['prDiff', (c) => c.prDiff(1)],
    ['prComment', (c) => c.prComment(1, 'b')],
    ['createReview', (c) => c.createReview(1, { commitId: 'a', body: 'b', comments: [] })],
    ['prUpdateBranch', (c) => c.prUpdateBranch(1)],
    ['prSetDraft', (c) => c.prSetDraft(1, true)],
    ['issueCommentEdit', (c) => c.issueCommentEdit('1', 'b')],
    ['prMerge', (c) => c.prMerge(1, { method: 'squash', headSha: 'abc' })],
    ['createLabel', (c) => c.createLabel({ name: 'n', color: '000000', description: '' })],
    ['editLabel', (c) => c.editLabel('n', { color: '000000' })],
    ['setIssueLabel', (c) => c.setIssueLabel(1, null, 'n')],
  ]

  test.each(MUTATIONS)('%s', async (_name, call) => {
    const f = clients([FAIL])
    let fromSync: unknown
    try {
      call(f.gh)
    } catch (e) {
      fromSync = e
    }
    const fromAsync = await Promise.resolve(call(f.agh)).catch((e: unknown) => e)

    for (const err of [fromSync, fromAsync]) {
      expect(err).toBeInstanceOf(FailureError)
      const failed = (err as FailureError<GhFailure>).failure
      expect(failed.argv.length).toBeGreaterThan(0)
      expect(failed.cause?.result).toMatchObject({ exitCode: 1, stderr: 'gh: not authenticated' })
    }
  })
})

describe('README: raw(argv) hands back the raw CommandResult', () => {
  test('raw does not interpret a failure; the caller decides', async () => {
    const f = clients([FAIL])
    expect(f.gh.raw(['api', 'x'])).toEqual(FAIL)
    expect(await f.agh.raw(['api', 'x'])).toEqual(FAIL)
  })
})

describe("README: authentication is gh's", () => {
  test('no token is read, stored, or forwarded: a call carries a directory, never credentials', async () => {
    const f = clients([ok('[]')])
    f.gh.prList()
    await f.agh.prList()
    for (const call of f.seen) {
      expect(Object.keys(call.opts)).toEqual(['cwd'])
      expect(call.argv.join(' ')).not.toMatch(/token|GITHUB_TOKEN|Authorization/i)
    }
  })
})

describe('README: a total model', () => {
  test('a field that was not asked for has a not-known value, and none is undefined', () => {
    const pr = parsePullRequest({ number: 7 })!
    expect(pr.mergeable).toBe('UNKNOWN')
    expect(pr.mergeStateStatus).toBe('UNKNOWN')
    expect(pr.reviewDecision).toBeNull()
    expect(pr.checks).toEqual([])
    expect(Object.values(pr).includes(undefined)).toBe(false)
  })

  test('a payload with no number is not a pull request', () => {
    expect(parsePullRequest({ title: 'x' })).toBeNull()
  })
})

describe('README: author logins are normalized to the suffix-less form, once, when a payload is parsed', () => {
  test('GraphQL and REST spellings of the same bot compare equal', () => {
    const graphql = parseActor({ login: 'github-actions' })
    const rest = parseActor({ login: 'github-actions[bot]' })
    expect(rest?.login).toBe('github-actions')
    expect(rest?.login).toBe(graphql?.login)
    expect(rest?.isBot).toBe(true)
  })

  test('a login read off a pull request is already normalized', () => {
    const pr = parsePullRequest({ number: 1, author: { login: 'dependabot[bot]' } })!
    expect(pr.author?.login).toBe('dependabot')
  })
})

describe('README: a check still running is pending, never success', () => {
  test('an in-progress check, and a completed one with no conclusion, are pending', () => {
    const running = parseCheckRun({ name: 'ci', status: 'IN_PROGRESS', conclusion: null })
    const noConclusion = parseCheckRun({ name: 'ci', status: 'COMPLETED', conclusion: null })
    expect(running?.verdict).toBe('pending')
    expect(noConclusion?.verdict).toBe('pending')
    expect(anyCheckFailed([running!, noConclusion!])).toBe(false)
  })

  test('both node types fold onto one verdict axis', () => {
    const modern = parseCheckRun({ name: 'ci', status: 'COMPLETED', conclusion: 'FAILURE' })
    const legacy = parseCheckRun({ context: 'ci/legacy', state: 'FAILURE' })
    expect(modern?.verdict).toBe('failure')
    expect(legacy?.verdict).toBe('failure')
    expect(anyCheckFailed([modern!, legacy!])).toBe(true)
  })
})

describe('README: UNKNOWN is a legitimate final verdict', () => {
  const unknown = json({ number: 1, mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' })

  test('prViewSettled re-asks, then returns UNKNOWN when it never settles', async () => {
    const f = clients([unknown])
    const fromSync = f.gh.prViewSettled(1, { attempts: 3, sleep: () => {} })
    const fromAsync = await f.agh.prViewSettled(1, { attempts: 3, sleep: async () => {} })
    expect(fromSync?.mergeable).toBe('UNKNOWN')
    expect(fromAsync?.mergeable).toBe('UNKNOWN')
    // Three calls each, on two clients.
    expect(f.seen).toHaveLength(6)
  })

  test('UNKNOWN is the answer that asks again; a settled one is not', () => {
    expect(needsMergeStateRetry(parsePullRequest({ number: 1, mergeable: 'UNKNOWN' })!)).toBe(true)
    expect(
      needsMergeStateRetry(
        parsePullRequest({ number: 1, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' })!,
      ),
    ).toBe(false)
  })
})

describe('README: the pure halves drive any runner', () => {
  test('a verb is data: argv and a parser, with no spawn until a runner runs it', () => {
    const verb = prView(1491)
    expect(verb.argv.slice(0, 3)).toEqual(['pr', 'view', '1491'])
    const pr = verb.parse(json({ number: 1491, title: 't' }))
    expect(pr?.number).toBe(1491)
  })
})

describe('README: MergeableState and ReviewDecision are closed; the other enums are open', () => {
  test('an unknown mergeable value reads as UNKNOWN, an unknown review decision as null', () => {
    const pr = parsePullRequest({ number: 1, mergeable: 'NEW_VALUE', reviewDecision: 'NEW_VALUE' })
    expect(pr?.mergeable).toBe('UNKNOWN')
    expect(pr?.reviewDecision).toBeNull()
  })

  test('an unknown value of an open enum is carried through', () => {
    const pr = parsePullRequest({
      number: 1,
      state: 'NEW_STATE',
      mergeStateStatus: 'NEW_STATUS',
      reviews: [{ state: 'NEW_REVIEW_STATE' }],
      statusCheckRollup: [{ name: 'ci', status: 'COMPLETED', conclusion: 'NEW_CONCLUSION' }],
    })
    expect(pr?.state).toBe('NEW_STATE')
    expect(pr?.mergeStateStatus).toBe('NEW_STATUS')
    expect(pr?.reviews[0]?.state).toBe('NEW_REVIEW_STATE')
    expect(pr?.checks[0]?.conclusion).toBe('NEW_CONCLUSION')
  })
})
