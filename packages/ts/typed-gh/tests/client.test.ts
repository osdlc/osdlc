/**
 * The `Gh` client: how it builds argv, its three call styles, and the
 * merge-state retry, the one behaviour it adds on top of `gh`.
 *
 * Every test runs offline against a fake `CommandRunner`, so the suite does
 * not need GitHub.
 */

import { FailureError } from '@osdlc/result'
import { describe, expect, test } from 'vitest'

import {
  Gh,
  api,
  ownerRepoSlug,
  parseOwnerRepo,
  pickPrForBranch,
  parsePullRequest,
  PR_LIST_FIELDS,
  type CommandResult,
  type CommandRunner,
} from '../src/index.ts'

/** Records argv and replays a queue of canned results (the last one repeats). */
function recorder(results: CommandResult[] = [{ exitCode: 0, stdout: '', stderr: '' }]) {
  const calls: string[][] = []
  let i = 0
  const runner: CommandRunner = {
    run(argv) {
      calls.push([...argv])
      const r = results[Math.min(i, results.length - 1)]!
      i += 1
      return r
    },
  }
  return { calls, runner }
}

const json = (body: unknown): CommandResult => ({
  exitCode: 0,
  stdout: JSON.stringify(body),
  stderr: '',
})

const FAIL: CommandResult = { exitCode: 1, stdout: '', stderr: 'gh: not authenticated' }

describe('Gh — reviews', () => {
  test('prDiff and prComment build plain argv and are checked', () => {
    const { runner, calls } = recorder([
      { exitCode: 0, stdout: 'diff --git', stderr: '' },
      { exitCode: 0, stdout: 'https://x/pull/7#c1\n', stderr: '' },
    ])
    const gh = new Gh('/repo', { runner })
    expect(gh.prDiff(7)).toBe('diff --git')
    expect(gh.prComment(7, 'hi')).toBe('https://x/pull/7#c1')
    expect(calls).toEqual([
      ['pr', 'diff', '7'],
      ['pr', 'comment', '7', '--body', 'hi'],
    ])
    expect(() => new Gh('/repo', { runner: recorder([FAIL]).runner }).prDiff(7)).toThrow(
      FailureError,
    )
  })

  test('createReview posts a COMMENT review with right-side inline comments on stdin', () => {
    const seen: { argv: string[]; input: string | undefined }[] = []
    const runner: CommandRunner = {
      run(argv, opts) {
        seen.push({ argv: [...argv], input: opts?.input })
        return { exitCode: 0, stdout: JSON.stringify({ html_url: 'https://x/r/1' }), stderr: '' }
      },
    }
    const url = new Gh('/repo', { runner }).createReview(7, {
      commitId: 'abc',
      body: 'b',
      comments: [{ path: 'a.ts', line: 3, body: 'c' }],
    })
    expect(url).toBe('https://x/r/1')
    expect(seen[0]!.argv).toEqual([
      'api',
      '--method',
      'POST',
      'repos/{owner}/{repo}/pulls/7/reviews',
      '--input',
      '-',
    ])
    expect(JSON.parse(seen[0]!.input!)).toEqual({
      commit_id: 'abc',
      body: 'b',
      event: 'COMMENT',
      comments: [{ path: 'a.ts', line: 3, side: 'RIGHT', body: 'c' }],
    })
  })
})

describe('Gh — review replies', () => {
  test('prComment takes the last line only when it is a URL', () => {
    const { runner } = recorder([
      { exitCode: 0, stdout: 'note: x\nhttps://x/pull/7#c2\n', stderr: '' },
      { exitCode: 0, stdout: '', stderr: '' },
      { exitCode: 0, stdout: 'posted\n', stderr: '' },
    ])
    const gh = new Gh('/repo', { runner })
    expect(gh.prComment(7, 'a')).toBe('https://x/pull/7#c2')
    expect(gh.prComment(7, 'b')).toBe('')
    expect(gh.prComment(7, 'c')).toBe('')
  })

  test('createReview returns empty for an empty, non-JSON or url-less reply, and throws on failure', () => {
    const opts = { commitId: 'abc', body: 'b', comments: [] }
    const { runner } = recorder([
      { exitCode: 0, stdout: '', stderr: '' },
      { exitCode: 0, stdout: 'not json', stderr: '' },
      json({ html_url: 7 }),
    ])
    const gh = new Gh('/repo', { runner })
    expect(gh.createReview(7, opts)).toBe('')
    expect(gh.createReview(7, opts)).toBe('')
    expect(gh.createReview(7, opts)).toBe('')
    expect(() =>
      new Gh('/repo', { runner: recorder([FAIL]).runner }).createReview(7, opts),
    ).toThrow(FailureError)
  })
})

