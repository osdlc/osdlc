/**
 * Behaviour set by the API review: the `diffText` and `diffAddedFile` failure
 * contract, call options on `revParse`, `diffText` and `diffAddedFile`,
 * `checkoutSide` with no paths, the `remotes()` name, and the soft door
 * without `configRemoveSection`.
 */

import { describe, expect, test } from 'bun:test'

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  AsyncGit,
  cliBackend,
  CommandFailed,
  Git,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '../index.ts'
import { makeGitFixture } from '../testing.ts'

function recorder(result: CommandResult = { exitCode: 0, stdout: '', stderr: '' }) {
  const calls: Array<{ argv: string[]; opts: CommandRunOptions }> = []
  const sync: CommandRunner = {
    run(argv, opts) {
      calls.push({ argv, opts })
      return result
    },
  }
  const async: AsyncCommandRunner = {
    run(argv, opts) {
      calls.push({ argv, opts })
      return Promise.resolve(result)
    },
  }
  return { calls, sync, async }
}

describe('diffText and diffAddedFile follow the failure contract', () => {
  test('a bad rev and a non-repository throw, also through try', async () => {
    const fx = makeGitFixture()
    const outside = mkdtempSync(join(tmpdir(), 'typed-git-not-a-repo-'))
    try {
      fx.commit('first', { 'a.md': 'one\n' })
      const git = fx.git
      expect(git.diffText()).toBe('')
      writeFileSync(join(fx.dir, 'a.md'), 'two\n')
      expect(git.diffText('HEAD')).toContain('+two')

      expect(() => git.diffText('does-not-exist')).toThrow(CommandFailed)
      const tried = git.try.diffText('does-not-exist')
      expect(tried.ok).toBe(false)

      const out = new Git(outside)
      expect(() => out.diffText()).toThrow(CommandFailed)
      expect(out.try.diffText().ok).toBe(false)

      const asyncGit = new AsyncGit(fx.dir)
      await expect(asyncGit.diffText('does-not-exist')).rejects.toBeInstanceOf(CommandFailed)
      expect((await asyncGit.try.diffText('does-not-exist')).ok).toBe(false)
    } finally {
      fx.cleanup()
      rmSync(outside, { recursive: true, force: true })
    }
  })

  test('diffAddedFile renders a file, and throws for a path git cannot read', async () => {
    const fx = makeGitFixture()
    try {
      writeFileSync(join(fx.dir, 'new.md'), 'hello\n')
      writeFileSync(join(fx.dir, 'empty.md'), '')
      const git = fx.git
      expect(git.diffAddedFile('new.md')).toContain('+hello')
      // An empty file is still a real diff, not a failure.
      expect(git.diffAddedFile('empty.md')).toContain('new file mode')

      expect(() => git.diffAddedFile('missing.md')).toThrow(CommandFailed)
      expect(git.try.diffAddedFile('missing.md').ok).toBe(false)
      const asyncGit = new AsyncGit(fx.dir)
      await expect(asyncGit.diffAddedFile('missing.md')).rejects.toBeInstanceOf(CommandFailed)
    } finally {
      fx.cleanup()
    }
  })
})

describe('call options on revParse, diffText and diffAddedFile', () => {
  const call = { timeoutMs: 5000, env: { PROBE: '1' } }

  test('Git passes timeoutMs and env through', () => {
    const r = recorder()
    const git = new Git('/repo', { runner: r.sync })
    git.revParse('--show-toplevel', call)
    git.revParse('HEAD')
    git.diffText('HEAD', { ...call, staged: true, paths: ['a.md'] })
    git.diffAddedFile('a.md', call)
    expect(r.calls.map((c) => c.argv)).toEqual([
      ['rev-parse', '--show-toplevel'],
      ['rev-parse', 'HEAD'],
      ['diff', '--cached', 'HEAD', '--', 'a.md'],
      ['diff', '--no-index', '--', '/dev/null', 'a.md'],
    ])
    for (const i of [0, 2, 3]) {
      expect(r.calls[i]!.opts.timeoutMs).toBe(5000)
      expect(r.calls[i]!.opts.env).toEqual({ PROBE: '1' })
    }
    expect(r.calls[1]!.opts.timeoutMs).toBeUndefined()
  })

  test('AsyncGit passes timeoutMs and env through', async () => {
    const r = recorder()
    const git = new AsyncGit('/repo', { backend: cliBackend({ runner: r.async }) })
    await git.revParse('--show-toplevel', call)
    await git.diffText('HEAD', { ...call, staged: true, paths: ['a.md'] })
    await git.diffAddedFile('a.md', call)
    expect(r.calls.map((c) => c.argv)).toEqual([
      ['rev-parse', '--show-toplevel'],
      ['diff', '--cached', 'HEAD', '--', 'a.md'],
      ['diff', '--no-index', '--', '/dev/null', 'a.md'],
    ])
    for (const c of r.calls) {
      expect(c.opts.timeoutMs).toBe(5000)
      expect(c.opts.env).toEqual({ PROBE: '1' })
    }
  })
})

describe('checkoutSide with no paths', () => {
  test('does nothing and returns, in both clients', async () => {
    const r = recorder({ exitCode: 128, stdout: '', stderr: 'fatal' })
    new Git('/repo', { runner: r.sync }).checkoutSide('ours', [])
    await new AsyncGit('/repo', { backend: cliBackend({ runner: r.async }) }).checkoutSide(
      'theirs',
      [],
    )
    expect(r.calls).toEqual([])
  })
})

describe('remotes() and the deprecated remote()', () => {
  test('both return the remote names', async () => {
    const fx = makeGitFixture()
    try {
      fx.git.remoteAdd('origin', '/store.git')
      fx.git.remoteAdd('upstream', '/other.git')
      expect(fx.git.remotes()).toEqual(['origin', 'upstream'])
      expect(fx.git.remote()).toEqual(fx.git.remotes())
      expect(fx.git.soft.remotes()).toEqual(['origin', 'upstream'])
      const asyncGit = new AsyncGit(fx.dir)
      expect(await asyncGit.remotes()).toEqual(['origin', 'upstream'])
      expect(await asyncGit.remote()).toEqual(['origin', 'upstream'])
    } finally {
      fx.cleanup()
    }
  })
})

describe('soft door', () => {
  test('configRemoveSection has no soft form', () => {
    const fail = recorder({ exitCode: 1, stdout: '', stderr: 'fatal' })
    const git = new Git('/repo', { runner: fail.sync })
    // Not in the type; at runtime a failure meets no table entry.
    const soft = git.soft as unknown as Record<string, (name: string) => unknown>
    expect(() => soft['configRemoveSection']!('branch.x')).toThrow(TypeError)
  })
})
