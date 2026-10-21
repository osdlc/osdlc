import { describe, expect, test, vi } from 'vitest'

import {
  asAsync,
  CommandFailed,
  failureText,
  firstLine,
  parseJsonResult,
  ran,
  runJson,
  runJsonAsync,
  spawnRunner,
  stderrOrError,
  withDefaults,
  type CommandResult,
  type CommandRunner,
  type ManagedProcessExit,
  type StreamResult,
} from '../index.ts'

const res = (over: Partial<CommandResult>): CommandResult => ({
  exitCode: 0,
  stdout: '',
  stderr: '',
  ...over,
})
const fake = (r: CommandResult): CommandRunner => ({ run: () => r })
const opts = { cwd: process.cwd() }

describe('ran', () => {
  test('true only for a started, exit-0 run', () => {
    expect(ran(res({}))).toBe(true)
    expect(ran(res({ exitCode: 2 }))).toBe(false)
    expect(ran(res({ exitCode: 0, neverExited: true }))).toBe(false)
    expect(ran(res({ exitCode: 1, neverExited: true }))).toBe(false)
  })

  test('takes stream and managed results too', () => {
    const streamed: StreamResult = { exitCode: 0 }
    const failed: StreamResult = {
      exitCode: 1,
      neverExited: true,
      reason: 'spawn',
      error: 'spawn x ENOENT',
    }
    const managed: ManagedProcessExit = { exitCode: 0, signal: null }
    expect(ran(streamed)).toBe(true)
    expect(ran(failed)).toBe(false)
    expect(ran(managed)).toBe(true)
  })
})

describe('failureText', () => {
  test('prefers stderr, falls back to stdout, then exit code', () => {
    expect(failureText(res({ exitCode: 1, stderr: ' bad \n', stdout: 'out' }))).toBe('bad')
    expect(failureText(res({ exitCode: 1, stdout: ' said so\n' }))).toBe('said so')
    expect(failureText(res({ exitCode: 7, stderr: '  \n' }))).toBe('exit 7')
  })

  test('both: true joins both trimmed streams, stderr first, dropping empty ones', () => {
    expect(
      failureText(res({ stderr: ' failed \n', stdout: '\nhook said no\n' }), { both: true }),
    ).toBe('failed\nhook said no')
    expect(failureText(res({ stdout: 'only out' }), { both: true })).toBe('only out')
    expect(failureText(res({ exitCode: 4 }), { both: true })).toBe('')
  })

  test("a never-exited result gives the runner's message", () => {
    const spawn = spawnRunner('definitely-not-a-real-binary-ft').run([], opts)
    expect(spawn.stderr).toBe('')
    expect(failureText(spawn)).toBe(spawn.error!)
    expect(failureText(spawn, { both: true })).toBe(spawn.error!)

    const timeout = res({
      exitCode: 1,
      neverExited: true,
      reason: 'timeout',
      stdout: 'partial\n',
      error: 'timed out after 200ms',
    })
    expect(failureText(timeout)).toBe('timed out after 200ms')
    expect(failureText(timeout, { both: true })).toBe('timed out after 200ms\npartial')
  })

  test("the child's own stderr wins over error", () => {
    const r = res({ exitCode: 1, neverExited: true, stderr: ' working \n', error: 'timed out' })
    expect(failureText(r)).toBe('working')
    expect(failureText(r, { both: true })).toBe('working')
  })
})

describe('stderrOrError', () => {
  test("trimmed stderr, else the trimmed error, else ''", () => {
    expect(stderrOrError(res({ stderr: ' bad \n', error: 'timed out' }))).toBe('bad')
    expect(stderrOrError(res({ stderr: '  \n', error: ' timed out ' }))).toBe('timed out')
    expect(stderrOrError(res({ stdout: 'out' }))).toBe('')
  })
})

describe('CommandFailed on a never-exited result', () => {
  test("message and detail carry the runner's message", () => {
    const spawn = spawnRunner('definitely-not-a-real-binary-cf').run(['x'], opts)
    const e = new CommandFailed(['x'], spawn)
    expect(e.message).toBe(`command failed (exit 1): x\n${spawn.error!}`)
    expect(e.detail).toBe(spawn.error!)
  })

  test('a timeout names the timeout', () => {
    const timeout = res({
      exitCode: 1,
      neverExited: true,
      reason: 'timeout',
      error: 'timed out after 200ms',
    })
    const e = new CommandFailed(['sleep', '10'], timeout)
    expect(e.message).toBe('command failed (exit 1): sleep 10\ntimed out after 200ms')
    expect(e.detail).toBe('timed out after 200ms')
  })

  test('runJson reports the spawn message', () => {
    const j = runJson(spawnRunner('definitely-not-a-real-binary-rj'), [], opts)
    expect(j.ok).toBe(false)
    if (!j.ok) expect(j.message).toBe(j.result.error!)
  })
})

