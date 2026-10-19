/**
 * Planning: one spec, every built-in adapter, every approximation recorded.
 * Nothing here starts an agent CLI.
 */

import { describe, expect, test } from 'vitest'

import {
  adapterFor,
  antigravityAdapter,
  BUILTIN_AGENTS,
  claudeAdapter,
  codexAdapter,
  copilotAdapter,
  cursorAdapter,
  deepseekAdapter,
  droidAdapter,
  EFFORT_LEVELS,
  opencodeAdapter,
  piAdapter,
  planCall,
  qwenAdapter,
  TMP_TOKEN,
  type AgentAdapter,
  type AgentCallSpec,
  type AgentName,
  type AntigravityAdapterOptions,
  type CapabilityNote,
  type ClaudeAdapterOptions,
  type CodexAdapterOptions,
  type CopilotAdapterOptions,
  type CursorAdapterOptions,
  type DeepseekAdapterOptions,
  type DroidAdapterOptions,
  type ContextSpec,
  type EffortLevel,
  type McpSpec,
  type OpencodeAdapterOptions,
  type PiAdapterOptions,
  type QwenAdapterOptions,
  type OutputFormat,
  type OutputSpec,
  type PermissionMode,
  type PermissionSpec,
  type PlannedCall,
  type PluginSpec,
  type SessionSpec,
  type Support,
  type TempFile,
} from '@osdlc/agent-call'
import { EFFORT_LEVELS as MODELS_EFFORT_LEVELS } from '@osdlc/agent-call/models'

const mode: PermissionMode = 'edits'
const permissions: PermissionSpec = { mode, allowTools: ['Edit'], denyTools: ['Bash'] }
const context: ContextSpec = { files: ['README.md'], dirs: ['../shared'], text: 'Background.' }
const format: OutputFormat = 'json'
const output: OutputSpec = { format, schema: { type: 'object' } }
const session: SessionSpec = { resume: 'abc123', persist: false }
const mcp: McpSpec = { servers: { docs: { command: 'docs-server', args: ['--stdio'] } } }
const plugins: PluginSpec = { dirs: ['./my-plugin'], disable: ['noisy@market'] }
const effort: EffortLevel = 'high'

const spec: AgentCallSpec = {
  prompt: 'Review the change.',
  model: 'some-model',
  effort,
  systemPrompt: 'Be terse.',
  permissions,
  context,
  output,
  session,
  mcp,
  plugins,
  budgetUsd: 1,
  cwd: '/work',
  env: { REVIEW: '1' },
  timeoutMs: 60_000,
  extraArgs: ['--verbose'],
}

