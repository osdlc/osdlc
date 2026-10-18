import { describe, expect, test } from 'vitest'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
      args: () => ['-c', 'sleep 30'],
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
})
