/**
 * `classifyFailure` and `CommandFailed.failure`: every kind, from real spawns
 * on the sync, async, stream and managed runners, and from fake results.
 */

import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { FailureError, isFailure } from '@osdlc/result'
import { afterAll, beforeAll, describe, expect, expectTypeOf, test } from 'vitest'

import {
  classifyFailure,
  CommandFailed,
  managedProcessRunner,
  runChecked,
  runCheckedAsync,
  runJson,
  spawnRunner,
  spawnRunnerAsync,
  streamRunner,
  type CommandFailure,
  type CommandFailureKind,
} from '../src/index.ts'

const CWD = process.cwd()
const MISSING = 'definitely-not-a-real-binary-cf'
let dir: string

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'cs-failure-'))
})
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const sh = (script: string) => ['-c', script]

describe('classifyFailure on real runs', () => {
  test('a missing binary is not-installed, on sync, async, stream and managed runners', async () => {
    const ctx = { binary: MISSING, argv: ['x'] }
    const sync = classifyFailure(spawnRunner(MISSING).run(['x'], { cwd: CWD }), ctx)
    const asyn = classifyFailure(await spawnRunnerAsync(MISSING).run(['x'], { cwd: CWD }), ctx)
    const stream = classifyFailure(streamRunner(MISSING).run(['x'], { cwd: CWD, quiet: true }), ctx)
    const managed = classifyFailure(
      await managedProcessRunner(MISSING).run(['x'], { cwd: CWD }).exited,
      ctx,
    )
    for (const f of [sync, asyn, stream, managed]) {
      expect(f).toMatchObject({
        kind: 'not-installed',
        message: `\`${MISSING}\` is not installed or not on PATH.`,
        binary: MISSING,
        argv: ['x'],
        exitCode: null,
      })
      expect(f?.hint).toBeUndefined()
      expect(f?.detail).toContain('ENOENT')
    }
  })

  test('a missing cwd is bad-cwd, not not-installed, on every runner', async () => {
    const cwd = join(dir, 'nope')
    const ctx = { binary: 'sh' }
    const sync = classifyFailure(spawnRunner('sh').run(sh('true'), { cwd }), ctx)
    const asyn = classifyFailure(await spawnRunnerAsync('sh').run(sh('true'), { cwd }), ctx)
    const stream = classifyFailure(streamRunner('sh').run(sh('true'), { cwd, quiet: true }), ctx)
    const managed = classifyFailure(
      await managedProcessRunner('sh').run(sh('true'), { cwd }).exited,
      ctx,
    )
    for (const f of [sync, asyn, stream, managed]) {
      expect(f?.kind).toBe('bad-cwd')
      expect(f?.message).toBe(
        `The working directory ${JSON.stringify(cwd)} is missing or is not a directory.`,
      )
    }
  })

  test('a cwd that is a file is bad-cwd too', () => {
    const file = join(dir, 'file.txt')
    writeFileSync(file, 'x')
    const f = classifyFailure(spawnRunner('sh').run(sh('true'), { cwd: file }), { binary: 'sh' })
    expect(f?.kind).toBe('bad-cwd')
  })

  test.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a file that is not executable is not-executable',
    async () => {
      const bin = join(dir, 'noexec')
      writeFileSync(bin, '#!/bin/sh\n')
      chmodSync(bin, 0o644)
      const ctx = { binary: bin }
      const sync = classifyFailure(spawnRunner(bin).run([], { cwd: CWD }), ctx)
      const asyn = classifyFailure(await spawnRunnerAsync(bin).run([], { cwd: CWD }), ctx)
      for (const f of [sync, asyn]) {
        expect(f?.kind).toBe('not-executable')
        expect(f?.message).toBe(`\`${bin}\` cannot be run: permission denied or not an executable.`)
      }
    },
  )

  test('a timeout is timeout, on sync and async runners', async () => {
    const ctx = { binary: 'sh' }
    const sync = classifyFailure(
      spawnRunner('sh').run(sh('sleep 5'), { cwd: CWD, timeoutMs: 100 }),
      ctx,
    )
    const asyn = classifyFailure(
      await spawnRunnerAsync('sh').run(sh('sleep 5'), { cwd: CWD, timeoutMs: 100 }),
      ctx,
    )
    for (const f of [sync, asyn]) {
      expect(f).toMatchObject({ kind: 'timeout', message: '`sh` timed out and was stopped.' })
    }
  })

  test('passing maxOutputBytes is output-cap', async () => {
    const script = sh('head -c 100000 /dev/zero | tr "\\0" x; sleep 5')
    const opts = { cwd: CWD, maxOutputBytes: 1000 }
    const sync = classifyFailure(spawnRunner('sh').run(script, opts), { binary: 'sh' })
    const asyn = classifyFailure(await spawnRunnerAsync('sh').run(script, opts), { binary: 'sh' })
    for (const f of [sync, asyn]) {
      expect(f?.kind).toBe('output-cap')
      expect(f?.message).toBe('`sh` wrote more output than allowed and was stopped.')
    }
  })

  // POSIX only: Windows has no signals; `sh` reports `kill -TERM $$` as an exit code.
  test.skipIf(process.platform === 'win32')(
    'a signal from elsewhere is signal, and names it',
    () => {
      const r = spawnRunner('sh').run(sh('kill -TERM $$'), { cwd: CWD })
      const f = classifyFailure(r, { binary: 'sh' })
      expect(f).toMatchObject({
        kind: 'signal',
        message: '`sh` was ended by SIGTERM.',
        exitCode: null,
      })
      expect(f?.signal).toBe('SIGTERM')
    },
  )

  test('kill() on a managed process is aborted', async () => {
    const handle = managedProcessRunner('sh').run(sh('sleep 5'), { cwd: CWD })
    handle.kill()
    const f = classifyFailure(await handle.exited, { binary: 'sh' })
    expect(f?.kind).toBe('aborted')
    expect(f?.message).toBe('`sh` was stopped before it finished.')
  })

  test('a non-zero exit is exit: message is the first line, detail is both streams', () => {
    const r = spawnRunner('sh').run(
      sh('echo out >&1; echo "first line" >&2; echo second >&2; exit 3'),
      { cwd: CWD },
    )
    const f = classifyFailure(r, { binary: 'sh', argv: ['x'] })
    expect(f).toMatchObject({
      kind: 'exit',
      message: 'first line',
      detail: 'first line\nsecond\nout',
      exitCode: 3,
      argv: ['x'],
    })
  })

  test('an exit with no output says the exit code', () => {
    const f = classifyFailure(spawnRunner('sh').run(sh('exit 7'), { cwd: CWD }))
    expect(f).toMatchObject({ kind: 'exit', message: 'exit 7' })
    expect(f?.detail).toBeUndefined()
  })

  test('success is null, and okExitCodes decides what success is', () => {
    const ok = spawnRunner('sh').run(sh('exit 0'), { cwd: CWD })
    expect(classifyFailure(ok)).toBeNull()
    const one = spawnRunner('sh').run(sh('exit 1'), { cwd: CWD })
    expect(classifyFailure(one, { okExitCodes: [1] })).toBeNull()
    expect(classifyFailure(ok, { okExitCodes: [1] })?.kind).toBe('exit')
  })

  test('a run that never exited is a failure even when its stand-in code is accepted', () => {
    const gone = spawnRunner(MISSING).run([], { cwd: CWD })
    expect(classifyFailure(gone, { okExitCodes: [1] })?.kind).toBe('not-installed')
  })
})

