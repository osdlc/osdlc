/**
 * Check that `gh` is there and signed in before relying on it. "Missing" and
 * "signed out" are different things to tell a person, so each has its own
 * question, and `ready` asks both.
 */

import { expect, test } from 'vitest'

import {
  Gh,
  defaultRunnerFactory,
  type AuthStatus,
  type CommandRunner,
  type RunnerFactory,
} from '@osdlc/typed-gh'

/** `gh --version` works; `gh auth status` fails the way a signed-out gh does. */
const signedOut: CommandRunner = {
  run: (argv) =>
    argv[0] === 'auth'
      ? { exitCode: 1, stdout: '', stderr: 'You are not logged into any GitHub hosts.' }
      : { exitCode: 0, stdout: 'gh version 2.60.0\n', stderr: '' },
}

test('tell a missing gh from a signed-out one', () => {
  const gh = new Gh('/repo', { runner: signedOut })

  const status: AuthStatus = gh.authStatus()

  expect(gh.installed()).toBe(true)
  expect(gh.authenticated()).toBe(false)
  expect(status).toEqual({ ok: false, detail: 'You are not logged into any GitHub hosts.' })
})

test('ready asks both questions, and stops at the first failure', () => {
  const asked: string[][] = []
  const missing: CommandRunner = {
    run(argv) {
      asked.push(argv)
      return { exitCode: 127, stdout: '', stderr: 'gh: command not found' }
    },
  }

  expect(new Gh('/repo', { runner: missing }).ready()).toBe(false)
  expect(asked).toEqual([['--version']])
  expect(new Gh('/repo', { runner: signedOut }).ready()).toBe(false)
})

test('the default runner factory builds a real runner for a binary name', () => {
  // `new Gh(cwd)` uses it. A test can supply its own factory in its place.
  const runner: CommandRunner = defaultRunnerFactory('gh')
  const factory: RunnerFactory = defaultRunnerFactory

  expect(typeof runner.run).toBe('function')
  expect(typeof factory('gh').run).toBe('function')
})