describe('Gh — argv', () => {
  test('prList defaults to open, the light field set, and a bounded limit', () => {
    const { runner, calls } = recorder([json([])])
    new Gh('/repo', { runner }).prList()
    expect(calls[0]).toEqual([
      'pr',
      'list',
      '--state',
      'open',
      '--json',
      PR_LIST_FIELDS.join(','),
      '--limit',
      '101',
    ])
  })

  test('prList asks for number even when fields leaves it out, so rows are not dropped', () => {
    const { runner, calls } = recorder([json([{ number: 3, title: 'a', url: 'u' }])])
    const result = new Gh('/repo', { runner }).prList({ fields: ['title', 'url'] })
    expect(calls[0]).toContain('number,title,url')
    expect(result?.rows).toHaveLength(1)
    expect(result?.rows[0]?.number).toBe(3)
  })

  test('truncated stays correct when fields leaves out number', () => {
    const rows = [
      { number: 1, title: 'a' },
      { number: 2, title: 'b' },
    ]
    const { runner } = recorder([json(rows)])
    const result = new Gh('/repo', { runner }).prList({ fields: ['title'], limit: 1 })
    expect(result?.truncated).toBe(true)
    expect(result?.rows).toHaveLength(1)
  })

  test("a head filter becomes gh's exact --head, base becomes an exact flag", () => {
    const { runner, calls } = recorder([json([])])
    new Gh('/repo', { runner }).prList({ head: 'feature/x', base: 'main', limit: 5 })
    expect(calls[0]).toEqual([
      'pr',
      'list',
      '--state',
      'open',
      '--base',
      'main',
      '--head',
      'feature/x',
      '--json',
      PR_LIST_FIELDS.join(','),
      '--limit',
      '6',
    ])
  })

  test('prView asks for the heavy fields; a subset can be named', () => {
    const { runner, calls } = recorder([json({ number: 1 })])
    const gh = new Gh('/repo', { runner })
    gh.prView(12, { fields: ['number', 'mergeable'] })
    expect(calls[0]).toEqual(['pr', 'view', '12', '--json', 'number,mergeable'])
  })

  test('prView always asks for number, or a field subset would parse as "no such PR"', () => {
    const { runner, calls } = recorder([json({ number: 12, headRefOid: 'abc' })])
    const pr = new Gh('/repo', { runner }).prView(12, { fields: ['headRefOid'] })
    expect(calls[0]).toEqual(['pr', 'view', '12', '--json', 'number,headRefOid'])
    expect(pr?.headRefOid).toBe('abc')
  })

  test('prView names each field once', () => {
    const { runner, calls } = recorder([json({ number: 12 })])
    new Gh('/repo', { runner }).prView(12, { fields: ['number', 'number', 'title'] })
    expect(calls[0]).toEqual(['pr', 'view', '12', '--json', 'number,title'])
  })

  test('prBody trims a trailing CRLF as well as a trailing LF', () => {
    const { runner } = recorder([{ exitCode: 0, stdout: 'x\r\n', stderr: '' }])
    expect(new Gh('/repo', { runner }).prBody(7)).toBe('x')
  })

  test('editPr omits the flag for a field that was not given', () => {
    const { runner, calls } = recorder()
    const gh = new Gh('/repo', { runner })
    gh.editPr(3, { body: 'new body' })
    expect(calls[0]).toEqual(['pr', 'edit', '3', '--body', 'new body'])
  })

  test('labelList asks for name, color, description with a generous --limit', () => {
    const { runner, calls } = recorder([json([])])
    new Gh('/repo', { runner }).labelList()
    expect(calls[0]).toEqual([
      'label',
      'list',
      '--json',
      'name,color,description',
      '--limit',
      '1001',
    ])
  })

  test('createLabel always forces the write', () => {
    const { runner, calls } = recorder()
    new Gh('/repo', { runner }).createLabel({
      name: 'status:triage',
      color: '1f6feb',
      description: 'Triage stage',
    })
    expect(calls[0]).toEqual([
      'label',
      'create',
      'status:triage',
      '--color',
      '1f6feb',
      '--description',
      'Triage stage',
      '--force',
    ])
  })

  test('editLabel omits a flag that was not given', () => {
    const { runner, calls } = recorder()
    const gh = new Gh('/repo', { runner })
    gh.editLabel('auto:triage', { color: 'f0883e' })
    expect(calls[0]).toEqual(['label', 'edit', 'auto:triage', '--color', 'f0883e'])
  })

  test('issueList asks for number,title,body,labels,state with a 200 cap', () => {
    const { runner, calls } = recorder([json([])])
    new Gh('/repo', { runner }).issueList()
    expect(calls[0]).toEqual([
      'issue',
      'list',
      '--json',
      'number,title,body,labels,state',
      '--limit',
      '201',
    ])
  })

  test('issueList adds --label right after the noun/verb when given', () => {
    const { runner, calls } = recorder([json([])])
    new Gh('/repo', { runner }).issueList({ label: 'status:triage' })
    expect(calls[0]).toEqual([
      'issue',
      'list',
      '--label',
      'status:triage',
      '--json',
      'number,title,body,labels,state',
      '--limit',
      '201',
    ])
  })

  test('issueView asks for the same field set as issueList, for one issue', () => {
    const { runner, calls } = recorder([json({ number: 7 })])
    new Gh('/repo', { runner }).issueView(7)
    expect(calls[0]).toEqual(['issue', 'view', '7', '--json', 'number,title,body,labels,state'])
  })

  test('setIssueLabel removes the current label and adds the new one in one call', () => {
    const { runner, calls } = recorder()
    new Gh('/repo', { runner }).setIssueLabel(7, 'status:triage', 'status:define')
    expect(calls[0]).toEqual([
      'issue',
      'edit',
      '7',
      '--remove-label',
      'status:triage',
      '--add-label',
      'status:define',
    ])
  })

  test('setIssueLabel omits --remove-label when there is no current label', () => {
    const { runner, calls } = recorder()
    new Gh('/repo', { runner }).setIssueLabel(7, null, 'status:triage')
    expect(calls[0]).toEqual(['issue', 'edit', '7', '--add-label', 'status:triage'])
  })

  test('ready() is the two-step probe and stops at the first failure', () => {
    const bad = recorder([FAIL])
    expect(new Gh('/repo', { runner: bad.runner }).ready()).toBe(false)
    expect(bad.calls).toEqual([['--version']])

    const good = recorder([{ exitCode: 0, stdout: '', stderr: '' }])
    expect(new Gh('/repo', { runner: good.runner }).ready()).toBe(true)
    expect(good.calls).toEqual([['--version'], ['auth', 'status']])
  })

  test('installed() and authenticated() ask one question each', () => {
    // A report that tells a person which check failed needs each check on
    // its own.
    const missing = recorder([FAIL])
    expect(new Gh('/repo', { runner: missing.runner }).installed()).toBe(false)
    expect(missing.calls).toEqual([['--version']])

    const loggedOut = recorder([FAIL])
    expect(new Gh('/repo', { runner: loggedOut.runner }).authenticated()).toBe(false)
    expect(loggedOut.calls).toEqual([['auth', 'status']])
  })

  test('authStatus() carries what gh printed, stderr first', () => {
    const loggedOut = recorder([FAIL])
    expect(new Gh('/repo', { runner: loggedOut.runner }).authStatus()).toEqual({
      ok: false,
      detail: 'gh: not authenticated',
    })
    const loggedIn = recorder([{ exitCode: 0, stdout: '  Logged in to github.com\n', stderr: '' }])
    expect(new Gh('/repo', { runner: loggedIn.runner }).authStatus()).toEqual({
      ok: true,
      detail: 'Logged in to github.com',
    })
  })
})

