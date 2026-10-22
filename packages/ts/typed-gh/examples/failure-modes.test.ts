/**
 * How a failure shows up. The plain method throws a `FailureError` carrying the classified `GhFailure` (a query as
 * much as a mutation), `.try` returns it as a `Result` with a `kind` and a
 * message for a person, `.soft` returns `null` for a failed query, and `raw`
 * hands the result back for you to judge.
 */

import { expect, test } from 'vitest'

import { describe, FailureError } from '@osdlc/result'
import { Gh, type CommandResult, type CommandRunner, type GhFailure } from '@osdlc/typed-gh'

const signedOut: CommandResult = { exitCode: 1, stdout: '', stderr: 'gh: not logged in' }
const failing: CommandRunner = { run: () => signedOut }
const empty: CommandRunner = { run: () => ({ exitCode: 0, stdout: '[]', stderr: '' }) }

test('a failed query throws, so it is not mistaken for "no results"', () => {
  expect(() => new Gh('/repo', { runner: failing }).prList()).toThrow(FailureError)
  expect(new Gh('/repo', { runner: empty }).prList()).toEqual({ rows: [], truncated: false })
})

test('.try returns the failure as a Result, classified and ready to show', () => {
  const r = new Gh('/repo', { runner: failing }).try.prList()
  expect(r.ok).toBe(false)
  if (!r.ok) {
    const failure: GhFailure = r.error
    expect(failure).toMatchObject({ kind: 'not-authenticated', hint: 'Run `gh auth login`.' })
    expect(describe(failure)).toBe('gh is not signed in to GitHub. Run `gh auth login`.')
  }
})

test('.soft is null for a failed query, for a caller whose fallback is "nothing"', () => {
  expect(new Gh('/repo', { runner: failing }).soft.prList()).toBeNull()
})

test('a failed mutation throws the classified failure, carrying the argv and the result', () => {
  const gh = new Gh('/repo', { runner: failing })

  try {
    gh.editPrBody(7, 'new body')
    throw new Error('expected a FailureError')
  } catch (err) {
    expect(err).toBeInstanceOf(FailureError)
    const failed = (err as FailureError<GhFailure>).failure
    expect(failed.argv).toEqual(['pr', 'edit', '7', '--body', 'new body'])
    expect(failed.cause?.result.stderr).toBe('gh: not logged in')
  }
})

test('raw returns the result, and rawChecked throws on a non-zero exit', () => {
  const gh = new Gh('/repo', { runner: failing })

  expect(gh.raw(['repo', 'view']).exitCode).toBe(1)
  expect(() => gh.rawChecked(['repo', 'view'])).toThrow(FailureError)
  expect(new Gh('/repo', { runner: empty }).rawChecked(['repo', 'view']).stdout).toBe('[]')
})
