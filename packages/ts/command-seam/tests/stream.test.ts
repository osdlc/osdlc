/**
 * The streaming runner. Real-spawn cases check that stdio is inherited. The
 * child reads its inherited stdin and writes to its inherited stdout and
 * stderr, so a wiring bug would show as the parent's own streams going
 * quiet, not as a wrong captured string. The fake case checks that a call
 * site can use the `StreamRunner` type with no real process, as the
 * `runChecked` tests in `seam.test.ts` do for `CommandRunner`.
 */

import { describe, expect, test, vi } from 'vitest'

import { streamRunner, type StreamResult, type StreamRunner } from '../src/index.ts'

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
    // The timeout also sets a signal (SIGKILL). It must print once, not twice.
    const written: string[] = []
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
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
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
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
    // With inherited stdio, this cannot read the child's stdout back. So the
    // child checks itself and reports success through its exit code, which
    // the streaming runner does report.
    const sh = streamRunner('sh')
    const r = sh.run(['-c', 'test "$T1_STREAM_PROBE" = "injected" && test -n "$HOME"'], {
      cwd: CWD,
      env: { T1_STREAM_PROBE: 'injected' },
    })
    expect(r.exitCode).toBe(0)
  })

  test('argv is never re-parsed as shell', () => {
    const sh = streamRunner('sh')
    // `$(echo pwned)` is passed as an argv element (`$1`), never as script
    // source. If it were parsed again, `$1` would hold the result "pwned"
    // instead of the literal string, and this comparison would fail.
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
