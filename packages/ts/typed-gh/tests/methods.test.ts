/**
 * Methods and exports the other suites do not reach: `at`, `raw`,
 * `rawChecked`, `ownerRepo`, `prSetDraft`, `defaultRunnerFactory`,
 * `openPrsForBranch`, `PR_REF_FIELDS`, and the `AsyncGh` forms of the verbs
 * that only `Gh` had tests for.
 *
 * Offline: both clients run on fake runners that record each call.
 */

import { describe, expect, test } from 'bun:test'

import {
  AsyncGh,
  CommandFailed,
  Gh,
  PR_REF_FIELDS,
  defaultRunnerFactory,
  issueCommentEdit,
  openPrsForBranch,
  parsePullRequest,
  prReviewThreads,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '../index.ts'

interface Call {
  argv: string[]
  cwd: string | undefined
  timeoutMs: number | undefined
}

/** A `Gh` and an `AsyncGh` on fake runners that replay `results` (the last one repeats). */
function clients(results: CommandResult[]) {
  const ghCalls: Call[] = []
  const aghCalls: Call[] = []
  let ghNext = 0
  let aghNext = 0
  const pick = (i: number) => results[Math.min(i, results.length - 1)]!
  const syncRunner: CommandRunner = {
    run(argv, opts) {
      ghCalls.push({ argv: [...argv], cwd: opts?.cwd, timeoutMs: opts?.timeoutMs })
      return pick(ghNext++)
    },
  }
  const asyncRunner: AsyncCommandRunner = {
    async run(argv, opts) {
      aghCalls.push({ argv: [...argv], cwd: opts?.cwd, timeoutMs: opts?.timeoutMs })
      return pick(aghNext++)
    },
  }
  return {
    gh: new Gh('/repo', { runner: syncRunner }),
    agh: new AsyncGh('/repo', { runner: asyncRunner }),
    ghCalls,
    aghCalls,
  }
}

const ok = (stdout = ''): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const json = (body: unknown): CommandResult => ok(JSON.stringify(body))
const FAIL: CommandResult = { exitCode: 1, stdout: '', stderr: 'boom' }

describe('at', () => {
  test('roots the same client at another directory and keeps the runner', async () => {
    const f = clients([ok()])
    expect(f.gh.at('/other')).toBeInstanceOf(Gh)
    expect(f.agh.at('/other')).toBeInstanceOf(AsyncGh)
    expect(f.gh.at('/other').cwd).toBe('/other')
    expect(f.agh.at('/other').cwd).toBe('/other')
    expect(f.gh.cwd).toBe('/repo')

    f.gh.at('/other').raw(['x'])
    await f.agh.at('/other').raw(['x'])
    expect(f.ghCalls[0]!.cwd).toBe('/other')
    expect(f.aghCalls[0]!.cwd).toBe('/other')
  })
})

describe('raw and rawChecked', () => {
  test('raw hands back a failed result and passes cwd and timeoutMs through', async () => {
    const f = clients([FAIL])
    expect(f.gh.raw(['api', 'x'], { timeoutMs: 50 })).toMatchObject({ exitCode: 1 })
    expect(await f.agh.raw(['api', 'x'], { timeoutMs: 50 })).toMatchObject({ exitCode: 1 })
    const expected = [{ argv: ['api', 'x'], cwd: '/repo', timeoutMs: 50 }]
    expect(f.ghCalls).toEqual(expected)
    expect(f.aghCalls).toEqual(expected)
  })

  test('rawChecked returns a success and throws CommandFailed, with argv, on a failure', async () => {
    const good = clients([ok('fine')])
    expect(good.gh.rawChecked(['x']).stdout).toBe('fine')
    expect((await good.agh.rawChecked(['x'])).stdout).toBe('fine')

    const bad = clients([FAIL])
    expect(() => bad.gh.rawChecked(['x', 'y'])).toThrow(CommandFailed)
    const err = await bad.agh.rawChecked(['x', 'y']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CommandFailed)
    expect((err as CommandFailed).argv).toEqual(['x', 'y'])
  })
})

describe('ownerRepo', () => {
  test('parses the URL it is given, and never runs gh', () => {
    const f = clients([ok()])
    for (const c of [f.gh, f.agh]) {
      expect(c.ownerRepo('git@github.com:acme/widgets.git')).toEqual({
        owner: 'acme',
        repo: 'widgets',
      })
      expect(c.ownerRepo('not a url')).toBeNull()
      expect(c.ownerRepo(null)).toBeNull()
    }
    expect(f.ghCalls).toEqual([])
    expect(f.aghCalls).toEqual([])
  })
})

describe('prSetDraft', () => {
  test.each([
    ['to a draft', true, ['pr', 'ready', '7', '--undo']],
    ['to ready for review', false, ['pr', 'ready', '7']],
  ] as const)('%s builds gh pr ready', async (_name, draft, argv) => {
    const f = clients([ok()])
    f.gh.prSetDraft(7, draft)
    await f.agh.prSetDraft(7, draft)
    expect(f.ghCalls.map((c) => c.argv)).toEqual([[...argv]])
    expect(f.aghCalls.map((c) => c.argv)).toEqual([[...argv]])
  })

  test('throws CommandFailed when gh refuses', async () => {
    const f = clients([FAIL])
    expect(() => f.gh.prSetDraft(7, true)).toThrow(CommandFailed)
    await expect(f.agh.prSetDraft(7, true)).rejects.toBeInstanceOf(CommandFailed)
  })
})

describe('defaultRunnerFactory', () => {
  test('makes a real runner; a binary that does not exist is a result, not a throw', () => {
    const runner = defaultRunnerFactory('typed-gh-no-such-binary')
    const result = runner.run(['--version'], { cwd: process.cwd() })
    expect(result.exitCode).not.toBe(0)
  })

  test('its runner can drive a Gh client', () => {
    const runner = defaultRunnerFactory('typed-gh-no-such-binary')
    const gh = new Gh(process.cwd(), { runner })
    expect(gh.installed()).toBe(false)
    expect(gh.prList()).toBeNull()
  })
})

describe('openPrsForBranch and PR_REF_FIELDS', () => {
  test('PR_REF_FIELDS is the cheap identity set', () => {
    expect([...PR_REF_FIELDS]).toEqual(['number', 'state', 'headRefName', 'url'])
  })

  test('openPrsForBranch filters on the exact head with the identity fields and a small limit', () => {
    expect(openPrsForBranch('feature/foo').argv).toEqual([
      'pr',
      'list',
      '--state',
      'open',
      '--head',
      'feature/foo',
      '--json',
      PR_REF_FIELDS.join(','),
      '--limit',
      '6',
    ])
    expect(openPrsForBranch('feature/foo', 20).argv.slice(-2)).toEqual(['--limit', '21'])
  })

  test('openPrsForBranch parses rows, and is null when gh failed', () => {
    const verb = openPrsForBranch('feature/foo')
    expect(verb.checked).toBe(false)
    expect(verb.parse(FAIL)).toBeNull()
    const rows = verb.parse(json([{ number: 3, state: 'OPEN', headRefName: 'feature/foo' }]))
    expect(rows?.rows.map((pr) => pr.number)).toEqual([3])
  })

  test('openPrFor asks for PR_REF_FIELDS unless told otherwise, on both clients', async () => {
    const f = clients([json([])])
    f.gh.openPrFor('feature/foo')
    await f.agh.openPrFor('feature/foo')
    const fields = PR_REF_FIELDS.join(',')
    expect(f.ghCalls[0]!.argv).toContain(fields)
    expect(f.aghCalls[0]!.argv).toContain(fields)
  })
})

describe('AsyncGh forms agree with Gh', () => {
  const issue = { number: 7, title: 't', body: 'b', labels: [], state: 'OPEN' }
  const label = { name: 'bug', color: 'd73a4a', description: 'Something is wrong' }
  const threads = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: false },
            nodes: [
              { isResolved: false, isOutdated: false, comments: { nodes: [{ author: null }] } },
            ],
          },
        },
      },
    },
  }

  // Each row: method, how to call it, the replies gh gives, the argv of each
  // gh call, and the value both clients return.
  const TABLE: [string, (c: Gh | AsyncGh) => unknown, CommandResult[], string[][], unknown][] = [
    [
      'issueView',
      (c) => c.issueView(7),
      [json(issue)],
      [['issue', 'view', '7', '--json', 'number,title,body,labels,state']],
      issue,
    ],
    ['installed', (c) => c.installed(), [ok()], [['--version']], true],
    ['authenticated', (c) => c.authenticated(), [ok()], [['auth', 'status']], true],
    [
      'authStatus',
      (c) => c.authStatus(),
      [ok('Logged in\n')],
      [['auth', 'status']],
      { ok: true, detail: 'Logged in' },
    ],
    ['ready', (c) => c.ready(), [ok()], [['--version'], ['auth', 'status']], true],
    [
      'createPr',
      (c) => c.createPr({ head: 'h', base: 'main', title: 't', body: 'b', draft: true }),
      [ok('Creating pull request\nhttps://github.com/acme/widgets/pull/9\n')],
      [['pr', 'create', '--head', 'h', '--base', 'main', '--draft', '--title', 't', '--body', 'b']],
      'https://github.com/acme/widgets/pull/9',
    ],
    [
      'prMerge',
      (c) => c.prMerge(7, { method: 'rebase', headSha: 'abc1234' }),
      [ok()],
      [['pr', 'merge', '7', '--rebase', '--match-head-commit', 'abc1234']],
      undefined,
    ],
    [
      'prReviewThreads',
      (c) => c.prReviewThreads(5),
      [json(threads)],
      [prReviewThreads(5).argv],
      [{ isResolved: false, isOutdated: false, lastCommentAuthor: null }],
    ],
    [
      'openPrFor',
      (c) => c.openPrFor('feature/foo', { limit: 2, fields: ['number', 'headRefName'] }),
      [
        json([
          { number: 4, headRefName: 'feature/foo-2' },
          { number: 3, headRefName: 'feature/foo' },
        ]),
      ],
      [
        [
          'pr',
          'list',
          '--state',
          'open',
          '--head',
          'feature/foo',
          '--json',
          'number,headRefName',
          '--limit',
          '3',
        ],
      ],
      parsePullRequest({ number: 3, headRefName: 'feature/foo' }),
    ],
    [
      'openPrFor with undefined options',
      (c) => c.openPrFor('feature/foo', { limit: undefined, fields: undefined }),
      [json([])],
      [
        [
          'pr',
          'list',
          '--state',
          'open',
          '--head',
          'feature/foo',
          '--json',
          PR_REF_FIELDS.join(','),
          '--limit',
          '6',
        ],
      ],
      null,
    ],
    [
      'issueList',
      (c) => c.issueList({ label: 'bug' }),
      [json([issue])],
      [
        [
          'issue',
          'list',
          '--label',
          'bug',
          '--json',
          'number,title,body,labels,state',
          '--limit',
          '201',
        ],
      ],
      { rows: [issue], truncated: false },
    ],
    [
      'issueList with a limit',
      (c) => c.issueList({ limit: 20 }),
      [json([])],
      [['issue', 'list', '--json', 'number,title,body,labels,state', '--limit', '21']],
      { rows: [], truncated: false },
    ],
    [
      'labelList',
      (c) => c.labelList(),
      [json([label])],
      [['label', 'list', '--json', 'name,color,description', '--limit', '1001']],
      { rows: [label], truncated: false },
    ],
    [
      'labelList with a limit',
      (c) => c.labelList({ limit: 50 }),
      [json([])],
      [['label', 'list', '--json', 'name,color,description', '--limit', '51']],
      { rows: [], truncated: false },
    ],
    [
      'createLabel',
      (c) => c.createLabel(label),
      [ok()],
      [
        [
          'label',
          'create',
          'bug',
          '--color',
          'd73a4a',
          '--description',
          'Something is wrong',
          '--force',
        ],
      ],
      undefined,
    ],
    [
      'editLabel',
      (c) => c.editLabel('bug', { color: 'ffffff' }),
      [ok()],
      [['label', 'edit', 'bug', '--color', 'ffffff']],
      undefined,
    ],
    [
      'issueCommentEdit',
      (c) => c.issueCommentEdit('4204154439', 'new text'),
      [ok()],
      [
        [
          'api',
          '-X',
          'PATCH',
          'repos/{owner}/{repo}/issues/comments/4204154439',
          '-f',
          'body=new text',
        ],
      ],
      undefined,
    ],
    [
      'setIssueLabel',
      (c) => c.setIssueLabel(7, 'status:triage', 'status:define'),
      [ok()],
      [['issue', 'edit', '7', '--remove-label', 'status:triage', '--add-label', 'status:define']],
      undefined,
    ],
  ]

  test.each(TABLE)('%s', async (_name, call, replies, argvs, expected) => {
    const f = clients(replies)
    const fromSync = await call(f.gh)
    const fromAsync = await call(f.agh)
    expect(f.ghCalls.map((c) => c.argv)).toEqual(argvs)
    expect(f.aghCalls.map((c) => c.argv)).toEqual(argvs)
    expect(fromAsync).toEqual(expected)
    expect(fromSync).toEqual(expected)
  })

  test('the same methods reject with CommandFailed, or answer null/false, when gh fails', async () => {
    const f = clients([FAIL])
    expect(await f.agh.issueView(7)).toBeNull()
    expect(await f.agh.installed()).toBe(false)
    expect(await f.agh.authenticated()).toBe(false)
    expect(await f.agh.authStatus()).toEqual({ ok: false, detail: 'boom' })
    expect(await f.agh.ready()).toBe(false)
    expect(await f.agh.prReviewThreads(5)).toBeNull()
    await expect(
      f.agh.createPr({ head: 'h', base: 'main', title: 't', body: 'b' }),
    ).rejects.toBeInstanceOf(CommandFailed)
    await expect(f.agh.prMerge(7, { method: 'squash', headSha: 'abc' })).rejects.toBeInstanceOf(
      CommandFailed,
    )
    await expect(f.agh.setIssueLabel(7, null, 'x')).rejects.toBeInstanceOf(CommandFailed)
  })
})

