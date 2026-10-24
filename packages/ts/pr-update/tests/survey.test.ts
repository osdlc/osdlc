/**
 * `survey`: the stack graph, the drift measurement, and the ordering.
 *
 * The graph cases are taken from stacks that occurred in a real repository:
 * a three-deep chain where the blocking ancestor is not the immediate
 * parent, and a root whose base is a branch with no open PR of its own.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { Git, type CommandResult, type CommandRunner } from '@osdlc/typed-git'
import { makeOriginAndCheckout } from '@osdlc/typed-git/testing'

import type { CodeHost, CodeHostFailure, CodeHostPrDetail } from '@osdlc/code-host'
import { FailureError } from '@osdlc/result'

import { prUpdateConfigSchema } from '../src/config.ts'
import {
  measure,
  nearestBehindAncestor,
  parentEdges,
  renderSurveyText,
  repoFailuresOf,
  statusFor,
  resolveTargets,
  runSurvey,
  input as surveyInput,
  surveyRows,
  topoOrder,
  unpushedLocalWork,
} from '../src/survey.ts'

/** A PR with only the fields the survey reads. */
function pr(
  number: number,
  head: string,
  base: string,
  extra: Partial<CodeHostPrDetail> = {},
): CodeHostPrDetail {
  return {
    number,
    title: `PR ${number}`,
    url: `https://github.com/o/r/pull/${number}`,
    baseRef: base,
    headRef: head,
    headSha: null,
    isDraft: false,
    labels: [],
    reviewCount: 0,
    isCrossRepository: false,
    ...extra,
  }
}

/** Answers `rev-list`, `merge-tree` and `rev-parse` from a table keyed by joined argv. */
function fakeGit(replies: Record<string, CommandResult>): { git: Git; calls: string[][] } {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv) {
      calls.push([...argv])
      return replies[argv.join(' ')] ?? { exitCode: 128, stdout: '', stderr: 'no reply' }
    },
  }
  return { git: new Git('/repo', { runner }), calls }
}

const counts = (behind: number, ahead: number): CommandResult => ({
  exitCode: 0,
  stdout: `${behind}\t${ahead}\n`,
  stderr: '',
})

/** A `rev-parse --verify --quiet <ref>` reply resolving to `sha`. */
const resolved = (sha: string): CommandResult => ({ exitCode: 0, stdout: `${sha}\n`, stderr: '' })

const cleanTree: CommandResult = { exitCode: 0, stdout: 'abc123\x00', stderr: '' }

/** Per-repo options for `surveyRows`: no other worktrees, shipped defaults. */
function opts(patch: Record<string, unknown> = {}) {
  return {
    repo: 'o/r',
    worktrees: [],
    cfg: prUpdateConfigSchema.parse({}),
    measurable: true,
    ...patch,
  } as Parameters<typeof surveyRows>[2]
}

const conflictTree = (...paths: string[]): CommandResult => ({
  exitCode: 1,
  stdout: `abc123\x00${paths.join('\x00')}\x00\x00`,
  stderr: '',
})

// ---------------------------------------------------------------------------

describe('topoOrder', () => {
  test('a parent always precedes its children', () => {
    // The real shape: three PRs stacked on one root, listed out of order.
    const prs = [
      pr(1492, 'task/lifecycle', 'task/dispatcher'),
      pr(1437, 'task/dispatcher', 'main'),
      pr(1444, 'task/git-refs', 'task/dispatcher'),
    ]
    const { order, cycles } = topoOrder(prs)
    expect(order.map((p) => p.number)).toEqual([1437, 1444, 1492])
    expect(cycles).toEqual([])
  })

  test('PRs at the same depth keep number order, so two runs agree', () => {
    const prs = [pr(30, 'c', 'main'), pr(10, 'a', 'main'), pr(20, 'b', 'main')]
    expect(topoOrder(prs).order.map((p) => p.number)).toEqual([10, 20, 30])
  })

  test('a base with no open PR of its own is a root', () => {
    // #1808's base branch had already merged, so it has no parent here.
    const prs = [pr(1808, 'ux-12', 'ux-10-integration')]
    const { order } = topoOrder(prs)
    expect(order.map((p) => p.number)).toEqual([1808])
    expect(parentEdges(prs).get(1808)).toBeNull()
  })

  test('a cycle is reported rather than silently dropped', () => {
    const prs = [pr(1, 'a', 'b'), pr(2, 'b', 'a')]
    const { order, cycles } = topoOrder(prs)
    expect(order).toEqual([])
    expect(cycles).toEqual([1, 2])
  })

  test('a PR targeting its own head is a root, not a self-cycle', () => {
    const prs = [pr(1, 'a', 'a')]
    expect(topoOrder(prs).order.map((p) => p.number)).toEqual([1])
    expect(topoOrder(prs).cycles).toEqual([])
  })
})

