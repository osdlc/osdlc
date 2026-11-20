/**
 * A checkout with more than one remote: a fork and its parent, or remotes
 * whose default branches differ (D-4CE9, U9 to U11).
 */

import { realpathSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { afterEach, describe, expect, test } from 'vitest'

import type { CommandRunner } from '@osdlc/command-seam'

import { captureContext } from '@osdlc/cli-tool'

import { cannedGh, sh, withRemotes } from './helpers.ts'
import { main, type MainDeps } from '../src/cli.ts'
import { check, run } from '../src/clean.ts'
import { plan } from '../src/plan.ts'
import { renderText } from '../src/render.ts'
import { sweep, type SweepOptions } from '../src/sweep.ts'
import type { RepoSweep, Row } from '../src/types.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  for (const c of cleanups.splice(0)) c()
})

function forkAndParent() {
  const fx = withRemotes('rc-remotes', {
    origin: { github: 'me/app' },
    upstream: { github: 'acme/app' },
  })
  cleanups.push(fx.cleanup)
  return fx
}

describe('a fork and its parent', () => {
  test('an open pull request at the fork keeps its branch', () => {
    const fx = forkAndParent()
    const shaOrigin = fx.pushBranch('origin', 'feat/mine')
    const swept = sweep([fx.root], {
      cwd: fx.root,
      remotes: [''],
      git: fx.git,
      gh: cannedGh([], {
        byRepo: {
          'me/app': [{ number: 7, state: 'OPEN', headRefName: 'feat/mine', headRefOid: shaOrigin }],
        },
      }),
    })
    const repo = swept.repos[0]!
    expect(repo.error).toBeNull()
    const row = repo.rows.find((r) => r.id === 'remote:origin/feat/mine')
    expect(row?.verdict).toBe('keep')
  })

  test('pull requests are listed at the remote judged, by --repo', () => {
    const fx = forkAndParent()
    const gh = cannedGh([])
    sweep([fx.root], { cwd: fx.root, remotes: [''], git: fx.git, gh })
    const listings = gh.calls.filter((c) => c[0] === 'pr' && c[1] === 'list')
    expect(listings.length).toBeGreaterThan(0)
    expect(listings.every((c) => c.join(' ').includes('me/app'))).toBe(true)
  })
})

