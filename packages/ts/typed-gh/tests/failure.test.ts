/**
 * `gh.try.*` classifies a failed call as a `GhFailure`. gh's stderr gives the
 * gh-specific kinds, command-seam gives the rest, and `cause` is the
 * `CommandFailed` it came from.
 */

import { describe as suite, expect, expectTypeOf, test } from 'vitest'

import { describe } from '@osdlc/result'

import {
  classifyGhFailure,
  CommandFailed,
  Gh,
  type CommandResult,
  type CommandRunner,
  type GhFailure,
  type GhFailureKind,
} from '../src/index.ts'

const fail = (stderr: string, exitCode = 1): CommandResult => ({ exitCode, stdout: '', stderr })
const tried = (result: CommandResult): GhFailure => {
  const runner: CommandRunner = { binary: 'gh', run: () => result }
  const r = new Gh('/x', { runner }).try.prList()
  if (r.ok) throw new Error('expected a failure')
  return r.error
}

suite('stderr patterns', () => {
  const cases: Array<[string, CommandResult, GhFailureKind, string, string | undefined]> = [
    [
      'gh auth login (the first-run banner, exit 4)',
      fail('To get started with GitHub CLI, please run:  gh auth login', 4),
      'not-authenticated',
      'gh is not signed in to GitHub.',
      'Run `gh auth login`.',
    ],
    [
      'not logged into any hosts',
      fail('You are not logged into any GitHub hosts. To log in, run: gh auth login'),
      'not-authenticated',
      'gh is not signed in to GitHub.',
      'Run `gh auth login`.',
    ],
    [
      'HTTP 401',
      fail('HTTP 401: Bad credentials (https://api.github.com/graphql)'),
      'not-authenticated',
      'gh is not signed in to GitHub.',
      'Run `gh auth login`.',
    ],
    [
      'error connecting to api.github.com',
      fail(
        'error connecting to api.github.com\ncheck your internet connection or https://githubstatus.com',
      ),
      'network',
      'GitHub could not be reached.',
      'Check your network connection.',
    ],
    [
      'Could not resolve host',
      fail('Post "https://api.github.com/graphql": dial tcp: lookup api.github.com: no such host'),
      'network',
      'GitHub could not be reached.',
      'Check your network connection.',
    ],
    [
      'Could not resolve to a PullRequest',
      fail(
        'GraphQL: Could not resolve to a PullRequest with the number of 99. (repository.pullRequest)',
      ),
      'not-found',
      'GitHub has no such pull request, issue or repository, or you cannot see it.',
      'Check the number or name, and that your account can see the repository.',
    ],
    [
      'HTTP 404',
      fail('gh: Not Found (HTTP 404)'),
      'not-found',
      'GitHub has no such pull request, issue or repository, or you cannot see it.',
      'Check the number or name, and that your account can see the repository.',
    ],
    [
      'no pull requests found for branch',
      fail('no pull requests found for branch "x"'),
      'not-found',
      'GitHub has no such pull request, issue or repository, or you cannot see it.',
      'Check the number or name, and that your account can see the repository.',
    ],
    [
      'HTTP 403 (SAML, a missing scope)',
      fail('gh: Resource not accessible by personal access token (HTTP 403)'),
      'not-authenticated',
      'gh is not signed in to GitHub.',
      'Run `gh auth login`.',
    ],
    [
      'API rate limit exceeded',
      fail('gh: API rate limit exceeded for user ID 1. (HTTP 403)'),
      'rate-limited',
      "GitHub's API rate limit was reached.",
      'Wait a few minutes and try again.',
    ],
    [
      'secondary rate limit',
      fail('You have exceeded a secondary rate limit. (HTTP 403)'),
      'rate-limited',
      "GitHub's API rate limit was reached.",
      'Wait a few minutes and try again.',
    ],
  ]

  test.each(cases)('%s', (_name, result, kind, message, hint) => {
    const f = tried(result)
    expect(f).toMatchObject({ kind, message, hint, exitCode: result.exitCode, binary: 'gh' })
    expect(f.argv[0]).toBe('pr')
    expect(f.detail).toBe(result.stderr)
    expect(f.cause).toBeInstanceOf(CommandFailed)
  })

  test('rate limit beats not-found when both words appear (a 403 carries HTTP text)', () => {
    expect(tried(fail('API rate limit exceeded (HTTP 403) Not Found')).kind).toBe('rate-limited')
  })

  test('an unrecognised failure stays an exit, with the first stderr line as its message', () => {
    const f = tried(fail('something odd\nsecond line'))
    expect(f).toMatchObject({ kind: 'exit', message: 'something odd', exitCode: 1 })
    expect(f.hint).toBeUndefined()
  })

  test('describe joins the message and hint into one line', () => {
    expect(describe(tried(fail('API rate limit exceeded')))).toBe(
      "GitHub's API rate limit was reached. Wait a few minutes and try again.",
    )
  })
})

