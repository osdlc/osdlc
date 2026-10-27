/**
 * Tests for `ForgejoCodeHost` (`../src/forgejo.ts`): the mapping from Forgejo's REST
 * JSON to `CodeHostPr`, and the `curl -w` response format the adapter depends on.
 * All calls go through a fake `CommandRunner`, so nothing touches the network.
 */

import { unwrap } from '@osdlc/result'
import { describe, expect, test } from 'vitest'

import { ForgejoCodeHost, forgejoPrFrom, parseCurlResponse } from '../src/forgejo.ts'
import { CommentNotFoundError } from '../src/types.ts'
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
 * Answers `getPr`'s GET calls by URL shape. `opts.reviewComments` answers every
 * review's inline-comments call with the same list. That is enough here, since
 * no test gives a PR more than one review with inline comments.
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
        return fakeGh({ pr: BASE_PR }).runner.run(argv, opts)
      },
    }
    unwrap(codeHost(runner).getPr(42, { since: null }))
    expect(seen.length).toBeGreaterThan(0)
    for (const call of seen) {
      // Not in argv: a value there shows in `ps` and `/proc/<pid>/cmdline` for
      // the life of the process, where any other process can read it.
      expect(call.argv.join(' ')).not.toContain('tok')
      expect(call.argv).toContain('-K')
      expect(call.input).toContain('Authorization: token tok')
    }
  })

  test('the token is quoted for the curl config, and a newline in it cannot add an option', () => {
    const inputs: (string | undefined)[] = []
    const runner: CommandRunner = {
      run(_argv, opts) {
        inputs.push(opts.input)
        return curlOk(200, [])
      },
    }
    const withToken = (token: string): ForgejoCodeHost =>
      new ForgejoCodeHost({
        runner,
        cwd: '/repo',
        host: 'git.example.com',
        owner: 'o',
        repo: 'r',
        token,
      })
    unwrap(withToken('a"b\\c').listComments(1))
    expect(inputs[0]).toBe('header = "Authorization: token a\\"b\\\\c"\n')
    unwrap(withToken('tok\r\nurl = http://x').listComments(1))
    expect(inputs[1]).toBe('header = "Authorization: token tokurl = http://x"\n')
  })

  test('-q is the first argument, so a local ~/.curlrc cannot inject headers or a proxy', () => {
    const runner = fakeGh({ pr: BASE_PR }).runner
    let firstArgv: string[] | undefined
    const spying: CommandRunner = {
      run(argv, opts) {
        firstArgv = argv
        return runner.run(argv, opts)
      },
    }
    unwrap(codeHost(spying).getPr(42, { since: null }))
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
    const pr = unwrap(codeHost(runner).getPr(42, { since: null }))

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
      unwrap(
        codeHost(fakeGh({ pr: { ...BASE_PR, mergeable: true } }).runner).getPr(42, { since: null }),
      )!.mergeable,
    ).toBe('mergeable')
    expect(
      unwrap(
        codeHost(fakeGh({ pr: { ...BASE_PR, mergeable: false } }).runner).getPr(42, {
          since: null,
        }),
      )!.mergeable,
    ).toBe('conflicting')
    const { mergeable: _drop, ...noMergeable } = BASE_PR
    expect(
      unwrap(codeHost(fakeGh({ pr: noMergeable }).runner).getPr(42, { since: null }))!.mergeable,
    ).toBe('unknown')
  })

  test('a draft PR reports mergeable: unknown even when Forgejo says mergeable: false', () => {
    // Forgejo's `mergeable` is `false` for any PR that cannot be merged yet,
    // drafts included. For a draft that is not a conflict.
    expect(
      unwrap(
        codeHost(fakeGh({ pr: { ...BASE_PR, draft: true, mergeable: false } }).runner).getPr(42, {
          since: null,
        }),
      )!.mergeable,
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
    expect(unwrap(codeHost(runner).getPr(42, { since: null }))!.reviewDecision).toBe(
      'changes_requested',
    )
  })

  test('reviewDecision: no reviews at all is null, not review_required', () => {
    const { runner } = fakeGh({ pr: BASE_PR, reviews: [] })
    expect(unwrap(codeHost(runner).getPr(42, { since: null }))!.reviewDecision).toBeNull()
  })

  test('reviewDecision: a review with no APPROVED/REQUEST_CHANGES is review_required', () => {
    const { runner } = fakeGh({
      pr: BASE_PR,
      reviews: [{ id: 1, user: { login: 'a' }, state: 'COMMENT', submitted_at: '2026-01-01' }],
    })
    expect(unwrap(codeHost(runner).getPr(42, { since: null }))!.reviewDecision).toBe(
      'review_required',
    )
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
    // `a`'s later REQUEST_CHANGES was dismissed, so it is skipped and `a`'s
    // earlier APPROVED counts. `b`'s only review is stale, so it is skipped.
    // The result is one APPROVED and no REQUEST_CHANGES.
    expect(unwrap(codeHost(runner).getPr(42, { since: null }))!.reviewDecision).toBe('approved')
  })

  test('checks rollup: any failure/error wins, else pending, else none/success', () => {
    const failing = fakeGh({
      pr: BASE_PR,
      statuses: [
        { state: 'success', context: 'a' },
        { state: 'failure', context: 'b', target_url: 'https://x/b' },
      ],
    }).runner
    const r1 = unwrap(codeHost(failing).getPr(42, { since: null }))!
    expect(r1.checks.rollup).toBe('failure')
    expect(r1.checks.failing).toEqual(['b'])
    expect(r1.checks.failingUrls).toEqual([{ name: 'b', url: 'https://x/b' }])

    const pending = fakeGh({ pr: BASE_PR, statuses: [{ state: 'pending', context: 'a' }] }).runner
    expect(unwrap(codeHost(pending).getPr(42, { since: null }))!.checks.rollup).toBe('pending')

    const none = fakeGh({ pr: BASE_PR, statuses: [] }).runner
    expect(unwrap(codeHost(none).getPr(42, { since: null }))!.checks.rollup).toBe('none')

    const success = fakeGh({ pr: BASE_PR, statuses: [{ state: 'success', context: 'a' }] }).runner
    expect(unwrap(codeHost(success).getPr(42, { since: null }))!.checks.rollup).toBe('success')
  })

  test('a failed pr fetch is a failure, not an absent PR', () => {
    const { runner } = fakeGh({ pr: null })
    expect(codeHost(runner).getPr(42, { since: null })).toMatchObject({
      ok: false,
      error: { host: 'forgejo' },
    })
  })

  test('a 404 for the PR number is the answer "no such PR"', () => {
    expect(codeHost({ run: () => curlOk(404, {}) }).getPr(42, { since: null })).toEqual({
      ok: true,
      value: null,
    })
  })

  test.each([
    ['comments', /\/issues\/\d+\/comments$/],
    ['reviews', /\/pulls\/\d+\/reviews$/],
    ['review comments', /\/reviews\/\d+\/comments$/],
    ['combined status', /\/commits\/.+\/status$/],
  ])(
    'a failing %s call is the getPr failure, never an empty list or "no checks"',
    (_n, failing) => {
      // The PR fetch and every other endpoint succeed; one enrichment call fails.
      const { runner: base } = fakeGh({
        pr: BASE_PR,
        reviews: [{ id: 9, user: { login: 'a' }, state: 'COMMENT', submitted_at: '2026-01-01' }],
        statuses: [{ state: 'failure', context: 'ci' }],
      })
      const mixed: CommandRunner = {
        run(argv, opts) {
          const url = argv[argv.length - 1]!
          return failing.test(url) ? curlOk(401, {}) : base.run(argv, opts)
        },
      }
      const r = codeHost(mixed).getPr(42, { since: null })
      expect(r.ok).toBe(false)
      expect(!r.ok && r.error).toMatchObject({ kind: 'not-authenticated', host: 'forgejo' })
    },
  )
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
    expect(unwrap(codeHost(runner).listPrs({ state: 'open' }))).toEqual([
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
    expect(codeHost(runner).listPrs({}).ok).toBe(false)
  })

  test('prForBranch resolves the exact-match PR', () => {
    const { runner } = fakeGh({
      list: [{ number: 7, head: { ref: 'task/x' }, user: null, labels: [] }],
    })
    expect(unwrap(codeHost(runner).prForBranch('task/x'))).toBe(7)
  })

  test('prForBranch reads past the first page of open PRs', () => {
    const { runner, calls } = pagedPulls(
      Array.from({ length: 60 }, (_, i) => ({ number: i + 1, head: { ref: `b${i + 1}` } })),
    )
    expect(unwrap(codeHost(runner).prForBranch('b55'))).toBe(55)
    // The short second page does not end the listing; the empty third one does.
    expect(calls.map((u) => new URL(u).searchParams.get('page'))).toEqual(['1', '2', '3'])
  })

  test('author filters before the limit, so older PRs by the author still count', () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, i) => ({ number: i + 1, user: { login: 'other' } })),
      { number: 51, user: { login: 'bot' } },
      { number: 52, user: { login: 'other' } },
      { number: 53, user: { login: 'bot' } },
    ]
    const { runner } = pagedPulls(rows)
    const host = codeHost(runner)
    expect(unwrap(host.listPrs({ author: 'bot' })).map((p) => p.number)).toEqual([51, 53])
    expect(unwrap(host.listPrs({ author: 'bot', limit: 1 })).map((p) => p.number)).toEqual([51])
    expect(unwrap(host.listPrDetails({ author: 'bot', limit: 10 })).map((p) => p.number)).toEqual([
      51, 53,
    ])
  })

  test('without an author, a limit stops paging once enough rows are in', () => {
    const { runner, calls } = pagedPulls(Array.from({ length: 120 }, (_, i) => ({ number: i + 1 })))
    expect(unwrap(codeHost(runner).listPrs({ limit: 70 }))).toHaveLength(70)
    expect(calls.map((u) => new URL(u).searchParams.get('page'))).toEqual(['1', '2'])
  })

  test('a server whose MAX_RESPONSE_ITEMS is below the page size still lists every PR', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      number: i + 1,
      head: { ref: `b${i + 1}` },
      user: { login: i % 2 === 0 ? 'bot' : 'other' },
    }))
    const { runner, calls } = pagedPulls(rows, { maxItems: 10 })
    const host = codeHost(runner)
    expect(unwrap(host.listPrs({})).map((p) => p.number)).toEqual(rows.map((r) => r.number))
    expect(calls.map((u) => new URL(u).searchParams.get('page'))).toEqual(['1', '2', '3', '4'])
    expect(unwrap(host.prForBranch('b25'))).toBe(25)
    // The author filter still runs before the cap, across the short pages.
    expect(unwrap(host.listPrs({ author: 'bot', limit: 8 })).map((p) => p.number)).toEqual([
      1, 3, 5, 7, 9, 11, 13, 15,
    ])
    expect(unwrap(host.listPrs({ limit: 15 }))).toHaveLength(15)
  })

  test('a server that ignores page stops after one repeated page, with no duplicates', () => {
    const { runner, calls } = fakeGh({
      list: [
        { number: 1, head: { ref: 'a' } },
        { number: 2, head: { ref: 'b' } },
      ],
    })
    expect(unwrap(codeHost(runner).listPrs({})).map((p) => p.number)).toEqual([1, 2])
    expect(calls).toHaveLength(2)
  })
})

