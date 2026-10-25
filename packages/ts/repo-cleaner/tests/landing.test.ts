/**
 * Patch equivalence against real repositories: one fixture per merge style,
 * and the cases that must stay unlanded. Everything runs on disk in temp
 * directories; the only fakes are runners that make a git call fail, print
 * nothing or print garbage, to show the check fails closed.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeOriginAndCheckout } from '@osdlc/typed-git/testing'

import { assessLanding, patchEquivalent } from '../src/landing.ts'
import { sweepRepo } from '../src/sweep.ts'
import type { RepoInfo, SweepItem } from '../src/types.ts'
import { cannedGh, commitFile, git, newRepo, sh } from './helpers.ts'

const HOOK_TIMEOUT_MS = 60_000

const roots: string[] = []
const fresh = (prefix: string): string => {
  const dir = newRepo(prefix)
  roots.push(dir)
  return dir
}

afterAll(() => {
  for (const dir of roots) rmSync(dir, { recursive: true, force: true })
}, HOOK_TIMEOUT_MS)

/** Branch `name` off `main` with one commit per `[file, content]`; returns the shas, oldest first. */
function branchOff(dir: string, name: string, files: Array<[string, string]>): string[] {
  sh(dir, ['checkout', '-q', '-b', name, 'main'])
  const shas = files.map(([file, content]) => commitFile(dir, file, content, `${name}: ${file}`))
  sh(dir, ['checkout', '-q', 'main'])
  return shas
}

/** Squash-merge `branch` into main as one commit. */
function squashMerge(dir: string, branch: string, message = `squash ${branch}`): void {
  sh(dir, ['checkout', '-q', 'main'])
  sh(dir, ['merge', '--squash', branch])
  sh(dir, ['commit', '-q', '-m', message])
}

/** Replay `branch` onto main with a rebase, fast-forward main to it, and drop the copy. */
function rebaseMerge(dir: string, branch: string): void {
  sh(dir, ['checkout', '-q', '-b', `${branch}-copy`, branch])
  sh(dir, ['rebase', '-q', 'main'])
  sh(dir, ['checkout', '-q', 'main'])
  sh(dir, ['merge', '-q', '--ff-only', `${branch}-copy`])
  sh(dir, ['branch', '-q', '-D', `${branch}-copy`])
}

const sweep = (dir: string, opts: Parameters<typeof sweepRepo>[1] = {}) =>
  sweepRepo(dir, { noGh: true, cwd: dir, ...opts })

function row(items: SweepItem[], category: string, id: string): SweepItem {
  const found = items.find((item) => item.category === category && item.id === id)
  if (found === undefined) throw new Error(`no ${category} row ${id}`)
  return found
}

const branchRow = (dir: string, name: string, opts?: Parameters<typeof sweepRepo>[1]) =>
  row(sweep(dir, opts).items, 'local_branch', name)

/** The repository facts a landing check takes, read from a real sweep. */
function repoInfo(dir: string): RepoInfo {
  const info = sweep(dir).repo
  if (info === null) throw new Error('not a repository')
  return info
}

/** A runner that answers some argv itself and runs the rest for real. */
function interposedRunner(answer: (argv: string[]) => CommandResult | undefined): CommandRunner {
  const real = spawnRunner('git', { absolutePathOnly: true })
  return {
    run(argv, opts) {
      return answer(argv) ?? real.run(argv, opts)
    },
  }
}

/** A client over {@link interposedRunner}. */
function interposed(dir: string, answer: (argv: string[]) => CommandResult | undefined): Git {
  return new Git(dir, { runner: interposedRunner(answer), env: { ...IDENTITY } })
}

const failure = (stderr = 'fatal: boom'): CommandResult => ({ exitCode: 128, stdout: '', stderr })
const printed = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const is = (argv: string[], verb: string): boolean => argv.includes(verb)

