/**
 * The sweep against a real repository on disk.
 *
 * Fixtures rather than mocks: the questions being asked — is this branch an
 * ancestor, does this worktree hold uncommitted work — are git's answers, and
 * a mock would only assert that we know what we already wrote down.
 *
 * Pull requests are looked up only with `remote`, and only the suites that
 * pass a canned `gh` turn it on; they sweep `offline`, as the old default did,
 * so nothing is fetched behind the fixture's back.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture, makeOriginAndCheckout } from '@osdlc/typed-git/testing'

import { cannedGh, commit, git } from './helpers.ts'
import { HELD_BY_WORKTREE, localDeleteCommand, remoteDeleteCommand } from '../src/branches.ts'
import { renderJson, renderRepo, renderScan, renderText } from '../src/render.ts'
import { resolveEntries } from '../src/resolve.ts'
import {
  holdFreedBranches,
  inspectWorktree,
  sweep,
  sweepRepo,
  sweptWith,
  type SweepOptions,
} from '../src/sweep.ts'
import {
  KINDS,
  RepoCleanerError,
  totalOf,
  type Bucket,
  type Kind,
  type RepoSweep,
  type Row,
} from '../src/types.ts'
import { worktreeRemoveCommand } from '../src/worktrees.ts'

/**
 * A repository with one of each interesting condition:
 *   `merged-branch`  merged into main — deletable on ancestry alone
 *   `live-branch`    diverged, no PR — nothing git can conclude
 *   `wt/clean`       a worktree with nothing outstanding
 *   `wt/dirty`       a worktree with an uncommitted file
 *   `wt/ahead`       a clean worktree with a commit not on main
 */
function buildFixture(root: string): void {
  makeGitFixture({ dir: root, initialBranch: 'main' })
  writeFileSync(join(root, 'README.md'), '# fixture\n', 'utf-8')
  commit(root, 'initial commit')

  git(['checkout', '-b', 'merged-branch'], root)
  writeFileSync(join(root, 'merged.txt'), 'merged\n', 'utf-8')
  commit(root, 'feat: merged work')
  git(['checkout', 'main'], root)
  git(['merge', '--no-ff', '-m', 'Merge merged-branch', 'merged-branch'], root)

  git(['checkout', '-b', 'live-branch'], root)
  writeFileSync(join(root, 'live.txt'), 'live\n', 'utf-8')
  commit(root, 'feat: live work')
  git(['checkout', 'main'], root)

  git(['worktree', 'add', '-b', 'wt-clean', join(root, 'wt', 'clean'), 'main'], root)
  git(['worktree', 'add', '-b', 'wt-dirty', join(root, 'wt', 'dirty'), 'main'], root)
  writeFileSync(join(root, 'wt', 'dirty', 'scratch.txt'), 'uncommitted\n', 'utf-8')
  git(['worktree', 'add', '-b', 'wt-ahead', join(root, 'wt', 'ahead'), 'main'], root)
  commit(join(root, 'wt', 'ahead'), 'feat: unpushed work')
}

/**
 * Four git fixtures, two of them with worktrees, is more than vitest's default
 * hook timeout allows for on a cold or loaded machine — and a suite that passes
 * locally and times out in CI is worse than a slow one.
 */
const HOOK_TIMEOUT_MS = 60_000

let root: string
let container: string

beforeAll(() => {
  // realpath: macOS puts the temp dir behind a symlink, and git answers with
  // the resolved path, so an unresolved fixture path matches nothing it says.
  root = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-fixture-')))
  buildFixture(root)

  // A container holding two checkouts, plus a directory that is not one.
  container = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-container-')))
  for (const name of ['alpha', 'beta']) {
    const dir = join(container, name)
    mkdirSync(dir, { recursive: true })
    makeGitFixture({ dir, initialBranch: 'main' })
    writeFileSync(join(dir, 'README.md'), `# ${name}\n`, 'utf-8')
    commit(dir, 'initial commit')
  }
  mkdirSync(join(container, 'not-a-repo'), { recursive: true })
}, HOOK_TIMEOUT_MS)

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
  rmSync(container, { recursive: true, force: true })
}, HOOK_TIMEOUT_MS)

type RowOf<K extends Kind> = Extract<Row, { kind: K }>

/** The rows of one kind, by name. */
function rowsOf<K extends Kind>(rows: readonly Row[], kind: K): Map<string, RowOf<K>> {
  return new Map(
    rows.filter((row): row is RowOf<K> => row.kind === kind).map((row) => [row.name, row]),
  )
}

/** Sweep the one repository at `path` and return its sweep. */
function sweepOne(path: string, opts: SweepOptions): RepoSweep {
  const result = sweep([path], opts)
  expect(result.repos).toHaveLength(1)
  return result.repos[0]!
}

/** Assert `fn` throws a {@link RepoCleanerError} with `code`, and return it. */
function refusal(fn: () => unknown, code: RepoCleanerError['code']): RepoCleanerError {
  let caught: unknown
  try {
    fn()
  } catch (err) {
    caught = err
  }
  expect(caught).toBeInstanceOf(RepoCleanerError)
  expect((caught as RepoCleanerError).code).toBe(code)
  return caught as RepoCleanerError
}

