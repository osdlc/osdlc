/**
 * The sweep against a real repository on disk.
 *
 * Fixtures rather than mocks: the questions being asked — is this branch an
 * ancestor, does this worktree hold uncommitted work — are git's answers, and
 * a mock would only assert that we know what we already wrote down.
 *
 * `gh` is off except in the merged-PR evidence suite, which cans its answers.
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

import type { CommandRunner } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture, makeOriginAndCheckout } from '@osdlc/typed-git/testing'

import { cannedGh, commit, git } from './helpers.ts'
import { localDeleteCommand, remoteDeleteCommand } from '../src/branches.ts'
import { renderJson, renderRepo, renderScan, renderText } from '../src/render.ts'
import { resolveEntries } from '../src/resolve.ts'
import { sweepRepo, sweepRepos } from '../src/sweep.ts'
import type { RepoSweep, SweepItem } from '../src/types.ts'

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

function itemsOf(items: SweepItem[], category: string): Map<string, SweepItem> {
  return new Map(items.filter((item) => item.category === category).map((item) => [item.id, item]))
}

describe('sweepRepo', () => {
  test('discovers the repository and its default branch', () => {
    const sweep = sweepRepo(root, { noGh: true, cwd: root })
    expect(sweep.error).toBeNull()
    expect(sweep.repo?.mainBranch).toBe('main')
    expect(sweep.repo?.remote).toBeNull()
    expect(sweep.repo?.hasGh).toBe(false)
  })

  test('a branch merged into main is deletable on ancestry alone', () => {
    const sweep = sweepRepo(root, { noGh: true, cwd: root })
    const branch = itemsOf(sweep.items, 'local_branch').get('merged-branch')
    expect(branch?.classification).toBe('safe-to-delete')
    expect(branch?.reason).toBe('fully merged into main')
    const sha = git(['rev-parse', 'merged-branch'], root)
    expect(branch?.commands).toEqual([`git update-ref -d refs/heads/merged-branch ${sha}`])
    expect(branch?.facts['ancestor_of_remote_main']).toBe(true)
    // No remote, so the local default branch is the measure.
    expect(branch?.facts['compare_against']).toBe('main')
  })

  test('a diverged branch with no other signal is left for a person', () => {
    const sweep = sweepRepo(root, { noGh: true, cwd: root })
    const branch = itemsOf(sweep.items, 'local_branch').get('live-branch')
    expect(branch?.classification).toBe('needs-investigation')
    expect(branch?.commands).toEqual([])
    // Parts, not a sentence: a host appends its own before rendering.
    expect(branch!.investigationParts.length).toBeGreaterThan(1)
  })

  test('the default branch and branches held by a worktree are kept', () => {
    const sweep = sweepRepo(root, { noGh: true, cwd: root })
    const branches = itemsOf(sweep.items, 'local_branch')
    expect(branches.get('main')?.reason).toBe('default branch')
    expect(branches.get('wt-clean')?.reason).toBe(
      'checked out in a worktree (handle via that worktree)',
    )
  })

  test('a worktree with uncommitted work is never proposed for removal', () => {
    const sweep = sweepRepo(root, { noGh: true, cwd: root })
    const dirty = itemsOf(sweep.items, 'worktree').get(join(root, 'wt', 'dirty'))
    expect(dirty?.classification).toBe('needs-investigation')
    expect(dirty?.facts['dirty_files']).toBe(1)
    expect(dirty?.commands).toEqual([])
  })

  test("the caller's own worktree is kept", () => {
    const cwd = join(root, 'wt', 'clean')
    const sweep = sweepRepo(root, { noGh: true, cwd })
    expect(itemsOf(sweep.items, 'worktree').get(cwd)?.reason).toBe("current session's worktree")
  })

  test('a caller in a subdirectory whose name starts with `..` is still in its worktree', () => {
    const cwd = join(root, 'wt', 'clean', '..scratch')
    mkdirSync(cwd)
    const sweep = sweepRepo(root, { noGh: true, cwd })
    expect(itemsOf(sweep.items, 'worktree').get(join(root, 'wt', 'clean'))?.reason).toBe(
      "current session's worktree",
    )
  })

  test('a caller who reaches its worktree through a symlink is still in its worktree', () => {
    const link = join(root, 'link-to-clean')
    symlinkSync(join(root, 'wt', 'clean'), link)
    const sweep = sweepRepo(root, { noGh: true, cwd: link })
    expect(itemsOf(sweep.items, 'worktree').get(join(root, 'wt', 'clean'))?.reason).toBe(
      "current session's worktree",
    )
  })

  test('a caller in a sibling whose name extends the worktree name is not in the worktree', () => {
    const cwd = join(root, 'wt', 'clean-old')
    mkdirSync(cwd, { recursive: true })
    const sweep = sweepRepo(root, { noGh: true, cwd })
    expect(itemsOf(sweep.items, 'worktree').get(join(root, 'wt', 'clean'))?.reason).not.toBe(
      "current session's worktree",
    )
  })

  test('a caller who followed a symlink out of its worktree is not in the worktree', () => {
    const outside = join(root, 'outside-dir')
    mkdirSync(outside, { recursive: true })
    const link = join(root, 'wt', 'clean', 'escape-link')
    symlinkSync(outside, link)
    try {
      const sweep = sweepRepo(root, { noGh: true, cwd: link })
      expect(itemsOf(sweep.items, 'worktree').get(join(root, 'wt', 'clean'))?.reason).not.toBe(
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
    const sweep = sweepRepo(root, { noGh: true, cwd })
    expect(itemsOf(sweep.items, 'worktree').get(clean)?.reason).toBe("current session's worktree")
  })

  test('a caller whose cwd no longer exists, below a symlinked parent, is still placed', () => {
    const clean = join(root, 'wt', 'clean')
    const via = join(root, 'link-to-clean-2')
    symlinkSync(clean, via)
    const cwd = join(via, 'gone')
    const sweep = sweepRepo(root, { noGh: true, cwd })
    expect(itemsOf(sweep.items, 'worktree').get(clean)?.reason).toBe("current session's worktree")
  })

  test('a relative cwd that does not exist is placed against the process cwd', () => {
    const clean = join(root, 'wt', 'clean')
    const before = process.cwd()
    process.chdir(join(root, 'wt'))
    try {
      const sweep = sweepRepo(root, { noGh: true, cwd: join('clean', 'gone') })
      expect(itemsOf(sweep.items, 'worktree').get(clean)?.reason).toBe("current session's worktree")
    } finally {
      process.chdir(before)
    }
  })

  test('an empty cwd means the process cwd and pins that worktree', () => {
    const clean = join(root, 'wt', 'clean')
    const before = process.cwd()
    process.chdir(clean)
    try {
      const sweep = sweepRepo(root, { noGh: true, cwd: '' })
      expect(itemsOf(sweep.items, 'worktree').get(clean)?.reason).toBe("current session's worktree")
    } finally {
      process.chdir(before)
    }
  })

  test('each row names the authorizations its delete needs', () => {
    const sweep = sweepRepo(root, { noGh: true, cwd: root })
    const branches = itemsOf(sweep.items, 'local_branch')
    const worktrees = itemsOf(sweep.items, 'worktree')

    expect(branches.get('merged-branch')?.requires).toEqual([])
    const live = branches.get('live-branch')
    expect(live?.requires).toEqual(['abandon-unmerged'])
    expect(live?.facts['unique_commits']).toBe(1)

    expect(worktrees.get(join(root, 'wt', 'dirty'))?.requires).toEqual(['discard-changes'])
    const ahead = worktrees.get(join(root, 'wt', 'ahead'))
    expect(ahead?.requires).toEqual(['abandon-unmerged'])
    expect(ahead?.facts['unique_commits']).toBe(1)
    expect(worktrees.get(join(root, 'wt', 'clean'))?.requires).toEqual([])
  })

  test('rows kept for structure are not deletable', () => {
    const sweep = sweepRepo(root, { noGh: true, cwd: join(root, 'wt', 'clean') })
    const branches = itemsOf(sweep.items, 'local_branch')
    const worktrees = itemsOf(sweep.items, 'worktree')
    expect(branches.get('main')?.deletable).toBe(false)
    expect(branches.get('wt-clean')?.deletable).toBe(false)
    expect(worktrees.get(root)?.deletable).toBe(false)
    expect(worktrees.get(join(root, 'wt', 'clean'))?.deletable).toBe(false)
    expect(branches.get('live-branch')?.deletable).toBe(true)
    for (const item of sweep.items.filter((i) => !i.deletable)) expect(item.requires).toEqual([])
  })

  test('scope selects categories', () => {
    const sweep = sweepRepo(root, { noGh: true, cwd: root, scope: ['worktrees'] })
    expect(new Set(sweep.items.map((item) => item.category))).toEqual(new Set(['worktree']))
  })

  test('a path that is not a repository is an error row, not a throw', () => {
    const sweep = sweepRepo(container, { noGh: true, cwd: container })
    expect(sweep.error).toContain('not a git repository')
    expect(sweep.items).toEqual([])
  })

  test('the sweep mutates nothing', () => {
    const before = git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/'], root)
    const beforeStatus = git(['status', '--porcelain'], root)
    sweepRepo(root, { noGh: true, cwd: root })
    expect(git(['for-each-ref', '--format=%(refname) %(objectname)', 'refs/'], root)).toBe(before)
    expect(git(['status', '--porcelain'], root)).toBe(beforeStatus)
  })
})

describe('worktree blockers', () => {
  let parent: string
  let wt: (name: string) => string
  let sweep: RepoSweep
  let items: Map<string, SweepItem>
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
    sweep = sweepRepo(checkout, { cwd: checkout, gh })
    expect(sweep.error).toBeNull()
    items = itemsOf(sweep.items, 'worktree')
  }, HOOK_TIMEOUT_MS)

  afterAll(() => rmSync(parent, { recursive: true, force: true }), HOOK_TIMEOUT_MS)

  const blockersOf = (path: string) => items.get(path)?.facts['blockers']

  test('a locked worktree is held back, with its reason', () => {
    const locked = items.get(wt('locked'))
    expect(locked?.classification).toBe('needs-investigation')
    expect(locked?.facts['blockers']).toEqual(['locked-worktree'])
    expect(locked?.facts['lock_reason']).toBe('test')
    expect(locked?.reason).toBe('blocked: locked-worktree')
  })

  test('an edit hidden by skip-worktree is not reported clean', () => {
    const hidden = items.get(wt('hidden'))
    expect(hidden?.classification).toBe('needs-investigation')
    expect(hidden?.facts['dirty_files']).toBe(0)
    expect(hidden?.facts['blockers']).toEqual(['hidden-index-flags'])
    expect(hidden?.facts['hidden_index_flags']).toBe(1)
    expect(hidden?.facts['hidden_index_paths']).toEqual(['tracked.txt'])
  })

  test('a repository inside an ignored directory is found', () => {
    expect(blockersOf(wt('nested'))).toEqual(['nested-repository'])
    expect(items.get(wt('nested'))?.facts['nested_repositories']).toEqual(['ignored/'])
  })

  test('a branch checked out twice blocks both worktrees, each naming the other', () => {
    for (const [self, other] of [
      ['shared', 'shared-2'],
      ['shared-2', 'shared'],
    ] as const) {
      expect(blockersOf(wt(self))).toEqual(['branch-in-other-worktree'])
      expect(items.get(wt(self))?.facts['other_worktrees']).toEqual([wt(other)])
    }
  })

  test('a blocked row proposes no command and says what to do', () => {
    for (const name of ['locked', 'hidden', 'nested', 'shared', 'shared-2']) {
      const item = items.get(wt(name))
      expect(item?.commands).toEqual([])
      expect(item?.investigationParts.length).toBe(1)
    }
    expect(items.get(wt('locked'))?.investigationParts[0]).toContain('git worktree unlock')
  })

  test('a blocked row is not deletable', () => {
    for (const name of ['locked', 'hidden', 'nested', 'shared', 'shared-2', 'gone']) {
      expect(items.get(wt(name))?.deletable).toBe(false)
    }
  })

  test('a locked worktree with no directory is held back, not pruned', () => {
    const gone = items.get(wt('gone'))
    expect(gone?.facts['on_disk']).toBe(false)
    expect(gone?.facts['blockers']).toEqual(['locked-worktree'])
    expect(gone?.commands).toEqual([])
  })

  test('the text report prints what to do under a blocked row', () => {
    const text = renderRepo(sweep)
    expect(text).toContain('blocked: locked-worktree')
    expect(text).toContain(`git worktree unlock ${wt('locked')}`)
  })

  test('a branch-scoped sweep keeps the branch of a blocked worktree pinned', () => {
    for (const name of ['locked', 'shared']) {
      const scoped = sweepRepo(checkout, { cwd: checkout, gh, branch: `wt-${name}` })
      expect(scoped.error).toBeNull()
      const local = itemsOf(scoped.items, 'local_branch').get(`wt-${name}`)
      expect(local?.deletable).toBe(false)
      expect(local?.commands).toEqual([])
    }
    const shared = sweepRepo(checkout, { cwd: checkout, gh, branch: 'wt-shared' })
    for (const item of shared.items.filter((it) => it.category === 'worktree')) {
      expect(item.facts['blockers']).toEqual(['branch-in-other-worktree'])
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
    const result = sweepRepos([dupHome], { noGh: true, cwd: root, baseDir: root })
    expect(result.duplicates).toEqual([{ slug: 'acme/dup', roots: [first, second] }])
    expect(renderText(result).startsWith('Duplicate checkouts\n  acme/dup\n')).toBe(true)
    const json = JSON.parse(renderJson(result)) as { duplicates: unknown[] }
    expect(json.duplicates).toHaveLength(1)
  })

  test('a clone and its linked worktree are not duplicates', () => {
    const dir = clone('solo')
    git(['worktree', 'add', '-b', 'solo-wt', join(dir, 'wt'), 'main'], dir)
    const result = sweepRepos([dir, join(dir, 'wt')], { noGh: true, cwd: root, baseDir: root })
    expect(result.duplicates).toEqual([])
    expect(renderText(result)).not.toContain('Duplicate checkouts')
  })

  test('one owner/name on two hosts is not a duplicate', () => {
    const github = clone('host-github')
    const forge = clone('host-forge')
    git(['remote', 'set-url', 'origin', 'git@forge.example:acme/dup.git'], forge)
    const result = sweepRepos([github, forge], { noGh: true, cwd: root, baseDir: root })
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
    const result = sweepRepos([root, container, absent], { noGh: true, cwd: root, baseDir: root })
    const text = renderText(result)
    expect(text).toContain(root)
    expect(text).toContain(join(container, 'alpha'))
    expect(text).toContain('merged-branch')
    expect(text).toContain('requires abandon-unmerged (drops 1 commit)')
    expect(text).toContain('unresolved')
    expect(text).toMatch(
      /\d+ to delete, \d+ to review, across 3 repositories \(1 entry unresolved\)\./,
    )
    expect(text.endsWith('\n')).toBe(true)
  })

  test('the search is summarised when there was one, and silent when there was not', () => {
    const searched = sweepRepos([container], { noGh: true, cwd: root, baseDir: root })
    expect(renderScan(searched)).toMatch(
      /^searched 1 entry: \d+ directories read, \d+ checkouts found\./,
    )
    expect(renderText(searched)).toContain('searched 1 entry:')

    const direct = sweepRepos([root], { noGh: true, cwd: root, baseDir: root })
    expect(renderScan(direct)).toBeNull()
    expect(renderText(direct)).not.toContain('searched')
  })

  test('safe-to-keep rows are hidden unless asked for', () => {
    const result = sweepRepos([root], { noGh: true, cwd: root, baseDir: root })
    expect(renderText(result)).not.toContain('default branch')
    expect(renderText(result, { keep: true })).toContain('default branch')
  })

  test('json carries the facts and joins the investigation parts', () => {
    const result = sweepRepos([root], { noGh: true, cwd: root, baseDir: root })
    const parsed = JSON.parse(renderJson(result)) as {
      repos: Array<{
        items: Array<{
          id: string
          facts: Record<string, unknown>
          investigation_prompt: string | null
        }>
      }>
      summary: Record<string, number>
    }
    const live = parsed.repos[0]!.items.find((item) => item.id === 'live-branch')!
    expect(live.facts['ancestor_of_remote_main']).toBe(false)
    expect(typeof live.investigation_prompt).toBe('string')
    expect(parsed.summary['safe-to-delete']).toBeGreaterThan(0)
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
    const sweep = sweepRepo(checkout.dir, { noGh: true, cwd: checkout.dir })
    const branch = itemsOf(sweep.items, 'local_branch').get('unpushed')
    expect(branch?.classification).toBe('needs-investigation')
    expect(branch?.facts['ancestor_of_remote_main']).toBe(false)
    expect(branch?.facts['compare_against']).toBe('origin/main')
  })

  test('a branch reachable from origin/main is deletable', () => {
    const { origin, checkout } = makeOriginAndCheckout({ parent })
    // The origin is not bare; detach it so a push to its `main` is accepted.
    git(['checkout', '-q', '--detach'], origin.dir)
    branchOff(checkout.dir, 'pushed')
    git(['merge', '-q', '--no-ff', '-m', 'Merge pushed', 'pushed'], checkout.dir)
    git(['push', '-q', 'origin', 'main'], checkout.dir)
    const sweep = sweepRepo(checkout.dir, { noGh: true, cwd: checkout.dir })
    const branch = itemsOf(sweep.items, 'local_branch').get('pushed')
    expect(branch?.classification).toBe('safe-to-delete')
    expect(branch?.reason).toBe('fully merged into origin/main')
    expect(branch?.facts['compare_against']).toBe('origin/main')
  })

  test('a missing remote default branch leaves ancestry unknown', () => {
    const { checkout } = makeOriginAndCheckout({ parent })
    branchOff(checkout.dir, 'orphaned')
    git(['update-ref', '-d', 'refs/remotes/origin/main'], checkout.dir)
    const sweep = sweepRepo(checkout.dir, { noGh: true, cwd: checkout.dir })
    const branch = itemsOf(sweep.items, 'local_branch').get('orphaned')
    expect(branch?.classification).toBe('needs-investigation')
    expect(branch?.facts['ancestor_of_remote_main']).toBeNull()
    expect(branch?.investigationParts[0]).toContain('was not found')
  })

  test('a slashed default branch name is read whole', () => {
    const { checkout } = makeOriginAndCheckout({ parent })
    git(['push', '-q', 'origin', 'main:release/v2'], checkout.dir)
    git(['fetch', '-q', 'origin'], checkout.dir)
    git(
      ['symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/release/v2'],
      checkout.dir,
    )
    const sweep = sweepRepo(checkout.dir, { noGh: true, cwd: checkout.dir })
    expect(sweep.error).toBeNull()
    expect(sweep.repo?.mainBranch).toBe('release/v2')
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
  let items: SweepItem[]
  let gh: CommandRunner
  let landedWorktree: string

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
    const sweep = sweepRepo(checkout, { cwd: checkout, gh })
    expect(sweep.error).toBeNull()
    items = sweep.items
  }, HOOK_TIMEOUT_MS)

  afterAll(() => rmSync(parent, { recursive: true, force: true }), HOOK_TIMEOUT_MS)

  const pr = (item: SweepItem | undefined) => item?.facts['pr'] as Record<string, unknown>

  test('a same-repo PR into the default branch at the exact tip is landing proof', () => {
    const landed = itemsOf(items, 'local_branch').get('landed')
    expect(landed?.classification).toBe('safe-to-delete')
    const sha = git(['rev-parse', 'landed'], checkout)
    expect(landed?.commands).toEqual([`git update-ref -d refs/heads/landed ${sha}`])
    expect(pr(landed)['evidence']).toBe('exact-head')
  })

  test('a commit added after the merge leaves the branch for a person', () => {
    const moved = itemsOf(items, 'local_branch').get('moved')
    expect(moved?.classification).toBe('needs-investigation')
    expect(pr(moved)['evidence']).toBe('head-moved')
    expect(moved?.investigationParts.join(' ')).toContain('head-moved')
  })

  test('a fork PR sharing the branch name is not evidence either way', () => {
    const branches = itemsOf(items, 'local_branch')
    expect(branches.get('forked')?.classification).toBe('needs-investigation')
    expect(branches.get('forked')?.facts['pr']).toBeUndefined()
    expect(branches.get('fork-open')?.classification).toBe('needs-investigation')
  })

  test('a PR merged into another base is not landing proof', () => {
    const other = itemsOf(items, 'local_branch').get('other-base')
    expect(other?.classification).toBe('needs-investigation')
    expect(pr(other)['evidence']).toBe('other-base')
  })

  test('local-branch facts carry the full sha', () => {
    for (const item of items.filter((i) => i.category === 'local_branch')) {
      expect(item.facts['sha']).toMatch(/^[0-9a-f]{40}$/)
    }
  })

  test('remote branches judge the PR head against the ls-remote sha', () => {
    const remotes = itemsOf(items, 'remote_branch')
    const landed = remotes.get('origin/landed')
    expect(landed?.classification).toBe('safe-to-delete')
    const sha = git(['rev-parse', 'landed'], checkout)
    expect(landed?.commands).toEqual([
      `git push --force-with-lease=refs/heads/landed:${sha} origin :refs/heads/landed`,
    ])
    const moved = remotes.get('origin/moved')
    expect(moved?.classification).toBe('needs-investigation')
    expect(pr(moved)['evidence']).toBe('head-moved')
  })

  test('a clean worktree whose PR head is not its HEAD is left for a person', () => {
    const wt = itemsOf(items, 'worktree').get(join(checkout, 'wt', 'moved'))
    expect(wt?.classification).toBe('needs-investigation')
    expect(pr(wt)['evidence']).toBe('head-moved')
  })

  test('a worktree whose PR merged at HEAD needs nothing, though it is ahead of main', () => {
    const wt = itemsOf(items, 'worktree').get(landedWorktree)
    expect(wt?.facts['unpushed_commits']).toBeGreaterThan(0)
    expect(wt?.classification).toBe('safe-to-delete')
    expect(wt?.requires).toEqual([])
  })

  test('a branch-scoped sweep reports that branch alone, from inside its worktree', () => {
    const sweep = sweepRepo(checkout, { cwd: landedWorktree, gh, branch: 'wt-landed' })
    expect(sweep.error).toBeNull()
    expect(sweep.items.map((item) => [item.category, item.id])).toEqual([
      ['worktree', landedWorktree],
      ['local_branch', 'wt-landed'],
    ])
    for (const item of sweep.items) {
      expect(item.deletable).toBe(true)
      expect(item.classification).toBe('safe-to-delete')
      expect(item.requires).toEqual([])
    }
  })

  test('a branch-scoped sweep matches the name exactly and covers the remote', () => {
    const sweep = sweepRepo(checkout, { cwd: checkout, gh, branch: 'open' })
    expect(sweep.items.map((item) => item.id)).toEqual(['open', 'origin/open'])
  })

  test('a branch-scoped sweep refuses the default branch', () => {
    const sweep = sweepRepo(checkout, { cwd: checkout, gh, branch: 'main' })
    expect(sweep.items).toEqual([])
    expect(sweep.error).toContain('default branch')
  })

  test('a branch with an open PR needs confirm-open-pr', () => {
    expect(itemsOf(items, 'local_branch').get('open')?.requires).toEqual([
      'abandon-unmerged',
      'confirm-open-pr',
    ])
    const remote = itemsOf(items, 'remote_branch').get('origin/open')
    expect(remote?.requires).toEqual(['abandon-unmerged', 'confirm-open-pr'])
    expect(remote?.facts['unique_commits']).toBe(
      Number(git(['rev-list', '--count', 'origin/main..open'], checkout)),
    )
    // An exact-head merged PR needs nothing, though the tip is not an ancestor.
    expect(itemsOf(items, 'remote_branch').get('origin/landed')?.requires).toEqual([])
    expect(itemsOf(items, 'remote_branch').get('origin/main')?.deletable).toBe(false)
  })

  // Moves `landed`, so it runs last.
  test('a proposed delete refuses a branch that moved after the sweep', () => {
    const client = new Git(checkout, { env: { ...IDENTITY } })
    const run = (command: string) => client.raw(command.split(' ').slice(1)).exitCode
    const local = itemsOf(items, 'local_branch').get('landed')!.commands[0]!
    const remote = itemsOf(items, 'remote_branch').get('origin/landed')!.commands[0]!

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

  function remoteFeature(sweep: ReturnType<typeof sweepRepo>): SweepItem | undefined {
    return itemsOf(sweep.items, 'remote_branch').get('origin/feature')
  }

  test(
    'a branch merged on the remote after the last fetch reads merged only when fetched',
    () => {
      const stale = clone('stale')
      git(['merge', '--no-ff', '-m', 'Merge feature', 'feature'], upstream)

      const unfetched = sweepRepo(stale, { noGh: true, cwd: stale })
      expect(unfetched.repo?.fetched).toBe(false)
      expect(remoteFeature(unfetched)?.classification).toBe('needs-investigation')
      expect(renderRepo(unfetched)).toContain('not fetched')

      const fetched = sweepRepo(stale, { noGh: true, cwd: stale, fetch: true })
      expect(fetched.error).toBeNull()
      expect(fetched.repo?.fetched).toBe(true)
      expect(remoteFeature(fetched)?.classification).toBe('safe-to-delete')
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

      const result = sweepRepos([broken, healthy], { noGh: true, cwd: base, fetch: true })
      const [bad, good] = result.repos
      expect(bad?.error?.startsWith('fetch failed:')).toBe(true)
      expect(bad?.items).toEqual([])
      expect(good?.error).toBeNull()
      expect(good?.repo?.fetched).toBe(true)
      expect(good!.items.length).toBeGreaterThan(0)
    },
    HOOK_TIMEOUT_MS,
  )

  test('a repository with no remote is swept without a fetch', () => {
    const sweep = sweepRepo(root, { noGh: true, cwd: root, fetch: true })
    expect(sweep.error).toBeNull()
    expect(sweep.repo?.fetched).toBe(false)
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
  const worktreeRow = (root: string, wt: string): SweepItem | undefined =>
    itemsOf(sweepRepo(root, { noGh: true, cwd: root }).items, 'worktree').get(realpathSync(wt))

  test('a worked-on branch fast-forwarded into main leaves a deletable worktree', () => {
    // The issue's reproduction: a commit on topic, pushed, main fast-forwarded to it.
    const { root, wt } = setup('topic')
    git(['worktree', 'add', '-q', '-b', 'topic', wt], root)
    commit(wt, 'topic')
    git(['push', '-q', '-u', 'origin', 'topic'], wt)
    git(['merge', '-q', '--ff-only', 'topic'], root)
    git(['push', '-q', 'origin', 'main'], root)
    const row = worktreeRow(root, wt)
    expect(row?.classification).toBe('safe-to-delete')
    expect(row?.facts['branch_used']).toBe('commits')
    expect(row?.reason).toBe(
      'clean; merged into origin/main, and the branch has commits made on it',
    )
  })

  test('a worktree just made from main stays a review row', () => {
    const { root, wt } = setup('fresh')
    git(['worktree', 'add', '-q', '-b', 'fresh', wt, 'main'], root)
    const row = worktreeRow(root, wt)
    expect(row?.classification).toBe('needs-investigation')
    expect(row?.facts['branch_used']).toBeNull()
  })

  test('one made from origin/main, tracking it, stays a review row too', () => {
    const { root, wt } = setup('tracking')
    git(['worktree', 'add', '-q', '--track', '-b', 'tracking', wt, 'origin/main'], root)
    expect(git(['rev-parse', '--abbrev-ref', 'tracking@{upstream}'], root)).toBe('origin/main')
    expect(worktreeRow(root, wt)?.classification).toBe('needs-investigation')
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
    expect(row?.classification).toBe('safe-to-delete')
    expect(row?.facts['branch_used']).toBe('upstream')
  })
})