describe('merge styles', () => {
  test('a merge commit settles on ancestry and records no patch evidence', () => {
    const dir = fresh('landing-merge')
    branchOff(dir, 'feat', [['a.txt', 'a\n']])
    sh(dir, ['merge', '-q', '--no-ff', '-m', 'merge feat', 'feat'])
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('safe-to-delete')
    expect(item.reason).toBe('fully merged into main')
    expect(item.facts['landing']).toBeUndefined()
  })

  test('a rebase merge counts as landed, commit by commit', () => {
    const dir = fresh('landing-rebase')
    branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
      ['c.txt', 'c\n'],
    ])
    commitFile(dir, 'main.txt', 'main moved on\n', 'main: moves on')
    rebaseMerge(dir, 'feat')
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('safe-to-delete')
    expect(item.facts['landing']).toBe('patch-equivalent')
    expect(item.facts['landing_check']).toBe('per-commit')
    expect(item.facts['ancestor_of_remote_main']).toBe(false)
    expect(item.commands).toEqual([expect.stringContaining('update-ref -d refs/heads/feat')])
  })

  test('cherry-picked commits count as landed', () => {
    const dir = fresh('landing-pick')
    const shas = branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
    ])
    commitFile(dir, 'main.txt', 'main moved on\n', 'main: moves on')
    for (const sha of shas) sh(dir, ['cherry-pick', sha])
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('safe-to-delete')
    expect(item.facts['landing_check']).toBe('per-commit')
  })

  test('a squash merge of three commits counts as landed with no PR data', () => {
    const dir = fresh('landing-squash')
    branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
      ['c.txt', 'c\n'],
    ])
    commitFile(dir, 'main.txt', 'main moved on\n', 'main: moves on')
    squashMerge(dir, 'feat')
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('safe-to-delete')
    expect(item.reason).toContain('patch-equivalent')
    expect(item.facts['landing']).toBe('patch-equivalent')
    expect(item.facts['landing_check']).toBe('squashed')
    expect(item.facts['pr']).toBeUndefined()
  })

  test('a squash merge is found after main has moved well past it', () => {
    const dir = fresh('landing-squash-later')
    branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
    ])
    squashMerge(dir, 'feat')
    commitFile(dir, 'later-1.txt', '1\n', 'main: later 1')
    commitFile(dir, 'later-2.txt', '2\n', 'main: later 2')
    expect(branchRow(dir, 'feat').facts['landing_check']).toBe('squashed')
  })

  test('a squash merge of a branch that merged main in is found', () => {
    const dir = fresh('landing-squash-merged-main')
    branchOff(dir, 'feat', [['a.txt', 'a\n']])
    commitFile(dir, 'main.txt', 'main moved on\n', 'main: moves on')
    sh(dir, ['checkout', '-q', 'feat'])
    sh(dir, ['merge', '-q', '--no-ff', '-m', 'merge main into feat', 'main'])
    commitFile(dir, 'b.txt', 'b\n', 'feat: b')
    sh(dir, ['checkout', '-q', 'main'])
    squashMerge(dir, 'feat')
    expect(branchRow(dir, 'feat').facts['landing_check']).toBe('squashed')
  })
})

