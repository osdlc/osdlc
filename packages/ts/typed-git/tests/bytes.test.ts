/**
 * Byte-exact output: `rawBytes` and `rawBytesChecked` on both clients, the
 * `bytesRunner` option, and the two options that make byte-sensitive git
 * output reachable through a verb, `statusEntries({ ignored })` and
 * `diffText({ binary })`.
 *
 * A fake bytes runner pins the argv, options and gate. Real git proves the
 * bytes survive: a blob and a diff that are not UTF-8 come back unchanged,
 * where the text door replaces them with U+FFFD.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import { FailureError } from '@osdlc/result'
import type { GitFailure } from '../src/failure.ts'

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  AsyncGit,
  cliBackend,
  Git,
  partialBackend,
  UnsupportedRequest,
  type AsyncBytesCommandRunner,
  type AsyncCommandRunner,
  type BytesCommandRunner,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
  type GitRequest,
} from '../src/index.ts'
import { makeGitFixture, type GitFixture } from '../src/testing.ts'

const CWD = '/repo'

/** Bytes that are not valid UTF-8: a lone continuation byte and 0xff. */
const NOT_UTF8 = Buffer.from([0x68, 0x69, 0x80, 0xff, 0x0a])

/** A bytes runner (sync and async) that records each call and replays `result`. */
function bytesRecorder(result: CommandResult<Buffer>) {
  const calls: Array<{ argv: string[]; opts: CommandRunOptions }> = []
  const sync: BytesCommandRunner = {
    run(argv, opts) {
      calls.push({ argv: [...argv], opts })
      return result
    },
  }
  const async: AsyncBytesCommandRunner = {
    run(argv, opts) {
      calls.push({ argv: [...argv], opts })
      return Promise.resolve(result)
    },
  }
  return { calls, sync, async }
}

/** A text runner that fails the test if anything reaches it. */
function untouched() {
  const calls: string[][] = []
  const sync: CommandRunner = {
    run(argv) {
      calls.push(argv)
      return { exitCode: 0, stdout: '', stderr: '' }
    },
  }
  const async: AsyncCommandRunner = {
    run(argv) {
      calls.push(argv)
      return Promise.resolve({ exitCode: 0, stdout: '', stderr: '' })
    },
  }
  return { calls, sync, async }
}

const BYTES_OK: CommandResult<Buffer> = { exitCode: 0, stdout: NOT_UTF8, stderr: '' }

function failureOf(error: unknown): GitFailure {
  expect(error).toBeInstanceOf(FailureError)
  return (error as FailureError<GitFailure>).failure
}

// ── fake runners ────────────────────────────────────────────────────────────

