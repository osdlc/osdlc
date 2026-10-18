/**
 * `maxOutputBytes`: the per-stream output cap. The async runner is checked
 * here on real pipes; the sync pipe path is in `pipe-path.test.ts`, since
 * under `bun test` the sync runner captures through files and has no cap.
 *
 * POSIX-only (`sh`, `head`, `tr`, `printf`).
 */

import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'bun:test'

import { spawnRunner, spawnRunnerAsync } from '../index.ts'
import { gone, reap } from './support/procs.ts'

const CWD = process.cwd()
const sh = spawnRunnerAsync('sh')
const xs = (n: number) => `head -c ${n} /dev/zero | tr '\\0' x`

describe('spawnRunnerAsync maxOutputBytes', () => {
  test('passing the cap on stdout kills the child and keeps the first bytes', async () => {
    const r = await sh.run(['-c', `${xs(100_000)}; sleep 10`], { cwd: CWD, maxOutputBytes: 1000 })
    expect(r).toMatchObject({ exitCode: 1, neverExited: true, reason: 'output' })
    expect(r.stdout).toBe('x'.repeat(1000))
    expect(r.error).toBe('stdout passed maxOutputBytes (1000 bytes)')
  }, 10_000)

  test('the cap applies to stderr on its own', async () => {
    const r = await sh.run(['-c', `${xs(10)}; ${xs(5000)} >&2; sleep 10`], {
      cwd: CWD,
      maxOutputBytes: 100,
    })
    expect(r).toMatchObject({ neverExited: true, reason: 'output', stdout: 'x'.repeat(10) })
    expect(r.stderr).toBe('x'.repeat(100))
    expect(r.error).toBe('stderr passed maxOutputBytes (100 bytes)')
  }, 10_000)

  test('the cut falls on a character boundary', async () => {
    // '€' is 3 bytes: a 100-byte cap fits 33 of them, and the 34th is dropped whole.
    const r = await sh.run(['-c', `i=0; while [ $i -lt 200 ]; do printf '€'; i=$((i+1)); done`], {
      cwd: CWD,
      maxOutputBytes: 100,
    })
    expect(r.stdout).toBe('€'.repeat(33))
    expect(r.reason === 'output' || r.outputIncomplete === true).toBe(true)
  }, 10_000)

  test('passing the cap after the child exited keeps its exit code', async () => {
    // The child exits at once; a process it started floods stdout during the
    // exit grace.
    const r = await sh.run(['-c', `(sleep 0.1; ${xs(5000)}) & exit 0`], {
      cwd: CWD,
      maxOutputBytes: 100,
    })
    expect(r).toMatchObject({ exitCode: 0, outputIncomplete: true, stdout: 'x'.repeat(100) })
    expect(r.neverExited).toBeUndefined()
    expect(r.reason).toBeUndefined()
    expect(r.error).toBe('stdout passed maxOutputBytes (100 bytes)')
  }, 10_000)

  test('a child killed by a signal keeps that reason when output then passes the cap', async () => {
    const r = await sh.run(['-c', `(sleep 0.1; ${xs(5000)}) & kill -9 $$`], {
      cwd: CWD,
      maxOutputBytes: 100,
    })
    expect(r).toMatchObject({ neverExited: true, reason: 'signal', signal: 'SIGKILL' })
    expect(r.outputIncomplete).toBeUndefined()
  }, 10_000)

  test('output at or under the cap is untouched', async () => {
    const r = await sh.run(['-c', xs(1000)], { cwd: CWD, maxOutputBytes: 1000 })
    expect(r).toEqual({ exitCode: 0, stdout: 'x'.repeat(1000), stderr: '' })
  })

  test('with processGroup, the whole group is killed', async () => {
    const pidFile = join(tmpdir(), `seam-cap-pid-${process.pid}`)
    let pid = 0
    try {
      const r = await sh.run(['-c', `sleep 30 & echo $! > "${pidFile}"; ${xs(5000)}; wait`], {
        cwd: CWD,
        maxOutputBytes: 100,
        processGroup: true,
      })
      pid = Number(readFileSync(pidFile, 'utf8').trim())
      expect(r.reason).toBe('output')
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
      rmSync(pidFile, { force: true })
    }
  }, 10_000)

  test('Infinity is no cap, and a fraction rounds up', async () => {
    expect(
      (await sh.run(['-c', xs(5000)], { cwd: CWD, maxOutputBytes: Infinity })).stdout,
    ).toHaveLength(5000)
    const r = await sh.run(['-c', `${xs(100)}; sleep 10`], { cwd: CWD, maxOutputBytes: 9.2 })
    expect(r.stdout).toBe('x'.repeat(10))
  }, 10_000)

  test('an invalid cap rejects before spawning', async () => {
    for (const bad of [0, -1, Number.NaN]) {
      await expect(sh.run(['-c', 'true'], { cwd: CWD, maxOutputBytes: bad })).rejects.toThrow(
        RangeError,
      )
    }
    const notANumber = '10' as unknown as number
    await expect(sh.run(['-c', 'true'], { cwd: CWD, maxOutputBytes: notANumber })).rejects.toThrow(
      TypeError,
    )
  })
})

describe('spawnRunner maxOutputBytes', () => {
  test('an invalid cap throws, on the bun test path too', () => {
    expect(() => spawnRunner('sh').run(['-c', 'true'], { cwd: CWD, maxOutputBytes: 0 })).toThrow(
      RangeError,
    )
  })
})