describe('the command line', () => {
  /** Run `argv` at `fx`, with `deps` answering whatever is asked. */
  function cli(fx: { root: string; git: CommandRunner }, argv: string[], deps: MainDeps = {}) {
    const ctx = captureContext({ cwd: fx.root })
    const code = main(argv, ctx, {
      confirm: () => null,
      runners: { git: fx.git, gh: cannedGh([]) },
      ...deps,
    })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }

  test('--remote=<name> judges that remote, and adds to a bare --remote', () => {
    const fx = forkAndParent()
    fx.pushBranch('origin', 'feat/o')
    fx.pushBranch('upstream', 'feat/u')
    const ids = (argv: string[]) => {
      const res = cli(fx, ['status', ...argv, '--provider', 'none', '--format', 'json'])
      expect(res.code).toBe(0)
      const out = JSON.parse(res.out) as { repos: { rows: { id: string }[] }[] }
      return out.repos[0]!.rows.map((r) => r.id)
    }
    const upstream = ids(['--remote=upstream'])
    expect(upstream).toContain('remote:upstream/feat/u')
    expect(upstream.some((id) => id.startsWith('remote:origin/') || id.startsWith('branch:'))).toBe(
      false,
    )
    const both = ids(['--remote', '--remote=upstream'])
    expect(both).toContain('remote:origin/feat/o')
    expect(both).toContain('remote:upstream/feat/u')
    const every = ids(['--local', '--remote=*'])
    expect(every).toContain('branch:feat/o')
    expect(every).toContain('remote:upstream/feat/u')
  })

  test("clean -i runs the ticked rows, and asks for each ticked row's risks", () => {
    const fx = forkAndParent()
    fx.pushBranch('origin', 'feat/landed')
    land(fx.root, 'feat/landed', 'origin')
    fx.pushBranch('origin', 'feat/unsure')
    const shown: string[] = []
    const asked: string[] = []
    const res = cli(fx, ['clean', '--branches', '-i', '-y'], {
      checklist: (_q, items) => {
        shown.push(
          ...items.map((i) => `${i.checked === true ? 'x' : i.disabled ? '-' : ' '} ${i.label}`),
        )
        // Untick the delete row, tick the review row.
        return items.flatMap((i, n) => (i.label.startsWith('branch:feat/unsure') ? [n] : []))
      },
      confirm: (q) => {
        asked.push(q)
        return true
      },
    })
    expect(res.code).toBe(0)
    expect(shown.find((l) => l.includes('branch:feat/landed'))).toMatch(/^x /)
    expect(shown.find((l) => l.includes('branch:feat/unsure'))).toMatch(/^ {2}/)
    expect(shown.find((l) => l.includes('branch:main'))).toMatch(/^- /)
    expect(asked).toEqual(['branch:feat/unsure carries abandon-unmerged: allow it?'])
    const left = sh(fx.root, ['branch', '--format=%(refname:short)'])
    expect(left).toContain('feat/landed')
    expect(left).not.toContain('feat/unsure')
  })

  test('-i does not ask again for a risk already allowed by a bare name', () => {
    const fx = forkAndParent()
    fx.pushBranch('origin', 'feat/unsure')
    const asked: string[] = []
    const res = cli(
      fx,
      ['clean', '--branches', '-i', '-y', '--allow', 'abandon-unmerged=feat/unsure'],
      {
        checklist: (_q, items) =>
          items.flatMap((i, n) => (i.label.startsWith('branch:feat/unsure') ? [n] : [])),
        confirm: (q) => {
          asked.push(q)
          return true
        },
      },
    )
    expect(res.code).toBe(0)
    expect(asked).toEqual([])
    expect(sh(fx.root, ['branch', '--format=%(refname:short)'])).not.toContain('feat/unsure')
  })

  test('-i needs a terminal, and does not go with --pick', () => {
    const fx = forkAndParent()
    expect(cli(fx, ['clean', '-i', '-y']).err).toContain('-i needs a terminal')
    const both = cli(fx, ['clean', '-i', '--pick', 'x'], { checklist: () => [] })
    expect(both.code).toBe(2)
    expect(both.err).toContain('drop --pick')
  })

  test('takes its runners from the caller', () => {
    const fx = forkAndParent()
    const gh = cannedGh([])
    const ctx = captureContext({ cwd: fx.root })
    const code = main(['status', '--remote', '--format', 'json', fx.root], ctx, {
      runners: { git: fx.git, gh },
    })
    expect(code).toBe(0)
    expect(gh.calls.some((c) => c.join(' ').includes('--repo github.com/me/app'))).toBe(true)
  })
})

/** The one repository's sweep, with no provider asked unless `opts` names one. */
function sweepOne(root: string, opts: SweepOptions): RepoSweep {
  const quiet = opts.remotes === undefined ? {} : { provider: 'none' as const }
  return sweep([root], { cwd: root, ...quiet, ...opts }).repos[0]!
}

const rowOf = (s: RepoSweep, id: string): Row | undefined => s.rows.find((r) => r.id === id)

/** Merge `branch` into `main` and push `main` to `remote` alone. */
function land(root: string, branch: string, remote: string, as = 'main'): void {
  sh(root, ['merge', '-q', '--no-ff', '-m', `Merge ${branch}`, branch])
  sh(root, ['push', '-q', remote, `main:${as}`])
}