describe('classifyFailure on fake results', () => {
  test('the unknown binary reads "The command"', () => {
    expect(
      classifyFailure({ exitCode: 1, neverExited: true, reason: 'spawn', error: 'spawn x ENOENT' }),
    ).toMatchObject({
      kind: 'not-installed',
      message: 'The command is not installed or not on PATH.',
      binary: undefined,
      argv: [],
    })
  })

  test('other spawn errors are spawn; EPERM and ENOEXEC are not-executable', () => {
    const spawn = (error: string) => ({
      exitCode: 1,
      neverExited: true as const,
      reason: 'spawn' as const,
      error,
    })
    expect(classifyFailure(spawn('spawn sh EBADF'))?.kind).toBe('spawn')
    expect(classifyFailure(spawn('spawn sh EPERM'))?.kind).toBe('not-executable')
    expect(classifyFailure(spawn('spawn sh ENOEXEC'))?.kind).toBe('not-executable')
    expect(classifyFailure({ exitCode: 1, neverExited: true })?.kind).toBe('spawn')
  })

  test('a signal with no name still classifies', () => {
    expect(
      classifyFailure({ exitCode: 1, neverExited: true, reason: 'signal' }, { binary: 'x' })
        ?.message,
    ).toBe('`x` was ended by a signal.')
  })

  test('a bytes runner result is read as text', () => {
    const f = classifyFailure({ exitCode: 2, stdout: Buffer.from('from stdout'), stderr: '' })
    expect(f).toMatchObject({ kind: 'exit', message: 'from stdout', detail: 'from stdout' })
  })

  test('every kind is covered', () => {
    const all: CommandFailureKind[] = [
      'not-installed',
      'not-executable',
      'bad-cwd',
      'timeout',
      'output-cap',
      'signal',
      'aborted',
      'spawn',
      'exit',
    ]
    expectTypeOf<CommandFailure['kind']>().toEqualTypeOf<CommandFailureKind>()
    expect(new Set(all).size).toBe(9)
  })
})

describe('CommandFailed carries the failure', () => {
  test('runChecked throws a FailureError whose failure is classified', () => {
    try {
      runChecked(spawnRunner(MISSING), ['a'], { cwd: CWD })
      expect.unreachable()
    } catch (e) {
      expect(e).toBeInstanceOf(CommandFailed)
      expect(e).toBeInstanceOf(FailureError)
      const failed = e as CommandFailed
      expect(failed.failure.kind).toBe('not-installed')
      expect(isFailure(failed.failure)).toBe(true)
      expect(failed.binary).toBe(MISSING)
      // The long form for logs is unchanged.
      expect(failed.message).toMatch(
        /^command failed \(exit 1\): definitely-not-a-real-binary-cf a\n/,
      )
    }
  })

  test('runCheckedAsync does too, and an exit failure keeps exitCode and detail', async () => {
    await expect(
      runCheckedAsync(spawnRunnerAsync('sh'), sh('echo no >&2; exit 4'), { cwd: CWD }),
    ).rejects.toMatchObject({
      failure: { kind: 'exit', message: 'no', exitCode: 4, detail: 'no' },
    })
  })
})

describe('runJson reports the classified command failure', () => {
  test('a missing binary is not-installed, with the result alongside', () => {
    const r = runJson(spawnRunner(MISSING), ['a'], { cwd: CWD })
    expect(!r.ok && r.error.kind).toBe('not-installed')
    expect(!r.ok && 'argv' in r.error && r.error.argv).toEqual(['a'])
    expect(r.result.neverExited).toBe(true)
  })
})
