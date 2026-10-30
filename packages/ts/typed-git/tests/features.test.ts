/**
 * The git version probe and the feature table (`src/features.ts`).
 *
 * Fake runners answer `git --version` with each version string git prints in
 * the wild, then drive both sides of every table entry on both clients. The
 * last blocks check the README's table against the source one, and run the
 * gated verbs against the real git on this machine.
 */

import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { FailureError } from '@osdlc/result'

import {
  AsyncGit,
  cliBackend,
  spawnRunner,
  GIT_FEATURES,
  GIT_FLOOR,
  Git,
  parseGitVersion,
  partialBackend,
  UnsupportedRequest,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type GitFailure,
  type GitFeature,
  type GitFeatureSpec,
} from '../src/index.ts'
import { makeGitFixture } from '../src/testing.ts'
import { PROBE_TIMEOUT_MS } from '../src/git-version.ts'
import * as v from '../src/verbs.ts'
import { LOCAL_GIT, missingGitFeature } from './local-git.ts'

const OK = (stdout: string): CommandResult => ({ exitCode: 0, stdout, stderr: '' })
const VERSION = (text: string) => OK(`git version ${text}\n`)

/** A runner pair that answers `--version` with `version` and anything else with `reply`. */
function fake(version: CommandResult, reply: (argv: string[]) => CommandResult = () => OK('')) {
  const calls: string[][] = []
  const answer = (argv: string[]) => {
    calls.push([...argv])
    return argv[0] === '--version' ? version : reply(argv)
  }
  const sync: CommandRunner = { run: (argv) => answer(argv) }
  const async: AsyncCommandRunner = { run: (argv) => Promise.resolve(answer(argv)) }
  const probes = () => calls.filter((c) => c[0] === '--version').length
  return { calls, sync, async, probes }
}

/** The failure a call threw, or a test failure when it did not throw one. */
function thrown(call: () => unknown): GitFailure {
  try {
    call()
  } catch (error) {
    expect(error).toBeInstanceOf(FailureError)
    return (error as FailureError<GitFailure>).failure
  }
  throw new Error('expected a throw')
}

async function rejected(call: () => Promise<unknown>): Promise<GitFailure> {
  try {
    await call()
  } catch (error) {
    expect(error).toBeInstanceOf(FailureError)
    return (error as FailureError<GitFailure>).failure
  }
  throw new Error('expected a rejection')
}

describe('parseGitVersion', () => {
  test.each([
    ['git version 2.34.1\n', 2, 34, 1, '2.34.1'],
    ['git version 2.39.3 (Apple Git-146)\n', 2, 39, 3, '2.39.3 (Apple Git-146)'],
    ['git version 2.45.1.windows.1\n', 2, 45, 1, '2.45.1.windows.1'],
    ['git version 2.47.0.rc1\n', 2, 47, 0, '2.47.0.rc1'],
    ['git version 2.38\n', 2, 38, 0, '2.38'],
    ['git version 2.50.1\nbuild details on a second line\n', 2, 50, 1, '2.50.1'],
  ])('%j', (output, major, minor, patch, text) => {
    expect(parseGitVersion(output)).toEqual({ major, minor, patch, text })
  })

  test.each(['', 'hello', 'git version', 'version 2.34.1', 'git version two'])(
    '%j is not a version',
    (output) => {
      expect(parseGitVersion(output)).toBeNull()
    },
  )
})

