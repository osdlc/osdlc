/**
 * Control-plane reading.
 *
 * Seeds a project with `.claude/settings.json` (hooks, permissions, an stdio MCP
 * server) and a `.mcp.json` (a remote server), and asserts the control plane
 * lands in the model's shapes. Further suites pin the scope rules (local
 * settings over project settings, permission lists merged) and the redaction of
 * secret values.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { readPlugin } from '../model/derive.ts'
import { REDACTED, readClaudeControlPlane } from '../model/control-plane.ts'

let src: string

function writeJson(path: string, value: unknown): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function seed(dir: string): void {
  writeJson(join(dir, '.claude-plugin', 'plugin.json'), {
    name: 'demo',
    version: '1.0.0',
    description: 'd',
  })
  const sk = join(dir, 'skills', 'task-work')
  mkdirSync(sk, { recursive: true })
  writeFileSync(
    join(sk, 'SKILL.md'),
    '---\ndescription: Work.\nallowed-tools:\n  - Bash\n---\n\n# task-work\n\nBody.\n',
  )

  writeJson(join(dir, '.claude', 'settings.json'), {
    permissions: { allow: ['Bash(git *)'], deny: ['Bash(rm -rf *)'] },
    hooks: {
      PreToolUse: [{ matcher: 'Bash', hooks: [{ type: 'command', command: 'guard.sh' }] }],
      Stop: [{ hooks: [{ type: 'command', command: 'cleanup.sh' }] }],
    },
    mcpServers: { fs: { command: 'mcp-fs', args: ['--root', '.'], env: { DEBUG: '1' } } },
  })
  writeJson(join(dir, '.mcp.json'), {
    mcpServers: { web: { type: 'http', url: 'https://mcp.example/sse' } },
  })
}

beforeEach(() => {
  src = mkdtempSync(join(tmpdir(), 'harness-import-'))
  seed(src)
})

afterEach(() => {
  rmSync(src, { recursive: true, force: true })
})

describe('readClaudeControlPlane', () => {
  test('parses permissions, hooks, and stdio + remote MCP servers', () => {
    const cp = readClaudeControlPlane(src)
    expect(cp.permissions).toEqual({ allow: ['Bash(git *)'], deny: ['Bash(rm -rf *)'], ask: [] })
    // hooks sorted by event → matcher → action: PreToolUse(Bash), Stop
    expect(cp.hooks).toEqual([
      { event: 'PreToolUse', matcher: 'Bash', action: 'guard.sh' },
      { event: 'Stop', action: 'cleanup.sh' },
    ])
    // servers sorted by name: fs (stdio), web (remote from .mcp.json)
    expect(cp.mcpServers.map((s) => s.name)).toEqual(['fs', 'web'])
    expect(cp.mcpServers[0]).toEqual({
      name: 'fs',
      transport: 'stdio',
      command: 'mcp-fs',
      args: ['--root', '.'],
      env: { DEBUG: REDACTED },
      headers: {},
    })
    expect(cp.mcpServers[1]!.transport).toBe('http')
    expect(cp.mcpServers[1]!.url).toBe('https://mcp.example/sse')
  })

  test('a root with no sources, or with malformed JSON, yields empty collections', () => {
    const empty = mkdtempSync(join(tmpdir(), 'harness-empty-'))
    try {
      mkdirSync(join(empty, '.claude'), { recursive: true })
      writeFileSync(join(empty, '.claude', 'settings.json'), '{ not json')
      expect(readClaudeControlPlane(empty)).toEqual({
        hooks: [],
        mcpServers: [],
        permissions: { allow: [], deny: [], ask: [] },
      })
    } finally {
      rmSync(empty, { recursive: true, force: true })
    }
  })
})

describe('readClaudeControlPlane — scope precedence', () => {
  test('settings.local.json adds to the permission lists instead of replacing them', () => {
    writeJson(join(src, '.claude', 'settings.json'), { permissions: { allow: ['A'] } })
    writeJson(join(src, '.claude', 'settings.local.json'), {
      permissions: { allow: ['B', 'A'], deny: ['C'] },
    })

    expect(readClaudeControlPlane(src).permissions).toEqual({
      allow: ['A', 'B'],
      deny: ['C'],
      ask: [],
    })
  })

  test('a local MCP server replaces the same-named project server', () => {
    writeJson(join(src, '.claude', 'settings.json'), {
      mcpServers: { fs: { command: 'project-fs' }, only: { command: 'only-project' } },
    })
    writeJson(join(src, '.claude', 'settings.local.json'), {
      mcpServers: { fs: { command: 'local-fs' } },
    })

    const byName = Object.fromEntries(
      readClaudeControlPlane(src).mcpServers.map((s) => [s.name, s]),
    )
    expect(byName['fs']!.command).toBe('local-fs')
    expect(byName['only']!.command).toBe('only-project')
  })

  test('hooks from both settings files are kept', () => {
    writeJson(join(src, '.claude', 'settings.json'), {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'a.sh' }] }] },
    })
    writeJson(join(src, '.claude', 'settings.local.json'), {
      hooks: { Stop: [{ hooks: [{ type: 'command', command: 'b.sh' }] }] },
    })

    expect(readClaudeControlPlane(src).hooks.map((h) => h.action)).toEqual(['a.sh', 'b.sh'])
  })

  test('a settings server wins over the same-named .mcp.json server', () => {
    writeJson(join(src, '.claude', 'settings.json'), { mcpServers: { web: { command: 'wins' } } })

    const web = readClaudeControlPlane(src).mcpServers.find((s) => s.name === 'web')!
    expect(web.transport).toBe('stdio')
    expect(web.command).toBe('wins')
  })
})

describe('readClaudeControlPlane — redaction', () => {
  beforeEach(() => {
    writeJson(join(src, '.mcp.json'), {
      mcpServers: {
        api: { command: 'api-mcp', env: { API_KEY: 'sk-live-123' } },
        remote: { command: 'npx', args: ['mcp-remote', 'https://x.test/?t=1', '--token', 'tk'] },
        web: {
          type: 'sse',
          url: 'https://u:p4ss@mcp.example/sse?key=k1',
          headers: { 'X-Api-Key': 'k2' },
        },
        templated: { type: 'http', url: 'https://mcp.example/${TENANT}?key=${KEY}' },
        tokenUser: { type: 'http', url: 'https://ghp_X@mcp.example/mcp' },
        atInQuery: { type: 'http', url: 'https://mcp.example?mail=a@b' },
      },
    })
  })

  test('replaces env, header, URL password and query values; keeps keys and the rest', () => {
    const servers = Object.fromEntries(
      readClaudeControlPlane(src).mcpServers.map((s) => [s.name, s]),
    )
    expect(servers['api']!.env).toEqual({ API_KEY: REDACTED })
    expect(servers['web']!.headers).toEqual({ 'X-Api-Key': REDACTED })
    expect(servers['web']!.url).toBe(`https://${REDACTED}@mcp.example/sse?key=${REDACTED}`)
    expect(servers['tokenUser']!.url).toBe(`https://${REDACTED}@mcp.example/mcp`)
    expect(servers['atInQuery']!.url).toBe(`https://mcp.example?mail=${REDACTED}`)
    expect(servers['templated']!.url).toBe(`https://mcp.example/\${TENANT}?key=${REDACTED}`)
    expect(servers['remote']!.args).toEqual([
      'mcp-remote',
      `https://x.test/?t=${REDACTED}`,
      '--token',
      REDACTED,
    ])
  })

  test('includeValues: true returns every value as written', () => {
    const servers = Object.fromEntries(
      readClaudeControlPlane(src, { includeValues: true }).mcpServers.map((s) => [s.name, s]),
    )
    expect(servers['api']!.env).toEqual({ API_KEY: 'sk-live-123' })
    expect(servers['web']!.headers).toEqual({ 'X-Api-Key': 'k2' })
    expect(servers['web']!.url).toBe('https://u:p4ss@mcp.example/sse?key=k1')
    expect(servers['remote']!.args).toEqual(['mcp-remote', 'https://x.test/?t=1', '--token', 'tk'])
  })
})

describe('readPlugin — control plane', () => {
  test('folds the control plane into the model', () => {
    const m = readPlugin(src)
    expect(m.capabilities.map((c) => c.name)).toEqual(['task-work'])
    expect(m.hooks.length).toBe(2)
    expect(m.mcpServers.length).toBe(2)
    expect(m.permissions.allow).toEqual(['Bash(git *)'])
  })
})
