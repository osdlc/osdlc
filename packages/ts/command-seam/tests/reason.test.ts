/**
 * `reason` and `signal`: why a run never reported an exit status, on every
 * runner. Each runner gets one case per cause it can hit, and a genuine exit
 * that must carry neither field. The sync pipe path is covered in
 * `pipe-path.test.ts`; here the sync runner takes the `bun test` path.
 */

import { describe, expect, test, vi } from 'vitest'

import {
  managedProcessRunner,
  runShell,
  runShellAsync,
  shellRunner,
  spawnRunner,
  spawnRunnerAsync,
  streamRunner,
  type StreamResult,
} from '../src/index.ts'
import { fromSpawnSync, syncStop } from '../src/sync.ts'

const CWD = process.cwd()
const MISSING = 'definitely-not-a-real-binary-reason'

/** Run `fn` with the parent's stderr silenced, returning what it wrote too. */
function quietly<T>(fn: () => T): { value: T; written: string[] } {
  const written: string[] = []
  const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    written.push(String(chunk))
    return true
  })
  try {
    return { value: fn(), written }
  } finally {
    spy.mockRestore()
  }
}

describe('spawnRunner', () => {
  const sh = spawnRunner('sh')

  test('a missing binary is spawn, with the error in error only', () => {
    const r = spawnRunner(MISSING).run([], { cwd: CWD })
    expect(r).toMatchObject({ neverExited: true, reason: 'spawn' })
    expect(r.signal).toBeUndefined()
    expect(r.error).toContain(MISSING)
    expect(r.stderr).toBe('')
  })

  test('a timeout is timeout, killed by SIGKILL, with the error', () => {
    const r = sh.run(['-c', 'sleep 10'], { cwd: CWD, timeoutMs: 200 })
    expect(r).toMatchObject({ neverExited: true, reason: 'timeout', signal: 'SIGKILL' })
    expect(r.error).toContain('ETIMEDOUT')
    expect(r.stderr).toBe('')
  }, 10_000)

  test("a timeout keeps the child's own stderr, and error still names the timeout", () => {
    const r = sh.run(['-c', 'echo working >&2; sleep 10'], { cwd: CWD, timeoutMs: 300 })
    expect(r.stderr).toBe('working\n')
    expect(r.error).toContain('ETIMEDOUT')
  }, 10_000)

  test('a death by signal is signal, with the signal and no runner message', () => {
    const r = sh.run(['-c', 'kill -TERM $$'], { cwd: CWD })
    expect(r).toMatchObject({ neverExited: true, reason: 'signal', signal: 'SIGTERM' })
    expect(r.error).toBeUndefined()
  })

  test('a genuine exit carries no reason or signal', () => {
    const r = sh.run(['-c', 'exit 1'], { cwd: CWD })
    expect(r).toEqual({ exitCode: 1, stdout: '', stderr: '' })
  })
})

describe('syncStop (the spawnSync mapping)', () => {
  const err = (code: string) => Object.assign(new Error(code), { code })

  test('ETIMEDOUT is timeout, with the kill signal', () => {
    expect(syncStop({ error: err('ETIMEDOUT'), signal: 'SIGKILL' })).toEqual({
      reason: 'timeout',
      signal: 'SIGKILL',
    })
  })

  test('the output cap (ENOBUFS) is output, with the kill signal', () => {
    expect(syncStop({ error: err('ENOBUFS'), signal: 'SIGKILL' })).toEqual({
      reason: 'output',
      signal: 'SIGKILL',
    })
  })

  test('an error with no signal is spawn', () => {
    expect(syncStop({ error: err('EACCES'), signal: null })).toEqual({ reason: 'spawn' })
  })
})