describe('what stays unlanded', () => {
  test('a branch with an extra commit that is not on main is not landed', () => {
    const dir = fresh('landing-extra')
    branchOff(dir, 'feat', [['a.txt', 'a\n']])
    squashMerge(dir, 'feat')
    sh(dir, ['checkout', '-q', 'feat'])
    commitFile(dir, 'extra.txt', 'extra\n', 'feat: extra work')
    sh(dir, ['checkout', '-q', 'main'])
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['landing']).toBeUndefined()
  })

  test('a rebase merge missing its last commit is not landed, and the commit is named', () => {
    const dir = fresh('landing-partial')
    const shas = branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
      ['c.txt', 'c\n'],
    ])
    commitFile(dir, 'main.txt', 'main moved on\n', 'main: moves on')
    sh(dir, ['cherry-pick', shas[0]!])
    sh(dir, ['cherry-pick', shas[1]!])
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['landing']).toBeUndefined()
    expect(item.facts['unmatched_commits']).toEqual([expect.stringContaining('feat: c.txt')])
    expect(item.investigationParts.join(' ')).toContain('feat: c.txt')
  })

  test('a plain diverged branch lists no unmatched commits', () => {
    const dir = fresh('landing-diverged')
    branchOff(dir, 'feat', [['a.txt', 'a\n']])
    commitFile(dir, 'main.txt', 'main moved on\n', 'main: moves on')
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['unmatched_commits']).toBeUndefined()
  })

  test('a squash merge edited during conflict resolution is not landed', () => {
    const dir = fresh('landing-edited')
    branchOff(dir, 'feat', [['a.txt', 'a\n']])
    sh(dir, ['checkout', '-q', 'main'])
    sh(dir, ['merge', '--squash', 'feat'])
    commitFile(dir, 'a.txt', 'a, edited by hand\n', 'squash feat, with an edit')
    expect(branchRow(dir, 'feat').classification).toBe('needs-investigation')
  })

  test('a branch whose changes cancel out matches nothing', () => {
    const dir = fresh('landing-cancel')
    sh(dir, ['checkout', '-q', '-b', 'feat', 'main'])
    commitFile(dir, 'a.txt', 'a\n', 'feat: add')
    sh(dir, ['rm', '-q', 'a.txt'])
    sh(dir, ['commit', '-q', '-m', 'feat: remove'])
    sh(dir, ['checkout', '-q', 'main'])
    // Main holds an empty commit and an unrelated one: neither is a match for
    // the empty combined change.
    sh(dir, ['commit', '-q', '--allow-empty', '-m', 'main: empty'])
    commitFile(dir, 'other.txt', 'other\n', 'main: other')
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['landing']).toBeUndefined()
  })

  test('a branch of one empty commit is not landed', () => {
    const dir = fresh('landing-empty')
    sh(dir, ['checkout', '-q', '-b', 'feat', 'main'])
    sh(dir, ['commit', '-q', '--allow-empty', '-m', 'feat: nothing'])
    sh(dir, ['checkout', '-q', 'main'])
    sh(dir, ['commit', '-q', '--allow-empty', '-m', 'main: nothing too'])
    commitFile(dir, 'other.txt', 'other\n', 'main: other')
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['landing']).toBeUndefined()
  })

  test('an empty commit never counts by itself, so only the combined change decides', () => {
    const dir = fresh('landing-empty-among')
    sh(dir, ['checkout', '-q', '-b', 'feat', 'main'])
    const a = commitFile(dir, 'a.txt', 'a\n', 'feat: a')
    sh(dir, ['commit', '-q', '--allow-empty', '-m', 'feat: empty'])
    sh(dir, ['checkout', '-q', 'main'])
    commitFile(dir, 'main.txt', 'main moved on\n', 'main: moves on')
    sh(dir, ['commit', '-q', '--allow-empty', '-m', 'main: empty too'])
    sh(dir, ['cherry-pick', a])
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('safe-to-delete')
    expect(item.facts['landing_check']).toBe('squashed')
  })

  test('a merge commit that carries a change of its own is not skipped', () => {
    const dir = fresh('landing-merge-commit')
    const [a] = branchOff(dir, 'feat', [['a.txt', 'a\n']])
    const [side] = branchOff(dir, 'side', [['side.txt', 'side\n']])
    sh(dir, ['checkout', '-q', 'feat'])
    sh(dir, ['merge', '-q', '--no-ff', '--no-commit', 'side'])
    writeFileSync(join(dir, 'evil.txt'), 'only in the merge\n')
    sh(dir, ['add', '-A'])
    sh(dir, ['commit', '-q', '-m', 'merge side, plus a change'])
    sh(dir, ['checkout', '-q', 'main'])
    commitFile(dir, 'main.txt', 'main moved on\n', 'main: moves on')
    // `git cherry` leaves merge commits out, so every commit it does list is
    // on main. The merge's own change is not.
    sh(dir, ['cherry-pick', a!])
    sh(dir, ['cherry-pick', side!])
    const item = branchRow(dir, 'feat')
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['landing']).toBeUndefined()
  })

  test('unrelated histories are not landed', () => {
    const dir = fresh('landing-unrelated')
    sh(dir, ['checkout', '-q', '--orphan', 'stray'])
    commitFile(dir, 'stray.txt', 'stray\n', 'stray: one')
    commitFile(dir, 'stray2.txt', 'stray2\n', 'stray: two')
    sh(dir, ['checkout', '-q', 'main'])
    expect(branchRow(dir, 'stray').classification).toBe('needs-investigation')
  })
})