describe('rawBytes — fake bytes runner', () => {
  test('Git returns the runner stdout untouched, with the repository prefix, env and input', () => {
    const bytes = bytesRecorder(BYTES_OK)
    const text = untouched()
    const git = new Git(CWD, {
      runner: text.sync,
      bytesRunner: bytes.sync,
      gitDir: '/store/.git',
      env: { A: 'client' },
    })
    const r = git.rawBytes(['cat-file', 'blob', 'HEAD:x'], {
      env: { B: 'call' },
      input: 'in',
      timeoutMs: 5_000,
      maxOutputBytes: 64,
    })
    expect(r.stdout).toBe(NOT_UTF8)
    expect(bytes.calls).toEqual([
      {
        argv: ['--git-dir=/store/.git', 'cat-file', 'blob', 'HEAD:x'],
        opts: {
          cwd: CWD,
          env: { A: 'client', B: 'call' },
          input: 'in',
          timeoutMs: 5_000,
          maxOutputBytes: 64,
        },
      },
    ])
    expect(text.calls).toEqual([])
  })

  test('AsyncGit sends the same argv and options through cliBackend', async () => {
    const s = bytesRecorder(BYTES_OK)
    const a = bytesRecorder(BYTES_OK)
    const opts = { env: { B: 'call' }, input: 'in', timeoutMs: 5_000 }
    new Git(CWD, { runner: untouched().sync, bytesRunner: s.sync, gitDir: '/g' }).rawBytes(
      ['show', 'HEAD'],
      opts,
    )
    const r = await new AsyncGit(CWD, {
      backend: cliBackend({ runner: untouched().async, bytesRunner: a.async, gitDir: '/g' }),
    }).rawBytes(['show', 'HEAD'], opts)
    expect(r.stdout).toBe(NOT_UTF8)
    expect(a.calls).toEqual(s.calls)
  })

  test('unchecked rawBytes returns a failed run; rawBytesChecked throws the classified failure', async () => {
    const failed: CommandResult<Buffer> = {
      exitCode: 128,
      stdout: NOT_UTF8,
      stderr: 'fatal: not a git repository (or any of the parent directories): .git\n',
    }
    const s = bytesRecorder(failed)
    const git = new Git(CWD, { runner: untouched().sync, bytesRunner: s.sync })
    expect(git.rawBytes(['status', '-z']).exitCode).toBe(128)
    let thrown: unknown
    try {
      git.rawBytesChecked(['status', '-z'])
    } catch (e) {
      thrown = e
    }
    const failure = failureOf(thrown)
    expect(failure.kind).toBe('not-a-repo')
    expect(failure.argv).toEqual(['status', '-z'])
    // The cause holds the run with stdout decoded, so it reads like any other.
    expect(typeof failure.cause?.result.stdout).toBe('string')

    const a = bytesRecorder(failed)
    const asyncGit = new AsyncGit(CWD, {
      backend: cliBackend({ runner: untouched().async, bytesRunner: a.async }),
    })
    expect((await asyncGit.rawBytes(['status', '-z'])).exitCode).toBe(128)
    const rejected = await asyncGit.rawBytesChecked(['status', '-z']).catch((e: unknown) => e)
    expect(failureOf(rejected).kind).toBe('not-a-repo')
  })

  test('rawBytesChecked fails a run that never exited or was cut short, even at exit 0', async () => {
    const cases: CommandResult<Buffer>[] = [
      {
        exitCode: 1,
        neverExited: true,
        reason: 'output',
        stdout: Buffer.alloc(0),
        stderr: '',
        error: 'stdout passed maxOutputBytes',
      },
      { exitCode: 0, outputIncomplete: true, stdout: NOT_UTF8, stderr: '' },
    ]
    for (const result of cases) {
      const git = new Git(CWD, {
        runner: untouched().sync,
        bytesRunner: bytesRecorder(result).sync,
      })
      expect(() => git.rawBytesChecked(['cat-file', 'blob', 'x'])).toThrow(FailureError)
      const asyncGit = new AsyncGit(CWD, {
        backend: cliBackend({
          runner: untouched().async,
          bytesRunner: bytesRecorder(result).async,
        }),
      })
      await expect(asyncGit.rawBytesChecked(['cat-file', 'blob', 'x'])).rejects.toBeInstanceOf(
        FailureError,
      )
    }
  })

  test('rawBytesChecked returns the result on success', async () => {
    const git = new Git(CWD, {
      runner: untouched().sync,
      bytesRunner: bytesRecorder(BYTES_OK).sync,
    })
    expect(git.rawBytesChecked(['cat-file', 'blob', 'x']).stdout).toBe(NOT_UTF8)
    const asyncGit = new AsyncGit(CWD, {
      backend: cliBackend({
        runner: untouched().async,
        bytesRunner: bytesRecorder(BYTES_OK).async,
      }),
    })
    expect((await asyncGit.rawBytesChecked(['cat-file', 'blob', 'x'])).stdout).toBe(NOT_UTF8)
  })

  test('at() keeps the bytes runner', () => {
    const bytes = bytesRecorder(BYTES_OK)
    new Git(CWD, { runner: untouched().sync, bytesRunner: bytes.sync })
      .at('/elsewhere')
      .rawBytes(['show'])
    expect(bytes.calls[0]!.opts.cwd).toBe('/elsewhere')
  })
})

describe('rawBytes — a client with a runner and no bytesRunner', () => {
  test('Git throws UnsupportedRequest, before any runner runs, also after at()', () => {
    const text = untouched()
    const git = new Git(CWD, { runner: text.sync })
    for (const client of [git, git.at('/elsewhere')]) {
      expect(() => client.rawBytes(['show'])).toThrow(UnsupportedRequest)
      expect(() => client.rawBytesChecked(['show'])).toThrow(UnsupportedRequest)
    }
    expect(text.calls).toEqual([])
    // Not a git failure, so `try` lets it through.
    expect(() => (git.try as unknown as Git).rawBytesChecked(['show'])).toThrow(UnsupportedRequest)
  })

  test('cliBackend rejects with UnsupportedRequest, before any runner runs', async () => {
    const text = untouched()
    const git = new AsyncGit(CWD, { backend: cliBackend({ runner: text.async }) })
    const err = await git.rawBytes(['show']).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(UnsupportedRequest)
    expect((err as UnsupportedRequest).kind).toBe('rawBytes')
    await expect(git.rawBytesChecked(['show'])).rejects.toBeInstanceOf(UnsupportedRequest)
    expect(text.calls).toEqual([])
  })

  test('a non-CLI backend rejects rawBytes, as it does raw', async () => {
    const git = new AsyncGit(CWD, { backend: partialBackend('in-memory', {}) })
    await expect(git.rawBytes(['show'])).rejects.toBeInstanceOf(UnsupportedRequest)
    await expect(git.rawBytesChecked(['show'])).rejects.toBeInstanceOf(UnsupportedRequest)
  })

  test('a backend that implements rawBytes gets the request as data', async () => {
    const seen: GitRequest[] = []
    const backend = partialBackend('recorded', {
      rawBytes: (_cwd, request) => {
        seen.push(request)
        return Promise.resolve(BYTES_OK)
      },
    })
    const r = await new AsyncGit(CWD, { backend }).rawBytesChecked(['show'], { input: 'x' })
    expect(r.stdout).toBe(NOT_UTF8)
    expect(seen).toEqual([{ kind: 'rawBytes', argv: ['show'], checked: true, input: 'x' }])
  })
})