describe('version()', () => {
  test('sync and async return the parsed version', async () => {
    const f = fake(VERSION('2.39.3 (Apple Git-146)'))
    const want = { major: 2, minor: 39, patch: 3, text: '2.39.3 (Apple Git-146)' }
    expect(new Git('/repo', { runner: f.sync }).version()).toEqual(want)
    const asyncGit = new AsyncGit('/repo', { backend: cliBackend({ runner: f.async }) })
    expect(await asyncGit.version()).toEqual(want)
    expect(f.calls).toEqual([['--version'], ['--version']])
  })

  test('the probe runs in the C locale, with the call options but no repository flags', () => {
    const seen: Array<{ argv: string[]; cwd: string; env?: unknown; timeoutMs?: number }> = []
    const runner: CommandRunner = {
      run(argv, opts) {
        const call: (typeof seen)[number] = { argv: [...argv], cwd: opts.cwd }
        if (opts.env !== undefined) call.env = opts.env
        if (opts.timeoutMs !== undefined) call.timeoutMs = opts.timeoutMs
        seen.push(call)
        return VERSION('2.50.1')
      },
    }
    new Git('/repo', { runner, gitDir: '/store.git', env: { A: '1' } }).version({ timeoutMs: 50 })
    // The probe runs in the temp directory, which always exists, not in the client's cwd.
    expect(seen).toEqual([
      { argv: ['--version'], cwd: tmpdir(), env: { A: '1', LC_ALL: 'C' }, timeoutMs: 50 },
    ])
  })

  test('a git that is not installed is not-installed, and is not cached', () => {
    let installed = false
    const runner: CommandRunner = {
      run: () =>
        installed
          ? VERSION('2.50.1')
          : {
              exitCode: 1,
              stdout: '',
              stderr: '',
              neverExited: true,
              reason: 'spawn',
              error: 'spawn git ENOENT',
            },
    }
    const git = new Git('/repo', { runner })
    expect(thrown(() => git.version()).kind).toBe('not-installed')
    const viaVerb = thrown(() => git.worktrees())
    expect(viaVerb.kind).toBe('not-installed')
    // The probe's failure names the verb that asked, so the user sees `git worktree`.
    expect(viaVerb.argv).toEqual(['worktree', 'list', '--porcelain', '-z'])
    expect(() => git.worktrees()).toThrow(/^git worktree: /)
    installed = true
    expect(git.version().minor).toBe(50)
  })

  test('output that is not a version line throws rather than guessing', () => {
    const git = new Git('/repo', { runner: fake(OK('')).sync })
    const failure = thrown(() => git.worktrees())
    expect(failure.kind).toBe('exit')
    // The failure names the verb that asked, not the probe.
    expect(failure.argv).toEqual(['worktree', 'list', '--porcelain', '-z'])
    expect(failure.message).toBe('git --version printed nothing, not a version')
    expect(thrown(() => git.version()).argv).toEqual(['--version'])
  })

  test('try.version reports the failure', () => {
    const r = new Git('/repo', { runner: fake(OK('nope')).sync }).try.version()
    expect(r.ok).toBe(false)
  })
})

describe('the probe is lazy and runs once per runner', () => {
  test('verbs that need no feature never probe', async () => {
    const f = fake(VERSION('2.50.1'))
    const git = new Git('/repo', { runner: f.sync })
    git.currentBranch()
    git.statusEntries()
    git.raw(['worktree', 'list'])
    const asyncGit = new AsyncGit('/repo', { backend: cliBackend({ runner: f.async }) })
    await asyncGit.currentBranch()
    await asyncGit.statusEntries()
    expect(f.probes()).toBe(0)
  })

  test('sync: one probe for many gated calls, shared with at() copies', () => {
    const f = fake(VERSION('2.50.1'), (argv) => (argv[0] === 'merge-tree' ? OK('t\x00') : OK('')))
    const git = new Git('/repo', { runner: f.sync })
    git.worktrees()
    git.worktrees()
    git.mergeTree('a', 'b')
    git.at('/elsewhere').worktrees()
    git.version()
    expect(f.probes()).toBe(1)
    // A client on another runner probes its own.
    new Git('/repo', { runner: fake(VERSION('2.50.1')).sync }).worktrees()
    expect(f.probes()).toBe(1)
  })

  test('async: concurrent first calls share one probe', async () => {
    const f = fake(VERSION('2.50.1'))
    const backend = cliBackend({ runner: f.async })
    const a = new AsyncGit('/repo', { backend })
    await Promise.all([a.worktrees(), a.worktrees(), a.at('/x').worktrees(), a.version()])
    await new AsyncGit('/repo', { backend: cliBackend({ runner: f.async }) }).worktrees()
    expect(f.probes()).toBe(1)
  })

  test('async: a failed probe is not cached', async () => {
    let answer: CommandResult = OK('garbage')
    const calls: string[][] = []
    const runner: AsyncCommandRunner = {
      run: (argv) => (calls.push(argv), Promise.resolve(argv[0] === '--version' ? answer : OK(''))),
    }
    const git = new AsyncGit('/repo', { backend: cliBackend({ runner }) })
    expect((await rejected(() => git.worktrees())).kind).toBe('exit')
    answer = VERSION('2.50.1')
    expect(await git.worktrees()).toEqual([])
    expect(calls.filter((c) => c[0] === '--version')).toHaveLength(2)
  })
})

