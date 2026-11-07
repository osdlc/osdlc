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
import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { Gh } from '@osdlc/typed-gh'
import { makeOriginAndCheckout } from '@osdlc/typed-git/testing'

import { cannedGh, cannedGlab, git } from './helpers.ts'
import { main } from '../src/cli.ts'
import { parsePlan } from '../src/plan.ts'
import { lookupPrs } from '../src/prs.ts'
import {
  chooseProvider,
  forgeTarget,
  githubProvider,
  gitlabProvider,
  type PrProvider,
  type ProviderStatus,
} from '../src/providers/index.ts'
import { sweep, type SweepOptions } from '../src/sweep.ts'
import {
  RepoCleanerError,
  type BranchRow,
  type RepoInfo,
  type SweepProgress,
} from '../src/types.ts'

const HOOK_TIMEOUT_MS = 60_000

const GITLAB: ProviderStatus = {
  name: 'gitlab',
  tool: 'glab',
  noun: 'merge request',
  listing: 'glab api',
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
    const prs = lookupPrs(repoWith(GITLAB), gitlabProvider(glab)).prs
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
    lookupPrs(repoWith(GITLAB), gitlabProvider(glab))
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
    const prs = lookupPrs(repoWith(GITLAB), gitlabProvider(glab)).prs
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
    const prs = lookupPrs(repoWith(GITLAB), gitlabProvider(glab)).prs
    expect(prs.size).toBe(300)
    expect(glab.calls.filter((argv) => argv[0] === 'api')).toHaveLength(3)
  })

  test('a branch is sent as the exact source branch, and other heads are dropped', () => {
    const glab = cannedGlab([
      { iid: 1, state: 'merged', source_branch: 'feat', sha: 'a' },
      { iid: 2, state: 'merged', source_branch: 'feat-2', sha: 'b' },
    ])
    const prs = lookupPrs(repoWith(GITLAB), gitlabProvider(glab), 'feat').prs
    expect([...prs.keys()]).toEqual(['feat'])
    expect(glab.calls.find((argv) => argv[0] === 'api')?.[3]).toMatch(/[?&]source_branch=feat(&|$)/)
  })

  test('GitHub is asked with an exact --head, and other heads are dropped', () => {
    const calls: string[][] = []
    const canned = cannedGh([
      { number: 1, state: 'MERGED', headRefName: 'feat', headRefOid: 'a' },
      { number: 2, state: 'MERGED', headRefName: 'feat-2', headRefOid: 'b' },
    ])
    const gh = new Gh('/srv/proj', {
      runner: {
        run: (argv, opts) => {
          calls.push(argv)
          return canned.run(argv, opts)
        },
      },
    })
    const github: ProviderStatus = {
      ...GITLAB,
      name: 'github',
      tool: 'gh',
      noun: 'PR',
      listing: 'gh pr list',
    }
    const prs = lookupPrs(repoWith(github), githubProvider(gh), 'feat').prs
    expect([...prs.keys()]).toEqual(['feat'])
    const list = calls.find((argv) => argv[1] === 'list')!
    expect(list[list.indexOf('--head') + 1]).toBe('feat')
    expect(list).not.toContain('--search')
  })

  test('a failed listing is no evidence, not an empty one', () => {
    const failing = {
      run: () => ({ exitCode: 1, stdout: '', stderr: '401 Unauthorized' }),
    }
    expect(lookupPrs(repoWith(GITLAB), gitlabProvider(failing)).prs.size).toBe(0)
  })

  test('a failed listing says why, whether the provider answers null or throws', () => {
    const failing = {
      run: () => ({ exitCode: 1, stdout: '', stderr: '401 Unauthorized' }),
    }
    expect(lookupPrs(repoWith(GITLAB), gitlabProvider(failing))).toEqual({
      prs: new Map(),
      error: '401 Unauthorized',
    })
    const silent: PrProvider = { ...gitlabProvider(failing), listPrs: () => null }
    expect(lookupPrs(repoWith(GITLAB), silent).error).toBe('the provider gave no reason')
    const throwing: PrProvider = {
      ...gitlabProvider(failing),
      listPrs: () => {
        throw new Error(
          'GitHub has no such pull request, issue or repository, or you cannot see it.',
        )
      },
    }
    expect(lookupPrs(repoWith(GITLAB), throwing)).toEqual({
      prs: new Map(),
      error: 'GitHub has no such pull request, issue or repository, or you cannot see it.',
    })
    const unasked = lookupPrs(repoWith({ ...GITLAB, authenticated: false }), throwing)
    expect(unasked.error).toBeNull()
  })

  test('a page whose output was cut short is no evidence', () => {
    const page = JSON.stringify([
      {
        iid: 1,
        state: 'merged',
        source_branch: 'feat',
        sha: 'a',
        target_branch: 'main',
        source_project_id: 1,
        target_project_id: 1,
      },
    ])
    const cut = { run: () => ({ exitCode: 0, stdout: page, stderr: '', outputIncomplete: true }) }
    expect(lookupPrs(repoWith(GITLAB), gitlabProvider(cut))).toEqual({
      prs: new Map(),
      error: 'page 1 was cut short',
    })
  })

  test('a merge request with a mistyped field is skipped', () => {
    const page = JSON.stringify([
      {
        iid: 1,
        state: 'merged',
        source_branch: 'feat',
        sha: 'a',
        merged_at: 7,
        target_branch: 'main',
        source_project_id: 1,
        target_project_id: 1,
      },
      {
        iid: 2,
        state: 'merged',
        source_branch: 'ok',
        sha: 'b',
        target_branch: 'main',
        source_project_id: 1,
        target_project_id: 1,
      },
    ])
    const glab = { run: () => ({ exitCode: 0, stdout: page, stderr: '' }) }
    expect([...lookupPrs(repoWith(GITLAB), gitlabProvider(glab)).prs.keys()]).toEqual(['ok'])
  })

  test('the provider is not asked when unauthenticated, absent or a different one', () => {
    const glab = cannedGlab([{ iid: 1, state: 'merged', source_branch: 'x', sha: 'a' }])
    const provider = gitlabProvider(glab)
    expect(lookupPrs(repoWith({ ...GITLAB, authenticated: false }), provider).prs.size).toBe(0)
    expect(lookupPrs(repoWith(null), provider).prs.size).toBe(0)
    expect(lookupPrs(repoWith({ ...GITLAB, name: 'github', tool: 'gh' }), provider).prs.size).toBe(
      0,
    )
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
  const GITLAB_URL = 'git@gitlab.example.com:group/sub/proj.git'
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
  }, HOOK_TIMEOUT_MS)

  afterAll(() => rmSync(parent, { recursive: true, force: true }), HOOK_TIMEOUT_MS)

  const realGit = spawnRunner('git', { absolutePathOnly: true })

  /**
   * Real git, except that `remote get-url origin` names a GitLab project. The
   * remote itself stays the fixture's origin on disk, and an offline sweep
   * reads its branches from the remote-tracking refs.
   */
  const gitlabUrlGit: CommandRunner = {
    run(argv, opts) {
      if (argv.includes('remote') && argv.includes('get-url') && argv.at(-1) === 'origin') {
        return { exitCode: 0, stdout: `${GITLAB_URL}\n`, stderr: '' }
      }
      return realGit.run(argv, opts)
    },
  }

  /** A provider is asked only for a sweep with remote branches; nothing is fetched. */
  const remoteSweep = (opts: SweepOptions = {}) => {
    const swept = sweep([checkout], {
      cwd: checkout,
      remote: true,
      offline: true,
      git: gitlabUrlGit,
      ...opts,
    }).repos[0]!
    expect(swept.error).toBeNull()
    return swept
  }

  const localFeat = (opts: SweepOptions) =>
    remoteSweep(opts).rows.find((r): r is BranchRow => r.id === 'branch:feat')

  test('picks GitLab by host and deletes a branch whose MR merged at its tip', () => {
    const glab = cannedGlab([{ iid: 12, state: 'merged', source_branch: 'feat', sha: tip }])
    const progress: SweepProgress[] = []
    const swept = remoteSweep({ glab, onProgress: (p) => progress.push(p) })
    expect(swept.repo?.provider).toMatchObject({
      name: 'gitlab',
      host: 'gitlab.example.com',
      project: 'group/sub/proj',
      authenticated: true,
    })
    const feat = swept.rows.find((r): r is BranchRow => r.id === 'branch:feat')
    expect(feat?.verdict).toBe('delete')
    expect(feat?.evidence.pr).toMatchObject({ number: 12, proof: 'exact-head' })
    expect(progress.find((p) => p.step === 'prs')?.tool).toBe('glab')
  })

  test('without the MR the branch is left for review, and the reason names glab', () => {
    const feat = localFeat({ glab: cannedGlab([]) })
    expect(feat?.verdict).toBe('review')
    expect(feat?.notes.join(' ')).toContain('No merge request found via `glab api`.')
  })

  test('--provider github overrides the host', () => {
    const glab = cannedGlab([{ iid: 12, state: 'merged', source_branch: 'feat', sha: tip }])
    const gh = cannedGh([])
    const feat = localFeat({ provider: 'github', glab, gh })
    expect(feat?.verdict).toBe('review')
    expect(glab.calls).toEqual([])
  })

  test('a sweep without remote branches asks no provider at all', () => {
    const glab = cannedGlab([{ iid: 12, state: 'merged', source_branch: 'feat', sha: tip }])
    const swept = sweep([checkout], { cwd: checkout, git: gitlabUrlGit, glab })
    expect(swept.options.provider).toBe('none')
    expect(swept.repos[0]?.repo?.provider).toBeNull()
    expect(glab.calls).toEqual([])
  })

  test("provider 'none' with remote branches asks no provider either", () => {
    const glab = cannedGlab([{ iid: 12, state: 'merged', source_branch: 'feat', sha: tip }])
    const swept = remoteSweep({ provider: 'none', glab })
    expect(swept.repo?.provider).toBeNull()
    expect(glab.calls).toEqual([])
  })

  test('a provider without remote branches is refused, not ignored', () => {
    const glab = cannedGlab([])
    const refused = (opts: SweepOptions) => {
      try {
        sweep([checkout], { cwd: checkout, git: gitlabUrlGit, glab, ...opts })
      } catch (err) {
        return err
      }
      return null
    }
    for (const opts of [{ provider: 'gitlab' }, { provider: 'none', only: ['branch'] }] as const) {
      const err = refused(opts)
      expect(err, JSON.stringify(opts)).toBeInstanceOf(RepoCleanerError)
      expect((err as RepoCleanerError).code).toBe('conflict')
    }
    expect(glab.calls).toEqual([])
  })

  test('a plan records the provider choice in its options, and a plan without one is refused', () => {
    const ctx = captureContext({ cwd: checkout })
    const code = main(
      ['plan', '--remote', '--offline', '--provider', 'gitlab', '--no-progress'],
      ctx,
      {},
    )
    expect(ctx.io.err).not.toContain('unreadable')
    expect(code).toBe(0)
    const plan = parsePlan(ctx.io.out, 'stdout')
    expect(plan.options.provider).toBe('gitlab')
    expect(plan.options.remote).toBe(true)
    const { provider: _, ...old } = plan.options
    expect(() => parsePlan(JSON.stringify({ ...plan, options: old }), 'old')).toThrow(
      expect.objectContaining({ code: 'bad-plan' }),
    )
  })

  test('without --remote the plan records that no provider was asked', () => {
    const ctx = captureContext({ cwd: checkout })
    expect(main(['plan', '--no-progress'], ctx, {})).toBe(0)
    const plan = parsePlan(ctx.io.out, 'stdout')
    expect(plan.options.remote).toBe(false)
    expect(plan.options.provider).toBe('none')
    expect(plan.options.only).toEqual(['worktree', 'branch'])
    // Branch fingerprints carry no PR, since none was looked up.
    const feat = plan.repos[0]?.rows.find((r) => r.id === 'branch:feat')
    expect(feat?.fingerprint).toEqual({ sha: tip, prNumber: null, prState: null })

    const refused = captureContext({ cwd: checkout })
    expect(main(['plan', '--provider', 'gitlab', '--no-progress'], refused, {})).toBe(2)
    expect(refused.io.err).toContain('--provider has no effect without --remote')
  })

  test('--no-gh is gone: --provider none does the same', () => {
    const ctx = captureContext({ cwd: checkout })
    const code = main(['--no-gh'], ctx, { confirm: () => null })
    expect(code).toBe(2)
    expect(ctx.io.err).toContain("unknown option '--no-gh'")
  })
})