describe('statusEntries({ ignored }) and diffText({ binary }) — argv', () => {
  function textRecorder(stdout = '') {
    const calls: string[][] = []
    const reply: CommandResult = { exitCode: 0, stdout, stderr: '' }
    const sync: CommandRunner = { run: (argv) => (calls.push(argv), reply) }
    const async: AsyncCommandRunner = {
      run: (argv) => (calls.push(argv), Promise.resolve(reply)),
    }
    return { calls, sync, async }
  }

  test('both clients add --ignored and --binary in the same place', async () => {
    const s = textRecorder()
    const a = textRecorder()
    const sync = new Git(CWD, { runner: s.sync })
    const asyncGit = new AsyncGit(CWD, { backend: cliBackend({ runner: a.async }) })

    sync.statusEntries({ ignored: true })
    sync.statusEntries({ ignored: false })
    sync.diffText('HEAD', { staged: true, binary: true, paths: ['img.png'] })
    sync.diffText(undefined, { binary: false })
    await asyncGit.statusEntries({ ignored: true })
    await asyncGit.statusEntries({ ignored: false })
    await asyncGit.diffText('HEAD', { staged: true, binary: true, paths: ['img.png'] })
    await asyncGit.diffText(undefined, { binary: false })

    expect(s.calls).toEqual([
      ['status', '--porcelain', '-z', '--untracked-files=all', '--ignored'],
      ['status', '--porcelain', '-z', '--untracked-files=all'],
      ['diff', '--cached', '--binary', 'HEAD', '--', 'img.png'],
      ['diff'],
    ])
    expect(a.calls).toEqual(s.calls)
  })

  test('statusEntries reads ignored records as ! entries', () => {
    const { sync } = textRecorder(' M a.ts\0?? new.ts\0!! build/out.o\0!! debug.log\0')
    expect(new Git(CWD, { runner: sync }).statusEntries({ ignored: true })).toEqual([
      { x: ' ', y: 'M', path: 'a.ts' },
      { x: '?', y: '?', path: 'new.ts' },
      { x: '!', y: '!', path: 'build/out.o' },
      { x: '!', y: '!', path: 'debug.log' },
    ])
  })

  test('the request carries ignored and binary, and no call options', async () => {
    const seen: GitRequest[] = []
    const backend = partialBackend('recorded', {
      statusEntries: (_cwd, request) => (seen.push(request), Promise.resolve([])),
      diffText: (_cwd, request) => (seen.push(request), Promise.resolve('')),
    })
    const git = new AsyncGit(CWD, { backend })
    await git.statusEntries({ ignored: true, timeoutMs: 1_000 })
    await git.diffText('HEAD', { binary: true, timeoutMs: 1_000 })
    expect(seen).toEqual([
      { kind: 'statusEntries', ignored: true },
      { kind: 'diffText', rev: 'HEAD', staged: undefined, binary: true, paths: undefined },
    ])
  })
})

// ── real git ────────────────────────────────────────────────────────────────

