/**
 * The config, remote and repository verbs added after the first-release
 * review: `configGet` with a scope, `configGetAll`, `configGetBool`,
 * `remoteGetUrl` with `push`, `remoteGetUrls`, `remoteHead`, `gitDir`, the
 * new `clone` and `fetch` flags, and the `maxOutputBytes` call option.
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
  type AsyncCommandRunOptions,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '../src/index.ts'
import { makeGitFixture, makeOriginAndCheckout } from '../src/testing.ts'

const CWD = '/tmp/repo'

/** Records argv and run options, and replays canned results keyed by argv. */
function recorder(replies: Record<string, Partial<CommandResult>> = {}) {
  const calls: string[][] = []
  const opts: CommandRunOptions[] = []
  const reply = (argv: string[]): CommandResult => ({
    exitCode: 0,
    stdout: '',
    stderr: '',
    ...replies[argv.join(' ')],
  })
  const sync: CommandRunner = {
    run(argv, o) {
      calls.push(argv)
      opts.push(o)
      return reply(argv)
    },
  }
  const async: AsyncCommandRunner = {
    run(argv, o: AsyncCommandRunOptions) {
      calls.push(argv)
      opts.push(o)
      return Promise.resolve(reply(argv))
    },
  }
  return { calls, opts, sync, async }
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
  test('config reads', async () => {
    const { s, a, sync, asyncGit } = clients({
      'config --global --type=bool --get commit.gpgsign': { stdout: 'true\n' },
    })
    sync.configGet('user.name', { scope: 'local' })
    sync.configGetAll('remote.origin.url')
    sync.configGetBool('commit.gpgsign', { scope: 'global' })
    await asyncGit.configGet('user.name', { scope: 'local' })
    await asyncGit.configGetAll('remote.origin.url')
    await asyncGit.configGetBool('commit.gpgsign', { scope: 'global' })
    expect(s.calls).toEqual([
      ['config', '--local', '--get', 'user.name'],
      ['config', '--get-all', '-z', 'remote.origin.url'],
      ['config', '--global', '--type=bool', '--get', 'commit.gpgsign'],
    ])
    expect(a.calls).toEqual(s.calls)
  })

  test('remotes, gitDir, clone and fetch', async () => {
    const { s, a, sync, asyncGit } = clients()
    const run = async (g: Git | AsyncGit) => {
      await g.remoteGetUrl('origin', { push: true })
      await g.remoteGetUrls('origin')
      await g.remoteGetUrls('origin', { push: true })
      await g.remoteHead('origin')
      await g.gitDir()
      await g.clone('/store.git', 'm.git', { mirror: true, quiet: true })
      await g.clone('/store.git', 'c', { singleBranch: true, noTags: true, depth: 1 })
      await g.fetch('origin', 'main', { depth: 1, noTags: true })
    }
    await run(sync)
    await run(asyncGit)
    expect(s.calls).toEqual([
      ['remote', 'get-url', '--push', 'origin'],
      ['remote', 'get-url', '--all', 'origin'],
      ['remote', 'get-url', '--all', '--push', 'origin'],
      ['ls-remote', '--symref', 'origin', 'HEAD'],
      ['rev-parse', '--absolute-git-dir'],
      ['clone', '--quiet', '--mirror', '/store.git', 'm.git'],
      ['clone', '--single-branch', '--no-tags', '--depth=1', '/store.git', 'c'],
      ['fetch', '--depth=1', '--no-tags', 'origin', 'main'],
    ])
    expect(a.calls).toEqual(s.calls)
  })

  test('maxOutputBytes reaches the runner and stays out of the request', async () => {
    const { s, a, sync, asyncGit } = clients()
    sync.configGet('a.b', { scope: 'local', maxOutputBytes: 64 })
    await asyncGit.configGet('a.b', { scope: 'local', maxOutputBytes: 64 })
    await asyncGit.raw(['cat-file', 'blob', 'HEAD:a'], { maxOutputBytes: 32 })
    expect(s.opts[0]!.maxOutputBytes).toBe(64)
    expect(a.opts[0]!.maxOutputBytes).toBe(64)
    expect(a.opts[1]!.maxOutputBytes).toBe(32)
    expect(a.calls[0]).toEqual(['config', '--local', '--get', 'a.b'])
  })
})

