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
    },
  },
]

/** The capability-map table rows: first column (backticks removed) to the four agent cells. */
function readmeTable(): Map<string, string[]> {
  const start = README.indexOf('### Capability map')
  expect(start).toBeGreaterThan(-1)
  const rows = new Map<string, string[]>()
  for (const line of README.slice(start).split('\n').slice(1)) {
    if (!line.startsWith('|')) {
      if (rows.size > 0) break
      continue
    }
    const cells = line
      .replace(/^\||\|\s*$/g, '')
      .split(/(?<!\\)\|/)
      .map((c) => c.trim().replace(/\\\|/g, '|'))
    if (cells[0] === 'Spec field' || /^-+$/.test(cells[0] ?? '')) continue
    rows.set((cells[0] ?? '').replaceAll('`', ''), cells.slice(1))
  }
  return rows
}

const TABLE = readmeTable()

/** The README row whose label is `label`, or one that starts with it and a space. */
function tableRow(label: string): string[] {
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
    for (const [index, agent] of AGENTS.entries()) {
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

        const shown = tableRow(row.label)[index]
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
    const cells = tableRow('prompt')
    expect(cells[0]).toBe('stdin')
    expect(cells[1]).toContain('stdin')
    expect(cells[2]).toContain('-p <prompt>')
    expect(cells[3]).toBe('positional')
  })

  test('effort xhigh and max clamp to high on antigravity only', () => {
    for (const effort of ['xhigh', 'max'] as const) {
      for (const agent of AGENTS) {
        const planned = planCall(adapterFor(agent), { prompt: 'x', effort })
        const note = planned.notes.find((n) => n.field === 'effort')
        if (agent === 'antigravity') {
          expect(note?.support).toBe('approximated')
          expect(planned.argv.join(' ')).toContain('--effort high')
        } else {
          expect(planned.argv.join(' ')).toContain(effort)
        }
      }
    }
    expect(tableRow('effort')[2]).toContain('`xhigh`, `max` → `high`')
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
    expect(cells[0]).toContain('text|json|stream-json')
    expect(cells[1]).toContain('--json')
    expect(cells[2]).toContain('text|json|stream-json')
    expect(cells[3]).toContain('--format json')
  })

  test('timeoutMs is library-level: no flag, no note, on every agent', () => {
    for (const agent of AGENTS) {
      const planned = planCall(adapterFor(agent), { prompt: 'x', timeoutMs: 1234 })
      expect(planned.argv.join(' ')).not.toContain('1234')
      expect(planned.notes.find((n) => n.field === 'timeoutMs')).toBeUndefined()
    }
    expect(tableRow('timeoutMs')[0]).toContain('library-level')
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
    expect(tableRow('extraArgs')[0]).toContain('appended verbatim')
  })

  test('every README row is covered by a test above', () => {
    const covered = new Set([
      ...ROWS.map((r) => r.label),
      'prompt',
      'effort',
      'output.format',
      'timeoutMs',
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
