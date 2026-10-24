/**
 * Need: fetch every repo in a workspace at once, cap each fetch with a
 * timeout, let the user cancel the lot, and report each repo's outcome
 * without one failure sinking the batch.
 *
 * `spawnRunnerAsync` returns a promise, so calls run concurrently. A timeout
 * or abort never rejects. It comes back as a result with `neverExited` and a
 * `reason`. `processGroup` makes the stop reach the processes git started.
 */

import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, expect, test } from 'vitest'

import {
  ran,
  spawnRunner,
  spawnRunnerAsync,
  stderrOrError,
  type AsyncCommandRunner,
  type AsyncCommandRunOptions,
} from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'

// ---- Code under test -------------------------------------------------------

interface FetchOutcome {
  repo: string
  ok: boolean
  /** Why it failed: `timeout`, `abort`, or the message from git or the runner. */
  why?: string
}

interface FetchAllOptions {
  timeoutMs?: number
  signal?: AbortSignal
  /** Called as each fetch starts, for a progress display. */
  onStart?: (repo: string, pid: number) => void
  git?: AsyncCommandRunner
}

/** Fetch every repo concurrently. Returns one outcome per repo, in order. */
async function fetchAll(repos: string[], opts: FetchAllOptions = {}): Promise<FetchOutcome[]> {
  const git = opts.git ?? spawnRunnerAsync('git')
  return Promise.all(
    repos.map(async (repo): Promise<FetchOutcome> => {
      const runOpts: AsyncCommandRunOptions = {
        cwd: repo,
        timeoutMs: opts.timeoutMs ?? 120_000,
        signal: opts.signal,
        onSpawn: (pid) => opts.onStart?.(repo, pid),
        // A stop also reaches the ssh child git starts for the transfer.
        processGroup: true,
      }
      const r = await git.run(['fetch', '--prune', 'origin'], runOpts)
      if (ran(r)) return { repo, ok: true }
      // For a stop, the reason says enough. Any other failure keeps its message.
      const why = r.reason === 'timeout' || r.reason === 'abort' ? r.reason : stderrOrError(r)
      return { repo, ok: false, why }
    }),
  )
}

// ---- Tests -----------------------------------------------------------------

test('one failed repo does not sink the batch', async () => {
  const { asyncRunner } = fakeRunner((_argv, opts) =>
    opts.cwd === '/b' ? { exitCode: 128, stderr: 'fatal: could not read from remote\n' } : {},
  )

  const outcomes = await fetchAll(['/a', '/b', '/c'], { git: asyncRunner })

  expect(outcomes).toEqual([
    { repo: '/a', ok: true },
    { repo: '/b', ok: false, why: 'fatal: could not read from remote' },
    { repo: '/c', ok: true },
  ])
})

test('a fetch that cannot start keeps the spawn message', async () => {
  const { asyncRunner } = fakeRunner({})

  const [outcome] = await fetchAll(['/gone'], { git: asyncRunner })

  expect(outcome?.why).toBe('fakeRunner: no answer for: fetch --prune origin')
})

test('every fetch gets the cap, the signal and its own process group', async () => {
  const { asyncRunner, calls } = fakeRunner({ 'fetch --prune origin': {} })
  const controller = new AbortController()

  await fetchAll(['/a', '/b'], {
    git: asyncRunner,
    timeoutMs: 5_000,
    signal: controller.signal,
  })

  expect(calls.map((c) => [c.opts.cwd, c.opts.timeoutMs, c.opts.processGroup])).toEqual([
    ['/a', 5_000, true],
    ['/b', 5_000, true],
  ])
  expect(calls.every((c) => c.opts.signal === controller.signal)).toBe(true)
})

// ---- The real runner -------------------------------------------------------

const scratch = mkdtempSync(join(tmpdir(), 'examples-fetch-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

/** A stand-in `git` that hangs in any repo named `slow`. */
function standInGit(): AsyncCommandRunner {
  const bin = join(scratch, 'git')
  writeFileSync(bin, '#!/bin/sh\ncase "$PWD" in */slow) sleep 10 ;; esac\necho fetched\n')
  chmodSync(bin, 0o755)
  // macOS checks a new executable on its first exec, which can take over half a
  // second. Run it once here so the timeout below times only the fetch.
  spawnRunner(bin).run(['--version'], { cwd: scratch })
  return spawnRunnerAsync(bin)
}

test('a real timeout and a real abort each stop only what they should', async () => {
  const fast = join(scratch, 'fast')
  const slow = join(scratch, 'slow')
  for (const dir of [fast, slow]) mkdirSync(dir)
  const git = standInGit()
  const started: string[] = []

  const timed = await fetchAll([fast, slow], {
    git,
    // The fast fetch takes about 10 ms. The slow one would take 10 s.
    timeoutMs: 1_000,
    onStart: (repo) => started.push(repo),
  })

  expect(timed.map((o) => o.why ?? 'ok')).toEqual(['ok', 'timeout'])
  expect(started.sort()).toEqual([fast, slow])

  // The user cancels as soon as the fetch starts.
  const controller = new AbortController()
  const cancelled = await fetchAll([slow], {
    git,
    signal: controller.signal,
    onStart: () => controller.abort(),
  })

  expect(cancelled).toEqual([{ repo: slow, ok: false, why: 'abort' }])
}, 15_000)