describe('firstLine', () => {
  test('first non-blank trimmed line, else fallback', () => {
    expect(firstLine('\n  a  \nb')).toBe('a')
    expect(firstLine('  \n')).toBe('')
    expect(firstLine('', 'unknown failure')).toBe('unknown failure')
  })
})

describe('runJson', () => {
  test('parses stdout of a clean run', () => {
    const r = runJson<{ a: number }>(fake(res({ stdout: '{"a":1}' })), [], opts)
    expect(r.ok && r.value.a).toBe(1)
  })

  test('non-zero exit and never-exited are failed, carrying the failure text', () => {
    const bad = runJson(fake(res({ exitCode: 3, stderr: 'boom' })), [], opts)
    expect(bad).toMatchObject({ ok: false, reason: 'failed', message: 'boom' })
    const gone = runJson(fake(res({ neverExited: true, stdout: '{}' })), [], opts)
    expect(gone).toMatchObject({ ok: false, reason: 'failed' })
  })

  test('bad JSON is unparseable, not thrown', () => {
    const r = runJson(fake(res({ stdout: 'nope' })), [], opts)
    expect(r).toMatchObject({ ok: false, reason: 'unparseable' })
  })

  test('tolerateLeadingLog skips log lines before the first { or [', () => {
    const out = 'INFO starting\nwarn: x\n[1,2]\n'
    expect(runJson(fake(res({ stdout: out })), [], opts).ok).toBe(false)
    const r = runJson<number[]>(fake(res({ stdout: out })), [], {
      ...opts,
      tolerateLeadingLog: true,
    })
    expect(r.ok && r.value).toEqual([1, 2])
  })

  test('tolerateLeadingLog skips a [-prefixed log line, and gives up cleanly with no JSON', () => {
    const tol = { ...opts, tolerateLeadingLog: true }
    const logged = runJson<{ a: number }>(
      fake(res({ stdout: '[INFO] starting\n{"a":1}\n' })),
      [],
      tol,
    )
    expect(logged.ok && logged.value.a).toBe(1)
    const none = runJson(fake(res({ stdout: 'just logs\nmore' })), [], tol)
    expect(none).toMatchObject({ ok: false, reason: 'unparseable' })
  })

  test('tolerateLeadingLog parses at most twice, however many lines start with [ or {', () => {
    // Each `[` line's suffix parses deep into the JSON before failing, so
    // trying every candidate was quadratic in the number of such lines.
    const json = JSON.stringify({ items: [[1], { s: '"[{\\' }], more: '}]' })
    const stdout = '[\n{\n[INFO] x\n'.repeat(500) + json + '\n'
    const parse = vi.spyOn(JSON, 'parse')
    try {
      const r = runJson(fake(res({ stdout })), [], { ...opts, tolerateLeadingLog: true })
      expect(r.ok && r.value).toEqual(JSON.parse(json))
      expect(parse).toHaveBeenCalledTimes(3) // two in runJson, one above
    } finally {
      parse.mockRestore()
    }
  })

  test('tolerateLeadingLog takes the last value of several, needs JSON to the end, and takes CRLF', () => {
    const tol = { ...opts, tolerateLeadingLog: true }
    const take = (stdout: string) => runJson(fake(res({ stdout })), [], tol)
    expect(take('log\n[1]\n[2]\n')).toMatchObject({ ok: true, value: [2] })
    expect(take('log\n{"a":1}\ndone\n')).toMatchObject({ reason: 'unparseable' })
    expect(take('[\n[\n')).toMatchObject({ reason: 'unparseable' })
    expect(take('log\r\n{"a":"x"}\r\n')).toMatchObject({ ok: true, value: { a: 'x' } })
  })

  test('tolerateLeadingLog ignores brackets inside strings, and takes a bare \\r', () => {
    const tol = { ...opts, tolerateLeadingLog: true }
    const take = (stdout: string) => runJson(fake(res({ stdout })), [], tol)
    expect(take('log\n{"s":"]"}\n')).toMatchObject({ ok: true, value: { s: ']' } })
    // A log line's open quote and bracket do not reach the next line.
    expect(take('log\n[INFO] "open [\n{"a":"}"}\n')).toMatchObject({ ok: true, value: { a: '}' } })
    expect(take('log\r{"a":1}')).toMatchObject({ ok: true, value: { a: 1 } })
  })

  test('tolerateLeadingLog does not count U+2028 or U+2029 as a line break', () => {
    const tol = { ...opts, tolerateLeadingLog: true }
    for (const sep of ['\u2028', '\u2029']) {
      const r = runJson(fake(res({ stdout: `log${sep}{"a":1}` })), [], tol)
      expect(r).toMatchObject({ ok: false, reason: 'unparseable' })
    }
  })

  test('does not forward tolerateLeadingLog to the runner', () => {
    let seen: object = {}
    const spy: CommandRunner = {
      run: (_a, o) => ((seen = o), res({ stdout: '1' })),
    }
    runJson(spy, [], { ...opts, tolerateLeadingLog: true })
    expect('tolerateLeadingLog' in seen).toBe(false)
  })

  test('async runner matches', async () => {
    const r = await runJsonAsync<{ b: string }>(
      asAsync(fake(res({ stdout: '{"b":"x"}' }))),
      [],
      opts,
    )
    expect(r.ok && r.value.b).toBe('x')
    const f = await runJsonAsync(asAsync(fake(res({ exitCode: 1 }))), [], opts)
    expect(f).toMatchObject({ ok: false, reason: 'failed', message: 'exit 1' })
  })

  test('parseJsonResult works on a finished result', () => {
    expect(parseJsonResult(res({ stdout: 'null' })).ok).toBe(true)
  })
})

