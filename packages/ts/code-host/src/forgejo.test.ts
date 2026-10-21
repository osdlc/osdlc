/**
 * Tests for `ForgejoCodeHost` (`./forgejo.ts`) — the mapping from Forgejo's REST
 * JSON shapes onto `CodeHostPr`, and the `curl -w` response framing this whole
 * adapter's transport depends on. All calls go through a fake
 * `CommandRunner`; nothing here touches the network.
 */

import { describe, expect, test } from 'vitest'

import { ForgejoCodeHost, forgejoPrFrom, parseCurlResponse } from './forgejo.ts'
import { CommentNotFoundError } from './types.ts'
import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

function curlOk(status: number, body: unknown): CommandResult {
  return { exitCode: 0, stdout: `${JSON.stringify(body)}\nHTTPSTATUS:${status}`, stderr: '' }
}

function curlFail(): CommandResult {
  return { exitCode: 1, stdout: '', stderr: 'curl: could not resolve host' }
}

describe('parseCurlResponse', () => {
  test('splits the body from the trailing status marker', () => {
    expect(parseCurlResponse('{"a":1}\nHTTPSTATUS:200')).toEqual({ status: 200, body: '{"a":1}' })
  })

  test('tolerates a body containing literal newlines', () => {
    expect(parseCurlResponse('line1\nline2\nHTTPSTATUS:404')).toEqual({
      status: 404,
      body: 'line1\nline2',
    })
  })

  test('null when the marker is missing', () => {
    expect(parseCurlResponse('no marker here')).toBeNull()
  })
})

const BASE_PR = {
  number: 42,
  html_url: 'https://git.example.com/o/r/pulls/42',
  title: 't',
  state: 'open',
  merged: false,
  draft: false,
  user: { login: 'author-one' },
  base: { ref: 'main' },
  head: { ref: 'task/x', sha: 'sha1' },
  mergeable: true,
}

/**
 * Routes `getPr`'s four/five GET calls by URL shape. `opts.reviewComments`
 * answers EVERY review's own inline-comments call with the same list — fine
 * for these tests, which never give a PR more than one review with inline
 * comments to distinguish.
 */
function fakeGh(opts: {
  pr?: Record<string, unknown> | null
  list?: Record<string, unknown>[] | null
  comments?: Record<string, unknown>[]
  reviews?: Record<string, unknown>[]
  reviewComments?: Record<string, unknown>[]
  statuses?: Record<string, unknown>[]
}): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    runner: {
      run(argv) {
        calls.push([...argv])
        const url = argv[argv.length - 1]!
        if (/\/pulls\/\d+$/.test(url)) {
          return opts.pr === undefined || opts.pr === null ? curlFail() : curlOk(200, opts.pr)
        }
        if (/\/pulls\?/.test(url) || /\/pulls$/.test(url)) {
          return opts.list === undefined || opts.list === null ? curlFail() : curlOk(200, opts.list)
        }
        if (/\/issues\/\d+\/comments$/.test(url)) return curlOk(200, opts.comments ?? [])
        if (/\/reviews\/\d+\/comments$/.test(url)) return curlOk(200, opts.reviewComments ?? [])
        if (/\/pulls\/\d+\/reviews$/.test(url)) return curlOk(200, opts.reviews ?? [])
        if (/\/commits\/.+\/status$/.test(url))
          return curlOk(200, { statuses: opts.statuses ?? [] })
        return curlOk(200, {})
      },
    },
  }
}

function codeHost(runner: CommandRunner): ForgejoCodeHost {
  return new ForgejoCodeHost({
    runner,
    cwd: '/repo',
    host: 'git.example.com',
    owner: 'o',
    repo: 'r',
    token: 'tok',
  })
}

