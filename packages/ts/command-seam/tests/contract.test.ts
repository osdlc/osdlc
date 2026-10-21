/**
 * README contract claims, proven on every runner they apply to. Each claim is
 * one `describe` block; the capture runners (sync, async, shell sync, shell
 * async) run the same case through `eachRunner`, so a runner that drifts from the
 * others fails by name. The stream and managed-process runners have their own
 * blocks because they return no output to read back (stdio is inherited): the
 * child asserts on itself and signals through its exit code.
 *
 * The sync runner here runs the `NODE_ENV=test` temp-file capture. The
 * production pipe path is covered by `pipe-path.test.ts`.
 *
 * POSIX-only (`sh`, `sleep`, `kill`). Everything that spawns sits in a
 * `posix` group so a platform skip can wrap it in one place.
 */

import { mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, beforeAll, describe, expect, test } from 'vitest'

import {
  asAsync,
  CommandFailed,
  failureText,
  managedProcessRunner,
  runJson,
  runChecked,
  runCheckedAsync,
  runJsonAsync,
  runShell,
  runShellAsync,
  shellJoin,
  shellQuote,
  shellRunner,
  shellRunnerAsync,
  spawnRunner,
  spawnRunnerAsync,
  streamRunner,
  withDefaults,
  type AsyncCommandRunOptions,
  type CommandResult,
  type CommandRunner,
  type CommandRunOptions,
} from '../index.ts'
import { alive, gone, reap } from './support/procs.ts'

const CWD = process.cwd()

/** Run `sh -c script` and return the capture result, whichever runner. */
interface RunnerCase {
  name: string
  exec(script: string, opts: AsyncCommandRunOptions): Promise<CommandResult>
  /** Same as `exec`, but the binary is the one to run; shell runners wrap it as their `sh`. */
  withBinary(binary: string, argv: string[], opts: AsyncCommandRunOptions): Promise<CommandResult>
  /** Runners that accept AbortSignal / processGroup (async twins only). */
  async: boolean
}

const syncOpts = (o: AsyncCommandRunOptions): CommandRunOptions => {
  const { signal: _s, onSpawn: _o, processGroup: _p, ...rest } = o
  return rest
}

const RUNNER_CASES: RunnerCase[] = [
  {
    name: 'sync',
    async: false,
    exec: async (script, o) => spawnRunner('sh').run(['-c', script], syncOpts(o)),
    withBinary: async (bin, argv, o) => spawnRunner(bin).run(argv, syncOpts(o)),
  },
  {
    name: 'async',
    async: true,
    exec: (script, o) => spawnRunnerAsync('sh').run(['-c', script], o),
    withBinary: (bin, argv, o) => spawnRunnerAsync(bin).run(argv, o),
  },
  {
    name: 'shell sync',
    async: false,
    exec: async (script, o) => runShell(script, syncOpts(o)),
    withBinary: async (bin, argv, o) =>
      shellRunner(spawnRunner(bin)).run(argv.join(' '), syncOpts(o)),
  },
  {
    name: 'shell async',
    async: true,
    exec: (script, o) => runShellAsync(script, o),
    withBinary: (bin, argv, o) => shellRunnerAsync(spawnRunnerAsync(bin)).run(argv.join(' '), o),
  },
]

function eachRunner(fn: (runner: RunnerCase) => void, only?: (d: RunnerCase) => boolean): void {
  for (const runner of RUNNER_CASES) {
    if (only !== undefined && !only(runner)) continue
    describe(runner.name, () => fn(runner))
  }
}

let scratch: string
beforeAll(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'seam-contract-')))
})
afterAll(() => {
  rmSync(scratch, { recursive: true, force: true })
})

// ── Type-level: cwd is required on every runner ───────────────────────────────
describe('cwd is required (type level)', () => {
  test('every runner rejects a call with no cwd at compile time', () => {
    // Never called; the point is that each line below needs its directive.
    // `tsc` fails with "unused @ts-expect-error" if cwd ever becomes optional.
    const _unused = () => {
      // @ts-expect-error cwd is mandatory
      spawnRunner('sh').run([], {})
      // @ts-expect-error cwd is mandatory
      void spawnRunnerAsync('sh').run([], {})
      // @ts-expect-error cwd is mandatory
      streamRunner('sh').run([], {})
      // @ts-expect-error cwd is mandatory
      runShell('true', {})
      // @ts-expect-error cwd is mandatory
      void runShellAsync('true', {})
    }
    expect(typeof _unused).toBe('function')
  })
})