describe('issueCommentEdit takes only a numeric REST id', () => {
  const BAD = ['abc', '', 'IC_kwDOR8X4fM76lk5H', '12/../../pulls/1', '12?x=1', ' 12', '-1', '1.5']

  test.each(BAD)('the verb rejects %p', (id) => {
    expect(() => issueCommentEdit(id, 'b')).toThrow(RangeError)
  })

  test('Gh throws a RangeError before any gh call', () => {
    const f = clients([ok()])
    for (const id of BAD) expect(() => f.gh.issueCommentEdit(id, 'b')).toThrow(RangeError)
    expect(f.ghCalls).toEqual([])
  })

  test('AsyncGh returns a rejected Promise with the same RangeError, and does not throw', async () => {
    const f = clients([ok()])
    for (const id of BAD) {
      let result: Promise<void> | undefined
      expect(() => {
        result = f.agh.issueCommentEdit(id, 'b')
      }).not.toThrow()
      await expect(result!).rejects.toBeInstanceOf(RangeError)
    }
    expect(f.aghCalls).toEqual([])
  })

  test('a numeric id still builds the REST path, on both clients', async () => {
    const f = clients([ok()])
    f.gh.issueCommentEdit('0042', 'b')
    await f.agh.issueCommentEdit('0042', 'b')
    const path = 'repos/{owner}/{repo}/issues/comments/0042'
    expect(f.ghCalls[0]!.argv).toContain(path)
    expect(f.aghCalls[0]!.argv).toContain(path)
  })
})