describe('byte-exact output against real git', () => {
  let fx: GitFixture

  beforeEach(() => {
    fx = makeGitFixture()
  })

  afterEach(() => {
    fx.cleanup()
  })

  test('rawBytes returns a blob that is not UTF-8 unchanged; raw does not', async () => {
    writeFileSync(join(fx.dir, 'blob.bin'), NOT_UTF8)
    fx.commit('add a blob')
    const argv = ['cat-file', 'blob', 'HEAD:blob.bin']

    expect(fx.git.rawBytesChecked(argv).stdout.equals(NOT_UTF8)).toBe(true)
    expect(fx.git.rawBytes(argv).stdout.equals(NOT_UTF8)).toBe(true)
    // The text door decodes, and the two invalid bytes become U+FFFD.
    expect(fx.git.rawChecked(argv).stdout).toContain('�')

    const asyncGit = new AsyncGit(fx.dir)
    expect((await asyncGit.rawBytesChecked(argv)).stdout.equals(NOT_UTF8)).toBe(true)
    expect((await asyncGit.rawBytes(argv)).stdout.equals(NOT_UTF8)).toBe(true)
  })

  test('rawBytesChecked throws the classified failure for a missing object', async () => {
    fx.commit('first', { 'a.md': 'one\n' })
    const argv = ['cat-file', 'blob', 'HEAD:missing']
    expect(fx.git.rawBytes(argv).exitCode).not.toBe(0)
    expect(() => fx.git.rawBytesChecked(argv)).toThrow(FailureError)
    await expect(new AsyncGit(fx.dir).rawBytesChecked(argv)).rejects.toBeInstanceOf(FailureError)
  })

  test('rawBytes takes text input, as raw does', () => {
    const sha = fx.git.rawBytesChecked(['hash-object', '--stdin'], { input: 'hello\n' })
    expect(sha.stdout.toString()).toBe('ce013625030ba8dba906f756967f9e9ca394464a\n')
  })

  test('maxOutputBytes fails rawBytesChecked on both clients', async () => {
    writeFileSync(join(fx.dir, 'big.bin'), Buffer.alloc(4096, 0xff))
    fx.commit('add a big blob')
    const argv = ['cat-file', 'blob', 'HEAD:big.bin']
    expect(() => fx.git.rawBytesChecked(argv, { maxOutputBytes: 32 })).toThrow(FailureError)
    await expect(
      new AsyncGit(fx.dir).rawBytesChecked(argv, { maxOutputBytes: 32 }),
    ).rejects.toBeInstanceOf(FailureError)
  })

  test('statusEntries({ ignored }) lists each ignored file, inside an ignored directory too', async () => {
    fx.commit('ignore rules', { '.gitignore': 'build/\n*.log\n' })
    mkdirSync(join(fx.dir, 'build', 'sub'), { recursive: true })
    writeFileSync(join(fx.dir, 'build', 'a.o'), 'a')
    writeFileSync(join(fx.dir, 'build', 'sub', 'b.o'), 'b')
    writeFileSync(join(fx.dir, 'debug.log'), 'log')
    writeFileSync(join(fx.dir, 'new.ts'), 'new')

    expect(fx.git.statusEntries()).toEqual([{ x: '?', y: '?', path: 'new.ts' }])
    const ignored = fx.git.statusEntries({ ignored: true })
    expect(ignored.filter((e) => e.x === '?')).toEqual([{ x: '?', y: '?', path: 'new.ts' }])
    expect(
      ignored
        .filter((e) => e.x === '!')
        .map((e) => [e.y, e.path])
        .sort(),
    ).toEqual([
      ['!', 'build/a.o'],
      ['!', 'build/sub/b.o'],
      ['!', 'debug.log'],
    ])
    expect(await new AsyncGit(fx.dir).statusEntries({ ignored: true })).toEqual(ignored)
  })

  test('diffText({ binary }) gives a patch that git apply replays', async () => {
    const before = Buffer.from([0, 1, 2, 3, 0xff, 0xfe, 0, 9])
    const after = Buffer.from([0, 1, 2, 3, 0xfe, 0xff, 0, 8, 7])
    writeFileSync(join(fx.dir, 'img.bin'), before)
    fx.commit('add a binary file')
    writeFileSync(join(fx.dir, 'img.bin'), after)

    expect(fx.git.diffText()).toContain('Binary files')
    const patch = fx.git.diffText(undefined, { binary: true })
    expect(patch).toContain('GIT binary patch')
    expect(await new AsyncGit(fx.dir).diffText(undefined, { binary: true })).toBe(patch)

    fx.git.rawChecked(['checkout', '--', 'img.bin'])
    expect(readFileSync(join(fx.dir, 'img.bin')).equals(before)).toBe(true)
    fx.git.rawChecked(['apply'], { input: patch })
    expect(readFileSync(join(fx.dir, 'img.bin')).equals(after)).toBe(true)
  })

  test('a diff of a text file that is not UTF-8 is exact only through rawBytes', () => {
    writeFileSync(join(fx.dir, 'latin1.txt'), 'caf\xe9\n', 'latin1')
    fx.commit('add a latin-1 file')
    writeFileSync(join(fx.dir, 'latin1.txt'), 'caf\xe9!\n', 'latin1')

    const argv = ['diff', '--binary']
    expect(fx.git.diffText(undefined, { binary: true })).toContain('caf�!')
    const exact = fx.git.rawBytesChecked(argv).stdout
    expect(exact.includes(Buffer.from('+caf\xe9!\n', 'latin1'))).toBe(true)
  })
})