describe('nearestBehindAncestor', () => {
  // #1491 sat on #1444 which sat on #1437. Only #1437 was behind, and
  // checking the immediate parent alone would have called #1491 ready.
  const prs = [
    pr(1437, 'dispatcher', 'main'),
    pr(1444, 'git-refs', 'dispatcher'),
    pr(1491, 'executor', 'git-refs'),
  ]
  const edges = parentEdges(prs)

  test('walks past a clean parent to the grandparent that is behind', () => {
    const behind = new Map([
      [1437, 171],
      [1444, 0],
      [1491, 0],
    ])
    expect(nearestBehindAncestor(1491, edges, behind)).toBe(1437)
  })

  test('stops at the nearest one, not the furthest', () => {
    const behind = new Map([
      [1437, 171],
      [1444, 12],
      [1491, 0],
    ])
    expect(nearestBehindAncestor(1491, edges, behind)).toBe(1444)
  })

  test('an ancestry that is entirely up to date blocks nothing', () => {
    const behind = new Map([
      [1437, 0],
      [1444, 0],
      [1491, 0],
    ])
    expect(nearestBehindAncestor(1491, edges, behind)).toBeNull()
  })

  test('an unmeasurable ancestor does not count as behind', () => {
    // Null is "not known". Treating it as drift would block the whole stack
    // on a ref this checkout never fetched.
    const behind = new Map<number, number | null>([
      [1437, null],
      [1444, 0],
      [1491, 0],
    ])
    expect(nearestBehindAncestor(1491, edges, behind)).toBeNull()
  })
})

describe('statusFor', () => {
  test("blocked outranks the PR's own drift", () => {
    expect(statusFor(0, 1437)).toBe('blocked')
    expect(statusFor(50, 1437)).toBe('blocked')
  })

  test('zero is up to date, null is unknown', () => {
    expect(statusFor(0, null)).toBe('up-to-date')
    expect(statusFor(null, null)).toBe('unknown')
    expect(statusFor(3, null)).toBe('behind')
  })
})

describe('measure', () => {
  test('an up-to-date PR costs no merge-tree call', () => {
    const { git, calls } = fakeGit({
      'rev-list --left-right --count origin/main...origin/topic': counts(0, 4),
      'rev-parse --verify --quiet origin/main': resolved('cafe'),
    })
    expect(measure(git, pr(1, 'topic', 'main'))).toEqual({
      baseOid: 'cafe',
      ahead: 4,
      behind: 0,
      merge: 'clean',
      conflicts: [],
      conflictBaseSha: null,
    })
    expect(calls.some((c) => c[0] === 'merge-tree')).toBe(false)
  })

  test('a behind PR is predicted, names its conflicts, and the base sha it was measured against', () => {
    const { git } = fakeGit({
      'rev-list --left-right --count origin/main...origin/topic': counts(12, 1),
      'merge-tree --write-tree --name-only -z origin/topic origin/main': conflictTree(
        'bun.lock',
        'docs/index.md',
      ),
      'rev-parse --verify --quiet origin/main': resolved('deadbeef'),
    })
    expect(measure(git, pr(1, 'topic', 'main'))).toEqual({
      baseOid: 'deadbeef',
      ahead: 1,
      behind: 12,
      merge: 'conflict',
      conflicts: ['bun.lock', 'docs/index.md'],
      conflictBaseSha: 'deadbeef',
    })
  })

  test('an unresolvable base sha leaves conflictBaseSha null, not thrown', () => {
    const { git } = fakeGit({
      'rev-list --left-right --count origin/main...origin/topic': counts(12, 1),
      'merge-tree --write-tree --name-only -z origin/topic origin/main': conflictTree('a.ts'),
      // No reply configured for `rev-parse`, so it gets the default exit 128.
    })
    expect(measure(git, pr(1, 'topic', 'main')).conflictBaseSha).toBeNull()
  })

  test('a ref this checkout never fetched is unknown, not zero', () => {
    const { git } = fakeGit({})
    expect(measure(git, pr(1, 'gone', 'main'))).toEqual({
      baseOid: null,
      ahead: null,
      behind: null,
      merge: 'unknown',
      conflicts: [],
      conflictBaseSha: null,
    })
  })

  test('drift still reports when only the prediction fails', () => {
    const { git } = fakeGit({
      'rev-list --left-right --count origin/main...origin/topic': counts(9, 2),
    })
    expect(measure(git, pr(1, 'topic', 'main'))).toEqual({
      baseOid: null,
      ahead: 2,
      behind: 9,
      merge: 'unknown',
      conflicts: [],
      conflictBaseSha: null,
    })
  })
})