describe('fromSpawnSync: a real exit with a timeout or cap error', () => {
  const err = (code: string) => Object.assign(new Error(`spawnSync sh ${code}`), { code })

  test('ETIMEDOUT with a status is outputIncomplete, not neverExited', () => {
    const r = fromSpawnSync({ status: 0, signal: null, error: err('ETIMEDOUT') }, 'hi\n', '')
    expect(r).toEqual({
      exitCode: 0,
      outputIncomplete: true,
      stdout: 'hi\n',
      stderr: '',
      error: 'spawnSync sh ETIMEDOUT',
    })
  })

  test('ENOBUFS with a status (Bun, at the cap) is outputIncomplete', () => {
    const r = fromSpawnSync({ status: 0, signal: null, error: err('ENOBUFS') }, '', '')
    expect(r.outputIncomplete).toBe(true)
    expect(r.reason).toBeUndefined()
  })

  test('a timeout that killed the child is neverExited only', () => {
    const r = fromSpawnSync({ status: null, signal: 'SIGKILL', error: err('ETIMEDOUT') }, '', '')
    expect(r).toMatchObject({ neverExited: true, reason: 'timeout' })
    expect(r.outputIncomplete).toBeUndefined()
  })

  test('a failed stdin write keeps the exit and is not outputIncomplete', () => {
    const r = fromSpawnSync({ status: 0, signal: null, error: err('EPIPE') }, '', '')
    expect(r.outputIncomplete).toBeUndefined()
    expect(r.error).toBe('spawnSync sh EPIPE')
  })
})

describe('spawnRunnerAsync', () => {
  const sh = spawnRunnerAsync('sh')

  test('a missing binary is spawn, with the error in error only', async () => {
    const r = await spawnRunnerAsync(MISSING).run([], { cwd: CWD })
    expect(r).toMatchObject({ neverExited: true, reason: 'spawn' })
    expect(r.signal).toBeUndefined()
    expect(r.error).toContain(MISSING)
    expect(r.stderr).toBe('')
  })

  test('a timeout is timeout, with the error', async () => {
    const r = await sh.run(['-c', 'sleep 10'], { cwd: CWD, timeoutMs: 200 })
    expect(r).toMatchObject({
      neverExited: true,
      reason: 'timeout',
      stderr: '',
      error: 'timed out after 200ms',
    })
  }, 10_000)

  test("a timeout keeps the child's own stderr, and error still names the timeout", async () => {
    const r = await sh.run(['-c', 'echo working >&2; sleep 10'], { cwd: CWD, timeoutMs: 300 })
    expect(r.stderr).toBe('working\n')
    expect(r.error).toBe('timed out after 300ms')
  }, 10_000)

  test('an abort is abort', async () => {
    const ac = new AbortController()
    const pending = sh.run(['-c', 'sleep 10'], { cwd: CWD, signal: ac.signal })
    setTimeout(() => ac.abort(), 100)
    expect(await pending).toMatchObject({
      neverExited: true,
      reason: 'abort',
      error: 'The operation was aborted',
    })
  }, 10_000)

  test('an already-aborted signal is abort', async () => {
    const r = await sh.run(['-c', 'sleep 10'], { cwd: CWD, signal: AbortSignal.abort() })
    expect(r).toMatchObject({ neverExited: true, reason: 'abort' })
  }, 10_000)

  test('an onSpawn that throws is abort', async () => {
    const r = await sh.run(['-c', 'sleep 10'], {
      cwd: CWD,
      onSpawn: () => {
        throw new Error('boom')
      },
    })
    expect(r).toMatchObject({ neverExited: true, reason: 'abort', error: 'onSpawn threw: boom' })
  }, 10_000)

  test('a death by signal is signal, with the signal', async () => {
    const r = await sh.run(['-c', 'kill -TERM $$'], { cwd: CWD })
    expect(r).toMatchObject({ neverExited: true, reason: 'signal', signal: 'SIGTERM' })
  })

  test('a failed stdin write keeps the exit code, with the error and no reason', async () => {
    const r = await sh.run(['-c', 'exec 0<&-; sleep 0.3'], {
      cwd: CWD,
      input: 'x'.repeat(4 * 1024 * 1024),
    })
    expect(r.exitCode).toBe(0)
    expect(r.reason).toBeUndefined()
    expect(r.error).toContain('EPIPE')
    expect(r.stderr).toBe('')
  }, 10_000)

  test('a genuine exit carries no reason or signal', async () => {
    expect(await sh.run(['-c', 'exit 1'], { cwd: CWD })).toEqual({
      exitCode: 1,
      stdout: '',
      stderr: '',
    })
  })
})

