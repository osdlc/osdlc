import { describe, expect, test, vi } from 'vitest'
import { existsSync, readdirSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { antigravityAdapter } from '../src/adapters/antigravity.js'
import { customAdapter } from '../src/adapters/custom.js'
import { claudeAdapter } from '../src/adapters/claude.js'
import { callAgent, planCall } from '../src/run.js'

// Real-process runner tests via harmless system binaries — no agents, no
// network. The custom adapter is both the escape hatch under test and the
// vehicle for exercising the runner end to end.

const echoAdapter = customAdapter({
  name: 'echo',
  binary: '/bin/sh',
  args: (_spec, effectivePrompt) => ['-c', `printf '%s' "$1"`, 'sh', effectivePrompt],
})

const catAdapter = customAdapter({
  name: 'cat',
  binary: '/bin/cat',
  args: () => [],
  promptVia: 'stdin',
})

describe('callAgent', () => {
  test('runs a process and returns its output as text', async () => {
    const result = await callAgent(echoAdapter, { prompt: 'hello runner' })
    expect(result.ok).toBe(true)
    expect(result.exitCode).toBe(0)
    expect(result.text).toBe('hello runner')
    expect(result.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.planned.agent).toBe('echo')
  })

  test('stdin prompts flow through', async () => {
    const result = await callAgent(catAdapter, { prompt: 'via stdin' })
    expect(result.ok).toBe(true)
    expect(result.text).toBe('via stdin')
  })

  test('spec env reaches the child process', async () => {
    const envAdapter = customAdapter({
      name: 'env',
      binary: '/bin/sh',
      args: () => ['-c', 'printf \'%s\' "$AGENT_CALL_TEST"'],
    })
    const result = await callAgent(envAdapter, {
      prompt: 'unused',
      env: { AGENT_CALL_TEST: 'it works' },
    })
    expect(result.text).toBe('it works')
  })

  test('nonzero exit produces a structured error, not a throw', async () => {
    const failing = customAdapter({
      name: 'fail',
      binary: '/bin/sh',
      args: () => ['-c', 'echo oops >&2; exit 3'],
    })
    const result = await callAgent(failing, { prompt: 'x' })
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBe(3)
    expect(result.error?.reason).toBe('nonzero-exit')
    expect(result.error?.detail).toContain('oops')
  })

  test('missing binary produces spawn-failed', async () => {
    const missing = customAdapter({
      name: 'missing',
      binary: '/nonexistent/agent-call-test-binary',
      args: () => [],
    })
    const result = await callAgent(missing, { prompt: 'x' })
    expect(result.ok).toBe(false)
    expect(result.exitCode).toBeNull()
    expect(result.error?.reason).toBe('spawn-failed')
  })

  test('timeout kills the process', async () => {
    const sleeper = customAdapter({
      name: 'sleeper',
      binary: '/bin/sh',
      args: () => ['-c', 'sleep 10'],
    })
    const started = Date.now()
    const result = await callAgent(sleeper, { prompt: 'x', timeoutMs: 300 })
    expect(result.ok).toBe(false)
    expect(result.error?.reason).toBe('timeout')
    expect(Date.now() - started).toBeLessThan(10_000)
  })

  test('an already-aborted signal keeps the process from running', async () => {
    const marker = join(tmpdir(), `agent-call-abort-${process.pid}-${Date.now()}`)
    const toucher = customAdapter({
      name: 'toucher',
      binary: '/bin/sh',
      args: () => ['-c', `printf ran > "${marker}"`],
    })
    const controller = new AbortController()
    controller.abort()
    try {
      const result = await callAgent(toucher, { prompt: 'x' }, { signal: controller.signal })
      expect(result.ok).toBe(false)
      expect(result.error?.reason).toBe('timeout')
      expect(existsSync(marker)).toBe(false)
    } finally {
      await rm(marker, { force: true })
    }
  })

  test('temp files are materialized, substituted, and read back', async () => {
    // The claude adapter doesn't use temp files; build a bespoke planned call
    // through a custom adapter that echoes a temp file path.
    const tmpAdapter = {
      ...catAdapter,
      name: 'tmp',
      plan: (spec: Parameters<typeof catAdapter.plan>[0]) => {
        const planned = catAdapter.plan(spec)
        return {
          ...planned,
          argv: [
            '/bin/sh',
            '-c',
            `cat "$1" && printf 'extra' > "$2"`,
            'sh',
            '__AGENT_CALL_TMP__/in.txt',
            '__AGENT_CALL_TMP__/out.txt',
          ],
          stdin: undefined,
          tempFiles: [
            { name: 'in.txt', content: 'from temp file' },
            { name: 'out.txt', content: '', readBack: true },
          ],
        }
      },
    }
    const result = await callAgent(tmpAdapter, { prompt: 'unused' })
    expect(result.ok).toBe(true)
    expect(result.text).toBe('from temp file')
    expect(result.raw.files?.['out.txt']).toBe('extra')
  })

  test('multi-byte characters spanning a read boundary survive', async () => {
    // The child writes the first two bytes of an emoji, pauses, then the rest,
    // so the UTF-8 sequence is guaranteed to straddle two reads — decoding each
    // chunk independently replaces it with U+FFFD.
    const split = customAdapter({
      name: 'split',
      binary: '/bin/sh',
      args: () => ['-c', "printf 'a\\360\\237'; sleep 0.1; printf '\\231\\202b'"],
    })
    const result = await callAgent(split, { prompt: 'unused' })
    expect(result.text).toBe('a\u{1F642}b')
  })

  test('captureConversation lifts a transcript', async () => {
    const result = await callAgent(echoAdapter, { prompt: 'hi' }, { captureConversation: true })
    // The custom adapter has no toConversation; result stays undefined.
    expect(result.conversation).toBeUndefined()
  })
})

describe('planCall', () => {
  test('is pure and side-effect free', () => {
    const planned = planCall(claudeAdapter(), {
      prompt: 'x',
      permissions: { mode: 'read-only' },
    })
    expect(planned.argv[0]).toBe('claude')
    expect(planned.notes.length).toBeGreaterThan(0)
  })
})

describe('child stdin', () => {
  test('a child that exits without draining stdin does not crash the host', async () => {
    // Stands in for an agent CLI that rejects its flags, is unauthenticated,
    // or prints usage and exits: it never reads stdin, so a prompt larger
    // than the pipe buffer makes the write fail with EPIPE.
    const deaf = customAdapter({
      name: 'deaf',
      binary: '/bin/sh',
      args: () => ['-c', 'exit 2'],
      promptVia: 'stdin',
    })
    const result = await callAgent(deaf, { prompt: 'x'.repeat(1_000_000) })
    expect(result.ok).toBe(false)
    expect(result.error?.reason).toBe('nonzero-exit')
    expect(result.exitCode).toBe(2)
  })

  test('a prompt the child never finished reading is recorded, not dropped', async () => {
    // Exits 0 after five bytes, so nothing else in the result marks the run as
    // wrong: without `stdinError` the truncated prompt leaves no trace at all.
    const partial = customAdapter({
      name: 'partial',
      binary: '/bin/sh',
      args: () => ['-c', 'head -c 5 >/dev/null; exit 0'],
      promptVia: 'stdin',
    })
    const result = await callAgent(partial, { prompt: 'x'.repeat(1_000_000) })
    expect(result.exitCode).toBe(0)
    expect(result.raw.stdinError).toContain('EPIPE')
  })

  test('a prompt the child read in full leaves no stdin error', async () => {
    const reader = customAdapter({
      name: 'reader',
      binary: '/bin/sh',
      args: () => ['-c', 'cat >/dev/null; exit 0'],
      promptVia: 'stdin',
    })
    const result = await callAgent(reader, { prompt: 'x'.repeat(1_000_000) })
    expect(result.exitCode).toBe(0)
    expect(result.raw.stdinError).toBeUndefined()
  })

  test('an abort mid-run is reported as aborted by the caller', async () => {
    const sleeper = customAdapter({
      name: 'sleeper',
      binary: '/bin/sh',
      args: () => ['-c', 'sleep 30'],
    })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 200)
    const result = await callAgent(sleeper, { prompt: 'x' }, { signal: controller.signal })
    expect(result.ok).toBe(false)
    expect(result.error).toEqual({ reason: 'timeout', detail: 'aborted by the caller' })
  })

  test('a timeout names the deadline', async () => {
    const sleeper = customAdapter({
      name: 'sleeper',
      binary: '/bin/sh',
      args: () => ['-c', 'sleep 30'],
    })
    const result = await callAgent(sleeper, { prompt: 'x', timeoutMs: 200 })
    expect(result.error?.detail).toBe('killed after 200ms')
  })

  test('a throwing toConversation marks the result failed', async () => {
    const throwing = {
      ...echoAdapter,
      toConversation: () => {
        throw new Error('bad transcript')
      },
    }
    const result = await callAgent(throwing, { prompt: 'x' }, { captureConversation: true })
    expect(result.ok).toBe(false)
    expect(result.error?.reason).toBe('agent-error')
    expect(result.error?.detail).toContain('bad transcript')
  })

  test('a nonzero exit keeps the parser detail and adds the exit code and stderr', async () => {
    const adapter = antigravityAdapter({ binary: '/bin/sh' })
    const planned = adapter.plan({ prompt: 'x', output: { format: 'json' } })
    const failing = {
      ...adapter,
      plan: () => ({
        ...planned,
        argv: ['/bin/sh', '-c', 'echo "Invalid API key" >&2; exit 1'],
      }),
    }
    const result = await callAgent(failing, { prompt: 'x' })
    expect(result.error?.reason).toBe('nonzero-exit')
    expect(result.error?.detail).toContain('exited 1')
    expect(result.error?.detail).toContain('no parseable envelope')
    expect(result.error?.detail).toContain('Invalid API key')
  })

  test('a nonzero exit with empty stderr leaves no trailing colon', async () => {
    const quiet = customAdapter({ name: 'quiet', binary: '/bin/sh', args: () => ['-c', 'exit 2'] })
    const result = await callAgent(quiet, { prompt: 'x' })
    expect(result.error?.detail).toBe('/bin/sh exited 2')
  })

  test('a timeout plus an abort starts one kill timer', async () => {
    const spy = vi.spyOn(globalThis, 'setTimeout')
    try {
      const stubborn = customAdapter({
        name: 'stubborn',
        binary: '/bin/sh',
        args: () => ['-c', "trap '' TERM; sleep 1"],
      })
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 400)
      await callAgent(stubborn, { prompt: 'x', timeoutMs: 100 }, { signal: controller.signal })
      expect(spy.mock.calls.filter(([, ms]) => ms === 5_000)).toHaveLength(1)
    } finally {
      spy.mockRestore()
    }
  })

  test('a timeout followed by an abort is still reported as the timeout', async () => {
    const stubborn = customAdapter({
      name: 'stubborn',
      binary: '/bin/sh',
      args: () => ['-c', "trap '' TERM; sleep 3"],
    })
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 600)
    const result = await callAgent(
      stubborn,
      { prompt: 'x', timeoutMs: 150 },
      { signal: controller.signal },
    )
    expect(result.error).toEqual({ reason: 'timeout', detail: 'killed after 150ms' })
    expect(result.raw.cutShortBy).toBe('timeout')
  })

  describe('temp files', () => {
    const withFiles = (tempFiles: { name: string; content: string }[]) => ({
      ...echoAdapter,
      plan: (spec: Parameters<typeof echoAdapter.plan>[0]) => ({
        ...echoAdapter.plan(spec),
        tempFiles,
      }),
    })
    // Other test files run in parallel and make their own agent-call-* dirs, so
    // look for a dir holding this test's marker file, not for any new dir.
    const leftovers = (marker: string): string[] =>
      readdirSync(tmpdir())
        .filter((n) => n.startsWith('agent-call-'))
        .filter((n) => existsSync(join(tmpdir(), n, marker)))

    test('a failed write removes the temp directory', async () => {
      const marker = `leak-check-${process.pid}.txt`
      const adapter = withFiles([
        { name: marker, content: 'a' },
        { name: '.', content: 'b' }, // passes the name check; writeFile hits the directory itself
      ])
      await expect(callAgent(adapter, { prompt: 'x' })).rejects.toThrow(/EISDIR/)
      expect(leftovers(marker)).toEqual([])
    })

    test.each(['', '..', 'a/b', 'a\\b', '../x'])('refuses the name %j', async (name) => {
      const marker = `leak-check-${process.pid}.txt`
      const adapter = withFiles([
        { name: marker, content: 'a' },
        { name, content: 'x' },
      ])
      await expect(callAgent(adapter, { prompt: 'x' })).rejects.toThrow(/plain file name/)
      expect(leftovers(marker)).toEqual([])
    })
  })
})
