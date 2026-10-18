import { describe, expect, test } from 'vitest'

import { opencodeAdapter } from '../../src/adapters/opencode.js'
import type { RawProcessOutput } from '../../src/adapters/types.js'

const adapter = opencodeAdapter()

function raw(stdout: string): RawProcessOutput {
  return { stdout, stderr: '', exitCode: 0, durationMs: 10, timedOut: false }
}

describe('opencode plan', () => {
  test('minimal spec: run with json events, prompt as positional', () => {
    const planned = adapter.plan({ prompt: 'say hi' })
    expect(planned.argv.slice(0, 2)).toEqual(['opencode', 'run'])
    expect(planned.argv).toContain('--format')
    expect(planned.argv[planned.argv.length - 1]).toBe('say hi')
    expect(planned.stdin).toBeUndefined()
    expect(planned.prompt).toBe('say hi')
  })

  test('permissions ride OPENCODE_PERMISSION env', () => {
    const readOnly = adapter.plan({ prompt: 'x', permissions: { mode: 'read-only' } })
    expect(JSON.parse(readOnly.env['OPENCODE_PERMISSION']!)).toEqual({
      edit: 'deny',
      bash: 'deny',
      webfetch: 'allow',
    })

    const fullAuto = adapter.plan({ prompt: 'x', permissions: { mode: 'full-auto' } })
    expect(JSON.parse(fullAuto.env['OPENCODE_PERMISSION']!)).toEqual({
      edit: 'allow',
      bash: 'allow',
      webfetch: 'allow',
    })
  })

  test('context files attach natively with --file', () => {
    const planned = adapter.plan({
      prompt: 'x',
      context: { files: ['a.ts', 'b.ts'] },
    })
    const joined = planned.argv.join(' ')
    expect(joined).toContain('--file a.ts')
    expect(joined).toContain('--file b.ts')
    // Native attach: no preamble folded into the prompt.
    expect(planned.argv[planned.argv.length - 1]).toBe('x')
    const n = planned.notes.find((note) => note.field === 'context.files')
    expect(n?.support).toBe('native')
  })

  test('session resume and continue map natively', () => {
    const byId = adapter.plan({ prompt: 'x', session: { resume: 'ses_1' } })
    expect(byId.argv.join(' ')).toContain('--session ses_1')

    const cont = adapter.plan({ prompt: 'x', session: { continueLast: true } })
    expect(cont.argv).toContain('--continue')
  })

  test('bare model names get a note', () => {
    const planned = adapter.plan({ prompt: 'x', model: 'gpt-5' })
    const n = planned.notes.find((note) => note.field === 'model')
    expect(n?.support).toBe('approximated')
  })

  test('effort maps to --variant', () => {
    const planned = adapter.plan({ prompt: 'x', effort: 'high' })
    expect(planned.argv.join(' ')).toContain('--variant high')
  })

  test('none, minimal and xhigh pass through as --variant', () => {
    for (const effort of ['none', 'minimal', 'xhigh'] as const) {
      const planned = adapter.plan({ prompt: 'x', effort })
      expect(planned.argv.join(' ')).toContain(`--variant ${effort}`)
    }
  })
})

describe('opencode parse', () => {
  test('aggregates text parts from json events', () => {
    const lines = [
      JSON.stringify({ type: 'step-start' }),
      JSON.stringify({
        type: 'tool',
        id: 'p1',
        tool: 'read',
        callID: 'c1',
        state: { status: 'completed', input: { path: 'a.ts' }, output: 'body' },
      }),
      JSON.stringify({ type: 'text', id: 'p2', sessionID: 'ses_9', text: 'the answer' }),
    ].join('\n')
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(planned, raw(lines))
    expect(parsed.text).toBe('the answer')
    expect(parsed.sessionId).toBe('ses_9')

    const conversation = adapter.toConversation?.(planned, raw(lines))
    const partTypes = conversation?.messages.flatMap((m) => m.parts.map((p) => p.type))
    expect(partTypes).toEqual(['text', 'tool-call', 'tool-result', 'text'])
  })

  test('wrapped part events also parse', () => {
    const lines = [
      JSON.stringify({
        type: 'message.part.updated',
        properties: { part: { type: 'text', id: 'p1', text: 'partial' } },
      }),
      JSON.stringify({
        type: 'message.part.updated',
        properties: { part: { type: 'text', id: 'p1', text: 'full answer' } },
      }),
    ].join('\n')
    const planned = adapter.plan({ prompt: 'hi' })
    const parsed = adapter.parseResult(planned, raw(lines))
    // Same part id: the later state wins, no duplication.
    expect(parsed.text).toBe('full answer')
  })
})
