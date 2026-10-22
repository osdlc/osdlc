/**
 * The integration verbs — merge, rebase, and the conflict inspection around
 * them.
 *
 * These are the verbs where a non-zero exit carries the answer, so the
 * interesting cases are the ones where the exit code alone is not enough.
 * `git merge` exits 1 both for a conflict and for a ref it cannot resolve;
 * everything here that looks like paranoia is a code measured against git
 * 2.50.1 rather than assumed, and the two that broke the first design are
 * pinned by name.
 */

import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import { FailureError } from '@osdlc/result'

import { Git, type CommandResult, type CommandRunner } from '../src/index.ts'
import { makeGitFixture, type GitFixture } from '../src/testing.ts'

/** Records argv and replays one canned result. */
function recorder(result: CommandResult): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = []
  return { calls, runner: { run: (argv) => (calls.push([...argv]), result) } }
}

const res = (exitCode: number, stdout = '', stderr = ''): CommandResult => ({
  exitCode,
  stdout,
  stderr,
})

const CONFLICT_REPORT =
  'Auto-merging f.txt\nCONFLICT (content): Merge conflict in f.txt\n' +
  'Automatic merge failed; fix conflicts and then commit the result.\n'

// ── argv ────────────────────────────────────────────────────────────────────

describe('integration verbs — argv', () => {
  test('merge always passes --no-edit, flags before the ref', () => {
    const { runner, calls } = recorder(res(0))
    new Git('/repo', { runner }).merge('origin/main', { noFf: true, noCommit: true })
    expect(calls[0]).toEqual(['merge', '--no-edit', '--no-ff', '--no-commit', 'origin/main'])
  })

  test('merge ffOnly emits --ff-only before the ref', () => {
    const { runner, calls } = recorder(res(0))
    new Git('/repo', { runner }).merge('x', { ffOnly: true })
    expect(calls[0]).toEqual(['merge', '--no-edit', '--ff-only', 'x'])
  })

  test('rebase --continue stubs the editor through git config, not an env var', () => {
    const { runner, calls } = recorder(res(0))
    new Git('/repo', { runner }).rebaseContinue()
    expect(calls[0]).toEqual(['-c', 'core.editor=true', 'rebase', '--continue'])
  })

  test('checkout picks -B over -b when resetting an existing branch', () => {
    const { runner, calls } = recorder(res(0))
    const git = new Git('/repo', { runner })
    git.checkout('origin/x', { branch: 'x' })
    git.checkout('origin/x', { branch: 'x', resetBranch: true, force: true })
    expect(calls[0]).toEqual(['checkout', '-b', 'x', 'origin/x'])
    expect(calls[1]).toEqual(['checkout', '--force', '-B', 'x', 'origin/x'])
  })

  test('checkoutSide separates paths with -- so a path cannot read as a ref', () => {
    const { runner, calls } = recorder(res(0))
    new Git('/repo', { runner }).checkoutSide('theirs', ['a.ts', 'b.ts'])
    expect(calls[0]).toEqual(['checkout', '--theirs', '--', 'a.ts', 'b.ts'])
  })

  test('add separates paths with -- so a path starting with - cannot read as an option', () => {
    const { runner, calls } = recorder(res(0))
    const git = new Git('/repo', { runner })
    git.add(['-f', 'a.ts'])
    git.add(['b.ts'], { all: true, intentToAdd: true })
    expect(calls[0]).toEqual(['add', '--', '-f', 'a.ts'])
    expect(calls[1]).toEqual(['add', '--all', '--intent-to-add', '--', 'b.ts'])
  })

  test('lsFilesUnmerged is NUL-delimited, because a path is bytes', () => {
    const { runner, calls } = recorder(res(0))
    new Git('/repo', { runner }).lsFilesUnmerged()
    expect(calls[0]).toEqual(['ls-files', '-u', '-z'])
  })

  test('a structured forceWithLease pins the expected sha; true stays bare', () => {
    const { runner, calls } = recorder(res(0))
    const git = new Git('/repo', { runner })
    git.push('origin', 'HEAD:x', {
      forceWithLease: { ref: 'refs/heads/x', expect: 'abc123' },
    })
    git.push('origin', 'HEAD:x', { forceWithLease: true })
    git.push('origin', 'HEAD:x')
    expect(calls[0]).toEqual(['push', '--force-with-lease=refs/heads/x:abc123', 'origin', 'HEAD:x'])
    expect(calls[1]).toEqual(['push', '--force-with-lease', 'origin', 'HEAD:x'])
    expect(calls[2]).toEqual(['push', 'origin', 'HEAD:x'])
  })
})