// Every table entry, at the version it needs and the release before it, on
// both clients. The verb that exercises each entry is listed here; the test
// below checks that the list covers the table.
const EXERCISE: Record<
  GitFeature,
  {
    sync: (git: Git) => unknown
    async: (git: AsyncGit) => Promise<unknown>
    argv: string[]
    fallbackArgv?: string[]
  }
> = {
  'merge-tree --write-tree': {
    sync: (git) => git.mergeTree('a', 'b'),
    async: (git) => git.mergeTree('a', 'b'),
    argv: ['merge-tree', '--write-tree', '--name-only', '-z', 'a', 'b'],
  },
  'merge-tree --merge-base': {
    sync: (git) => git.mergeTree('a', 'b', { mergeBase: 'c' }),
    async: (git) => git.mergeTree('a', 'b', { mergeBase: 'c' }),
    argv: ['merge-tree', '--write-tree', '--name-only', '-z', '--merge-base=c', 'a', 'b'],
  },
  'worktree list -z': {
    sync: (git) => git.worktrees(),
    async: (git) => git.worktrees(),
    argv: ['worktree', 'list', '--porcelain', '-z'],
    fallbackArgv: ['worktree', 'list', '--porcelain'],
  },
}

/** `merge-tree` must answer with a tree, or its parser refuses the output. */
const reply = (argv: string[]) => (argv[0] === 'merge-tree' ? OK('deadbeef\x00') : OK(''))
const ran = (calls: string[][]) => calls.filter((c) => c[0] !== '--version')