describe('surveyRows', () => {
  test('the real stack: one behind root, three children blocked on it', () => {
    const prs = [
      pr(1492, 'lifecycle', 'dispatcher'),
      pr(1437, 'dispatcher', 'main'),
      pr(1444, 'git-refs', 'dispatcher'),
      pr(1491, 'executor', 'git-refs'),
    ]
    const { git } = fakeGit({
      'rev-list --left-right --count origin/main...origin/dispatcher': counts(171, 9),
      'merge-tree --write-tree --name-only -z origin/dispatcher origin/main': cleanTree,
      'rev-list --left-right --count origin/dispatcher...origin/git-refs': counts(0, 1),
      'rev-list --left-right --count origin/git-refs...origin/executor': counts(0, 1),
      'rev-list --left-right --count origin/dispatcher...origin/lifecycle': counts(0, 2),
    })

    const { rows, cycles } = surveyRows(git, prs, opts())
    expect(cycles).toEqual([])
    expect(rows.map((r) => r.number)).toEqual([1437, 1444, 1491, 1492])
    expect(rows.map((r) => r.status)).toEqual(['behind', 'blocked', 'blocked', 'blocked'])
    // Every child names the root, including the one two levels down.
    expect(rows.map((r) => r.blockedBy)).toEqual([null, 1437, 1437, 1437])
    expect(rows[0]!.behind).toBe(171)
  })

  test('a lone up-to-date PR is neither behind nor blocked', () => {
    const { git } = fakeGit({
      'rev-list --left-right --count origin/main...origin/topic': counts(0, 3),
    })
    const { rows } = surveyRows(git, [pr(7, 'topic', 'main')], opts())
    expect(rows[0]!.status).toBe('up-to-date')
    expect(rows[0]!.blockedBy).toBeNull()
    expect(rows[0]!.parent).toBeNull()
  })
})

describe('resolveTargets', () => {
  /** A stand-in for the host's own repo-registry scan. */
  const locate = (known: Record<string, string>) => (slug: string) => known[slug] ?? null

  test('the repository you are standing in needs no config', () => {
    expect(resolveTargets('o/r', '/repo', [], locate({}))).toEqual([{ slug: 'o/r', path: '/repo' }])
  })

  test('a bare run stays local, however many containers are configured', () => {
    // The host's registry says where checkouts are, not that all of them are
    // in scope. Surveying every checkout on the machine by default would be a
    // surprise.
    const out = resolveTargets('o/r', '/repo', [], locate({ 'x/y': '/x', 'a/b': '/a' }))
    expect(out).toEqual([{ slug: 'o/r', path: '/repo' }])
  })

  test('--repo names the repositories to survey, and they are located', () => {
    const out = resolveTargets('o/r', '/repo', ['x/y'], locate({ 'x/y': '/x' }))
    expect(out).toEqual([{ slug: 'x/y', path: '/x' }])
  })

  test('the local checkout is used for its own slug without a scan', () => {
    // Running inside the repository is enough. No registry needs to list it.
    expect(resolveTargets('o/r', '/repo', ['o/r'], locate({}))).toEqual([
      { slug: 'o/r', path: '/repo' },
    ])
  })

  test('a repeated --repo yields one target', () => {
    const out = resolveTargets('o/r', '/repo', ['x/y', 'x/y'], locate({ 'x/y': '/x' }))
    expect(out).toEqual([{ slug: 'x/y', path: '/x' }])
  })

  test('a named repository with no checkout is listed, not dropped', () => {
    // Surveying fewer repositories than asked for is the worse failure. The
    // caller would read a short list as "nothing to do there".
    expect(resolveTargets('o/r', '/repo', ['far/away'], locate({}))).toEqual([
      { slug: 'far/away', path: null },
    ])
  })

  test('a checkout whose remote cannot be resolved contributes no default target', () => {
    expect(resolveTargets(null, '/repo', [], locate({}))).toEqual([])
    // But an explicit --repo still works, located by the scan.
    expect(resolveTargets(null, '/repo', ['x/y'], locate({ 'x/y': '/x' }))).toEqual([
      { slug: 'x/y', path: '/x' },
    ])
  })
})