describe('several remotes', () => {
  test('each remote named is fetched and its branches judged', () => {
    const fx = forkAndParent()
    fx.pushBranch('origin', 'feat/a')
    fx.pushBranch('upstream', 'feat/b')
    const swept = sweepOne(fx.root, { remotes: ['origin', 'upstream'] })
    expect(swept.error).toBeNull()
    expect(swept.repo?.remotes.map((r) => r.name)).toEqual(['origin', 'upstream'])
    expect(swept.repo?.fetchedRemotes).toEqual(['origin', 'upstream'])
    expect(rowOf(swept, 'remote:origin/feat/a')).toBeDefined()
    expect(rowOf(swept, 'remote:upstream/feat/b')).toBeDefined()
    expect(rowOf(swept, 'remote:upstream/main')?.verdict).toBe('keep')
  })

  test("'' is the default remote and * every remote", () => {
    const fx = forkAndParent()
    expect(sweepOne(fx.root, { remotes: [''] }).repo?.remotes.map((r) => r.name)).toEqual([
      'origin',
    ])
    expect(sweepOne(fx.root, { remotes: ['*'] }).repo?.remotes.map((r) => r.name)).toEqual([
      'origin',
      'upstream',
    ])
  })

  test("each remote's branches are judged against its own default branch", () => {
    const fx = withRemotes('rc-homes', {
      origin: {},
      internal: { defaultBranch: 'master' },
    })
    cleanups.push(fx.cleanup)
    fx.pushBranch('internal', 'feat/x')
    land(fx.root, 'feat/x', 'internal', 'master')
    const swept = sweepOne(fx.root, { remotes: ['*'] })
    const row = rowOf(swept, 'remote:internal/feat/x')
    expect(row?.verdict).toBe('delete')
    expect(row?.evidence.landedAgainst).toBe('internal/master')
    expect(rowOf(swept, 'remote:internal/master')?.verdict).toBe('keep')
    // Local rows are judged against the default remote, which lacks the merge.
    expect(rowOf(swept, 'branch:feat/x')?.evidence.landedAgainst).toBe('origin/main')
  })

  test('a remote the repository lacks fails it; so does no default among several', () => {
    const fx = forkAndParent()
    expect(sweepOne(fx.root, { remotes: ['nope'] }).error).toContain('no remote named nope')
    sh(fx.root, ['remote', 'rename', 'origin', 'mine'])
    sh(fx.root, ['config', '--unset', 'branch.main.remote'])
    expect(sweepOne(fx.root, { remotes: [''] }).error).toContain('has no default remote')
  })

  test('local rows with no default remote are judged against the local default, with a note', () => {
    const fx = forkAndParent()
    sh(fx.root, ['remote', 'rename', 'origin', 'mine'])
    sh(fx.root, ['config', '--unset', 'branch.main.remote'])
    const swept = sweepOne(fx.root, {})
    expect(swept.error).toBeNull()
    expect(swept.repo?.remote).toBeNull()
    expect(swept.notes.join(' ')).toContain('No default remote')
  })

  test('the default remote is the one the default branch tracks, without an origin', () => {
    const fx = forkAndParent()
    sh(fx.root, ['remote', 'rename', 'origin', 'mine'])
    sh(fx.root, ['branch', '-q', '--set-upstream-to', 'upstream/main'])
    expect(sweepOne(fx.root, {}).repo?.remote).toBe('upstream')
  })
})

describe('--against', () => {
  test("a fork's branch landed upstream is delete only when judged against upstream", () => {
    const fx = forkAndParent()
    fx.pushBranch('origin', 'feat/up')
    land(fx.root, 'feat/up', 'upstream')
    sh(fx.root, ['reset', '-q', '--hard', 'origin/main'])
    const own = sweepOne(fx.root, { remotes: [''] })
    expect(rowOf(own, 'remote:origin/feat/up')?.verdict).toBe('review')
    const against = sweepOne(fx.root, { remotes: [''], against: 'upstream' })
    const row = rowOf(against, 'remote:origin/feat/up')
    expect(row?.verdict).toBe('delete')
    expect(row?.evidence.landedAgainst).toBe('upstream/main')
    // The fork's own default branch is still kept.
    expect(rowOf(against, 'remote:origin/main')?.verdict).toBe('keep')
  })

  test('the --against remote is fetched with the remotes judged', () => {
    const fx = forkAndParent()
    const swept = sweepOne(fx.root, { remotes: [''], against: 'upstream' })
    expect(swept.repo?.against).toEqual({ remote: 'upstream', branch: 'main' })
    const plan_ = plan(
      sweep([fx.root], { cwd: fx.root, remotes: [''], against: 'upstream', provider: 'none' }),
    )
    expect(plan_.repos[0]?.fetched).toEqual(['origin', 'upstream'])
  })

  test('a remote the repository lacks fails it', () => {
    const fx = forkAndParent()
    expect(sweepOne(fx.root, { against: 'nope' }).error).toContain('--against nope')
  })
})