describe('sweep', () => {
  test('discovers the repository and its default branch', () => {
    const swept = sweepOne(root, { cwd: root })
    expect(swept.error).toBeNull()
    expect(swept.repo?.mainBranch).toBe('main')
    expect(swept.repo?.remote).toBeNull()
    expect(swept.repo?.provider).toBeNull()
  })

  test('a branch merged into main is deletable on ancestry alone', () => {
    const swept = sweepOne(root, { cwd: root })
    const branch = rowsOf(swept.rows, 'branch').get('merged-branch')
    expect(branch?.id).toBe('branch:merged-branch')
    expect(branch?.verdict).toBe('delete')
    expect(branch?.action).toBe('delete')
    expect(branch?.why).toBe('fully merged into main')
    const sha = git(['rev-parse', 'merged-branch'], root)
    expect(branch?.commands).toEqual([`git update-ref -d refs/heads/merged-branch ${sha}`])
    expect(branch?.evidence.ancestorOfRemoteMain).toBe(true)
    // No remote, so the local default branch is the measure.
    expect(branch?.evidence.compareAgainst).toBe('main')
  })

  test('a diverged branch with no other signal is left for a person', () => {
    const swept = sweepOne(root, { cwd: root })
    const branch = rowsOf(swept.rows, 'branch').get('live-branch')
    expect(branch?.verdict).toBe('review')
    // A review row carries the command of its action; it runs only when picked.
    expect(branch?.action).toBe('delete')
    expect(branch?.commands).toEqual([
      localDeleteCommand('live-branch', git(['rev-parse', 'live-branch'], root)),
    ])
    // Notes, not a sentence: a host appends its own before rendering.
    expect(branch!.notes.length).toBeGreaterThan(1)
  })

  test('the default branch and branches held by a worktree are kept', () => {
    const swept = sweepOne(root, { cwd: root })
    const branches = rowsOf(swept.rows, 'branch')
    expect(branches.get('main')?.verdict).toBe('keep')
    expect(branches.get('main')?.why).toBe('default branch')
    expect(branches.get('wt-clean')?.verdict).toBe('keep')
    expect(branches.get('wt-clean')?.why).toBe(
      'checked out in a worktree (handle via that worktree)',
    )
  })

  test('a worktree with uncommitted work is never proposed for deletion outright', () => {
    const swept = sweepOne(root, { cwd: root })
    const path = join(root, 'wt', 'dirty')
    const dirty = rowsOf(swept.rows, 'worktree').get(path)
    expect(dirty?.id).toBe(`worktree:${path}`)
    expect(dirty?.verdict).toBe('review')
    expect(dirty?.evidence.dirtyFiles).toBe(1)
    // Its remove is forced, so it runs only when picked and allowed discard-changes.
    expect(dirty?.action).toBe('remove')
    expect(dirty?.risks).toContain('discard-changes')
    expect(dirty?.commands).toEqual([worktreeRemoveCommand(root, path, { force: true })])
  })

  test("the caller's own worktree is kept", () => {
    const cwd = join(root, 'wt', 'clean')
    const swept = sweepOne(root, { cwd })
    expect(rowsOf(swept.rows, 'worktree').get(cwd)?.why).toBe("current session's worktree")
  })

  test('a caller in a subdirectory whose name starts with `..` is still in its worktree', () => {
    const cwd = join(root, 'wt', 'clean', '..scratch')
    mkdirSync(cwd)
    const swept = sweepOne(root, { cwd })
    expect(rowsOf(swept.rows, 'worktree').get(join(root, 'wt', 'clean'))?.why).toBe(
      "current session's worktree",
    )
  })

  test('a caller who reaches its worktree through a symlink is still in its worktree', () => {
    const link = join(root, 'link-to-clean')
    symlinkSync(join(root, 'wt', 'clean'), link)
    const swept = sweepOne(root, { cwd: link })
    expect(rowsOf(swept.rows, 'worktree').get(join(root, 'wt', 'clean'))?.why).toBe(
      "current session's worktree",
    )
  })

  test('a caller in a sibling whose name extends the worktree name is not in the worktree', () => {
    const cwd = join(root, 'wt', 'clean-old')
    mkdirSync(cwd, { recursive: true })
    const swept = sweepOne(root, { cwd })
    expect(rowsOf(swept.rows, 'worktree').get(join(root, 'wt', 'clean'))?.why).not.toBe(
      "current session's worktree",
    )
  })

  test('a caller who followed a symlink out of its worktree is not in the worktree', () => {
    const outside = join(root, 'outside-dir')
    mkdirSync(outside, { recursive: true })
    const link = join(root, 'wt', 'clean', 'escape-link')
    symlinkSync(outside, link)
    try {
      const swept = sweepOne(root, { cwd: link })
      expect(rowsOf(swept.rows, 'worktree').get(join(root, 'wt', 'clean'))?.why).not.toBe(
        "current session's worktree",
      )
    } finally {
      unlinkSync(link) // an untracked file would make the shared worktree dirty
    }
  })

  test('a caller whose cwd goes up through a symlink is judged by where it really is', () => {
    const clean = join(root, 'wt', 'clean')
    mkdirSync(join(clean, 'deep'), { recursive: true })
    mkdirSync(join(clean, 'sub'), { recursive: true })
    symlinkSync(join(clean, 'deep'), join(root, 'deep-link'))
    // `<root>/sub` (the text-folded answer) does not exist; the real one is `<clean>/sub`.
    const cwd = `${root}/deep-link/../sub`
    const swept = sweepOne(root, { cwd })
    expect(rowsOf(swept.rows, 'worktree').get(clean)?.why).toBe("current session's worktree")
  })

  test('a caller whose cwd no longer exists, below a symlinked parent, is still placed', () => {
    const clean = join(root, 'wt', 'clean')
    const via = join(root, 'link-to-clean-2')
    symlinkSync(clean, via)
    const cwd = join(via, 'gone')
    const swept = sweepOne(root, { cwd })
    expect(rowsOf(swept.rows, 'worktree').get(clean)?.why).toBe("current session's worktree")
  })

  test('a relative cwd that does not exist is placed against the process cwd', () => {
    const clean = join(root, 'wt', 'clean')
    const before = process.cwd()
    process.chdir(join(root, 'wt'))
    try {
      const swept = sweepOne(root, { cwd: join('clean', 'gone') })
      expect(rowsOf(swept.rows, 'worktree').get(clean)?.why).toBe("current session's worktree")
    } finally {
      process.chdir(before)
    }
  })

  test('an empty cwd means the process cwd and pins that worktree', () => {
    const clean = join(root, 'wt', 'clean')
    const before = process.cwd()
    process.chdir(clean)
    try {
      const swept = sweepOne(root, { cwd: '' })
      expect(rowsOf(swept.rows, 'worktree').get(clean)?.why).toBe("current session's worktree")
    } finally {
      process.chdir(before)
    }
  })

  test('each row names the risks its delete carries', () => {
    const swept = sweepOne(root, { cwd: root })
    const branches = rowsOf(swept.rows, 'branch')
    const worktrees = rowsOf(swept.rows, 'worktree')

    expect(branches.get('merged-branch')?.risks).toEqual([])
    const live = branches.get('live-branch')
    expect(live?.risks).toEqual(['abandon-unmerged'])
    expect(live?.evidence.uniqueCommits).toBe(1)

    expect(worktrees.get(join(root, 'wt', 'dirty'))?.risks).toEqual(['discard-changes'])
    const ahead = worktrees.get(join(root, 'wt', 'ahead'))
    expect(ahead?.risks).toEqual(['abandon-unmerged'])
    expect(ahead?.evidence.uniqueCommits).toBe(1)
    expect(worktrees.get(join(root, 'wt', 'clean'))?.risks).toEqual([])
  })

  test('rows kept for structure are not deletable', () => {
    const swept = sweepOne(root, { cwd: join(root, 'wt', 'clean') })
    const branches = rowsOf(swept.rows, 'branch')
    const worktrees = rowsOf(swept.rows, 'worktree')
    expect(branches.get('main')?.action).toBeNull()
    expect(branches.get('wt-clean')?.action).toBeNull()
    expect(worktrees.get(root)?.action).toBeNull()
    expect(worktrees.get(join(root, 'wt', 'clean'))?.action).toBeNull()
    expect(branches.get('live-branch')!.action).not.toBeNull()
    for (const row of swept.rows.filter((r) => r.action === null)) expect(row.risks).toEqual([])
  })

  test('only selects kinds', () => {
    const swept = sweepOne(root, { cwd: root, only: ['worktree'] })
    expect(new Set(swept.rows.map((row) => row.kind))).toEqual(new Set(['worktree']))
  })

  test('a path that is not a repository is an error row, not a throw', () => {
    // `sweep` resolves a container to the checkouts under it, so the per-repo
    // engine is what meets a path that is no repository.
    const swept = sweepRepo(container, {
      only: ['worktree', 'branch'],
      provider: 'none',
      fetch: false,
      cwd: container,
    })
    expect(swept.error).toContain('not a git repository')
    expect(swept.rows).toEqual([])
  })

  test('the sweep mutates nothing', () => {
    const before = git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/'], root)
    const beforeStatus = git(['status', '--porcelain'], root)
    sweep([root], { cwd: root })
    expect(git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/'], root)).toBe(before)
    expect(git(['status', '--porcelain'], root)).toBe(beforeStatus)
  })
})

describe('contradictory options', () => {
  const url = 'https://example.invalid/acme/widget.git'

  /** Both `sweptWith` and `sweep` refuse `targets` with `opts` as a conflict, before reading anything. */
  function refusesBoth(targets: string[], opts: SweepOptions): void {
    refusal(() => sweptWith(targets, opts), 'conflict')
    refusal(() => sweep(targets, opts), 'conflict')
  }

  test('offline without remote', () => {
    refusesBoth([root], { cwd: root, offline: true })
  })

  test('a provider without remote', () => {
    refusesBoth([root], { cwd: root, provider: 'github' })
    refusesBoth([root], { cwd: root, provider: 'none' })
  })

  test('remote with an only that leaves remote out', () => {
    refusesBoth([root], { cwd: root, remote: true, only: ['branch'] })
    refusesBoth([root], { cwd: root, remote: true, only: ['worktree', 'branch'] })
  })

  test('a URL target mixed with a path target', () => {
    refusesBoth([url, root], { cwd: root })
  })

  test('a URL target with only worktree', () => {
    refusesBoth([url], { cwd: root, only: ['worktree'] })
    refusesBoth([url], { cwd: root, only: ['branch', 'remote'] })
  })

  test('a URL target with branch or offline', () => {
    refusesBoth([url], { cwd: root, branch: 'feature' })
    refusesBoth([url], { cwd: root, offline: true })
  })

  test('branch with two targets', () => {
    refusesBoth([root, join(container, 'alpha')], { cwd: root, branch: 'live-branch' })
  })

  test('branch equal to the default branch', () => {
    const err = refusal(() => sweep([root], { cwd: root, branch: 'main' }), 'conflict')
    expect(err.message).toContain('default branch')
  })

  test('only remote implies remote', () => {
    const asked = { cwd: root, only: ['remote'] as Kind[], provider: 'none' as const }
    expect(sweptWith([root], asked)).toMatchObject({ remote: true, only: ['remote'] })
    const swept = sweep([root], asked)
    expect(swept.options.remote).toBe(true)
    expect(swept.options.only).toEqual(['remote'])
    expect(swept.repos[0]?.error).toBeNull()
  })
})

describe('inspectWorktree', () => {
  test('returns the worktree row a sweep makes', () => {
    const path = join(root, 'wt', 'dirty')
    const row = inspectWorktree(path, { cwd: root })
    expect(row.kind).toBe('worktree')
    expect(row.id).toBe(`worktree:${path}`)
    expect(row.verdict).toBe('review')
    expect(row.evidence.dirtyFiles).toBe(1)
    expect(row).toEqual(rowsOf(sweepOne(root, { cwd: root }).rows, 'worktree').get(path))
  })

  test('throws not-found for a path that is not a worktree', () => {
    // In the repository, but no worktree of it.
    refusal(() => inspectWorktree(join(root, 'wt'), { cwd: root }), 'not-found')
    // In no repository at all.
    refusal(() => inspectWorktree(join(container, 'not-a-repo'), { cwd: root }), 'not-found')
  })
})

describe('counts', () => {
  test("each repository's counts match its rows, and the sweep's add them up", () => {
    const swept = sweep([root, container], { cwd: root })
    expect(swept.repos).toHaveLength(3)
    for (const repo of swept.repos) {
      for (const kind of KINDS) {
        const rows = repo.rows.filter((r) => r.kind === kind)
        const bucket = repo.counts[kind]
        expect(bucket.total).toBe(rows.length)
        expect(bucket.merged).toBe(rows.filter((r) => r.evidence.merged === true).length)
        expect(bucket.prune).toBe(
          rows.filter((r) => r.verdict === 'delete' && r.action === 'prune').length,
        )
        expect(bucket.delete).toBe(
          rows.filter((r) => r.verdict === 'delete' && r.action !== 'prune').length,
        )
        for (const verdict of ['review', 'blocked', 'keep'] as const) {
          expect(bucket[verdict]).toBe(rows.filter((r) => r.verdict === verdict).length)
        }
        expect(bucket.delete + bucket.prune + bucket.review + bucket.blocked + bucket.keep).toBe(
          bucket.total,
        )
      }
    }
    for (const kind of KINDS) {
      for (const key of Object.keys(swept.counts[kind]) as (keyof Bucket)[]) {
        expect(swept.counts[kind][key]).toBe(
          swept.repos.reduce((n, r) => n + r.counts[kind][key], 0),
        )
      }
    }
    const rootCounts = swept.repos.find((r) => r.repo?.root === root)!.counts
    expect(rootCounts.branch.delete).toBeGreaterThanOrEqual(1)
    expect(rootCounts.worktree.review).toBeGreaterThanOrEqual(2)
    expect(rootCounts.remote.total).toBe(0)
    const json = JSON.parse(renderJson(swept)) as { counts: unknown; totals: Bucket }
    expect(json.counts).toEqual(swept.counts)
    expect(json.totals).toEqual(totalOf(swept.counts))
  })
})

describe('worktree blockers', () => {
  let parent: string
  let wt: (name: string) => string
  let swept: RepoSweep
  let rows: Map<string, RowOf<'worktree'>>
  let checkout: string
  let gh: CommandRunner

  beforeAll(() => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-blockers-')))
    const { checkout: fx } = makeOriginAndCheckout({ parent })
    checkout = fx.dir
    wt = (name) => join(checkout, 'wt', name)
    const tip = fx.commit('main: tracked', { 'tracked.txt': 'x\n', '.gitignore': 'ignored/\n' })
    git(['push', '-q', 'origin', 'main'], checkout)

    // Each worktree is clean at main's tip with a merged PR, so only its
    // blocker stands between it and removal.
    for (const name of ['locked', 'hidden', 'nested', 'shared']) {
      git(['worktree', 'add', '-q', '-b', `wt-${name}`, wt(name), 'main'], checkout)
    }
    git(['worktree', 'lock', '--reason', 'test', wt('locked')], checkout)
    git(['update-index', '--skip-worktree', 'tracked.txt'], wt('hidden'))
    writeFileSync(join(wt('hidden'), 'tracked.txt'), 'edited\n', 'utf-8')
    git(['init', '-q', join(wt('nested'), 'ignored')], checkout)
    // `-f`: git refuses a branch already checked out elsewhere without it.
    git(['worktree', 'add', '-q', '-f', wt('shared-2'), 'wt-shared'], checkout)
    // `worktree prune` skips a locked entry, so a missing directory is no excuse.
    git(['worktree', 'add', '-q', '-b', 'wt-gone', wt('gone'), 'main'], checkout)
    git(['worktree', 'lock', wt('gone')], checkout)
    rmSync(wt('gone'), { recursive: true, force: true })

    gh = cannedGh(
      ['locked', 'hidden', 'nested', 'shared'].map((name, i) => ({
        number: i + 1,
        state: 'MERGED' as const,
        headRefName: `wt-${name}`,
        headRefOid: tip,
      })),
    )
    swept = sweepOne(checkout, { cwd: checkout, gh, remote: true, offline: true })
    expect(swept.error).toBeNull()
    rows = rowsOf(swept.rows, 'worktree')
  }, HOOK_TIMEOUT_MS)

  afterAll(() => rmSync(parent, { recursive: true, force: true }), HOOK_TIMEOUT_MS)

  const blockersOf = (path: string) => rows.get(path)?.blockers

  test('a locked worktree is held back, with its reason', () => {
    const locked = rows.get(wt('locked'))
    expect(locked?.verdict).toBe('blocked')
    expect(locked?.blockers).toEqual(['locked-worktree'])
    expect(locked?.evidence.lockReason).toBe('test')
    expect(locked?.why).toBe('blocked: locked-worktree')
  })

  test('an edit hidden by skip-worktree is not reported clean', () => {
    const hidden = rows.get(wt('hidden'))
    expect(hidden?.verdict).toBe('blocked')
    expect(hidden?.evidence.dirtyFiles).toBe(0)
    expect(hidden?.blockers).toEqual(['hidden-index-flags'])
    expect(hidden?.evidence.hiddenIndexFlags).toBe(1)
    expect(hidden?.evidence.hiddenIndexPaths).toEqual(['tracked.txt'])
  })

  test('a repository inside an ignored directory is found', () => {
    expect(blockersOf(wt('nested'))).toEqual(['nested-repository'])
    expect(rows.get(wt('nested'))?.evidence.nestedRepositories).toEqual(['ignored/'])
  })

  test('a branch checked out twice blocks both worktrees, each naming the other', () => {
    for (const [self, other] of [
      ['shared', 'shared-2'],
      ['shared-2', 'shared'],
    ] as const) {
      expect(blockersOf(wt(self))).toEqual(['branch-in-other-worktree'])
      expect(rows.get(wt(self))?.evidence.otherWorktrees).toEqual([wt(other)])
    }
  })

  test('a blocked row proposes no command and says what to do', () => {
    for (const name of ['locked', 'hidden', 'nested', 'shared', 'shared-2']) {
      const row = rows.get(wt(name))
      expect(row?.verdict).toBe('blocked')
      expect(row?.commands).toEqual([])
      expect(row?.notes.length).toBe(1)
    }
    expect(rows.get(wt('locked'))?.notes[0]).toContain('git worktree unlock')
  })

  test('a blocked row is not deletable', () => {
    for (const name of ['locked', 'hidden', 'nested', 'shared', 'shared-2', 'gone']) {
      expect(rows.get(wt(name))?.action).toBeNull()
    }
  })

  test('a locked worktree with no directory is held back, not pruned', () => {
    const gone = rows.get(wt('gone'))
    expect(gone?.evidence.onDisk).toBe(false)
    expect(gone?.verdict).toBe('blocked')
    expect(gone?.blockers).toEqual(['locked-worktree'])
    expect(gone?.commands).toEqual([])
  })

  test('the text report prints what to do under a blocked row', () => {
    const text = renderRepo(swept)
    expect(text).toContain('blocked: locked-worktree')
    expect(text).toContain(`git worktree unlock ${wt('locked')}`)
  })

  test('a branch-scoped sweep keeps the branch of a blocked worktree pinned', () => {
    const scoped = (branch: string): RepoSweep =>
      sweepOne(checkout, { cwd: checkout, gh, remote: true, offline: true, branch })
    for (const name of ['locked', 'shared']) {
      const one = scoped(`wt-${name}`)
      expect(one.error).toBeNull()
      const local = rowsOf(one.rows, 'branch').get(`wt-${name}`)
      expect(local).toBeDefined()
      expect(local?.action).toBeNull()
      expect(local?.commands).toEqual([])
    }
    const shared = scoped('wt-shared')
    const worktrees = shared.rows.filter((row) => row.kind === 'worktree')
    expect(worktrees.length).toBeGreaterThan(0)
    for (const row of worktrees) {
      expect(row.blockers).toEqual(['branch-in-other-worktree'])
    }
  })
})

