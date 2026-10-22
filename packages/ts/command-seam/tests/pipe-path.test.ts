/**
 * The production sync capture path. Under `bun test` `NODE_ENV=test`, and
 * `spawnRunner` reads that once at import time to switch to a temp-file
 * capture. Everything in `seam.test.ts` therefore runs the test-only path.
 * Here `support/pipe-probe.ts` runs a matrix of cases in a child with
 * `NODE_ENV` removed, so the pipe path users actually run is checked by real
 * tests. No source change is needed: a fresh process re-reads the switch.
 *
 * POSIX-only (`sh`, `kill`, `head`), grouped so a platform skip can wrap it.
 */

import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { beforeAll, describe, expect, test } from 'vitest'

import type { CommandResult, JsonRun } from '../src/index.ts'
import { alive, reap } from './support/procs.ts'

type Timed = { value: CommandResult; ms: number }
type Probe = {
  nodeEnv: string | null
  capture: CommandResult
  input: CommandResult
  largeOutput: { exitCode: number; length: number }
  timeoutIgnoresTerm: Timed
  timeoutPartialOutput: Timed
  timeoutDirectChild: { neverExited: boolean | undefined; pid: number }
  grandchildHoldsPipes: Timed & { pid: number }
  timeoutZero: string
  timeoutFraction: CommandResult
  missingBinary: CommandResult
  outputCap: Omit<CommandResult, 'stdout'> & { stdout: number }
  outputCapSet: CommandResult
  /** `spawnRunnerBytes` results, stdout as base64. */
  bytes: CommandResult
  bytesCap: CommandResult
  signalDeath: CommandResult
  genuineExit1: CommandResult
  badCwd: CommandResult
  cwd: CommandResult
  envMerge: CommandResult
  envUnset: CommandResult
  argvInert: CommandResult
  argvInertFiles: CommandResult
  epipe: Timed
  shell: CommandResult
  shellTimeout: CommandResult
  shellMissingSh: CommandResult
  runJson: JsonRun<{ a: number }>
}

let probe: Probe

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'seam-pipe-matrix-'))
  try {
    const outFile = join(dir, 'result.json')
    const env = { ...process.env }
    delete env['NODE_ENV']
    const proc = spawnSync(
      process.execPath,
      ['--no-warnings', join(import.meta.dirname, 'support/pipe-probe.ts'), outFile],
      { cwd: process.cwd(), env, encoding: 'utf-8', timeout: 30_000 },
    )
    if (proc.status !== 0) throw new Error(`pipe probe failed: ${proc.stderr}`)
    probe = JSON.parse(readFileSync(outFile, 'utf-8')) as Probe
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}, 60_000)

