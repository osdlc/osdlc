/**
 * The adapters' hard-coded harness facts against the harness-knowledge package.
 *
 * The adapters keep binary names and flags as constants: a lookup at run time would
 * only complicate them, and policy (which mode to choose, which default) is theirs.
 * This test plans a call per fact and asserts the argv carries what the knowledge file
 * states at moderate strength or better (`fact` never returns a weak value). A change
 * in the file, or in an adapter, that makes them disagree fails here.
 */
import { describe, expect, test } from 'vitest'

// By path, not by package name: agent-call does not depend on the knowledge
// package (tests/exports.test.ts pins its dependencies), it only checks itself
// against the sibling package in this workspace.
import { HARNESS_SLUGS, fact, loadKnowledge } from '../../harness-knowledge/src/index.js'
import { opencodeAdapter } from '../src/adapters/opencode.js'
import { adapterFor } from '../src/registry.js'
import type { AgentName } from '../src/spec.js'
import type { AgentCallSpec } from '../src/spec.js'

const HARNESS: Record<string, string> = Object.fromEntries(
  // droid has no `cli/binary` value in the knowledge file, so its binary check would fail.
  Object.entries(HARNESS_SLUGS).filter(([adapter]) => adapter !== 'droid'),
)

/** `--flag=value` as two tokens, so the equals form and the spaced form compare equal. */
const split = (tokens: readonly string[]): string[] =>
  tokens.flatMap((t) =>
    t.startsWith('--') && t.includes('=')
      ? [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]
      : [t],
  )

/** A template token as a pattern; a `{slot}` or `<slot>`, whole or inside the token, matches any text. */
const pattern = (t: string): RegExp =>
  new RegExp(
    `^${t
      .split(/([{<][^}>]*[}>])/)
      .map((part, i) => (i % 2 === 1 ? '.*' : part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
      .join('')}$`,
  )

/** Whether `argv` holds `template` as consecutive tokens. */
function hasRun(argv: readonly string[], template: readonly string[]): boolean {
  const have = split(argv)
  const want = split(template).map(pattern)
  if (want.length === 0) return false
  for (let i = 0; i + want.length <= have.length; i++) {
    if (want.every((re, j) => re.test(have[i + j]!))) return true
  }
  return false
}

const planned = (adapter: string, spec: Partial<AgentCallSpec>) =>
  adapterFor(adapter as AgentName).plan({ prompt: 'x', ...spec })

const strings = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : [])
const modes = (f: Record<string, unknown> | undefined) =>
  (f?.['modes'] as { intent: string; argv: string[] }[] | undefined) ?? []

describe('the knowledge file names every harness the adapters map to', () => {
  const k = loadKnowledge()
  for (const [adapter, harness] of Object.entries(HARNESS)) {
    test(`${adapter} is ${harness}`, () => expect(k.harnesses[harness], harness).toBeDefined())
  }
})

describe('binary names', () => {
  for (const [adapter, harness] of Object.entries(HARNESS)) {
    test(`${adapter}: binary is ${harness}'s cli/binary name`, () => {
      const f = fact(harness, 'cli/binary')
      expect(f, `${harness} cli/binary`).toBeDefined()
      expect(adapterFor(adapter as AgentName).binary).toBe(f?.['name'])
    })
  }
})