describe('resolveEntries', () => {
  test('a checkout resolves to itself', () => {
    const resolution = resolveEntries([root], { git: new Git(root) })
    expect(resolution.repos).toEqual([root])
    expect(resolution.unresolved).toEqual([])
  })

  test('a container resolves to the checkouts under it', () => {
    const resolution = resolveEntries([container], { git: new Git(container) })
    expect(resolution.repos).toEqual([join(container, 'alpha'), join(container, 'beta')].sort())
  })

  test('a worktree collapses into the repository it belongs to', () => {
    const resolution = resolveEntries([join(root, 'wt', 'clean'), root], { git: new Git(root) })
    expect(resolution.repos).toEqual([root])
  })

  test('an entry that names nothing is reported, not dropped', () => {
    const missing = join(container, 'absent')
    const resolution = resolveEntries([missing, join(container, 'not-a-repo')], {
      git: new Git(container),
    })
    expect(resolution.repos).toEqual([])
    expect(resolution.unresolved).toEqual([
      { entry: missing, reason: 'not a directory' },
      { entry: join(container, 'not-a-repo'), reason: 'no git checkouts under it' },
    ])
  })

  test('reports what the search cost, and nothing for an entry that is a checkout', () => {
    const searched = resolveEntries([container], { git: new Git(container) })
    expect(searched.scan.containers).toBe(1)
    expect(searched.scan.checkoutsFound).toBeGreaterThanOrEqual(2)
    expect(searched.scan.directoriesScanned).toBeGreaterThan(0)

    const direct = resolveEntries([root], { git: new Git(root) })
    expect(direct.scan).toEqual({
      containers: 0,
      directoriesScanned: 0,
      depthLimited: 0,
      checkoutsFound: 0,
    })
  })

  test('no entries means no repositories — nothing fans out on its own', () => {
    expect(resolveEntries([], { git: new Git(root) }).repos).toEqual([])
  })
})