/**
 * A `pulls` listing that honours `page` and `limit` the way Forgejo does, over
 * `rows`. `maxItems` stands for the server's `MAX_RESPONSE_ITEMS`: a larger
 * `limit` is cut down to it. Any other GET (a PR's reviews) answers `[]`.
 * `calls` holds each listing URL.
 */
function pagedPulls(
  rows: Record<string, unknown>[],
  opts: { maxItems?: number } = {},
): { runner: CommandRunner; calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    runner: {
      run(argv) {
        const url = argv[argv.length - 1]!
        if (!/\/pulls\?/.test(url)) return curlOk(200, [])
        calls.push(url)
        const params = new URL(url).searchParams
        const page = Number(params.get('page') ?? '1')
        const limit = Math.min(Number(params.get('limit') ?? '30'), opts.maxItems ?? Infinity)
        return curlOk(200, rows.slice((page - 1) * limit, page * limit))
      },
    },
  }
}

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
    expect(unwrap(codeHost(runner).listPrDetails({ limit: 5 }))).toEqual([
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
    expect(codeHost(runner).listPrDetails({}).ok).toBe(false)
  })

  test('limit is sent to the server, capped at a page, and the fork check ignores case', () => {
    const { runner, calls } = fakeGh({
      list: [{ number: 1, head: { ref: 'f', repo: { full_name: 'O/R' } }, base: { ref: 'm' } }],
    })
    const rows = codeHost(runner).listPrDetails({ limit: 100 })
    expect(unwrap(rows)[0]!.isCrossRepository).toBe(false)
    expect(calls[0]![calls[0]!.length - 1]).toContain('page=1&limit=50')
    const before = calls.length
    codeHost(runner).listPrDetails({ limit: 5 })
    expect(calls[before]![calls[before]!.length - 1]).toContain('page=1&limit=5')
  })

  test('an unknown head repo reads as cross-repository, as getPr reads it as a fork', () => {
    const { runner } = fakeGh({
      list: [{ number: 1, head: { ref: 'f', repo: null }, base: { ref: 'm' } }],
    })
    expect(unwrap(codeHost(runner).listPrDetails({}))[0]!.isCrossRepository).toBe(true)
  })

  test('repo scopes the listing to another repository', () => {
    const { runner, calls } = fakeGh({ list: [] })
    expect(unwrap(codeHost(runner).listPrDetails({ repo: 'a/b' }))).toEqual([])
    expect(calls[0]![calls[0]!.length - 1]).toContain('/repos/a/b/pulls?')
  })

  test('null when the list call fails', () => {
    const { runner } = fakeGh({ list: null })
    expect(codeHost(runner).listPrDetails({}).ok).toBe(false)
  })
})

