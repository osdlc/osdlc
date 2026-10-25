/**
 * The shared failure table and how `runMain` and `failWith` use it.
 */

import { CommandFailed } from '@osdlc/command-seam'
import { FailureError, type Failure } from '@osdlc/result'
import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  captureContext,
  DOMAIN_EXIT_MAX,
  DOMAIN_EXIT_MIN,
  EXIT,
  EXIT_FAILURE,
  exitCodeFor,
  failureOf,
  failWith,
  FAILURE_EXIT,
  isDomainExit,
  renderFailure,
  runMain,
} from '../src/index.ts'

function failure(kind: string, extra: Partial<Failure> = {}): Failure {
  return { kind, message: `${kind} happened.`, ...extra }
}

describe('the failure exit table', () => {
  test('every code is in the tool band, and the four categories are distinct', () => {
    const codes = Object.values(EXIT_FAILURE)
    expect(new Set(codes).size).toBe(codes.length)
    for (const code of Object.values(FAILURE_EXIT)) {
      expect(isDomainExit(code)).toBe(true)
      expect(code).toBeGreaterThanOrEqual(DOMAIN_EXIT_MIN)
      expect(code).toBeLessThanOrEqual(DOMAIN_EXIT_MAX)
      expect(codes).toContain(code)
    }
  })

  test.each([
    ['not-installed', 22],
    ['not-executable', 22],
    ['not-authenticated', 23],
    ['missing-token', 23],
    ['not-found', 23],
    ['http', 23],
    ['unreadable', 23],
    ['unsupported', 23],
    ['not-a-repo', 24],
    ['no-remote', 24],
    ['bad-remote', 24],
    ['bad-cwd', 24],
    ['network', 25],
    ['remote-unreachable', 25],
    ['timeout', 25],
    ['rate-limited', 25],
  ])('%s exits %i', (kind, code) => {
    expect(exitCodeFor(failure(kind))).toBe(code)
  })

  test.each(['exit', 'spawn', 'signal', 'aborted', 'output-cap', 'something-new', 'toString'])(
    'an ordinary or unknown kind (%s) exits 1',
    (kind) => {
      expect(exitCodeFor(failure(kind))).toBe(EXIT.error)
    },
  )
})

describe('renderFailure and failureOf', () => {
  test('one line: the message, then the hint; detail never shows', () => {
    const f = failure('network', { hint: 'Check your network.', detail: 'dial tcp: lookup x' })
    expect(renderFailure(f, 'tooly')).toBe('tooly: network happened. Check your network.\n')
    expect(renderFailure(failure('exit'))).toBe('exit happened.\n')
  })

  test('reads a FailureError, a CommandFailed and a bare Failure; nothing else', () => {
    const f = failure('not-found')
    expect(failureOf(new FailureError(f))).toBe(f)
    expect(failureOf(f)).toBe(f)
    const failed = new CommandFailed(['x'], { exitCode: 1, stdout: '', stderr: 'bad' }, 'gh')
    expect(failureOf(failed)).toBe(failed.failure)
    expect(failureOf(new Error('plain'))).toBeNull()
    expect(failureOf('text')).toBeNull()
    expect(failureOf(null)).toBeNull()
  })
})

describe('failWith', () => {
  test('prints the line to stderr, nothing to stdout, and returns the code', () => {
    const ctx = captureContext()
    const code = failWith(ctx, failure('not-installed', { hint: 'Install it.' }), { name: 'tooly' })
    expect(code).toBe(22)
    expect(ctx.io.err).toBe('tooly: not-installed happened. Install it.\n')
    expect(ctx.io.out).toBe('')
  })

  test('strips terminal controls from the message and hint', () => {
    const ctx = captureContext()
    const code = failWith(
      ctx,
      { kind: 'not-found', message: 'no branch \u001b]0;pwned\u0007x.', hint: 'Check \u009b2Jit.' },
      { name: 'tooly' },
    )
    expect(code).toBe(23)
    expect(ctx.io.err).not.toContain('\u001b')
    expect(ctx.io.err).not.toContain('\u009b')
    expect(ctx.io.err).not.toContain('\u0007')
    expect(ctx.io.err.startsWith('tooly: no branch ')).toBe(true)
    expect(ctx.io.err.endsWith('\n')).toBe(true)
  })
})

describe('runMain with failures', () => {
  let before: typeof process.exitCode
  beforeEach(() => {
    before = process.exitCode
  })
  afterEach(() => {
    process.exitCode = before ?? 0
  })

  test('a thrown FailureError becomes its line and its category code', async () => {
    const context = captureContext()
    await runMain(
      () => {
        throw new FailureError(failure('network', { hint: 'Retry later.' }))
      },
      { name: 'tooly', context, argv: [] },
    )
    expect(context.io.err).toBe('tooly: network happened. Retry later.\n')
    expect(process.exitCode).toBe(25)
  })

  test('a thrown CommandFailed for a missing binary exits 22 with the command-seam message', async () => {
    const context = captureContext()
    await runMain(
      () => {
        throw new CommandFailed(
          ['--version'],
          {
            exitCode: 1,
            stdout: '',
            stderr: '',
            neverExited: true,
            reason: 'spawn',
            error: 'spawn gh ENOENT',
          },
          'gh',
        )
      },
      { name: 'tooly', context, argv: [] },
    )
    expect(context.io.err).toBe('tooly: `gh` is not installed or not on PATH.\n')
    expect(process.exitCode).toBe(22)
  })

  test('a failure kind with no category exits 1', async () => {
    const context = captureContext()
    await runMain(
      () => {
        throw new FailureError(failure('exit'))
      },
      { name: 'tooly', context, argv: [] },
    )
    expect(context.io.err).toBe('tooly: exit happened.\n')
    expect(process.exitCode).toBe(EXIT.error)
  })

  test('any other error keeps the old line and exit 1; a returned code is untouched', async () => {
    const context = captureContext()
    await runMain(
      () => {
        throw new Error('boom')
      },
      { name: 'tooly', context, argv: [] },
    )
    expect(context.io.err).toBe('tooly: boom\n')
    expect(process.exitCode).toBe(EXIT.error)

    const quiet = captureContext()
    await runMain(() => 17, { name: 'tooly', context: quiet, argv: [] })
    expect(quiet.io.err).toBe('')
    expect(process.exitCode).toBe(17)
  })
})