describe('duplicate checkouts', () => {
  const remoteUrl = 'https://github.com/acme/dup.git'

  const dupHome = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-dups-')))
  afterAll(() => rmSync(dupHome, { recursive: true, force: true }))

  function clone(name: string): string {
    const dir = join(dupHome, name)
    mkdirSync(dir, { recursive: true })
    makeGitFixture({ dir, initialBranch: 'main' })
    writeFileSync(join(dir, 'README.md'), `# ${name}\n`, 'utf-8')
    commit(dir, 'initial commit')
    git(['remote', 'add', 'origin', remoteUrl], dir)
    return dir
  }

  test('two clones of one remote are reported with both roots', () => {
    const first = clone('dup-one')
    const second = clone('dup-two')
    const result = sweep([dupHome], { cwd: root })
    expect(result.duplicates).toEqual([{ slug: 'acme/dup', roots: [first, second] }])
    expect(renderText(result).startsWith('Duplicate checkouts\n  acme/dup\n')).toBe(true)
    const json = JSON.parse(renderJson(result)) as { duplicates: unknown[] }
    expect(json.duplicates).toHaveLength(1)
  })

  test('a clone and its linked worktree are not duplicates', () => {
    const dir = clone('solo')
    git(['worktree', 'add', '-b', 'solo-wt', join(dir, 'wt'), 'main'], dir)
    const result = sweep([dir, join(dir, 'wt')], { cwd: root })
    expect(result.duplicates).toEqual([])
    expect(renderText(result)).not.toContain('Duplicate checkouts')
  })

  test('one owner/name on two hosts is not a duplicate', () => {
    const github = clone('host-github')
    const forge = clone('host-forge')
    git(['remote', 'set-url', 'origin', 'git@forge.example:acme/dup.git'], forge)
    const result = sweep([github, forge], { cwd: root })
    expect(result.duplicates).toEqual([])
    expect(result.repos.map((r) => r.repo?.slug).sort()).toEqual([
      'acme/dup',
      'forge.example/acme/dup',
    ])
  })
})

describe('rendering', () => {
  test('text names every repository and counts the verdicts', () => {
    const absent = join(container, 'absent')
    const result = sweep([root, container, absent], { cwd: root })
    const text = renderText(result)
    expect(text).toContain(root)
    expect(text).toContain(join(container, 'alpha'))
    expect(text).toContain('merged-branch')
    expect(text).toContain('needs --allow abandon-unmerged (drops 1 commit)')
    expect(text).toContain('unresolved')
    expect(text).toMatch(
      /\d+ to delete, \d+ to review, across 3 repositories \(1 target unresolved\)\./,
    )
    expect(text.endsWith('\n')).toBe(true)
  })

  test('the search is summarised when there was one, and silent when there was not', () => {
    const searched = sweep([container], { cwd: root })
    expect(renderScan(searched)).toMatch(
      /^searched 1 target: \d+ directories read, \d+ checkouts found\./,
    )
    expect(renderText(searched)).toContain('searched 1 target:')

    const direct = sweep([root], { cwd: root })
    expect(renderScan(direct)).toBeNull()
    expect(renderText(direct)).not.toContain('searched')
  })

  test('keep rows are hidden unless asked for', () => {
    const result = sweep([root], { cwd: root })
    expect(renderText(result)).not.toContain('default branch')
    expect(renderText(result, { all: true })).toContain('default branch')
  })

  test('json carries the evidence and the notes', () => {
    const result = sweep([root], { cwd: root })
    const parsed = JSON.parse(renderJson(result)) as {
      repos: Array<{
        rows: Array<{
          id: string
          evidence: Record<string, unknown>
          notes: string[]
        }>
      }>
      totals: Bucket
    }
    const live = parsed.repos[0]!.rows.find((row) => row.id === 'branch:live-branch')!
    expect(live.evidence['ancestorOfRemoteMain']).toBe(false)
    // The notes stay a list, so a program can read them one by one.
    const swept = rowsOf(result.repos[0]!.rows, 'branch').get('live-branch')!
    expect(live.notes).toEqual(swept.notes)
    expect(live.notes.length).toBeGreaterThan(1)
    expect(parsed.totals.delete).toBeGreaterThan(0)
  })
})

// ── ancestry against the remote default ───────────────────────────────────