describe('shell runners', () => {
  test('a timeout is timeout, sync and async', async () => {
    expect(runShell('sleep 10', { cwd: CWD, timeoutMs: 200 }).reason).toBe('timeout')
    expect((await runShellAsync('sleep 10', { cwd: CWD, timeoutMs: 200 })).reason).toBe('timeout')
  }, 10_000)

  test('an abort is abort', async () => {
    const r = await runShellAsync('sleep 10', { cwd: CWD, signal: AbortSignal.abort() })
    expect(r.reason).toBe('abort')
  }, 10_000)

  test('a missing shell is spawn', () => {
    expect(shellRunner(spawnRunner(MISSING)).run('true', { cwd: CWD }).reason).toBe('spawn')
  })
})

describe('streamRunner', () => {
  test('a missing binary is spawn, with the error', () => {
    const { value: r, written } = quietly(() => streamRunner(MISSING).run([], { cwd: CWD }))
    expect(r).toMatchObject({ exitCode: 1, neverExited: true, reason: 'spawn' })
    expect(r.error).toContain(MISSING)
    expect(written).toEqual([`${r.error}\n`])
  })

  test('a timeout is timeout, killed by SIGKILL, with the error', () => {
    const { value: r } = quietly(() =>
      streamRunner('sh').run(['-c', 'sleep 10'], { cwd: CWD, timeoutMs: 200 }),
    )
    expect(r).toMatchObject({ neverExited: true, reason: 'timeout', signal: 'SIGKILL' })
    expect(r.error).toContain('ETIMEDOUT')
  }, 10_000)

  test('a death by signal is signal, with no error', () => {
    const { value: r } = quietly(() =>
      streamRunner('sh').run(['-c', 'kill -TERM $$'], { cwd: CWD }),
    )
    expect(r).toEqual<StreamResult>({
      exitCode: 1,
      neverExited: true,
      reason: 'signal',
      signal: 'SIGTERM',
    })
  })
})

describe('managedProcessRunner', () => {
  test('a missing binary is spawn, with the error', async () => {
    const r = await managedProcessRunner(MISSING).run([], { cwd: CWD }).exited
    expect(r).toMatchObject({ exitCode: 1, signal: null, neverExited: true, reason: 'spawn' })
    expect(r.error).toContain(MISSING)
  })

  test("the caller's kill() is abort", async () => {
    const h = managedProcessRunner('sh').run(['-c', 'exec sleep 10'], { cwd: CWD })
    h.kill()
    expect(await h.exited).toEqual({
      exitCode: 1,
      signal: 'SIGTERM',
      neverExited: true,
      reason: 'abort',
    })
  }, 10_000)

  test("processGroup: the caller's kill() is abort", async () => {
    const h = managedProcessRunner('sh').run(['-c', 'exec sleep 10'], {
      cwd: CWD,
      processGroup: true,
    })
    h.kill('SIGKILL')
    expect(await h.exited).toMatchObject({ signal: 'SIGKILL', reason: 'abort' })
  }, 10_000)

  test('a numeric kill() is abort', async () => {
    const h = managedProcessRunner('sh').run(['-c', 'exec sleep 10'], { cwd: CWD })
    h.kill(15)
    expect(await h.exited).toMatchObject({ signal: 'SIGTERM', reason: 'abort' })
  }, 10_000)

  test('a signal the child handles, then a death from elsewhere, is signal', async () => {
    const h = managedProcessRunner('sh').run(
      ['-c', "trap ':' USR1; while :; do sleep 0.05; done"],
      { cwd: CWD },
    )
    await new Promise((r) => setTimeout(r, 200))
    h.kill('SIGUSR1')
    await new Promise((r) => setTimeout(r, 200))
    process.kill(h.pid, 'SIGTERM')
    expect(await h.exited).toMatchObject({ signal: 'SIGTERM', reason: 'signal' })
  }, 10_000)

  test('a signal from elsewhere is signal, even after a kill(0) probe', async () => {
    const h = managedProcessRunner('sh').run(['-c', 'exec sleep 10'], { cwd: CWD })
    h.kill(0)
    process.kill(h.pid, 'SIGTERM')
    expect(await h.exited).toMatchObject({ signal: 'SIGTERM', reason: 'signal' })
  }, 10_000)

  test('a kill() the child survives leaves its own exit code and no reason', async () => {
    const h = managedProcessRunner('sh').run(
      ['-c', "trap 'exit 3' TERM; while :; do sleep 0.05; done"],
      { cwd: CWD },
    )
    await new Promise((r) => setTimeout(r, 200))
    h.kill()
    expect(await h.exited).toEqual({ exitCode: 3, signal: null })
  }, 10_000)
})

