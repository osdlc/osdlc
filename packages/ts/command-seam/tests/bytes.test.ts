/**
 * The bytes runners: `spawnBytesRunner` and `spawnBytesRunnerAsync` return
 * stdout and stderr as the bytes the child wrote, and the helpers decode
 * them only for their messages. Under `bun test` the sync runner captures
 * through temp files; `pipe-path.test.ts` covers its pipe path.
 *
 * POSIX-only (`sh`, `printf`, `cat`).
 */

import { randomBytes } from 'node:crypto'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, test } from 'bun:test'

import {
  asAsync,
  CommandFailed,
  failureText,
  runChecked,
  runCheckedAsync,
  spawnBytesRunner,
  spawnBytesRunnerAsync,
  spawnRunner,
  stderrOrError,
  withDefaults,
  type AsyncBytesCommandRunner,
  type BytesCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '../index.ts'
import { fakeBytesRunner, fakeNeverExited } from '../testing.ts'

const CWD = process.cwd()
/** Bytes that are not UTF-8: decoded, each becomes U+FFFD. */
const NOT_UTF8 = [0xff, 0xfe, 0x00, 0x80]
const PRINTF_NOT_UTF8 = "printf '\\377\\376\\000\\200'"

const dir = mkdtempSync(join(tmpdir(), 'seam-bytes-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('spawnBytesRunner', () => {
  const sh = spawnBytesRunner('sh')

  test('returns stdout and stderr as the bytes the child wrote', () => {
    const r = sh.run(['-c', `${PRINTF_NOT_UTF8}; printf '\\377' >&2; exit 3`], { cwd: CWD })
    expect(r.exitCode).toBe(3)
    expect(Buffer.isBuffer(r.stdout)).toBe(true)
    expect([...r.stdout]).toEqual(NOT_UTF8)
    expect([...r.stderr]).toEqual([0xff])
  })

  test('the text runner decodes the same bytes lossily', () => {
    const r = spawnRunner('sh').run(['-c', PRINTF_NOT_UTF8], { cwd: CWD })
    expect(r.stdout).toBe('��\u0000�')
  })

  test('no output is an empty Buffer', () => {
    const r = sh.run(['-c', 'true'], { cwd: CWD })
    expect(r).toEqual({ exitCode: 0, stdout: Buffer.alloc(0), stderr: Buffer.alloc(0) })
  })

  test('a failed spawn has empty Buffers', () => {
    const r = spawnBytesRunner('definitely-not-a-real-binary-bytes').run([], { cwd: CWD })
    expect(r.neverExited).toBe(true)
    expect(r.reason).toBe('spawn')
    expect(r.stdout).toEqual(Buffer.alloc(0))
    expect(r.stderr).toEqual(Buffer.alloc(0))
  })

  test('a bad cwd has empty Buffers', () => {
    const r = sh.run(['-c', 'true'], { cwd: join(dir, 'no-such-dir') })
    expect(r.reason).toBe('spawn')
    expect(r.stdout).toEqual(Buffer.alloc(0))
  })

  test('bytes written to stdin come back whole', () => {
    const input = randomBytes(64 * 1024)
    const r = spawnBytesRunner('cat').run([], { cwd: CWD, input })
    expect(r.stdout.equals(input)).toBe(true)
  })

  test('the text runner takes bytes as input too', () => {
    const r = spawnRunner('cat').run([], { cwd: CWD, input: Buffer.from('hi\n') })
    expect(r.stdout).toBe('hi\n')
  })
})

describe('spawnBytesRunnerAsync', () => {
  const sh = spawnBytesRunnerAsync('sh')

  test('returns stdout and stderr as the bytes the child wrote', async () => {
    const r = await sh.run(['-c', `${PRINTF_NOT_UTF8}; printf '\\377' >&2`], { cwd: CWD })
    expect(r.exitCode).toBe(0)
    expect([...r.stdout]).toEqual(NOT_UTF8)
    expect([...r.stderr]).toEqual([0xff])
  })

  test('output over many chunks is captured whole', async () => {
    const data = randomBytes(1024 * 1024)
    const file = join(dir, 'random.bin')
    writeFileSync(file, data)
    const r = await spawnBytesRunnerAsync('cat').run([file], { cwd: CWD })
    expect(r.stdout.equals(data)).toBe(true)
  })

  test('bytes written to stdin come back whole', async () => {
    const input = randomBytes(256 * 1024)
    const r = await spawnBytesRunnerAsync('cat').run([], { cwd: CWD, input })
    expect(r.stdout.equals(input)).toBe(true)
  })

  test('the cap cuts at maxOutputBytes exactly, not at a character', async () => {
    // 3-byte characters: text keeps 33 whole ones (99 bytes), bytes keep 100.
    const script = `i=0; while [ $i -lt 2000 ]; do printf '€'; i=$((i+1)); done; exec sleep 10`
    const r = await sh.run(['-c', script], { cwd: CWD, maxOutputBytes: 100 })
    expect(r.neverExited).toBe(true)
    expect(r.reason).toBe('output')
    expect(r.stdout.length).toBe(100)
    expect(r.stdout.equals(Buffer.from('€'.repeat(34)).subarray(0, 100))).toBe(true)
  })

  test('a timeout keeps the bytes written before it', async () => {
    const r = await sh.run(['-c', `${PRINTF_NOT_UTF8}; exec sleep 10`], {
      cwd: CWD,
      timeoutMs: 500,
    })
    expect(r.reason).toBe('timeout')
    expect([...r.stdout]).toEqual(NOT_UTF8)
  })

  test('a failed spawn has empty Buffers', async () => {
    const r = await spawnBytesRunnerAsync('definitely-not-a-real-binary-bytes').run([], {
      cwd: CWD,
    })
    expect(r.reason).toBe('spawn')
    expect(r.stdout).toEqual(Buffer.alloc(0))
    expect(r.stderr).toEqual(Buffer.alloc(0))
  })
})

describe('helpers with a bytes result', () => {
  const failed: CommandResult<Buffer> = {
    exitCode: 2,
    stdout: Buffer.from('  the reason  \n'),
    stderr: Buffer.from('fatal: bad object\n'),
  }

  test('failureText and stderrOrError decode the output', () => {
    expect(stderrOrError(failed)).toBe('fatal: bad object')
    expect(failureText(failed)).toBe('fatal: bad object')
    expect(failureText(failed, { both: true })).toBe('fatal: bad object\nthe reason')
    expect(failureText({ ...failed, stderr: Buffer.alloc(0) })).toBe('the reason')
  })

  test('runChecked returns the bytes, typed as a Buffer', () => {
    const r = runChecked(spawnBytesRunner('sh'), ['-c', PRINTF_NOT_UTF8], { cwd: CWD })
    const stdout: Buffer = r.stdout
    expect([...stdout]).toEqual(NOT_UTF8)
  })

  test('runChecked throws a CommandFailed that keeps the bytes and decodes stderr', () => {
    const { runner } = fakeBytesRunner({ 'cat-file blob x': failed })
    let caught: unknown
    try {
      runChecked(withDefaults({ ...runner, binary: 'git' }, { cwd: '/repo' }), [
        'cat-file',
        'blob',
        'x',
      ])
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(CommandFailed)
    const e = caught as CommandFailed<Buffer>
    expect(e.message).toBe('command failed (exit 2): git cat-file blob x\nfatal: bad object')
    expect(e.detail).toBe('fatal: bad object\nthe reason')
    expect(Buffer.isBuffer(e.result.stderr)).toBe(true)
  })

  test('runCheckedAsync returns the bytes, typed as a Buffer', async () => {
    const r = await runCheckedAsync(spawnBytesRunnerAsync('sh'), ['-c', PRINTF_NOT_UTF8], {
      cwd: CWD,
    })
    const stdout: Buffer = r.stdout
    expect([...stdout]).toEqual(NOT_UTF8)
  })

  test('asAsync wraps a bytes runner as an async bytes runner', async () => {
    const git: AsyncBytesCommandRunner = asAsync(spawnBytesRunner('sh'))
    const r = await git.run(['-c', PRINTF_NOT_UTF8], { cwd: CWD })
    expect([...r.stdout]).toEqual(NOT_UTF8)
  })

  test('a bytes runner is not a text runner, and the other way round', () => {
    // @ts-expect-error its stdout is a Buffer, not a string
    const asText: CommandRunner = spawnBytesRunner('git')
    // @ts-expect-error its stdout is a string, not a Buffer
    const asBytes: BytesCommandRunner = spawnRunner('git')
    expect([asText, asBytes]).toHaveLength(2)
  })
})

describe('fakeBytesRunner', () => {
  test('answers with Buffers over an empty run, and records the call', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47])
    const { runner, calls } = fakeBytesRunner({ 'cat-file blob abc': { stdout: png } })
    const r = runner.run(['cat-file', 'blob', 'abc'], { cwd: '/repo' })
    expect(r).toEqual({ exitCode: 0, stdout: png, stderr: Buffer.alloc(0) })
    expect(calls).toEqual([{ argv: ['cat-file', 'blob', 'abc'], opts: { cwd: '/repo' } }])
  })

  test('a call with no answer is a failed spawn with empty Buffers', () => {
    const { runner } = fakeBytesRunner({})
    expect(runner.run(['status'], { cwd: '/repo' })).toEqual({
      exitCode: 1,
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      neverExited: true,
      reason: 'spawn',
      error: 'fakeBytesRunner: no answer for: status',
    })
  })

  test('fakeNeverExited serves a bytes table, and asyncRunner shares it', async () => {
    const { asyncRunner, calls } = fakeBytesRunner({
      'fetch origin': fakeNeverExited('timeout', { stdout: Buffer.from([1, 2]) }),
    })
    const r = await asyncRunner.run(['fetch', 'origin'], { cwd: '/repo' })
    expect(r.reason).toBe('timeout')
    expect([...r.stdout]).toEqual([1, 2])
    expect(calls).toHaveLength(1)
  })
})