describe('ancestry against the remote default branch', () => {
  let parent: string

  beforeAll(() => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-remote-main-')))
  }, HOOK_TIMEOUT_MS)

  afterAll(() => rmSync(parent, { recursive: true, force: true }), HOOK_TIMEOUT_MS)

  const branchOff = (checkout: string, name: string): void => {
    git(['checkout', '-q', '-b', name, 'main'], checkout)
    commit(checkout, `${name}: work`)
    git(['checkout', '-q', 'main'], checkout)
  }

  test('a branch merged only into an unpushed local main is not deletable', () => {
    const { checkout } = makeOriginAndCheckout({ parent })
    branchOff(checkout.dir, 'unpushed')
    git(['merge', '-q', '--no-ff', '-m', 'Merge unpushed', 'unpushed'], checkout.dir)
    const swept = sweepOne(checkout.dir, { cwd: checkout.dir })
    const branch = rowsOf(swept.rows, 'branch').get('unpushed')
    expect(branch?.verdict).toBe('review')
    expect(branch?.evidence.ancestorOfRemoteMain).toBe(false)
    expect(branch?.evidence.compareAgainst).toBe('origin/main')
  })

  test('a branch reachable from origin/main is deletable', () => {
    const { origin, checkout } = makeOriginAndCheckout({ parent })
    // The origin is not bare; detach it so a push to its `main` is accepted.
    git(['checkout', '-q', '--detach'], origin.dir)
    branchOff(checkout.dir, 'pushed')
    git(['merge', '-q', '--no-ff', '-m', 'Merge pushed', 'pushed'], checkout.dir)
    git(['push', '-q', 'origin', 'main'], checkout.dir)
    const swept = sweepOne(checkout.dir, { cwd: checkout.dir })
    const branch = rowsOf(swept.rows, 'branch').get('pushed')
    expect(branch?.verdict).toBe('delete')
    expect(branch?.why).toBe('fully merged into origin/main')
    expect(branch?.evidence.compareAgainst).toBe('origin/main')
  })

  test('a missing remote default branch leaves ancestry unknown', () => {
    const { checkout } = makeOriginAndCheckout({ parent })
    branchOff(checkout.dir, 'orphaned')
    git(['update-ref', '-d', 'refs/remotes/origin/main'], checkout.dir)
    const swept = sweepOne(checkout.dir, { cwd: checkout.dir })
    const branch = rowsOf(swept.rows, 'branch').get('orphaned')
    expect(branch?.verdict).toBe('review')
    expect(branch?.evidence.ancestorOfRemoteMain).toBeNull()
    expect(branch?.notes[0]).toContain('was not found')
  })

  test('a slashed default branch name is read whole', () => {
    const { checkout } = makeOriginAndCheckout({ parent })
    git(['push', '-q', 'origin', 'main:release/v2'], checkout.dir)
    git(['fetch', '-q', 'origin'], checkout.dir)
    git(
      ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/release/v2'],
      checkout.dir,
    )
    const swept = sweepOne(checkout.dir, { cwd: checkout.dir })
    expect(swept.error).toBeNull()
    expect(swept.repo?.mainBranch).toBe('release/v2')
  })
})

// ── merged-PR evidence ─────────────────────────────────────────────────────

/**
 * A merged PR counts only when it came from this repository, targeted the
 * default branch, and its head commit is the tip being judged. `gh` is a
 * canned runner over a real clone, so git answers the ancestry questions.
 */