describe('a bad cwd', () => {
  // Without a check, a missing cwd fails the spawn as `spawn sh ENOENT`, which
  // reads as a missing `sh`, and Node's async `spawn` throws for a file.
  const MISSING_DIR = `${CWD}/no-such-dir-reason`
  const FILE = import.meta.filename
  const cases: [string, string, string][] = [
    ['missing', MISSING_DIR, `ENOENT: cwd ${JSON.stringify(MISSING_DIR)} does not exist`],
    ['a file', FILE, `ENOTDIR: cwd ${JSON.stringify(FILE)} is not a directory`],
    ['empty', '', 'ENOENT: cwd "" does not exist'],
  ]

  test('does not hide a NUL byte in argv or env, which throws as it does with a good cwd', async () => {
    const cwd = MISSING_DIR
    const nul = { code: 'ERR_INVALID_ARG_VALUE' }
    expect(() => spawnRunner('sh').run(['a\0b'], { cwd })).toThrow(TypeError)
    expect(() => spawnRunner('sh').run([], { cwd, env: { A: 'x\0y' } })).toThrow(
      expect.objectContaining(nul),
    )
    expect(() => spawnRunner('s\0h').run([], { cwd })).toThrow(expect.objectContaining(nul))
    expect(() => runShell('true', { cwd, args: ['a\0b'] })).toThrow(expect.objectContaining(nul))
    await expect(spawnRunnerAsync('sh').run(['a\0b'], { cwd })).rejects.toMatchObject(nul)
    expect(() => streamRunner('sh').run(['a\0b'], { cwd })).toThrow(expect.objectContaining(nul))
    expect(() => managedProcessRunner('sh').run(['a\0b'], { cwd })).toThrow(
      expect.objectContaining(nul),
    )
  })

  for (const [name, cwd, message] of cases) {
    describe(name, () => {
      test('capture runners: spawn, naming the cwd', async () => {
        const results = [
          spawnRunner('sh').run(['-c', 'true'], { cwd }),
          await spawnRunnerAsync('sh').run(['-c', 'true'], { cwd }),
          runShell('true', { cwd }),
          await runShellAsync('true', { cwd }),
        ]
        for (const r of results) {
          expect(r).toMatchObject({ exitCode: 1, neverExited: true, reason: 'spawn', stdout: '' })
          expect(r.error!.endsWith(message)).toBe(true)
          expect(r.stderr).toBe('')
        }
        expect(results[0]!.error).toBe(`spawnSync sh ${message}`)
        expect(results[1]!.error).toBe(`spawn sh ${message}`)
      })

      test('stream runner: spawn, naming the cwd', () => {
        const { value: r, written } = quietly(() => streamRunner('sh').run(['-c', 'true'], { cwd }))
        expect(r).toEqual({
          exitCode: 1,
          neverExited: true,
          reason: 'spawn',
          error: `spawnSync sh ${message}`,
        })
        expect(written).toEqual([`${r.error}\n`])
      })

      test('managed runner: spawn, naming the cwd', async () => {
        const h = managedProcessRunner('sh').run(['-c', 'true'], { cwd })
        expect(h.pid).toBe(-1)
        expect(await h.exited).toEqual({
          exitCode: 1,
          signal: null,
          neverExited: true,
          reason: 'spawn',
          error: `spawn sh ${message}`,
        })
      })
    })
  }
})
