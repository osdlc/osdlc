/**
 * Finding one pull request: `prView` by number, branch or URL, the exact
 * `head` filter on `prList`, `parsePrRef`, and `prFind` on both clients.
 */

import { describe, expect, test } from 'vitest'

import {
  AsyncGh,
  Gh,
  parsePrRef,
  prList,
  prView,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '../index.ts'

const ok = (body: unknown): CommandResult => ({
  exitCode: 0,
  stdout: JSON.stringify(body),
  stderr: '',
})
const FAIL: CommandResult = { exitCode: 1, stdout: '', stderr: 'no pull requests found' }

/** A `Gh` and an `AsyncGh` that answer each argv with `answer(argv)`. */
function clients(answer: (argv: string[]) => CommandResult, opts: { repo?: string } = {}) {
  const calls: string[][] = []
  const sync: CommandRunner = {
    run(argv) {
      calls.push([...argv])
      return answer([...argv])
    },
  }
  const async: AsyncCommandRunner = {
    async run(argv) {
      calls.push([...argv])
      return answer([...argv])
    },
  }
  return {
    gh: new Gh('/repo', { runner: sync, ...opts }),
    agh: new AsyncGh('/repo', { runner: async, ...opts }),
    calls,
  }
}

describe('prView', () => {
  test('takes a number, a branch or a URL', () => {
    expect(prView(7, ['number']).argv.slice(0, 3)).toEqual(['pr', 'view', '7'])
    expect(prView('feature/x', ['number']).argv.slice(0, 3)).toEqual(['pr', 'view', 'feature/x'])
    const url = 'https://github.com/acme/widgets/pull/7'
    expect(prView(url, ['number']).argv.slice(0, 3)).toEqual(['pr', 'view', url])
  })

  test('a URL names its own repo, so the target is left off', () => {
    const url = 'https://github.com/acme/widgets/pull/7'
    expect(prView(url, ['number'], { repo: 'acme/other' }).argv).not.toContain('--repo')
    expect(prView('feature/x', ['number'], { repo: 'acme/other' }).argv).toContain('--repo')
  })

  test('a ref that reads as a flag throws RangeError', () => {
    expect(() => prView('--web', ['number'])).toThrow(RangeError)
  })

  test('number is always asked for, once', () => {
    expect(prView(7, ['title', 'number', 'title']).argv.at(-1)).toBe('title,number')
    expect(prView(7, ['title']).argv.at(-1)).toBe('number,title')
  })
})

describe('prList with head', () => {
  test("passes gh's exact --head and asks for headRefName", () => {
    const argv = prList({ head: 'task/foo', fields: ['number'] }).argv
    expect(argv).toContain('--head')
    expect(argv[argv.indexOf('--head') + 1]).toBe('task/foo')
    expect(argv).not.toContain('--search')
    expect(argv[argv.indexOf('--json') + 1]).toBe('headRefName,number')
  })

  test('filters the rows again, so a prefix match never comes back', () => {
    const verb = prList({ head: 'task/foo' })
    const rows = verb.parse(
      ok([
        { number: 1, headRefName: 'task/foo-2' },
        { number: 2, headRefName: 'task/foo' },
      ]),
    )
    expect(rows?.rows.map((r) => r.number)).toEqual([2])
    expect(verb.parse(FAIL)).toBeNull()
  })

  test('without head, the rows are untouched', () => {
    const rows = prList().parse(ok([{ number: 1, headRefName: 'a' }]))
    expect(rows?.rows.length).toBe(1)
  })
})

describe('parsePrRef', () => {
  test('digits are a number, and keep the branch reading', () => {
    expect(parsePrRef(' 42 ')).toEqual({ kind: 'number', number: 42, repo: null, orBranch: '42' })
    expect(parsePrRef('#42')).toEqual({ kind: 'number', number: 42, repo: null, orBranch: null })
  })

  test('owner/name#n names the repo', () => {
    expect(parsePrRef('acme/widgets#7')).toEqual({
      kind: 'number',
      number: 7,
      repo: { owner: 'acme', repo: 'widgets' },
      orBranch: null,
    })
    expect(parsePrRef('-x/widgets#7')).toBeNull()
  })

  test('a URL, on any GitHub host', () => {
    expect(parsePrRef('https://ghe.acme.com/acme/widgets/pull/7')).toEqual({
      kind: 'url',
      url: 'https://ghe.acme.com/acme/widgets/pull/7',
      hostname: 'ghe.acme.com',
      owner: 'acme',
      repo: 'widgets',
      number: 7,
    })
  })

  test('a branch name git would accept', () => {
    for (const name of ['main', 'feature/login', 'release-1.2', '0', 'a/b.c']) {
      expect(parsePrRef(name)).toEqual({ kind: 'branch', name })
    }
  })

  test('not a PR reference', () => {
    for (const text of [
      '',
      '  ',
      '-x',
      '--web',
      'a b',
      'a..b',
      'a~1',
      'a^',
      'a:b',
      'a?',
      'a*',
      'a[1]',
      'a\\b',
      '/a',
      'a/',
      'a.',
      'a//b',
      '.a',
      'a/.b',
      'a.lock',
      'a@{1}',
      '@',
      'acme/widgets#0',
    ]) {
      expect(parsePrRef(text)).toBeNull()
    }
  })
})

describe('prFind', () => {
  const pr = (number: number, state: string, head = 'feature/x') => ({
    number,
    state,
    headRefName: head,
  })

  test('a number is one prView call', async () => {
    const { gh, agh, calls } = clients(() => ok(pr(7, 'OPEN')))
    expect(gh.prFind('#7')?.number).toBe(7)
    expect((await agh.prFind('#7'))?.number).toBe(7)
    expect(calls.map((c) => c.slice(0, 3))).toEqual([
      ['pr', 'view', '7'],
      ['pr', 'view', '7'],
    ])
  })

  test('owner/name#n asks that repo, keeping the client host', () => {
    const { gh, calls } = clients(() => ok(pr(7, 'OPEN')))
    gh.prFind('acme/widgets#7')
    expect(calls[0]).toContain('--repo')
    expect(calls[0]![calls[0]!.indexOf('--repo') + 1]).toBe('acme/widgets')
  })

  test('a URL is a prView of the URL', () => {
    const url = 'https://github.com/acme/widgets/pull/7'
    const { gh, calls } = clients(() => ok(pr(7, 'OPEN')))
    gh.prFind(url)
    expect(calls[0]!.slice(0, 3)).toEqual(['pr', 'view', url])
  })

  test('digits with no such PR are tried as a branch', async () => {
    const answer = (argv: string[]) => (argv[1] === 'view' ? FAIL : ok([pr(3, 'OPEN', '42')]))
    const { gh, agh, calls } = clients(answer)
    expect(gh.prFind('42')?.number).toBe(3)
    expect((await agh.prFind('42'))?.number).toBe(3)
    expect(calls.map((c) => c[1])).toEqual(['view', 'list', 'view', 'list'])
  })

  test('#digits are only ever a number', () => {
    const { gh, calls } = clients(() => FAIL)
    expect(gh.prFind('#42')).toBeNull()
    expect(calls.length).toBe(1)
  })

  test('a branch prefers its open PR', async () => {
    const rows = [pr(9, 'MERGED'), pr(8, 'OPEN')]
    const { gh, agh } = clients(() => ok(rows))
    expect(gh.prFind('feature/x')?.number).toBe(8)
    expect((await agh.prFind('feature/x'))?.number).toBe(8)
  })

  test('a branch with no open PR gives its newest closed or merged one', () => {
    const { gh, calls } = clients(() => ok([pr(9, 'MERGED'), pr(4, 'CLOSED')]))
    expect(gh.prFind('feature/x')?.number).toBe(9)
    expect(calls[0]!.slice(0, 6)).toEqual(['pr', 'list', '--state', 'all', '--head', 'feature/x'])
  })

  test('a branch lookup asks for the fields it reads', () => {
    const { gh, calls } = clients(() => ok([]))
    gh.prFind('feature/x', { fields: ['title'] })
    const argv = calls[0]!
    expect(argv[argv.indexOf('--json') + 1]).toBe('number,state,headRefName,title')
  })

  test('null when nothing matches, the input is not a reference, or gh failed', async () => {
    expect(clients(() => ok([])).gh.prFind('feature/x')).toBeNull()
    expect(clients(() => FAIL).gh.prFind('feature/x')).toBeNull()
    const { gh, agh, calls } = clients(() => ok([]))
    expect(gh.prFind('not a ref')).toBeNull()
    expect(await agh.prFind('not a ref')).toBeNull()
    expect(calls).toEqual([])
  })
})