describe('ForgejoCodeHost request transport', () => {
  test('the token rides stdin (a curl -K config), never argv', () => {
    const seen: { argv: string[]; input: string | undefined }[] = []
    const runner: CommandRunner = {
      run(argv, opts) {
        seen.push({ argv: [...argv], input: opts.input })
        return curlOk(200, BASE_PR)
      },
    }
    codeHost(runner).getPr(42, { since: null })
    expect(seen.length).toBeGreaterThan(0)
    for (const call of seen) {
      // Not in argv: a value there sits in `ps`/`/proc/<pid>/cmdline` for
      // the life of the process, visible to anything else on the box.
      expect(call.argv.join(' ')).not.toContain('tok')
      expect(call.argv).toContain('-K')
      expect(call.input).toContain('Authorization: token tok')
    }
  })

  test('-q is the first argument, so a local ~/.curlrc cannot inject headers or a proxy', () => {
    const runner: CommandRunner = { run: () => curlOk(200, BASE_PR) }
    let firstArgv: string[] | undefined
    const spying: CommandRunner = {
      run(argv, opts) {
        firstArgv = argv
        return runner.run(argv, opts)
      },
    }
    codeHost(spying).getPr(42, { since: null })
    expect(firstArgv?.[0]).toBe('-q')
  })
})