describe('merged PR at an earlier head', () => {
  const prFor = (dir: string, head: string) => ({
    gh: cannedGh([{ number: 7, state: 'MERGED', headRefName: 'feat', headRefOid: head }]),
  })

  test('a squash merge at the PR head, then a commit that was cherry-picked, is landed', () => {
    const dir = fresh('landing-moved')
    const first = branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
    ]).at(-1)
    squashMerge(dir, 'feat')
    sh(dir, ['checkout', '-q', 'feat'])
    const later = commitFile(dir, 'later.txt', 'later\n', 'feat: after the merge')
    sh(dir, ['checkout', '-q', 'main'])
    sh(dir, ['cherry-pick', later])
    const item = branchRow(dir, 'feat', { noGh: false, ...prFor(dir, first!) })
    expect(item.classification).toBe('safe-to-delete')
    expect(item.facts['landing_check']).toBe('head-moved')
    expect((item.facts['pr'] as Record<string, unknown>)['evidence']).toBe('head-moved')
  })

  test('the same branch with a commit that is not on main stays, and names that commit', () => {
    const dir = fresh('landing-moved-extra')
    const first = branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
    ]).at(-1)
    squashMerge(dir, 'feat')
    sh(dir, ['checkout', '-q', 'feat'])
    commitFile(dir, 'later.txt', 'later\n', 'feat: after the merge')
    sh(dir, ['checkout', '-q', 'main'])
    const item = branchRow(dir, 'feat', { noGh: false, ...prFor(dir, first!) })
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['landing']).toBeUndefined()
    expect(item.facts['unmatched_commits']).toEqual([
      expect.stringContaining('feat: after the merge'),
    ])
    expect(item.investigationParts.join(' ')).toContain('feat: after the merge')
  })

  test('a PR head that was never squash-merged does not lend its trust', () => {
    const dir = fresh('landing-moved-unmerged')
    const first = branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
    ]).at(-1)
    sh(dir, ['checkout', '-q', 'feat'])
    const later = commitFile(dir, 'later.txt', 'later\n', 'feat: after')
    sh(dir, ['checkout', '-q', 'main'])
    commitFile(dir, 'main.txt', 'main moved on\n', 'main: moves on')
    sh(dir, ['cherry-pick', later])
    const item = branchRow(dir, 'feat', { noGh: false, ...prFor(dir, first!) })
    expect(item.classification).toBe('needs-investigation')
  })

  test('a PR head that is not in this clone does not count', () => {
    const dir = fresh('landing-moved-missing')
    branchOff(dir, 'feat', [['a.txt', 'a\n']])
    squashMerge(dir, 'feat')
    sh(dir, ['checkout', '-q', 'feat'])
    commitFile(dir, 'later.txt', 'later\n', 'feat: after')
    sh(dir, ['checkout', '-q', 'main'])
    const item = branchRow(dir, 'feat', {
      noGh: false,
      ...prFor(dir, 'f'.repeat(40)),
    })
    expect(item.classification).toBe('needs-investigation')
  })
})

