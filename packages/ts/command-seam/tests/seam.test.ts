/**
 * Both runners of the seam: `input` stdin passthrough and `timeoutMs` on
 * `spawnRunner` / `spawnRunnerAsync`, and the `runChecked` /
 * `runCheckedAsync` / `CommandFailed` checked runner. Real-spawn cases use
 * `sh`/`cat` (present on every supported platform); the checked-runner
 * semantics use a fake runner for determinism.
 */

import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, setDefaultTimeout, test } from 'bun:test'

import {
  asAsync,
  CommandFailed,
  failureText,
  resolveRunner,
  resolveRunnerAsync,
  runChecked,
  runCheckedAsync,
  spawnRunner,
  spawnRunnerAsync,
  type CommandResult,
  type CommandRunner,
} from '../index.ts'
import { gone, reap } from './support/procs.ts'

const CWD = process.cwd()

// Real spawns on a loaded machine can pass Bun's 5 s default.
setDefaultTimeout(15_000)

describe('spawnRunner', () => {
  test("input is written to the child's stdin", () => {
    const cat = spawnRunner('cat')
    const r = cat.run([], { cwd: CWD, input: 'over the seam\n' })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe('over the seam\n')
  })

  test('non-zero exit codes surface verbatim', () => {
    const sh = spawnRunner('sh')
    const r = sh.run(['-c', 'echo oops >&2; exit 3'], { cwd: CWD })
    expect(r.exitCode).toBe(3)
    expect(r.stderr).toContain('oops')
  })

  test('timeoutMs caps a hanging child with a non-zero exit', () => {
    const sh = spawnRunner('sh')
    const r = sh.run(['-c', 'sleep 5'], { cwd: CWD, timeoutMs: 250 })
    expect(r.exitCode).not.toBe(0)
  })

  test('timeoutMs is a hard cap even for a child that ignores SIGTERM', () => {
    // `timeout` alone kills with the default SIGTERM and then goes on waiting
    // for an exit that a child trapping it never gives: the cap degrades to
    // the child's full runtime, which is the one thing it exists to bound.
    // The bound is wall clock because a sync spawn blocks the runner — a test
    // timeout cannot preempt it — but 250ms against a 10s child leaves no
    // scheduling delay that could close the gap.
    const sh = spawnRunner('sh')
    const t0 = performance.now()
    const r = sh.run(['-c', "trap '' TERM; sleep 10"], { cwd: CWD, timeoutMs: 250 })
    expect(performance.now() - t0).toBeLessThan(5000)
    expect(r.neverExited).toBe(true)
  }, 30_000)

  test('a missing binary degrades to a non-zero exit, not a throw', () => {
    const nope = spawnRunner('definitely-not-a-real-binary-t1')
    const r = nope.run([], { cwd: CWD })
    expect(r.exitCode).not.toBe(0)
  })

  test('a child that never reported a status is flagged, not just exit 1', () => {
    // The `1` a killed or unspawnable child reports is the seam's stand-in,
    // not an answer, and it collides with the exit code plenty of binaries
    // use for a legitimate negative result. `neverExited` is the difference.
    const sh = spawnRunner('sh')
    const killed = sh.run(['-c', 'sleep 30'], { cwd: CWD, timeoutMs: 250 })
    expect(killed.exitCode).not.toBe(0)
    expect(killed.neverExited).toBe(true)

    const answered = sh.run(['-c', 'exit 1'], { cwd: CWD })
    expect(answered.exitCode).toBe(1)
    expect(answered.neverExited).toBeUndefined()
  }, 10_000)

  test('env entries merge over the parent environment', () => {
    const sh = spawnRunner('sh')
    const r = sh.run(['-c', 'echo "$T1_SEAM_PROBE:$HOME"'], {
      cwd: CWD,
      env: { T1_SEAM_PROBE: 'injected' },
    })
    expect(r.exitCode).toBe(0)
    expect(r.stdout.startsWith('injected:')).toBe(true)
    // The parent env still rides along (HOME survives the merge).
    expect(r.stdout.trim()).not.toBe('injected:')
  })

  test('an undefined env entry removes an inherited var', () => {
    process.env['T1_SEAM_UNSET_PROBE'] = 'inherited'
    try {
      const r = spawnRunner('sh').run(['-c', 'echo "${T1_SEAM_UNSET_PROBE-absent}"'], {
        cwd: CWD,
        env: { T1_SEAM_UNSET_PROBE: undefined },
      })
      expect(r.stdout.trim()).toBe('absent')
    } finally {
      delete process.env['T1_SEAM_UNSET_PROBE']
    }
  })

  test('no `env` override still sees a var set on process.env at runtime', () => {
    // Regression: passing `env: undefined` (rather than omitting the key)
    // makes Bun's spawnSync fall back to a startup snapshot that misses a
    // var set on `process.env` after the process started — a caller that
    // never passes `env` still expects LIVE inheritance (a test pointing an
    // env var at a temp dir right before spawning, say). PATH/HOME survived
    // that snapshot and masked the bug; a var minted here cannot have.
    process.env['T1_SEAM_RUNTIME_PROBE'] = 'set-after-start'
    try {
      const sh = spawnRunner('sh')
      const r = sh.run(['-c', 'echo "$T1_SEAM_RUNTIME_PROBE"'], { cwd: CWD })
      expect(r.stdout.trim()).toBe('set-after-start')
    } finally {
      delete process.env['T1_SEAM_RUNTIME_PROBE']
    }
  })
})