describe('ForgejoCodeHost.getPr', () => {
  test('maps a settled PR, folding review comments into activity', () => {
    const { runner, calls } = fakeGh({
      pr: BASE_PR,
      reviews: [
        { id: 9, user: { login: 'reviewer' }, state: 'APPROVED', submitted_at: '2026-01-01' },
      ],
      reviewComments: [
        {
          id: 5,
          path: 'a.ts',
          line: 3,
          body: 'nit',
          user: { login: 'reviewer' },
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z',
        },
      ],
    })
    const pr = codeHost(runner).getPr(42, { since: null })

    expect(pr).not.toBeNull()
    expect(pr!.number).toBe(42)
    expect(pr!.state).toBe('open')
    expect(pr!.mergeable).toBe('mergeable')
    expect(pr!.headRef).toBe('task/x')
    expect(pr!.headSha).toBe('sha1')
    expect(pr!.reviewDecision).toBe('approved')
    const reviewComment = pr!.activity.find((a) => a.kind === 'review-comment')
    expect(reviewComment).toMatchObject({
      id: '5',
      kind: 'review-comment',
      at: '2026-01-01T00:00:00Z',
      editedAt: null,
    })
    expect(calls.some((c) => c[c.length - 1]!.endsWith('/pulls/42'))).toBe(true)
    expect(calls.some((c) => /\/reviews\/9\/comments$/.test(c[c.length - 1]!))).toBe(true)
  })

  test('mergeable: true/false/absent map to mergeable/conflicting/unknown', () => {
    expect(
      codeHost(fakeGh({ pr: { ...BASE_PR, mergeable: true } }).runner).getPr(42, { since: null })!
        .mergeable,
    ).toBe('mergeable')
    expect(
      codeHost(fakeGh({ pr: { ...BASE_PR, mergeable: false } }).runner).getPr(42, { since: null })!
        .mergeable,
    ).toBe('conflicting')
    const { mergeable: _drop, ...noMergeable } = BASE_PR
    expect(codeHost(fakeGh({ pr: noMergeable }).runner).getPr(42, { since: null })!.mergeable).toBe(
      'unknown',
    )
  })

  test('a draft PR reports mergeable: unknown even when Forgejo says mergeable: false', () => {
    // Forgejo's `mergeable` is a plain boolean that's `false` for any
    // merge-ineligible PR, drafts included — that's never a real conflict,
    // so classify.ts's CONFLICTS rule must not fire off a draft's `false`.
    expect(
      codeHost(fakeGh({ pr: { ...BASE_PR, draft: true, mergeable: false } }).runner).getPr(42, {
        since: null,
      })!.mergeable,
    ).toBe('unknown')
  })

  test('reviewDecision: latest review per user wins, REQUEST_CHANGES beats APPROVED', () => {
    const { runner } = fakeGh({
      pr: BASE_PR,
      reviews: [
        { id: 1, user: { login: 'a' }, state: 'APPROVED', submitted_at: '2026-01-01' },
        { id: 2, user: { login: 'a' }, state: 'REQUEST_CHANGES', submitted_at: '2026-01-02' },
      ],
    })
    expect(codeHost(runner).getPr(42, { since: null })!.reviewDecision).toBe('changes_requested')
  })

  test('reviewDecision: no reviews at all is null, not review_required', () => {
    const { runner } = fakeGh({ pr: BASE_PR, reviews: [] })
    expect(codeHost(runner).getPr(42, { since: null })!.reviewDecision).toBeNull()
  })

  test('reviewDecision: a review with no APPROVED/REQUEST_CHANGES is review_required', () => {
    const { runner } = fakeGh({
      pr: BASE_PR,
      reviews: [{ id: 1, user: { login: 'a' }, state: 'COMMENT', submitted_at: '2026-01-01' }],
    })
    expect(codeHost(runner).getPr(42, { since: null })!.reviewDecision).toBe('review_required')
  })

  test('reviewDecision: a dismissed or stale review never counts, even as the latest', () => {
    const { runner } = fakeGh({
      pr: BASE_PR,
      reviews: [
        { id: 1, user: { login: 'a' }, state: 'APPROVED', submitted_at: '2026-01-01' },
        {
          id: 2,
          user: { login: 'a' },
          state: 'REQUEST_CHANGES',
          submitted_at: '2026-01-02',
          dismissed: true,
        },
        {
          id: 3,
          user: { login: 'b' },
          state: 'APPROVED',
          submitted_at: '2026-01-03',
          stale: true,
        },
      ],
    })
    // `a`'s only standing review is the (later-dismissed) REQUEST_CHANGES
    // one — excluded entirely, leaving `a`'s earlier APPROVED as the one
    // that counts. `b`'s only review is stale — excluded, contributing
    // nothing. Net: one standing APPROVED, no standing REQUEST_CHANGES.
    expect(codeHost(runner).getPr(42, { since: null })!.reviewDecision).toBe('approved')
  })

  test('checks rollup: any failure/error wins, else pending, else none/success', () => {
    const failing = fakeGh({
      pr: BASE_PR,
      statuses: [
        { state: 'success', context: 'a' },
        { state: 'failure', context: 'b', target_url: 'https://x/b' },
      ],
    }).runner
    const r1 = codeHost(failing).getPr(42, { since: null })!
    expect(r1.checks.rollup).toBe('failure')
    expect(r1.checks.failing).toEqual(['b'])
    expect(r1.checks.failingUrls).toEqual([{ name: 'b', url: 'https://x/b' }])

    const pending = fakeGh({ pr: BASE_PR, statuses: [{ state: 'pending', context: 'a' }] }).runner
    expect(codeHost(pending).getPr(42, { since: null })!.checks.rollup).toBe('pending')

    const none = fakeGh({ pr: BASE_PR, statuses: [] }).runner
    expect(codeHost(none).getPr(42, { since: null })!.checks.rollup).toBe('none')

    const success = fakeGh({ pr: BASE_PR, statuses: [{ state: 'success', context: 'a' }] }).runner
    expect(codeHost(success).getPr(42, { since: null })!.checks.rollup).toBe('success')
  })

  test('null when the pr fetch fails', () => {
    const { runner } = fakeGh({ pr: null })
    expect(codeHost(runner).getPr(42, { since: null })).toBeNull()
  })

  test('a failing reviews/comments call degrades to empty activity, not a throw', () => {
    // Only the PR fetch succeeds; every other endpoint fails.
    const mixed: CommandRunner = {
      run(argv) {
        const url = argv[argv.length - 1]!
        if (/\/pulls\/\d+$/.test(url)) return curlOk(200, BASE_PR)
        return curlFail()
      },
    }
    const pr = codeHost(mixed).getPr(42, { since: null })
    expect(pr!.activity).toEqual([])
  })
})

