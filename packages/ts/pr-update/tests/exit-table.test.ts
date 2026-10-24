/**
 * `@osdlc/cli-tool`'s `FAILURE_EXIT` is keyed by strings, so a kind added to a
 * lower layer would exit 1 with no warning. This is the one package that sees the
 * command, git and code-host kind unions together (the code host's union also
 * carries every `gh` kind, which it maps one to one), so the check lives here.
 *
 * `ACCOUNTED` is an exhaustive `Record` over the union: a new kind in any layer
 * is a compile error until it is listed as in the table or as exit 1 on purpose.
 */

import { describe, expect, test } from 'vitest'

import { exitCodeFor, FAILURE_EXIT } from '@osdlc/cli-tool'
import type { CommandFailureKind } from '@osdlc/command-seam'
import type { CodeHostFailureKind } from '@osdlc/code-host'
import type { GitFailureKind } from '@osdlc/typed-git'

type AnyKind = CommandFailureKind | GitFailureKind | CodeHostFailureKind

/** `table`: has its own exit code. `exit1`: an ordinary failed run, on purpose. */
const ACCOUNTED: Record<AnyKind, 'table' | 'exit1'> = {
  // command-seam
  'not-installed': 'table',
  'not-executable': 'table',
  'bad-cwd': 'table',
  timeout: 'table',
  'output-cap': 'exit1',
  signal: 'exit1',
  aborted: 'exit1',
  spawn: 'exit1',
  exit: 'exit1',
  // typed-git
  'not-a-repo': 'table',
  'no-remote': 'table',
  'remote-unreachable': 'table',
  'not-authenticated': 'table',
  'not-found': 'table',
  tls: 'table',
  // code-host (and typed-gh, which it maps one to one)
  network: 'table',
  'rate-limited': 'table',
  http: 'table',
  unreadable: 'table',
  unsupported: 'table',
  'bad-remote': 'table',
  'missing-token': 'table',
}

describe('FAILURE_EXIT accounts for every failure kind', () => {
  test.each(Object.entries(ACCOUNTED))('%s is %s', (kind, where) => {
    expect(Object.hasOwn(FAILURE_EXIT, kind)).toBe(where === 'table')
    if (where === 'exit1') {
      expect(exitCodeFor({ kind, message: 'm' })).toBe(1)
    }
  })

  test('the table names no kind that no layer reports', () => {
    expect(Object.keys(FAILURE_EXIT).filter((k) => !Object.hasOwn(ACCOUNTED, k))).toEqual([])
  })
})
