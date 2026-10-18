/**
 * The README's capability map, checked against the adapters. Each row plans
 * one spec per agent and compares the support level of the matching note with
 * the expectation below. The README cell must also show the flag the adapter
 * puts in the planned call, and any support word the cell uses (`dropped`,
 * `prompt-emulated`, `(approximated)`) must agree with the note.
 */

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, test } from 'vitest'

import { adapterFor, BUILTIN_AGENTS } from '../src/registry.js'
import { planCall } from '../src/run.js'
import type { Support } from '../src/plan.js'
import type { AgentCallSpec, AgentName } from '../src/spec.js'

const README = readFileSync(join(import.meta.dirname, '..', 'README.md'), 'utf-8')

const AGENTS = BUILTIN_AGENTS

/** `native` also covers a flag with no note: adapters note only what is not one to one. */
interface Cell {
  support: Support
  /** Text the README cell shows. */
  readme?: string
  /** Text expected in the planned argv (joined by spaces), or `env:` for the env JSON. Defaults to `readme`. */
  planned?: string
}

interface Row {
  /** The README first-column text, without backticks. */
  label: string
  spec: Partial<AgentCallSpec>
  /** The `CapabilityNote.field` the cells are judged by. */
  field: string
  cells: Record<AgentName, Cell>
}

