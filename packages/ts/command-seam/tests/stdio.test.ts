/**
 * The `stdio` option of the managed and streaming runners, and `quiet` on the
 * streaming runner. Children report back through files, not pipes: under
 * `bun test` the pipes a parent hands a child can come back empty (see
 * `sync.ts`).
 *
 * POSIX-only (`sh`, `test -ef`, `/dev/null`).
 */

import { spawnSync } from 'node:child_process'
import {
  closeSync,
  existsSync,
  fstatSync,
  mkdtempSync,
  openSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, spyOn, test } from 'bun:test'

import { managedProcessRunner, streamRunner, type StdioOption } from '../index.ts'
import { alive, reap } from './support/procs.ts'

const CWD = process.cwd()
const INDEX = join(import.meta.dir, '../index.ts')
const NODE = Bun.which('node')

const scratch = mkdtempSync(join(tmpdir(), 'seam-stdio-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))
let n = 0
/** A fresh path in the scratch dir. */
const path = (name: string) => join(scratch, `${++n}-${name}`)

/** Lines written alternately to stdout and stderr, one `write` each (`echo` is a builtin). */
const ALTERNATE = 'i=0; while [ $i -lt 200 ]; do echo "out $i"; echo "err $i" >&2; i=$((i+1)); done'
const ALTERNATED = Array.from({ length: 200 }, (_, i) => `out ${i}\nerr ${i}\n`).join('')

/** A script that writes where its stdin, stdout and stderr point to `$1`. */
const WHERE =
  'exec 3>"$1"; for s in stdin stdout stderr; do if test /dev/$s -ef /dev/null; then echo "$s null" >&3; else echo "$s other" >&3; fi; done'

/** An fd number that is not open in this process. */
function closedFd(): number {
  for (let fd = 900; ; fd++) {
    try {
      fstatSync(fd)
    } catch {
      return fd
    }
  }
}

/** Run `fn` with `process.stderr.write` captured; returns what was written. */
function stderrOf(fn: () => void): string[] {
  const written: string[] = []
  const spy = spyOn(process.stderr, 'write').mockImplementation((chunk) => {
    written.push(String(chunk))
    return true
  })
  try {
    fn()
  } finally {
    spy.mockRestore()
  }
  return written
}

describe('managedProcessRunner stdio', () => {
  test('stdout and stderr on one fd keep the order the child wrote them in', async () => {
    const log = path('log')
    const fd = openSync(log, 'w')
    const handle = managedProcessRunner('sh').run(['-c', ALTERNATE], {
      cwd: CWD,
      stdio: { stdout: fd, stderr: fd },
    })
    // The child has its own copy, so the caller's can go at once.
    closeSync(fd)
    expect(await handle.exited).toEqual({ exitCode: 0, signal: null })
    expect(readFileSync(log, 'utf-8')).toBe(ALTERNATED)
  })

  test('stdout and stderr can go to different fds; stdin is /dev/null', async () => {
    const [outFile, errFile, where] = [path('out'), path('err'), path('where')]
    const out = openSync(outFile, 'w')
    const err = openSync(errFile, 'w')
    try {
      const handle = managedProcessRunner('sh').run(
        ['-c', `echo to-out; echo to-err >&2; ${WHERE}`, 'sh', where],
        { cwd: CWD, stdio: { stdout: out, stderr: err } },
      )
      expect((await handle.exited).exitCode).toBe(0)
    } finally {
      closeSync(out)
      closeSync(err)
    }
    expect(readFileSync(outFile, 'utf-8')).toBe('to-out\n')
    expect(readFileSync(errFile, 'utf-8')).toBe('to-err\n')
    expect(readFileSync(where, 'utf-8')).toBe('stdin null\nstdout other\nstderr other\n')
  })

  test("'ignore' points stdin, stdout and stderr at /dev/null", async () => {
    const where = path('where')
    const handle = managedProcessRunner('sh').run(['-c', WHERE, 'sh', where], {
      cwd: CWD,
      stdio: 'ignore',
    })
    expect((await handle.exited).exitCode).toBe(0)
    expect(readFileSync(where, 'utf-8')).toBe('stdin null\nstdout null\nstderr null\n')
  })

  test('an fd that is not open is a failed spawn, not a throw', async () => {
    const fd = closedFd()
    const handle = managedProcessRunner('sh').run(['-c', 'true'], {
      cwd: CWD,
      stdio: { stdout: fd, stderr: fd },
    })
    expect(handle.pid).toBe(-1)
    const exit = await handle.exited
    expect(exit).toMatchObject({ exitCode: 1, signal: null, neverExited: true, reason: 'spawn' })
    expect(exit.error).toContain('EBADF')
  })

  test('an invalid stdio throws before spawning', () => {
    const run = (stdio: unknown) => () =>
      managedProcessRunner('sh').run(['-c', 'true'], { cwd: CWD, stdio: stdio as StdioOption })
    expect(run('pipe')).toThrow(TypeError)
    expect(run({ stdout: '1', stderr: 2 })).toThrow(TypeError)
    expect(run({ stdout: -1, stderr: 2 })).toThrow(RangeError)
    expect(run({ stdout: 1, stderr: 1.5 })).toThrow(RangeError)
  })
})

/**
 * Run a host script under `runtime` that launches a child with `opts` and
 * exits. The host's own stdout and stderr go to files; the child blocks until
 * the test creates its `go` file, then writes `alive`.
 */
function launchFromHost(runtime: string[], opts: string) {
  const dir = mkdtempSync(join(scratch, 'host-'))
  const go = join(dir, 'go')
  const marker = join(dir, 'alive')
  const pidFile = join(dir, 'pid')
  const host = join(dir, 'host.ts')
  const child = `echo noisy; echo noisy >&2; while [ ! -e "$1" ]; do sleep 0.05; done; echo alive > "$2"`
  writeFileSync(
    host,
    [
      `import { writeFileSync } from "node:fs";`,
      `import { managedProcessRunner } from ${JSON.stringify(INDEX)};`,
      `const h = managedProcessRunner("sh").run(${JSON.stringify(['-c', child, 'sh', go, marker])}, ${opts});`,
      `writeFileSync(${JSON.stringify(pidFile)}, String(h.pid));`,
    ].join('\n'),
  )
  const outFile = join(dir, 'host.out')
  const errFile = join(dir, 'host.err')
  const proc = spawnSync(
    '/bin/sh',
    [
      '-c',
      'o="$1"; e="$2"; shift 2; exec "$@" >"$o" 2>"$e"',
      'sh',
      outFile,
      errFile,
      ...runtime,
      host,
    ],
    { cwd: CWD, timeout: 15_000 },
  )
  return {
    status: proc.status,
    pid: Number(readFileSync(pidFile, 'utf-8')),
    /** What reached the host's stdout and stderr files, the child's writes included. */
    hostOutput: () => readFileSync(outFile, 'utf-8') + readFileSync(errFile, 'utf-8'),
    release: () => writeFileSync(go, ''),
    marker,
  }
}

const FIRE_AND_FORGET = `{ cwd: process.cwd(), processGroup: true, unref: true, stdio: "ignore" }`

describe("a fire-and-forget launch: stdio 'ignore', unref and processGroup", () => {
  const runtimes: [string, string[] | undefined][] = [
    ['Bun', [process.execPath, 'run']],
    ['Node', NODE === null ? undefined : [NODE, '--no-warnings']],
  ]
  for (const [name, runtime] of runtimes) {
    test.skipIf(runtime === undefined)(
      `${name}: the host exits at once, the child outlives it and never writes to the host's output`,
      async () => {
        const launch = launchFromHost(runtime!, FIRE_AND_FORGET)
        try {
          // The host exited while the child was still blocked on `go`.
          expect(launch.status).toBe(0)
          expect(launch.pid).toBeGreaterThan(0)
          expect(alive(launch.pid)).toBe(true)
          launch.release()
          const end = performance.now() + 5_000
          while (!existsSync(launch.marker) && performance.now() < end) {
            await new Promise((r) => setTimeout(r, 25))
          }
          expect(existsSync(launch.marker)).toBe(true)
          // Read once the child is past its writes: its "noisy" lines went to
          // /dev/null, not the host's stdout or stderr.
          expect(launch.hostOutput()).toBe('')
        } finally {
          reap(launch.pid)
        }
      },
      20_000,
    )
  }
})

describe('streamRunner stdio', () => {
  test('stdout and stderr on one fd keep the order the child wrote them in', () => {
    const log = path('log')
    const fd = openSync(log, 'w')
    try {
      const r = streamRunner('sh').run(['-c', ALTERNATE], {
        cwd: CWD,
        stdio: { stdout: fd, stderr: fd },
      })
      expect(r).toEqual({ exitCode: 0 })
    } finally {
      closeSync(fd)
    }
    expect(readFileSync(log, 'utf-8')).toBe(ALTERNATED)
  })

  test("'ignore' points stdin, stdout and stderr at /dev/null", () => {
    const where = path('where')
    expect(
      streamRunner('sh').run(['-c', WHERE, 'sh', where], { cwd: CWD, stdio: 'ignore' }),
    ).toEqual({
      exitCode: 0,
    })
    expect(readFileSync(where, 'utf-8')).toBe('stdin null\nstdout null\nstderr null\n')
  })

  test('an fd that is not open is a failed spawn', () => {
    const fd = closedFd()
    const r = streamRunner('sh').run(['-c', 'true'], {
      cwd: CWD,
      stdio: { stdout: fd, stderr: fd },
      quiet: true,
    })
    expect(r).toMatchObject({ exitCode: 1, neverExited: true, reason: 'spawn' })
    expect(r.error).toContain('EBADF')
  })

  test('an invalid stdio throws before spawning', () => {
    const run = (stdio: unknown) => () =>
      streamRunner('sh').run(['-c', 'true'], { cwd: CWD, stdio: stdio as StdioOption })
    expect(run('pipe')).toThrow(TypeError)
    expect(run({ stdout: 1, stderr: -2 })).toThrow(RangeError)
  })
})

describe('streamRunner quiet', () => {
  test('a failed spawn, a bad cwd, a signal and a timeout print nothing, and still say why', () => {
    const results: unknown[] = []
    const written = stderrOf(() => {
      const opts = { cwd: CWD, quiet: true }
      results.push(streamRunner('definitely-not-a-real-binary-quiet').run([], opts))
      results.push(streamRunner('sh').run(['-c', 'true'], { ...opts, cwd: path('missing') }))
      results.push(streamRunner('sh').run(['-c', 'kill -TERM $$'], opts))
      results.push(streamRunner('sh').run(['-c', 'sleep 5'], { ...opts, timeoutMs: 100 }))
    })
    expect(written).toEqual([])
    expect(results).toMatchObject([
      { neverExited: true, reason: 'spawn', error: expect.stringContaining('definitely-not') },
      { neverExited: true, reason: 'spawn', error: expect.stringContaining('does not exist') },
      { neverExited: true, reason: 'signal', signal: 'SIGTERM' },
      {
        neverExited: true,
        reason: 'timeout',
        signal: 'SIGKILL',
        error: expect.stringContaining('ETIMEDOUT'),
      },
    ])
  })

  test('without quiet, the same failures print one line each', () => {
    const written = stderrOf(() => {
      streamRunner('definitely-not-a-real-binary-quiet').run([], { cwd: CWD })
      streamRunner('sh').run(['-c', 'kill -TERM $$'], { cwd: CWD, quiet: false })
    })
    expect(written).toHaveLength(2)
    expect(written[0]).toContain('definitely-not-a-real-binary-quiet')
    expect(written[1]).toBe('sh was killed by SIGTERM\n')
  })
})