describe('the feature table, both sides of each entry', () => {
  test('every entry has a case here', () => {
    expect(Object.keys(EXERCISE).sort()).toEqual(Object.keys(GIT_FEATURES).sort())
  })

  describe.each(
    Object.entries(GIT_FEATURES) as Array<[GitFeature, (typeof GIT_FEATURES)[GitFeature]]>,
  )('%s', (feature, spec) => {
    const at = `${spec.minimum.major}.${spec.minimum.minor}.0`
    const before = `${spec.minimum.major}.${spec.minimum.minor - 1}.9`
    const ex = EXERCISE[feature]

    test(`git ${at} runs the feature`, async () => {
      const s = fake(VERSION(at), reply)
      const a = fake(VERSION(at), reply)
      ex.sync(new Git('/repo', { runner: s.sync }))
      await ex.async(new AsyncGit('/repo', { backend: cliBackend({ runner: a.async }) }))
      expect(ran(s.calls)).toEqual([ex.argv])
      expect(ran(a.calls)).toEqual([ex.argv])
    })

    test(`git ${before} ${'fallback' in spec ? 'falls back' : 'fails as unsupported-git'}`, async () => {
      const s = fake(VERSION(before), reply)
      const a = fake(VERSION(before), reply)
      const git = new Git('/repo', { runner: s.sync, gitDir: '/store.git' })
      const asyncGit = new AsyncGit('/repo', {
        backend: cliBackend({ runner: a.async, gitDir: '/store.git' }),
      })
      if ('fallback' in spec) {
        ex.sync(git)
        await ex.async(asyncGit)
        expect(ran(s.calls)).toEqual([['--git-dir=/store.git', ...ex.fallbackArgv!]])
        expect(ran(a.calls)).toEqual(ran(s.calls))
        return
      }
      const failures = [thrown(() => ex.sync(git)), await rejected(() => ex.async(asyncGit))]
      for (const failure of failures) {
        const needs = `${spec.minimum.major}.${spec.minimum.minor}`
        expect(failure).toMatchObject({
          kind: 'unsupported-git',
          message: `${feature} needs git ${needs} or later; found ${before}.`,
          hint: `Upgrade git to ${needs} or later from https://git-scm.com.`,
          detail: `git version ${before}`,
          argv: ['--git-dir=/store.git', ...ex.argv],
          exitCode: null,
          unsupported: {
            feature,
            needs: spec.minimum,
            have: { major: 2, minor: spec.minimum.minor - 1, patch: 9, text: before },
          },
        })
        expect(failure.cause).toBeUndefined()
      }
      // git ran only the probe.
      expect(ran(s.calls)).toEqual([])
      expect(ran(a.calls)).toEqual([])
    })
  })

  test('a fallback is used only where the table has one', () => {
    for (const verb of [
      v.worktrees(),
      v.mergeTree('a', 'b'),
      v.mergeTree('a', 'b', { mergeBase: 'c' }),
    ]) {
      const spec = GIT_FEATURES[verb.needs!]
      expect(verb.fallback !== undefined).toBe('fallback' in spec)
    }
  })

  test.each([
    ['2.39.3 (Apple Git-146)', true, false],
    ['2.45.1.windows.1', true, true],
    ['2.40.0.rc1', true, true],
    ['2.38.0.rc0', true, false],
    ['2.37.7', false, false],
  ])('git %s: merge-tree %s, --merge-base %s', (text, writeTree, mergeBase) => {
    const outcome = (call: (git: Git) => unknown) => {
      try {
        call(new Git('/repo', { runner: fake(VERSION(text), reply).sync }))
        return true
      } catch (error) {
        expect((error as FailureError<GitFailure>).failure.kind).toBe('unsupported-git')
        return false
      }
    }
    expect(outcome((git) => git.mergeTree('a', 'b'))).toBe(writeTree)
    expect(outcome((git) => git.mergeTree('a', 'b', { mergeBase: 'c' }))).toBe(mergeBase)
  })
})

describe('below the 2.34 floor', () => {
  test('every gated verb fails as typed-git, with no fallback tried', async () => {
    const s = fake(VERSION('2.33.8'), reply)
    const a = fake(VERSION('2.33.8'), reply)
    const git = new Git('/repo', { runner: s.sync })
    const asyncGit = new AsyncGit('/repo', { backend: cliBackend({ runner: a.async }) })
    for (const ex of Object.values(EXERCISE)) {
      for (const failure of [
        thrown(() => ex.sync(git)),
        await rejected(() => ex.async(asyncGit)),
      ]) {
        expect(failure.kind).toBe('unsupported-git')
        expect(failure.message).toBe('typed-git needs git 2.34 or later; found 2.33.8.')
        expect(failure.unsupported?.feature).toBe('typed-git')
        expect(failure.unsupported?.needs).toEqual(GIT_FLOOR)
      }
    }
    expect(ran(s.calls)).toEqual([])
    expect(ran(a.calls)).toEqual([])
  })

  test('verbs that need no feature still run', () => {
    const f = fake(VERSION('2.20.0'), () => OK('main\n'))
    expect(new Git('/repo', { runner: f.sync }).currentBranch()).toBe('main')
  })

  test('the thrown message names the command, like every other failure', () => {
    const git = new Git('/repo', { runner: fake(VERSION('2.30.0')).sync })
    expect(() => git.worktrees()).toThrow(
      'git worktree: typed-git needs git 2.34 or later; found 2.30.0. Upgrade git to 2.34 or later from https://git-scm.com.',
    )
  })
})

