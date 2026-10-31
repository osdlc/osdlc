/**
 * Pull request providers: GitLab's merge requests mapped to the shape
 * classification reads, the provider chosen by the remote's host, and a
 * sweep that classifies on a canned merged MR.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'
import { makeOriginAndCheckout } from '@osdlc/typed-git/testing'

import { cannedGh, cannedGlab, git } from './helpers.ts'
import { main } from '../src/cli.ts'
import { parsePlan } from '../src/plan.ts'
import { fetchPrs } from '../src/prs.ts'
import {
  chooseProvider,
  forgeTarget,
  gitlabProvider,
  type ProviderStatus,
} from '../src/providers/index.ts'
import { sweepRepo } from '../src/sweep.ts'
import type { RepoInfo, SweepProgress } from '../src/types.ts'

const HOOK_TIMEOUT_MS = 60_000

const GITLAB: ProviderStatus = {
  name: 'gitlab',
  tool: 'glab',
  available: true,
  authenticated: true,
  host: 'gitlab.example.com',
  project: 'group/sub/proj',
}

function repoWith(provider: ProviderStatus | null): RepoInfo {
  return {
    root: '/srv/proj',
    slug: null,
    mainBranch: 'main',
    remote: 'origin',
    currentBranch: 'main',
    provider,
    hasGh: provider?.available ?? false,
    ghAuthenticated: provider?.authenticated ?? false,
    fetched: false,
  }
}

describe('forgeTarget', () => {
  test.each([
    ['git@gitlab.com:group/sub/proj.git', 'gitlab.com', 'group/sub/proj'],
    ['gitlab.example.com:group/sub/proj.git', 'gitlab.example.com', 'group/sub/proj'],
    ['ssh://git@GitLab.Example.com:2222/a/b/c.git', 'gitlab.example.com', 'a/b/c'],
    ['https://gitlab.example.com/a/b.git/', 'gitlab.example.com', 'a/b'],
    ['https://user@github.com/o/r', 'github.com', 'o/r'],
  ])('%s is %s project %s', (url, host, project) => {
    expect(forgeTarget(url)).toEqual({ host, project })
  })

  test('a local path or file URL names no forge', () => {
    expect(forgeTarget('/srv/git/a/b.git')).toEqual({ host: null, project: null })
    expect(forgeTarget('file:///srv/git/a/b.git')).toEqual({ host: null, project: null })
    expect(forgeTarget(null)).toEqual({ host: null, project: null })
    expect(forgeTarget('C:/work/a/b')).toEqual({ host: null, project: null })
    expect(forgeTarget('./a/b:c')).toEqual({ host: null, project: null })
  })
})

describe('chooseProvider', () => {
  const at = (host: string | null) => ({ host, project: 'o/r' })

  test('auto picks GitLab for a host with gitlab in its name', () => {
    expect(chooseProvider('auto', at('gitlab.com'))).toBe('gitlab')
    expect(chooseProvider('auto', at('gitlab.corp.example'))).toBe('gitlab')
  })

  test('auto falls back to GitHub, as before providers existed', () => {
    expect(chooseProvider('auto', at('github.com'))).toBe('github')
    expect(chooseProvider('auto', at('git.example.com'))).toBe('github')
    expect(chooseProvider('auto', at(null))).toBe('github')
  })

  test('an explicit choice wins over the host', () => {
    expect(chooseProvider('gitlab', at('git.example.com'))).toBe('gitlab')
    expect(chooseProvider('github', at('gitlab.com'))).toBe('github')
    expect(chooseProvider('none', at('gitlab.com'))).toBeNull()
  })
})

describe('the GitLab provider', () => {
  test('maps merge requests to PRs and drops a fork', () => {
    const glab = cannedGlab([
      { iid: 4, state: 'merged', source_branch: 'feat/a', sha: 'aaa' },
      { iid: 5, state: 'opened', source_branch: 'feat/b', sha: 'bbb', target_branch: 'dev' },
      { iid: 6, state: 'merged', source_branch: 'feat/c', sha: 'ccc', source_project_id: 99 },
    ])
    const prs = fetchPrs(repoWith(GITLAB), gitlabProvider(glab))
    expect([...prs.keys()].sort()).toEqual(['feat/a', 'feat/b'])
    expect(prs.get('feat/a')).toEqual({
      number: 4,
      state: 'MERGED',
      mergedAt: '2020-01-02T00:00:00Z',
      headRef: 'feat/a',
      headOid: 'aaa',
      baseRef: 'main',
      title: 'MR 4',
      url: 'https://gitlab.example.invalid/-/merge_requests/4',
    })
    expect(prs.get('feat/b')).toMatchObject({ state: 'OPEN', baseRef: 'dev' })
  })

  test('asks the host and the full project path the remote names', () => {
    const glab = cannedGlab([])
    fetchPrs(repoWith(GITLAB), gitlabProvider(glab))
    const api = glab.calls.find((argv) => argv[0] === 'api')!
    expect(api.slice(0, 3)).toEqual(['api', '--hostname', 'gitlab.example.com'])
    expect(api[3]).toMatch(/^projects\/group%2Fsub%2Fproj\/merge_requests\?/)
    expect(api[3]).toContain('state=all')
  })

  test('open outranks merged outranks closed; a tie goes to the higher number', () => {
    const glab = cannedGlab([
      { iid: 1, state: 'merged', source_branch: 'x', sha: 'a' },
      { iid: 2, state: 'opened', source_branch: 'x', sha: 'b' },
      { iid: 3, state: 'closed', source_branch: 'x', sha: 'c' },
      { iid: 4, state: 'closed', source_branch: 'y', sha: 'd' },
      { iid: 7, state: 'closed', source_branch: 'y', sha: 'e' },
      { iid: 8, state: 'locked', source_branch: 'z', sha: 'f' },
    ])
    const prs = fetchPrs(repoWith(GITLAB), gitlabProvider(glab))
    expect(prs.get('x')?.number).toBe(2)
    expect(prs.get('y')?.number).toBe(7)
    expect(prs.get('z')?.state).toBe('OPEN')
  })

  test('reads later pages, up to 300 merge requests', () => {
    const many = Array.from({ length: 350 }, (_, i) => ({
      iid: i + 1,
      state: 'closed' as const,
      source_branch: `b${i}`,
      sha: 's',
    }))
    const glab = cannedGlab(many)
    const prs = fetchPrs(repoWith(GITLAB), gitlabProvider(glab))
    expect(prs.size).toBe(300)
    expect(glab.calls.filter((argv) => argv[0] === 'api')).toHaveLength(3)
  })

  test('a head prefix is sent as the source branch and checked again', () => {
    const glab = cannedGlab([
      { iid: 1, state: 'merged', source_branch: 'feat', sha: 'a' },
      { iid: 2, state: 'merged', source_branch: 'other', sha: 'b' },
    ])
    const prs = fetchPrs(repoWith(GITLAB), gitlabProvider(glab), 'feat')
    expect([...prs.keys()]).toEqual(['feat'])
    expect(glab.calls.find((argv) => argv[0] === 'api')?.[3]).toContain('source_branch=feat')
  })

  test('a failed listing is no evidence, not an empty one', () => {
    const failing = {
      run: () => ({ exitCode: 1, stdout: '', stderr: '401 Unauthorized' }),
    }
    expect(fetchPrs(repoWith(GITLAB), gitlabProvider(failing)).size).toBe(0)
  })

  test('the provider is not asked when unauthenticated, absent or a different one', () => {
    const glab = cannedGlab([{ iid: 1, state: 'merged', source_branch: 'x', sha: 'a' }])
    const provider = gitlabProvider(glab)
    expect(fetchPrs(repoWith({ ...GITLAB, authenticated: false }), provider).size).toBe(0)
    expect(fetchPrs(repoWith(null), provider).size).toBe(0)
    expect(fetchPrs(repoWith({ ...GITLAB, name: 'github', tool: 'gh' }), provider).size).toBe(0)
    expect(glab.calls.filter((argv) => argv[0] === 'api')).toEqual([])
  })

  test('the probe tells a missing glab from a signed-out one', () => {
    const target = { host: 'gitlab.com', project: 'o/r' }
    expect(gitlabProvider(cannedGlab([], { installed: false })).probe('/srv', target)).toEqual({
      available: false,
      authenticated: false,
    })
    const signedOut = cannedGlab([], { authenticated: false })
    expect(gitlabProvider(signedOut).probe('/srv', target)).toEqual({
      available: true,
      authenticated: false,
    })
    expect(signedOut.calls).toContainEqual(['auth', 'status', '--hostname', 'gitlab.com'])
  })
})

describe('a sweep of a GitLab checkout', () => {
  let parent: string
  let checkout: string
  let tip: string

  beforeAll(() => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-gitlab-')))
    const fx = makeOriginAndCheckout({ parent }).checkout
    checkout = fx.dir
    git(['checkout', '-q', '-b', 'feat'], checkout)
    tip = fx.commit('feat: work', { 'feat.txt': 'feat\n' })
    git(['checkout', '-q', 'main'], checkout)
    // The remote's refs stay on disk; only the URL now names a GitLab project.
    git(['remote', 'set-url', 'origin', 'git@gitlab.example.com:group/sub/proj.git'], checkout)
  }, HOOK_TIMEOUT_MS)

  afterAll(() => rmSync(parent, { recursive: true, force: true }), HOOK_TIMEOUT_MS)

  const localFeat = (opts: Parameters<typeof sweepRepo>[1]) =>
    sweepRepo(checkout, { cwd: checkout, scope: ['local-branches'], ...opts }).items.find(
      (item) => item.id === 'feat',
    )

  test('picks GitLab by host and deletes a branch whose MR merged at its tip', () => {
    const glab = cannedGlab([{ iid: 12, state: 'merged', source_branch: 'feat', sha: tip }])
    const progress: SweepProgress[] = []
    const sweep = sweepRepo(checkout, {
      cwd: checkout,
      scope: ['local-branches'],
      glab,
      onProgress: (p) => progress.push(p),
    })
    expect(sweep.error).toBeNull()
    expect(sweep.repo?.provider).toMatchObject({
      name: 'gitlab',
      host: 'gitlab.example.com',
      project: 'group/sub/proj',
      authenticated: true,
    })
    const feat = sweep.items.find((item) => item.id === 'feat')
    expect(feat?.classification).toBe('safe-to-delete')
    expect(feat?.facts['pr']).toMatchObject({ number: 12, evidence: 'exact-head' })
    expect(progress.find((p) => p.step === 'prs')?.tool).toBe('glab')
  })

  test('without the MR the branch is left for review, and the reason names glab', () => {
    const feat = localFeat({ glab: cannedGlab([]) })
    expect(feat?.classification).toBe('needs-investigation')
    expect(feat?.investigationParts.join(' ')).toContain('No merge request found via `glab`.')
  })

  test('--provider github overrides the host', () => {
    const glab = cannedGlab([{ iid: 12, state: 'merged', source_branch: 'feat', sha: tip }])
    const gh = cannedGh([])
    const feat = localFeat({ provider: 'github', glab, gh })
    expect(feat?.classification).toBe('needs-investigation')
    expect(glab.calls).toEqual([])
  })

  test('noGh asks no provider at all', () => {
    const glab = cannedGlab([{ iid: 12, state: 'merged', source_branch: 'feat', sha: tip }])
    const sweep = sweepRepo(checkout, { cwd: checkout, noGh: true, glab })
    expect(sweep.repo?.provider).toBeNull()
    expect(glab.calls).toEqual([])
  })

  test('a plan records the provider choice, and an old plan without one reads as auto', () => {
    const ctx = captureContext({ cwd: checkout })
    const code = main(
      ['plan', '--provider', 'gitlab', '--only', 'branches', '--no-fetch', '--no-progress'],
      ctx,
      {},
    )
    expect(ctx.io.err).not.toContain('unreadable')
    expect(code).toBe(0)
    const plan = parsePlan(ctx.io.out, 'stdout')
    expect(plan.repos[0]?.provider).toBe('gitlab')
    const { provider: _, ...old } = plan.repos[0]!
    expect(parsePlan(JSON.stringify({ ...plan, repos: [old] }), 'old').repos[0]?.provider).toBe(
      undefined,
    )
  })

  test('the CLI refuses --no-gh with another provider', () => {
    const ctx = captureContext({ cwd: checkout })
    const code = main(['status', '--no-gh', '--provider', 'gitlab'], ctx, { confirm: () => null })
    expect(code).toBe(2)
    expect(ctx.io.err).toContain('--no-gh asks no provider')
  })
})