describe("a fork's pull requests (U10)", () => {
  test('a PR merged in the parent at the exact head is proof, with no confirm-open-pr', () => {
    const fx = forkAndParent()
    const sha = fx.pushBranch('origin', 'feat/pr')
    // Squash-merged upstream: upstream/main has the change, not the commit.
    sh(fx.root, ['checkout', '-q', 'main'])
    sh(fx.root, ['merge', '-q', '--squash', 'feat/pr'])
    sh(fx.root, ['commit', '-q', '-m', 'feat/pr (#9)'])
    sh(fx.root, ['push', '-q', 'upstream', 'main'])
    const pr = {
      number: 9,
      state: 'MERGED' as const,
      headRefName: 'feat/pr',
      headRefOid: sha,
      isCrossRepository: true,
      headRepositoryOwner: { login: 'me' },
    }
    const swept = sweep([fx.root], {
      cwd: fx.root,
      remotes: [''],
      against: 'upstream',
      git: fx.git,
      gh: cannedGh([], {
        forks: { 'me/app': 'acme/app' },
        byRepo: { 'me/app': [], 'acme/app': [pr] },
      }),
    }).repos[0]!
    expect(swept.notes).toEqual([])
    const row = rowOf(swept, 'remote:origin/feat/pr')
    expect(row?.verdict).toBe('delete')
    expect(row?.risks).toEqual([])
    expect(row?.why).toContain('PR #9 merged')
  })

  test('a parent judged as a remote of its own is listed once, for itself and its fork', () => {
    const fx = forkAndParent()
    const gh = cannedGh([], {
      forks: { 'me/app': 'acme/app' },
      byRepo: { 'me/app': [], 'acme/app': [] },
    })
    sweep([fx.root], { cwd: fx.root, remotes: ['*'], git: fx.git, gh })
    const parentLists = gh.calls.filter(
      (c) => c[0] === 'pr' && c[1] === 'list' && c.join(' ').includes('acme/app'),
    )
    // One open listing and one of every state.
    expect(parentLists).toHaveLength(2)
  })

  test('an open PR in the parent keeps the branch', () => {
    const fx = forkAndParent()
    const sha = fx.pushBranch('origin', 'feat/open')
    const pr = {
      number: 3,
      state: 'OPEN' as const,
      headRefName: 'feat/open',
      headRefOid: sha,
      isCrossRepository: true,
      headRepositoryOwner: { login: 'me' },
    }
    const swept = sweep([fx.root], {
      cwd: fx.root,
      remotes: [''],
      git: fx.git,
      gh: cannedGh([], {
        forks: { 'me/app': 'acme/app' },
        byRepo: { 'me/app': [], 'acme/app': [pr] },
      }),
    }).repos[0]!
    expect(rowOf(swept, 'remote:origin/feat/open')?.verdict).toBe('keep')
  })
})

describe('fetching', () => {
  test('several remotes are fetched in one git fetch --multiple, their defaults read once', () => {
    const fx = forkAndParent()
    const argvs: string[][] = []
    const git: CommandRunner = {
      run: (argv, o) => {
        argvs.push([...argv])
        return fx.git.run(argv, o)
      },
    }
    const swept = sweep([fx.root], { cwd: fx.root, remotes: ['*'], provider: 'none', git })
    expect(swept.repos[0]?.error).toBeNull()
    const fetches = argvs.filter((a) => a.includes('fetch'))
    expect(fetches).toHaveLength(1)
    expect(fetches[0]).toEqual(
      expect.arrayContaining(['--multiple', '--jobs=2', 'origin', 'upstream']),
    )
    expect(argvs.filter((a) => a.includes('symbolic-ref'))).toHaveLength(1)
  })

  test('local rows fetch nothing unless asked, and then the default remote', () => {
    const fx = forkAndParent()
    expect(sweepOne(fx.root, {}).repo?.fetched).toBe(false)
    const fetched = sweepOne(fx.root, { fetch: true })
    expect(fetched.repo?.fetched).toBe(true)
  })
})

