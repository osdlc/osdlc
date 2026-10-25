/**
 * Work out which repository, pull request and branch you are talking about.
 * These helpers read text you give them. None of them runs `gh`.
 */

import { expect, test } from 'vitest'

import {
  AsyncGh,
  Gh,
  ownerRepoSlug,
  parseOwnerRepo,
  parsePrUrl,
  parsePullRequest,
  pickPrForBranch,
  type AsyncGhOptions,
  type CommandRunner,
  type GhOptions,
  type GhTarget,
  type OwnerRepo,
  type PullRequestRef,
} from '@osdlc/typed-gh'

test('owner and repo from any remote URL shape', () => {
  const gh = new Gh('/repo')

  const fromSsh: OwnerRepo | null = gh.ownerRepo('git@github.com:acme/widgets.git')
  const fromHttps = parseOwnerRepo('https://github.com/acme/widgets')

  expect(fromSsh).toEqual({ owner: 'acme', repo: 'widgets' })
  expect(fromHttps).toEqual(fromSsh)
  expect(ownerRepoSlug(fromSsh!)).toBe('acme/widgets')
  expect(gh.ownerRepo(null)).toBeNull()
  expect(parseOwnerRepo('not a url')).toBeNull()
})

test('owner, repo and number from a pull request URL', () => {
  const ref: PullRequestRef | null = parsePrUrl('https://github.com/acme/widgets/pull/9')

  expect(ref).toEqual({ hostname: 'github.com', owner: 'acme', repo: 'widgets', number: 9 })
  expect(parsePrUrl('https://github.acme.com/acme/widgets/pull/9')?.hostname).toBe(
    'github.acme.com',
  )
  expect(parsePrUrl('https://github.com/acme/widgets')).toBeNull()
})

test("pick the exact branch from gh's prefix search", () => {
  const rows = [
    parsePullRequest({ number: 1, headRefName: 'feature/foo-2' })!,
    parsePullRequest({ number: 2, headRefName: 'feature/foo' })!,
  ]

  expect(pickPrForBranch(rows, 'feature/foo')?.number).toBe(2)
  expect(pickPrForBranch(rows, 'feature/missing')).toBeNull()
  expect(pickPrForBranch(null, 'feature/foo')).toBeNull()

  // The ListResult from prList or openPrsForBranch passes straight in.
  expect(pickPrForBranch({ rows, truncated: false }, 'feature/foo')?.number).toBe(2)
})

test('a client aimed at a repository, with no clone', () => {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push([...argv])
      return { exitCode: 0, stdout: '{"number":9}', stderr: '' }
    },
  }
  const target: GhTarget = { repo: 'acme/widgets', hostname: 'github.acme.com' }
  const options: GhOptions = { runner, ...target }
  const gh = new Gh(process.cwd(), options)

  gh.prView(9, { fields: ['number'] })
  gh.withRepo('acme/gadgets').prBody(9)
  gh.api('repos/{owner}/{repo}/branches')

  expect(calls).toEqual([
    ['pr', 'view', '9', '--repo', 'github.acme.com/acme/widgets', '--json', 'number'],
    ['pr', 'view', '9', '--repo', 'github.acme.com/acme/gadgets', '--json', 'body', '-q', '.body'],
    ['api', '--hostname', 'github.acme.com', 'repos/acme/widgets/branches'],
  ])
  expect(() => new Gh('/repo', { repo: 'not a slug' })).toThrow(RangeError)
})

test('the async client takes the same target', () => {
  const options: AsyncGhOptions = { repo: 'acme/widgets' }
  const gh = new AsyncGh(process.cwd(), options).withRepo('acme/gadgets')

  expect(gh.repo).toBe('acme/gadgets')
  expect(gh.hostname).toBeUndefined()
})

test('the same client, rooted at another directory', () => {
  const cwds: (string | undefined)[] = []
  const runner: CommandRunner = {
    run(_argv, opts) {
      cwds.push(opts.cwd)
      return { exitCode: 0, stdout: '[]', stderr: '' }
    },
  }
  const gh = new Gh('/repo', { runner })

  gh.at('/other-checkout').prList()

  expect(gh.cwd).toBe('/repo')
  expect(cwds).toEqual(['/other-checkout'])
})
