/**
 * Work out which repository, pull request and branch you are talking about.
 * These helpers read text you give them; none of them runs `gh`.
 */

import { expect, test } from 'bun:test'

import {
  Gh,
  ownerRepoSlug,
  parseOwnerRepo,
  parsePrUrl,
  parsePullRequest,
  pickPrForBranch,
  type CommandRunner,
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

  expect(ref).toEqual({ owner: 'acme', repo: 'widgets', number: 9 })
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