// ── the outcome contract ────────────────────────────────────────────────────

describe('integration outcomes — exit 1 is not enough on its own', () => {
  test('exit 1 carrying a report is a conflict', () => {
    const git = new Git('/repo', { runner: recorder(res(1, CONFLICT_REPORT)).runner })
    expect(git.merge('origin/main')).toEqual({
      status: 'conflict',
      conflicts: ['f.txt'],
    })
  })

  // The case that broke the first design: `git merge no-such-ref` exits 1,
  // exactly like a conflict. Only the empty stdout tells them apart.
  test('exit 1 with nothing on stdout is git refusing, and throws', () => {
    const git = new Git('/repo', {
      runner: recorder(res(1, '', 'merge: no-such-ref - not something we can merge')).runner,
    })
    expect(() => git.merge('no-such-ref')).toThrow(FailureError)
  })

  test("an undeclared exit code throws even with output — 2 is 'would overwrite'", () => {
    const git = new Git('/repo', { runner: recorder(res(2, '', 'error: local changes')).runner })
    expect(() => git.merge('origin/main')).toThrow(FailureError)
  })

  test('a clean merge reports fast-forward and already-up-to-date apart', () => {
    const ff = new Git('/repo', {
      runner: recorder(res(0, 'Updating a..b\nFast-forward\n f | 1 +\n')).runner,
    }).merge('origin/main')
    expect(ff).toEqual({ status: 'clean', fastForward: true, alreadyUpToDate: false })

    const noop = new Git('/repo', {
      runner: recorder(res(0, 'Already up to date.\n')).runner,
    }).merge('origin/main')
    expect(noop).toEqual({ status: 'clean', fastForward: false, alreadyUpToDate: true })
  })

  test('modify/delete is named too, and each path appears once', () => {
    const stdout =
      'CONFLICT (content): Merge conflict in a.ts\n' +
      'CONFLICT (content): Merge conflict in a.ts\n' +
      'CONFLICT (modify/delete): b.ts deleted in HEAD and modified in origin/main.\n'
    const out = new Git('/repo', { runner: recorder(res(1, stdout)).runner }).merge('x')
    expect(out).toEqual({ status: 'conflict', conflicts: ['a.ts', 'b.ts'] })
  })

  test('the try door turns a refusal into an outcome, conflicts stay values', () => {
    const refused = new Git('/repo', { runner: recorder(res(1)).runner }).try.merge('nope')
    expect(refused.ok).toBe(false)

    const conflicted = new Git('/repo', {
      runner: recorder(res(1, CONFLICT_REPORT)).runner,
    }).try.merge('x')
    // A conflict is a declared absence, so `try` reports success with a value.
    expect(conflicted.ok).toBe(true)
    if (conflicted.ok) expect(conflicted.value.status).toBe('conflict')
  })
})

// ── real git ────────────────────────────────────────────────────────────────

let fx: GitFixture

beforeAll(() => {
  fx = makeGitFixture({ prefix: 'typedgit-integration-' })
  fx.commit('base', { 'shared.txt': 'base\n', 'doomed.txt': 'base\n' })
})

afterAll(() => fx.cleanup())

/** Commit `files` on a branch cut from `from`. */
function branchWith(name: string, from: string, files: Record<string, string>): void {
  fx.git.checkout(from, { branch: name, resetBranch: true })
  fx.commit(`${name} change`, files)
}