describe('Gh — the three doors', () => {
  test("a failed query throws and soft is null, never [] — 'no PRs' and 'couldn't ask' differ", () => {
    const gh = new Gh('/repo', { runner: recorder([FAIL]).runner })
    expect(() => gh.prList()).toThrow(FailureError)
    expect(gh.soft.prList()).toBeNull()
    expect(() => new Gh('/repo', { runner: recorder([FAIL]).runner }).prView(1)).toThrow(
      FailureError,
    )

    const empty = new Gh('/repo', { runner: recorder([json([])]).runner })
    expect(empty.prList()).toEqual({ rows: [], truncated: false })
  })

  test('malformed JSON throws an unreadable failure, and soft is null', () => {
    const runner = recorder([{ exitCode: 0, stdout: 'not json', stderr: '' }]).runner
    expect(() => new Gh('/repo', { runner }).prList()).toThrow(/could not be read/)
    expect(new Gh('/repo', { runner }).soft.prList()).toBeNull()
  })

  test('a mutation throws the classified failure, carrying argv and the result', () => {
    const gh = new Gh('/repo', { runner: recorder([FAIL]).runner })
    expect(() => gh.editPr(1, { body: 'x' })).toThrow(FailureError)
  })

  test('labelList throws on failure, [] on a genuinely empty repo', () => {
    expect(() => new Gh('/repo', { runner: recorder([FAIL]).runner }).labelList()).toThrow(
      FailureError,
    )
    expect(new Gh('/repo', { runner: recorder([FAIL]).runner }).soft.labelList()).toBeNull()
    expect(new Gh('/repo', { runner: recorder([json([])]).runner }).labelList()).toEqual({
      rows: [],
      truncated: false,
    })
  })

  test('labelList parses the full row and is unreadable on malformed JSON', () => {
    const runner = recorder([
      json([{ name: 'status:triage', color: '1f6feb', description: 'Triage stage' }]),
    ]).runner
    expect(new Gh('/repo', { runner }).labelList().rows).toEqual([
      { name: 'status:triage', color: '1f6feb', description: 'Triage stage' },
    ])

    const bad = recorder([{ exitCode: 0, stdout: 'not json', stderr: '' }]).runner
    expect(new Gh('/repo', { runner: bad }).soft.labelList()).toBeNull()
    expect(() => new Gh('/repo', { runner: bad }).labelList()).toThrow(/could not be read/)
  })

  test('createLabel/editLabel throw on a non-zero exit', () => {
    const gh = new Gh('/repo', { runner: recorder([FAIL]).runner })
    expect(() => gh.createLabel({ name: 'x', color: '000000', description: '' })).toThrow(
      FailureError,
    )
    const gh2 = new Gh('/repo', { runner: recorder([FAIL]).runner })
    expect(() => gh2.editLabel('x', { color: '000000' })).toThrow(FailureError)
  })

  test('createPr returns the URL line gh printed', () => {
    const runner = recorder([
      {
        exitCode: 0,
        stdout: '\nCreating pull request…\nhttps://github.com/o/r/pull/9\n',
        stderr: '',
      },
    ]).runner
    const url = new Gh('/repo', { runner }).createPr({
      head: 'h',
      base: 'main',
      title: 't',
      body: 'b',
    })
    expect(url).toBe('https://github.com/o/r/pull/9')
  })

  test('createPr skips a trailing line that is not a URL, such as a tip', () => {
    const runner = recorder([
      { exitCode: 0, stdout: 'https://github.com/o/r/pull/9\n! a tip\n', stderr: '' },
    ]).runner
    const opts = { head: 'h', base: 'main', title: 't', body: 'b' }
    expect(new Gh('/repo', { runner }).createPr(opts)).toBe('https://github.com/o/r/pull/9')
  })

  test("createPr returns '' when gh printed no URL, as prComment does", () => {
    const opts = { head: 'h', base: 'main', title: 't', body: 'b' }
    for (const stdout of ['', 'Creating pull request…\n', '\r\n! a tip\r\n']) {
      const runner = recorder([{ exitCode: 0, stdout, stderr: '' }]).runner
      expect(new Gh('/repo', { runner }).createPr(opts)).toBe('')
    }
  })
})