describe('try and soft treat unsupported-git like any other failure', () => {
  test('try returns it; soft returns the absence value', async () => {
    const f = fake(VERSION('2.30.0'))
    const git = new Git('/repo', { runner: f.sync })
    const r = git.try.worktrees()
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error.kind).toBe('unsupported-git')
    expect(git.soft.worktrees()).toEqual([])
    const asyncGit = new AsyncGit('/repo', { backend: cliBackend({ runner: f.async }) })
    const ar = await asyncGit.try.mergeTree('a', 'b')
    expect(ar.ok).toBe(false)
    if (!ar.ok) expect(ar.error.kind).toBe('unsupported-git')
    expect(await asyncGit.soft.worktrees()).toEqual([])
  })
})

describe('a backend other than the CLI', () => {
  test('gets gated requests unchecked; version is its own to answer', async () => {
    const backend = partialBackend('memory', {
      mergeTree: async () => ({ status: 'clean', tree: 't' }),
    })
    const git = new AsyncGit('/repo', { backend })
    expect(await git.mergeTree('a', 'b')).toEqual({ status: 'clean', tree: 't' })
    await expect(git.version()).rejects.toBeInstanceOf(UnsupportedRequest)
  })
})

describe('the shared async probe', () => {
  /** An async runner whose `--version` answers only when released. */
  function gated() {
    const probes: Array<{ cwd: string; signal: unknown; timeoutMs: unknown }> = []
    let release: () => void = () => {}
    const released = new Promise<void>((r) => (release = r))
    const runner: AsyncCommandRunner = {
      async run(argv, opts) {
        if (argv[0] !== '--version') return OK('')
        probes.push({ cwd: opts.cwd, signal: opts.signal, timeoutMs: opts.timeoutMs })
        await released
        return VERSION('2.50.1')
      },
    }
    return { runner, probes, release }
  }

  test('runs once, in the temp directory, with no caller signal and a fixed limit', async () => {
    const g = gated()
    const git = new AsyncGit('/no/such/dir', { backend: cliBackend({ runner: g.runner }) })
    const both = Promise.all([
      git.worktrees({ timeoutMs: 60_000 }),
      git.worktrees({ signal: new AbortController().signal }),
    ])
    g.release()
    await both
    expect(g.probes).toEqual([{ cwd: tmpdir(), signal: undefined, timeoutMs: PROBE_TIMEOUT_MS }])
  })

  test('a caller that aborts rejects alone; the probe goes on for the others', async () => {
    const g = gated()
    const git = new AsyncGit('/repo', { backend: cliBackend({ runner: g.runner }) })
    const ctl = new AbortController()
    const a = git.worktrees({ signal: ctl.signal })
    const b = git.worktrees()
    ctl.abort()
    const failure = await rejected(() => a)
    expect(failure.kind).toBe('aborted')
    expect(failure.argv).toEqual(['worktree', 'list', '--porcelain', '-z'])
    g.release()
    expect(await b).toEqual([])
    expect(g.probes).toHaveLength(1)
    // The answer was cached for the next caller.
    expect((await git.version()).minor).toBe(50)
    expect(g.probes).toHaveLength(1)
  })

  test('an already-aborted signal rejects without waiting', async () => {
    const g = gated()
    const git = new AsyncGit('/repo', { backend: cliBackend({ runner: g.runner }) })
    const ctl = new AbortController()
    ctl.abort()
    expect((await rejected(() => git.worktrees({ signal: ctl.signal }))).kind).toBe('aborted')
    g.release()
  })

  test('a caller that times out rejects alone; the probe goes on for the others', async () => {
    const g = gated()
    const git = new AsyncGit('/repo', { backend: cliBackend({ runner: g.runner }) })
    const a = git.worktrees({ timeoutMs: 1 })
    const b = git.worktrees()
    const failure = await rejected(() => a)
    expect(failure.kind).toBe('timeout')
    expect(failure.argv).toEqual(['worktree', 'list', '--porcelain', '-z'])
    g.release()
    expect(await b).toEqual([])
    expect(g.probes).toHaveLength(1)
  })

  test('real git: a caller with a missing cwd does not fail the others', async () => {
    const fx = makeGitFixture()
    try {
      const backend = cliBackend()
      const [bad, good] = await Promise.allSettled([
        new AsyncGit(join(fx.dir, 'no-such-dir'), { backend }).worktrees(),
        new AsyncGit(fx.dir, { backend }).worktrees(),
      ])
      expect(bad.status).toBe('rejected')
      if (bad.status === 'rejected') {
        const failure = (bad.reason as FailureError<GitFailure>).failure
        expect(failure.kind).toBe('bad-cwd')
        expect(failure.argv[0]).toBe('worktree')
      }
      expect(good.status).toBe('fulfilled')
    } finally {
      fx.cleanup()
    }
  })
})