describe('ForgejoCodeHost.listPrs / prForBranch', () => {
  test('maps the cheap listing fields, including isDraft and updatedAt', () => {
    const { runner } = fakeGh({
      list: [
        {
          number: 1,
          head: { ref: 'a' },
          user: { login: 'x' },
          labels: [{ name: 'l1' }],
          draft: true,
          updated_at: '2026-01-02T03:04:05Z',
        },
        { number: 2, head: { ref: 'b' }, user: null, labels: [], draft: false },
      ],
    })
    expect(codeHost(runner).listPrs({ state: 'open' })).toEqual([
      {
        number: 1,
        headRef: 'a',
        author: { login: 'x', isBot: false },
        labels: ['l1'],
        isDraft: true,
        updatedAt: '2026-01-02T03:04:05Z',
      },
      { number: 2, headRef: 'b', author: null, labels: [], isDraft: false, updatedAt: null },
    ])
  })

  test('null when the list call fails', () => {
    const { runner } = fakeGh({ list: null })
    expect(codeHost(runner).listPrs({})).toBeNull()
  })

  test('prForBranch resolves the exact-match PR', () => {
    const { runner } = fakeGh({
      list: [{ number: 7, head: { ref: 'task/x' }, user: null, labels: [] }],
    })
    expect(codeHost(runner).prForBranch('task/x')).toBe(7)
  })
})

describe('ForgejoCodeHost.listPrDetails', () => {
  test('maps the survey fields, counts reviews and flags a fork head', () => {
    const { runner, calls } = fakeGh({
      list: [
        {
          number: 3,
          title: 'T',
          html_url: 'https://git.example.com/o/r/pulls/3',
          base: { ref: 'main' },
          head: { ref: 'feat', sha: 'abc', repo: { full_name: 'fork/r' } },
          labels: [{ name: 'keep' }],
          draft: false,
        },
      ],
      reviews: [{ id: 1 }, { id: 2 }],
    })
    expect(codeHost(runner).listPrDetails({ limit: 5 })).toEqual([
      {
        number: 3,
        title: 'T',
        url: 'https://git.example.com/o/r/pulls/3',
        baseRef: 'main',
        headRef: 'feat',
        headSha: 'abc',
        isDraft: false,
        labels: ['keep'],
        reviewCount: 2,
        isCrossRepository: true,
      },
    ])
    expect(calls.some((c) => c[c.length - 1]!.endsWith('/repos/o/r/pulls/3/reviews'))).toBe(true)
  })

  test('a failed reviews request fails the listing instead of counting zero', () => {
    const runner: CommandRunner = {
      run(argv) {
        const url = argv[argv.length - 1]!
        if (/\/pulls\/\d+\/reviews$/.test(url)) return curlFail()
        return curlOk(200, [{ number: 3, head: { ref: 'f' }, base: { ref: 'main' } }])
      },
    }
    expect(codeHost(runner).listPrDetails({})).toBeNull()
  })

  test('limit is sent to the server and the fork check ignores case', () => {
    const { runner, calls } = fakeGh({
      list: [{ number: 1, head: { ref: 'f', repo: { full_name: 'O/R' } }, base: { ref: 'm' } }],
    })
    const rows = codeHost(runner).listPrDetails({ limit: 100 })
    expect(rows![0]!.isCrossRepository).toBe(false)
    expect(calls[0]![calls[0]!.length - 1]).toContain('limit=100')
  })

  test('repo scopes the listing to another repository', () => {
    const { runner, calls } = fakeGh({ list: [] })
    expect(codeHost(runner).listPrDetails({ repo: 'a/b' })).toEqual([])
    expect(calls[0]![calls[0]!.length - 1]).toContain('/repos/a/b/pulls?')
  })

  test('null when the list call fails', () => {
    const { runner } = fakeGh({ list: null })
    expect(codeHost(runner).listPrDetails({})).toBeNull()
  })
})