const ROWS: Row[] = [
  {
    label: 'model',
    spec: { model: 'provider/m' },
    field: 'model',
    cells: {
      claude: { support: 'native', readme: '--model' },
      codex: { support: 'native', readme: '--model' },
      antigravity: { support: 'native', readme: '--model' },
      opencode: { support: 'native', readme: '--model' },
      copilot: { support: 'native', readme: '--model' },
      pi: { support: 'native', readme: '--model' },
      qwen: { support: 'native', readme: '--model' },
      droid: { support: 'native', readme: '--model' },
      cursor: { support: 'native', readme: '--model' },
      deepseek: { support: 'approximated', readme: '--patch' },
    },
  },
  {
    label: 'effort',
    spec: { effort: 'low' },
    field: 'effort',
    cells: {
      claude: { support: 'native', readme: '--effort' },
      codex: { support: 'native', readme: 'model_reasoning_effort' },
      antigravity: { support: 'native', readme: '--effort' },
      opencode: { support: 'approximated', readme: '--variant' },
      copilot: { support: 'native', readme: '--reasoning-effort' },
      pi: { support: 'native', readme: '--thinking' },
      qwen: { support: 'approximated', readme: 'QWEN_CODE_SYSTEM_DEFAULTS_PATH' },
      droid: { support: 'native', readme: '--reasoning-effort' },
      cursor: { support: 'dropped', planned: '' },
      deepseek: { support: 'approximated', readme: '--patch' },
    },
  },
  {
    label: 'systemPrompt',
    spec: { systemPrompt: 'be brief' },
    field: 'systemPrompt',
    cells: {
      claude: { support: 'native', readme: '--system-prompt' },
      codex: { support: 'emulated', planned: '<system>' },
      antigravity: { support: 'emulated', planned: '<system>' },
      opencode: { support: 'emulated', planned: '<system>' },
      copilot: { support: 'emulated', planned: '<system>' },
      pi: { support: 'native', readme: '--system-prompt' },
      qwen: { support: 'native', readme: '--system-prompt' },
      droid: { support: 'emulated', planned: '<system>' },
      cursor: { support: 'emulated', planned: '<system>' },
      deepseek: { support: 'approximated', readme: '--patch' },
    },
  },
  {
    label: 'appendSystemPrompt',
    spec: { appendSystemPrompt: 'be brief' },
    field: 'appendSystemPrompt',
    cells: {
      claude: { support: 'native', readme: '--append-system-prompt' },
      codex: { support: 'emulated', planned: '<instructions>' },
      antigravity: { support: 'emulated', planned: '<instructions>' },
      opencode: { support: 'emulated', planned: '<instructions>' },
      copilot: { support: 'approximated', readme: 'COPILOT_CUSTOM_INSTRUCTIONS_DIRS' },
      pi: { support: 'native', readme: '--append-system-prompt' },
      qwen: { support: 'native', readme: '--append-system-prompt' },
      droid: { support: 'native', readme: '--append-system-prompt-file' },
      cursor: { support: 'emulated', planned: '<instructions>' },
      deepseek: { support: 'native', readme: '--patch' },
    },
  },
  {
    label: 'permissions.mode: read-only',
    spec: { permissions: { mode: 'read-only' } },
    field: 'permissions.mode',
    cells: {
      claude: { support: 'approximated', readme: '--permission-mode plan' },
      codex: { support: 'native', readme: '--sandbox read-only' },
      antigravity: { support: 'approximated', readme: '--sandbox' },
      opencode: { support: 'approximated', readme: 'OPENCODE_PERMISSION' },
      copilot: { support: 'approximated', readme: '--deny-tool=write' },
      pi: { support: 'approximated', readme: '--tools read,grep,find,ls' },
      qwen: { support: 'approximated', readme: '--approval-mode plan' },
      droid: { support: 'native', readme: 'no flag', planned: '' },
      cursor: { support: 'approximated', readme: '--mode ask' },
      deepseek: {
        support: 'native',
        readme: 'DSH_PERMISSION_MODE',
        planned: '"DSH_PERMISSION_MODE":"read-only"',
      },
    },
  },
  {
    label: 'permissions.mode: edits',
    spec: { permissions: { mode: 'edits' } },
    field: 'permissions.mode',
    cells: {
      claude: { support: 'native', readme: '--permission-mode acceptEdits' },
      codex: { support: 'approximated', readme: '--sandbox workspace-write' },
      antigravity: { support: 'dropped', planned: '' },
      opencode: { support: 'approximated', readme: 'OPENCODE_PERMISSION' },
      copilot: { support: 'native', readme: '--allow-tool=write' },
      pi: { support: 'approximated', readme: '--tools read,grep,find,ls,edit,write' },
      qwen: { support: 'native', readme: '--approval-mode auto-edit' },
      droid: { support: 'approximated', readme: '--auto low' },
      cursor: { support: 'native', readme: 'no flag', planned: '' },
      deepseek: {
        support: 'approximated',
        readme: 'DSH_PERMISSION_MODE',
        planned: '"DSH_PERMISSION_MODE":"workspace-write"',
      },
    },
  },
  {
    label: 'permissions.mode: full-auto',
    spec: { permissions: { mode: 'full-auto' } },
    field: 'permissions.mode',
    cells: {
      claude: {
        support: 'approximated',
        readme: 'acceptEdits',
        planned: '--permission-mode acceptEdits',
      },
      codex: { support: 'native', readme: '--sandbox workspace-write' },
      antigravity: { support: 'approximated', readme: '--dangerously-skip-permissions' },
      opencode: { support: 'approximated', readme: 'OPENCODE_PERMISSION' },
      copilot: { support: 'approximated', readme: '--allow-all-tools' },
      pi: { support: 'approximated', readme: '--tools', planned: '--tools +read,+bash' },
      qwen: {
        support: 'approximated',
        readme: 'auto-edit',
        planned: '--approval-mode auto-edit --allowed-tools run_shell_command',
      },
      droid: { support: 'approximated', readme: '--auto medium' },
      cursor: { support: 'native', readme: '--sandbox enabled' },
      deepseek: {
        support: 'native',
        readme: 'DSH_PERMISSION_MODE',
        planned: '"DSH_PERMISSION_MODE":"workspace-write"',
      },
    },
  },
  {
    label: 'permissions.mode: bypass',
    spec: { permissions: { mode: 'bypass' } },
    field: 'permissions.mode',
    cells: {
      claude: { support: 'native', readme: '--dangerously-skip-permissions' },
      codex: { support: 'native', readme: '--dangerously-bypass-approvals-and-sandbox' },
      antigravity: { support: 'native', readme: '--dangerously-skip-permissions' },
      opencode: { support: 'approximated', readme: 'OPENCODE_PERMISSION' },
      copilot: { support: 'native', readme: '--allow-all' },
      pi: { support: 'native', readme: '--tools', planned: '--tools +read,+bash' },
      qwen: { support: 'native', readme: '--approval-mode yolo' },
      droid: { support: 'native', readme: '--skip-permissions-unsafe' },
      cursor: { support: 'native', readme: '--force --sandbox disabled' },
      deepseek: {
        support: 'native',
        readme: 'DSH_PERMISSION_MODE',
        planned: '"DSH_PERMISSION_MODE":"danger-full-access"',
      },
    },
  },
  {
    label: 'permissions.allowTools',
    spec: { permissions: { allowTools: ['Edit'] } },
    field: 'permissions.allowTools',
    cells: {
      claude: { support: 'native', readme: '--allowedTools' },
      codex: { support: 'dropped', planned: '' },
      antigravity: { support: 'dropped', planned: '' },
      opencode: { support: 'dropped', planned: '' },
      copilot: { support: 'native', readme: '--allow-tool' },
      pi: { support: 'approximated', readme: '--tools' },
      qwen: { support: 'native', readme: '--allowed-tools' },
      droid: { support: 'approximated', readme: '--add-tools' },
      cursor: { support: 'dropped', planned: '' },
      deepseek: { support: 'dropped', planned: '' },
    },
  },
  {
    label: 'permissions.denyTools',
    spec: { permissions: { denyTools: ['Bash'] } },
    field: 'permissions.denyTools',
    cells: {
      claude: { support: 'native', readme: '--disallowedTools' },
      codex: { support: 'dropped', planned: '' },
      antigravity: { support: 'dropped', planned: '' },
      opencode: { support: 'dropped', planned: '' },
      copilot: { support: 'native', readme: '--deny-tool' },
      pi: { support: 'native', readme: '--exclude-tools' },
      qwen: { support: 'native', readme: '--exclude-tools' },
      droid: { support: 'approximated', readme: '--remove-tools' },
      cursor: { support: 'dropped', planned: '' },
      deepseek: { support: 'dropped', planned: '' },
    },
  },
  {
    label: 'context.files',
    spec: { context: { files: ['src/a.ts'] } },
    field: 'context.files',
    cells: {
      claude: { support: 'emulated', readme: 'prompt preamble', planned: '- src/a.ts' },
      codex: { support: 'emulated', readme: 'prompt preamble', planned: '- src/a.ts' },
      antigravity: { support: 'emulated', readme: '@path', planned: '@src/a.ts' },
      opencode: { support: 'native', readme: '--file' },
      copilot: { support: 'emulated', readme: 'prompt preamble', planned: '- src/a.ts' },
      pi: { support: 'native', readme: '@path', planned: '@src/a.ts' },
      qwen: { support: 'emulated', readme: '@path', planned: '@src/a.ts' },
      droid: { support: 'emulated', readme: 'prompt preamble', planned: '- src/a.ts' },
      cursor: { support: 'emulated', readme: 'prompt preamble', planned: '- src/a.ts' },
      deepseek: { support: 'emulated', readme: 'prompt preamble', planned: '- src/a.ts' },
    },
  },
  {
    label: 'context.dirs',
    spec: { context: { dirs: ['../shared'] } },
    field: 'context.dirs',
    cells: {
      claude: { support: 'native', readme: '--add-dir' },
      codex: { support: 'native', readme: '--add-dir' },
      antigravity: { support: 'dropped', planned: '' },
      opencode: { support: 'dropped', planned: '' },
      copilot: { support: 'native', readme: '--add-dir' },
      pi: { support: 'dropped', planned: '' },
      qwen: { support: 'native', readme: '--include-directories' },
      droid: { support: 'dropped', planned: '' },
      cursor: { support: 'native', readme: '--add-dir' },
      deepseek: { support: 'dropped', planned: '' },
    },
  },
  {
    label: 'context.text',
    spec: { context: { text: 'background' } },
    field: 'context.text',
    // Folded into the prompt without a note, on every agent.
    cells: {
      claude: { support: 'emulated', readme: 'prompt preamble', planned: '<context>' },
      codex: { support: 'emulated', readme: 'prompt preamble', planned: '<context>' },
      antigravity: { support: 'emulated', readme: 'prompt preamble', planned: '<context>' },
      opencode: { support: 'emulated', readme: 'prompt preamble', planned: '<context>' },
      copilot: { support: 'emulated', readme: 'prompt preamble', planned: '<context>' },
      pi: { support: 'emulated', readme: 'prompt preamble', planned: '<context>' },
      qwen: { support: 'emulated', readme: 'prompt preamble', planned: '<context>' },
      droid: { support: 'emulated', readme: 'prompt preamble', planned: '<context>' },
      cursor: { support: 'emulated', readme: 'prompt preamble', planned: '<context>' },
      deepseek: { support: 'emulated', readme: 'prompt preamble', planned: '<context>' },
    },
  },
  {
    label: 'output.schema',
    spec: { output: { schema: { type: 'object' } } },
    field: 'output.schema',
    cells: {
      claude: { support: 'native', readme: '--json-schema' },
      codex: { support: 'native', readme: '--output-schema' },
      antigravity: { support: 'native', readme: '--json-schema' },
      opencode: { support: 'emulated', planned: 'validates against this JSON Schema' },
      copilot: { support: 'emulated', planned: 'validates against this JSON Schema' },
      pi: { support: 'emulated', planned: 'validates against this JSON Schema' },
      qwen: { support: 'native', readme: '--json-schema' },
      droid: { support: 'emulated', planned: 'validates against this JSON Schema' },
      cursor: { support: 'emulated', planned: 'validates against this JSON Schema' },
      deepseek: { support: 'emulated', planned: 'validates against this JSON Schema' },
    },
  },
  {
    label: 'session.resume',
    spec: { session: { resume: 'abc' } },
    field: 'session.resume',
    cells: {
      claude: { support: 'native', readme: '--resume=<id>', planned: '--resume=abc' },
      codex: { support: 'native', readme: 'exec resume <id>', planned: 'exec resume abc' },
      antigravity: { support: 'native', readme: '--conversation', planned: '--conversation abc' },
      opencode: { support: 'native', readme: '--session', planned: '--session abc' },
      copilot: { support: 'native', readme: '--resume=<id>', planned: '--resume=abc' },
      pi: { support: 'native', readme: '--session', planned: '--session abc' },
      qwen: { support: 'native', readme: '--resume=<id>', planned: '--resume=abc' },
      droid: { support: 'native', readme: '--session-id', planned: '--session-id abc' },
      cursor: { support: 'native', readme: '--resume=<id>', planned: '--resume=abc' },
      deepseek: { support: 'native', readme: '--session-id', planned: '--session-id=abc' },
    },
  },
  {
    label: 'session.continueLast',
    spec: { session: { continueLast: true } },
    field: 'session.continueLast',
    cells: {
      claude: { support: 'native', readme: '--continue' },
      codex: { support: 'native', readme: 'exec resume --last' },
      antigravity: { support: 'native', readme: '--continue' },
      opencode: { support: 'native', readme: '--continue' },
      copilot: { support: 'native', readme: '--continue' },
      pi: { support: 'native', readme: '--continue' },
      qwen: { support: 'native', readme: '--continue' },
      droid: { support: 'dropped', planned: '' },
      cursor: { support: 'native', readme: '--continue' },
      deepseek: { support: 'dropped', planned: '' },
    },
  },
  {
    label: 'session.id',
    spec: { session: { id: 'fixed-id' } },
    field: 'session.id',
    cells: {
      claude: { support: 'native', readme: '--session-id', planned: '--session-id fixed-id' },
      codex: { support: 'dropped', planned: '' },
      antigravity: { support: 'dropped', planned: '' },
      opencode: { support: 'dropped', planned: '' },
      copilot: { support: 'native', readme: '--session-id', planned: '--session-id=fixed-id' },
      pi: { support: 'native', readme: '--session-id', planned: '--session-id fixed-id' },
      qwen: { support: 'native', readme: '--session-id', planned: '--session-id fixed-id' },
      droid: { support: 'approximated', readme: '--session-id', planned: '--session-id fixed-id' },
      cursor: { support: 'approximated', readme: '--new-session-id' },
      deepseek: { support: 'dropped', planned: '' },
    },
  },
  {
    label: 'session.persist: false',
    spec: { session: { persist: false } },
    field: 'session.persist',
    cells: {
      claude: { support: 'native', readme: '--no-session-persistence' },
      codex: { support: 'native', readme: '--ephemeral' },
      antigravity: { support: 'dropped', planned: '' },
      opencode: { support: 'dropped', planned: '' },
      copilot: { support: 'dropped', planned: '' },
      pi: { support: 'native', readme: '--no-session' },
      qwen: { support: 'approximated', readme: '--chat-recording false' },
      droid: { support: 'dropped', planned: '' },
      cursor: { support: 'dropped', planned: '' },
      deepseek: { support: 'dropped', planned: '' },
    },
  },
  {
    label: 'mcp.servers',
    spec: { mcp: { servers: { docs: { command: 'srv' } } } },
    field: 'mcp.servers',
    cells: {
      claude: { support: 'native', readme: '--mcp-config' },
      codex: {
        support: 'approximated',
        readme: '-c mcp_servers.*',
        planned: 'mcp_servers.docs.command',
      },
      antigravity: { support: 'dropped', planned: '' },
      opencode: { support: 'dropped', planned: '' },
      copilot: { support: 'native', readme: '--additional-mcp-config' },
      pi: { support: 'dropped', planned: '' },
      qwen: { support: 'native', readme: '--mcp-config' },
      droid: { support: 'dropped', planned: '' },
      cursor: { support: 'approximated', readme: '--plugin-dir' },
      deepseek: { support: 'approximated', readme: '--patch' },
    },
  },
  {
    label: 'budgetUsd',
    spec: { budgetUsd: 2 },
    field: 'budgetUsd',
    cells: {
      claude: { support: 'native', readme: '--max-budget-usd' },
      codex: { support: 'dropped', planned: '' },
      antigravity: { support: 'dropped', planned: '' },
      opencode: { support: 'dropped', planned: '' },
      copilot: { support: 'dropped', planned: '' },
      pi: { support: 'dropped', planned: '' },
      qwen: { support: 'dropped', planned: '' },
      droid: { support: 'dropped', planned: '' },
      cursor: { support: 'dropped', planned: '' },
      deepseek: { support: 'dropped', planned: '' },
    },
  },
]

