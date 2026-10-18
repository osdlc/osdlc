/** The agreed API shape: a frozen effort roster, an open `CallError.reason`, `CallOptions` that accept `undefined`. */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'
import ts from 'typescript'

import { EFFORT_LEVELS } from '../src/models.js'
import { callAgent, type CallError, type CallOptions } from '../src/run.js'
import { customAdapter } from '../src/adapters/custom.js'

describe('rosters', () => {
  test('EFFORT_LEVELS is frozen and typed readonly', () => {
    expect(Object.isFrozen(EFFORT_LEVELS)).toBe(true)
    // @ts-expect-error a readonly tuple has no push
    expect(() => EFFORT_LEVELS.push('extreme')).toThrow(TypeError)
    expect(() => {
      // @ts-expect-error a readonly tuple cannot be assigned to
      EFFORT_LEVELS[0] = 'extreme'
    }).toThrow(TypeError)
  })
})

describe('CallError', () => {
  test('the README says the reasons are open', () => {
    const readme = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf-8')
    expect(readme).toContain('**The set of reasons is open.**')
  })

  test('every reason a run produces is one of the four documented ones', async () => {
    const seen = new Set<CallError['reason']>()
    const exits = customAdapter({
      name: 'x',
      binary: 'node',
      args: () => ['-e', 'process.exit(3)'],
    })
    const gone = customAdapter({ name: 'x', binary: 'no-such-cli-xyz', args: () => [] })
    const slow = customAdapter({
      name: 'x',
      binary: 'node',
      args: () => ['-e', 'setTimeout(()=>{},30000)'],
    })
    const reports = customAdapter({
      name: 'x',
      binary: 'node',
      args: () => ['-e', ''],
      parse: () => ({ text: '', isError: true }),
    })
    for (const [adapter, timeoutMs] of [
      [exits, undefined],
      [gone, undefined],
      [slow, 150],
      [reports, undefined],
    ] as const) {
      const result = await callAgent(adapter, { prompt: 'x', timeoutMs })
      seen.add(result.error!.reason)
    }
    expect([...seen].sort()).toEqual(['agent-error', 'nonzero-exit', 'spawn-failed', 'timeout'])
  })

  test('a child killed by a signal is nonzero-exit with the signal named, not spawn-failed', async () => {
    const killed = customAdapter({
      name: 'x',
      binary: 'node',
      args: () => ['-e', "process.kill(process.pid, 'SIGKILL')"],
    })
    const result = await callAgent(killed, { prompt: 'x' })
    expect(result.ok).toBe(false)
    expect(result.error?.reason).toBe('nonzero-exit')
    expect(result.error?.detail).toContain('SIGKILL')
  })

  test('a parser that throws resolves agent-error and keeps the raw output', async () => {
    const adapter = customAdapter({
      name: 'x',
      binary: 'node',
      args: () => ['-e', "console.log('out')"],
      parse: () => {
        throw new Error('bad parse')
      },
    })
    const result = await callAgent(adapter, { prompt: 'x' })
    expect(result.ok).toBe(false)
    expect(result.error?.reason).toBe('agent-error')
    expect(result.error?.detail).toContain('parser threw')
    expect(result.error?.detail).toContain('bad parse')
    expect(result.raw.stdout.trim()).toBe('out')
  })
})

describe('CallOptions', () => {
  test('optional fields accept undefined, as the spec types do', async () => {
    const options: CallOptions = { captureConversation: undefined, signal: undefined }
    const adapter = customAdapter({
      name: 'x',
      binary: 'node',
      args: () => ['-e', 'console.log(1)'],
    })
    const result = await callAgent(adapter, { prompt: 'x' }, options)
    expect(result.ok).toBe(true)
    expect(result.conversation).toBeUndefined()
  })

  test('under exactOptionalPropertyTypes, every field accepts undefined', () => {
    const dir = mkdtempSync(join(tmpdir(), 'agent-call-strict-'))
    try {
      const fixture = join(dir, 'fixture.ts')
      const runModule = join(import.meta.dirname, '..', 'src', 'run.js')
      writeFileSync(
        fixture,
        [
          `import type { CallOptions } from ${JSON.stringify(runModule)}`,
          'export const options: CallOptions = { captureConversation: undefined, signal: undefined }',
        ].join('\n'),
      )
      const program = ts.createProgram([fixture], {
        strict: true,
        exactOptionalPropertyTypes: true,
        noEmit: true,
        module: ts.ModuleKind.NodeNext,
        moduleResolution: ts.ModuleResolutionKind.NodeNext,
        target: ts.ScriptTarget.ES2023,
        skipLibCheck: true,
      })
      const diagnostics = program
        .getSemanticDiagnostics(program.getSourceFile(fixture))
        .map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'))
      expect(diagnostics).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
