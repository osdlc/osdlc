/**
 * Regression tests, one describe per fixed behaviour. Child processes that
 * must report back write to a file, not to a pipe, because under `bun test`
 * the pipes a parent gives a child can come back empty (see `sync.ts`).
 */

import { ChildProcess, spawnSync } from 'node:child_process'
import {
  closeSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

import { describe, expect, test, vi } from 'vitest'

import {
  asAsync,
  managedProcessRunner,
  runShell,
  shellJoin,
  spawnRunner,
  spawnRunnerAsync,
  spawnRunnerBytesAsync,
  type CommandResult,
  type CommandRunner,
} from '../src/index.ts'
import { mergedEnv } from '../src/sync.ts'
import { gone, reap } from './support/procs.ts'
import { BUN, NODE } from './support/runtimes.ts'

const CWD = process.cwd()
const INDEX = pathToFileURL(join(import.meta.dirname, '../src/index.ts')).href

function withTempDir<T>(fn: (dir: string) => T): T {
  const dir = mkdtempSync(join(tmpdir(), 'seam-regression-'))
  try {
    return fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

async function withTempDirAsync<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = mkdtempSync(join(tmpdir(), 'seam-regression-'))
  try {
    return await fn(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

/** Node with warnings off, as `[binary, ...flags]` for {@link runProbe}. */
const ON_NODE = [NODE, '--no-warnings']

/**
 * Run `code` as a script under `runtime`, with the package entry imported as
 * `seam`, and return what it passes to `report(value)` and its stderr. Both go
 * through files, not pipes (see the header). `env` defaults to this process's
 * env without `NODE_ENV`, so the script takes the pipe path.
 */
function runProbe(
  dir: string,
  runtime: string[],
  code: string[],
  env: NodeJS.ProcessEnv = withoutNodeEnv(),
): { result: unknown; stderr: string } {
  const outFile = join(dir, 'result.json')
  const errFile = join(dir, 'probe.stderr')
  const probe = join(dir, 'probe.ts')
  writeFileSync(
    probe,
    [
      `import { writeFileSync } from "node:fs";`,
      `import * as seam from ${JSON.stringify(INDEX)};`,
      `const report = (v: unknown) => writeFileSync(${JSON.stringify(outFile)}, JSON.stringify(v));`,
      ...code,
    ].join('\n'),
  )
  const errFd = openSync(errFile, 'w')
  try {
    const [binary, ...flags] = runtime
    spawnSync(binary!, [...flags, probe], { cwd: CWD, env, stdio: ['ignore', 'ignore', errFd] })
  } finally {
    closeSync(errFd)
  }
  return {
    result: JSON.parse(readFileSync(outFile, 'utf-8')),
    stderr: readFileSync(errFile, 'utf-8'),
  }
}

function withoutNodeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  delete env['NODE_ENV']
  return env
}

describe('the bun-test capture path is gated on the Bun runtime', () => {
  test('Node with NODE_ENV=test keeps the pipe path', () => {
    // The redirect path makes a temp dir. With TMPDIR pointing nowhere, that
    // path throws. The pipe path never touches TMPDIR. So a clean result
    // under Node proves the pipe path ran.
    withTempDir((dir) => {
      const env = { ...process.env, NODE_ENV: 'test', TMPDIR: join(dir, 'missing') }
      const { result } = runProbe(
        dir,
        ON_NODE,
        ['report(seam.spawnRunner("sh").run(["-c", "echo hi"], { cwd: process.cwd() }));'],
        env,
      )
      expect(result).toEqual({ exitCode: 0, stdout: 'hi\n', stderr: '' })
    })
  }, 20_000)
})

describe('the in-process sync runner leaves no temp dir behind', () => {
  // On Node this is the pipe path. The redirect path itself is checked
  // under Bun below.
  test('after a clean run, a failure and a timeout', () => {
    withTempDir((dir) => {
      const saved = process.env['TMPDIR']
      process.env['TMPDIR'] = dir
      try {
        const sh = spawnRunner('sh')
        expect(sh.run(['-c', 'cat'], { cwd: CWD, input: 'in' }).stdout).toBe('in')
        expect(sh.run(['-c', 'exit 3'], { cwd: CWD }).exitCode).toBe(3)
        expect(sh.run(['-c', 'sleep 10'], { cwd: CWD, timeoutMs: 100 }).reason).toBe('timeout')
      } finally {
        if (saved === undefined) delete process.env['TMPDIR']
        else process.env['TMPDIR'] = saved
      }
      expect(readdirSync(dir)).toEqual([])
    })
  }, 10_000)
})

// The redirect path runs only on the Bun runtime with NODE_ENV=test, so these
// run a probe under Bun. Bun is optional for contributors: they skip when no
// `bun` is on PATH. The probe gets a fixed env, not this process's, so the
// result does not depend on the caller's variables. POSIX only: that env's
// PATH is the system binary dirs.
const noBun = BUN === undefined || process.platform === 'win32'
describe.skipIf(noBun)('the bun-test capture path, under Bun (skipped without bun on PATH)', () => {
  const ON_BUN = [BUN ?? 'bun', 'run']
  const bunEnv = (dir: string, tmp: string): NodeJS.ProcessEnv => ({
    PATH: ['/usr/bin', '/bin'].join(':'),
    HOME: dir,
    NODE_ENV: 'test',
    TMPDIR: tmp,
  })

  test('is the path taken: the run captures through a temp dir under TMPDIR', () => {
    // The child lists TMPDIR while it runs. The redirect path has made its
    // capture dir there by then. The pipe path makes none.
    withTempDir((dir) => {
      const tmp = join(dir, 'tmp')
      mkdirSync(tmp)
      const { result } = runProbe(
        dir,
        ON_BUN,
        [`report(seam.spawnRunner("ls").run([${JSON.stringify(tmp)}], { cwd: process.cwd() }));`],
        bunEnv(dir, tmp),
      )
      expect((result as CommandResult).stdout).toMatch(/^command-seam-/)
      expect(readdirSync(tmp)).toEqual([])
    })
  }, 20_000)

  test('captures input, argv, a missing binary, -a, a timeout and bytes, then removes its temp dir', () => {
    withTempDir((dir) => {
      const tmp = join(dir, 'tmp')
      mkdirSync(tmp)
      const argv = ['-c', 'printf "%s|" "$@"', 'sh', 'a b', '$(echo no)', "it's"]
      const { result } = runProbe(
        dir,
        ON_BUN,
        [
          'const cwd = process.cwd();',
          'const sh = seam.spawnRunner("sh");',
          `const raw = seam.spawnRunnerBytes("sh").run(["-c", "printf '\\\\377\\\\000a'"], { cwd });`,
          'report({',
          '  input: sh.run(["-c", "cat"], { cwd, input: "in" }),',
          `  argv: sh.run(${JSON.stringify(argv)}, { cwd }),`,
          '  missing: seam.spawnRunner("definitely-not-a-real-binary-b1").run([], { cwd }),',
          '  option: seam.spawnRunner("-a").run(["x"], { cwd }),',
          '  timeout: sh.run(["-c", "sleep 10"], { cwd, timeoutMs: 200 }),',
          '  bytes: Buffer.from(raw.stdout).toString("base64"),',
          '});',
        ],
        bunEnv(dir, tmp),
      )
      const r = result as {
        [K in 'input' | 'argv' | 'missing' | 'option' | 'timeout']: CommandResult
      } & { bytes: string }
      expect(r.input).toEqual({ exitCode: 0, stdout: 'in', stderr: '' })
      expect(r.argv).toEqual({ exitCode: 0, stdout: "a b|$(echo no)|it's|", stderr: '' })
      expect(r.missing).toMatchObject({ exitCode: 1, neverExited: true, reason: 'spawn' })
      expect(r.missing.error).toContain('ENOENT')
      expect(r.option).toMatchObject({ exitCode: 1, neverExited: true })
      expect(r.timeout).toMatchObject({ neverExited: true, reason: 'timeout' })
      expect(r.bytes).toBe(Buffer.from([0xff, 0x00, 0x61]).toString('base64'))
      expect(readdirSync(tmp)).toEqual([])
    })
  }, 30_000)
})

describe('a child that closes stdin early', () => {
  test("Node's sync pipe path reports the failed write and keeps the exit code", () => {
    // Bun's `spawnSync` does not report it (see the README's Behaviour
    // section), so this runs under Node.
    withTempDir((dir) => {
      const res = runProbe(dir, ON_NODE, [
        'const input = "x".repeat(4 * 1024 * 1024);',
        'report(seam.spawnRunner("sh").run(["-c", "exec 0<&-; sleep 0.3"], { cwd: process.cwd(), input }));',
      ]).result as CommandResult
      expect(res.exitCode).toBe(0)
      expect(res.reason).toBeUndefined()
      // EPIPE, or ENOTCONN with some timings. Both are a write to a closed peer.
      // Windows reports EOF.
      expect(res.error).toMatch(/EPIPE|ENOTCONN|EOF/)
      expect(res.stderr).toBe('')
    })
  }, 20_000)
})

describe('a missing binary gives the same result on both sync paths', () => {
  test('the in-process runner flags a missing binary as neverExited', () => {
    const r = spawnRunner('definitely-not-a-real-binary-h1').run(['a'], { cwd: CWD })
    expect(r.exitCode).toBe(1)
    expect(r.neverExited).toBe(true)
    expect(r.stdout).toBe('')
    expect(r.error).toContain('definitely-not-a-real-binary-h1')
    expect(r.stderr).toBe('')
  })

  test('the production pipe path agrees', () => {
    withTempDir((dir) => {
      const res = runProbe(dir, ON_NODE, [
        'report(seam.spawnRunner("definitely-not-a-real-binary-h1").run(["a"], { cwd: process.cwd() }));',
      ]).result as CommandResult
      expect(res.exitCode).toBe(1)
      expect(res.neverExited).toBe(true)
      expect(res.stdout).toBe('')
      expect(res.error).toContain('definitely-not-a-real-binary-h1')
      expect(res.stderr).toBe('')
    })
  }, 20_000)

  test('a binary named like an option is not run as an `exec` option', () => {
    const r = spawnRunner('-a').run(['x'], { cwd: CWD })
    expect(r.exitCode).toBe(1)
    expect(r.neverExited).toBe(true)
  })

  // POSIX only: `/bin/echo` is a POSIX path.
  test.skipIf(process.platform === 'win32')(
    'an env.PATH without /bin still runs a binary given by path',
    () => {
      // An existing binary, not a freshly written script: macOS scans a new
      // executable on first run, which can take seconds under load.
      withTempDir((dir) => {
        const r = spawnRunner('/bin/echo').run(['ran'], { cwd: dir, env: { PATH: dir } })
        expect(r).toEqual({ exitCode: 0, stdout: 'ran\n', stderr: '' })
      })
    },
  )
})

describe('the async runner settles on exit', () => {
  test('a child that exits while its background process holds the pipes reports its own exit', async () => {
    // `sleep` inherits the pipes and outlives `sh`. Waiting on stdio EOF
    // would block for its full 5s and then, under the 2s cap, report a
    // timeout for a command that exited 0.
    const r = await spawnRunnerAsync('sh').run(['-c', 'sleep 5 & echo $!; exit 0'], {
      cwd: CWD,
      timeoutMs: 2000,
    })
    const pid = Number(r.stdout.trim())
    try {
      expect(r.exitCode).toBe(0)
      expect(r.neverExited).toBeUndefined()
      expect(pid).toBeGreaterThan(0)
    } finally {
      reap(pid)
    }
  }, 10_000)

  test('without a timeout it still settles instead of waiting on the background process', async () => {
    // Proven by construction: the background `sleep` holds the pipes for
    // 30s, so resolving inside this test's 10s window means the call did not
    // wait on them.
    const r = await spawnRunnerAsync('sh').run(['-c', 'sleep 30 & echo $!; exit 4'], { cwd: CWD })
    const pid = Number(r.stdout.trim())
    try {
      expect(r.exitCode).toBe(4)
      expect(r.neverExited).toBeUndefined()
    } finally {
      reap(pid)
    }
  }, 10_000)
})

describe('an abort leaves no child running', () => {
  test('a child that ignores SIGTERM is killed by an abort', async () => {
    // An ignored signal stays ignored across `exec`, so `sleep` itself
    // ignores TERM.
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
    const r = await pending
    try {
      expect(r).toEqual({
        exitCode: 1,
        neverExited: true,
        reason: 'abort',
        stdout: '',
        stderr: '',
        error: 'The operation was aborted',
      })
      expect(pid).toBeGreaterThan(0)
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  }, 10_000)

  test('an already-aborted signal kills the child at once', async () => {
    let pid = 0
    const r = await spawnRunnerAsync('sh').run(['-c', "trap '' TERM; exec sleep 10"], {
      cwd: CWD,
      signal: AbortSignal.abort(),
      onSpawn: (p) => {
        pid = p
      },
    })
    try {
      expect(r.neverExited).toBe(true)
      expect(r.error).toBe('The operation was aborted')
      expect(r.stderr).toBe('')
      expect(pid).toBeGreaterThan(0)
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  }, 10_000)
})

describe('an onSpawn that throws', () => {
  test('resolves with a result and kills the child', async () => {
    let pid = 0
    const r = await spawnRunnerAsync('sh').run(['-c', 'sleep 10'], {
      cwd: CWD,
      onSpawn: (p) => {
        pid = p
        throw new Error('boom')
      },
    })
    try {
      expect(r.exitCode).toBe(1)
      expect(r.neverExited).toBe(true)
      expect(r.error).toBe('onSpawn threw: boom')
      expect(r.stderr).toBe('')
      expect(pid).toBeGreaterThan(0)
      expect(await gone(pid)).toBe(true)
    } finally {
      reap(pid)
    }
  }, 10_000)
})

describe('an async timeout says so', () => {
  test('error names the timeout, and stderr stays empty', async () => {
    const r = await spawnRunnerAsync('sh').run(['-c', 'sleep 10'], { cwd: CWD, timeoutMs: 200 })
    expect(r.neverExited).toBe(true)
    expect(r.error).toBe('timed out after 200ms')
    expect(r.stderr).toBe('')
  }, 10_000)
})

describe('a timeout that fires after the child exited', () => {
  // POSIX only: on Windows, starting an MSYS `sh` and its `sleep` can take
  // longer than the 240 ms deadline, so the timeout fires first (seen on the
  // windows tier 2 job, https://github.com/osdlc/osdlc/pull/492).
  test.skipIf(process.platform === 'win32')(
    'reports the exit code, not a timeout, while a grandchild holds the pipes',
    async () => {
      // The 240 ms deadline lands after the child exits and before EXIT_GRACE_MS
      // (async.ts) ends, so the timer settles the run.
      await withTempDirAsync(async (dir) => {
        const pidFile = join(dir, 'pid')
        let pid = 0
        try {
          const t0 = performance.now()
          const r = await spawnRunnerAsync('sh').run(
            ['-c', `sleep 5 & echo $! > "${pidFile}"; exit 0`],
            { cwd: CWD, timeoutMs: 240 },
          )
          pid = Number(readFileSync(pidFile, 'utf8').trim())
          expect(r.exitCode).toBe(0)
          expect(r.neverExited).toBeUndefined()
          expect(r.stderr).toBe('')
          expect(performance.now() - t0).toBeLessThan(2000)
        } finally {
          reap(pid)
        }
      })
    },
    15_000,
  )
})

describe('the stream runner reports a failed spawn', () => {
  test("the spawn error reaches the parent's stderr", () => {
    withTempDir((dir) => {
      const { result, stderr } = runProbe(dir, ON_NODE, [
        'report(seam.streamRunner("definitely-not-a-real-binary-c7").run([], { cwd: process.cwd() }));',
      ])
      expect(result).toEqual({
        exitCode: 1,
        neverExited: true,
        reason: 'spawn',
        error: expect.stringContaining('definitely-not-a-real-binary-c7'),
      })
      expect(stderr).toContain('definitely-not-a-real-binary-c7')
    })
  }, 20_000)
})

describe('managed kill() after exit', () => {
  test('does not signal the old pid', async () => {
    const h = managedProcessRunner('sh').run(['-c', 'exit 0'], { cwd: CWD })
    await h.exited
    const spy = vi.spyOn(process, 'kill')
    try {
      h.kill()
      expect(spy).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
    }
  })
})

describe('shellJoin and a first word containing "="', () => {
  test('quotes it so the shell does not read it as an assignment', () => {
    expect(shellJoin(['A=b', 'echo', 'x'])).toBe("'A=b' echo x")
    expect(shellJoin(['echo', 'A=b'])).toBe('echo A=b')
    const r = runShell(shellJoin(['A=b', 'echo', 'x']), { cwd: CWD })
    expect(r.stdout).not.toBe('x\n')
    expect(r.exitCode).not.toBe(0)
  })
})

describe('asAsync and a throwing sync runner', () => {
  test('rejects rather than throwing synchronously', async () => {
    const thrower: CommandRunner = {
      run: () => {
        throw new Error('sync boom')
      },
    }
    let pending: Promise<CommandResult> | undefined
    expect(() => {
      pending = asAsync(thrower).run([], { cwd: CWD })
    }).not.toThrow()
    expect(pending).toBeDefined()
    await expect(pending as Promise<CommandResult>).rejects.toThrow('sync boom')
  })
})

describe('the async runners resolve when spawn throws a system error', () => {
  // Linux only: one argument over MAX_ARG_STRLEN (128 KiB) fails the exec
  // with E2BIG, which Node's `spawn` throws rather than emitting as `error`.
  test.skipIf(process.platform !== 'linux')('an argument over the OS limit is spawn', async () => {
    const huge = 'x'.repeat(200_000)
    const expected = { exitCode: 1, neverExited: true, reason: 'spawn', stdout: '', stderr: '' }
    const plain = await spawnRunnerAsync('echo').run([huge], { cwd: CWD })
    expect(plain).toMatchObject(expected)
    expect(plain.error).toContain('E2BIG')
    const grouped = await spawnRunnerAsync('echo').run([huge], { cwd: CWD, processGroup: true })
    expect(grouped).toMatchObject(expected)
    const raw = await spawnRunnerBytesAsync('echo').run([huge], { cwd: CWD })
    expect(raw).toMatchObject({ ...expected, stdout: Buffer.alloc(0) })
  })
})

describe('a failed kill() is not a spawn failure', () => {
  // A child the parent may not signal (one that took another real uid, such
  // as `sudo`) makes `child.kill()` emit `error` with EPERM. Stand in for it
  // by making every `kill()` fail that way.
  const failKills = () =>
    vi.spyOn(ChildProcess.prototype, 'kill').mockImplementation(function (this: ChildProcess) {
      const e: NodeJS.ErrnoException = new Error('kill EPERM')
      Object.assign(e, { code: 'EPERM', errno: -1, syscall: 'kill' })
      this.emit('error', e)
      return false
    })

  // POSIX only: `sleep`.
  test.skipIf(process.platform === 'win32')(
    'an async timeout whose kill fails is still timeout',
    async () => {
      let pid = 0
      const spy = failKills()
      try {
        const r = await spawnRunnerAsync('sleep').run(['10'], {
          cwd: CWD,
          timeoutMs: 200,
          onSpawn: (p) => {
            pid = p
          },
        })
        expect(r).toMatchObject({ neverExited: true, reason: 'timeout' })
        expect(r.error).toBe('timed out after 200ms')
      } finally {
        spy.mockRestore()
        reap(pid)
      }
    },
    10_000,
  )

  // POSIX only: `sh` and `head`.
  test.skipIf(process.platform === 'win32')(
    'an async run past maxOutputBytes whose kill fails settles with the cap result',
    async () => {
      // No timeoutMs, so only the cap can settle the run while the child lives.
      let pid = 0
      const spy = failKills()
      try {
        const r = await spawnRunnerAsync('sh').run(
          ['-c', `head -c 5000 /dev/zero | tr '\\0' x; exec sleep 10`],
          {
            cwd: CWD,
            maxOutputBytes: 100,
            onSpawn: (p) => {
              pid = p
            },
          },
        )
        expect(r).toMatchObject({ exitCode: 1, neverExited: true, reason: 'output' })
        expect(r.stdout).toBe('x'.repeat(100))
        expect(r.error).toBe('stdout passed maxOutputBytes (100 bytes)')
      } finally {
        spy.mockRestore()
        reap(pid)
      }
    },
    10_000,
  )

  test.skipIf(process.platform === 'win32')(
    'a managed kill() that fails leaves the process running, and a later kill() ends it',
    async () => {
      const h = managedProcessRunner('sleep').run(['10'], { cwd: CWD })
      try {
        const spy = failKills()
        try {
          h.kill()
        } finally {
          spy.mockRestore()
        }
        const early = await Promise.race([
          h.exited,
          new Promise((r) => setTimeout(() => r('running'), 200)),
        ])
        expect(early).toBe('running')
        h.kill()
        expect(await h.exited).toMatchObject({ neverExited: true, reason: 'abort' })
      } finally {
        reap(h.pid)
      }
    },
    10_000,
  )
})

describe('mergedEnv on Windows', () => {
  // Windows matches variable names in any case, so an override must replace
  // the parent's variable whatever its spelling. Run the Windows rules on any
  // host by setting `process.platform`, with a variable of this test's own.
  function asWindows<T>(fn: () => T): T {
    const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
    Object.defineProperty(process, 'platform', { value: 'win32', configurable: true })
    process.env['Seam_Case_Var'] = 'parent'
    try {
      return fn()
    } finally {
      delete process.env['Seam_Case_Var']
      Object.defineProperty(process, 'platform', platform)
    }
  }
  const named = (env: NodeJS.ProcessEnv) =>
    Object.entries(env).filter(([k]) => k.toUpperCase() === 'SEAM_CASE_VAR')

  test('an undefined override unsets the parent variable in another case', () => {
    expect(asWindows(() => named(mergedEnv({ env: { SEAM_CASE_VAR: undefined } }).env))).toEqual([])
  })

  test('an override in another case replaces the parent variable', () => {
    expect(asWindows(() => named(mergedEnv({ env: { seam_case_var: 'x' } }).env))).toEqual([
      ['seam_case_var', 'x'],
    ])
  })

  test('with no override the parent variable is kept', () => {
    expect(asWindows(() => named(mergedEnv({}).env))).toEqual([['Seam_Case_Var', 'parent']])
  })
})
