/**
 * Ref, remote, URL, path, pattern and config-key positionals that start with
 * `-` are refused with a `TypeError` before git runs. git would read them as options:
 * `--upload-pack=<cmd>` as a remote runs `<cmd>`.
 */

import { describe, expect, test } from 'bun:test'

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  AsyncGit,
  cliBackend,
  Git,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '../index.ts'
import { makeGitFixture } from '../testing.ts'

const OK: CommandResult = { exitCode: 0, stdout: '', stderr: '' }

function recorder() {
  const calls: string[][] = []
  const sync: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return OK
    },
  }
  const async: AsyncCommandRunner = {
    run(argv) {
      calls.push(argv)
      return Promise.resolve(OK)
    },
  }
  return { calls, sync, async }
}

type Method = (...args: unknown[]) => unknown

function call(client: Git | AsyncGit, name: string, args: unknown[]): unknown {
  const method = (client as unknown as Record<string, Method>)[name]!
  return method.apply(client, args)
}

/** One case per verb on the list: the verb and arguments with one `-` value. */
const CASES: Array<[string, unknown[]]> = [
  ['showAtRev', ['-x', 'a.md']],
  ['resolveRef', ['-x']],
  ['symbolicRef', ['-x']],
  ['mergeBase', ['main', '-x']],
  ['logSubject', ['-x']],
  ['objectExists', ['-x']],
  ['lsRemote', ['--upload-pack=touch FILE', 'HEAD']],
  ['isAncestor', ['-x', 'main']],
  ['aheadBehind', ['main', '-x']],
  ['remoteGetUrl', ['-x']],
  ['fetch', ['--upload-pack=touch FILE', 'HEAD']],
  ['clone', ['--upload-pack=touch FILE', 'dest']],
  ['push', ['--receive-pack=touch FILE', 'HEAD']],
  ['resetHard', ['-x']],
  ['deleteBranch', ['-x']],
  ['deleteRef', ['refs/heads/a', { expected: '-x' }]],
  ['worktreeAdd', ['-x']],
  ['worktreeRemove', ['-x']],
  ['worktreeMove', ['/wt', '-x']],
  ['remoteAdd', ['origin', '--x']],
  ['merge', ['-x']],
  ['rebase', ['-x']],
  ['mergeTree', ['main', '-x']],
  ['checkout', ['--orphan=probe']],
  ['branches', ['--all']],
  ['lsTree', ['-x']],
  ['diffText', ['-x']],
  ['diffTree', ['-x']],
  ['diffTreeNumstat', ['-x']],
  ['log', [{ rev: '--output=FILE' }]],
  ['diffNameOnly', [{ rangeArgs: ['--output=FILE'] }]],
  ['diffStat', [{ rangeArgs: ['--output=FILE'] }]],
  ['diffNameStatus', [{ range: '--output=FILE' }]],
  ['forEachRef', ['--count=1']],
  ['init', ['--template=/tmp']],
  ['configGet', ['--file=/tmp/x']],
  ['configGetAll', ['--file=/tmp/x']],
  ['configGetBool', ['--file=/tmp/x']],
  ['remoteGetUrls', ['-x']],
  ['remoteHead', ['--upload-pack=touch FILE']],
  ['configSet', ['--file=/tmp/x', 'a.b']],
  ['configRemoveSection', ['--file=/tmp/x']],
]

/** The second positional, or an option-borne one, of verbs that take several. */
const MORE_CASES: Array<[string, unknown[]]> = [
  ['mergeBase', ['-x', 'main']],
  ['isAncestor', ['main', '-x']],
  ['aheadBehind', ['-x', 'main']],
  ['lsRemote', ['origin', '-x']],
  ['fetch', ['origin', '-x']],
  ['fetch', ['origin', ['main', '-x']]],
  ['clone', ['/store.git', '-x']],
  ['push', ['origin', '-x']],
  ['deleteRef', ['-x', { expected: 'abc' }]],
  ['worktreeAdd', ['/wt', { startPoint: '-x' }]],
  ['worktreeMove', ['-x', '/wt']],
  ['remoteAdd', ['-x', '/store.git']],
  ['mergeTree', ['-x', 'main']],
  ['log', [{ range: '-x' }]],
  ['log', [{ rev: 'main', notRefs: ['origin/main', '-x'] }]],
  ['diffNameOnly', [{ rangeArgs: ['main', '-x'] }]],
  ['diffStat', [{ rangeArgs: ['main', '-x'] }]],
  ['forEachRef', [['refs/heads', '-x']]],
]