describe('unpushedLocalWork — the force-push interlock', () => {
  const wt = (branch: string, head: string | null) => ({
    path: `/wt/${branch}`,
    head,
    branch,
    detached: false,
    bare: false,
    locked: false,
    lockReason: null,
  })

  test('a branch nobody has checked out is safe', () => {
    const { git } = fakeGit({})
    expect(unpushedLocalWork(git, [], 'topic')).toBe(false)
  })

  test('a checkout in sync with the remote is safe', () => {
    const { git } = fakeGit({
      'rev-list --left-right --count origin/topic...abc': counts(0, 0),
    })
    expect(unpushedLocalWork(git, [wt('topic', 'abc')], 'topic')).toBe(false)
  })

  test('a checkout holding commits the remote lacks is not safe', () => {
    // --force-with-lease would not catch this: the remote ref is unchanged.
    const { git } = fakeGit({
      'rev-list --left-right --count origin/topic...abc': counts(0, 3),
    })
    expect(unpushedLocalWork(git, [wt('topic', 'abc')], 'topic')).toBe(true)
  })

  test('unreadable refs count as unsafe, not safe', () => {
    const { git } = fakeGit({})
    expect(unpushedLocalWork(git, [wt('topic', 'abc')], 'topic')).toBe(true)
  })

  test('a worktree reporting no HEAD counts as unsafe', () => {
    const { git } = fakeGit({})
    expect(unpushedLocalWork(git, [wt('topic', null)], 'topic')).toBe(true)
  })
})