/**
 * The capability-map tables: first column (backticks removed) to each agent's
 * cell, keyed by the agent named in the header. The map may be split across
 * several tables, each with its own header row of agent names.
 */
function readmeTable(): Map<string, Record<string, string>> {
  const start = README.indexOf('### Capability map')
  expect(start).toBeGreaterThan(-1)
  const rows = new Map<string, Record<string, string>>()
  let header: string[] = []
  for (const line of README.slice(start).split('\n').slice(1)) {
    if (/^#{2,3} /.test(line)) break
    if (!line.startsWith('|')) continue
    const cells = line
      .replace(/^\||\|\s*$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, '|'))
    if (cells[0] === 'Spec field') {
      header = cells.slice(1)
      continue
    }
    if (/^-+$/.test(cells[0] ?? '')) continue
    const label = (cells[0] ?? '').replaceAll('`', '')
    const row = rows.get(label) ?? {}
    for (const [i, agent] of header.entries()) row[agent] = cells[i + 1] ?? ''
    rows.set(label, row)
  }
  return rows
}

const TABLE = readmeTable()

/** The README row whose label is `label`, or one that starts with it and a space. */
function tableRow(label: string): Record<string, string> {
  for (const [key, cells] of TABLE) {
    if (key === label || key.startsWith(`${label} `)) return cells
  }
  throw new Error(`no README capability-map row for ${label}`)
}

