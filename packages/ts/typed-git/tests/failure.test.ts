/**
 * `git.try.*` classifies a failed call as a `GitFailure`: git's stderr gives
 * the git-specific kinds, the subprocess layer gives the rest, and `cause` is
 * the `CommandFailed` it came from.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe as suite, expect, expectTypeOf, test } from 'vitest'

import { FailureError } from '@osdlc/result'

import { describe } from '@osdlc/result'

import {
  AsyncGit,
  classifyGitFailure,
  cliBackend,
  describeGitFailure,
  CommandFailed,
  Git,
  type CommandResult,
  type CommandRunner,
  type GitFailure,
  type GitFailureKind,
} from '../src/index.ts'
import { makeGitFixture } from '../src/testing.ts'

const fail = (stderr: string, exitCode = 128, stdout = ''): CommandResult => ({
  exitCode,
  stdout,
  stderr,
})
const runnerOf = (result: CommandResult): CommandRunner => ({
  binary: 'git',
  run: () => result,
})
const tried = (result: CommandResult): GitFailure => {
  const r = new Git('/x', { runner: runnerOf(result) }).try.statusPorcelain()
  if (r.ok) throw new Error('expected a failure')
  return r.error
}

suite('stderr patterns', () => {
  const cases: Array<[string, CommandResult, GitFailureKind, string]> = [
    [
      'not a git repository',
      fail('fatal: not a git repository (or any of the parent directories): .git'),
      'not-a-repo',
      'This is not a git repository.',
    ],
    [
      'No such remote (colon form)',
      fail("error: No such remote: 'upstream'"),
      'no-remote',
      "The remote 'upstream' does not exist.",
    ],
    [
      'No such remote (fatal form)',
      fail("fatal: No such remote 'origin'"),
      'no-remote',
      "The remote 'origin' does not exist.",
    ],
    [
      'does not appear to be a git repository',
      fail(
        "fatal: 'nope' does not appear to be a git repository\nfatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights\nand the repository exists.",
      ),
      'no-remote',
      "The remote 'nope' does not exist or is not a git repository.",
    ],
    [
      'Could not read from remote repository',
      fail(
        'fatal: Could not read from remote repository.\n\nPlease make sure you have the correct access rights',
      ),
      'remote-unreachable',
      'The remote could not be reached.',
    ],
    [
      'Could not resolve host',
      fail(
        "fatal: unable to access 'https://example.invalid/r.git/': Could not resolve host: example.invalid",
      ),
      'remote-unreachable',
      'The remote could not be reached.',
    ],
    [
      'unable to access, HTTP 403 (the host refused: not a retry)',
      fail(
        "fatal: unable to access 'https://github.com/o/r.git/': The requested URL returned error: 403",
      ),
      'not-authenticated',
      'The remote refused the credentials.',
    ],
    [
      'unable to access, HTTP 401',
      fail(
        "fatal: unable to access 'https://github.com/o/r.git/': The requested URL returned error: 401",
      ),
      'not-authenticated',
      'The remote refused the credentials.',
    ],
    [
      'unable to access, HTTP 404 (a wrong URL: not a retry)',
      fail(
        "fatal: unable to access 'https://github.com/o/nope.git/': The requested URL returned error: 404",
      ),
      'not-found',
      'The remote repository was not found, or you cannot see it.',
    ],
    [
      'unable to access, SSL certificate problem (not a retry)',
      fail(
        "fatal: unable to access 'https://git.example.com/o/r.git/': SSL certificate problem: unable to get local issuer certificate",
      ),
      'tls',
      "The remote's TLS certificate could not be verified.",
    ],
    [
      'unable to access, a timeout stays unreachable',
      fail(
        "fatal: unable to access 'https://github.com/o/r.git/': Failed to connect to github.com port 443 after 21000 ms: Timed out",
      ),
      'remote-unreachable',
      'The remote could not be reached.',
    ],
    [
      'Authentication failed',
      fail(
        "remote: Invalid username or password.\nfatal: Authentication failed for 'https://github.com/o/r.git/'",
      ),
      'not-authenticated',
      'The remote refused the credentials.',
    ],
    [
      'Permission denied (publickey) beats "Could not read from remote"',
      fail(
        'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.',
      ),
      'not-authenticated',
      'The remote refused the credentials.',
    ],
    [
      'could not read Username',
      fail("fatal: could not read Username for 'https://github.com': terminal prompts disabled"),
      'not-authenticated',
      'The remote refused the credentials.',
    ],
  ]

  test.each(cases)('%s', (_name, result, kind, message) => {
    const f = tried(result)
    expect(f.kind).toBe(kind)
    expect(f.message).toBe(message)
    expect(f.exitCode).toBe(result.exitCode)
    expect(f.argv).toEqual(['status', '--porcelain', '-z'].slice(0, f.argv.length))
    expect(f.detail).toBe([result.stderr, result.stdout].filter(Boolean).join('\n'))
    expect(f.cause).toBeInstanceOf(FailureError)
    expect(f.cause?.failure.kind).toBe('exit')
  })

  test('an unrecognised failure stays an exit, with the first stderr line as its message', () => {
    const f = tried(fail('fatal: something new\nsecond line', 1))
    expect(f).toMatchObject({ kind: 'exit', message: 'fatal: something new', exitCode: 1 })
    expect(f.hint).toBeUndefined()
  })

  test('hints are written for the git-specific kinds', () => {
    expect(describe(tried(fail('fatal: not a git repository')))).toBe(
      'This is not a git repository. Run it inside a git repository, or create one with `git init`.',
    )
  })

  test('classifyGitFailure is exported and works on a CommandFailed directly', () => {
    const failed = new CommandFailed(['fetch'], fail("fatal: No such remote 'x'"), 'git')
    expect(classifyGitFailure(failed).kind).toBe('no-remote')
  })
})

suite('subprocess kinds pass through', () => {
  test('a missing git is not-installed, with the install hint', () => {
    const git = new Git(process.cwd(), {
      runner: runnerOf({
        exitCode: 1,
        stdout: '',
        stderr: '',
        neverExited: true,
        reason: 'spawn',
        error: 'spawnSync git ENOENT',
      }),
    })
    const r = git.try.statusPorcelain()
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error).toMatchObject({
      kind: 'not-installed',
      message: '`git` is not installed or not on PATH.',
      hint: 'Install git from https://git-scm.com.',
      exitCode: null,
    })
    expect(describe(r.error)).toBe(
      '`git` is not installed or not on PATH. Install git from https://git-scm.com.',
    )
  })

  test('a timeout and a bad cwd keep the subprocess layer kinds, with no git hint', () => {
    const timedOut = tried({
      exitCode: 1,
      stdout: '',
      stderr: '',
      neverExited: true,
      reason: 'timeout',
    })
    expect(timedOut.kind).toBe('timeout')
    expect(timedOut.hint).toBeUndefined()
    const dir = join(tmpdir(), 'typed-git-no-such-dir-xyz')
    const r = new Git(dir).try.statusPorcelain()
    expect(!r.ok && r.error.kind).toBe('bad-cwd')
  })
})

suite('the three doors agree', () => {
  test('checked throws CommandFailed, try returns the failure, soft returns the absence value', () => {
    const git = new Git('/x', { runner: runnerOf(fail('fatal: not a git repository')) })
    expect(() => git.statusPorcelain()).toThrow(FailureError)
    const r = git.try.statusPorcelain()
    expect(!r.ok && r.error.kind).toBe('not-a-repo')
    expect(git.soft.statusPorcelain()).toEqual([])
  })

  test('the async client classifies the same way', async () => {
    const git = new AsyncGit('/x', {
      backend: cliBackend({
        runner: { binary: 'git', run: async () => fail('fatal: not a git repository') },
      }),
    })
    const r = await git.try.statusPorcelain()
    expect(!r.ok && r.error.kind).toBe('not-a-repo')
  })

  test('a declared absence is still a success', () => {
    const git = new Git('/x', { runner: runnerOf(fail('', 1)) })
    expect(git.try.configGet('no.such.key')).toEqual({ ok: true, value: null })
  })

  test('types: try returns Result<T, GitFailure>', () => {
    const git = new Git('/x', { runner: runnerOf(fail('', 1)) })
    const r = git.try.statusPorcelain()
    if (!r.ok) expectTypeOf(r.error).toEqualTypeOf<GitFailure>()
    expectTypeOf<GitFailure['kind']>().toEqualTypeOf<GitFailureKind>()
    expectTypeOf<GitFailure['cause']>().toEqualTypeOf<CommandFailed | undefined>()
  })
})

suite('against a real git', () => {
  test('outside a repository is not-a-repo, naming the exit code', () => {
    const dir = mkdtempSync(join(tmpdir(), 'typed-git-plain-'))
    try {
      const r = new Git(dir).try.lsFilesUnmerged()
      expect(r.ok).toBe(false)
      if (!r.ok) {
        expect(r.error.kind).toBe('not-a-repo')
        expect(r.error.exitCode).toBe(128)
        expect(r.error.binary).toBe('git')
      }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a missing remote name is no-remote', () => {
    const fx = makeGitFixture()
    try {
      const r = fx.git.try.fetch('no-such-remote')
      expect(!r.ok && r.error.kind).toBe('no-remote')
    } finally {
      fx.cleanup()
    }
  })
})

suite('a CommandFailed from another installed copy', () => {
  // Another copy of command-seam has its own class, so `instanceof` is false.
  // The throwing methods, `try` and `soft` recognise it by shape.
  const foreign = (): Error =>
    Object.assign(new Error('boom'), {
      failure: { kind: 'exit', message: 'x' },
      argv: ['status'],
      result: { exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' },
    })
  const thrower: CommandRunner = {
    binary: 'git',
    run: () => {
      throw foreign()
    },
  }

  test('try classifies it, and soft answers the absence value', () => {
    const git = new Git('/x', { runner: thrower })
    const r = git.try.statusPorcelain()
    expect(!r.ok && r.error.kind).toBe('not-a-repo')
    expect(git.soft.statusPorcelain()).toEqual([])
  })
})

suite('the plain door throws the classified failure', () => {
  test('a signed-out push carries kind not-authenticated, with the CommandFailed as cause', () => {
    const runner = runnerOf(
      fail(
        "fatal: unable to access 'https://github.com/o/r.git/': The requested URL returned error: 403",
      ),
    )
    try {
      new Git('/x', { runner }).push('origin', 'main')
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(FailureError)
      const failure = (e as FailureError<GitFailure>).failure
      expect(failure).toMatchObject({
        kind: 'not-authenticated',
        argv: expect.arrayContaining(['push']),
      })
      expect(failure.cause).toBeInstanceOf(CommandFailed)
    }
  })

  test('a plain failure no kind names stays an exit', () => {
    try {
      new Git('/x', { runner: runnerOf(fail('boom')) }).statusPorcelain()
      expect.unreachable()
    } catch (e) {
      expect((e as FailureError<GitFailure>).failure).toMatchObject({
        kind: 'exit',
        message: 'boom',
      })
    }
  })
})

suite('the thrown message names the git command', () => {
  const push = () =>
    new Git('/x', {
      runner: runnerOf(fail("fatal: 'origin' does not appear to be a git repository")),
    }).push('origin', 'HEAD:refs/heads/x')

  test('message is `git <verb>: <message> <hint>`; failure.message stays the bare sentence', () => {
    try {
      push()
      expect.unreachable()
    } catch (e) {
      const { failure, message } = e as FailureError<GitFailure>
      expect(message).toBe(`git push: ${failure.message} ${failure.hint}`)
      expect(message.startsWith("git push: The remote 'origin'")).toBe(true)
      expect(failure.message).not.toContain('git push')
    }
  })

  test('describeGitFailure skips leading -c / -C options to find the verb', () => {
    const failure = (argv: string[]) =>
      ({ kind: 'exit', message: 'boom', argv, exitCode: 1 }) as unknown as GitFailure
    expect(describeGitFailure(failure(['-c', 'core.editor=true', 'rebase', '--continue']))).toBe(
      'git rebase: boom',
    )
    expect(describeGitFailure(failure([]))).toBe('git: boom')
  })
})