describe('ForgejoCodeHost.parsePrUrl', () => {
  test("Forgejo's PR URL says pulls, not pull, and must name this instance's host", () => {
    const f = codeHost({ run: () => curlOk(200, {}) })
    expect(f.parsePrUrl('https://git.example.com/o/r/pulls/9')).toEqual({
      codeHost: 'forgejo',
      owner: 'o',
      repo: 'r',
      number: 9,
    })
    expect(f.parsePrUrl('https://github.com/o/r/pull/9')).toBeNull()
    expect(f.parsePrUrl('https://other.example.com/o/r/pulls/9')).toBeNull()
  })
})

describe('forgejoPrFrom', () => {
  test('a comment with no id is dropped, not a crash', () => {
    const pr = forgejoPrFrom(BASE_PR, [{ id: undefined, body: 'x' }], [], [], [])
    expect(pr.activity).toEqual([])
  })
})

describe('ForgejoCodeHost.createPr / mergePr / reviewThreads', () => {
  test('createPr is unsupported and says so', () => {
    const f = codeHost({ run: () => curlOk(200, {}) })
    expect(() => f.createPr({ head: 'h', base: 'b', title: 't', body: 'x' })).toThrow(
      /does not support createPr/,
    )
  })

  test('mergePr is unsupported and says so', () => {
    const f = codeHost({ run: () => curlOk(200, {}) })
    expect(() => f.mergePr(9, { headSha: 'abc1234', method: 'merge' })).toThrow(
      /does not support mergePr/,
    )
  })

  test('setDraft is unsupported and says so', () => {
    const f = codeHost({ run: () => curlOk(200, {}) })
    expect(() => f.setDraft(9, false)).toThrow(/does not support setDraft/)
  })

  test('updateComment PATCHes the comment and throws on a failed request', () => {
    const seen: string[][] = []
    const ok: CommandRunner = {
      run: (argv) => {
        seen.push([...argv])
        return curlOk(200, {})
      },
    }
    codeHost(ok).updateComment(9, '55', 'edited')
    const argv = seen[0]!
    expect(argv).toContain('PATCH')
    expect(argv.at(-1)).toBe('https://git.example.com/api/v1/repos/o/r/issues/comments/55')
    expect(argv).toContain(JSON.stringify({ body: 'edited' }))
    expect(() => codeHost({ run: () => curlOk(500, {}) }).updateComment(9, '55', 'x')).toThrow(
      /updateComment: request failed/,
    )
  })

  test('updateComment throws CommentNotFoundError on a 404, never from the body text', () => {
    expect(() => codeHost({ run: () => curlOk(404, {}) }).updateComment(9, '55', 'x')).toThrow(
      CommentNotFoundError,
    )
    // A transient failure whose request body says "404 not found" is an ordinary error.
    let err: unknown
    try {
      codeHost({ run: () => curlOk(502, {}) }).updateComment(9, '55', 'run output: 404 not found')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(Error)
    expect(err).not.toBeInstanceOf(CommentNotFoundError)
  })

  test('reviewThreads is unknown (null): no thread model is read', () => {
    expect(codeHost({ run: () => curlOk(200, {}) }).reviewThreads(9)).toBeNull()
  })
})

describe('forgejoPrFrom headIsFork', () => {
  test('same repo is not a fork; another repo or an unknown head repo is', () => {
    const same = {
      ...BASE_PR,
      base: { ref: 'main', repo: { full_name: 'o/r' } },
      head: { ref: 'x', sha: 's', repo: { full_name: 'O/R' } },
    }
    expect(forgejoPrFrom(same, [], [], [], []).headIsFork).toBe(false)
    const fork = { ...same, head: { ref: 'x', sha: 's', repo: { full_name: 'me/r' } } }
    expect(forgejoPrFrom(fork, [], [], [], []).headIsFork).toBe(true)
    expect(forgejoPrFrom(BASE_PR, [], [], [], []).headIsFork).toBe(true)
  })
})
