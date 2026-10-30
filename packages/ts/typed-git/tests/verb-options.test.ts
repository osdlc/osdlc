/**
 * The verb options and verbs added for #380: `worktreeAdd` with
 * `resetBranch`, `commit` with `paths`, `push` with `delete`,
 * `hasStagedChanges`, `showAtRevChecked`, `remoteSetHead`,
 * `remoteSetBranches` and `gc`.
 *
 * Two layers, as in client.test.ts: a fake runner for the exact argv on both
 * clients and the `TypeError` guards, and real git for the exit codes and
 * round trips a fake cannot prove.
 */

import { describe, expect, test } from 'vitest'

import { FailureError } from '@osdlc/result'

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  AsyncGit,
  cliBackend,
  Git,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '../src/index.ts'
import { makeBareAndWorker, makeGitFixture } from '../src/testing.ts'

const CWD = '/tmp/repo'

/** Records argv and stdin, and replays canned results keyed by argv. */
function recorder(replies: Record<string, Partial<CommandResult>> = {}) {
  const calls: string[][] = []
  const inputs: Array<string | undefined> = []
  const reply = (argv: string[]): CommandResult => ({
    exitCode: 0,
    stdout: '',
    stderr: '',
    ...replies[argv.join(' ')],
  })
  const sync: CommandRunner = {
    run(argv, o) {
      calls.push(argv)
      inputs.push(o.input)
      return reply(argv)
    },
  }
  const async: AsyncCommandRunner = {
    run(argv, o) {
      calls.push(argv)
      inputs.push(o.input)
      return Promise.resolve(reply(argv))
    },
  }
  return { calls, inputs, sync, async }
}

function clients(replies: Record<string, Partial<CommandResult>> = {}) {
  const s = recorder(replies)
  const a = recorder(replies)
  return {
    s,
    a,
    sync: new Git(CWD, { runner: s.sync }),
    asyncGit: new AsyncGit(CWD, { backend: cliBackend({ runner: a.async }) }),
  }
}

