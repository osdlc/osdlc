/**
 * Every failure kind, on both adapters: the same tool or host problem reads as
 * the same `CodeHostFailure` kind whichever code host answered.
 */

import type { CommandResult, CommandRunner } from '@osdlc/command-seam'
import { describe, expect, test } from 'vitest'

import type { CodeHostFailure } from '../src/failure.ts'
import { ForgejoCodeHost } from '../src/forgejo.ts'
import { GithubCodeHost } from '../src/github.ts'
import type { CodeHost } from '../src/types.ts'

/** A runner that answers every call with `result`. */
function always(result: CommandResult): CommandRunner {
  return { run: () => result }
}

function ghFailing(result: CommandResult): CodeHost {
  return new GithubCodeHost('/repo', { runner: always(result) })
}

function forgejoWith(result: CommandResult, tokenEnv?: string): CodeHost {
  return new ForgejoCodeHost({
    runner: always(result),
    cwd: '/repo',
    host: 'git.example.com',
    owner: 'o',
    repo: 'r',
    token: 'tok',
    ...(tokenEnv === undefined ? {} : { tokenEnv }),
  })
}

const exit = (code: number, stderr: string): CommandResult => ({
  exitCode: code,
  stdout: '',
  stderr,
})

const neverRan = (reason: 'spawn' | 'timeout', error: string): CommandResult => ({
  exitCode: 1,
  stdout: '',
  stderr: '',
  neverExited: true,
  reason,
  error,
})

const http = (status: number, body: unknown = {}): CommandResult => ({
  exitCode: 0,
  stdout: `${JSON.stringify(body)}\nHTTPSTATUS:${status}`,
  stderr: '',
})

/** The failure `listPrDetails` reports, which both adapters expose. */
function failureOf(host: CodeHost): CodeHostFailure {
  const result = host.listPrDetails({})
  if (result.ok) throw new Error('expected a failure')
  return result.error
}

describe('GithubCodeHost failures', () => {
  test('not-installed: gh is not on PATH, with the install hint', () => {
    const f = failureOf(ghFailing(neverRan('spawn', 'spawn gh ENOENT')))
    expect(f).toMatchObject({ kind: 'not-installed', host: 'github' })
    expect(f.hint).toContain('https://cli.github.com')
  })

  test('not-authenticated: gh is signed out', () => {
    const f = failureOf(
      ghFailing(exit(4, 'To get started with GitHub CLI, please run:  gh auth login')),
    )
    expect(f).toMatchObject({
      kind: 'not-authenticated',
      host: 'github',
      hint: 'Run `gh auth login`.',
    })
  })

  test('network: GitHub cannot be reached', () => {
    const f = failureOf(ghFailing(exit(1, 'error connecting to api.github.com')))
    expect(f).toMatchObject({ kind: 'network', host: 'github' })
  })

  test('not-found: no such repository', () => {
    const f = failureOf(ghFailing(exit(1, 'GraphQL: Could not resolve to a Repository')))
    expect(f).toMatchObject({ kind: 'not-found', host: 'github' })
  })

  test('rate-limited', () => {
    const f = failureOf(ghFailing(exit(1, 'API rate limit exceeded for user')))
    expect(f).toMatchObject({
      kind: 'rate-limited',
      host: 'github',
      hint: 'Wait a few minutes and try again.',
    })
  })

  test('timeout', () => {
    const f = failureOf(ghFailing(neverRan('timeout', 'timed out')))
    expect(f).toMatchObject({ kind: 'timeout', host: 'github' })
  })

  test('exit: an unrecognised failure keeps gh first line', () => {
    const f = failureOf(ghFailing(exit(1, 'something odd happened')))
    expect(f).toMatchObject({ kind: 'exit', host: 'github', message: 'something odd happened' })
  })

  test('unreadable: gh exited 0 with output that is not JSON', () => {
    const f = failureOf(ghFailing({ exitCode: 0, stdout: 'not json', stderr: '' }))
    expect(f).toMatchObject({ kind: 'unreadable', host: 'github' })
  })

  test('the typed-gh failure is the cause, and every query reports it', () => {
    const host = ghFailing(exit(4, 'gh auth login'))
    const failures = [
      host.listPrs({}),
      host.listPrDetails({}),
      host.getPr(1, { since: null }),
      host.prForBranch('b'),
      host.reviewThreads(1),
      host.listComments?.(1),
    ]
    for (const r of failures) {
      expect(r).toMatchObject({ ok: false, error: { kind: 'not-authenticated', host: 'github' } })
      if (r !== undefined && !r.ok) {
        expect(r.error.cause).toMatchObject({ kind: 'not-authenticated' })
      }
    }
  })

  test('listComments classifies a failed gh api call and an unreadable answer', () => {
    expect(ghFailing(neverRan('spawn', 'spawn gh ENOENT')).listComments?.(1)).toMatchObject({
      ok: false,
      error: { kind: 'not-installed' },
    })
    expect(ghFailing({ exitCode: 0, stdout: '{}', stderr: '' }).listComments?.(1)).toMatchObject({
      ok: false,
      error: { kind: 'unreadable' },
    })
  })

  test('a declared absence is a success: no open PR for a branch', () => {
    const host = ghFailing({ exitCode: 0, stdout: '[]', stderr: '' })
    expect(host.prForBranch('nope')).toEqual({ ok: true, value: null })
  })
})