describe('absence and parsing', () => {
  test('configGetAll keeps empty and multi-line values; exit 1 is []', () => {
    const { sync } = clients({ 'config --get-all -z a.b': { stdout: 'x\x00\x00two\nlines\x00' } })
    expect(sync.configGetAll('a.b')).toEqual(['x', '', 'two\nlines'])
    const unset = new Git(CWD, { runner: { run: () => ({ exitCode: 1, stdout: '', stderr: '' }) } })
    expect(unset.configGetAll('a.b')).toEqual([])
    expect(unset.configGetBool('a.b')).toBeNull()
  })

  test('configGetBool reads true and false, and throws on other output', () => {
    const at = (stdout: string) =>
      new Git(CWD, { runner: { run: () => ({ exitCode: 0, stdout, stderr: '' }) } })
    expect(at('true\n').configGetBool('a.b')).toBe(true)
    expect(at('false\n').configGetBool('a.b')).toBe(false)
    expect(() => at('maybe\n').configGetBool('a.b')).toThrow(FailureError)
  })

  test('remoteGetUrls: exit 2 is [], other codes throw', () => {
    const at = (exitCode: number) =>
      new Git(CWD, { runner: { run: () => ({ exitCode, stdout: '', stderr: '' }) } })
    expect(at(2).remoteGetUrls('nope')).toEqual([])
    expect(() => at(128).remoteGetUrls('nope')).toThrow(FailureError)
  })

  test('remoteHead reads the ref: line; no such line is null; a failure throws', () => {
    const at = (r: Partial<CommandResult>) =>
      new Git(CWD, {
        runner: { run: () => ({ exitCode: 0, stdout: '', stderr: '', ...r }) },
      })
    const out = 'ref: refs/heads/trunk\tHEAD\nabc\tHEAD\n'
    expect(at({ stdout: out }).remoteHead('origin')).toBe('refs/heads/trunk')
    expect(at({ stdout: 'abc\tHEAD\n' }).remoteHead('origin')).toBeNull()
    expect(at({ stdout: '' }).remoteHead('origin')).toBeNull()
    expect(() => at({ exitCode: 128 }).remoteHead('origin')).toThrow(FailureError)
  })

  test('cut-short output is a failure, not an answer', async () => {
    const cut: CommandResult = { exitCode: 0, stdout: 'x', stderr: '', outputIncomplete: true }
    const sync = new Git(CWD, { runner: { run: () => cut } })
    expect(() => sync.configGetAll('a.b')).toThrow(FailureError)
    const asyncGit = new AsyncGit(CWD, {
      backend: cliBackend({ runner: { run: () => Promise.resolve(cut) } }),
    })
    await expect(asyncGit.configGetAll('a.b')).rejects.toBeInstanceOf(FailureError)
    expect(() => sync.rawChecked(['cat-file', 'blob', 'HEAD:big'])).toThrow(FailureError)
    await expect(asyncGit.rawChecked(['cat-file', 'blob', 'HEAD:big'])).rejects.toBeInstanceOf(
      FailureError,
    )
    // Unchecked `raw` hands the result back as it is.
    expect(sync.raw(['cat-file', 'blob', 'HEAD:big'])).toEqual(cut)
  })

  test('depth must be a positive integer', async () => {
    const { sync, asyncGit } = clients()
    for (const depth of [0, -1, 1.5, Number.NaN]) {
      expect(() => sync.fetch('origin', undefined, { depth })).toThrow(TypeError)
      expect(() => sync.clone('/store.git', 'c', { depth })).toThrow(TypeError)
      await expect(asyncGit.fetch('origin', undefined, { depth })).rejects.toBeInstanceOf(TypeError)
    }
  })

  test('soft gives the absence value on a failure', async () => {
    const fail = new Git(CWD, {
      runner: { run: () => ({ exitCode: 128, stdout: '', stderr: 'fatal' }) },
    })
    expect(fail.soft.configGetAll('a.b')).toEqual([])
    expect(fail.soft.configGetBool('a.b')).toBeNull()
    expect(fail.soft.remoteGetUrls('o')).toEqual([])
    expect(fail.soft.remoteHead('o')).toBeNull()
    expect(fail.try.gitDir()).toEqual({ ok: true, value: null })
    const asyncFail = new AsyncGit(CWD, {
      backend: cliBackend({
        runner: { run: () => Promise.resolve({ exitCode: 128, stdout: '', stderr: 'fatal' }) },
      }),
    })
    expect(await asyncFail.soft.remoteHead('o')).toBeNull()
  })
})