describe('--provider across hosts', () => {
  test('one forge named for remotes on different kinds of host fails the repository', () => {
    const fx = withRemotes('rc-hosts', {
      origin: { github: 'me/app' },
      internal: {},
    })
    cleanups.push(fx.cleanup)
    // internal reports a GitLab URL, so auto would ask two different forges.
    const git = fx.git
    const swept = sweep([fx.root], {
      cwd: fx.root,
      remotes: ['*'],
      provider: 'github',
      git: {
        run: (argv, o) =>
          argv.includes('get-url') && argv.at(-1) === 'internal'
            ? { exitCode: 0, stdout: 'https://gitlab.example.com/acme/app.git\n', stderr: '' }
            : git.run(argv, o),
      },
      gh: cannedGh([]),
    }).repos[0]!
    expect(swept.error).toContain('--provider github')
  })
})

describe('clean across remotes', () => {
  test('a planned branch on a second remote is deleted there', () => {
    const fx = forkAndParent()
    fx.pushBranch('upstream', 'feat/gone')
    land(fx.root, 'feat/gone', 'upstream')
    const swept = sweep([fx.root], {
      cwd: fx.root,
      remotes: ['upstream'],
      provider: 'none',
      only: ['remote'],
    })
    const p = plan(swept)
    expect(p.repos[0]?.remotes).toEqual(['upstream'])
    const receipt = run(check(p, {}, { cwd: fx.root }), {
      cwd: fx.root,
    })
    expect(receipt.status).toBe('complete')
    expect(sh(fx.bare['upstream']!, ['branch', '--list', 'feat/gone'])).toBe('')
  })
})

describe('choosing rows', () => {
  /** A plan of local and remote rows, with feat/a and feat/b landed on origin. */
  function landedPlan() {
    const fx = forkAndParent()
    fx.pushBranch('origin', 'feat/a')
    fx.pushBranch('origin', 'feat/b')
    land(fx.root, 'feat/a', 'origin')
    land(fx.root, 'feat/b', 'origin')
    const p = plan(sweep([fx.root], { cwd: fx.root, remotes: [''], provider: 'none' }))
    return { fx, p }
  }

  test('select re-checks only the kinds of the rows it names', () => {
    const { fx, p } = landedPlan()
    const steps: string[] = []
    const preview = check(
      p,
      { select: ['branch:feat/a'] },
      { cwd: fx.root, onProgress: (at) => steps.push(at.step) },
    )
    expect(preview.steps.map((s) => s.row)).toEqual(['branch:feat/a'])
    expect(steps).toContain('branch')
    expect(steps).not.toContain('remote')
  })

  test('pick adds to the delete rows; a glob spare leaves rows alone without a tip check', () => {
    const { fx, p } = landedPlan()
    const preview = check(p, { spare: ['feat/b', 'remote:origin/feat/*'] }, { cwd: fx.root })
    expect(preview.steps.map((s) => s.row)).toEqual(['branch:feat/a'])
    // Spared by a glob: no verify-remote step, unlike a remote branch spared by name.
    expect(preview.steps.some((s) => s.action === 'verify-remote')).toBe(false)
    const named = check(p, { spare: ['remote:origin/feat/b'] }, { cwd: fx.root })
    expect(named.steps.some((s) => s.action === 'verify-remote')).toBe(true)
  })

  test('a glob that names no row spares nothing and is no error', () => {
    const { fx, p } = landedPlan()
    const preview = check(p, { spare: ['release/*'] }, { cwd: fx.root })
    expect(preview.steps.map((s) => s.row).sort()).toEqual([
      'branch:feat/a',
      'branch:feat/b',
      'remote:origin/feat/a',
      'remote:origin/feat/b',
    ])
  })

  test('a picked review row runs beside the delete rows', () => {
    const { fx } = landedPlan()
    fx.pushBranch('origin', 'feat/open-question')
    const q = plan(sweep([fx.root], { cwd: fx.root, remotes: [''], provider: 'none' }))
    const preview = check(
      q,
      { pick: ['branch:feat/open-question'], allow: ['abandon-unmerged'], spare: ['remote:**'] },
      { cwd: fx.root },
    )
    expect(preview.steps.map((s) => s.row).sort()).toEqual([
      'branch:feat/a',
      'branch:feat/b',
      'branch:feat/open-question',
    ])
  })
})