describe('the cache is per runner and PATH', () => {
  /** A runner whose git version depends on the PATH it is given. */
  function byPath() {
    const probes: Array<string | undefined> = []
    const runner: CommandRunner = {
      run(argv, opts) {
        if (argv[0] !== '--version') return OK('')
        const path = opts.env?.['PATH'] ?? process.env['PATH']
        probes.push(path)
        return VERSION(path === '/old/bin' ? '2.30.2' : '2.50.1')
      },
    }
    return { runner, probes }
  }

  test('one runner, two PATHs: two probes, two versions', () => {
    const { runner, probes } = byPath()
    const git = new Git('/repo', { runner })
    const old = new Git('/repo', { runner, env: { PATH: '/old/bin' } })
    expect(git.version().minor).toBe(50)
    expect(old.version().minor).toBe(30)
    expect(thrown(() => old.worktrees()).unsupported?.feature).toBe('typed-git')
    git.worktrees()
    expect(git.version({ env: { PATH: '/old/bin' } }).minor).toBe(30)
    expect(probes).toHaveLength(2)
  })

  test('at() keeps the client env, and so its cache entry', () => {
    const { runner, probes } = byPath()
    const old = new Git('/repo', { runner, env: { PATH: '/old/bin' } })
    old.version()
    expect(old.at('/elsewhere').version().minor).toBe(30)
    expect(probes).toEqual(['/old/bin'])
  })

  test('async: the same, through one cliBackend runner', async () => {
    const probes: Array<string | undefined> = []
    const runner: AsyncCommandRunner = {
      run: (argv, opts) => {
        if (argv[0] !== '--version') return Promise.resolve(OK(''))
        probes.push(opts.env?.['PATH'])
        return Promise.resolve(VERSION(opts.env?.['PATH'] === '/old/bin' ? '2.30.2' : '2.50.1'))
      },
    }
    const git = new AsyncGit('/repo', { backend: cliBackend({ runner }) })
    expect((await git.version()).minor).toBe(50)
    expect((await git.version({ env: { PATH: '/old/bin' } })).minor).toBe(30)
    expect((await git.version({ env: { PATH: '/old/bin' } })).minor).toBe(30)
    expect(probes).toHaveLength(2)
  })

  test.skipIf(process.platform === 'win32')(
    'real runner: a `git` earlier on PATH is probed as its own git',
    () => {
      const bin = mkdtempSync(join(tmpdir(), 'typedgit-fake-git-'))
      try {
        const script = join(bin, 'git')
        writeFileSync(script, '#!/bin/sh\necho "git version 2.30.2"\n')
        chmodSync(script, 0o755)
        const runner = spawnRunner('git', { absolutePathOnly: true })
        const real = new Git(tmpdir(), { runner })
        const fake = new Git(tmpdir(), { runner, env: { PATH: `${bin}:${process.env['PATH']}` } })
        expect(real.version()).toEqual(LOCAL_GIT)
        expect(fake.version().text).toBe('2.30.2')
        expect(real.at(bin).version()).toEqual(LOCAL_GIT)
        expect(fake.at(bin).version().text).toBe('2.30.2')
      } finally {
        rmSync(bin, { recursive: true, force: true })
      }
    },
  )
})