describe('runChecked', () => {
  const okResult: CommandResult = { exitCode: 0, stdout: 'fine\n', stderr: '' }
  const failResult: CommandResult = {
    exitCode: 128,
    stdout: '',
    stderr: 'fatal: broken\n',
  }
  const fake = (result: CommandResult): CommandRunner => ({
    run: () => result,
  })

  test('returns the result on exit 0', () => {
    const r = runChecked(fake(okResult), ['status'], { cwd: CWD })
    expect(r).toEqual(okResult)
  })

  test('throws CommandFailed carrying argv and the full result', () => {
    let thrown: unknown
    try {
      runChecked(fake(failResult), ['show', 'origin/main:x'], { cwd: CWD })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(CommandFailed)
    const err = thrown as CommandFailed
    expect(err.argv).toEqual(['show', 'origin/main:x'])
    expect(err.result.exitCode).toBe(128)
    expect(err.message).toContain('exit 128')
    expect(err.message).toContain('fatal: broken')
  })

  test('detail joins both streams, drops empty ones, and is empty for neither', () => {
    const at = (stdout: string, stderr: string) =>
      new CommandFailed(['x'], { exitCode: 1, stdout, stderr })
    expect(at('', '  fatal: broken\n').detail).toBe('fatal: broken')
    // A rejecting hook writes its reason to stdout, where `message` never looks.
    expect(at('hook rejected\n', '').detail).toBe('hook rejected')
    // Both halves survive: git says the commit failed, the hook says why.
    expect(at('hook rejected\n', 'error: cannot commit\n').detail).toBe(
      'error: cannot commit\nhook rejected',
    )
    expect(at('', '').detail).toBe('')
  })
})

describe('spawnRunnerAsync', () => {
  test('captures stdout/stderr and exit code without blocking', async () => {
    const sh = spawnRunnerAsync('sh')
    const r = await sh.run(['-c', 'echo out; echo err >&2; exit 3'], { cwd: CWD })
    expect(r.exitCode).toBe(3)
    expect(r.stdout).toBe('out\n')
    expect(r.stderr).toBe('err\n')
  })

  test("input is written to the child's stdin", async () => {
    const cat = spawnRunnerAsync('cat')
    const r = await cat.run([], { cwd: CWD, input: 'through the async runner\n' })
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe('through the async runner\n')
  })

  test('onSpawn reports the live child pid before the command finishes, and is skipped when the spawn fails', async () => {
    const sh = spawnRunnerAsync('sh')
    let seen: number | null = null
    const r = await sh.run(['-c', 'echo $$'], {
      cwd: CWD,
      onSpawn: (pid) => {
        seen = pid
      },
    })
    expect(seen).not.toBeNull()
    expect(r.stdout.trim()).toBe(String(seen))

    let called = false
    await spawnRunnerAsync('definitely-not-a-real-binary-t1').run([], {
      cwd: CWD,
      onSpawn: () => {
        called = true
      },
    })
    expect(called).toBe(false)
  })

  test('a missing binary degrades to a non-zero exit, not a rejection', async () => {
    const nope = spawnRunnerAsync('definitely-not-a-real-binary-t1')
    const r = await nope.run([], { cwd: CWD })
    expect(r.exitCode).not.toBe(0)
    expect(r.error).toContain('definitely-not-a-real-binary-t1')
    expect(r.stderr).toBe('')
  })

  test('no `env` override still sees a var set on process.env at runtime', async () => {
    // Async runner's twin of the sync-runner regression above.
    process.env['T1_SEAM_RUNTIME_PROBE_ASYNC'] = 'set-after-start'
    try {
      const sh = spawnRunnerAsync('sh')
      const r = await sh.run(['-c', 'echo "$T1_SEAM_RUNTIME_PROBE_ASYNC"'], { cwd: CWD })
      expect(r.stdout.trim()).toBe('set-after-start')
    } finally {
      delete process.env['T1_SEAM_RUNTIME_PROBE_ASYNC']
    }
  })

  test('timeoutMs caps a hanging child', async () => {
    // The cap is proven by construction, not by a wall-clock bound. The child
    // would run for 30s against a 250ms cap, so the only way this run resolves
    // inside the test's own 10s timeout is the cap firing and killing it — a
    // cap that was a no-op would let `sleep 30` outlive the test window and
    // fail the test as a timeout, never slipping through on the child's exit
    // code. A wall-clock bound would be flaky: under load a 250ms timer can
    // fire well past 2500ms.
    const sh = spawnRunnerAsync('sh')
    const r = await sh.run(['-c', 'sleep 30'], { cwd: CWD, timeoutMs: 250 })
    expect(r.exitCode).not.toBe(0)
  }, 10_000)

  test('timeoutMs caps a child that FORKED a surviving grandchild', async () => {
    // `&` forces the fork everywhere (some /bin/sh exec the last command,
    // others fork it): the grandchild outlives the SIGKILL still holding the
    // stdio write ends, so anything waiting on pipe EOF (the `close` event)
    // blocks for the child's full runtime. The cap must resolve off its own
    // deadline, not off `close`. Proven by construction like the test above —
    // `wait` blocks on the 30s grandchild, so resolving inside the test window
    // can only mean the cap fired without waiting on pipes a hung grandchild
    // controls.
    const sh = spawnRunnerAsync('sh')
    const r = await sh.run(['-c', 'sleep 30 & wait'], { cwd: CWD, timeoutMs: 250 })
    expect(r.exitCode).not.toBe(0)
  }, 10_000)

  test('a child that never reported a status is flagged, not just exit 1', async () => {
    const sh = spawnRunnerAsync('sh')
    const killed = await sh.run(['-c', 'sleep 30'], { cwd: CWD, timeoutMs: 250 })
    expect(killed.neverExited).toBe(true)

    const nope = spawnRunnerAsync('definitely-not-a-real-binary-t1')
    expect((await nope.run([], { cwd: CWD })).neverExited).toBe(true)

    const answered = await sh.run(['-c', 'exit 1'], { cwd: CWD })
    expect(answered.exitCode).toBe(1)
    expect(answered.neverExited).toBeUndefined()
  }, 10_000)

  test('an AbortSignal cancels mid-flight', async () => {
    const sh = spawnRunnerAsync('sh')
    const ac = new AbortController()
    const pending = sh.run(['-c', 'sleep 5'], { cwd: CWD, signal: ac.signal })
    setTimeout(() => ac.abort(), 100)
    const r = await pending
    expect(r.exitCode).not.toBe(0)
  })

  test('runs genuinely concurrently (two sleeps ≪ serial time)', async () => {
    const sh = spawnRunnerAsync('sh')
    const t0 = performance.now()
    await Promise.all([
      sh.run(['-c', 'sleep 0.4'], { cwd: CWD }),
      sh.run(['-c', 'sleep 0.4'], { cwd: CWD }),
      sh.run(['-c', 'sleep 0.4'], { cwd: CWD }),
    ])
    expect(performance.now() - t0).toBeLessThan(1000)
  })
})

describe('runCheckedAsync / asAsync', () => {
  test('runCheckedAsync throws CommandFailed carrying the result', async () => {
    const fail = spawnRunnerAsync('sh')
    let thrown: unknown
    try {
      await runCheckedAsync(fail, ['-c', 'echo boom >&2; exit 7'], { cwd: CWD })
    } catch (e) {
      thrown = e
    }
    expect(thrown).toBeInstanceOf(CommandFailed)
    expect((thrown as CommandFailed).result.exitCode).toBe(7)
    expect((thrown as CommandFailed).message).toContain('boom')
  })

  test('asAsync views a sync fake through the async seam', async () => {
    const sync: CommandRunner = {
      run: (argv) => ({ exitCode: 0, stdout: argv.join('|'), stderr: '' }),
    }
    const r = await asAsync(sync).run(['a', 'b'], { cwd: CWD })
    expect(r.stdout).toBe('a|b')
  })
})

// Under `bun test` these exercise `runViaChildRedirect`, not the pipe path
// (NODE_ENV=test flips CHILD_STDIO_CORRUPTED). That is the runner every test
// harness shells through, so its failure contract is the one worth pinning:
// a capture that fails must say so. Silent empty output at
// exit 1 is indistinguishable from a command that genuinely exited 1, which
// is how a resource-starved spawn reaches an assertion as an irreproducible
// flake.
describe('spawnRunner — capture contract', () => {
  test('captures stdout and a zero exit', () => {
    const res = spawnRunner('sh').run(['-c', 'printf hello'], { cwd: process.cwd() })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toBe('hello')
    expect(res.stderr).toBe('')
  })

  test('captures stderr and a non-zero exit separately from stdout', () => {
    const res = spawnRunner('sh').run(['-c', 'printf out; printf err >&2; exit 3'], {
      cwd: process.cwd(),
    })
    expect(res.exitCode).toBe(3)
    expect(res.stdout).toBe('out')
    expect(res.stderr).toBe('err')
  })

  test('a failed run never reports a non-zero exit with no explanation', () => {
    const res = spawnRunner('definitely-not-a-real-binary-xyzzy').run([], {
      cwd: process.cwd(),
    })
    expect(res.exitCode).not.toBe(0)
    expect(res.error).toContain('definitely-not-a-real-binary-xyzzy')
    expect(failureText(res)).toBe(res.error!)
  })

  test('argv is never re-parsed as shell', () => {
    const res = spawnRunner('sh').run(['-c', 'printf %s "$1"', 'sh', '$(echo pwned)'], {
      cwd: process.cwd(),
    })
    expect(res.exitCode).toBe(0)
    expect(res.stdout).toBe('$(echo pwned)')
  })
})

describe('spawnRunnerAsync — capture contract', () => {
  test('a multi-byte character straddling a chunk boundary survives', async () => {
    // The two bytes of `é` (C3 A9) arrive in separate `data` events — a pipe
    // splits at 64KB in practice, and the sleep forces the same split
    // deterministically. Decoding each chunk in isolation turns each half
    // into U+FFFD, so the captured string differs from what the child wrote.
    const sh = spawnRunnerAsync('sh')
    const r = await sh.run(
      ['-c', 'printf "a"; printf "\\303"; sleep 0.2; printf "\\251"; printf "b"'],
      { cwd: CWD },
    )
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe('aéb')
  })

  test('output ending mid-sequence surfaces as U+FFFD rather than vanishing', async () => {
    // The decoder holds a partial sequence back waiting for the rest of it.
    // When the stream ends there instead — truncated output, or bytes that
    // are not UTF-8 at all — those held bytes are only reported if the
    // decoder is flushed. Unflushed they are silently dropped, so the capture
    // is shorter than what the child wrote and disagrees with the sync runner,
    // which decodes whole buffers and yields U+FFFD.
    const sh = spawnRunnerAsync('sh')
    const r = await sh.run(
      ['-c', 'printf "a"; printf "\\303"; printf "b" >&2; printf "\\316" >&2'],
      { cwd: CWD },
    )
    expect(r.exitCode).toBe(0)
    expect(r.stdout).toBe('a�')
    expect(r.stderr).toBe('b�')
  })

  test('the timeout path detaches from the pipes a surviving grandchild holds', async () => {
    // The SIGKILL reaps only the direct child; the grandchild keeps the write
    // ends and keeps writing. Left attached, the parent goes on appending that
    // output to a string nobody will ever read — an unbounded heap leak in a
    // long-lived host (measured at ~26MB of extra heap over the two seconds
    // this test watches). Whether the read end was closed is directly
    // observable from the writer: the grandchild's loop breaks on the first
    // failed write, so it exits once the parent lets go and runs forever
    // while the parent keeps draining.
    const dir = mkdtempSync(join(tmpdir(), 'seam-pipe-detach-'))
    let pid = 0
    try {
      const pidFile = join(dir, 'pid')
      const sh = spawnRunnerAsync('sh')
      const r = await sh.run(
        [
          '-c',
          'while :; do echo xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx || break; done' +
            ' & echo $! > "$1"; wait',
          'sh',
          pidFile,
        ],
        { cwd: CWD, timeoutMs: 250 },
      )
      expect(r.exitCode).not.toBe(0)
      pid = Number(readFileSync(pidFile, 'utf-8').trim())
      expect(pid).toBeGreaterThan(0)
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
      rmSync(dir, { recursive: true, force: true })
    }
  }, 10_000)
})

describe('spawnRunnerAsync — processGroup', () => {
  // A foreground child that is not exec'd: `sh` waits on `sleep`, so killing
  // `sh` alone leaves `sleep` running. The inner `sh` prints its own pid and
  // then execs `sleep`, so the printed pid is the grandchild's.
  const GRANDCHILD = ['-c', `sh -c 'echo $$; exec sleep 30'; echo after`]

  test('a timeout kills the grandchild too', async () => {
    const sh = spawnRunnerAsync('sh')
    const r = await sh.run(GRANDCHILD, { cwd: CWD, timeoutMs: 500, processGroup: true })
    const pid = Number(r.stdout.trim())
    try {
      expect(r.neverExited).toBe(true)
      expect(pid).toBeGreaterThan(0)
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  }, 10_000)

  test('an abort kills the grandchild too', async () => {
    const sh = spawnRunnerAsync('sh')
    const ac = new AbortController()
    setTimeout(() => ac.abort(), 500)
    const r = await sh.run(GRANDCHILD, { cwd: CWD, signal: ac.signal, processGroup: true })
    const pid = Number(r.stdout.trim())
    try {
      expect(r.exitCode).not.toBe(0)
      expect(pid).toBeGreaterThan(0)
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  }, 10_000)

  test('without it, a timeout leaves the grandchild running', async () => {
    const sh = spawnRunnerAsync('sh')
    const r = await sh.run(GRANDCHILD, { cwd: CWD, timeoutMs: 500 })
    const pid = Number(r.stdout.trim())
    try {
      expect(pid).toBeGreaterThan(0)
      expect(() => process.kill(pid, 0)).not.toThrow()
    } finally {
      reap(pid)
    }
  }, 10_000)

  test('a normal exit is unchanged', async () => {
    const sh = spawnRunnerAsync('sh')
    const r = await sh.run(['-c', 'echo ok; exit 3'], { cwd: CWD, processGroup: true })
    expect(r).toEqual({ exitCode: 3, stdout: 'ok\n', stderr: '' })
  })

  test('a background member still holding the pipes is killed after the exit grace', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seam-group-'))
    const pidFile = join(dir, 'pid')
    let pid = 0
    try {
      const sh = spawnRunnerAsync('sh')
      const r = await sh.run(['-c', `sleep 30 & echo $! > "${pidFile}"; exit 0`], {
        cwd: CWD,
        timeoutMs: 5_000,
        processGroup: true,
      })
      pid = Number(readFileSync(pidFile, 'utf8').trim())
      expect(r.exitCode).toBe(0)
      expect(pid).toBeGreaterThan(0)
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
      rmSync(dir, { recursive: true, force: true })
    }
  }, 10_000)
})

describe('spawnRunnerAsync — abort', () => {
  test('sends SIGTERM first, so a child can clean up', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seam-abort-'))
    const marker = join(dir, 'cleaned')
    try {
      const ac = new AbortController()
      const pending = spawnRunnerAsync('sh').run(
        ['-c', `trap 'echo cleaned > "${marker}"; exit 0' TERM; while :; do sleep 0.05; done`],
        { cwd: CWD, signal: ac.signal },
      )
      setTimeout(() => ac.abort(), 200)
      const r = await pending
      expect(r.neverExited).toBe(true)
      expect(r.error).toBe('The operation was aborted')
      for (let i = 0; i < 40 && !existsSync(marker); i++) {
        await new Promise((res) => setTimeout(res, 25))
      }
      expect(readFileSync(marker, 'utf8')).toBe('cleaned\n')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 10_000)

  test('resolves at once and sends SIGKILL later to a child that ignores SIGTERM', async () => {
    const ac = new AbortController()
    let pid = 0
    const pending = spawnRunnerAsync('sh').run(['-c', "trap '' TERM; exec sleep 10"], {
      cwd: CWD,
      signal: ac.signal,
      onSpawn: (p) => {
        pid = p
      },
    })
    setTimeout(() => ac.abort(), 200)
    const t0 = performance.now()
    const r = await pending
    try {
      expect(performance.now() - t0).toBeLessThan(500)
      expect(r.neverExited).toBe(true)
      // Still alive inside the grace, gone after it.
      expect(await gone(pid, 500)).toBe(false)
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  }, 10_000)

  test('with processGroup, a member that ignores SIGTERM gets SIGKILL after the grace', async () => {
    const ac = new AbortController()
    const pending = spawnRunnerAsync('sh').run(
      ['-c', "(trap '' TERM; exec sleep 30) & echo $!; wait"],
      { cwd: CWD, signal: ac.signal, processGroup: true },
    )
    setTimeout(() => ac.abort(), 300)
    const r = await pending
    const pid = Number(r.stdout.trim())
    try {
      expect(r.neverExited).toBe(true)
      expect(pid).toBeGreaterThan(0)
      expect(await gone(pid, 500)).toBe(false)
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  }, 10_000)
})

describe('spawnRunnerAsync — stdin failure contract', () => {
  test('a child that closes stdin mid-write is a result, not a host crash', () => {
    // `child.stdin` is its own EventEmitter: an `error` on it is not routed
    // through the `child.on("error")` handler, and an unhandled `error` on an
    // emitter is rethrown as an uncaught exception — one that lands after
    // `run` has already resolved, so no `try`/`catch` around the await sees
    // it. Only a child process can observe that: an uncaught exception in
    // this process would abort the test runner rather than fail one test.
    //
    // The trigger is deterministic by construction. `exec 0<&-` closes the
    // child's read end while the child is still alive, so the parent's
    // 4MB write (far past the pipe buffer, so still pending) fails with
    // EPIPE, and the following `sleep` guarantees that failure lands before
    // the child exits. A child that merely exits (`sh -c "exit 0"`) races the
    // write instead: measured on Bun 1.3.14, a 10MB write against it raised
    // EPIPE in 1 run of 20, so a test built on that trigger goes green with
    // the bug fully present.
    const dir = mkdtempSync(join(tmpdir(), 'seam-stdin-epipe-'))
    try {
      const outFile = join(dir, 'result.json')
      const probe = join(dir, 'probe.ts')
      writeFileSync(
        probe,
        [
          `import { writeFileSync } from "node:fs";`,
          `import { spawnRunnerAsync } from ${JSON.stringify(join(import.meta.dir, '../index.ts'))};`,
          `const r = await spawnRunnerAsync("sh").run(["-c", "exec 0<&-; sleep 0.3"], {`,
          `  cwd: process.cwd(),`,
          `  input: "x".repeat(4 * 1024 * 1024),`,
          `});`,
          `writeFileSync(${JSON.stringify(outFile)}, JSON.stringify(r));`,
        ].join('\n'),
      )
      const proc = spawnSync(process.execPath, ['run', probe], { cwd: CWD })
      expect(proc.status).toBe(0)
      const res = JSON.parse(readFileSync(outFile, 'utf-8')) as CommandResult
      // The child's own exit code is still the result...
      expect(res.exitCode).toBe(0)
      // ...but the input it never read is not silently forgotten: the write
      // failure rides out in `error`.
      // EPIPE, or ENOTCONN under some timings: both are a write to a closed peer.
      expect(res.error).toMatch(/^(EPIPE|ENOTCONN): [^\n]*, write$/)
      expect(res.stderr).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20_000)
})

describe('spawnRunner — production pipe path', () => {
  test('a failed spawn explains itself instead of reporting a bare exit 1', () => {
    // `CHILD_STDIO_CORRUPTED` is read from NODE_ENV at import time and
    // `bun test` sets it, so the pipe path production actually runs is only
    // reachable from a child with NODE_ENV cleared. The probe writes its
    // answer to a file rather than stdout, since the pipe capture is exactly
    // what Bun mis-wires here.
    const dir = mkdtempSync(join(tmpdir(), 'seam-pipe-path-'))
    try {
      const outFile = join(dir, 'result.json')
      const probe = join(dir, 'probe.ts')
      writeFileSync(
        probe,
        [
          `import { writeFileSync } from "node:fs";`,
          `import { spawnRunner } from ${JSON.stringify(join(import.meta.dir, '../index.ts'))};`,
          `const r = spawnRunner("definitely-not-a-real-binary-xyzzy").run([], { cwd: process.cwd() });`,
          `writeFileSync(${JSON.stringify(outFile)}, JSON.stringify(r));`,
        ].join('\n'),
      )
      const env = { ...process.env }
      delete env['NODE_ENV']
      spawnSync(process.execPath, ['run', probe], { cwd: CWD, env })
      const res = JSON.parse(readFileSync(outFile, 'utf-8')) as CommandResult
      expect(res.exitCode).not.toBe(0)
      expect(res.error).toContain('definitely-not-a-real-binary-xyzzy')
      expect(res.stderr).toBe('')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }, 20_000)
})

describe('package exports', () => {
  test('"types" points at built declarations, not TypeScript source', () => {
    // An external consumer resolves types through this condition. Pointed at
    // `./index.ts`, every such build fails with TS5097 ("an import path can
    // only end in .ts when allowImportingTsExtensions is enabled") on the
    // package's own internal `./sync.ts` imports.
    const pkg = JSON.parse(readFileSync(join(import.meta.dir, '../package.json'), 'utf-8')) as {
      exports: Record<string, Record<string, string>>
    }
    expect(pkg.exports['.']?.['types']).toBe('./dist/index.d.ts')
  })
})

describe('resolveRunner', () => {
  const fake: CommandRunner = { run: () => ({ exitCode: 0, stdout: 'fake', stderr: '' }) }

  test('returns the injected runner untouched', () => {
    expect(resolveRunner('git', fake)).toBe(fake)
  })

  test('falls back to a real spawn-backed runner when none is injected', () => {
    expect(resolveRunner('sh', undefined).run(['-c', 'printf hi'], { cwd: CWD }).stdout).toBe('hi')
    expect(resolveRunner('sh').run(['-c', 'printf hi'], { cwd: CWD }).stdout).toBe('hi')
  })

  test('async twin returns the injected runner, else spawns', async () => {
    const fakeAsync = asAsync(fake)
    expect(resolveRunnerAsync('git', fakeAsync)).toBe(fakeAsync)
    const r = await resolveRunnerAsync('sh').run(['-c', 'printf hi'], { cwd: CWD })
    expect(r.stdout).toBe('hi')
  })
})

describe('timeoutMs: the cap fires on the deadline', () => {
  test('a hung child that ignores stdin is killed within a bound, and reported as a timeout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'seam-bound-'))
    const pidfile = join(dir, 'grandchild.pid')
    let grandchild = 0
    try {
      const started = Date.now()
      const r = await spawnRunnerAsync('sh').run(
        ['-c', `sleep 301 & echo $! > ${pidfile}; exec sleep 302`],
        { cwd: CWD, timeoutMs: 300, processGroup: true },
      )
      const elapsed = Date.now() - started
      for (let i = 0; i < 100 && !existsSync(pidfile); i++) await Bun.sleep(20)
      grandchild = Number(readFileSync(pidfile, 'utf-8').trim())
      expect(r).toMatchObject({ exitCode: 1, neverExited: true, reason: 'timeout' })
      expect(elapsed).toBeGreaterThanOrEqual(250)
      expect(elapsed).toBeLessThan(3000)
      expect(await gone(grandchild, 3000)).toBe(true)
    } finally {
      reap(grandchild)
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