suite('subprocess kinds', () => {
  test('a missing gh is not-installed, with the install-and-login hint', () => {
    const runner: CommandRunner = {
      run: () => ({
        exitCode: 1,
        stdout: '',
        stderr: '',
        neverExited: true,
        reason: 'spawn',
        error: 'spawnSync gh ENOENT',
      }),
    }
    const r = new Gh('/x', { runner }).try.prList()
    expect(!r.ok && r.error).toMatchObject({
      kind: 'not-installed',
      message: '`gh` is not installed or not on PATH.',
      hint: 'Install it from https://cli.github.com, then run `gh auth login`.',
      exitCode: null,
    })
  })

  test('a timeout keeps the subprocess layer kind and has no hint', () => {
    const f = tried({
      exitCode: 1,
      stdout: '',
      stderr: '',
      neverExited: true,
      reason: 'timeout',
    })
    expect(f.kind).toBe('timeout')
    expect(f.hint).toBeUndefined()
  })

  test('classifyGhFailure works on a CommandFailed directly', () => {
    const failed = new CommandFailed(['pr', 'list'], fail('HTTP 429'), 'gh')
    expect(classifyGhFailure(failed).kind).toBe('rate-limited')
  })
})

suite('unreadable output', () => {
  test('exit 0 with output that does not parse is unreadable, with no cause', () => {
    const runner: CommandRunner = { run: () => ({ exitCode: 0, stdout: 'not json', stderr: '' }) }
    const r = new Gh('/x', { runner }).try.prList()
    expect(!r.ok && r.error).toMatchObject({
      kind: 'unreadable',
      message: 'gh answered, but its output could not be read completely.',
      detail: 'not json',
      exitCode: 0,
    })
    expect(!r.ok && r.error.cause).toBeUndefined()
  })
})

suite('types', () => {
  test('try returns Result<T, GhFailure>', () => {
    const runner: CommandRunner = { run: () => ({ exitCode: 0, stdout: '[]', stderr: '' }) }
    const r = new Gh('/x', { runner }).try.prList()
    if (r.ok) expectTypeOf(r.value.rows).toBeArray()
    else expectTypeOf(r.error).toEqualTypeOf<GhFailure>()
  })

  test('soft is T | null, and the plain door is T', () => {
    const gh = new Gh('/x')
    expectTypeOf(gh.soft.prList).returns.toEqualTypeOf<ReturnType<Gh['prList']> | null>()
    expectTypeOf(gh.prList).returns.not.toBeNullable()
  })
})

suite('a failure thrown by another installed copy', () => {
  // Another copy of command-seam or result has its own classes, so
  // `instanceof` is false. `try` and `soft` check the shape instead.
  const foreign = (): Error =>
    Object.assign(new Error('boom'), {
      failure: { kind: 'exit', message: 'gh: not authenticated' },
      argv: ['pr', 'list'],
      result: { exitCode: 1, stdout: '', stderr: 'HTTP 401: Bad credentials' },
    })
  const thrower: CommandRunner = {
    binary: 'gh',
    run: () => {
      throw foreign()
    },
  }

  test('try classifies it, and soft answers null', () => {
    const gh = new Gh('/x', { runner: thrower })
    const r = gh.try.prList()
    expect(!r.ok && r.error.kind).toBe('not-authenticated')
    expect(gh.soft.prList()).toBeNull()
  })
})

suite('the plain door throws the classified failure', () => {
  test('a signed-out gh during a write carries kind not-authenticated, with the CommandFailed as cause', () => {
    const runner: CommandRunner = {
      binary: 'gh',
      run: () => fail('HTTP 401: Bad credentials'),
    }
    try {
      new Gh('/x', { runner }).prComment(1, 'hi')
      expect.unreachable()
    } catch (e) {
      const failure = (e as { failure: GhFailure }).failure
      expect(failure).toMatchObject({
        kind: 'not-authenticated',
        message: 'gh is not signed in to GitHub.',
      })
      expect(failure.cause).toBeInstanceOf(CommandFailed)
    }
  })
})