describe('merged-PR evidence', () => {
  let parent: string
  let checkout: string
  let rows: Row[]
  let gh: CommandRunner
  let landedWorktree: string

  /** What every sweep in this suite asks for: remote branches, PRs from the canned `gh`, no fetch. */
  const withPrs = (opts: SweepOptions = {}): SweepOptions => ({
    cwd: checkout,
    gh,
    remote: true,
    offline: true,
    ...opts,
  })

  beforeAll(() => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-prs-')))
    const pair = makeOriginAndCheckout({ parent })
    const fx = pair.checkout
    checkout = fx.dir
    const first = git(['rev-parse', 'HEAD'], checkout)
    fx.commit('main: second', { 'main.txt': 'main\n' })
    git(['push', '-q', 'origin', 'main'], checkout)

    // Each branch is one or two commits off main, never merged into it.
    const branch = (name: string, ...files: string[]): string[] => {
      git(['checkout', '-q', '-b', name, 'main'], checkout)
      const shas = files.map((file) => fx.commit(`${name}: ${file}`, { [file]: `${file}\n` }))
      git(['checkout', '-q', 'main'], checkout)
      return shas
    }
    const [landed] = branch('landed', 'landed.txt')
    const [movedPrHead] = branch('moved', 'moved-1.txt', 'moved-2.txt')
    const [forked] = branch('forked', 'forked.txt')
    const [forkOpen] = branch('fork-open', 'fork-open.txt')
    const [otherBase] = branch('other-base', 'other-base.txt')
    const [openHead] = branch('open', 'open.txt')
    git(['push', '-q', 'origin', 'landed', 'moved', 'open'], checkout)

    // A clean worktree at main's tip whose PR merged at an older commit.
    git(
      ['worktree', 'add', '-q', '-b', 'wt-moved', join(checkout, 'wt', 'moved'), 'main'],
      checkout,
    )

    // A worktree with no upstream whose PR merged at its HEAD, as after a
    // squash merge that deleted the remote branch.
    landedWorktree = join(checkout, 'wt', 'landed')
    git(['worktree', 'add', '-q', '-b', 'wt-landed', landedWorktree, 'main'], checkout)
    writeFileSync(join(landedWorktree, 'wt-landed.txt'), 'landed\n', 'utf-8')
    commit(landedWorktree, 'wt-landed: work')
    const wtLanded = git(['rev-parse', 'HEAD'], landedWorktree)

    gh = cannedGh([
      { number: 1, state: 'MERGED', headRefName: 'landed', headRefOid: landed! },
      { number: 2, state: 'MERGED', headRefName: 'moved', headRefOid: movedPrHead! },
      {
        number: 3,
        state: 'MERGED',
        headRefName: 'forked',
        headRefOid: forked!,
        isCrossRepository: true,
      },
      {
        number: 4,
        state: 'OPEN',
        headRefName: 'fork-open',
        headRefOid: forkOpen!,
        isCrossRepository: true,
      },
      {
        number: 5,
        state: 'MERGED',
        headRefName: 'other-base',
        headRefOid: otherBase!,
        baseRefName: 'release',
      },
      { number: 6, state: 'MERGED', headRefName: 'wt-moved', headRefOid: first },
      { number: 7, state: 'OPEN', headRefName: 'open', headRefOid: openHead! },
      { number: 8, state: 'MERGED', headRefName: 'wt-landed', headRefOid: wtLanded },
    ])
    const swept = sweepOne(checkout, withPrs())
    expect(swept.error).toBeNull()
    rows = swept.rows
  }, HOOK_TIMEOUT_MS)

  afterAll(() => rmSync(parent, { recursive: true, force: true }), HOOK_TIMEOUT_MS)

  test('a same-repo PR into the default branch at the exact tip is landing proof', () => {
    const landed = rowsOf(rows, 'branch').get('landed')
    expect(landed?.verdict).toBe('delete')
    const sha = git(['rev-parse', 'landed'], checkout)
    expect(landed?.commands).toEqual([`git update-ref -d refs/heads/landed ${sha}`])
    expect(landed?.evidence.pr?.proof).toBe('exact-head')
  })

  test('a commit added after the merge leaves the branch for a person', () => {
    const moved = rowsOf(rows, 'branch').get('moved')
    expect(moved?.verdict).toBe('review')
    expect(moved?.evidence.pr?.proof).toBe('head-moved')
    expect(moved?.notes.join(' ')).toContain('head-moved')
  })

  test('a fork PR sharing the branch name is not evidence either way', () => {
    const branches = rowsOf(rows, 'branch')
    expect(branches.get('forked')?.verdict).toBe('review')
    expect(branches.get('forked')?.evidence.pr).toBeUndefined()
    expect(branches.get('fork-open')?.verdict).toBe('review')
  })

  test('a PR merged into another base is not landing proof', () => {
    const other = rowsOf(rows, 'branch').get('other-base')
    expect(other?.verdict).toBe('review')
    expect(other?.evidence.pr?.proof).toBe('other-base')
  })

  test('local-branch evidence carries the full sha', () => {
    const branches = [...rowsOf(rows, 'branch').values()]
    expect(branches.length).toBeGreaterThan(0)
    for (const row of branches) {
      expect(row.evidence.sha).toMatch(/^[0-9a-f]{40}$/)
    }
  })

  test('remote branches judge the PR head against the ls-remote sha', () => {
    const remotes = rowsOf(rows, 'remote')
    const landed = remotes.get('origin/landed')
    expect(landed?.id).toBe('remote:origin/landed')
    expect(landed?.verdict).toBe('delete')
    const sha = git(['rev-parse', 'landed'], checkout)
    expect(landed?.commands).toEqual([
      `git push --force-with-lease=refs/heads/landed:${sha} origin :refs/heads/landed`,
    ])
    const moved = remotes.get('origin/moved')
    expect(moved?.verdict).toBe('review')
    expect(moved?.evidence.pr?.proof).toBe('head-moved')
  })

  test('a clean worktree whose PR head is not its HEAD is left for a person', () => {
    const wt = rowsOf(rows, 'worktree').get(join(checkout, 'wt', 'moved'))
    expect(wt?.verdict).toBe('review')
    expect(wt?.evidence.pr?.proof).toBe('head-moved')
  })

  test('a worktree whose PR merged at HEAD needs nothing, though it is ahead of main', () => {
    const wt = rowsOf(rows, 'worktree').get(landedWorktree)
    expect(wt?.evidence.unpushedCommits).toBeGreaterThan(0)
    expect(wt?.verdict).toBe('delete')
    expect(wt?.risks).toEqual([])
  })

  test('a full sweep frees the branch of a worktree it removes, and no other', () => {
    const branches = rowsOf(rows, 'branch')
    const freed = branches.get('wt-landed')
    expect(freed?.action).not.toBeNull()
    expect(freed?.verdict).toBe('delete')
    expect(freed?.evidence.worktree).toBe(landedWorktree)
    // Its worktree is left for a person, so the branch stays with it.
    expect(branches.get('wt-moved')?.why).toBe(
      'checked out in a worktree (handle via that worktree)',
    )
    expect(branches.get('wt-moved')?.evidence.worktree).toBeUndefined()
  })

  test('without worktrees in scope, a branch checked out in one stays kept', () => {
    const swept = sweepOne(checkout, withPrs({ only: ['branch', 'remote'] }))
    const branch = rowsOf(swept.rows, 'branch').get('wt-landed')
    expect(branch).toBeDefined()
    expect(branch?.action).toBeNull()
    expect(branch?.evidence.worktree).toBeUndefined()
  })

  test('a branch-scoped sweep without worktrees in scope keeps the branch', () => {
    const swept = sweepOne(checkout, withPrs({ branch: 'wt-landed', only: ['branch', 'remote'] }))
    expect(swept.rows.map((row) => [row.id, row.action !== null])).toEqual([
      ['branch:wt-landed', false],
    ])
  })

  test('a freed branch is kept again once a host holds its worktree back', () => {
    const held = holdFreedBranches(
      rows.map((row) =>
        row.kind === 'worktree' && row.name === landedWorktree
          ? { ...row, verdict: 'keep' as const, action: null }
          : row,
      ),
      false,
    )
    const branch = rowsOf(held, 'branch').get('wt-landed')
    expect(branch).toMatchObject({
      verdict: 'keep',
      action: null,
      commands: [],
      risks: [],
      why: 'checked out in a worktree (handle via that worktree)',
    })
    expect(branch?.evidence.worktree).toBeUndefined()
    // Untouched: the worktree still goes, so its branch stays freed.
    expect(rowsOf(holdFreedBranches(rows, false), 'branch').get('wt-landed')?.action).not.toBeNull()
  })

  test('a freed branch is kept again when a host drops its worktree row', () => {
    const held = holdFreedBranches(
      rows.filter((row) => row.id !== `worktree:${landedWorktree}`),
      false,
    )
    expect(rowsOf(held, 'branch').get('wt-landed')?.action).toBeNull()
  })

  test('a worktree a host demotes to review keeps its branch, unless the sweep named it', () => {
    const demoted = rows.map((row) =>
      row.id === `worktree:${landedWorktree}` ? { ...row, verdict: 'review' as const } : row,
    )
    const full = rowsOf(holdFreedBranches(demoted, false), 'branch').get('wt-landed')
    expect(full?.action).toBeNull()
    // A branch-scoped sweep frees the named branch for any deletable worktree.
    const scoped = holdFreedBranches(demoted, true)
    expect(rowsOf(scoped, 'branch').get('wt-landed')?.action).not.toBeNull()
  })

  test('annotate is applied, and a worktree it holds back keeps its branch', () => {
    const seen: string[] = []
    const swept = sweepOne(
      checkout,
      withPrs({
        annotate: (repo, rows) => {
          seen.push(repo.root)
          return rows.map((row) =>
            row.id === `worktree:${landedWorktree}`
              ? {
                  ...row,
                  verdict: 'keep' as const,
                  action: null,
                  notes: [...row.notes, 'held by the host'],
                }
              : row,
          )
        },
      }),
    )
    expect(seen).toEqual([checkout])
    const worktree = rowsOf(swept.rows, 'worktree').get(landedWorktree)
    expect(worktree).toMatchObject({ verdict: 'keep', action: null })
    expect(worktree?.notes).toContain('held by the host')
    const branch = rowsOf(swept.rows, 'branch').get('wt-landed')
    expect(branch).toMatchObject({ verdict: 'keep', action: null, why: HELD_BY_WORKTREE })
    expect(branch?.evidence.worktree).toBeUndefined()
    // The counts are of the annotated rows.
    expect(swept.counts.worktree.keep).toBe(
      swept.rows.filter((r) => r.kind === 'worktree' && r.verdict === 'keep').length,
    )
  })

  test('a branch-scoped sweep reports that branch alone, from inside its worktree', () => {
    const swept = sweepOne(checkout, withPrs({ cwd: landedWorktree, branch: 'wt-landed' }))
    expect(swept.error).toBeNull()
    expect(swept.rows.map((row) => [row.kind, row.name])).toEqual([
      ['worktree', landedWorktree],
      ['branch', 'wt-landed'],
    ])
    for (const row of swept.rows) {
      expect(row.action).not.toBeNull()
      expect(row.verdict).toBe('delete')
      expect(row.risks).toEqual([])
    }
  })

  test('a branch-scoped sweep matches the name exactly and covers the remote', () => {
    const swept = sweepOne(checkout, withPrs({ branch: 'open' }))
    expect(swept.rows.map((row) => row.id)).toEqual(['branch:open', 'remote:origin/open'])
  })

  test('a branch-scoped sweep refuses the default branch', () => {
    const err = refusal(() => sweep([checkout], withPrs({ branch: 'main' })), 'conflict')
    expect(err.message).toContain('default branch')
  })

  test('a branch with an open PR is kept, and its delete needs confirm-open-pr', () => {
    const local = rowsOf(rows, 'branch').get('open')
    expect(local?.verdict).toBe('keep')
    expect(local?.action).toBe('delete')
    expect(local?.risks).toEqual(['abandon-unmerged', 'confirm-open-pr'])
    const remote = rowsOf(rows, 'remote').get('origin/open')
    expect(remote?.verdict).toBe('keep')
    expect(remote?.action).toBe('delete')
    expect(remote?.risks).toEqual(['abandon-unmerged', 'confirm-open-pr'])
    expect(remote?.evidence.uniqueCommits).toBe(
      Number(git(['rev-list', '--count', 'origin/main..open'], checkout)),
    )
    // An exact-head merged PR needs nothing, though the tip is not an ancestor.
    expect(rowsOf(rows, 'remote').get('origin/landed')?.risks).toEqual([])
    expect(rowsOf(rows, 'remote').get('origin/main')?.action).toBeNull()
  })

  // Moves `landed`, so it runs last.
  test('a proposed delete refuses a branch that moved after the sweep', () => {
    const client = new Git(checkout, { env: { ...IDENTITY } })
    const run = (command: string) => client.raw(command.split(' ').slice(1)).exitCode
    const local = rowsOf(rows, 'branch').get('landed')!.commands[0]!
    const remote = rowsOf(rows, 'remote').get('origin/landed')!.commands[0]!

    git(['checkout', '-q', 'landed'], checkout)
    commit(checkout, 'landed: pushed after the sweep')
    git(['push', '-q', 'origin', 'landed'], checkout)
    git(['checkout', '-q', 'main'], checkout)
    const moved = git(['rev-parse', 'landed'], checkout)

    expect(run(local)).not.toBe(0)
    expect(git(['rev-parse', 'landed'], checkout)).toBe(moved)
    expect(run(remote)).not.toBe(0)
    expect(git(['ls-remote', '--heads', 'origin', 'landed'], checkout).startsWith(moved)).toBe(true)

    // The same commands at the current sha go through.
    expect(run(localDeleteCommand('landed', moved))).toBe(0)
    expect(run(remoteDeleteCommand('origin', 'landed', moved))).toBe(0)
    expect(git(['ls-remote', '--heads', 'origin', 'landed'], checkout)).toBe('')
  })
})