/** The verb names passed to `positional` or `optionalPositional` in `verbs.ts`. */
function guardedVerbs(): Set<string> {
  const source = readFileSync(new URL('../verbs.ts', import.meta.url), 'utf8')
  const names = [...source.matchAll(/\b(?:optionalP|p)ositional\(\s*'(\w+)'/g)].map((m) => m[1]!)
  return new Set(names)
}

describe('leading-dash positionals', () => {
  test('the cases cover every guarded verb in verbs.ts', () => {
    const cased = new Set(CASES.map(([name]) => name))
    expect([...cased].sort()).toEqual([...guardedVerbs()].sort())
    expect(cased.size).toBe(42)
  })

  test.each([...CASES, ...MORE_CASES])('Git.%s refuses before spawning', (name, args) => {
    const r = recorder()
    const git = new Git('/repo', { runner: r.sync })
    expect(() => call(git, name, args)).toThrow(TypeError)
    expect(r.calls).toEqual([])
  })

  test.each([...CASES, ...MORE_CASES])(
    'AsyncGit.%s rejects before spawning',
    async (name, args) => {
      const r = recorder()
      const git = new AsyncGit('/repo', { backend: cliBackend({ runner: r.async }) })
      // Called directly: a synchronous throw fails the test instead of passing.
      const pending = call(git, name, args)
      expect(pending).toBeInstanceOf(Promise)
      await expect(pending).rejects.toBeInstanceOf(TypeError)
      expect(r.calls).toEqual([])
    },
  )

  test('the message names the verb, the parameter and the value', () => {
    const git = new Git('/repo', { runner: recorder().sync })
    expect(() => git.fetch('--upload-pack=x')).toThrow(
      'typed-git: fetch: remote must not start with "-" (got "--upload-pack=x")',
    )
  })

  test('try and soft let the TypeError through', async () => {
    const git = new Git('/repo', { runner: recorder().sync })
    expect(() => git.try.resolveRef('-x')).toThrow(TypeError)
    expect(() => git.soft.resolveRef('-x')).toThrow(TypeError)
    const asyncGit = new AsyncGit('/repo', { backend: cliBackend({ runner: recorder().async }) })
    await expect(asyncGit.try.resolveRef('-x')).rejects.toBeInstanceOf(TypeError)
  })

  test('values that only contain a dash, and revParse flags, still run', () => {
    const r = recorder()
    const git = new Git('/repo', { runner: r.sync })
    git.checkout('feature-x')
    git.fetch('origin', '+refs/heads/*:refs/remotes/origin/*')
    git.revParse('--show-toplevel')
    expect(r.calls).toEqual([
      ['checkout', 'feature-x'],
      ['fetch', 'origin', '+refs/heads/*:refs/remotes/origin/*'],
      ['rev-parse', '--show-toplevel'],
    ])
  })
})

describe('leading-dash positionals against real git', () => {
  test('lsRemote and fetch with --upload-pack leave the sentinel file absent', () => {
    const fx = makeGitFixture()
    const scratch = mkdtempSync(join(tmpdir(), 'typed-git-dash-'))
    try {
      fx.commit('first', { 'a.md': 'one\n' })
      const sentinel = join(scratch, 'FILE')
      const evil = `--upload-pack=touch ${sentinel}`
      expect(() => fx.git.lsRemote(evil, 'HEAD')).toThrow(TypeError)
      expect(() => fx.git.fetch(evil, 'HEAD')).toThrow(TypeError)
      expect(existsSync(sentinel)).toBe(false)
    } finally {
      fx.cleanup()
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('verbs that could write a file are refused and the file stays absent', () => {
    const fx = makeGitFixture()
    const scratch = mkdtempSync(join(tmpdir(), 'typed-git-dash-'))
    try {
      fx.commit('first', { 'a.md': 'one\n' })
      const sentinel = join(scratch, 'FILE')
      const out = `--output=${sentinel}`
      const calls: Array<() => unknown> = [
        () => fx.git.log({ rev: out }),
        () => fx.git.log({ range: out }),
        () => fx.git.log({ rev: 'HEAD', notRefs: [out] }),
        () => fx.git.diffNameOnly({ rangeArgs: [out] }),
        () => fx.git.diffStat({ rangeArgs: ['HEAD', out] }),
        () => fx.git.diffNameStatus({ range: out }),
        () => fx.git.forEachRef(out),
        () => fx.git.init(`--separate-git-dir=${sentinel}`),
        () => fx.git.init(`--template=${scratch}`),
        () => fx.git.configGet(`--file=${sentinel}`),
        () => fx.git.configSet(`--file=${sentinel}`, 'a.b'),
        () => fx.git.configRemoveSection(`--file=${sentinel}`),
      ]
      for (const run of calls) expect(run).toThrow(TypeError)
      expect(existsSync(sentinel)).toBe(false)
      expect(fx.git.log({ format: '%s' })).toBe('first\n')
    } finally {
      fx.cleanup()
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  test('grep searches for a pattern that starts with -', () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'keep -foo here\nother\n' })
      expect(fx.git.grep('-foo')).toEqual(['a.md:keep -foo here'])
      expect(fx.git.grep('-fnone')).toEqual([])
    } finally {
      fx.cleanup()
    }
  })

  test('checkout --orphan is refused and HEAD does not move', () => {
    const fx = makeGitFixture()
    try {
      fx.commit('first', { 'a.md': 'one\n' })
      expect(() => fx.git.checkout('--orphan=probe')).toThrow(TypeError)
      expect(fx.git.currentBranch()).toBe('main')
    } finally {
      fx.cleanup()
    }
  })
})
