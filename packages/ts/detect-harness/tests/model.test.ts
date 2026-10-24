/**
 * The harness model: checks its shape (capabilities with a kind, hooks, MCP
 * servers, permissions and documents, all empty by default) and its helpers.
 */

import { describe, expect, test } from 'vitest'

import { HarnessModelSchema, capabilitiesOfKind, countResources } from '../src/model/schema.ts'

describe('HarnessModel schema', () => {
  test('defaults every control-plane collection to empty', () => {
    const m = HarnessModelSchema.parse({ metadata: { name: 'x', version: '1' } })
    expect(m.modelVersion).toBe('2')
    expect(m.capabilities).toEqual([])
    expect(m.hooks).toEqual([])
    expect(m.mcpServers).toEqual([])
    expect(m.permissions).toEqual({ allow: [], deny: [], ask: [] })
    expect(m.documents).toEqual([])
  })

  test('carries capabilities (skill/command), hooks, mcp, permissions', () => {
    const m = HarnessModelSchema.parse({
      metadata: { name: 'x', version: '1' },
      capabilities: [
        { name: 'a', kind: 'skill', instructions: '# a' },
        { name: 'b', kind: 'command', argumentHint: '<slug>', instructions: '# b' },
      ],
      hooks: [{ event: 'PreToolUse', matcher: 'Bash', action: 'echo hi' }],
      mcpServers: [{ name: 'fs', transport: 'stdio', command: 'mcp-fs', args: ['--root', '.'] }],
      permissions: { allow: ['Bash(git *)'], deny: ['Bash(rm *)'] },
    })
    expect(capabilitiesOfKind(m, 'skill').map((c) => c.name)).toEqual(['a'])
    expect(capabilitiesOfKind(m, 'command').map((c) => c.name)).toEqual(['b'])
    expect(m.hooks[0]!.event).toBe('PreToolUse')
    expect(m.mcpServers[0]!.command).toBe('mcp-fs')
    expect(m.permissions.ask).toEqual([])
  })

  test('countResources totals resources across capabilities', () => {
    const m = HarnessModelSchema.parse({
      metadata: { name: 'x', version: '1' },
      capabilities: [
        { name: 'a', instructions: '# a', resources: [{ path: 'r.ts', contents: '' }] },
        { name: 'b', instructions: '# b', resources: [] },
      ],
    })
    expect(countResources(m)).toBe(1)
  })
})
