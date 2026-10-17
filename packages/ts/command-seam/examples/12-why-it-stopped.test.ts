/**
 * Need: retry a flaky network command, but only when another try might help.
 *
 * `neverExited` says the exit code is a stand-in, not the command's answer;
 * `reason` says which cause it was. A timeout or a stray signal may pass on a
 * retry. A binary that cannot start, the output cap, or a real non-zero exit
 * fails the same way every time, and a deliberate stop should not be undone
 * by a retry.
 */

import { expect, test } from 'bun:test'

import {
  spawnRunner,
  type CommandResult,
  type CommandRunner,
  type NeverExitedReason,
} from '@osdlc/command-seam'
import { fakeNeverExited, fakeRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

const RETRYABLE: readonly NeverExitedReason[] = ['timeout', 'signal']

function retryable(r: CommandResult): boolean {
  return r.reason !== undefined && RETRYABLE.includes(r.reason)
}

/** `git fetch` with a time cap, retried only when the cause might go away. */
function fetchWithRetry(
  dir: string,
  git: CommandRunner = spawnRunner('git'),
  attempts = 3,
): CommandResult {
  const fetch = () => git.run(['fetch', 'origin'], { cwd: dir, timeoutMs: 30_000 })
  let r = fetch()
  for (let tries = 1; tries < attempts && retryable(r); tries++) r = fetch()
  return r
}

// ---- Tests -----------------------------------------------------------------

/** What the sync runner reports when `timeoutMs` runs out. */
const timedOut = fakeNeverExited('timeout', { error: 'spawnSync git ETIMEDOUT' })

test('a timeout is retried until a run finishes', () => {
  let n = 0
  const { runner, calls } = fakeRunner(() => (n++ === 0 ? timedOut : { stdout: 'fetched\n' }))

  expect(fetchWithRetry('/repo', runner).stdout).toBe('fetched\n')
  expect(calls).toHaveLength(2)
})

test('gives up after the last attempt', () => {
  const { runner, calls } = fakeRunner({ 'fetch origin': timedOut })

  expect(fetchWithRetry('/repo', runner).reason).toBe('timeout')
  expect(calls).toHaveLength(3)
})

test('causes that repeat are not retried', () => {
  const failures: Partial<CommandResult>[] = [
    // Could not authenticate: git's own answer.
    { exitCode: 128, stderr: 'fatal: Authentication failed' },
    // Passed the 256 MB output cap.
    fakeNeverExited('output'),
  ]
  for (const answer of failures) {
    const { runner, calls } = fakeRunner({ 'fetch origin': answer })
    fetchWithRetry('/repo', runner)
    expect(calls).toHaveLength(1)
  }

  // No answer reports a failed spawn, as a missing git would.
  const noGit = fakeRunner({})
  expect(fetchWithRetry('/repo', noGit.runner).reason).toBe('spawn')
  expect(noGit.calls).toHaveLength(1)
})

// ---- The real runner -------------------------------------------------------

test('a real timeout reports its reason and the kill signal', () => {
  const r = spawnRunner('sh').run(['-c', 'sleep 10'], { cwd: process.cwd(), timeoutMs: 200 })

  expect(r.reason).toBe('timeout')
  expect(r.signal).toBe('SIGKILL')
}, 15_000)