describe('real git — the conflict shapes a resolver must tell apart', () => {
  test('a clean fast-forward, then a merge that is a no-op', () => {
    branchWith('ff', 'main', { 'added.txt': 'new\n' })
    fx.git.checkout('main')

    const first = fx.git.merge('ff')
    expect(first.status).toBe('clean')
    if (first.status === 'clean') expect(first.fastForward).toBe(true)

    expect(fx.git.merge('ff')).toEqual({
      status: 'clean',
      fastForward: false,
      alreadyUpToDate: true,
    })
  })

  test('ffOnly fast-forwards when it can and refuses a diverged history', () => {
    branchWith('ffo-base', 'main', {})
    branchWith('ffo-ahead', 'ffo-base', { 'ahead.txt': 'a\n' })
    branchWith('ffo-side', 'ffo-base', { 'side.txt': 's\n' })
    fx.git.checkout('ffo-base')

    const out = fx.git.merge('ffo-ahead', { ffOnly: true })
    expect(out).toMatchObject({ status: 'clean', fastForward: true })

    // ffo-base now holds ahead.txt; ffo-side does not, so it has diverged.
    const before = fx.git.revParse('HEAD')
    expect(() => fx.git.merge('ffo-side', { ffOnly: true })).toThrow(FailureError)
    expect(fx.git.revParse('HEAD')).toBe(before)
    fx.git.checkout('main')
  })

  test('both-modified leaves all three stages', () => {
    branchWith('left', 'main', { 'shared.txt': 'left\n' })
    branchWith('right', 'main', { 'shared.txt': 'right\n' })
    fx.git.checkout('left')

    const out = fx.git.merge('right')
    expect(out.status).toBe('conflict')
    if (out.status === 'conflict') expect(out.conflicts).toContain('shared.txt')

    const stages = fx.git.lsFilesUnmerged().filter((e) => e.path === 'shared.txt')
    expect(stages.map((e) => e.stage).sort()).toEqual([1, 2, 3])
    // The cheaper path-only question agrees.
    expect(fx.git.diffNameOnly({ diffFilter: 'U' })).toContain('shared.txt')

    fx.git.mergeAbort()
    expect(fx.git.lsFilesUnmerged()).toEqual([])
  })

  test('modify/delete leaves only two — which is what distinguishes it', () => {
    branchWith('deleter', 'main', {})
    fx.git.raw(['rm', '-q', 'doomed.txt'])
    fx.commit('delete doomed')
    branchWith('modifier', 'main', { 'doomed.txt': 'edited\n' })
    fx.git.checkout('deleter')

    expect(fx.git.merge('modifier').status).toBe('conflict')
    const stages = fx.git.lsFilesUnmerged().filter((e) => e.path === 'doomed.txt')
    expect(stages.map((e) => e.stage).sort()).toEqual([1, 3])

    fx.git.mergeAbort()
  })

  test('checkoutSide resolves a both-modified conflict to one side', () => {
    fx.git.checkout('left')
    expect(fx.git.merge('right').status).toBe('conflict')

    fx.git.checkoutSide('theirs', ['shared.txt'])
    fx.git.add(['shared.txt'])
    expect(fx.git.lsFilesUnmerged()).toEqual([])
    fx.commit('resolved')
    expect(fx.git.showAtRev('HEAD', 'shared.txt')).toBe('right\n')
  })

  test('an unknown ref throws rather than reading as a conflict', () => {
    fx.git.checkout('main')
    expect(() => fx.git.merge('no-such-ref')).toThrow(FailureError)
    // And nothing was left half-merged.
    expect(fx.git.lsFilesUnmerged()).toEqual([])
  })

  test('merge --abort with no merge running throws', () => {
    expect(() => fx.git.mergeAbort()).toThrow(FailureError)
  })

  test('rebase replays onto a moved base, conflicts, and continues', () => {
    fx.git.checkout('main')
    fx.commit('target base', { 'target.txt': 'base\n' })
    branchWith('topic', 'main', { 'target.txt': 'topic\n' })
    fx.git.checkout('main')
    fx.commit('base moved', { 'target.txt': 'moved\n' })

    fx.git.checkout('topic')
    expect(fx.git.rebase('main').status).toBe('conflict')
    expect(fx.git.diffNameOnly({ diffFilter: 'U' })).toContain('target.txt')

    fx.git.checkoutSide('theirs', ['target.txt'])
    fx.git.add(['target.txt'])
    expect(fx.git.rebaseContinue().status).toBe('clean')
    expect(fx.git.aheadBehind('main', 'topic').behind).toBe(0)
  })

  test('rebase --abort with no rebase running throws', () => {
    expect(() => fx.git.rebaseAbort()).toThrow(FailureError)
  })
})

