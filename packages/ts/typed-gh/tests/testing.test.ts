/**
 * `@osdlc/typed-gh/testing`: each builder's rows, default and overridden,
 * survive the real parser and read back as the expected value, and
 * `ghResult` drives a `Gh` client end to end through a fake runner.
 */

import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  Gh,
  issueList,
  issueView,
  labelList,
  openPrsForBranch,
  parsePullRequest,
  prList,
  prView,
  repoView,
  runVerb,
  searchPrs,
  type CommandResult,
  type CommandRunner,
} from '../src/index.ts'
import { parseCheckRun, parseLabels, parsePrSearchHit, parseRepository } from '../src/parse.ts'
import * as testing from '../src/testing.ts'
import {
  checkRunRow,
  commentRow,
  ghResult,
  issueRow,
  labelRow,
  prRow,
  repoRow,
  reviewRow,
  searchPrRow,
  statusContextRow,
} from '../src/testing.ts'

const SRC = join(import.meta.dirname, '..', 'src')

/** A runner that answers every call with `answer(argv)` and records the argv. */
function fake(answer: (argv: string[]) => CommandResult) {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push([...argv])
      return answer([...argv])
    },
  }
  return { gh: new Gh('/repo', { runner }), calls }
}

describe('the testing entry point', () => {
  test('exports exactly the builders and ghResult', () => {
    expect(Object.keys(testing).sort()).toEqual(
      [
        'checkRunRow',
        'commentRow',
        'ghResult',
        'issueRow',
        'labelRow',
        'prRow',
        'repoRow',
        'reviewRow',
        'searchPrRow',
        'statusContextRow',
      ].sort(),
    )
  })

  test('no other source file imports it', () => {
    const importers = readdirSync(SRC)
      .filter((f) => f.endsWith('.ts') && f !== 'testing.ts')
      .filter((f) => /from '\.\/testing(\.ts)?'/.test(readFileSync(join(SRC, f), 'utf8')))
    expect(importers).toEqual([])
  })
})

describe('ghResult', () => {
  test('is a successful run that printed the payload as JSON', () => {
    const result = ghResult([{ number: 1 }])
    expect(result.exitCode).toBe(0)
    expect(result.stderr).toBe('')
    expect(JSON.parse(result.stdout)).toEqual([{ number: 1 }])
  })
})

describe('overrides', () => {
  test('replace a field whole, shallowly', () => {
    const row = prRow({ author: { login: 'hubot' } })
    expect(row.author).toEqual({ login: 'hubot' })
  })

  test('undefined leaves the field out, and the parser then drops the row', () => {
    const row = prRow({ number: undefined })
    expect('number' in row).toBe(false)
    expect(parsePullRequest(row)).toBeNull()
    expect(
      prList()
        .parse(ghResult([row, prRow({ number: 2 })]))
        ?.rows.map((r) => r.number),
    ).toEqual([2])
  })

  test('do not leak between calls', () => {
    prRow({ title: 'changed' })
    expect(prRow().title).not.toBe('changed')
  })

  test('a default nested object is new each call, so editing one row edits only it', () => {
    const row = prRow()
    row.author!.login = 'mutated'
    row.labels.push(labelRow())
    expect(prRow().author?.login).toBe('octocat')
    expect(prRow().labels).toEqual([])
    expect(searchPrRow().author?.login).toBe('octocat')
  })
})