describe('the gitVersion option pins the version', () => {
  const clients = (gitVersion: string, f = fake(OK('not a version'), reply)) => ({
    f,
    git: new Git('/repo', { runner: f.sync, gitVersion }),
    asyncGit: new AsyncGit('/repo', { backend: cliBackend({ runner: f.async, gitVersion }) }),
  })

  test('version() returns it and nothing runs', async () => {
    const { f, git, asyncGit } = clients('2.39.3 (Apple Git-146)')
    const want = { major: 2, minor: 39, patch: 3, text: '2.39.3 (Apple Git-146)' }
    expect(git.version()).toEqual(want)
    expect(await asyncGit.version()).toEqual(want)
    expect(f.calls).toEqual([])
  })

  test('a whole `git version` line is accepted too', () => {
    const git = new Git('/repo', {
      runner: fake(OK('')).sync,
      gitVersion: 'git version 2.45.1.windows.1',
    })
    expect(git.version()).toMatchObject({ major: 2, minor: 45, patch: 1, text: '2.45.1.windows.1' })
  })

  test.each(['', 'latest', '2', 'v2.55.0'])('%j throws a RangeError at construction', (bad) => {
    expect(() => new Git('/repo', { gitVersion: bad })).toThrow(RangeError)
    expect(() => cliBackend({ gitVersion: bad })).toThrow(RangeError)
  })

  test.each(Object.entries(EXERCISE))(
    '%s: both sides of the entry, with no probe',
    async (feature, ex) => {
      const spec: GitFeatureSpec = GIT_FEATURES[feature as GitFeature]
      const at = `${spec.minimum.major}.${spec.minimum.minor}.0`
      const before = `${spec.minimum.major}.${spec.minimum.minor - 1}.0`

      const now = clients(at)
      ex.sync(now.git)
      await ex.async(now.asyncGit)
      expect(now.f.calls).toEqual([ex.argv, ex.argv])

      const old = clients(before)
      if (spec.fallback !== undefined) {
        ex.sync(old.git)
        await ex.async(old.asyncGit)
        expect(old.f.calls).toEqual([ex.fallbackArgv, ex.fallbackArgv])
      } else {
        expect(thrown(() => ex.sync(old.git)).unsupported?.feature).toBe(feature)
        expect((await rejected(() => ex.async(old.asyncGit))).unsupported?.feature).toBe(feature)
        expect(old.f.calls).toEqual([])
      }
    },
  )

  test('a pin below the floor fails as typed-git', async () => {
    const { f, git, asyncGit } = clients('2.30.0')
    expect(thrown(() => git.worktrees()).unsupported?.feature).toBe('typed-git')
    expect((await rejected(() => asyncGit.worktrees())).unsupported?.feature).toBe('typed-git')
    expect(f.calls).toEqual([])
  })

  test('at() keeps it, on both clients', async () => {
    const { f, git, asyncGit } = clients('2.35.0')
    git.at('/elsewhere').worktrees()
    await asyncGit.at('/elsewhere').worktrees()
    expect(f.calls).toEqual([
      ['worktree', 'list', '--porcelain'],
      ['worktree', 'list', '--porcelain'],
    ])
    expect(git.at('/elsewhere').version().minor).toBe(35)
  })
})