describe('Gh — the merge-state retry', () => {
  const unknown = json({ number: 1, mergeable: 'UNKNOWN', mergeStateStatus: 'UNKNOWN' })
  const settled = json({ number: 1, mergeable: 'MERGEABLE', mergeStateStatus: 'CLEAN' })

  test('re-asks while GitHub is still computing, then returns the settled answer', () => {
    const { runner, calls } = recorder([unknown, unknown, settled])
    const slept: number[] = []
    const pr = new Gh('/repo', { runner }).prViewSettled(1, {
      sleep: (ms) => slept.push(ms),
    })
    expect(pr?.mergeable).toBe('MERGEABLE')
    expect(calls).toHaveLength(3)
    expect(slept).toHaveLength(2)
  })

  test('does not re-ask when the first answer already settled', () => {
    const { runner, calls } = recorder([settled])
    const slept: number[] = []
    new Gh('/repo', { runner }).prViewSettled(1, { sleep: (ms) => slept.push(ms) })
    expect(calls).toHaveLength(1)
    expect(slept).toEqual([])
  })

  test('gives up after `attempts` and returns UNKNOWN — a legitimate verdict', () => {
    const { runner, calls } = recorder([unknown])
    const pr = new Gh('/repo', { runner }).prViewSettled(1, {
      attempts: 2,
      sleep: () => {},
    })
    expect(calls).toHaveLength(2)
    expect(pr?.mergeable).toBe('UNKNOWN')
  })

  test('stops immediately when gh itself failed — retrying will not help', () => {
    const { runner, calls } = recorder([FAIL])
    expect(() => new Gh('/repo', { runner }).prViewSettled(1, { sleep: () => {} })).toThrow(
      FailureError,
    )
    expect(calls).toHaveLength(1)
  })
})