describe('fetch', () => {
  let base: string
  let upstream: string

  /** A clone of `upstream` as it stands now. */
  function clone(name: string): string {
    const dir = join(base, name)
    git(['clone', '--quiet', upstream, dir], base)
    return dir
  }

  beforeAll(() => {
    base = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-fetch-')))
    upstream = join(base, 'upstream')
    mkdirSync(upstream)
    makeGitFixture({ dir: upstream, initialBranch: 'main' })
    commit(upstream, 'initial commit')
    git(['checkout', '-b', 'feature'], upstream)
    commit(upstream, 'feat: feature work')
    git(['checkout', 'main'], upstream)
  }, HOOK_TIMEOUT_MS)

  afterAll(() => {
    rmSync(base, { recursive: true, force: true })
  }, HOOK_TIMEOUT_MS)

  function remoteFeature(swept: RepoSweep): RowOf<'remote'> | undefined {
    return rowsOf(swept.rows, 'remote').get('origin/feature')
  }

  test(
    'a branch merged on the remote after the last fetch reads merged only when fetched',
    () => {
      const stale = clone('stale')
      git(['merge', '--no-ff', '-m', 'Merge feature', 'feature'], upstream)

      const unfetched = sweepOne(stale, {
        cwd: stale,
        remote: true,
        offline: true,
        provider: 'none',
      })
      expect(unfetched.repo?.fetched).toBe(false)
      expect(remoteFeature(unfetched)?.verdict).toBe('review')
      expect(renderRepo(unfetched)).toContain('not fetched')

      const fetched = sweepOne(stale, { cwd: stale, remote: true, provider: 'none' })
      expect(fetched.error).toBeNull()
      expect(fetched.repo?.fetched).toBe(true)
      expect(remoteFeature(fetched)?.verdict).toBe('delete')
      expect(renderRepo(fetched)).not.toContain('not fetched')
    },
    HOOK_TIMEOUT_MS,
  )

  test(
    'a failed fetch is an error row, and the rest of the fan-out is still swept',
    () => {
      const broken = clone('broken')
      git(['remote', 'set-url', 'origin', join(base, 'gone')], broken)
      const healthy = clone('healthy')

      const result = sweep([broken, healthy], { cwd: base, remote: true, provider: 'none' })
      const [bad, good] = result.repos
      expect(bad?.error?.startsWith('fetch failed:')).toBe(true)
      expect(bad?.rows).toEqual([])
      expect(good?.error).toBeNull()
      expect(good?.repo?.fetched).toBe(true)
      expect(good!.rows.length).toBeGreaterThan(0)
    },
    HOOK_TIMEOUT_MS,
  )

  test('a repository with no remote is swept without a fetch', () => {
    const swept = sweepOne(root, { cwd: root, remote: true, provider: 'none' })
    expect(swept.error).toBeNull()
    expect(swept.repo?.fetched).toBe(false)
  })
})

describe('a clean worktree merged by ancestry alone (#582)', () => {
  let parent: string

  beforeAll(() => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-used-')))
  }, HOOK_TIMEOUT_MS)

  afterAll(() => rmSync(parent, { recursive: true, force: true }), HOOK_TIMEOUT_MS)

  /** A checkout whose origin accepts a push to `main`, and a worktree path under `parent`. */
  function setup(name: string) {
    const { origin, checkout } = makeOriginAndCheckout({ parent })
    git(['checkout', '-q', '--detach'], origin.dir)
    const wt = join(parent, `${name}-${Math.random().toString(36).slice(2, 8)}`)
    return { root: checkout.dir, wt }
  }
  const worktreeRow = (root: string, wt: string): RowOf<'worktree'> | undefined =>
    rowsOf(sweepOne(root, { cwd: root }).rows, 'worktree').get(realpathSync(wt))

  test('a worked-on branch fast-forwarded into main leaves a deletable worktree', () => {
    // The issue's reproduction: a commit on topic, pushed, main fast-forwarded to it.
    const { root, wt } = setup('topic')
    git(['worktree', 'add', '-q', '-b', 'topic', wt], root)
    commit(wt, 'topic')
    git(['push', '-q', '-u', 'origin', 'topic'], wt)
    git(['merge', '-q', '--ff-only', 'topic'], root)
    git(['push', '-q', 'origin', 'main'], root)
    const row = worktreeRow(root, wt)
    expect(row?.verdict).toBe('delete')
    expect(row?.evidence.branchUsed).toBe('commits')
    expect(row?.why).toBe('clean; merged into origin/main, and the branch has commits made on it')
  })

  test('a worktree just made from main stays a review row', () => {
    const { root, wt } = setup('fresh')
    git(['worktree', 'add', '-q', '-b', 'fresh', wt, 'main'], root)
    const row = worktreeRow(root, wt)
    expect(row?.verdict).toBe('review')
    expect(row?.evidence.branchUsed).toBeNull()
  })

  test('one made from origin/main, tracking it, stays a review row too', () => {
    const { root, wt } = setup('tracking')
    git(['worktree', 'add', '-q', '--track', '-b', 'tracking', wt, 'origin/main'], root)
    expect(git(['rev-parse', '--abbrev-ref', 'tracking@{upstream}'], root)).toBe('origin/main')
    expect(worktreeRow(root, wt)?.verdict).toBe('review')
  })

  test('a fresh branch that only fast-forwarded on a pull stays a review row', () => {
    const { root, wt } = setup('pulled')
    git(['worktree', 'add', '-q', '--track', '-b', 'pulled', wt, 'origin/main'], root)
    commit(root, 'main moves on')
    git(['push', '-q', 'origin', 'main'], root)
    git(['pull', '-q', '--ff-only'], wt)
    expect(git(['reflog', 'show', '--format=%gs', 'refs/heads/pulled'], root)).toMatch(
      /^pull.*Fast-forward/m,
    )
    const row = worktreeRow(root, wt)
    expect(row?.verdict).toBe('review')
    expect(row?.evidence.branchUsed).toBeNull()
  })

  test('one tracking local main is not counted as pushed', () => {
    const { root, wt } = setup('local-track')
    git(['worktree', 'add', '-q', '--track', '-b', 'local-track', wt, 'main'], root)
    expect(git(['config', 'branch.local-track.remote'], root)).toBe('.')
    const row = worktreeRow(root, wt)
    expect(row?.verdict).toBe('review')
    expect(row?.evidence.branchUsed).toBeNull()
  })

  test('with no reflog, an upstream of its own is the sign', () => {
    const { root, wt } = setup('pushed')
    git(['worktree', 'add', '-q', '-b', 'pushed', wt], root)
    commit(wt, 'pushed')
    git(['push', '-q', '-u', 'origin', 'pushed'], wt)
    git(['merge', '-q', '--ff-only', 'pushed'], root)
    git(['push', '-q', 'origin', 'main'], root)
    rmSync(join(root, '.git', 'logs', 'refs', 'heads', 'pushed'), { force: true })
    const row = worktreeRow(root, wt)
    expect(row?.verdict).toBe('delete')
    expect(row?.evidence.branchUsed).toBe('upstream')
  })
})

