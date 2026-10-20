/**
 * How a failure shows up. A query answers `null`, a mutation throws
 * `CommandFailed`, and `raw` hands the result back for you to judge.
 */

import { expect, test } from 'bun:test'

import { CommandFailed, Gh, type CommandResult, type CommandRunner } from '@osdlc/typed-gh'

const signedOut: CommandResult = { exitCode: 1, stdout: '', stderr: 'gh: not logged in' }
const failing: CommandRunner = { run: () => signedOut }
const empty: CommandRunner = { run: () => ({ exitCode: 0, stdout: '[]', stderr: '' }) }

test('a failed query is null, so it is not mistaken for "no results"', () => {
  expect(new Gh('/repo', { runner: failing }).prList()).toBeNull()
  expect(new Gh('/repo', { runner: empty }).prList()).toEqual([])
})

test('a failed mutation throws CommandFailed, carrying the argv and the result', () => {
  const gh = new Gh('/repo', { runner: failing })

  try {
    gh.editPrBody(7, 'new body')
    throw new Error('expected CommandFailed')
  } catch (err) {
    expect(err).toBeInstanceOf(CommandFailed)
    const failed = err as CommandFailed
    expect(failed.argv).toEqual(['pr', 'edit', '7', '--body', 'new body'])
    expect(failed.result.stderr).toBe('gh: not logged in')
  }
})

test('raw returns the result, and rawChecked throws on a non-zero exit', () => {
  const gh = new Gh('/repo', { runner: failing })

  expect(gh.raw(['repo', 'view']).exitCode).toBe(1)
  expect(() => gh.rawChecked(['repo', 'view'])).toThrow(CommandFailed)
  expect(new Gh('/repo', { runner: empty }).rawChecked(['repo', 'view']).stdout).toBe('[]')
})
