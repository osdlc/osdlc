/**
 * The bytes runners, `spawnRunnerBytes` and `spawnRunnerBytesAsync`: stdout
 * as the bytes the child wrote, stderr decoded, and the helpers that read a
 * result. The suite runs on Node, so the sync runner takes its pipe path
 * here.
 *
 * POSIX-only (`sh`, `printf`, `head`).
 */

import { createHash } from 'node:crypto'

import { describe, expect, test } from 'vitest'

import {
  asAsync,
  CommandFailed,
  failureText,
  runChecked,
  runCheckedAsync,
  spawnRunner,
  spawnRunnerBytes,
  spawnRunnerBytesAsync,
  type BytesCommandRunner,
  type CommandResult,
  type CommandRunner,
} from '../src/index.ts'
import { fakeRunner } from '../src/testing.ts'

const CWD = process.cwd()
/** Bytes that are not UTF-8: decoding them would replace each with U+FFFD. */
const RAW = Buffer.from([0xff, 0xfe, 0x00, 0x80, 0x61, 0x62, 0x63, 0x0a])
const PRINT_RAW = `printf '\\377\\376\\000\\200abc\\n'`
const sha256 = (b: Buffer) => createHash('sha256').update(b).digest('hex')

describe('spawnRunnerBytes', () => {
  const sh = spawnRunnerBytes('sh')

  test('stdout is the bytes the child wrote; stderr is decoded text', () => {
    const r = sh.run(['-c', `${PRINT_RAW}; echo 'warn €' >&2`], { cwd: CWD })
    expect(Buffer.isBuffer(r.stdout)).toBe(true)
    expect(r.stdout.equals(RAW)).toBe(true)
    expect(sha256(r.stdout)).toBe(sha256(RAW))
    expect(r.stderr).toBe('warn €\n')
    expect(r.exitCode).toBe(0)
  })

  test('the text runner would have changed those bytes', () => {
    const text = spawnRunner('sh').run(['-c', PRINT_RAW], { cwd: CWD }).stdout
    expect(Buffer.from(text).equals(RAW)).toBe(false)
  })

  test('a run that never started has an empty Buffer', () => {
    const missing = spawnRunnerBytes('definitely-not-a-real-binary-bytes').run([], { cwd: CWD })
    expect(missing).toMatchObject({ exitCode: 1, neverExited: true, reason: 'spawn' })
    expect(missing.stdout).toEqual(Buffer.alloc(0))
    const badCwd = sh.run(['-c', 'true'], { cwd: '/definitely/not/a/dir' })
    expect(badCwd.reason).toBe('spawn')
    expect(badCwd.stdout).toEqual(Buffer.alloc(0))
  })

  test('binary is set, so CommandFailed names it', () => {
    expect(sh.binary).toBe('sh')
  })
})

describe('spawnRunnerBytesAsync', () => {
  const sh = spawnRunnerBytesAsync('sh')

  test('stdout is the bytes the child wrote; stderr is decoded text', async () => {
    const r = await sh.run(['-c', `${PRINT_RAW}; echo 'warn €' >&2`], { cwd: CWD })
    expect(r.stdout.equals(RAW)).toBe(true)
    expect(r.stderr).toBe('warn €\n')
  })

  test('output larger than one pipe chunk comes back whole and in order', async () => {
    const r = await sh.run(
      ['-c', 'i=0; while [ $i -lt 20000 ]; do printf "%05d\\377" $i; i=$((i+1)); done'],
      {
        cwd: CWD,
      },
    )
    expect(r.stdout.length).toBe(20000 * 6)
    expect(r.stdout.subarray(6 * 12345, 6 * 12345 + 6)).toEqual(
      Buffer.from([...Buffer.from('12345'), 0xff]),
    )
  })

  test('maxOutputBytes cuts stdout at exactly the cap, not on a character boundary', async () => {
    // '€' is 3 bytes: the text runner keeps 33 whole ones (99 bytes); bytes keep 100.
    const r = await sh.run(
      ['-c', `i=0; while [ $i -lt 2000 ]; do printf '€'; i=$((i+1)); done; exec sleep 10`],
      {
        cwd: CWD,
        maxOutputBytes: 100,
      },
    )
    expect(r).toMatchObject({ neverExited: true, reason: 'output' })
    expect(r.stdout).toEqual(Buffer.from('€'.repeat(34)).subarray(0, 100))
    expect(r.error).toBe('stdout passed maxOutputBytes (100 bytes)')
  }, 10_000)

  test('stderr past the cap is still cut on a character boundary', async () => {
    const r = await sh.run(
      ['-c', `i=0; while [ $i -lt 2000 ]; do printf '€' >&2; i=$((i+1)); done; exec sleep 10`],
      {
        cwd: CWD,
        maxOutputBytes: 100,
      },
    )
    expect(r.reason).toBe('output')
    expect(r.stderr).toBe('€'.repeat(33))
    expect(r.stdout).toEqual(Buffer.alloc(0))
  }, 10_000)

  test('a run that never started has an empty Buffer', async () => {
    const r = await spawnRunnerBytesAsync('definitely-not-a-real-binary-bytes').run([], {
      cwd: CWD,
    })
    expect(r).toMatchObject({ neverExited: true, reason: 'spawn' })
    expect(r.stdout).toEqual(Buffer.alloc(0))
  })
})

