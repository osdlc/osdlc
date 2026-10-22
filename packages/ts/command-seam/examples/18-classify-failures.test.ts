import { expect, test } from 'vitest'

import {
  classifyFailure,
  type ClassifiableRun,
  type ClassifyContext,
  type CommandFailure,
  type CommandFailureKind,
  type JsonFailure,
  runChecked,
  CommandFailed,
  spawnRunner,
} from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'

// Classify a run you already have: `null` when it succeeded, else a failure
// whose `kind` code branches on and whose `message` a person can read.
test('a missing binary is `not-installed`, with a message that names it', () => {
  const r = spawnRunner('definitely-not-installed-xyz').run(['--version'], { cwd: process.cwd() })
  const context: ClassifyContext = { binary: 'definitely-not-installed-xyz', argv: ['--version'] }
  const failure: CommandFailure | null = classifyFailure(r, context)
  expect(failure?.kind).toBe('not-installed')
  expect(failure?.message).toBe('`definitely-not-installed-xyz` is not installed or not on PATH.')
  expect(failure?.exitCode).toBeNull()
})

test('a run that exited cleanly has no failure; okExitCodes widens "cleanly"', () => {
  const run: ClassifiableRun = { exitCode: 1, stdout: '', stderr: '' }
  expect(classifyFailure({ exitCode: 0, stdout: '', stderr: '' })).toBeNull()
  expect(classifyFailure(run)?.kind).toBe('exit')
  expect(classifyFailure(run, { okExitCodes: [0, 1] })).toBeNull()
})

test('every kind is a string a switch can be exhaustive over', () => {
  const describeKind = (kind: CommandFailureKind): string => {
    switch (kind) {
      case 'not-installed':
      case 'not-executable':
      case 'bad-cwd':
      case 'spawn':
        return 'did not start'
      case 'timeout':
      case 'output-cap':
      case 'signal':
      case 'aborted':
        return 'was stopped'
      case 'exit':
        return 'ran and failed'
      default: {
        const unreachable: never = kind
        return unreachable
      }
    }
  }
  const timedOut: ClassifiableRun = { exitCode: 1, neverExited: true, reason: 'timeout' }
  expect(describeKind(classifyFailure(timedOut)!.kind)).toBe('was stopped')
})

test('CommandFailed carries the classified failure, and a JsonFailure is one too', () => {
  const fake = fakeRunner({
    'status --short': { exitCode: 128, stderr: 'fatal: not a repo\nmore' },
  })
  try {
    runChecked(fake.runner, ['status', '--short'], { cwd: '.' })
    expect.unreachable()
  } catch (e) {
    expect(e).toBeInstanceOf(CommandFailed)
    const failure: JsonFailure = (e as CommandFailed).failure
    expect(failure).toMatchObject({
      kind: 'exit',
      message: 'fatal: not a repo',
      detail: 'fatal: not a repo\nmore',
      exitCode: 128,
    })
  }
})