describe('posix', () => {
  // ── timeoutMs: hard cap, SIGKILL, settles on the deadline ─────────────────
  describe('timeoutMs is a hard cap', () => {
    eachRunner((runner) => {
      test('a child that ignores SIGTERM is cut off at the deadline with neverExited', async () => {
        const t0 = performance.now()
        const r = await runner.exec("trap '' TERM; sleep 4", { cwd: CWD, timeoutMs: 250 })
        expect(performance.now() - t0).toBeLessThan(3000)
        expect(r.exitCode).not.toBe(0)
        expect(r.neverExited).toBe(true)
      }, 15_000)

      test('output captured before the deadline is returned', async () => {
        const r = await runner.exec('echo before; sleep 4', { cwd: CWD, timeoutMs: 500 })
        expect(r.stdout).toBe('before\n')
        expect(r.neverExited).toBe(true)
      }, 15_000)

      test('a command that finishes inside the cap is untouched', async () => {
        const r = await runner.exec('echo ok', { cwd: CWD, timeoutMs: 5000 })
        expect(r).toEqual({ exitCode: 0, stdout: 'ok\n', stderr: '' })
      })
    })

    test('async settles on the deadline even when a forked grandchild holds the pipes', async () => {
      // The grandchild keeps the write ends open for 4s; `close` would not
      // fire until it exits. The cap must resolve at the deadline instead.
      for (const runner of RUNNER_CASES.filter((d) => d.async)) {
        const t0 = performance.now()
        const r = await runner.exec('sleep 4 & wait', { cwd: CWD, timeoutMs: 250 })
        expect(performance.now() - t0).toBeLessThan(2500)
        expect(r.neverExited).toBe(true)
      }
    }, 15_000)

    // `timeoutMs: 0` and other invalid values: tests/timeout.test.ts.
  })

  // ── neverExited: set only when the seam's own stand-in 1 is reported ──────
  describe('neverExited', () => {
    eachRunner((runner) => {
      test('is absent on a genuine exit 1', async () => {
        const r = await runner.exec('exit 1', { cwd: CWD })
        expect(r.exitCode).toBe(1)
        expect(r.neverExited).toBeUndefined()
      })

      test('is set when a signal takes the child down', async () => {
        const r = await runner.exec('kill -9 $$', { cwd: CWD })
        expect(r.exitCode).toBe(1)
        expect(r.neverExited).toBe(true)
      })
    })
  })

  // ── Missing binary ────────────────────────────────────────────────────────
  describe('a missing binary is a result, not a throw', () => {
    const MISSING = 'definitely-not-a-real-binary-contract'
    eachRunner((runner) => {
      // The shell runners run the missing binary as their `sh`.
      test('non-zero exit with a message in error, not on stderr', async () => {
        const r = await runner.withBinary(MISSING, ['true'], { cwd: CWD })
        expect(r.exitCode).not.toBe(0)
        expect(r.error).toContain(MISSING)
        expect(r.stderr).toBe('')
      })
    })

    // The sync runners run through the bun-test capture path here; the
    // production path is covered in pipe-path.test.ts.
    eachRunner((runner) => {
      test('neverExited', async () => {
        const r = await runner.withBinary(MISSING, ['true'], { cwd: CWD })
        expect(r.neverExited).toBe(true)
      })
    })

    test('stream runner: neverExited', () => {
      const r = streamRunner(MISSING).run([], { cwd: CWD })
      expect(r.exitCode).not.toBe(0)
      expect(r.neverExited).toBe(true)
    })

    test('managed runner: settles with neverExited', async () => {
      const h = managedProcessRunner(MISSING).run([], { cwd: CWD })
      expect(h.pid).toBe(-1)
      const r = await h.exited
      expect(r.exitCode).not.toBe(0)
      expect(r.neverExited).toBe(true)
    })
  })

  // ── env ───────────────────────────────────────────────────────────────────
  describe('env', () => {
    const KEY = 'CONTRACT_SEAM_PROBE'
    beforeAll(() => {
      process.env[KEY] = 'inherited'
    })
    afterAll(() => {
      delete process.env[KEY]
    })

    eachRunner((runner) => {
      test('entries merge over the parent environment', async () => {
        const r = await runner.exec('echo "$CONTRACT_ADDED:$CONTRACT_SEAM_PROBE"', {
          cwd: CWD,
          env: { CONTRACT_ADDED: 'added' },
        })
        expect(r.stdout).toBe('added:inherited\n')
      })

      test('an undefined entry removes an inherited var', async () => {
        const r = await runner.exec('echo "${CONTRACT_SEAM_PROBE-absent}"', {
          cwd: CWD,
          env: { [KEY]: undefined },
        })
        expect(r.stdout).toBe('absent\n')
      })

      test('with no override the live process.env is inherited', async () => {
        process.env['CONTRACT_LIVE'] = 'set-after-start'
        try {
          const r = await runner.exec('echo "$CONTRACT_LIVE"', { cwd: CWD })
          expect(r.stdout).toBe('set-after-start\n')
        } finally {
          delete process.env['CONTRACT_LIVE']
        }
      })
    })

    const probeScript = (expr: string): string[] => ['-c', `test ${expr}`]

    test('stream runner: merges, removes on undefined, sees live env', () => {
      const sh = streamRunner('sh')
      process.env['CONTRACT_LIVE'] = 'set-after-start'
      try {
        expect(
          sh.run(probeScript('"$CONTRACT_ADDED:$CONTRACT_SEAM_PROBE" = added:inherited'), {
            cwd: CWD,
            env: { CONTRACT_ADDED: 'added' },
          }).exitCode,
        ).toBe(0)
        expect(
          sh.run(probeScript('-z "${CONTRACT_SEAM_PROBE+set}"'), {
            cwd: CWD,
            env: { [KEY]: undefined },
          }).exitCode,
        ).toBe(0)
        expect(
          sh.run(probeScript('"$CONTRACT_LIVE" = set-after-start'), { cwd: CWD }).exitCode,
        ).toBe(0)
      } finally {
        delete process.env['CONTRACT_LIVE']
      }
    })

    test('managed runner: merges, removes on undefined, sees live env', async () => {
      const sh = managedProcessRunner('sh')
      process.env['CONTRACT_LIVE'] = 'set-after-start'
      try {
        const merged = await sh.run(
          probeScript('"$CONTRACT_ADDED:$CONTRACT_SEAM_PROBE" = added:inherited'),
          { cwd: CWD, env: { CONTRACT_ADDED: 'added' } },
        ).exited
        const removed = await sh.run(probeScript('-z "${CONTRACT_SEAM_PROBE+set}"'), {
          cwd: CWD,
          env: { [KEY]: undefined },
        }).exited
        const live = await sh.run(probeScript('"$CONTRACT_LIVE" = set-after-start'), {
          cwd: CWD,
        }).exited
        expect([merged.exitCode, removed.exitCode, live.exitCode]).toEqual([0, 0, 0])
      } finally {
        delete process.env['CONTRACT_LIVE']
      }
    })
  })

  // ── cwd ───────────────────────────────────────────────────────────────────
  describe('cwd', () => {
    eachRunner((runner) => {
      test('is the directory the child runs in', async () => {
        const r = await runner.exec('pwd -P', { cwd: scratch })
        expect(r.stdout.trim()).toBe(scratch)
      })

      test('a directory that does not exist is a neverExited result, not a throw', async () => {
        const r = await runner.exec('true', { cwd: join(scratch, 'no-such-dir') })
        expect(r.exitCode).not.toBe(0)
        // The redirect path (sync, under NODE_ENV=test) reports sh's own
        // failure the same way: a message, not a throw.
        expect(r.error).toContain('no-such-dir')
        expect(r.stderr).toBe('')
      })
    })

    test('stream and managed runners run in cwd', async () => {
      expect(
        streamRunner('sh').run(['-c', `test "$(pwd -P)" = "${scratch}"`], { cwd: scratch })
          .exitCode,
      ).toBe(0)
      const r = await managedProcessRunner('sh').run(['-c', `test "$(pwd -P)" = "${scratch}"`], {
        cwd: scratch,
      }).exited
      expect(r.exitCode).toBe(0)
    })

    test('stream runner: a missing directory is neverExited', () => {
      const r = streamRunner('sh').run(['-c', 'true'], { cwd: join(scratch, 'no-such-dir') })
      expect(r.neverExited).toBe(true)
    })
  })

  // ── argv is never re-parsed as shell ──────────────────────────────────────
  describe('argv is never re-parsed as shell', () => {
    const NASTY = ['a b', '$(touch pwned)', ';touch pwned', '`touch pwned`', "it's", '*']
    const PRINT = 'for a in "$@"; do printf "[%s]" "$a"; done'
    const EXPECTED = NASTY.map((a) => `[${a}]`).join('')
    const noFiles = (): string[] => readdirSync(scratch).filter((f) => f === 'pwned')

    test('sync runner', async () => {
      const r = spawnRunner('sh').run(['-c', PRINT, 'sh', ...NASTY], { cwd: scratch })
      expect(r.stdout).toBe(EXPECTED)
      expect(noFiles()).toEqual([])
    })

    test('async runner', async () => {
      const r = await spawnRunnerAsync('sh').run(['-c', PRINT, 'sh', ...NASTY], { cwd: scratch })
      expect(r.stdout).toBe(EXPECTED)
      expect(noFiles()).toEqual([])
    })

    test('shell runners: positionals stay data', async () => {
      const verb = 'for a in "$@"; do printf "[%s]" "$a"; done'
      const s = runShell(verb, { cwd: scratch, args: NASTY })
      const a = await runShellAsync(verb, { cwd: scratch, args: NASTY })
      expect(s.stdout).toBe(EXPECTED)
      expect(a.stdout).toBe(EXPECTED)
      expect(noFiles()).toEqual([])
    })

    test('stream runner', () => {
      const r = streamRunner('sh').run(
        ['-c', 'test "$#" = 6 && test "$2" = \'$(touch pwned)\'', 'sh', ...NASTY],
        { cwd: scratch },
      )
      expect(r.exitCode).toBe(0)
      expect(noFiles()).toEqual([])
    })

    test('managed runner', async () => {
      const r = await managedProcessRunner('sh').run(
        ['-c', 'test "$#" = 6 && test "$2" = \'$(touch pwned)\'', 'sh', ...NASTY],
        { cwd: scratch },
      ).exited
      expect(r.exitCode).toBe(0)
      expect(noFiles()).toEqual([])
    })
  })

  // ── Abort ─────────────────────────────────────────────────────────────────
  describe('abort via signal', () => {
    for (const runner of RUNNER_CASES.filter((d) => d.async)) {
      describe(runner.name, () => {
        test('cancels mid-flight with neverExited and the abort message', async () => {
          const ac = new AbortController()
          const pending = runner.exec('sleep 4', { cwd: CWD, signal: ac.signal })
          setTimeout(() => ac.abort(), 100)
          const t0 = performance.now()
          const r = await pending
          expect(performance.now() - t0).toBeLessThan(3000)
          expect(r.exitCode).not.toBe(0)
          expect(r.neverExited).toBe(true)
          expect(r.error).toContain('aborted')
          expect(r.stderr).toBe('')
        }, 15_000)

        test('an already-aborted signal never runs the command to completion', async () => {
          const marker = join(scratch, `already-aborted-${runner.name.replace(' ', '-')}`)
          const r = await runner.exec(`sleep 1; touch "${marker}"`, {
            cwd: CWD,
            signal: AbortSignal.abort(),
          })
          expect(r.neverExited).toBe(true)
          await new Promise((res) => setTimeout(res, 1500))
          expect(readdirSync(scratch)).not.toContain(marker.split('/').pop() ?? '')
        }, 15_000)

        test('with processGroup, an already-aborted signal is honoured too', async () => {
          const r = await runner.exec('sleep 4', {
            cwd: CWD,
            signal: AbortSignal.abort(),
            processGroup: true,
          })
          expect(r.neverExited).toBe(true)
          expect(r.error).toContain('aborted')
          expect(r.stderr).toBe('')
        }, 15_000)
      })
    }
  })

  // ── processGroup ──────────────────────────────────────────────────────────
  describe('processGroup kills grandchildren', () => {
    // `sh` is not exec'd, so killing it alone leaves the inner `sleep`. The
    // inner sh prints its pid and execs sleep, so the printed pid is the
    // grandchild's.
    const GRANDCHILD = `sh -c 'echo $$; exec sleep 30'; echo after`

    for (const runner of RUNNER_CASES.filter((d) => d.async)) {
      describe(runner.name, () => {
        test('a timeout kills the grandchild', async () => {
          const r = await runner.exec(GRANDCHILD, { cwd: CWD, timeoutMs: 500, processGroup: true })
          const pid = Number(r.stdout.trim())
          try {
            expect(r.neverExited).toBe(true)
            expect(pid).toBeGreaterThan(0)
            expect(await gone(pid)).toBe(true)
          } finally {
            reap(pid)
          }
        }, 15_000)

        test('an abort kills the grandchild', async () => {
          const ac = new AbortController()
          setTimeout(() => ac.abort(), 500)
          const r = await runner.exec(GRANDCHILD, {
            cwd: CWD,
            signal: ac.signal,
            processGroup: true,
          })
          const pid = Number(r.stdout.trim())
          try {
            expect(r.neverExited).toBe(true)
            expect(pid).toBeGreaterThan(0)
            expect(await gone(pid)).toBe(true)
          } finally {
            reap(pid)
          }
        }, 15_000)
      })
    }

    test('sync and stream runners do not offer processGroup (documented limit)', () => {
      // Nothing to assert at runtime: the option does not exist on these
      // runners (the async and managed runners have it). The compile-time half is the directive below.
      const _unused = () => {
        // @ts-expect-error processGroup is not offered on the sync runner
        spawnRunner('sh').run([], { cwd: CWD, processGroup: true })
        // @ts-expect-error processGroup is not offered on the stream runner
        streamRunner('sh').run([], { cwd: CWD, processGroup: true })
      }
      expect(typeof _unused).toBe('function')
    })

    // A grandchild that moves to its own session keeps the pipes open but is
    // not in the child's group, so once the child exits the group is gone. The
    // runner settles on the child's own exit instead of waiting on the pipes,
    // and a later timeout or abort does not replace that result.
    // The child is this runtime running a short script: it starts the
    // grandchild with `detached: true` (its own session) and `stdio:
    // 'inherit'` (the same pipes), records the grandchild's pid, then exits.
    const leaver = (pidFile: string) =>
      [
        `const { spawn } = require('node:child_process')`,
        `const g = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 3000)'], { detached: true, stdio: 'inherit' })`,
        `require('node:fs').writeFileSync(${JSON.stringify(pidFile)}, String(g.pid))`,
        `g.unref()`,
      ].join('\n')

    /** Run `body` with the leaver script, which records its grandchild's pid in a temp file; reap the grandchild after. */
    async function withLeaver(body: (script: string) => Promise<void>): Promise<void> {
      const pidFile = join(scratch, `leaver-${Math.random().toString(36).slice(2)}`)
      try {
        await body(leaver(pidFile))
      } finally {
        try {
          reap(Number(readFileSync(pidFile, 'utf8')))
        } catch {
          // never written
        }
      }
    }

    test(
      'a child whose group is already gone settles on its own exit, not the deadline',
      () =>
        withLeaver(async (script) => {
          const t0 = performance.now()
          const r = await spawnRunnerAsync(process.execPath).run(['-e', script], {
            cwd: CWD,
            timeoutMs: 5_000,
            processGroup: true,
          })
          expect(performance.now() - t0).toBeLessThan(2_000)
          expect(r.exitCode).toBe(0)
          expect(r.neverExited).toBeUndefined()
        }),
      15_000,
    )

    test(
      'a timeout after a group-gone child exited keeps the exit code',
      () =>
        withLeaver(async (script) => {
          // Fires after the child exits and before EXIT_GRACE_MS (async.ts, 250 ms) ends.
          const r = await spawnRunnerAsync(process.execPath).run(['-e', script], {
            cwd: CWD,
            timeoutMs: 240,
            processGroup: true,
          })
          expect(r.exitCode).toBe(0)
          expect(r.neverExited).toBeUndefined()
        }),
      15_000,
    )

    test(
      'an abort after a group-gone child exited keeps the exit code',
      () =>
        withLeaver(async (script) => {
          // Abort once the child is gone, inside the exit grace.
          const ac = new AbortController()
          const r = await spawnRunnerAsync(process.execPath).run(['-e', script], {
            cwd: CWD,
            signal: ac.signal,
            processGroup: true,
            onSpawn: (pid) => {
              void gone(pid).then(() => setTimeout(() => ac.abort(), 40))
            },
          })
          expect(r.exitCode).toBe(0)
          expect(r.neverExited).toBeUndefined()
        }),
      15_000,
    )
  })

  // The sync and stream runners kill the direct child only on timeout, not its
  // group, so a grandchild survives. These pin that, so changing it is
  // deliberate. The compile-time half (no `processGroup` option) is above.
  describe('sync and stream runners kill the direct child only on timeout', () => {
    // The child backgrounds a long `sleep`, records its pid in a file (the
    // stream runner returns no output), then waits so the timeout ends it.
    const cases: [string, (script: string) => { neverExited?: boolean | undefined }][] = [
      [
        'spawnRunner',
        (script) => spawnRunner('sh').run(['-c', script], { cwd: CWD, timeoutMs: 500 }),
      ],
      [
        'streamRunner',
        (script) => streamRunner('sh').run(['-c', script], { cwd: CWD, timeoutMs: 500 }),
      ],
    ]
    for (const [name, run] of cases) {
      test(`${name}: the grandchild survives a timeout`, () => {
        const pidFile = join(scratch, `direct-child-${name}`)
        let pid = 0
        try {
          const r = run(`sleep 30 & echo $! > "${pidFile}"; wait`)
          pid = Number(readFileSync(pidFile, 'utf8').trim())
          expect(r.neverExited).toBe(true)
          expect(pid).toBeGreaterThan(0)
          expect(alive(pid)).toBe(true)
        } finally {
          reap(pid)
        }
      }, 15_000)
    }
  })

  // ── early stdin close ─────────────────────────────────────────────────────
  describe('a child that closes stdin before input drains', () => {
    const BIG = 'x'.repeat(4 * 1024 * 1024)
    for (const runner of RUNNER_CASES.filter((d) => d.async)) {
      test(`${runner.name}: keeps the child's exit code and reports the write error in error`, async () => {
        const r = await runner.exec('exec 0<&-; sleep 0.3', { cwd: CWD, input: BIG })
        expect(r.exitCode).toBe(0)
        // EPIPE, or ENOTCONN under some timings: both are a write to a closed peer. Node words it "write EPIPE", Bun "EPIPE: …, write".
        expect(r.error).toMatch(/^((EPIPE|ENOTCONN): [^\n]*, write|write (EPIPE|ENOTCONN))$/)
        expect(r.stderr).toBe('')
      }, 15_000)
    }

    // Async only. Under `bun test` the sync runners feed `input` from a file,
    // so no write can fail; regressions.test.ts checks Node's sync pipe path.
  })

  // ── runJson ───────────────────────────────────────────────────────────────
  describe('runJson tolerateLeadingLog', () => {
    const LOGGED = 'echo "starting up"; echo "[INFO] ready"; echo \'{"a": [1, 2]}\''
    const syncRunner = spawnRunner('sh')
    const asyncRunner = spawnRunnerAsync('sh')

    test('sync runner skips leading log lines on a real run', () => {
      const r = runJson<{ a: number[] }>(syncRunner, ['-c', LOGGED], {
        cwd: CWD,
        tolerateLeadingLog: true,
      })
      expect(r.ok && r.value).toEqual({ a: [1, 2] })
    })

    test('async runner skips leading log lines on a real run', async () => {
      const r = await runJsonAsync<{ a: number[] }>(asyncRunner, ['-c', LOGGED], {
        cwd: CWD,
        tolerateLeadingLog: true,
      })
      expect(r.ok && r.value).toEqual({ a: [1, 2] })
    })

    test('without the option the same output is unparseable, on both runners', async () => {
      const s = runJson(syncRunner, ['-c', LOGGED], { cwd: CWD })
      const a = await runJsonAsync(asyncRunner, ['-c', LOGGED], { cwd: CWD })
      expect(!s.ok && s.reason).toBe('unparseable')
      expect(!a.ok && a.reason).toBe('unparseable')
    })

    test('trailing output is not tolerated', async () => {
      const script = `echo '{"a": 1}'; echo "done"`
      const s = runJson(syncRunner, ['-c', script], { cwd: CWD, tolerateLeadingLog: true })
      const a = await runJsonAsync(asyncRunner, ['-c', script], {
        cwd: CWD,
        tolerateLeadingLog: true,
      })
      expect(s.ok).toBe(false)
      expect(a.ok).toBe(false)
    })

    test('a failed run is reported as failed, not parsed', async () => {
      const s = runJson(syncRunner, ['-c', 'echo "{}"; exit 2'], {
        cwd: CWD,
        tolerateLeadingLog: true,
      })
      expect(!s.ok && s.reason).toBe('failed')
    })
  })

  // ── Failure shape ─────────────────────────────────────────────────────────
  describe('CommandFailed', () => {
    test('message carries exit code, argv and trimmed stderr', () => {
      const e = new CommandFailed(['git', 'push', 'origin'], {
        exitCode: 128,
        stdout: 'out',
        stderr: 'fatal: nope\n',
      })
      expect(e.message).toBe('command failed (exit 128): git push origin\nfatal: nope')
      expect(e.name).toBe('CommandFailed')
    })

    test('message omits the stderr line when stderr is empty', () => {
      const e = new CommandFailed(['x'], { exitCode: 2, stdout: '', stderr: '  \n' })
      expect(e.message).toBe('command failed (exit 2): x')
    })

    test('message quotes argv with shellJoin, so word boundaries survive', () => {
      const e = new CommandFailed(['commit', '-m', "it's done"], {
        exitCode: 1,
        stdout: '',
        stderr: '',
      })
      expect(e.message).toBe(`command failed (exit 1): commit -m 'it'\\''s done'`)
    })

    test('detail is failureText(result, { both: true })', () => {
      for (const result of [
        { exitCode: 1, stdout: 'from the hook\n', stderr: 'commit failed\n' },
        { exitCode: 1, stdout: 'only out', stderr: ' ' },
        { exitCode: 3, stdout: '', stderr: '' },
      ]) {
        const e = new CommandFailed(['x'], result)
        expect(e.detail).toBe(failureText(result, { both: true }))
      }
      expect(new CommandFailed(['x'], { exitCode: 3, stdout: '', stderr: '' }).detail).toBe('')
    })

    test('message names the binary when given, and binary is exposed', () => {
      const e = new CommandFailed(
        ['plugin', 'list'],
        { exitCode: 1, stdout: '', stderr: '' },
        'my tool',
      )
      expect(e.message).toBe(`command failed (exit 1): 'my tool' plugin list`)
      expect(e.binary).toBe('my tool')
      expect(e.argv).toEqual(['plugin', 'list'])
      expect(
        new CommandFailed(['x'], { exitCode: 1, stdout: '', stderr: '' }).binary,
      ).toBeUndefined()
    })
  })

  describe('runChecked names the binary', () => {
    const failing = ['-c', 'echo nope >&2; exit 3']

    test('spawnRunner and spawnRunnerAsync report their binary', async () => {
      expect(spawnRunner('sh').binary).toBe('sh')
      expect(spawnRunnerAsync('sh').binary).toBe('sh')
      expect(() => runChecked(spawnRunner('sh'), failing, { cwd: CWD })).toThrow(
        `command failed (exit 3): sh -c 'echo nope >&2; exit 3'\nnope`,
      )
      const e = await runCheckedAsync(spawnRunnerAsync('sh'), failing, { cwd: CWD }).catch(
        (x: unknown) => x,
      )
      expect(e).toBeInstanceOf(CommandFailed)
      expect((e as CommandFailed).binary).toBe('sh')
    })

    test('withDefaults and asAsync keep the binary', async () => {
      const bound = withDefaults(spawnRunner('sh'), { cwd: CWD })
      expect(bound.binary).toBe('sh')
      expect(() => runChecked(bound, failing)).toThrow('command failed (exit 3): sh -c')
      expect(withDefaults(spawnRunnerAsync('sh'), { cwd: CWD }).binary).toBe('sh')
      const e = await runCheckedAsync(asAsync(spawnRunner('sh')), failing, { cwd: CWD }).catch(
        (x: unknown) => x,
      )
      expect((e as CommandFailed).binary).toBe('sh')
    })

    test('a runner without binary keeps the argv-only message', () => {
      const fake: CommandRunner = { run: () => ({ exitCode: 2, stdout: '', stderr: '' }) }
      expect(withDefaults(fake, { cwd: CWD }).binary).toBeUndefined()
      expect(() => runChecked(fake, ['x'], { cwd: CWD })).toThrow(/^command failed \(exit 2\): x$/)
    })
  })
})