describe('prRow', () => {
  test('the default parses as an open, mergeable PR with every field known', () => {
    const pr = parsePullRequest(prRow())
    expect(pr).toEqual({
      number: 1,
      state: 'OPEN',
      title: 'Add retries to the fetch loop',
      body: 'Retries a failed fetch three times before giving up.',
      url: 'https://github.com/octo-org/hello-world/pull/1',
      isDraft: false,
      baseRefName: 'main',
      headRefName: 'feature/add-retries',
      headRefOid: '6dcb09b5b57875f334f61aebed695e2e4193db5e',
      isCrossRepository: false,
      mergeable: 'MERGEABLE',
      mergeStateStatus: 'CLEAN',
      reviewDecision: null,
      author: { login: 'octocat', isBot: false },
      labels: [],
      checks: [],
      comments: [],
      reviews: [],
      mergedAt: null,
      createdAt: '2024-01-15T09:30:00Z',
      updatedAt: '2024-01-16T14:05:00Z',
    })
  })

  test('overrides parse through, nested rows included, and the url follows the number', () => {
    const pr = parsePullRequest(
      prRow({
        number: 42,
        title: 'Fix it',
        headRefName: 'fix/it',
        isDraft: true,
        mergeable: 'CONFLICTING',
        reviewDecision: 'CHANGES_REQUESTED',
        // gh prints a bot author this way. The parser keeps the `app/` login.
        author: { is_bot: true, login: 'app/dependabot' },
        labels: [labelRow({ name: 'p1' })],
        comments: [commentRow({ body: 'why?' })],
        reviews: [reviewRow({ state: 'CHANGES_REQUESTED' })],
        statusCheckRollup: [checkRunRow({ conclusion: 'FAILURE' }), statusContextRow()],
      }),
    )
    expect(pr).toMatchObject({
      number: 42,
      title: 'Fix it',
      url: 'https://github.com/octo-org/hello-world/pull/42',
      headRefName: 'fix/it',
      isDraft: true,
      mergeable: 'CONFLICTING',
      reviewDecision: 'CHANGES_REQUESTED',
      author: { login: 'app/dependabot', isBot: true },
      labels: [{ name: 'p1', color: 'd73a4a' }],
      comments: [{ id: 'IC_kwDOAbCdEf5xYz12', author: { login: 'octocat' }, body: 'why?' }],
      reviews: [{ id: 'PRR_kwDOAbCdEf5xYz34', state: 'CHANGES_REQUESTED' }],
    })
    expect(pr?.checks.map((c) => [c.name, c.verdict])).toEqual([
      ['test', 'failure'],
      ['ci/build', 'success'],
    ])
  })

  test('survives prList and prView', () => {
    expect(prList().parse(ghResult([prRow(), prRow({ number: 2 })]))?.rows).toHaveLength(2)
    expect(prView(7).parse(ghResult(prRow({ number: 7 })))?.number).toBe(7)
  })
})

describe('checkRunRow and statusContextRow', () => {
  test('defaults read as green checks', () => {
    expect(parseCheckRun(checkRunRow())).toEqual({
      name: 'test',
      status: 'COMPLETED',
      conclusion: 'SUCCESS',
      verdict: 'success',
      url: 'https://github.com/octo-org/hello-world/actions/runs/1/job/1',
    })
    expect(parseCheckRun(statusContextRow())).toEqual({
      name: 'ci/build',
      status: null,
      conclusion: null,
      verdict: 'success',
      url: 'https://ci.example.com/builds/1',
    })
  })

  test('overrides set the verdict', () => {
    expect(parseCheckRun(checkRunRow({ status: 'IN_PROGRESS', conclusion: '' }))?.verdict).toBe(
      'pending',
    )
    expect(parseCheckRun(statusContextRow({ context: 'lint', state: 'ERROR' }))).toMatchObject({
      name: 'lint',
      verdict: 'failure',
    })
  })
})

describe('issueRow', () => {
  test('the default parses through issueView and issueList', () => {
    const expected = {
      number: 1,
      title: 'Fetch gives up after one failure',
      body: 'A single network error ends the whole sync.',
      labels: [],
      state: 'OPEN',
    }
    expect(issueView(1).parse(ghResult(issueRow()))).toEqual(expected)
    expect(issueList().parse(ghResult([issueRow()]))).toEqual({
      rows: [expected],
      truncated: false,
    })
  })

  test('overrides parse through', () => {
    const issue = issueView(9).parse(
      ghResult(issueRow({ number: 9, state: 'CLOSED', labels: [labelRow({ name: 'wontfix' })] })),
    )
    expect(issue).toMatchObject({ number: 9, state: 'CLOSED', labels: [{ name: 'wontfix' }] })
  })
})

describe('labelRow', () => {
  test('the default is GitHub’s bug label', () => {
    expect(parseLabels([labelRow()])).toEqual([
      { name: 'bug', color: 'd73a4a', description: "Something isn't working" },
    ])
  })

  test('overrides parse through labelList', () => {
    const result = labelList().parse(
      ghResult([labelRow(), labelRow({ name: 'p2', color: '0e8a16' })]),
    )
    expect(result?.rows.map((l) => [l.name, l.color])).toEqual([
      ['bug', 'd73a4a'],
      ['p2', '0e8a16'],
    ])
  })
})

