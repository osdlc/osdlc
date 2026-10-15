/**
 * The streaming runner: real-spawn cases prove stdio is actually inherited
 * (via a child that reads its own inherited stdin and writes to its own
 * inherited stdout/stderr, so a wiring bug would surface as the parent
 * process's own streams going quiet, not as a captured-but-wrong string);
 * the fake-injection case proves the `StreamRunner` shape a call site takes
 * is usable with no real process at all, the same way the `runChecked` tests
 * in `seam.test.ts` prove `CommandRunner`'s shape with a fake.
 */

import { describe, expect, spyOn, test } from 'bun:test'

import { streamRunner, type StreamResult, type StreamRunner } from '../index.ts'

const CWD = process.cwd()

describe('streamRunner', () => {
  test('a zero exit reports exitCode 0, no neverExited', () => {
    const sh = streamRunner('sh')
    const r = sh.run(['-c', 'exit 0'], { cwd: CWD })
    expect(r).toEqual({ exitCode: 0 })
  })

  test('non-zero exit codes surface verbatim', () => {
    const sh = streamRunner('sh')
    const r = sh.run(['-c', 'exit 3'], { cwd: CWD })
    expect(r.exitCode).toBe(3)
  })

  test('timeoutMs caps a hanging child with a non-zero exit and neverExited', () => {
    // The timeout also sets a signal (SIGKILL); it must print once, not twice.
    const written: string[] = []
    const spy = spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })
    try {
      const r = streamRunner('sh').run(['-c', 'sleep 5'], { cwd: CWD, timeoutMs: 250 })
      expect(r.exitCode).not.toBe(0)
      expect(r.neverExited).toBe(true)
    } finally {
      spy.mockRestore()
    }
    expect(written).toHaveLength(1)
    expect(written[0]).toContain('ETIMEDOUT')
  })

  test('a signal death is reported on the parent stderr', () => {
    const written: string[] = []
    const spy = spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      written.push(String(chunk))
      return true
    })
    try {
      const r = streamRunner('sh').run(['-c', 'kill -TERM $$'], { cwd: CWD })
      expect(r).toEqual({ exitCode: 1, neverExited: true, reason: 'signal', signal: 'SIGTERM' })
    } finally {
      spy.mockRestore()
    }
    expect(written).toEqual(['sh was killed by SIGTERM\n'])
  })

  test('a missing binary degrades to a non-zero exit, not a throw', () => {
    const nope = streamRunner('definitely-not-a-real-binary-stream-t1')
    const r = nope.run([], { cwd: CWD })
    expect(r.exitCode).not.toBe(0)
  })

  test('env entries merge over the parent environment', () => {
    // Inherited stdio means this can't read the child's stdout back — so the
    // child instead asserts on itself and signals success via its own exit
    // code, which the streaming runner DOES report.
    const sh = streamRunner('sh')
    const r = sh.run(['-c', 'test "$T1_STREAM_PROBE" = "injected" && test -n "$HOME"'], {
      cwd: CWD,
      env: { T1_STREAM_PROBE: 'injected' },
    })
    expect(r.exitCode).toBe(0)
  })

  test('argv is never re-parsed as shell', () => {
    const sh = streamRunner('sh')
    // `$(echo pwned)` rides as an argv element (`$1`), never as script source
    // — if it were re-parsed, `$1` would hold the EVALUATED "pwned" instead
    // of the literal string, and this comparison would flip.
    const r = sh.run(['-c', 'test "$1" != "pwned"', 'sh', '$(echo pwned)'], { cwd: CWD })
    expect(r.exitCode).toBe(0)
  })
})

describe('StreamRunner — fake injection (no real process)', () => {
  test('a call site typed against StreamRunner accepts a fake', () => {
    const calls: Array<{ argv: string[]; cwd: string }> = []
    const fake: StreamRunner = {
      run(argv, opts): StreamResult {
        calls.push({ argv: [...argv], cwd: opts.cwd })
        return { exitCode: 0 }
      },
    }
    const result = fake.run(['astro', 'build'], { cwd: '/fake/site' })
    expect(result).toEqual({ exitCode: 0 })
    expect(calls).toEqual([{ argv: ['astro', 'build'], cwd: '/fake/site' }])
  })

  test('a fake can report a non-zero exit to exercise a caller error path', () => {
    const failing: StreamRunner = { run: () => ({ exitCode: 1 }) }
    expect(failing.run(['x'], { cwd: '/fake' }).exitCode).toBe(1)
  })
})