describe('ForgejoCodeHost failures', () => {
  test('not-installed: curl is not on PATH, with the install hint', () => {
    const f = failureOf(forgejoWith(neverRan('spawn', 'spawn curl ENOENT')))
    expect(f).toMatchObject({ kind: 'not-installed', host: 'forgejo', hint: 'Install curl.' })
  })

  test.each([401, 403])('not-authenticated: HTTP %i names the token variable', (status) => {
    const f = failureOf(forgejoWith(http(status, { message: 'bad token' })))
    expect(f).toMatchObject({
      kind: 'not-authenticated',
      host: 'forgejo',
      status,
      hint: 'Set FORGEJO_TOKEN to a valid token.',
    })
  })

  test('not-authenticated names a custom token variable', () => {
    const f = failureOf(forgejoWith(http(401), 'MY_FORGEJO_TOKEN'))
    expect(f.hint).toBe('Set MY_FORGEJO_TOKEN to a valid token.')
  })

  test('not-found: HTTP 404 on a listing', () => {
    expect(failureOf(forgejoWith(http(404)))).toMatchObject({ kind: 'not-found', status: 404 })
  })

  test('rate-limited: HTTP 429', () => {
    expect(failureOf(forgejoWith(http(429)))).toMatchObject({ kind: 'rate-limited', status: 429 })
  })

  test.each([6, 7, 35, 52, 56, 60])('network: curl exit %i', (code) => {
    const f = failureOf(
      forgejoWith(exit(code, 'curl: (6) Could not resolve host: git.example.com')),
    )
    expect(f).toMatchObject({ kind: 'network', host: 'forgejo' })
    expect(f.detail).toContain('Could not resolve host')
  })

  test('timeout: curl exit 28, and a runner timeout', () => {
    expect(failureOf(forgejoWith(exit(28, 'Operation timed out')))).toMatchObject({
      kind: 'timeout',
    })
    expect(failureOf(forgejoWith(neverRan('timeout', 'timed out')))).toMatchObject({
      kind: 'timeout',
    })
  })

  test('http: any other error status, with the status in detail', () => {
    const f = failureOf(forgejoWith(http(500, { message: 'boom' })))
    expect(f).toMatchObject({ kind: 'http', status: 500 })
    expect(f.detail).toContain('HTTP 500')
  })

  test('exit: an unrecognised curl exit keeps its first line', () => {
    expect(failureOf(forgejoWith(exit(2, 'curl: (2) init failed')))).toMatchObject({ kind: 'exit' })
  })

  test('unreadable: a 200 whose body is not a JSON array, and a response with no status', () => {
    expect(failureOf(forgejoWith(http(200, { not: 'an array' })))).toMatchObject({
      kind: 'unreadable',
    })
    expect(failureOf(forgejoWith({ exitCode: 0, stdout: 'junk', stderr: '' }))).toMatchObject({
      kind: 'unreadable',
    })
  })

  test('unsupported: review threads', () => {
    expect(forgejoWith(http(200)).reviewThreads(1)).toMatchObject({
      ok: false,
      error: { kind: 'unsupported', host: 'forgejo' },
    })
  })

  test('the curl failure is the cause, and the request body never reaches it', () => {
    const host = forgejoWith(exit(6, 'Could not resolve host'))
    const r = host.listComments?.(1)
    expect(r).toMatchObject({ ok: false, error: { kind: 'network' } })
    if (r !== undefined && !r.ok) expect(JSON.stringify(r.error)).not.toContain('tok')
  })

  test('every query reports a network failure', () => {
    const host = forgejoWith(exit(6, 'Could not resolve host'))
    for (const r of [
      host.listPrs({}),
      host.listPrDetails({}),
      host.getPr(1, { since: null }),
      host.prForBranch('b'),
    ]) {
      expect(r).toMatchObject({ ok: false, error: { kind: 'network', host: 'forgejo' } })
    }
  })

  test('a declared absence is a success: no PR for the branch', () => {
    expect(forgejoWith(http(200, [])).prForBranch('nope')).toEqual({ ok: true, value: null })
  })

  test('a mutation throws a FailureError carrying the classified failure', () => {
    expect(() => forgejoWith(http(403)).postComment(1, 'x')).toThrow(/refused the token/)
  })
})