describe('worktrees and remote branches', () => {
  test('a clean worktree on a squash-merged branch is removable', () => {
    const dir = fresh('landing-wt')
    branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
    ])
    const wt = join(dir, 'wt', 'feat')
    sh(dir, ['worktree', 'add', '-q', wt, 'feat'])
    squashMerge(dir, 'feat')
    const item = row(sweep(dir).items, 'worktree', wt)
    expect(item.classification).toBe('safe-to-delete')
    expect(item.facts['landing_check']).toBe('squashed')
    expect(item.facts['unpushed_commits']).toBe(2)
  })

  test('a dirty worktree on a squash-merged branch is still held back', () => {
    const dir = fresh('landing-wt-dirty')
    branchOff(dir, 'feat', [['a.txt', 'a\n']])
    const wt = join(dir, 'wt', 'feat')
    sh(dir, ['worktree', 'add', '-q', wt, 'feat'])
    squashMerge(dir, 'feat')
    writeFileSync(join(wt, 'scratch.txt'), 'uncommitted\n')
    const item = row(sweep(dir).items, 'worktree', wt)
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['dirty_files']).toBe(1)
  })

  test('a worktree with an unlanded commit is held back', () => {
    const dir = fresh('landing-wt-ahead')
    branchOff(dir, 'feat', [['a.txt', 'a\n']])
    const wt = join(dir, 'wt', 'feat')
    sh(dir, ['worktree', 'add', '-q', wt, 'feat'])
    squashMerge(dir, 'feat')
    commitFile(wt, 'extra.txt', 'extra\n', 'feat: extra')
    const item = row(sweep(dir).items, 'worktree', wt)
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['landing']).toBeUndefined()
  })

  describe('with a remote', () => {
    let parent: string
    beforeAll(() => {
      parent = realpathSync(mkdtempSync(join(tmpdir(), 'landing-remote-')))
    })
    afterAll(() => rmSync(parent, { recursive: true, force: true }), HOOK_TIMEOUT_MS)

    test('local and remote copies of a squash-merged branch are both landed', () => {
      const { origin, checkout } = makeOriginAndCheckout({ parent })
      git(['checkout', '-q', '--detach'], origin.dir)
      const dir = checkout.dir
      sh(dir, ['checkout', '-q', '-b', 'feat', 'main'])
      commitFile(dir, 'a.txt', 'a\n', 'feat: a')
      commitFile(dir, 'b.txt', 'b\n', 'feat: b')
      sh(dir, ['push', '-q', 'origin', 'feat'])
      sh(dir, ['checkout', '-q', 'main'])
      squashMerge(dir, 'feat')
      sh(dir, ['push', '-q', 'origin', 'main'])
      const items = sweep(dir).items
      const local = row(items, 'local_branch', 'feat')
      const remote = row(items, 'remote_branch', 'origin/feat')
      expect(local.classification).toBe('safe-to-delete')
      expect(local.reason).toContain('origin/main')
      expect(remote.classification).toBe('safe-to-delete')
      expect(remote.facts['landing_check']).toBe('squashed')
    })

    test('work merged only into an unpushed local main is not landed', () => {
      const { checkout } = makeOriginAndCheckout({ parent })
      const dir = checkout.dir
      sh(dir, ['checkout', '-q', '-b', 'feat', 'main'])
      commitFile(dir, 'a.txt', 'a\n', 'feat: a')
      sh(dir, ['checkout', '-q', 'main'])
      squashMerge(dir, 'feat')
      expect(branchRow(dir, 'feat').classification).toBe('needs-investigation')
    })

    test('a shallow clone is not trusted', () => {
      const { origin } = makeOriginAndCheckout({ parent })
      git(['checkout', '-q', '--detach'], origin.dir)
      const o = origin.dir
      sh(o, ['checkout', '-q', '-b', 'feat', 'main'])
      commitFile(o, 'a.txt', 'a\n', 'feat: a')
      sh(o, ['checkout', '-q', 'main'])
      squashMerge(o, 'feat')
      const shallow = join(parent, 'shallow')
      sh(parent, ['clone', '-q', '--depth', '1', '--no-single-branch', `file://${o}`, shallow])
      sh(shallow, ['checkout', '-q', '-b', 'feat', 'origin/feat'])
      sh(shallow, ['checkout', '-q', 'main'])
      expect(sh(shallow, ['rev-parse', '--is-shallow-repository'])).toBe('true')
      expect(branchRow(shallow, 'feat').classification).toBe('needs-investigation')
      expect(patchEquivalent(repoInfo(shallow), 'feat', new Git(shallow))).toBeNull()
    })
  })
})

describe('the check changes nothing', () => {
  const snapshot = (dir: string) => ({
    refs: sh(dir, ['for-each-ref']),
    status: sh(dir, ['status', '--porcelain=v2', '--branch']),
    head: sh(dir, ['rev-parse', 'HEAD']),
    index: sh(dir, ['ls-files', '--stage']),
  })

  test('a failing check writes no ref and leaves status, index and HEAD as they were', () => {
    const dir = fresh('landing-readonly')
    branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
    ])
    squashMerge(dir, 'feat')
    sh(dir, ['checkout', '-q', 'feat'])
    commitFile(dir, 'c.txt', 'c\n', 'feat: c')
    sh(dir, ['checkout', '-q', 'main'])
    writeFileSync(join(dir, 'untracked.txt'), 'u\n')
    writeFileSync(join(dir, 'staged.txt'), 's\n')
    sh(dir, ['add', 'staged.txt'])
    const before = snapshot(dir)
    expect(patchEquivalent(repoInfo(dir), 'feat', new Git(dir))).toBeNull()
    expect(snapshot(dir)).toEqual(before)
  })

  test('a passing squash check writes no ref either', () => {
    const dir = fresh('landing-readonly-pass')
    branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
    ])
    squashMerge(dir, 'feat')
    writeFileSync(join(dir, 'untracked.txt'), 'u\n')
    const before = snapshot(dir)
    expect(patchEquivalent(repoInfo(dir), 'feat', new Git(dir))).toBe('squashed')
    expect(snapshot(dir)).toEqual(before)
  })

  test('it needs no git identity from the user', () => {
    const dir = fresh('landing-no-identity')
    branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
    ])
    squashMerge(dir, 'feat')
    // An identity git rejects: a commit made under it would fail.
    const noIdentity = new Git(dir, {
      env: {
        GIT_CONFIG_GLOBAL: '/dev/null',
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: '',
        GIT_AUTHOR_EMAIL: '',
        GIT_COMMITTER_NAME: '',
        GIT_COMMITTER_EMAIL: '',
      },
    })
    expect(() => noIdentity.commitTree('HEAD^{tree}', { message: 'needs an identity' })).toThrow()
    expect(patchEquivalent(repoInfo(dir), 'feat', noIdentity)).toBe('squashed')
  })
})