function plannedText(planned: ReturnType<typeof planCall>): string {
  return [
    planned.argv.join(' '),
    JSON.stringify(planned.env),
    planned.stdin ?? '',
    planned.prompt ?? '',
  ].join('\n')
}

describe('capability map: support levels match the notes', () => {
  for (const row of ROWS) {
    for (const agent of AGENTS) {
      const cell = row.cells[agent]
      test(`${row.label} on ${agent} is ${cell.support}`, () => {
        const planned = planCall(adapterFor(agent), { prompt: 'PROMPT', ...row.spec })
        const note = planned.notes.find((n) => n.field === row.field)
        if (cell.support === 'native') {
          // Native either carries a native note or no note at all.
          if (note !== undefined) expect(note.support).toBe('native')
        } else if (row.field === 'context.text') {
          expect(note).toBeUndefined() // folded in without a note
        } else {
          expect(note?.support).toBe(cell.support)
        }
        const expected = cell.planned ?? cell.readme
        if (expected !== undefined && expected !== '') {
          expect(plannedText(planned)).toContain(expected)
        }

        const shown = tableRow(row.label)[agent]
        expect(shown).toBeDefined()
        if (cell.readme !== undefined) expect(shown).toContain(cell.readme)
        // A support word in the README cell must agree with the note.
        if (/dropped/.test(shown!)) expect(cell.support).toBe('dropped')
        if (/prompt-emulated|prompt preamble|in prompt/.test(shown!)) {
          expect(cell.support).toBe('emulated')
        }
        if (/\(approximated\)/.test(shown!)) expect(cell.support).toBe('approximated')
      })
    }
  }
})