describe('a lookup that fails costs its evidence, not the repository (#653, #655)', () => {
  let parent: string
  let checkout: string
  let featureSha: string
  const realGit = spawnRunner('git', { absolutePathOnly: true })

  /** Real git that counts its `ls-remote` calls and, when `fail` is set, fails them. */
  function lsRemoteGit(fail: boolean): { runner: CommandRunner; calls: () => number } {
    let calls = 0
    return {
      calls: () => calls,
      runner: {
        run(argv, opts) {
          if (argv.includes('ls-remote')) {
            calls += 1
            if (fail) return { exitCode: 128, stdout: '', stderr: 'fatal: unreachable\n' }
          }
          return realGit.run(argv, opts)
        },
      },
    }
  }

  /** A signed-in `gh` whose `pr list` fails as it does for a repository the account cannot see. */
  const unseeingGh: CommandRunner = {
    run(argv) {
      if (argv[0] === '--version' || argv[0] === 'auth') {
        return { exitCode: 0, stdout: '', stderr: '' }
      }
      return {
        exitCode: 1,
        stdout: '',
        stderr: "GraphQL: Could not resolve to a Repository with the name 'acme/gone'.\n",
      }
    },
  }

  beforeAll(() => {
    parent = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-lookups-')))
    const pair = makeOriginAndCheckout({ parent })
    checkout = pair.checkout.dir
    git(['branch', 'merged'], checkout)
    git(['push', '-q', 'origin', 'merged'], checkout)
    git(['checkout', '-q', '-b', 'feature'], checkout)
    featureSha = pair.checkout.commit('feature: work', { 'feature.txt': 'feature\n' })
    git(['push', '-q', 'origin', 'feature'], checkout)
    git(['checkout', '-q', '-b', 'live', 'main'], checkout)
    pair.checkout.commit('live: work', { 'live.txt': 'live\n' })
    git(['checkout', '-q', 'main'], checkout)
  }, HOOK_TIMEOUT_MS)

  afterAll(() => {
    rmSync(parent, { recursive: true, force: true })
  }, HOOK_TIMEOUT_MS)

  test('offline reads remote branches from the remote-tracking refs, never the remote', () => {
    const counted = lsRemoteGit(false)
    const before = git(['remote', 'get-url', 'origin'], checkout)
    git(['remote', 'set-url', 'origin', join(parent, 'gone.git')], checkout)
    try {
      const swept = sweepOne(checkout, {
        cwd: checkout,
        remote: true,
        offline: true,
        provider: 'none',
        git: counted.runner,
      })
      expect(swept.error).toBeNull()
      expect(swept.notes).toEqual([])
      expect(counted.calls()).toBe(0)
      const remotes = rowsOf(swept.rows, 'remote')
      expect(remotes.get('origin/feature')?.evidence.sha).toBe(featureSha)
      // The symbolic `origin/HEAD` is not a branch.
      expect([...remotes.keys()].sort()).toEqual(['origin/feature', 'origin/main', 'origin/merged'])
      expect(rowsOf(swept.rows, 'branch').get('merged')?.verdict).toBe('delete')
    } finally {
      git(['remote', 'set-url', 'origin', before], checkout)
    }
  })

  test('offline with --branch reads only that branch', () => {
    const swept = sweepOne(checkout, {
      cwd: checkout,
      remote: true,
      offline: true,
      provider: 'none',
      branch: 'feature',
    })
    expect(swept.rows.filter((r) => r.kind === 'remote').map((r) => r.name)).toEqual([
      'origin/feature',
    ])
  })

  test('a failed ls-remote after a fetch is a note on the rows, not an error', () => {
    const failing = lsRemoteGit(true)
    const swept = sweepOne(checkout, {
      cwd: checkout,
      remote: true,
      provider: 'none',
      git: failing.runner,
    })
    expect(swept.error).toBeNull()
    expect(swept.repo?.fetched).toBe(true)
    expect(failing.calls()).toBe(1)
    expect(swept.notes).toHaveLength(1)
    expect(swept.notes[0]).toContain('`git ls-remote origin` failed (fatal: unreachable)')
    const feature = rowsOf(swept.rows, 'remote').get('origin/feature')
    expect(feature?.evidence.sha).toBe(featureSha)
    expect(feature?.notes.at(-1)).toContain('`refs/remotes/origin/feature` on disk')
    expect(rowsOf(swept.rows, 'branch').get('merged')?.verdict).toBe('delete')
    expect(renderRepo(swept)).toContain('note: `git ls-remote origin` failed')
  })

  test('a pull request listing that fails leaves the rows on git evidence, with a note', () => {
    const swept = sweepOne(checkout, {
      cwd: checkout,
      remote: true,
      offline: true,
      provider: 'github',
      gh: unseeingGh,
    })
    expect(swept.error).toBeNull()
    expect(swept.repo?.provider?.listError).toContain('you cannot see it')
    expect(swept.notes).toHaveLength(1)
    expect(swept.notes[0]).toMatch(
      /^Listing PRs with `gh pr list` failed \(.*you cannot see it.*\); judged on git evidence alone\.$/,
    )
    const branches = rowsOf(swept.rows, 'branch')
    expect(branches.get('merged')?.verdict).toBe('delete')
    expect(branches.get('live')?.verdict).toBe('review')
    expect(branches.get('live')?.notes).toContainEqual(
      expect.stringMatching(/^No PR lookup: `gh pr list` failed \(/),
    )
    expect(rowsOf(swept.rows, 'remote').has('origin/feature')).toBe(true)
    expect(renderRepo(swept)).toContain('note: Listing PRs with `gh pr list` failed')
    expect(
      JSON.parse(
        renderJson(
          sweep([checkout], {
            cwd: checkout,
            remote: true,
            offline: true,
            provider: 'github',
            gh: unseeingGh,
          }),
        ),
      ).repos[0].notes,
    ).toEqual(swept.notes)
  })

  test('while the listing has failed, deleting a remote branch needs confirm-open-pr', () => {
    const swept = sweepOne(checkout, {
      cwd: checkout,
      remote: true,
      offline: true,
      provider: 'github',
      gh: unseeingGh,
    })
    const remotes = rowsOf(swept.rows, 'remote')
    const merged = remotes.get('origin/merged')
    expect(merged?.verdict).toBe('delete')
    expect(merged?.risks).toEqual(['confirm-open-pr'])
    expect(merged?.notes).toContainEqual(expect.stringMatching(/open PR is unknown/))
    expect(remotes.get('origin/feature')?.risks).toContain('confirm-open-pr')
    // A local branch delete leaves any PR alone.
    expect(rowsOf(swept.rows, 'branch').get('merged')?.risks).toEqual([])
    // The default branch is never deleted, so it carries nothing.
    expect(remotes.get('origin/main')?.risks).toEqual([])
  })

  test('a gh that is missing or signed out is named as the reason, not as no PR found', () => {
    const answering = (failing: string): CommandRunner => ({
      run(argv) {
        if (argv[0] === failing) return { exitCode: 1, stdout: '', stderr: 'no' }
        if (argv[0] === '--version' || argv[0] === 'auth') {
          return { exitCode: 0, stdout: '', stderr: '' }
        }
        return { exitCode: 0, stdout: '[]', stderr: '' }
      },
    })
    const liveNote = (gh: CommandRunner): string[] | undefined =>
      rowsOf(
        sweepOne(checkout, { cwd: checkout, remote: true, offline: true, provider: 'github', gh })
          .rows,
        'branch',
      ).get('live')?.notes
    expect(liveNote(answering('--version'))).toContain('No PR lookup (`gh` not installed).')
    expect(liveNote(answering('auth'))).toContain('No PR lookup (`gh` not signed in).')
    expect(liveNote(answering('none'))).toContain('No PR found via `gh pr list`.')
  })
})