describe('branch matching and owner/repo', () => {
  test("gh's prefix search needs an exact filter on top", () => {
    const rows = [
      parsePullRequest({ number: 1, headRefName: 'feature/foo-2' })!,
      parsePullRequest({ number: 2, headRefName: 'feature/foo' })!,
    ]
    expect(pickPrForBranch(rows, 'feature/foo')?.number).toBe(2)
    expect(pickPrForBranch(rows, 'feature/nope')).toBeNull()
    // A failed call (null) stays null.
    expect(pickPrForBranch(null, 'feature/foo')).toBeNull()
  })

  test('every remote shape resolves to the same coordinate', () => {
    const expected = { owner: 'acme', repo: 'widgets' }
    for (const url of [
      'git@github.com:acme/widgets.git',
      'https://github.com/acme/widgets.git',
      'https://github.com/acme/widgets',
      'ssh://git@github.com/acme/widgets.git',
    ]) {
      expect(parseOwnerRepo(url)).toEqual(expected)
    }
    expect(ownerRepoSlug(expected)).toBe('acme/widgets')
    expect(parseOwnerRepo('not a url')).toBeNull()
  })
})

describe('prMerge and prReviewThreads', () => {
  test('prMerge pins the merge to the judged head', () => {
    const { runner, calls } = recorder()
    new Gh('/repo', { runner }).prMerge(7, { method: 'squash', headSha: 'abc1234' })
    expect(calls).toEqual([['pr', 'merge', '7', '--squash', '--match-head-commit', 'abc1234']])
  })

  test('prMerge throws when gh refuses', () => {
    const { runner } = recorder([{ exitCode: 1, stdout: '', stderr: 'head moved' }])
    expect(() =>
      new Gh('/repo', { runner }).prMerge(7, { method: 'merge', headSha: 'abc1234' }),
    ).toThrow(FailureError)
  })

  const threadsPayload = (nodes: unknown[], hasNextPage = false) =>
    JSON.stringify({
      data: {
        repository: { pullRequest: { reviewThreads: { pageInfo: { hasNextPage }, nodes } } },
      },
    })

  test('prReviewThreads maps resolution and the last commenter', () => {
    const { runner, calls } = recorder([
      {
        exitCode: 0,
        stdout: threadsPayload([
          {
            isResolved: true,
            isOutdated: false,
            comments: { nodes: [{ author: { login: 'a' } }] },
          },
          { isResolved: false, isOutdated: true, comments: { nodes: [{ author: null }] } },
        ]),
        stderr: '',
      },
    ])
    const threads = new Gh('/repo', { runner }).prReviewThreads(5)
    expect(threads).toEqual([
      { isResolved: true, isOutdated: false, lastCommentAuthor: 'a' },
      { isResolved: false, isOutdated: true, lastCommentAuthor: null },
    ])
    expect(calls[0]!.slice(0, 2)).toEqual(['api', 'graphql'])
    expect(calls[0]).toContain('number=5')
  })

  test('prReviewThreads throws on failure, bad shape, or a second page; soft is null', () => {
    for (const r of [
      { exitCode: 1, stdout: '', stderr: 'x' },
      { exitCode: 0, stdout: 'not json', stderr: '' },
      { exitCode: 0, stdout: '{"data":{"repository":{"pullRequest":null}}}', stderr: '' },
      { exitCode: 0, stdout: threadsPayload([], true), stderr: '' },
    ]) {
      const { runner } = recorder([r])
      expect(() => new Gh('/repo', { runner }).prReviewThreads(5)).toThrow()
      expect(new Gh('/repo', { runner }).soft.prReviewThreads(5)).toBeNull()
    }
  })
})