describe('spawnRunner — production pipe path (NODE_ENV unset)', () => {
  test('the probe really ran without the test switch', () => {
    expect(probe.nodeEnv).toBeNull()
  })

  test('captures stdout, stderr and a non-zero exit verbatim', () => {
    expect(probe.capture).toEqual({ exitCode: 3, stdout: 'out\n', stderr: 'err\n' })
  })

  test('input is written to the child stdin', () => {
    expect(probe.input.stdout).toBe('over the seam\n')
  })

  test('output well past a pipe buffer is captured whole', () => {
    expect(probe.largeOutput).toEqual({ exitCode: 0, length: 3_000_000 })
  })

  test('timeoutMs is a hard cap for a child that ignores SIGTERM', () => {
    expect(probe.timeoutIgnoresTerm.ms).toBeLessThan(5000)
    expect(probe.timeoutIgnoresTerm.value.exitCode).not.toBe(0)
    expect(probe.timeoutIgnoresTerm.value.neverExited).toBe(true)
    expect(probe.timeoutIgnoresTerm.value.reason).toBe('timeout')
    expect(probe.timeoutIgnoresTerm.value.signal).toBe('SIGKILL')
  })

  test('a timeout kills the direct child only; a grandchild survives', () => {
    const { neverExited, pid } = probe.timeoutDirectChild
    try {
      expect(neverExited).toBe(true)
      expect(pid).toBeGreaterThan(0)
      expect(alive(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  })

  test('a grandchild holding the pipes past the timeout is outputIncomplete', () => {
    const { value, ms, pid } = probe.grandchildHoldsPipes
    try {
      expect(ms).toBeLessThan(5000)
      expect(value).toMatchObject({ exitCode: 0, outputIncomplete: true, stdout: 'hi\n' })
      expect(value.neverExited).toBeUndefined()
      expect(value.reason).toBeUndefined()
      expect(value.error).toContain('ETIMEDOUT')
      expect(alive(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  })

  test('output captured before a timeout is returned', () => {
    expect(probe.timeoutPartialOutput.value.stdout).toBe('before\n')
    expect(probe.timeoutPartialOutput.value.neverExited).toBe(true)
  })

  test('a missing binary is a non-zero exit with an error message and neverExited', () => {
    expect(probe.missingBinary.exitCode).not.toBe(0)
    expect(probe.missingBinary.error).toContain('definitely-not-a-real-binary-pipe')
    expect(probe.missingBinary.neverExited).toBe(true)
    expect(probe.missingBinary.reason).toBe('spawn')
    expect(probe.missingBinary.stderr).toBe('')
    expect(probe.missingBinary.signal).toBeUndefined()
  })

  test('passing the 256 MB output cap is output, with the error', () => {
    expect(probe.outputCap).toMatchObject({
      neverExited: true,
      reason: 'output',
      signal: 'SIGKILL',
    })
    expect(probe.outputCap.error).toContain('ENOBUFS')
  })

  test('maxOutputBytes replaces the default cap and cuts on a character boundary', () => {
    const r = probe.outputCapSet
    expect(r.stdout).toBe('€'.repeat(33))
    expect(r.reason === 'output' || r.outputIncomplete === true).toBe(true)
    expect(r.error).toContain('ENOBUFS')
  })

  test('spawnRunnerBytes returns the bytes the child wrote, and decodes stderr', () => {
    expect(probe.bytes).toEqual({
      exitCode: 0,
      stdout: Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x61, 0x62, 0x63]).toString('base64'),
      stderr: 'warn €\n',
    })
  })

  test('spawnRunnerBytes cuts stdout at exactly maxOutputBytes', () => {
    const r = probe.bytesCap
    expect(r.stdout).toBe(Buffer.from('€'.repeat(34)).subarray(0, 100).toString('base64'))
    expect(r.reason === 'output' || r.outputIncomplete === true).toBe(true)
    expect(r.error).toContain('ENOBUFS')
  })

  test('a signal-killed child is neverExited; a genuine exit 1 is not', () => {
    expect(probe.signalDeath.neverExited).toBe(true)
    expect(probe.signalDeath.reason).toBe('signal')
    expect(probe.signalDeath.signal).toBe('SIGKILL')
    expect(probe.genuineExit1.exitCode).toBe(1)
    expect(probe.genuineExit1.neverExited).toBeUndefined()
    expect(probe.genuineExit1.reason).toBeUndefined()
  })

  test('a bad cwd is flattened into a neverExited result with a message', () => {
    expect(probe.badCwd.neverExited).toBe(true)
    expect(probe.badCwd.reason).toBe('spawn')
    expect(probe.badCwd.error).toContain('ENOENT: cwd')
    expect(probe.badCwd.error).toContain('does not exist')
    expect(probe.badCwd.stderr).toBe('')
  })

  test('cwd is honoured', () => {
    expect(probe.cwd.stdout.trim()).toContain('seam-probe-')
  })

  test('env merges over the parent, and an undefined entry removes a var', () => {
    expect(probe.envMerge.stdout).toBe('added:inherited\n')
    expect(probe.envUnset.stdout).toBe('absent\n')
  })

  test('argv is never re-parsed as shell', () => {
    expect(probe.argvInert.stdout).toBe("[a b][$(echo hacked)][;touch pwned][it's]")
    expect(probe.argvInertFiles.stdout).toBe('')
  })

  test('runShell forwards positionals', () => {
    expect(probe.shell.stdout).toBe('nm:one\n')
  })

  test('runShell honours timeoutMs as a hard cap', () => {
    expect(probe.shellTimeout.neverExited).toBe(true)
    expect(probe.shellTimeout.reason).toBe('timeout')
  })

  test('a missing shell binary behind shellRunner is neverExited', () => {
    expect(probe.shellMissingSh.neverExited).toBe(true)
    expect(probe.shellMissingSh.reason).toBe('spawn')
  })

  test('runJson with tolerateLeadingLog skips a leading log line', () => {
    expect(probe.runJson.ok).toBe(true)
    if (probe.runJson.ok) expect(probe.runJson.value).toEqual({ a: 1 })
  })

  // Bun's `spawnSync`, which runs this probe, does not report the failed write
  // (a README known limit); regressions.test.ts checks that Node's does.
  test('a child that closes stdin early keeps its exit code', () => {
    expect(probe.epipe.value.exitCode).toBe(0)
  })

  test('timeoutMs: 0 throws RangeError, as on every runner', () => {
    expect(probe.timeoutZero).toBe('RangeError')
  })

  test('a fractional timeoutMs is a cap, not an error', () => {
    expect(probe.timeoutFraction.reason).toBe('timeout')
  })
})