describe('runJson parse', () => {
  const positive = (v: unknown): number => {
    if (typeof v !== 'number' || v <= 0) throw new RangeError(`not positive: ${String(v)}`)
    return v
  }

  test('returns what parse returns', () => {
    const r = runJson(fake(res({ stdout: '{"n":2}' })), [], {
      ...opts,
      parse: (v) => (v as { n: number }).n * 10,
    })
    expect(r.ok && r.value).toBe(20)
  })

  test('a throw from parse is invalid, with the error as cause', () => {
    const r = runJson(fake(res({ stdout: '-1' })), [], { ...opts, parse: positive })
    expect(r).toMatchObject({
      ok: false,
      reason: 'invalid',
      message: 'stdout JSON was rejected: not positive: -1',
    })
    expect(!r.ok && r.reason === 'invalid' && r.cause).toBeInstanceOf(RangeError)
  })

  test('a non-Error throw is stringified into the message', () => {
    const r = runJson(fake(res({ stdout: '1' })), [], {
      ...opts,
      parse: () => {
        throw 'nope'
      },
    })
    expect(r).toMatchObject({
      reason: 'invalid',
      message: 'stdout JSON was rejected: nope',
      cause: 'nope',
    })
  })

  test('parse is not called when the run failed or stdout is not JSON', () => {
    let calls = 0
    const parse = (v: unknown) => (calls++, v)
    expect(runJson(fake(res({ exitCode: 1 })), [], { ...opts, parse }).ok).toBe(false)
    expect(runJson(fake(res({ stdout: 'x' })), [], { ...opts, parse })).toMatchObject({
      reason: 'unparseable',
    })
    expect(calls).toBe(0)
  })

  test('parse runs after tolerateLeadingLog, and is not forwarded to the runner', () => {
    let seen: object = {}
    const spy: CommandRunner = {
      run: (_a, o) => ((seen = o), res({ stdout: 'log line\n5' })),
    }
    const r = runJson(spy, [], { ...opts, tolerateLeadingLog: true, parse: positive })
    expect(r).toMatchObject({ ok: false, reason: 'unparseable' })
    const ok = runJson(fake(res({ stdout: 'log\n[5]' })), [], {
      ...opts,
      tolerateLeadingLog: true,
      parse: (v) => positive((v as number[])[0]),
    })
    expect(ok.ok && ok.value).toBe(5)
    expect('parse' in seen).toBe(false)
  })

  test('a parse that returns a promise is invalid, and its rejection is handled', async () => {
    let unhandled = 0
    const onUnhandled = () => unhandled++
    process.on('unhandledRejection', onUnhandled)
    try {
      const r = runJson(fake(res({ stdout: '1' })), [], {
        ...opts,
        parse: () => Promise.reject(new Error('late')),
      })
      expect(r).toMatchObject({
        ok: false,
        reason: 'invalid',
        message: 'stdout JSON was rejected: parse returned a promise; it must be sync',
      })
      expect(!r.ok && r.reason === 'invalid' && r.cause).toBeInstanceOf(Promise)
      await new Promise((resolve) => setTimeout(resolve, 10))
      expect(unhandled).toBe(0)
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  test('async runner and parseJsonResult take parse too', async () => {
    const a = await runJsonAsync(asAsync(fake(res({ stdout: '0' }))), [], {
      ...opts,
      parse: positive,
    })
    expect(a).toMatchObject({ ok: false, reason: 'invalid' })
    expect(parseJsonResult(res({ stdout: '3' }), { parse: positive })).toMatchObject({
      ok: true,
      value: 3,
    })
  })
})

describe('runJson okExitCodes', () => {
  test('an accepted non-zero exit is parsed', () => {
    const r = runJson(fake(res({ exitCode: 1, stdout: '{"a":1}' })), [], {
      ...opts,
      okExitCodes: [0, 1],
    })
    expect(r).toMatchObject({ ok: true, value: { a: 1 } })
  })

  test('an exit not in the list is failed, and 0 counts only when listed', () => {
    const two = runJson(fake(res({ exitCode: 2, stdout: '{}' })), [], {
      ...opts,
      okExitCodes: [0, 1],
    })
    expect(two).toMatchObject({ ok: false, reason: 'failed' })
    const zero = parseJsonResult(res({ stdout: '{}' }), { okExitCodes: [1] })
    expect(zero).toMatchObject({ ok: false, reason: 'failed' })
  })

  test('a run that never exited is failed whatever its stand-in code', () => {
    const r = parseJsonResult(
      res({ exitCode: 1, neverExited: true, reason: 'spawn', stdout: '{}' }),
      {
        okExitCodes: [1],
      },
    )
    expect(r).toMatchObject({ ok: false, reason: 'failed' })
  })

  test('an accepted exit still has to parse and pass parse', () => {
    const accept = { okExitCodes: [1] }
    expect(parseJsonResult(res({ exitCode: 1, stdout: 'Error' }), accept)).toMatchObject({
      ok: false,
      reason: 'unparseable',
    })
    const reject = () => {
      throw new Error('npm error')
    }
    expect(
      parseJsonResult(res({ exitCode: 1, stdout: '{"error":{}}' }), { ...accept, parse: reject }),
    ).toMatchObject({ ok: false, reason: 'invalid' })
  })

  test('is not forwarded to the runner, and works on the async form', async () => {
    let seen: object = {}
    const spy: CommandRunner = { run: (_a, o) => ((seen = o), res({ exitCode: 1, stdout: '1' })) }
    runJson(spy, [], { ...opts, okExitCodes: [1] })
    expect('okExitCodes' in seen).toBe(false)
    const a = await runJsonAsync(asAsync(spy), [], { ...opts, okExitCodes: [1] })
    expect(a).toMatchObject({ ok: true, value: 1 })
  })
})

describe('runJson with a runner that needs no options', () => {
  const bound = withDefaults(fake(res({ stdout: '{"n":7}' })), { cwd: '/repo' })

  test('an explicit type compiles with argv alone, or with per-call options', async () => {
    const plain = runJson<{ n: number }>(bound, [])
    const capped = runJson<{ n: number }>(bound, [], { timeoutMs: 5 })
    const both = await runJsonAsync<{ n: number }>(withDefaults(asAsync(bound), { cwd: '/' }), [])
    expect(plain.ok && plain.value.n).toBe(7)
    expect(capped.ok && capped.value.n).toBe(7)
    expect(both.ok && both.value.n).toBe(7)
  })

  test('parse still types the value', () => {
    const r = runJson(bound, [], { parse: (v) => (v as { n: number }).n })
    const n: number = r.ok ? r.value : 0
    expect(n).toBe(7)
  })

  test('a runner that still needs cwd does not match (type level)', () => {
    const _unused = () => {
      // @ts-expect-error cwd is required on a plain runner
      runJson<{ n: number }>(fake(res({})), [])
      // @ts-expect-error cwd is required when only timeoutMs is bound
      runJson<{ n: number }>(withDefaults(fake(res({})), { timeoutMs: 5 }), [])
      // @ts-expect-error the same for the async form
      void runJsonAsync<{ n: number }>(asAsync(fake(res({}))), [])
    }
    expect(typeof _unused).toBe('function')
  })
})
