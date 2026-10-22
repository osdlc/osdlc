/**
 * The Codex and Cursor providers: MCP servers, hooks (with Codex trust), skill
 * folders, instruction files and sign-in evidence.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { join } from 'node:path'

import { codexHookHash } from '../src/read/hooks.ts'
import { REDACTED } from '../src/read/redact.ts'
import { fixture, type Fixture } from './fixture.ts'

let f: Fixture

beforeEach(() => {
  f = fixture()
})

afterEach(() => {
  f.cleanup()
})

describe('codex', () => {
  test('codexHookHash is the sha256 of the normalised handler (value computed by the same algorithm)', () => {
    const hook = { type: 'command', command: 'true', statusMessage: 'session log' }
    expect(codexHookHash('SessionStart', { hooks: [hook] }, hook)).toBe(
      'sha256:8f48ba5d0ee2b77650f3d72f1b6449ecc8acae0d82831a3b7a4816debd769d03',
    )
  })

  test('MCP servers from user and project config.toml; project wins; values redacted', async () => {
    f.write(f.home, {
      '.codex/config.toml': [
        '[mcp_servers.shared]',
        'command = "user-cmd"',
        'env = { TOKEN = "secret" }',
        '[mcp_servers.off]',
        'command = "x"',
        'enabled = false',
        '[mcp_servers.remote]',
        'url = "https://x.test/mcp?key=abc"',
        'http_headers = { Authorization = "Bearer abc" }',
      ].join('\n'),
    })
    f.write(f.project, { '.codex/config.toml': '[mcp_servers.shared]\ncommand = "project-cmd"\n' })
    const r = await f.report('codex')
    expect(r.mcpServers.map((s) => [s.name, s.scope, s.active])).toEqual([
      ['shared', 'user', false],
      ['off', 'user', false],
      ['remote', 'user', true],
      ['shared', 'project', true],
    ])
    expect(r.mcpServers[0]!.env).toEqual({ TOKEN: REDACTED })
    const remote = r.mcpServers[2]!
    expect([remote.transport, remote.url, remote.headers]).toEqual([
      'http',
      `https://x.test/mcp?key=${REDACTED}`,
      { Authorization: REDACTED },
    ])
    expect(JSON.stringify(r)).not.toContain('secret')
  })

  test('hooks carry the trust recorded in the user config.toml', async () => {
    const hooksPath = join(f.home, '.codex', 'hooks.json')
    const trusted = { type: 'command', command: 'ok' }
    const changed = { type: 'command', command: 'changed' }
    const fresh = { type: 'command', command: 'fresh' }
    f.write(f.home, {
      '.codex/hooks.json': {
        hooks: { Stop: [{ hooks: [trusted, changed] }], PostToolUse: [{ hooks: [fresh] }] },
      },
      '.codex/config.toml': [
        `[hooks.state."${hooksPath}:stop:0:0"]`,
        `trusted_hash = "${codexHookHash('Stop', { hooks: [trusted] }, trusted)}"`,
        `[hooks.state."${hooksPath}:stop:0:1"]`,
        'trusted_hash = "sha256:older"',
      ].join('\n'),
    })
    const r = await f.report('codex')
    expect(r.hooks.map((h) => [h.event, h.command, h.trust])).toEqual([
      ['Stop', 'ok', 'trusted'],
      ['Stop', 'changed', 'modified'],
      ['PostToolUse', 'fresh', 'untrusted'],
    ])
  })

  test('invalid TOML is an error source and a warning', async () => {
    f.write(f.home, { '.codex/config.toml': '[[[ nope' })
    const r = await f.report('codex')
    const src = r.sources.find((s) => s.path === join(f.home, '.codex', 'config.toml'))!
    expect(src.status).toBe('error')
    expect(r.diagnostics[0]!.message).toContain('not valid TOML')
  })

  test('CODEX_HOME, skill folders, instructions and auth.json', async () => {
    const codexHome = join(f.root, 'codex-home')
    f.write(codexHome, { 'auth.json': '{}', 'skills/old/SKILL.md': '---\nname: old\n---\n' })
    f.write(f.home, { '.agents/skills/new/SKILL.md': '---\ndescription: New.\n---\n' })
    f.write(f.project, { '.agents/skills/proj/SKILL.md': '# p\n', 'AGENTS.md': '# a\n' })
    const r = await f.report('codex', { env: { CODEX_HOME: codexHome } })
    expect(r.skills.map((s) => [s.name, s.scope])).toEqual([
      ['old', 'user'],
      ['new', 'user'],
      ['proj', 'project'],
    ])
    expect(r.instructions).toEqual([{ path: join(f.project, 'AGENTS.md'), scope: 'project' }])
    expect(r.auth).toEqual({
      signedIn: true,
      evidence: join(codexHome, 'auth.json'),
      providers: null,
    })
    expect(r.configDirs).toEqual([
      { name: 'config', path: codexHome, envVar: 'CODEX_HOME', exists: true },
    ])
  })

  test('an API key variable is evidence', async () => {
    expect((await f.report('codex', { env: { CODEX_API_KEY: 'k' } })).auth.evidence).toBe(
      'CODEX_API_KEY',
    )
  })
})

describe('cursor', () => {
  test('MCP servers, flat hooks, skills and instructions', async () => {
    f.write(f.home, {
      '.cursor/mcp.json': {
        mcpServers: { a: { command: 'user-a' }, b: { url: 'https://b.test' } },
      },
      '.cursor/hooks.json': { version: 1, hooks: { stop: [{ command: 'notify', timeout: 5 }] } },
      '.cursor/skills/s1/SKILL.md': '---\ndescription: S1.\n---\n',
    })
    f.write(f.project, {
      '.cursor/mcp.json': { mcpServers: { a: { command: 'project-a' } } },
      '.cursor/hooks.json': {
        hooks: { beforeShellExecution: [{ command: 'guard', matcher: 'rm' }] },
      },
      '.cursor/rules/style.mdc': '---\n---\n',
      '.cursorrules': 'old rules\n',
    })
    const r = await f.report('cursor')
    expect(r.mcpServers.map((s) => [s.name, s.scope, s.transport, s.active])).toEqual([
      ['a', 'user', 'stdio', false],
      ['b', 'user', 'http', true],
      ['a', 'project', 'stdio', true],
    ])
    expect(
      r.hooks.map((h) => [h.event, h.matcher, h.command, h.timeout, h.trust, h.scope]),
    ).toEqual([
      ['stop', null, 'notify', 5, null, 'user'],
      ['beforeShellExecution', 'rm', 'guard', null, null, 'project'],
    ])
    expect(r.skills.map((s) => s.name)).toEqual(['s1'])
    expect(r.instructions.map((i) => i.path)).toEqual([
      join(f.project, '.cursorrules'),
      join(f.project, '.cursor', 'rules', 'style.mdc'),
    ])
  })

  test('the app bundle counts as an install when cursor-agent is not on PATH', async () => {
    f.write(join(f.system, 'Applications', 'Cursor.app'), { 'Contents/Info.plist': '' })
    const r = await f.report('cursor')
    expect(r.install).toEqual({
      binary: 'cursor-agent',
      probed: true,
      found: true,
      path: join(f.system, 'Applications', 'Cursor.app'),
      how: 'app bundle',
      version: null,
    })
    expect(r.status).toBe('ok')
  })
})