// ── Managed process ─────────────────────────────────────────────────────────
describe('managedProcessRunner — kill and exit shape', () => {
  test('kill() defaults to SIGTERM', async () => {
    const h = managedProcessRunner('sh').run(['-c', 'exec sleep 4'], { cwd: CWD })
    h.kill()
    const r = await h.exited
    expect(r.signal).toBe('SIGTERM')
    expect(r.neverExited).toBe(true)
  }, 15_000)

  test('a signal-killed process reports signal and neverExited', async () => {
    const h = managedProcessRunner('sh').run(['-c', 'exec sleep 4'], { cwd: CWD })
    h.kill('SIGKILL')
    const r = await h.exited
    expect(r).toEqual({ exitCode: 1, signal: 'SIGKILL', neverExited: true, reason: 'abort' })
  }, 15_000)

  test('a genuine exit reports no neverExited', async () => {
    const r = await managedProcessRunner('sh').run(['-c', 'exit 5'], { cwd: CWD }).exited
    expect(r).toEqual({ exitCode: 5, signal: null })
  })

  test('kill() after exit is a silent no-op', async () => {
    const h = managedProcessRunner('sh').run(['-c', 'exit 0'], { cwd: CWD })
    await h.exited
    expect(() => h.kill()).not.toThrow()
  })

  test('kill() on a process that never spawned is a silent no-op', async () => {
    const h = managedProcessRunner('definitely-not-a-real-binary-kill').run([], { cwd: CWD })
    expect(() => h.kill()).not.toThrow()
    await h.exited
  })

  test('processGroup: kill() reaps a grandchild too', async () => {
    const marker = join(scratch, 'managed-grandchild-pid')
    const h = managedProcessRunner('sh').run(
      ['-c', `sh -c 'echo $$ > "${marker}"; exec sleep 30' & wait`],
      { cwd: CWD, processGroup: true },
    )
    let pid = 0
    for (let i = 0; i < 40 && pid === 0; i++) {
      await new Promise((res) => setTimeout(res, 50))
      try {
        pid = Number(readFileSync(marker, 'utf-8').trim()) || 0
      } catch {
        pid = 0
      }
    }
    try {
      expect(pid).toBeGreaterThan(0)
      h.kill('SIGKILL')
      await h.exited
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  }, 15_000)

  test('processGroup: kill() after the leader exits still signals the rest of the group', async () => {
    // The leader backgrounds a `sleep` in its own group, records its pid, and
    // exits. `kill()` signals the group, not the reaped leader, so it still
    // reaches the `sleep`.
    const marker = join(scratch, 'managed-leftover-pid')
    const h = managedProcessRunner('sh').run(['-c', `sleep 30 & echo $! > "${marker}"`], {
      cwd: CWD,
      processGroup: true,
    })
    expect(await h.exited).toEqual({ exitCode: 0, signal: null })
    const pid = Number(readFileSync(marker, 'utf-8').trim())
    try {
      expect(pid).toBeGreaterThan(0)
      expect(alive(pid)).toBe(true)
      h.kill('SIGKILL')
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  }, 15_000)
})

// ── Streaming runner ──────────────────────────────────────────────────────────
describe('streamRunner — exit shape', () => {
  test('a genuine exit 1 has no neverExited', () => {
    expect(streamRunner('sh').run(['-c', 'exit 1'], { cwd: CWD })).toEqual({ exitCode: 1 })
  })

  test('a signal death is neverExited', () => {
    const r = streamRunner('sh').run(['-c', 'kill -9 $$'], { cwd: CWD })
    expect(r).toEqual({ exitCode: 1, neverExited: true, reason: 'signal', signal: 'SIGKILL' })
  })

  test('timeoutMs is a hard cap for a child that ignores SIGTERM', () => {
    const t0 = performance.now()
    const r = streamRunner('sh').run(['-c', "trap '' TERM; sleep 4"], { cwd: CWD, timeoutMs: 250 })
    expect(performance.now() - t0).toBeLessThan(3000)
    expect(r.neverExited).toBe(true)
  }, 15_000)
})

// ── shellQuote / shellJoin round trips through the real runners ───────────────
describe('shellQuote / shellJoin round trip', () => {
  const WORDS = [
    '',
    ' ',
    'plain',
    'a b',
    "it's",
    "'",
    '"',
    '$HOME',
    '$(echo hacked)',
    '`echo hacked`',
    'a\nb',
    '*',
    '~',
    '\\',
    '#x',
    '!',
    '--flag=va lue',
    'ünï©ode',
  ]

  test('shellQuote(word) is read back as the exact word by sh, on both shell runners', async () => {
    for (const w of WORDS) {
      const verb = `printf %s ${shellQuote(w)}`
      expect(runShell(verb, { cwd: CWD }).stdout).toBe(w)
      expect((await runShellAsync(verb, { cwd: CWD })).stdout).toBe(w)
    }
  })

  test('shellJoin(argv) is read back as the exact argv, on both shell runners', async () => {
    const verb = `for a in ${shellJoin(WORDS)}; do printf '[%s]' "$a"; done`
    const expected = WORDS.map((w) => `[${w}]`).join('')
    expect(runShell(verb, { cwd: CWD }).stdout).toBe(expected)
    expect((await runShellAsync(verb, { cwd: CWD })).stdout).toBe(expected)
  })

  test('shellJoin of nothing is the empty string', () => {
    expect(shellJoin([])).toBe('')
  })

  test('quoting does not assume a path separator', () => {
    const p = join('dir with space', 'file')
    expect(runShell(`printf %s ${shellQuote(p)}`, { cwd: CWD }).stdout).toBe(p)
  })
})