describe('argv, the same on both clients', () => {
  test('worktreeAdd with resetBranch is -B', async () => {
    const { s, a, sync, asyncGit } = clients()
    sync.worktreeAdd('/wt', { branch: 'reuse', resetBranch: true, startPoint: 'main' })
    sync.worktreeAdd('/wt2', { branch: 'reuse', resetBranch: true })
    await asyncGit.worktreeAdd('/wt', { branch: 'reuse', resetBranch: true, startPoint: 'main' })
    await asyncGit.worktreeAdd('/wt2', { branch: 'reuse', resetBranch: true })
    expect(s.calls).toEqual([
      ['worktree', 'add', '-B', 'reuse', '/wt', 'main'],
      ['worktree', 'add', '-B', 'reuse', '/wt2'],
    ])
    expect(a.calls).toEqual(s.calls)
  })

  test('worktreeAdd refuses resetBranch without a branch before spawning', async () => {
    const { s, a, sync, asyncGit } = clients()
    expect(() => sync.worktreeAdd('/wt', { resetBranch: true })).toThrow(
      'typed-git: worktreeAdd: resetBranch needs a branch',
    )
    await expect(asyncGit.worktreeAdd('/wt', { resetBranch: true })).rejects.toThrow(TypeError)
    expect(s.calls).toEqual([])
    expect(a.calls).toEqual([])
  })

  test('commit with paths appends -- <paths> for every message source', async () => {
    const { s, a, sync, asyncGit } = clients()
    sync.commit({ message: 'm', paths: ['a.md', '-b.md'] })
    sync.commit({ message: 's', body: 'b', amend: true, paths: ['a.md'] })
    sync.commit({ messageFile: '/tmp/msg', paths: ['a.md'] })
    sync.commit({ messageStdin: 'm\n', signoff: true, paths: ['a.md', 'b.md'] })
    await asyncGit.commit({ message: 'm', paths: ['a.md', '-b.md'] })
    await asyncGit.commit({ message: 's', body: 'b', amend: true, paths: ['a.md'] })
    await asyncGit.commit({ messageFile: '/tmp/msg', paths: ['a.md'] })
    await asyncGit.commit({ messageStdin: 'm\n', signoff: true, paths: ['a.md', 'b.md'] })
    expect(s.calls).toEqual([
      ['commit', '-m', 'm', '--', 'a.md', '-b.md'],
      ['commit', '--amend', '-m', 's', '-m', 'b', '--', 'a.md'],
      ['commit', '-F', '/tmp/msg', '--', 'a.md'],
      ['commit', '--signoff', '-F', '-', '--', 'a.md', 'b.md'],
    ])
    expect(s.inputs[3]).toBe('m\n')
    expect(a.calls).toEqual(s.calls)
    expect(a.inputs[3]).toBe('m\n')
  })

  test('commit with an empty paths list throws rather than committing everything', async () => {
    const { s, a, sync, asyncGit } = clients()
    expect(() => sync.commit({ message: 'm', paths: [] })).toThrow(TypeError)
    expect(() => sync.commit({ messageStdin: 'm', paths: [] })).toThrow(TypeError)
    await expect(asyncGit.commit({ message: 'm', paths: [] })).rejects.toThrow(TypeError)
    expect(s.calls).toEqual([])
    expect(a.calls).toEqual([])
  })

  test('push with delete is push --delete, and combines with a lease', async () => {
    const { s, a, sync, asyncGit } = clients()
    sync.push('origin', 'refs/heads/gone', { delete: true })
    sync.push('origin', 'gone', {
      delete: true,
      forceWithLease: { ref: 'refs/heads/gone', expect: 'abc' },
    })
    sync.push('origin', 'gone', { delete: true, forceWithLease: true })
    await asyncGit.push('origin', 'refs/heads/gone', { delete: true })
    await asyncGit.push('origin', 'gone', {
      delete: true,
      forceWithLease: { ref: 'refs/heads/gone', expect: 'abc' },
    })
    await asyncGit.push('origin', 'gone', { delete: true, forceWithLease: true })
    expect(s.calls).toEqual([
      ['push', '--porcelain', '--delete', 'origin', 'refs/heads/gone'],
      [
        'push',
        '--porcelain',
        '--delete',
        '--force-with-lease=refs/heads/gone:abc',
        'origin',
        'gone',
      ],
      ['push', '--porcelain', '--delete', '--force-with-lease', 'origin', 'gone'],
    ])
    expect(a.calls).toEqual(s.calls)
  })

  test('hasStagedChanges reads exit 1 as true and 0 as false; anything else throws', async () => {
    const argv = 'diff --cached --quiet'
    for (const [exitCode, want] of [
      [0, false],
      [1, true],
    ] as const) {
      const { s, sync, asyncGit } = clients({ [argv]: { exitCode } })
      expect(sync.hasStagedChanges()).toBe(want)
      expect(await asyncGit.hasStagedChanges()).toBe(want)
      expect(s.calls).toEqual([['diff', '--cached', '--quiet']])
    }
    const { sync, asyncGit } = clients({ [argv]: { exitCode: 129, stderr: 'usage' } })
    expect(() => sync.hasStagedChanges()).toThrow(FailureError)
    await expect(asyncGit.hasStagedChanges()).rejects.toBeInstanceOf(FailureError)
    expect(sync.soft.hasStagedChanges()).toBe(false)
    expect(await asyncGit.soft.hasStagedChanges()).toBe(false)
  })

  test('showAtRevChecked runs show <rev>:<path> and throws on 128', async () => {
    const { s, a, sync, asyncGit } = clients({ 'show HEAD:a.md': { stdout: 'one\n' } })
    expect(sync.showAtRevChecked('HEAD', 'a.md')).toBe('one\n')
    expect(await asyncGit.showAtRevChecked('HEAD', 'a.md')).toBe('one\n')
    expect(s.calls).toEqual([['show', 'HEAD:a.md']])
    expect(a.calls).toEqual(s.calls)

    const missing = clients({ 'show HEAD:gone.md': { exitCode: 128, stderr: 'fatal: path' } })
    expect(missing.sync.showAtRev('HEAD', 'gone.md')).toBeNull()
    expect(() => missing.sync.showAtRevChecked('HEAD', 'gone.md')).toThrow(FailureError)
    await expect(missing.asyncGit.showAtRevChecked('HEAD', 'gone.md')).rejects.toBeInstanceOf(
      FailureError,
    )
  })

  test('remoteSetHead takes exactly one of branch, auto, delete', async () => {
    const { s, a, sync, asyncGit } = clients()
    sync.remoteSetHead('origin', { branch: 'main' })
    sync.remoteSetHead('origin', { auto: true })
    sync.remoteSetHead('origin', { delete: true })
    await asyncGit.remoteSetHead('origin', { branch: 'main' })
    await asyncGit.remoteSetHead('origin', { auto: true })
    await asyncGit.remoteSetHead('origin', { delete: true })
    expect(s.calls).toEqual([
      ['remote', 'set-head', 'origin', 'main'],
      ['remote', 'set-head', 'origin', '--auto'],
      ['remote', 'set-head', 'origin', '--delete'],
    ])
    expect(a.calls).toEqual(s.calls)

    for (const bad of [{}, { branch: 'main', auto: true }, { auto: true, delete: true }]) {
      expect(() => sync.remoteSetHead('origin', bad as never)).toThrow(
        'typed-git: remoteSetHead: pass exactly one of branch, auto, delete',
      )
      await expect(asyncGit.remoteSetHead('origin', bad as never)).rejects.toThrow(TypeError)
    }
    expect(s.calls).toHaveLength(3)
    expect(a.calls).toHaveLength(3)
  })

  test('remoteSetBranches, with and without --add; an empty list throws', async () => {
    const { s, a, sync, asyncGit } = clients()
    sync.remoteSetBranches('origin', ['main', 'release/*'])
    sync.remoteSetBranches('origin', ['dev'], { add: true })
    await asyncGit.remoteSetBranches('origin', ['main', 'release/*'])
    await asyncGit.remoteSetBranches('origin', ['dev'], { add: true })
    expect(s.calls).toEqual([
      ['remote', 'set-branches', 'origin', 'main', 'release/*'],
      ['remote', 'set-branches', '--add', 'origin', 'dev'],
    ])
    expect(a.calls).toEqual(s.calls)

    expect(() => sync.remoteSetBranches('origin', [])).toThrow(
      'typed-git: remoteSetBranches: branches is empty',
    )
    await expect(asyncGit.remoteSetBranches('origin', [])).rejects.toThrow(TypeError)
    expect(s.calls).toHaveLength(2)
    expect(a.calls).toHaveLength(2)
  })

  test('gc flags, and prune as a date or false', async () => {
    const { s, a, sync, asyncGit } = clients()
    sync.gc()
    sync.gc({ auto: true, quiet: true })
    sync.gc({ aggressive: true, prune: 'now' })
    sync.gc({ prune: false, quiet: true })
    await asyncGit.gc()
    await asyncGit.gc({ auto: true, quiet: true })
    await asyncGit.gc({ aggressive: true, prune: 'now' })
    await asyncGit.gc({ prune: false, quiet: true })
    expect(s.calls).toEqual([
      ['gc'],
      ['gc', '--auto', '--quiet'],
      ['gc', '--aggressive', '--prune=now'],
      ['gc', '--no-prune', '--quiet'],
    ])
    expect(a.calls).toEqual(s.calls)
    expect(() => sync.gc({ prune: '' })).toThrow(TypeError)
    expect(s.calls).toHaveLength(4)
  })
})