describe('reading a bytes result', () => {
  test('runChecked returns the Buffer; its CommandFailed reads as text', () => {
    const sh = spawnRunnerBytes('sh')
    const blob: Buffer = runChecked(sh, ['-c', PRINT_RAW], { cwd: CWD }).stdout
    expect(blob.equals(RAW)).toBe(true)

    let caught: unknown
    try {
      runChecked(sh, ['-c', 'printf partial; echo "fatal: bad object" >&2; exit 128'], { cwd: CWD })
    } catch (e) {
      caught = e
    }
    expect(caught).toBeInstanceOf(CommandFailed)
    const e = caught as CommandFailed
    expect(e.message).toBe(
      `command failed (exit 128): sh -c 'printf partial; echo "fatal: bad object" >&2; exit 128'\nfatal: bad object`,
    )
    expect(e.result.stdout).toBe('partial')
    expect(e.detail).toBe('fatal: bad object\npartial')
  })

  test('runCheckedAsync returns the Buffer, and rejects with CommandFailed', async () => {
    const sh = spawnRunnerBytesAsync('sh')
    const r = await runCheckedAsync(sh, ['-c', PRINT_RAW], { cwd: CWD })
    expect(r.stdout.equals(RAW)).toBe(true)
    await expect(
      runCheckedAsync(sh, ['-c', 'echo nope >&2; exit 2'], { cwd: CWD }),
    ).rejects.toThrow(
      new CommandFailed(
        ['-c', 'echo nope >&2; exit 2'],
        { exitCode: 2, stdout: '', stderr: 'nope\n' },
        'sh',
      ),
    )
  })

  test('failureText decodes a bytes stdout when it is the only text', () => {
    const r: CommandResult<Buffer> = {
      exitCode: 1,
      stdout: Buffer.from(' hook said no \n'),
      stderr: '',
    }
    expect(failureText(r)).toBe('hook said no')
    expect(failureText(r, { both: true })).toBe('hook said no')
  })

  test('asAsync wraps a bytes runner as an async bytes runner', async () => {
    const sync: BytesCommandRunner = {
      binary: 'git',
      run: () => ({ exitCode: 0, stdout: RAW, stderr: '' }),
    }
    const wrapped = asAsync(sync)
    expect(wrapped.binary).toBe('git')
    expect((await wrapped.run(['cat-file'], { cwd: CWD })).stdout).toBe(RAW)
  })

  test('types: a bytes runner is not a text runner, and the result says Buffer', () => {
    const bytes = spawnRunnerBytes('git')
    // @ts-expect-error stdout is a Buffer, so a bytes runner is not a CommandRunner
    const text: CommandRunner = bytes
    // @ts-expect-error nor the other way round
    const back: BytesCommandRunner = spawnRunner('git')
    // @ts-expect-error runChecked on a bytes runner returns a Buffer, not a string
    const s: string = runChecked(fakeRunner({ x: {} }).bytesRunner, ['x'], { cwd: CWD }).stdout
    expect([text, back, s]).toBeDefined()
  })
})

describe('fakeRunner bytes forms', () => {
  test('a string answer is encoded; a Buffer answer is returned as it is', async () => {
    const fake = fakeRunner({
      'cat-file blob abc': { stdout: RAW },
      'show HEAD:README.md': { stdout: 'héllo\n' },
    })
    expect(
      fake.bytesRunner.run(['cat-file', 'blob', 'abc'], { cwd: '/r' }).stdout.equals(RAW),
    ).toBe(true)
    expect(fake.bytesRunner.run(['show', 'HEAD:README.md'], { cwd: '/r' }).stdout).toEqual(
      Buffer.from('héllo\n'),
    )
    const viaAsync = await fake.asyncBytesRunner.run(['cat-file', 'blob', 'abc'], { cwd: '/r' })
    expect(viaAsync.stdout.equals(RAW)).toBe(true)
    // The text forms decode a Buffer answer.
    expect(fake.runner.run(['show', 'HEAD:README.md'], { cwd: '/r' }).stdout).toBe('héllo\n')
    expect(fake.runner.run(['cat-file', 'blob', 'abc'], { cwd: '/r' }).stdout).toBe(RAW.toString())
    expect(fake.calls.map((c) => c.argv.join(' '))).toEqual([
      'cat-file blob abc',
      'show HEAD:README.md',
      'cat-file blob abc',
      'show HEAD:README.md',
      'cat-file blob abc',
    ])
  })

  test('a call with no answer is a failed spawn with an empty Buffer', () => {
    const r = fakeRunner({}).bytesRunner.run(['nope'], { cwd: '/r' })
    expect(r).toMatchObject({
      exitCode: 1,
      neverExited: true,
      reason: 'spawn',
      error: 'fakeRunner: no answer for: nope',
    })
    expect(r.stdout).toEqual(Buffer.alloc(0))
  })
})