describe('real git — merge-tree predicts without touching the worktree', () => {
  test('a clean prediction names no conflicts and leaves the checkout alone', () => {
    fx.git.checkout('main')
    const before = fx.git.resolveRef('HEAD')

    branchWith('mt-clean', 'main', { 'mt-only.txt': 'new\n' })
    fx.git.checkout('main')

    const out = fx.git.mergeTree('main', 'mt-clean')
    expect(out.status).toBe('clean')
    expect(out.tree).toMatch(/^[0-9a-f]{40}$/)

    // The whole point: nothing moved, nothing was staged, no merge started.
    expect(fx.git.resolveRef('HEAD')).toBe(before)
    expect(fx.git.lsFilesUnmerged()).toEqual([])
    expect(fx.git.statusPorcelain()).toEqual([])
  })

  test("a conflict names its paths, and the list is git's own, not a scrape", () => {
    // Its own pair: `left`/`right` were resolved and committed by an earlier
    // test, so predicting that merge now answers "clean" — correctly.
    branchWith('mt-conf-a', 'main', { 'mt-shared.txt': 'a\n' })
    branchWith('mt-conf-b', 'main', { 'mt-shared.txt': 'b\n' })

    const out = fx.git.mergeTree('mt-conf-a', 'mt-conf-b')
    expect(out.status).toBe('conflict')
    if (out.status === 'conflict') {
      expect(out.conflicts).toEqual(['mt-shared.txt'])
      // git wrote a real tree even for the conflicted merge.
      expect(out.tree).toMatch(/^[0-9a-f]{40}$/)
    }
    // Still no worktree involvement.
    expect(fx.git.lsFilesUnmerged()).toEqual([])
  })

  test('the predicted tree is real enough to commit and matches a live merge', () => {
    const predicted = fx.git.mergeTree('main', 'mt-clean')
    expect(predicted.status).toBe('clean')

    fx.git.checkout('main')
    fx.git.merge('mt-clean')
    // A fast-forward lands exactly the tree merge-tree computed.
    expect(fx.git.raw(['rev-parse', 'HEAD^{tree}']).stdout.trim()).toBe(predicted.tree)
  })

  test('a name git cannot merge exits 1 like a conflict, and throws', () => {
    // The same trap `merge` sets: exit 1 with nothing on stdout is a refusal,
    // and reading it as "no conflicts" would report a broken ref as mergeable.
    expect(() => fx.git.mergeTree('main', 'no-such-ref')).toThrow(FailureError)
  })

  test('-z returns a path needing quotes raw, not C-quoted', () => {
    const odd = 'wéird "name".txt'
    branchWith('mt-odd-a', 'main', { [odd]: 'a\n' })
    branchWith('mt-odd-b', 'main', { [odd]: 'b\n' })

    const out = fx.git.mergeTree('mt-odd-a', 'mt-odd-b')
    expect(out.status).toBe('conflict')
    // Without -z this would come back as "w\303\251ird \"name\".txt" and no
    // caller comparing it to a real path would match.
    if (out.status === 'conflict') expect(out.conflicts).toEqual([odd])
  })

  test('mergeBase pins the base git would otherwise pick', () => {
    const { runner, calls } = recorder(res(0, 'deadbeef\x00'))
    new Git('/repo', { runner }).mergeTree('x', 'main', { mergeBase: 'abc' })
    expect(calls[0]).toEqual([
      'merge-tree',
      '--write-tree',
      '--name-only',
      '-z',
      '--merge-base=abc',
      'x',
      'main',
    ])
  })
})

describe('real git — add with a dash-leading path', () => {
  test('stages a file whose name starts with a dash', () => {
    const dash = makeGitFixture({ prefix: 'typedgit-dash-' })
    try {
      writeFileSync(join(dash.dir, '-dash.txt'), 'x\n')
      dash.git.add(['-dash.txt'])
      expect(dash.git.lsFiles({ cached: true })).toEqual(['-dash.txt'])
    } finally {
      dash.cleanup()
    }
  })
})

describe('real git — commit({ messageStdin })', () => {
  test('stores the message bytes, adding the trailing newline only when absent', () => {
    fx.git.checkout('main')
    for (const [msg, stored] of [
      ['stdin subject\n\nstdin body', 'stdin subject\n\nstdin body\n'],
      ['stdin two\n\nbody two\n', 'stdin two\n\nbody two\n'],
    ] as const) {
      writeFileSync(join(fx.dir, 'stdin.txt'), msg)
      fx.git.add(['stdin.txt'])
      fx.git.commit({ messageStdin: msg })
      // The commit object ends with the message verbatim: exactly one trailing newline.
      expect(fx.git.raw(['cat-file', 'commit', 'HEAD']).stdout.endsWith('\n\n' + stored)).toBe(true)
    }
  })
})