describe('the built-in adapters', () => {
  test('adapterFor builds each of them by name', () => {
    const names: readonly AgentName[] = BUILTIN_AGENTS
    expect(names.map((name) => adapterFor(name).name)).toEqual([
      'claude',
      'codex',
      'antigravity',
      'opencode',
      'copilot',
      'pi',
      'qwen',
      'droid',
      'cursor',
      'deepseek',
    ])
  })

  test('each adapter factory takes a binary path', () => {
    const claudeOptions: ClaudeAdapterOptions = { binary: '/opt/claude/claude' }
    const codexOptions: CodexAdapterOptions = { binary: '/opt/codex/codex' }
    const agyOptions: AntigravityAdapterOptions = { binary: '/opt/agy/agy' }
    const opencodeOptions: OpencodeAdapterOptions = { binary: '/opt/oc/opencode' }
    const copilotOptions: CopilotAdapterOptions = { binary: '/opt/gh/copilot' }
    const piOptions: PiAdapterOptions = { binary: '/opt/pi/pi' }
    const qwenOptions: QwenAdapterOptions = { binary: '/opt/qwen/qwen' }
    const droidOptions: DroidAdapterOptions = { binary: '/opt/factory/droid' }
    const cursorOptions: CursorAdapterOptions = { binary: '/opt/cursor/agent' }
    const deepseekOptions: DeepseekAdapterOptions = { binary: '/opt/dsh/dsh' }
    const adapters: AgentAdapter[] = [
      claudeAdapter(claudeOptions),
      codexAdapter(codexOptions),
      antigravityAdapter(agyOptions),
      opencodeAdapter(opencodeOptions),
      copilotAdapter(copilotOptions),
      piAdapter(piOptions),
      qwenAdapter(qwenOptions),
      droidAdapter(droidOptions),
      cursorAdapter(cursorOptions),
      deepseekAdapter(deepseekOptions),
    ]
    expect(adapters.map((a) => a.binary)).toEqual([
      '/opt/claude/claude',
      '/opt/codex/codex',
      '/opt/agy/agy',
      '/opt/oc/opencode',
      '/opt/gh/copilot',
      '/opt/pi/pi',
      '/opt/qwen/qwen',
      '/opt/factory/droid',
      '/opt/cursor/agent',
      '/opt/dsh/dsh',
    ])
  })

  test('an agent can run through a command prefix', () => {
    // Arguments that must come before the adapter's own, or a launcher such as npx.
    const codex = codexAdapter({ command: ['codex', '--profile', 'work'] })
    const planned = planCall(codex, { prompt: 'Review the change.' })
    // planned.argv is ['codex', '--profile', 'work', 'exec', ...]

    expect(planned.argv.slice(0, 4)).toEqual(['codex', '--profile', 'work', 'exec'])
    expect(codex.binary).toBe('codex')
    const viaNpx = adapterFor('claude', { command: ['npx', '-y', '@anthropic-ai/claude-code'] })
    expect(planCall(viaNpx, { prompt: 'x' }).argv.slice(0, 4)).toEqual([
      'npx',
      '-y',
      '@anthropic-ai/claude-code',
      '-p',
    ])
  })

  test('the effort vocabulary is a frozen list', () => {
    expect([...EFFORT_LEVELS]).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'])
    // The Node-free entry point exports the same list.
    expect(MODELS_EFFORT_LEVELS).toBe(EFFORT_LEVELS)
  })
})

describe('planCall', () => {
  test('the same spec plans on every agent, and notes say what changed', () => {
    for (const name of BUILTIN_AGENTS) {
      const planned: PlannedCall = planCall(adapterFor(name), spec)
      expect(planned.agent).toBe(name)
      expect(planned.spec).toBe(spec)
      expect(planned.cwd).toBe('/work')
      expect(planned.env['REVIEW']).toBe('1')
      expect(planned.argv).toContain('--verbose')
    }
  })

  test('a note has a field, a support level and a detail', () => {
    const planned = planCall(adapterFor('antigravity'), spec)
    const dropped: CapabilityNote[] = planned.notes.filter((n) => n.support === 'dropped')
    const levels: Support[] = ['native', 'approximated', 'emulated', 'dropped']
    expect(dropped.map((n) => n.field)).toContain('mcp.servers')
    for (const n of planned.notes) {
      expect(levels).toContain(n.support)
      expect(n.detail).not.toBe('')
    }
  })

  test('codex keeps its schema in a temp file named by TMP_TOKEN', () => {
    const planned = planCall(adapterFor('codex'), { prompt: 'x', output: { schema: { a: 1 } } })
    const files: TempFile[] = planned.tempFiles
    const schemaFile = files.find((f) => f.name === 'output-schema.json')
    expect(schemaFile?.content).toBe('{"a":1}')
    expect(planned.argv).toContain(`${TMP_TOKEN}/output-schema.json`)
  })

  test('the prompt travels on stdin for claude and in argv for antigravity', () => {
    expect(planCall(adapterFor('claude'), { prompt: 'p' }).stdin).toBe('p')
    const agy = planCall(adapterFor('antigravity'), { prompt: 'p' })
    expect(agy.stdin).toBeUndefined()
    expect(agy.prompt).toBe('p')
    expect(agy.argv.slice(-2)).toEqual(['-p', 'p'])
  })
})