describe('the README table matches GIT_FEATURES', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8')
  const section = readme.slice(readme.indexOf('## Git versions'), readme.indexOf('## Stability'))
  const rows = section.split('\n').filter((l) => /^\| `[^`]+` \| \d/.test(l))

  test('states the 2.34 floor', () => {
    expect(GIT_FLOOR).toEqual({ major: 2, minor: 34, patch: 0 })
    expect(section).toContain('The supported floor is git 2.34')
  })

  test.each(Object.entries(GIT_FEATURES))('%s', (feature, spec) => {
    const row = rows.find((r) => r.startsWith(`| \`${feature}\` |`))
    expect(row).toBeDefined()
    const cells = row!.split(' | ').map((c) => c.replace(/^\| |\s*\|$/g, ''))
    expect(cells[1]).toBe(`${spec.minimum.major}.${spec.minimum.minor}`)
    expect(cells[2]).toBe(spec.usedBy.map((m) => `\`${m}\``).join(', '))
    expect(cells[3]).toBe('fallback' in spec ? spec.fallback : 'throws `unsupported-git`')
  })

  test('lists no feature the table lacks', () => {
    expect(rows).toHaveLength(Object.keys(GIT_FEATURES).length)
  })
})

describe(`real git (${LOCAL_GIT.text})`, () => {
  test('worktrees() reads a lock reason, on either side of 2.36', () => {
    const fx = makeGitFixture()
    const scratch = mkdtempSync(join(tmpdir(), 'typedgit-wt-'))
    try {
      fx.commit('base', { 'a.txt': 'a\n' })
      const wt = join(scratch, 'wt')
      fx.git.worktreeAdd(wt, { branch: 'side' })
      fx.git.rawChecked(['worktree', 'lock', '--reason', 'line one\nline two', wt])
      const row = fx.git.worktrees().find((w) => w.branch === 'side')!
      expect(row.locked).toBe(true)
      // -z reads the reason as written; the newline form keeps git's C-quotes.
      expect(row.lockReason).toBe(
        missingGitFeature('worktree list -z') === null
          ? 'line one\nline two'
          : '"line one\\nline two"',
      )
    } finally {
      fx.cleanup()
      rmSync(scratch, { recursive: true, force: true })
    }
  })

  // `-z` is the only form that can carry a newline in a path. A newline is not
  // a legal path character on Windows.
  test.skipIf(missingGitFeature('worktree list -z') !== null || process.platform === 'win32')(
    'worktrees() reads -z records: a newline in a path, detached and prunable',
    () => {
      const fx = makeGitFixture()
      const scratch = realpathSync(mkdtempSync(join(tmpdir(), 'typedgit-wt-')))
      try {
        fx.commit('base', { 'a.txt': 'a\n' })
        const head = fx.git.revParse('HEAD')
        const odd = join(scratch, 'line one\nline two')
        const detached = join(scratch, 'detached')
        const gone = join(scratch, 'gone')
        fx.git.worktreeAdd(odd, { branch: 'odd' })
        fx.git.rawChecked(['worktree', 'add', '--detach', detached])
        fx.git.worktreeAdd(gone, { branch: 'gone' })
        // Deleting the directory leaves the entry prunable.
        rmSync(gone, { recursive: true, force: true })

        const rows = fx.git.worktrees()
        expect(rows).toHaveLength(4)
        expect(rows).toContainEqual(expect.objectContaining({ path: odd, branch: 'odd', head }))
        expect(rows).toContainEqual(
          expect.objectContaining({
            path: detached,
            head,
            branch: null,
            detached: true,
            bare: false,
          }),
        )
        // A prunable entry keeps its branch and the HEAD it had.
        expect(rows).toContainEqual(expect.objectContaining({ path: gone, branch: 'gone', head }))
      } finally {
        fx.cleanup()
        rmSync(scratch, { recursive: true, force: true })
      }
    },
  )

  test('version() is the git on PATH', () => {
    expect(LOCAL_GIT.major).toBeGreaterThanOrEqual(2)
    expect(new Git(tmpdir()).version()).toEqual(LOCAL_GIT)
  })
})