describe('ForgejoCodeHost.parsePrUrl', () => {
  test("Forgejo's PR URL says pulls, not pull, and must name this instance's host", () => {
    const f = codeHost({ run: () => curlOk(200, {}) })
    expect(f.parsePrUrl('https://git.example.com/o/r/pulls/9')).toEqual({
      codeHost: 'forgejo',
      host: 'git.example.com',
      owner: 'o',
      repo: 'r',
      number: 9,
    })
    expect(f.parsePrUrl('https://github.com/o/r/pull/9')).toBeNull()
    const ported = new ForgejoCodeHost({
      runner: { run: () => curlOk(200, {}) },
      cwd: '/repo',
      host: 'git.example.com:3000',
      owner: 'o',
      repo: 'r',
      token: 'tok',
    })
    // The port is dropped, so the host compares with typed-git's RemoteRepo.host.
    expect(ported.parsePrUrl('https://git.example.com:3000/o/r/pulls/9')?.host).toBe(
      'git.example.com',
    )
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
      /answered HTTP 500/,
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

  test('updateBranch POSTs the style to the update endpoint and throws on a failed request', () => {
    const seen: string[][] = []
    const runner: CommandRunner = {
      run: (argv) => {
        seen.push([...argv])
        return curlOk(200, {})
      },
    }
    codeHost(runner).updateBranch(7, 'rebase')
    expect(seen[0]).toContain('POST')
    expect(seen[0]!.at(-1)).toBe(
      'https://git.example.com/api/v1/repos/o/r/pulls/7/update?style=rebase',
    )
    expect(() => codeHost({ run: () => curlOk(409, {}) }).updateBranch(7, 'merge')).toThrow(
      /answered HTTP 409/,
    )
  })

  test('postComment takes id and created_at from the response, and the body is JSON', () => {
    const seen: string[][] = []
    const runner: CommandRunner = {
      run: (argv) => {
        seen.push([...argv])
        return curlOk(201, { id: 77, created_at: '2026-10-09T10:00:00Z' })
      },
    }
    expect(codeHost(runner).postComment(42, 'hi')).toEqual({
      id: '77',
      createdAt: '2026-10-09T10:00:00Z',
    })
    expect(seen[0]).toContain(JSON.stringify({ body: 'hi' }))
    expect(seen[0]!.at(-1)).toBe('https://git.example.com/api/v1/repos/o/r/issues/42/comments')
  })

  test('postComment on a 2xx body that is not JSON keeps no id and stamps now', () => {
    const raw: CommandRunner = {
      run: () => ({ exitCode: 0, stdout: 'not json\nHTTPSTATUS:201', stderr: '' }),
    }
    const posted = codeHost(raw).postComment(42, 'hi')
    expect(posted.id).toBe('')
    expect(Number.isNaN(Date.parse(posted.createdAt))).toBe(false)
  })

  test('listComments maps ids to strings and drops rows with no id', () => {
    const { runner } = fakeGh({
      comments: [{ id: 1, body: 'a', created_at: 't1' }, { id: 'x2' }, { body: 'no id' }],
    })
    expect(unwrap(codeHost(runner).listComments(42))).toEqual([
      { id: '1', createdAt: 't1', body: 'a' },
      { id: 'x2', createdAt: '', body: '' },
    ])
  })

  test('reviewThreads is unknown (an unsupported failure): no thread model is read', () => {
    expect(codeHost({ run: () => curlOk(200, {}) }).reviewThreads(9)).toMatchObject({
      ok: false,
      error: { kind: 'unsupported', host: 'forgejo' },
    })
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