describe('flags the adapters emit', () => {
  test('claude: output format, effort, continue, session id and persistence, dirs, system prompts, strict MCP', () => {
    const h = 'claude-code'
    const out = fact(h, 'cli/output-format')?.['formats'] as { name: string; argv: string[] }[]
    const json = out.find((x) => x.name === 'stream-json')!
    expect(hasRun(planned('claude', { output: { format: 'stream-json' } }).argv, json.argv)).toBe(
      true,
    )
    expect(
      hasRun(planned('claude', { effort: 'high' }).argv, strings(fact(h, 'cli/effort')?.['argv'])),
    ).toBe(true)
    expect(
      hasRun(
        planned('claude', { session: { continueLast: true } }).argv,
        strings(fact(h, 'cli/continue')?.['argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('claude', { session: { id: 'i' } }).argv,
        strings(fact(h, 'cli/session-id')?.['assign_argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('claude', { session: { persist: false } }).argv,
        strings(fact(h, 'cli/session-persistence')?.['disable_argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('claude', { context: { dirs: ['/d'] } }).argv,
        strings(fact(h, 'cli/context-dirs')?.['argv']),
      ),
    ).toBe(true)
    const sp = fact(h, 'instructions/system-prompt-flag')
    expect(
      hasRun(planned('claude', { systemPrompt: 's' }).argv, strings(sp?.['replace_argv'])),
    ).toBe(true)
    expect(
      hasRun(planned('claude', { appendSystemPrompt: 's' }).argv, strings(sp?.['append_argv'])),
    ).toBe(true)
    const mcp = fact(h, 'mcp/strict-config')
    const p = planned('claude', { mcp: { servers: { a: { command: 'c' } }, strict: true } })
    expect(hasRun(p.argv, strings(mcp?.['config_argv']))).toBe(true)
    expect(hasRun(p.argv, strings(mcp?.['strict_argv']))).toBe(true)
  })

  test('codex: output format, effort, continue, persistence, dirs', () => {
    const h = 'codex'
    expect(planned('codex', {}).argv.slice(0, 2)).toEqual([
      fact(h, 'cli/binary')?.['subcommand'] === 'exec' ? 'codex' : '',
      'exec',
    ])
    const out = fact(h, 'cli/output-format')?.['formats'] as { argv: string[] }[]
    expect(hasRun(planned('codex', {}).argv, out[0]!.argv)).toBe(true)
    expect(
      hasRun(planned('codex', { effort: 'high' }).argv, strings(fact(h, 'cli/effort')?.['argv'])),
    ).toBe(true)
    expect(
      hasRun(
        planned('codex', { session: { continueLast: true } }).argv,
        strings(fact(h, 'cli/continue')?.['argv']).slice(1),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('codex', { session: { persist: false } }).argv,
        strings(fact(h, 'cli/session-persistence')?.['disable_argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('codex', { context: { dirs: ['/d'] } }).argv,
        strings(fact(h, 'cli/context-dirs')?.['argv']),
      ),
    ).toBe(true)
  })

  test('cursor: output format, dirs, continue', () => {
    const h = 'cursor'
    const out = fact(h, 'cli/output-format')?.['formats'] as { name: string; argv: string[] }[]
    expect(
      hasRun(
        planned('cursor', { output: { format: 'stream-json' } }).argv,
        out.find((x) => x.name === 'stream-json')!.argv,
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('cursor', { context: { dirs: ['/d'] } }).argv,
        strings(fact(h, 'cli/context-dirs')?.['argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('cursor', { session: { continueLast: true } }).argv,
        strings(fact(h, 'cli/continue')?.['argv']),
      ),
    ).toBe(true)
  })

  test('copilot: effort, session id, dirs, output format, MCP config', () => {
    const h = 'copilot-cli'
    expect(
      hasRun(planned('copilot', { effort: 'high' }).argv, strings(fact(h, 'cli/effort')?.['argv'])),
    ).toBe(true)
    expect(
      hasRun(
        planned('copilot', { session: { id: 'i' } }).argv,
        strings(fact(h, 'cli/session-id')?.['assign_argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('copilot', { context: { dirs: ['/d'] } }).argv,
        strings(fact(h, 'cli/context-dirs')?.['argv']),
      ),
    ).toBe(true)
    const out = fact(h, 'cli/output-format')?.['formats'] as { name: string; argv: string[] }[]
    expect(hasRun(planned('copilot', {}).argv, out.find((x) => x.name === 'json')!.argv)).toBe(true)
    const mcp = fact(h, 'mcp/strict-config')
    expect(
      hasRun(
        planned('copilot', { mcp: { servers: { a: { command: 'c' } } } }).argv,
        strings(mcp?.['config_argv']),
      ),
    ).toBe(true)
  })

  test('qwen: output format, dirs, session id and persistence, system prompts, continue', () => {
    const h = 'qwen-code'
    const out = fact(h, 'cli/output-format')?.['formats'] as { name: string; argv: string[] }[]
    expect(
      hasRun(
        planned('qwen', { output: { format: 'stream-json' } }).argv,
        out.find((x) => x.name === 'stream-json')!.argv,
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('qwen', { context: { dirs: ['/d'] } }).argv,
        strings(fact(h, 'cli/context-dirs')?.['argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('qwen', { session: { id: 'i' } }).argv,
        strings(fact(h, 'cli/session-id')?.['assign_argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('qwen', { session: { persist: false } }).argv,
        strings(fact(h, 'cli/session-persistence')?.['disable_argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('qwen', { session: { continueLast: true } }).argv,
        strings(fact(h, 'cli/continue')?.['argv']),
      ),
    ).toBe(true)
    const sp = fact(h, 'instructions/system-prompt-flag')
    expect(hasRun(planned('qwen', { systemPrompt: 's' }).argv, strings(sp?.['replace_argv']))).toBe(
      true,
    )
    expect(
      hasRun(planned('qwen', { appendSystemPrompt: 's' }).argv, strings(sp?.['append_argv'])),
    ).toBe(true)
  })

  test('pi: output mode, effort, continue, session id and persistence, system prompts', () => {
    const h = 'pi'
    const out = fact(h, 'cli/output-format')?.['formats'] as { name: string; argv: string[] }[]
    expect(hasRun(planned('pi', {}).argv, out.find((x) => x.name === 'json')!.argv)).toBe(true)
    expect(hasRun(planned('pi', { effort: 'high' }).argv, ['--thinking', 'high'])).toBe(true)
    expect(strings(fact(h, 'cli/effort')?.['argv'])[0]).toBe('--thinking')
    expect(
      hasRun(
        planned('pi', { session: { continueLast: true } }).argv,
        strings(fact(h, 'cli/continue')?.['argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('pi', { session: { id: 'i' } }).argv,
        strings(fact(h, 'cli/session-id')?.['assign_argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('pi', { session: { persist: false } }).argv,
        strings(fact(h, 'cli/session-persistence')?.['disable_argv']),
      ),
    ).toBe(true)
    const sp = fact(h, 'instructions/system-prompt-flag')
    expect(
      hasRun(planned('pi', { systemPrompt: 's' }).argv, [strings(sp?.['replace_argv'])[0]!]),
    ).toBe(true)
    expect(
      hasRun(planned('pi', { appendSystemPrompt: 's' }).argv, [strings(sp?.['append_argv'])[0]!]),
    ).toBe(true)
  })

  test('opencode: format, continue; effort is --variant before 2.0.0 and a model suffix after', () => {
    const h = 'opencode'
    const out = fact(h, 'cli/output-format')?.['formats'] as { name: string; argv: string[] }[]
    expect(hasRun(planned('opencode', {}).argv, out.find((x) => x.name === 'json')!.argv)).toBe(
      true,
    )
    expect(
      hasRun(
        planned('opencode', { session: { continueLast: true } }).argv,
        strings(fact(h, 'cli/continue')?.['argv']),
      ),
    ).toBe(true)
    // `fact` without a version is the 1.x statement; the 2.x one is scoped from 2.0.0.
    expect(fact(h, 'cli/effort', { version: '1.17.12' })?.['argv']).toEqual([
      '--variant',
      '{level}',
    ])
    expect(hasRun(planned('opencode', { effort: 'high' }).argv, ['--variant', 'high'])).toBe(true)
    const v2 = fact(h, 'cli/effort', { version: '2.2.6' })
    expect(v2?.['argv']).toEqual(['--model', '{provider/model}#{level}'])
    const template = strings(v2?.['argv'])
    const model = template[1]!.replace('{provider/model}', 'anthropic/m').replace('{level}', 'high')
    const argv = opencodeAdapter({ version: '2.2.6' }).plan({
      prompt: 'x',
      model: 'anthropic/m',
      effort: 'high',
    }).argv
    expect(hasRun(argv, [template[0]!, model])).toBe(true)
    expect(argv).not.toContain('--variant')
  })

  test('antigravity: output format, effort, continue, dirs, edits mode', () => {
    const h = 'antigravity'
    const out = fact(h, 'cli/output-format')?.['formats'] as { name: string; argv: string[] }[]
    expect(
      hasRun(
        planned('antigravity', { output: { format: 'stream-json' } }).argv,
        out.find((x) => x.name === 'stream-json')!.argv,
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('antigravity', { effort: 'high' }).argv,
        strings(fact(h, 'cli/effort')?.['argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('antigravity', { session: { continueLast: true } }).argv,
        strings(fact(h, 'cli/continue')?.['argv']),
      ),
    ).toBe(true)
    expect(
      hasRun(
        planned('antigravity', { context: { dirs: ['/d'] } }).argv,
        strings(fact(h, 'cli/context-dirs')?.['argv']),
      ),
    ).toBe(true)
    const edits = modes(fact(h, 'permissions/modes')).find((m) => m.intent === 'edits')!
    expect(
      hasRun(planned('antigravity', { permissions: { mode: 'edits' } }).argv, edits.argv),
    ).toBe(true)
    const bypass = modes(fact(h, 'permissions/modes')).find((m) => m.intent === 'bypass')!
    expect(
      hasRun(planned('antigravity', { permissions: { mode: 'bypass' } }).argv, bypass.argv),
    ).toBe(true)
  })

  test('dsh: output format, dirs; no read-only preset is shipped', () => {
    const h = 'dsh'
    const out = fact(h, 'cli/output-format')?.['formats'] as { name: string; argv: string[] }[]
    expect(hasRun(planned('deepseek', {}).argv, out.find((x) => x.name === 'json')!.argv)).toBe(
      true,
    )
    expect(
      hasRun(
        planned('deepseek', { context: { dirs: ['/d'] } }).argv,
        strings(fact(h, 'cli/context-dirs')?.['argv']),
      ),
    ).toBe(true)
    expect(fact(h, 'cli/session-id')?.['supported']).toBe(false)
    expect(
      planned('deepseek', { session: { id: 'i' } }).notes.find((n) => n.field === 'session.id')
        ?.support,
    ).toBe('dropped')
    const note = String(fact(h, 'permissions/modes')?.['note'])
    expect(note).toContain('workspace-write')
    expect(note).toContain('danger-full-access')
    expect(note).not.toContain('read-only')
    expect(String(fact(h, 'instructions/system-prompt-flag')?.['note'])).toContain('{{cwd}}')
    for (const spec of [{ appendSystemPrompt: 'a' }, { systemPrompt: 's' }]) {
      const file = planned('deepseek', spec).tempFiles.find((f) => f.name === 'dsh-patch.yml')
      expect(file, 'the overlay patch').toBeDefined()
      expect(file!.content).not.toContain('{{cwd}}')
    }
  })
})

describe('permission modes: the mode argv each adapter maps natively is one the file states', () => {
  const cases: [string, 'read-only' | 'edits' | 'bypass'][] = [
    ['claude', 'read-only'],
    ['claude', 'edits'],
    ['claude', 'bypass'],
    ['codex', 'read-only'],
    ['codex', 'bypass'],
    ['cursor', 'read-only'],
    ['qwen', 'read-only'],
    ['qwen', 'edits'],
    ['qwen', 'bypass'],
  ]
  for (const [adapter, mode] of cases) {
    test(`${adapter} ${mode}`, () => {
      const stated = modes(fact(HARNESS[adapter]!, 'permissions/modes')).filter(
        (m) => m.intent === mode,
      )
      expect(stated.length, 'the file states this intent').toBeGreaterThan(0)
      const argv = planned(adapter, { permissions: { mode } }).argv
      expect(stated.some((m) => hasRun(argv, m.argv))).toBe(true)
    })
  }
})