describe('surveyRows carries the plan', () => {
  test('an ordinary behind PR is planned as a rebase', () => {
    const { git } = fakeGit({
      'rev-list --left-right --count origin/main...origin/topic': counts(12, 2),
      'merge-tree --write-tree --name-only -z origin/topic origin/main': cleanTree,
    })
    const { rows } = surveyRows(git, [pr(7, 'topic', 'main')], opts())
    expect(rows[0]!.strategy).toBe('rebase')
    expect(rows[0]!.strategyRule).toBe('default')
  })

  test('a reviewed PR is planned as a merge instead', () => {
    const { git } = fakeGit({
      'rev-list --left-right --count origin/main...origin/topic': counts(12, 2),
      'merge-tree --write-tree --name-only -z origin/topic origin/main': cleanTree,
    })
    const reviewed = pr(7, 'topic', 'main', {
      reviewCount: 1,
    } as never)
    const { rows } = surveyRows(git, [reviewed], opts())
    expect(rows[0]!.reviews).toBe(1)
    expect(rows[0]!.strategy).toBe('merge')
    expect(rows[0]!.strategyRule).toBe('guard:reviewed')
  })

  test('an unmeasurable repository still lists its PRs', () => {
    const { git, calls } = fakeGit({})
    const { rows } = surveyRows(git, [pr(7, 'topic', 'main')], opts({ measurable: false }))
    expect(rows[0]!.behind).toBeNull()
    expect(rows[0]!.status).toBe('unknown')
    // And it never shells out to a checkout it does not have.
    expect(calls).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// The interlock against real git
// ---------------------------------------------------------------------------

/**
 * The one check whose failure loses work for good, so it is tested against
 * real git, not a fake runner. A fake tests the branching. Only real git shows
 * that the refs mean what the code assumes.
 */
describe('unpushedLocalWork — real git', () => {
  let fx: ReturnType<typeof makeOriginAndCheckout>

  beforeAll(() => {
    fx = makeOriginAndCheckout({ initialBranch: 'main' })
  })
  afterAll(() => fx.cleanup())

  test('a pushed branch is safe; one local commit later it is not', () => {
    const { git } = fx.checkout
    git.checkout('main', { branch: 'topic' })
    fx.checkout.commit('shared', { 'a.txt': 'one\n' })
    git.push('origin', 'topic')
    git.fetch('origin')

    const worktrees = git.worktrees()
    // The clone's own worktree is on `topic`, in sync with the remote.
    expect(unpushedLocalWork(git, worktrees, 'topic')).toBe(false)

    // One commit that never left this machine. A lease cannot see it, because
    // the remote ref has not moved.
    fx.checkout.commit('local only', { 'a.txt': 'two\n' })
    expect(unpushedLocalWork(git, git.worktrees(), 'topic')).toBe(true)
  })

  test('a branch with no worktree at all is safe', () => {
    expect(unpushedLocalWork(fx.checkout.git, fx.checkout.git.worktrees(), 'no-such')).toBe(false)
  })
})

describe('runSurvey through the CodeHost port', () => {
  test('lists each target via env.codeHost, naming --repo only for a non-local slug', () => {
    const queries: Record<string, unknown>[] = []
    const cwds: string[] = []
    const git: CommandRunner = {
      run: (argv) =>
        argv.join(' ') === 'remote get-url origin'
          ? { exitCode: 0, stdout: 'git@github.com:o/r.git\n', stderr: '' }
          : { exitCode: 128, stdout: '', stderr: 'no reply' },
    }
    const report = runSurvey(
      surveyInput.parse({ repo: ['o/r', 'x/y'], noFetch: true, author: 'me', limit: 7 }),
      {
        projectRoot: '/repo',
        dryRun: false,
        git,
        gh: git,
        codeHost: ({ cwd }) => {
          cwds.push(cwd)
          return {
            listPrDetails: (q: Record<string, unknown>) => {
              queries.push(q)
              return { ok: true, value: [pr(1, 'topic', 'main')] }
            },
          } as unknown as CodeHost
        },
        cfg: prUpdateConfigSchema.parse({}),
        ports: { locate: (slug) => (slug === 'o/r' ? '/repo' : null) },
      },
    )
    expect(queries).toEqual([
      { limit: 7, author: 'me' },
      { limit: 7, repo: 'x/y', author: 'me' },
    ])
    expect(cwds).toEqual(['/repo', '/repo'])
    expect(report.prs.map((p) => p.repo)).toEqual(['o/r', 'x/y'])
  })
})

describe('runSurvey over several repositories', () => {
  const git: CommandRunner = {
    run(argv) {
      if (argv.join(' ') === 'remote get-url origin') {
        return { exitCode: 0, stdout: 'git@github.com:o/r.git\n', stderr: '' }
      }
      if (argv[0] === 'rev-list') return counts(0, 0)
      if (argv[0] === 'merge-tree') return cleanTree
      if (argv[0] === 'rev-parse') return resolved('b'.repeat(40))
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }
  const refused: CodeHostFailure = {
    kind: 'not-authenticated',
    message: 'gh is not signed in to GitHub.',
    hint: 'Run `gh auth login`.',
    host: 'github',
  }
  const surveyOf = (repo: string[], failing: string[]) =>
    runSurvey(surveyInput.parse({ repo, noFetch: true }), {
      projectRoot: '/repo',
      dryRun: false,
      git,
      gh: git,
      codeHost: ({ slug }) =>
        ({
          listPrDetails: () =>
            failing.includes(slug)
              ? { ok: false, error: refused }
              : { ok: true, value: [pr(1, `head-${slug.replace('/', '-')}`, 'main')] },
        }) as unknown as CodeHost,
      cfg: prUpdateConfigSchema.parse({}),
      ports: { locate: () => '/repo' },
    })

  test('one failed listing does not abort the others: it is recorded on its repo entry', () => {
    const report = surveyOf(['x/y', 'o/a'], ['x/y'])
    expect(report.repos.map((r) => [r.slug, r.failure?.kind])).toEqual([
      ['x/y', 'not-authenticated'],
      ['o/a', undefined],
    ])
    expect(report.prs.map((p) => p.repo)).toEqual(['o/a'])
    expect(repoFailuresOf(report)).toEqual([
      {
        kind: 'not-authenticated',
        message: 'x/y: gh is not signed in to GitHub.',
        hint: 'Run `gh auth login`.',
      },
    ])
    expect(renderSurveyText(report)).toContain(
      'x/y: could not be listed — gh is not signed in to GitHub.',
    )
  })

  test('a single repository still throws its failure', () => {
    expect(() => surveyOf(['x/y'], ['x/y'])).toThrow(FailureError)
  })
})

describe('runSurvey scoped by --pr', () => {
  /** Counts every git call by verb and the code-host listings. */
  function scopedRun(
    pr_: number[],
    listing: CodeHostPrDetail[] = [
      pr(1, 'root', 'main'),
      pr(2, 'child', 'root'),
      pr(3, 'other-a', 'main'),
      pr(4, 'other-b', 'main'),
    ],
  ) {
    const calls: string[][] = []
    let listings = 0
    const git: CommandRunner = {
      run(argv) {
        calls.push([...argv])
        if (argv.join(' ') === 'remote get-url origin') {
          return { exitCode: 0, stdout: 'git@github.com:o/r.git\n', stderr: '' }
        }
        if (argv[0] === 'rev-list') return counts(2, 1)
        if (argv[0] === 'merge-tree') return cleanTree
        if (argv[0] === 'rev-parse') return resolved('b'.repeat(40))
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const report = runSurvey(surveyInput.parse({ pr: pr_ }), {
      projectRoot: '/repo',
      dryRun: false,
      git,
      gh: git,
      codeHost: () =>
        ({
          listPrDetails: () => {
            listings += 1
            return { ok: true, value: listing }
          },
        }) as unknown as CodeHost,
      cfg: prUpdateConfigSchema.parse({}),
      ports: { locate: () => '/repo' },
    })
    return { report, calls, listings: () => listings }
  }

  test('AC-2: fetches and merge-trees only the PR and its stack parents, listing once', () => {
    const { report, calls, listings } = scopedRun([2])
    expect(listings()).toBe(1)
    expect(report.prs.map((p) => p.number)).toEqual([1, 2])
    const fetches = calls.filter((c) => c[0] === 'fetch')
    expect(fetches).toHaveLength(1)
    const refspecs = fetches[0]!.filter((a) => a.startsWith('+refs/'))
    expect(refspecs.sort()).toEqual(
      [
        '+refs/heads/child:refs/remotes/origin/child',
        '+refs/heads/main:refs/remotes/origin/main',
        '+refs/heads/root:refs/remotes/origin/root',
      ].sort(),
    )
    // At most one merge-tree per measured PR, none for the unrelated two.
    const trees = calls.filter((c) => c[0] === 'merge-tree')
    expect(trees.length).toBeLessThanOrEqual(2)
    expect(trees.flat().join(' ')).not.toContain('other-')
    expect(calls.flat().join(' ')).not.toContain('other-')
  })

  test('a fork head is not asked of the remote, only its base', () => {
    const { calls } = scopedRun(
      [1, 2],
      [pr(1, 'mine', 'main'), pr(2, 'their-fork', 'main', { isCrossRepository: true })],
    )
    const refspecs = calls
      .filter((c) => c[0] === 'fetch')
      .flatMap((c) => c.filter((a) => a.startsWith('+refs/')))
    expect(refspecs.sort()).toEqual(
      [
        '+refs/heads/main:refs/remotes/origin/main',
        '+refs/heads/mine:refs/remotes/origin/mine',
      ].sort(),
    )
  })

  test('blocked-parent detection survives the narrowing', () => {
    const child = scopedRun([2]).report.prs.find((p) => p.number === 2)!
    expect(child.blockedBy).toBe(1)
    expect(child.status).toBe('blocked')
  })

  test('with no scope every PR is measured and the whole remote is fetched', () => {
    const { report, calls } = scopedRun([])
    expect(report.prs).toHaveLength(4)
    expect(calls.filter((c) => c[0] === 'merge-tree')).toHaveLength(4)
    expect(calls.find((c) => c[0] === 'fetch')).toContain('--prune')
  })
})