describe('review fixes', () => {
  test('a bare --spare name also spares the worktree that has that branch out', () => {
    const fx = forkAndParent()
    fx.pushBranch('origin', 'staging')
    land(fx.root, 'staging', 'origin')
    const wt = join(dirname(fx.root), 'wt-staging')
    sh(fx.root, ['worktree', 'add', '-q', wt, 'staging'])
    const p = plan(sweep([fx.root], { cwd: fx.root, provider: 'none', remotes: [''] }))
    const preview = check(p, { spare: ['staging'] }, { cwd: fx.root })
    expect(preview.steps.map((st) => st.row).filter((r) => r.includes('staging'))).toEqual([])
  })

  test("judging another remote alone does not list the default remote's pull requests", () => {
    const fx = forkAndParent()
    const gh = cannedGh([])
    sweep([fx.root], { cwd: fx.root, remotes: ['upstream'], only: ['remote'], git: fx.git, gh })
    const listed = gh.calls.filter((c) => c[0] === 'pr' && c[1] === 'list').map((c) => c.join(' '))
    expect(listed.length).toBeGreaterThan(0)
    expect(listed.every((c) => c.includes('acme/app'))).toBe(true)
  })

  test('--fetch fetches the --against remote, with or without a default remote', () => {
    const fx = forkAndParent()
    sh(fx.root, ['remote', 'rename', 'origin', 'mine'])
    sh(fx.root, ['config', '--unset', 'branch.main.remote'])
    const swept = sweepOne(fx.root, { fetch: true, against: 'upstream' })
    expect(swept.error).toBeNull()
    expect(swept.repo?.fetchedRemotes).toEqual(['upstream'])
  })

  test('an --against remote with no refs on disk says to fetch it', () => {
    const fx = forkAndParent()
    sh(fx.root, ['remote', 'add', 'later', fx.bare['upstream']!])
    expect(sweepOne(fx.root, { against: 'later' }).error).toContain('fetch it')
  })

  test("a branch on a remote named inside another (origin/mirror) is that remote's", () => {
    const fx = forkAndParent()
    // Newer git refuses `git remote add` for a name nested in another; an
    // older repository can still have one, so configure it directly.
    sh(fx.root, ['config', 'remote.origin/mirror.url', fx.bare['upstream']!])
    sh(fx.root, [
      'config',
      'remote.origin/mirror.fetch',
      '+refs/heads/*:refs/remotes/origin/mirror/*',
    ])
    const wt = join(dirname(fx.root), 'wt-topic')
    sh(fx.root, ['worktree', 'add', '-q', '-b', 'topic', wt, 'main'])
    sh(wt, ['commit', '-q', '--allow-empty', '-m', 'topic work'])
    sh(wt, ['push', '-q', 'origin/mirror', 'topic'])
    sh(fx.root, ['fetch', '-q', 'origin/mirror'])
    // Only origin is fetched now; the branch holding the worktree is origin/mirror's.
    const swept = sweepOne(fx.root, { fetch: true })
    const row = swept.rows.find((r) => r.kind === 'worktree' && r.name === realpathSync(wt))
    expect(row?.kind === 'worktree' && row.evidence.recoverableFrom).toBeFalsy()
  })

  test('the header names each judged remote, and says which were not fetched', () => {
    const fx = forkAndParent()
    const swept = sweep([fx.root], {
      cwd: fx.root,
      remotes: ['upstream'],
      offline: true,
      provider: 'none',
    })
    expect(renderText(swept)).toMatch(/origin, not fetched, upstream not fetched\)/)
  })
})
