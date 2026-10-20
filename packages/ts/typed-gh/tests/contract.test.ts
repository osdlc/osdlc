/**
 * The README's claims, one named test each. If a sentence in the README stops
 * being true, the test with that sentence in its name fails.
 *
 * Each claim is checked on `Gh` and on `AsyncGh`, which the README says share
 * one contract.
 */

import { describe, expect, test } from 'bun:test'

import {
  AsyncGh,
  CommandFailed,
  Gh,
  anyCheckFailed,
  parsePullRequest,
  prView,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '../index.ts'
import { parseActor, parseCheckRun } from '../parse.ts'
import { needsMergeStateRetry } from '../verbs.ts'

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

describe('README: queries return null on failure and never throw', () => {
  test('a query returns null, never [] — [] means there are no rows, null means we could not ask', async () => {
    const failed = clients([FAIL])
    const empty = clients([json([])])

    expect(failed.gh.prList()).toBeNull()
    expect(await failed.agh.prList()).toBeNull()
    expect(empty.gh.prList()).toEqual([])
    expect(await empty.agh.prList()).toEqual([])

    expect(failed.gh.issueList()).toBeNull()
    expect(await failed.agh.issueList()).toBeNull()
    expect(empty.gh.issueList()).toEqual([])
    expect(await empty.agh.issueList()).toEqual([])

    expect(failed.gh.labelList()).toBeNull()
    expect(await failed.agh.labelList()).toBeNull()
    expect(empty.gh.labelList()).toEqual([])
    expect(await empty.agh.labelList()).toEqual([])
  })

  test('single-value queries are null on failure too', async () => {
    const f = clients([FAIL])
    expect(f.gh.prView(1)).toBeNull()
    expect(f.gh.prBody(1)).toBeNull()
    expect(f.gh.issueView(1)).toBeNull()
    expect(f.gh.prReviewThreads(1)).toBeNull()
    expect(f.gh.openPrFor('feature/x')).toBeNull()
    expect(await f.agh.prView(1)).toBeNull()
    expect(await f.agh.prBody(1)).toBeNull()
    expect(await f.agh.issueView(1)).toBeNull()
    expect(await f.agh.prReviewThreads(1)).toBeNull()
    expect(await f.agh.openPrFor('feature/x')).toBeNull()
  })
})

describe('README: mutations throw CommandFailed, carrying argv and the full result', () => {
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
      expect(err).toBeInstanceOf(CommandFailed)
      const failed = err as CommandFailed
      expect(failed.argv.length).toBeGreaterThan(0)
      expect(failed.result).toMatchObject({ exitCode: 1, stderr: 'gh: not authenticated' })
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
    // Three asks each, on two clients.
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