describe('capability map: the other rows', () => {
  test('prompt travels where the README says', () => {
    const plan = (agent: AgentName) => planCall(adapterFor(agent), { prompt: 'PROMPT' })
    expect(plan('claude').stdin).toBe('PROMPT')
    expect(plan('codex').stdin).toBe('PROMPT')
    expect(plan('codex').argv.at(-1)).toBe('-')
    expect(plan('antigravity').stdin).toBeUndefined()
    expect(plan('antigravity').argv.slice(-2)).toEqual(['-p', 'PROMPT'])
    expect(plan('opencode').stdin).toBeUndefined()
    expect(plan('opencode').argv.at(-1)).toBe('PROMPT')
    for (const agent of ['copilot', 'pi', 'qwen', 'droid', 'cursor'] as const) {
      expect(plan(agent).stdin).toBe('PROMPT')
    }
    expect(plan('deepseek').stdin).toBe('PROMPT')
    expect(plan('deepseek').argv.at(-1)).toBe('-')
    const cells = tableRow('prompt')
    expect(cells['claude']).toBe('stdin')
    expect(cells['codex']).toContain('stdin')
    expect(cells['antigravity']).toContain('-p <prompt>')
    expect(cells['opencode']).toBe('positional')
    for (const agent of ['copilot', 'pi', 'qwen', 'droid', 'cursor'] as const)
      expect(cells[agent]).toBe('stdin')
    expect(cells['deepseek']).toContain('stdin')
  })

  test('effort xhigh and max pass through, except where the README says they clamp or drop', () => {
    for (const effort of ['xhigh', 'max'] as const) {
      for (const agent of AGENTS) {
        const planned = planCall(adapterFor(agent), { prompt: 'x', effort })
        const note = planned.notes.find((n) => n.field === 'effort')
        // Effort can travel in a temp file (qwen, deepseek), so look there too.
        const text = [plannedText(planned), ...planned.tempFiles.map((f) => f.content)].join('\n')
        if (agent === 'antigravity') {
          expect(note?.support).toBe('approximated')
          expect(planned.argv.join(' ')).toContain('--effort high')
        } else if (agent === 'cursor') {
          expect(note?.support).toBe('dropped')
        } else if (agent === 'deepseek') {
          expect(note?.support).toBe('approximated')
          expect(text).toContain('"reasoningEffort": "max"')
        } else {
          expect(text).toContain(effort)
        }
      }
    }
    expect(tableRow('effort')['antigravity']).toContain('`xhigh`, `max` → `high`')
    expect(tableRow('effort')['deepseek']).toContain('`xhigh` → `max`')
  })

  test('output.format reaches each CLI as the README says', () => {
    const flags: Record<AgentName, Record<string, string>> = {
      claude: {
        text: '--output-format text',
        json: '--output-format json',
        'stream-json': '--output-format stream-json',
      },
      codex: { text: '', json: '--json', 'stream-json': '--json' },
      antigravity: {
        text: '',
        json: '--output-format json',
        'stream-json': '--output-format stream-json',
      },
      opencode: { text: '', json: '--format json', 'stream-json': '--format json' },
      copilot: { text: '-s', json: '--output-format json', 'stream-json': '--output-format json' },
      pi: { text: '-p', json: '--mode json', 'stream-json': '--mode json' },
      qwen: {
        text: '--output-format text',
        json: '--output-format json',
        'stream-json': '--output-format stream-json',
      },
      droid: {
        text: '--output-format text',
        json: '--output-format json',
        'stream-json': '--output-format stream-json',
      },
      cursor: {
        text: '--output-format text',
        json: '--output-format json',
        'stream-json': '--output-format stream-json',
      },
      deepseek: { text: '', json: '--json', 'stream-json': '--json' },
    }
    for (const agent of AGENTS) {
      for (const format of ['text', 'json', 'stream-json'] as const) {
        const planned = planCall(adapterFor(agent), { prompt: 'x', output: { format } })
        expect(planned.outputFormat).toBe(format)
        expect(planned.argv.join(' ')).toContain(flags[agent][format]!)
        const notes = planned.notes.filter((n) => n.field === 'output.format')
        // Only an aggregated or interleaved format is noted, and always as approximated.
        for (const n of notes) expect(n.support).toBe('approximated')
        if (format === 'stream-json') expect(notes).toEqual([])
      }
    }
    const cells = tableRow('output.format')
    expect(cells['claude']).toContain('text|json|stream-json')
    expect(cells['codex']).toContain('--json')
    expect(cells['antigravity']).toContain('text|json|stream-json')
    expect(cells['opencode']).toContain('--format json')
    expect(cells['copilot']).toContain('--output-format json')
    expect(cells['pi']).toContain('--mode json')
    expect(cells['qwen']).toContain('text|json|stream-json')
    expect(cells['droid']).toContain('text|json|stream-json')
    expect(cells['cursor']).toContain('text|json|stream-json')
    expect(cells['deepseek']).toContain('--json')
  })

  test('timeoutMs is library-level: no flag, no note, on every agent', () => {
    for (const agent of AGENTS) {
      const planned = planCall(adapterFor(agent), { prompt: 'x', timeoutMs: 1234 })
      expect(planned.argv.join(' ')).not.toContain('1234')
      expect(planned.notes.find((n) => n.field === 'timeoutMs')).toBeUndefined()
    }
    expect(tableRow('timeoutMs')['claude']).toContain('library-level')
  })

  test('maxOutputBytes is library-level: no flag, no note, on every agent', () => {
    for (const agent of AGENTS) {
      const planned = planCall(adapterFor(agent), { prompt: 'x', maxOutputBytes: 4321 })
      expect(planned.argv.join(' ')).not.toContain('4321')
      expect(planned.notes.find((n) => n.field === 'maxOutputBytes')).toBeUndefined()
    }
    expect(tableRow('maxOutputBytes')['claude']).toContain('library-level')
  })

  test('extraArgs are appended verbatim on every agent', () => {
    for (const agent of AGENTS) {
      const planned = planCall(adapterFor(agent), {
        prompt: 'x',
        extraArgs: ['--zz', 'value with space'],
      })
      expect(planned.argv).toContain('--zz')
      expect(planned.argv).toContain('value with space')
    }
    expect(tableRow('extraArgs')['claude']).toContain('appended verbatim')
  })

  test('every README row is covered by a test above', () => {
    const covered = new Set([
      ...ROWS.map((r) => r.label),
      'prompt',
      'effort',
      'output.format',
      'timeoutMs',
      'maxOutputBytes',
      'extraArgs',
    ])
    const uncovered = [...TABLE.keys()].filter(
      (key) => ![...covered].some((label) => key === label || key.startsWith(`${label} `)),
    )
    expect(uncovered).toEqual([])
    expect(TABLE.size).toBeGreaterThanOrEqual(24)
  })
})

test('the capability map heading carries no version', () => {
  expect(README).toMatch(/^### Capability map\s*$/m)
})