describe('against real git', () => {
  test('hasStagedChanges: false when clean, true once something is staged', () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'one\n' })
      const git = fx.git
      expect(git.hasStagedChanges()).toBe(false)
      // An unstaged edit is not staged.
      writeFileSync(join(fx.dir, 'a.md'), 'two\n')
      expect(git.hasStagedChanges()).toBe(false)
      git.add(['a.md'])
      expect(git.hasStagedChanges()).toBe(true)
    } finally {
      fx.cleanup()
    }
  })

  test('hasStagedChanges on an unborn HEAD compares against the empty tree', () => {
    const fx = makeGitFixture()
    try {
      expect(fx.git.hasHistory()).toBe(false)
      expect(fx.git.hasStagedChanges()).toBe(false)
      writeFileSync(join(fx.dir, 'a.md'), 'one\n')
      fx.git.add(['a.md'])
      expect(fx.git.hasStagedChanges()).toBe(true)
    } finally {
      fx.cleanup()
    }
  })

  test('hasStagedChanges outside a repository throws, not false', () => {
    const nonRepo = mkdtempSync(join(tmpdir(), 'typed-git-norepo-'))
    try {
      const r = new Git(nonRepo).try.hasStagedChanges()
      expect(r.ok).toBe(false)
      if (r.ok) throw new Error('unreachable')
      expect(r.error.exitCode).toBe(129)
    } finally {
      rmSync(nonRepo, { recursive: true, force: true })
    }
  })

  test('showAtRevChecked throws for a missing path where showAtRev returns null', async () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'one\n' })
      expect(fx.git.showAtRevChecked('HEAD', 'a.md')).toBe('one\n')
      expect(fx.git.showAtRev('HEAD', 'missing.md')).toBeNull()
      expect(() => fx.git.showAtRevChecked('HEAD', 'missing.md')).toThrow(FailureError)
      const r = fx.git.try.showAtRevChecked('HEAD', 'missing.md')
      expect(r.ok).toBe(false)
      if (r.ok) throw new Error('unreachable')
      expect(r.error.exitCode).toBe(128)
      const asyncGit = new AsyncGit(fx.dir)
      await expect(asyncGit.showAtRevChecked('HEAD', 'missing.md')).rejects.toBeInstanceOf(
        FailureError,
      )
    } finally {
      fx.cleanup()
    }
  })

  test('commit with paths commits only those paths and leaves the rest staged', () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'one\n', 'b.md': 'one\n' })
      writeFileSync(join(fx.dir, 'a.md'), 'two\n')
      writeFileSync(join(fx.dir, 'b.md'), 'two\n')
      fx.git.add(['a.md', 'b.md'])
      fx.git.commit({ message: 'only a', paths: ['a.md'] })
      expect(fx.git.diffTree('HEAD').map((e) => e.path)).toEqual(['a.md'])
      expect(fx.git.diffNameOnly({ cached: true })).toEqual(['b.md'])
      expect(fx.git.hasStagedChanges()).toBe(true)

      fx.git.commit({ messageStdin: 'then b\n', paths: ['b.md'] })
      expect(fx.git.logSubject('HEAD')).toBe('then b')
      expect(fx.git.hasStagedChanges()).toBe(false)
    } finally {
      fx.cleanup()
    }
  })

  test('worktreeAdd with resetBranch repoints an existing branch; branch refuses', () => {
    const fx = makeGitFixture()
    const scratch = mkdtempSync(join(tmpdir(), 'typed-git-wt-'))
    try {
      const first = fx.commit('first', { 'a.md': 'one\n' })
      fx.git.rawChecked(['branch', 'reuse'])
      const second = fx.commit('second', { 'a.md': 'two\n' })
      expect(fx.git.resolveRef('refs/heads/reuse')).toBe(first)

      expect(() =>
        fx.git.worktreeAdd(join(scratch, 'wt-b'), { branch: 'reuse', startPoint: 'main' }),
      ).toThrow(FailureError)

      const wt = join(scratch, 'wt-B')
      fx.git.worktreeAdd(wt, { branch: 'reuse', resetBranch: true, startPoint: 'main' })
      expect(fx.git.resolveRef('refs/heads/reuse')).toBe(second)
      expect(new Git(wt).currentBranch()).toBe('reuse')
      fx.git.worktreeRemove(wt, { force: true })
    } finally {
      fx.cleanup()
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('push with delete removes the remote branch', () => {
    const pair = makeBareAndWorker()
    try {
      const { worker, remoteName } = pair
      const head = worker.commit('first', { 'a.md': 'one\n' })
      worker.git.push(remoteName, 'main')
      worker.git.push(remoteName, 'HEAD:refs/heads/gone')
      expect(pair.bare.git.resolveRef('refs/heads/gone')).toBe(head)

      // A lease pinned to the wrong sha refuses the delete.
      const wrong = { ref: 'refs/heads/gone', expect: '0'.repeat(40) }
      const refused = worker.git.push(remoteName, 'gone', { delete: true, forceWithLease: wrong })
      expect(refused.refs).toMatchObject([{ flag: '!', rejection: 'stale' }])
      expect(pair.bare.git.resolveRef('refs/heads/gone')).toBe(head)

      const deleted = worker.git.push(remoteName, 'gone', {
        delete: true,
        forceWithLease: { ref: 'refs/heads/gone', expect: head },
      })
      expect(deleted.refs).toMatchObject([{ flag: '-', dst: 'refs/heads/gone' }])
      expect(pair.bare.git.resolveRef('refs/heads/gone')).toBeNull()
      expect(pair.bare.git.resolveRef('refs/heads/main')).toBe(head)
    } finally {
      pair.cleanup()
    }
  })

  test('remoteSetHead sets, deletes and auto-detects origin/HEAD', () => {
    const pair = makeBareAndWorker()
    try {
      const { worker, remoteName } = pair
      worker.commit('first', { 'a.md': 'one\n' })
      worker.git.push(remoteName, 'main')
      worker.git.fetch(remoteName)
      const ref = `refs/remotes/${remoteName}/HEAD`
      // git 2.48+ sets origin/HEAD on fetch (remote.<name>.followRemoteHEAD),
      // older git does not, so start from no ref either way.
      worker.git.remoteSetHead(remoteName, { delete: true })
      expect(worker.git.symbolicRef(ref)).toBeNull()

      worker.git.remoteSetHead(remoteName, { branch: 'main' })
      expect(worker.git.symbolicRef(ref)).toBe(`refs/remotes/${remoteName}/main`)

      worker.git.remoteSetHead(remoteName, { delete: true })
      expect(worker.git.symbolicRef(ref)).toBeNull()

      worker.git.remoteSetHead(remoteName, { auto: true })
      expect(worker.git.symbolicRef(ref)).toBe(`refs/remotes/${remoteName}/main`)

      // A branch with no remote-tracking ref exits 1, and throws.
      expect(() => worker.git.remoteSetHead(remoteName, { branch: 'nosuch' })).toThrow(FailureError)
    } finally {
      pair.cleanup()
    }
  })

  test('remoteSetBranches replaces, then adds to, the fetch refspecs', () => {
    const pair = makeBareAndWorker()
    try {
      const { worker, remoteName } = pair
      const key = `remote.${remoteName}.fetch`
      expect(worker.git.configGetAll(key)).toEqual([`+refs/heads/*:refs/remotes/${remoteName}/*`])

      worker.git.remoteSetBranches(remoteName, ['main'])
      expect(worker.git.configGetAll(key)).toEqual([
        `+refs/heads/main:refs/remotes/${remoteName}/main`,
      ])

      worker.git.remoteSetBranches(remoteName, ['dev'], { add: true })
      expect(worker.git.configGetAll(key)).toEqual([
        `+refs/heads/main:refs/remotes/${remoteName}/main`,
        `+refs/heads/dev:refs/remotes/${remoteName}/dev`,
      ])

      // An unknown remote exits 2, and throws.
      expect(() => worker.git.remoteSetBranches('nosuch', ['main'])).toThrow(FailureError)
    } finally {
      pair.cleanup()
    }
  })

  test('gc runs on a small repository', () => {
    const fx = makeGitFixture()
    try {
      const head = fx.commit('first', { 'a.md': 'one\n' })
      fx.git.gc({ quiet: true, prune: 'now' })
      fx.git.gc({ auto: true, quiet: true })
      fx.git.gc({ quiet: true, prune: false })
      expect(fx.git.resolveRef('HEAD')).toBe(head)
    } finally {
      fx.cleanup()
    }
  })
})