describe('real git', () => {
  test('config reads by scope, all values, and as a boolean', async () => {
    const fx = makeGitFixture()
    const home = mkdtempSync(join(tmpdir(), 'typed-git-config-'))
    try {
      const globalFile = join(home, 'gitconfig')
      writeFileSync(globalFile, '[x]\n\tflag = yes\n\tk = global\n')
      const env = { GIT_CONFIG_GLOBAL: globalFile }
      const git = fx.git
      git.configSet('x.k', 'local')
      expect(git.configGet('x.k', { env })).toBe('local')
      expect(git.configGet('x.k', { scope: 'global', env })).toBe('global')
      expect(git.configGet('x.k', { scope: 'local', env })).toBe('local')
      expect(git.configGetBool('x.flag', { scope: 'global', env })).toBe(true)
      expect(git.configGetBool('x.flag', { scope: 'local', env })).toBeNull()
      // The fixture turns signing off in the local file.
      expect(git.configGetBool('commit.gpgsign', { scope: 'local' })).toBe(false)

      git.raw(['config', '--add', 'remote.o.url', 'https://a/x.git'])
      git.raw(['config', '--add', 'remote.o.url', 'https://b/x.git'])
      expect(git.configGetAll('remote.o.url')).toEqual(['https://a/x.git', 'https://b/x.git'])
      expect(git.configGetAll('no.such.key')).toEqual([])

      git.configSet('x.bad', 'maybe')
      expect(() => git.configGetBool('x.bad')).toThrow(FailureError)

      const asyncGit = new AsyncGit(fx.dir)
      expect(await asyncGit.configGet('x.k', { scope: 'global', env })).toBe('global')
      expect(await asyncGit.configGetAll('remote.o.url')).toHaveLength(2)

      // git exits 1 for a key with no section or no name, the code read as
      // unset. The reads refuse such a key before git runs.
      for (const key of ['nodot', 'a.b.', '.a']) {
        expect(git.raw(['config', '--get', key]).exitCode).toBe(1)
        expect(() => git.configGet(key)).toThrow(TypeError)
        expect(() => git.configGetAll(key)).toThrow(TypeError)
        expect(() => git.configGetBool(key)).toThrow(TypeError)
        await expect(asyncGit.configGet(key)).rejects.toBeInstanceOf(TypeError)
      }

      const outside = new Git(home)
      expect(() => outside.configGet('x.k', { scope: 'local' })).toThrow(FailureError)
    } finally {
      fx.cleanup()
      rmSync(home, { recursive: true, force: true })
    }
  })

  test('remote URLs, push URLs and the remote HEAD', async () => {
    const { origin, checkout, cleanup } = makeOriginAndCheckout({ initialBranch: 'trunk' })
    try {
      const git = checkout.git
      git.raw(['remote', 'set-url', '--add', 'origin', 'https://mirror/x.git'])
      git.raw(['remote', 'set-url', '--push', 'origin', 'ssh://push/x.git'])
      expect(git.remoteGetUrls('origin')).toEqual([origin.dir, 'https://mirror/x.git'])
      expect(git.remoteGetUrl('origin', { push: true })).toBe('ssh://push/x.git')
      expect(git.remoteGetUrls('origin', { push: true })).toEqual(['ssh://push/x.git'])
      expect(git.remoteGetUrls('nope')).toEqual([])

      const fresh = new Git(checkout.dir)
      expect(fresh.remoteHead(origin.dir)).toBe('refs/heads/trunk')
      expect(await new AsyncGit(checkout.dir).remoteHead(origin.dir)).toBe('refs/heads/trunk')
      expect(() => fresh.remoteHead('/no/such/remote')).toThrow(FailureError)
    } finally {
      cleanup()
    }
  })

  test('gitDir is the per-worktree dir; null outside a repository', async () => {
    const fx = makeGitFixture()
    const scratch = mkdtempSync(join(tmpdir(), 'typed-git-gitdir-'))
    try {
      fx.commit('first', { 'a.md': 'one\n' })
      const wt = join(scratch, 'wt')
      fx.git.worktreeAdd(wt, { branch: 'side' })
      const common = fx.git.gitCommonDir()!
      expect(fx.git.gitDir()).toBe(common)
      expect(fx.git.at(wt).gitDir()).toBe(join(common, 'worktrees', 'wt'))
      expect(await new AsyncGit(wt).gitDir()).toBe(join(common, 'worktrees', 'wt'))
      expect(new Git(scratch).gitDir()).toBeNull()
    } finally {
      fx.cleanup()
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('clone --mirror and --single-branch --no-tags, fetch --depth --no-tags', () => {
    const { origin, cleanup } = makeOriginAndCheckout()
    const scratch = mkdtempSync(join(tmpdir(), 'typed-git-clone-'))
    try {
      origin.git.raw(['tag', 'v1'])
      origin.git.raw(['branch', 'other'])
      const top = new Git(scratch)
      top.clone(origin.dir, 'm.git', { mirror: true, quiet: true })
      const mirror = new Git(join(scratch, 'm.git'))
      expect(mirror.revParse('--is-bare-repository')).toBe('true')
      expect(mirror.refs('refs/heads').map((r) => r.ref)).toEqual([
        'refs/heads/main',
        'refs/heads/other',
      ])

      top.clone(origin.dir, 'one', { singleBranch: true, noTags: true, quiet: true })
      const one = new Git(join(scratch, 'one'))
      const remoteRefs = one.refs('refs/remotes').map((r) => r.ref)
      expect(remoteRefs).toContain('refs/remotes/origin/main')
      expect(remoteRefs).not.toContain('refs/remotes/origin/other')
      expect(one.refs('refs/tags')).toEqual([])

      one.fetch('origin', undefined, { depth: 1, quiet: true })

      // `noTags` on a fetch into a clone that does follow tags.
      top.clone(origin.dir, 'two', { quiet: true })
      top.clone(origin.dir, 'three', { quiet: true })
      origin.git.raw(['tag', 'v2'])
      const two = new Git(join(scratch, 'two'))
      two.fetch('origin', undefined, { noTags: true, quiet: true })
      expect(two.refs('refs/tags').map((r) => r.ref)).toEqual(['refs/tags/v1'])
      const three = new Git(join(scratch, 'three'))
      three.fetch('origin', undefined, { quiet: true })
      expect(three.refs('refs/tags').map((r) => r.ref)).toEqual(['refs/tags/v1', 'refs/tags/v2'])
    } finally {
      cleanup()
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  // Async only: the sync option is checked with a fake runner above.
  // The runner kills the child here, so this covers the `neverExited` path.
  // The `outputIncomplete` path is covered with a fake runner above.
  test('maxOutputBytes kills a large answer and throws', async () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'big.txt': 'x'.repeat(4096) })
      const asyncGit = new AsyncGit(fx.dir)
      expect(await asyncGit.showAtRev('HEAD', 'big.txt')).toHaveLength(4096)
      await expect(
        asyncGit.showAtRev('HEAD', 'big.txt', { maxOutputBytes: 100 }),
      ).rejects.toBeInstanceOf(FailureError)
    } finally {
      fx.cleanup()
    }
  })
})
