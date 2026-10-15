/**
 * One `timeoutMs` rule on every runner that has one: `undefined` and
 * `Infinity` mean no cap, a fraction rounds up, a value past the largest
 * timer delay is clamped to it, and `0`, a negative value or `NaN` is a
 * caller error (`RangeError`; a non-number is a `TypeError`). The sync
 * runners throw; the async runners reject.
 */

import { existsSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import {
  runShell,
  runShellAsync,
  shellRunner,
  shellRunnerAsync,
  spawnRunner,
  spawnRunnerAsync,
  streamRunner,
  type AsyncCommandRunner,
  type CommandRunner,
} from '../index.ts'
import { normalizeTimeout } from '../sync.ts'

const CWD = process.cwd()

interface Outcome {
  exitCode: number
  reason?: string | undefined
  error?: string | undefined
}

interface RunnerCase {
  name: string
  async: boolean
  /** Run `sh -c script`; a sync runner's throw stays a throw. */
  run(script: string, timeoutMs: number | undefined): Outcome | Promise<Outcome>
}

const RUNNERS: RunnerCase[] = [
  {
    name: 'sync',
    async: false,
    run: (script, timeoutMs) => spawnRunner('sh').run(['-c', script], { cwd: CWD, timeoutMs }),
  },
  {
    name: 'async',
    async: true,
    run: (script, timeoutMs) => spawnRunnerAsync('sh').run(['-c', script], { cwd: CWD, timeoutMs }),
  },
  {
    name: 'stream',
    async: false,
    run: (script, timeoutMs) => streamRunner('sh').run(['-c', script], { cwd: CWD, timeoutMs }),
  },
  {
    name: 'shell sync',
    async: false,
    run: (script, timeoutMs) => runShell(script, { cwd: CWD, timeoutMs }),
  },
  {
    name: 'shell async',
    async: true,
    run: (script, timeoutMs) => runShellAsync(script, { cwd: CWD, timeoutMs }),
  },
]

describe('normalizeTimeout', () => {
  test.each([
    [undefined, undefined],
    [Infinity, undefined],
    [1, 1],
    [1.2, 2],
    [250, 250],
    [2 ** 31 - 1, 2 ** 31 - 1],
    [2 ** 31, 2 ** 31 - 1],
    [1e300, 2 ** 31 - 1],
  ])('%p becomes %p', (given, want) => {
    expect(normalizeTimeout(given)).toBe(want)
  })

  test.each([0, -0, -1, -0.5, NaN, -Infinity])('%p throws RangeError', (given) => {
    expect(() => normalizeTimeout(given)).toThrow(RangeError)
  })

  test.each(['100', null, {}])('%p throws TypeError', (given) => {
    expect(() => normalizeTimeout(given as unknown as number)).toThrow(TypeError)
  })
})

/** Assert the run throws (sync) or rejects (async, never a synchronous throw) with `type`. */
async function expectCallerError(
  runner: RunnerCase,
  script: string,
  timeoutMs: number,
  type: typeof RangeError | typeof TypeError,
): Promise<void> {
  if (!runner.async) {
    expect(() => runner.run(script, timeoutMs)).toThrow(type)
    return
  }
  let threw = false
  let pending: Promise<Outcome> | undefined
  try {
    pending = runner.run(script, timeoutMs) as Promise<Outcome>
  } catch {
    threw = true
  }
  expect(threw).toBe(false)
  await expect(pending!).rejects.toThrow(type)
}

for (const runner of RUNNERS) {
  describe(runner.name, () => {
    test.each([0, -1, NaN])(`timeoutMs %p is a RangeError`, async (timeoutMs) => {
      await expectCallerError(runner, 'true', timeoutMs, RangeError)
    })

    test('a non-number timeoutMs is a TypeError', async () => {
      await expectCallerError(runner, 'true', '100' as unknown as number, TypeError)
    })

    test('an invalid timeoutMs starts nothing', async () => {
      const dir = mkdtempSync(join(tmpdir(), 'seam-timeout-'))
      try {
        const marker = join(dir, 'ran')
        await expectCallerError(runner, `touch '${marker}'`, 0, RangeError)
        await new Promise((r) => setTimeout(r, 300))
        expect(existsSync(marker)).toBe(false)
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })

    // 2^31 is clamped to 2^31 - 1, not fired at once as `setTimeout` would.
    test.each([undefined, Infinity, 2 ** 31])(
      'timeoutMs %p does not cut a run short',
      async (timeoutMs) => {
        const r = await runner.run('sleep 0.2; exit 4', timeoutMs)
        expect(r.exitCode).toBe(4)
        expect(r.reason).toBeUndefined()
      },
    )

    test('a fractional timeoutMs is a cap, rounded up', async () => {
      const r = await runner.run('exec sleep 5', 1.2)
      expect(r.reason).toBe('timeout')
    }, 10_000)
  })
}

test('the async runner reports the rounded-up value', async () => {
  const r = await spawnRunnerAsync('sh').run(['-c', 'exec sleep 5'], { cwd: CWD, timeoutMs: 1.2 })
  expect(r.error).toBe('timed out after 2ms')
})

describe('shell runners check timeoutMs before calling sh', () => {
  const calls: string[][] = []
  const sh: CommandRunner = {
    run: (argv) => {
      calls.push(argv)
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }
  const shAsync: AsyncCommandRunner = {
    run: async (argv) => sh.run(argv, { cwd: CWD }),
  }

  test('sync throws, and the fake never runs', () => {
    expect(() => shellRunner(sh).run('true', { cwd: CWD, timeoutMs: 0 })).toThrow(RangeError)
    expect(calls).toEqual([])
  })

  test('async rejects, and the fake never runs', async () => {
    await expect(
      shellRunnerAsync(shAsync).run('true', { cwd: CWD, timeoutMs: -5 }),
    ).rejects.toThrow(RangeError)
    expect(calls).toEqual([])
  })
})
