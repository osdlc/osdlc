/**
 * The three call styles, as `Git` has them. The plain method returns a value
 * or throws. `.try` returns a `Result` whose error says what to do. `.soft`
 * gives `null` when the fallback is "nothing". A query for one thing returns
 * `null` in all three when GitHub says there is no such thing.
 */

import { FailureError, match } from '@osdlc/result'
import { expect, test } from 'vitest'

import {
  AsyncGh,
  Gh,
  classifyGhFailure,
  type GhFailure,
  type AsyncCommandRunner,
  type CommandResult,
  type CommandRunner,
  type GhFailureKind,
  type Soft,
  type TriedAsync,
  type TriedSync,
} from '@osdlc/typed-gh'

const fail = (stderr: string): CommandRunner => ({
  run: (): CommandResult => ({ exitCode: 1, stdout: '', stderr }),
})
const gone = fail(
  'GraphQL: Could not resolve to a PullRequest with the number of 99. (repository.pullRequest)',
)

test('match on the Result a .try call returns', () => {
  const gh = new Gh('/repo', { runner: fail('error connecting to api.github.com') })
  const say = match(gh.try.prList(), {
    ok: (list) => `${list.rows.length} open`,
    err: (f) => `${f.kind}: ${f.hint}`,
  })
  expect(say).toBe('network: Check your network connection.')
})

test('a kind is a string a switch can be exhaustive over', () => {
  const advice = (kind: GhFailureKind): string => {
    switch (kind) {
      case 'not-installed':
        return 'install gh'
      case 'not-authenticated':
        return 'run gh auth login'
      case 'rate-limited':
      case 'network':
      case 'timeout':
        return 'try again later'
      case 'not-found':
        return 'check the name'
      case 'unreadable':
      case 'not-executable':
      case 'bad-cwd':
      case 'output-cap':
      case 'signal':
      case 'aborted':
      case 'spawn':
      case 'exit':
        return 'show the message'
      default: {
        const unreachable: never = kind
        return unreachable
      }
    }
  }
  const r = new Gh('/repo', { runner: fail('API rate limit exceeded') }).try.prList()
  expect(!r.ok && advice(r.error.kind)).toBe('try again later')
})

test('a thrown failure carries its CommandFailed as the cause', () => {
  try {
    new Gh('/repo', { runner: fail('HTTP 401: Bad credentials') }).editPrBody(1, 'b')
    expect.unreachable()
  } catch (e) {
    expect(e).toBeInstanceOf(FailureError)
    const failure = (e as FailureError<GhFailure>).failure
    expect(failure.kind).toBe('not-authenticated')
    expect(classifyGhFailure(failure.cause!).kind).toBe('not-authenticated')
  }
})

test('absence is an answer on every door', () => {
  const gh = new Gh('/repo', { runner: gone })
  expect(gh.prView(99)).toBeNull()
  expect(gh.try.prView(99)).toEqual({ ok: true, value: null })
  expect(gh.soft.prView(99)).toBeNull()
})

test('the door types are exported for a caller that passes a client around', async () => {
  const gh = new Gh('/repo', { runner: fail('x') })
  const tried: TriedSync<Gh> = gh.try
  const soft: Soft<Gh> = gh.soft
  expect(tried.prList().ok).toBe(false)
  expect(soft.prList()).toBeNull()

  const asyncRunner: AsyncCommandRunner = {
    run: async () => ({ exitCode: 1, stdout: '', stderr: 'x' }),
  }
  const agh = new AsyncGh('/repo', { runner: asyncRunner })
  const triedAsync: TriedAsync<AsyncGh> = agh.try
  expect((await triedAsync.prList()).ok).toBe(false)
})