describe('api with headers reads the last header block', () => {
  const opts = { includeHeaders: true }

  test('two stacked blocks give the status, ETag and body of the last one', () => {
    const stdout =
      'HTTP/2.0 200 OK\r\nEtag: W/"old"\r\n\r\n' +
      'HTTP/2.0 200 OK\r\nEtag: W/"new"\r\n\r\n{"name":"r2"}'
    const r = api('repos/o/r', opts).parse({ exitCode: 0, stdout, stderr: '' })
    expect(r).toMatchObject({ ok: true, status: 200, etag: 'W/"new"', body: { name: 'r2' } })
    expect(r.malformed).toBe(false)
  })

  test('the same with LF line ends, and a final block with no ETag', () => {
    const stdout = 'HTTP/1.1 100 Continue\n\nHTTP/1.1 404 Not Found\n\n{"message":"Not Found"}'
    const r = api('repos/o/r', opts).parse({ exitCode: 0, stdout, stderr: '' })
    expect(r).toMatchObject({ ok: false, status: 404, etag: null, body: { message: 'Not Found' } })
  })

  test('one header block reads as before', () => {
    const stdout = 'HTTP/2.0 200 OK\r\nEtag: W/"a"\r\n\r\n[1]'
    const r = api('repos/o/r', opts).parse({ exitCode: 0, stdout, stderr: '' })
    expect(r).toMatchObject({ ok: true, status: 200, etag: 'W/"a"', body: [1] })
  })
})

describe('api keeps the error body when the request fails', () => {
  const errBody = '{"message":"Not Found","documentation_url":"https://docs.github.com"}'

  test('a failed call without -i still decodes body and message', () => {
    const r = api('repos/o/r').parse({ exitCode: 1, stdout: errBody, stderr: '' })
    expect(r).toMatchObject({
      ok: false,
      status: 0,
      body: { message: 'Not Found' },
      message: 'Not Found',
      malformed: false,
    })
  })

  test('a failed call with -i reads the status and the error body', () => {
    const stdout = `HTTP/2.0 404 Not Found\r\n\r\n${errBody}`
    const r = api('repos/o/r', { includeHeaders: true }).parse({ exitCode: 1, stdout, stderr: '' })
    expect(r).toMatchObject({
      ok: false,
      status: 404,
      body: { message: 'Not Found' },
      message: 'Not Found',
    })
  })

  test('a non-JSON failure body is malformed, with no message', () => {
    const r = api('repos/o/r').parse({ exitCode: 1, stdout: 'oops', stderr: 'x' })
    expect(r).toMatchObject({ ok: false, body: null, malformed: true, message: null })
  })

  test('message is null for a success body without one', () => {
    const r = api('repos/o/r').parse({ exitCode: 0, stdout: '[1]', stderr: '' })
    expect(r.message).toBeNull()
  })
})