describe('failing closed', () => {
  let dir: string
  let repo: RepoInfo

  beforeAll(() => {
    dir = fresh('landing-closed')
    branchOff(dir, 'feat', [
      ['a.txt', 'a\n'],
      ['b.txt', 'b\n'],
    ])
    squashMerge(dir, 'feat')
    repo = repoInfo(dir)
  }, HOOK_TIMEOUT_MS)

  test('the fixture is landed when git behaves', () => {
    expect(patchEquivalent(repo, 'feat', new Git(dir, { env: { ...IDENTITY } }))).toBe('squashed')
  })

  test('any git call that fails ends in no evidence', () => {
    for (const verb of ['rev-parse', 'log', 'cherry', 'merge-base', 'commit-tree']) {
      const broken = interposed(dir, (argv) => (is(argv, verb) ? failure() : undefined))
      expect(patchEquivalent(repo, 'feat', broken), verb).toBeNull()
    }
  })

  test('every call failing ends in no evidence', () => {
    const broken = interposed(dir, () => failure())
    expect(assessLanding(repo, 'feat', broken)).toEqual({ check: null, unmatched: [] })
  })

  test('empty cherry output is no evidence', () => {
    const empty = interposed(dir, (argv) => (is(argv, 'cherry') ? printed('') : undefined))
    expect(patchEquivalent(repo, 'feat', empty)).toBeNull()
  })

  test('cherry output that cannot be read is no evidence', () => {
    for (const out of ['garbage\n', '- nothex\n', `x ${'a'.repeat(40)}\n`, '-\n']) {
      const odd = interposed(dir, (argv) => (is(argv, 'cherry') ? printed(out) : undefined))
      expect(patchEquivalent(repo, 'feat', odd), out).toBeNull()
    }
  })

  test('a cherry that claims a different commit is no evidence', () => {
    const wrong = interposed(dir, (argv) =>
      is(argv, 'cherry') ? printed(`- ${'a'.repeat(40)}\n`) : undefined,
    )
    expect(patchEquivalent(repo, 'feat', wrong)).toBeNull()
  })

  test('a missing merge base is no evidence', () => {
    const none = interposed(dir, (argv) =>
      is(argv, 'merge-base') ? { exitCode: 1, stdout: '', stderr: '' } : undefined,
    )
    expect(patchEquivalent(repo, 'feat', none)).toBeNull()
  })

  test('a commit-tree reply that is not a sha is no evidence', () => {
    const odd = interposed(dir, (argv) => (is(argv, 'commit-tree') ? printed('oops\n') : undefined))
    expect(patchEquivalent(repo, 'feat', odd)).toBeNull()
  })

  test('a repository that says it is shallow, or says nothing, is no evidence', () => {
    for (const out of ['true\n', '\n', '--is-shallow-repository\n']) {
      const odd = interposed(dir, (argv) =>
        is(argv, '--is-shallow-repository') ? printed(out) : undefined,
      )
      expect(patchEquivalent(repo, 'feat', odd), out).toBeNull()
    }
  })

  test('a tip or landed ref that does not resolve is no evidence', () => {
    const git = new Git(dir, { env: { ...IDENTITY } })
    expect(patchEquivalent(repo, 'no-such-branch', git)).toBeNull()
    expect(patchEquivalent({ ...repo, mainBranch: 'no-such-main' }, 'feat', git)).toBeNull()
    expect(patchEquivalent(repo, '-x', git)).toBeNull()
  })

  test('a sweep over a failing check keeps the branch for a person', () => {
    const git = interposedRunner((argv) => (is(argv, 'cherry') ? failure() : undefined))
    const item = row(sweepRepo(dir, { noGh: true, cwd: dir, git }).items, 'local_branch', 'feat')
    expect(item.classification).toBe('needs-investigation')
    expect(item.facts['landing']).toBeUndefined()
  })
})