describe('repoRow', () => {
  test('the default parses as a public repository on main', () => {
    expect(parseRepository(repoRow())).toEqual({
      nameWithOwner: 'octo-org/hello-world',
      owner: 'octo-org',
      name: 'hello-world',
      description: 'My first repository on GitHub.',
      defaultBranch: 'main',
      visibility: 'PUBLIC',
      isArchived: false,
      url: 'https://github.com/octo-org/hello-world',
    })
  })

  test('overrides parse through repoView, and the url follows nameWithOwner', () => {
    const repo = repoView('acme/widgets').parse(
      ghResult(
        repoRow({
          nameWithOwner: 'acme/widgets',
          defaultBranchRef: null,
          visibility: 'PRIVATE',
          isArchived: true,
        }),
      ),
    )
    expect(repo).toMatchObject({
      owner: 'acme',
      name: 'widgets',
      defaultBranch: null,
      visibility: 'PRIVATE',
      isArchived: true,
      url: 'https://github.com/acme/widgets',
    })
  })
})

describe('searchPrRow', () => {
  test('the default parses as an open hit in octo-org/hello-world', () => {
    expect(parsePrSearchHit(searchPrRow())).toEqual({
      number: 1,
      title: 'Add retries to the fetch loop',
      state: 'OPEN',
      url: 'https://github.com/octo-org/hello-world/pull/1',
      isDraft: false,
      repository: { owner: 'octo-org', repo: 'hello-world' },
      author: { login: 'octocat', isBot: false },
      labels: [],
      createdAt: '2024-01-15T09:30:00Z',
      updatedAt: '2024-01-16T14:05:00Z',
      closedAt: null,
    })
  })

  test("gh's zero closedAt on an open hit reads as null; a real one is kept", () => {
    expect(searchPrRow().closedAt).toBe('0001-01-01T00:00:00Z')
    expect(parsePrSearchHit(searchPrRow())?.closedAt).toBeNull()
    const closed = searchPrRow({ state: 'closed', closedAt: '2024-02-01T10:00:00Z' })
    expect(parsePrSearchHit(closed)?.closedAt).toBe('2024-02-01T10:00:00Z')
  })

  test('overrides parse through searchPrs, and the url follows number and repository', () => {
    const result = searchPrs('is:open').parse(
      ghResult([
        searchPrRow({
          number: 5,
          state: 'merged',
          repository: { name: 'widgets', nameWithOwner: 'acme/widgets' },
        }),
      ]),
    )
    expect(result?.rows[0]).toMatchObject({
      number: 5,
      state: 'MERGED',
      url: 'https://github.com/acme/widgets/pull/5',
      repository: { owner: 'acme', repo: 'widgets' },
    })
  })
})

describe('ghResult drives a Gh client', () => {
  test('prList', () => {
    const { gh, calls } = fake(() => ghResult([prRow({ number: 3 }), prRow({ number: 4 })]))
    expect(gh.prList().rows.map((pr) => pr.number)).toEqual([3, 4])
    expect(calls[0]?.slice(0, 2)).toEqual(['pr', 'list'])
  })

  test('repoList', () => {
    const { gh } = fake(() =>
      ghResult([repoRow({ nameWithOwner: 'acme/a' }), repoRow({ nameWithOwner: 'acme/b' })]),
    )
    expect(gh.repoList('acme').rows.map((r) => r.name)).toEqual(['a', 'b'])
  })

  test('openPrsForBranch and openPrFor keep only rows whose head is exactly the branch', () => {
    const rows = [
      prRow({ number: 1, headRefName: 'task/foo-2' }),
      prRow({ number: 2, headRefName: 'task/foo' }),
    ]
    const { gh, calls } = fake(() => ghResult(rows))
    const runner: CommandRunner = { run: () => ghResult(rows) }
    const found = runVerb(openPrsForBranch('task/foo'), runner, { cwd: '/repo' })
    expect(found?.rows.map((pr) => pr.number)).toEqual([2])
    expect(gh.openPrFor('task/foo')?.number).toBe(2)
    expect(calls[0]).toContain('--head')
  })

  test('prView with checks, then issueList and labelList', () => {
    const { gh } = fake((argv) => {
      if (argv[0] === 'pr') {
        return ghResult(
          prRow({ number: 8, statusCheckRollup: [checkRunRow({ conclusion: 'FAILURE' })] }),
        )
      }
      if (argv[0] === 'issue') return ghResult([issueRow({ number: 11 })])
      return ghResult([labelRow()])
    })
    expect(gh.prView(8)?.checks[0]?.verdict).toBe('failure')
    expect(gh.issueList().rows[0]?.number).toBe(11)
    expect(gh.labelList().rows[0]?.name).toBe('bug')
  })
})
