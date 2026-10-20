/**
 * The location table and its resolvers, `current()` and the id aliases.
 */

import { describe, expect, test } from 'vitest'
import { join, resolve } from 'node:path'

import { current } from '../current.ts'
import { BUILTIN_HARNESSES, HARNESS_ALIASES, harnessId } from '../harnesses.ts'
import {
  LOCATIONS,
  resolveBase,
  resolveConfigDir,
  resolveLocations,
  resolveTemplate,
} from '../locations.ts'

const home = '/h'

describe('LOCATIONS', () => {
  test('covers the six harnesses with their binary names', () => {
    expect(Object.keys(LOCATIONS)).toEqual([...BUILTIN_HARNESSES])
    expect(BUILTIN_HARNESSES.map((h) => LOCATIONS[h].binary)).toEqual([
      'claude',
      'codex',
      'cursor-agent',
      'opencode',
      'pi',
      'agy',
    ])
  })

  test('every template resolves', () => {
    for (const h of BUILTIN_HARNESSES) {
      for (const loc of resolveLocations(h, { home, env: {}, projectRoot: '/p' })) {
        expect(loc.resolved, `${h} ${loc.path}`).not.toBeNull()
      }
    }
  })
})

describe('resolvers', () => {
  test('config folders and their overrides', () => {
    expect(resolveConfigDir('claude', { home, env: {} })).toBe(join(home, '.claude'))
    expect(resolveConfigDir('claude', { home, env: { CLAUDE_CONFIG_DIR: '/c' } })).toBe('/c')
    expect(resolveConfigDir('codex', { home, env: { CODEX_HOME: 'rel' } })).toBe(resolve('rel'))
    expect(resolveConfigDir('opencode', { home, env: { XDG_CONFIG_HOME: '/x' } })).toBe(
      join('/x', 'opencode'),
    )
    expect(resolveBase('pi', 'config', { home, env: { PI_CODING_AGENT_DIR: '/pi' } })).toEqual({
      name: 'config',
      path: '/pi',
      envVar: 'PI_CODING_AGENT_DIR',
    })
  })

  test('an empty override counts as unset', () => {
    expect(resolveConfigDir('codex', { home, env: { CODEX_HOME: '' } })).toBe(join(home, '.codex'))
  })

  test('the managed folder per platform, under the system root', () => {
    const at = (platform: NodeJS.Platform) =>
      resolveBase('claude', 'managed', { home, env: {}, platform, systemRoot: '/s' }).path
    expect(at('darwin')).toBe(join('/s', 'Library', 'Application Support', 'ClaudeCode'))
    expect(at('linux')).toBe(join('/s', 'etc', 'claude-code'))
    expect(at('freebsd')).toBe(join('/s', 'etc', 'claude-code'))
  })

  test('a null home or project leaves those paths unresolved', () => {
    expect(resolveConfigDir('claude', { home: null, env: {} })).toBeNull()
    expect(resolveTemplate('claude', '{project}/.mcp.json', { home, env: {} })).toBeNull()
  })

  test('without a harness, ~, {project} and {system} resolve and a base throws', () => {
    const ctx = { home, env: {}, projectRoot: '/p', systemRoot: '/s' }
    expect(resolveTemplate(null, '{system}/Applications/X.app', ctx)).toBe(
      join('/s', 'Applications', 'X.app'),
    )
    expect(resolveTemplate(null, '~/x', ctx)).toBe(join(home, 'x'))
    expect(resolveTemplate(null, '{project}/x', ctx)).toBe(join('/p', 'x'))
    expect(() => resolveTemplate(null, '{config}/x', ctx)).toThrow(/needs a built-in harness/)
  })

  test('the global state file follows CLAUDE_CONFIG_DIR', () => {
    const state = (env: Record<string, string>) =>
      resolveLocations('claude', { home, env }).find((l) => l.role === 'global-state')!
    expect(state({}).resolved).toBe(join(home, '.claude.json'))
    expect(state({ CLAUDE_CONFIG_DIR: '/c' })).toMatchObject({
      resolved: join('/c', '.claude.json'),
      envVar: 'CLAUDE_CONFIG_DIR',
    })
  })

  test('pi sessions follow PI_CODING_AGENT_SESSION_DIR, else the agent folder', () => {
    const sessions = (env: Record<string, string>) =>
      resolveLocations('pi', { home, env }).find((l) => l.role === 'sessions')!.resolved
    expect(sessions({})).toBe(join(home, '.pi', 'agent', 'sessions'))
    expect(sessions({ PI_CODING_AGENT_DIR: '/a' })).toBe(join('/a', 'sessions'))
    expect(sessions({ PI_CODING_AGENT_SESSION_DIR: '/s' })).toBe('/s')
  })
})

describe('current', () => {
  test('each harness by its variable', () => {
    expect(current({ CLAUDECODE: '1' })).toEqual({ harness: 'claude', evidence: 'CLAUDECODE' })
    expect(current({ CODEX_THREAD_ID: 't' })?.harness).toBe('codex')
    expect(current({ CURSOR_AGENT: '1' })?.harness).toBe('cursor')
    expect(current({ OPENCODE: '1' })?.harness).toBe('opencode')
    expect(current({ PI_CODING_AGENT: 'true' })?.harness).toBe('pi')
  })

  test('AI_AGENT is read last, through the aliases', () => {
    expect(current({ AI_AGENT: 'agy' })).toEqual({ harness: 'antigravity', evidence: 'AI_AGENT' })
    expect(current({ AI_AGENT: 'pi', CLAUDECODE: '1' })?.harness).toBe('claude')
    expect(current({ AI_AGENT: 'something-else' })).toBeNull()
  })

  test('a weak marker loses to any strong marker and to AI_AGENT', () => {
    expect(current({ CURSOR_TRACE_ID: 'x', OPENCODE: '1' })).toEqual({
      harness: 'opencode',
      evidence: 'OPENCODE',
    })
    expect(current({ CURSOR_TRACE_ID: 'x', PI_CODING_AGENT: 'true' })?.harness).toBe('pi')
    expect(current({ CURSOR_TRACE_ID: 'x', AI_AGENT: 'pi' })).toEqual({
      harness: 'pi',
      evidence: 'AI_AGENT',
    })
    expect(current({ CURSOR_TRACE_ID: 'x' })).toEqual({
      harness: 'cursor',
      evidence: 'CURSOR_TRACE_ID',
    })
  })

  test('nothing set, or set empty, is null', () => {
    expect(current({})).toBeNull()
    expect(current({ CLAUDECODE: '' })).toBeNull()
  })
})

describe('ids', () => {
  test('aliases map other spellings and binary names to the ids', () => {
    expect(HARNESS_ALIASES['claude-code']).toBe('claude')
    expect(harnessId('codex-cli')).toBe('codex')
    expect(harnessId('open-code')).toBe('opencode')
    expect(harnessId('pi')).toBe('pi')
    expect(harnessId('gemini')).toBeUndefined()
    expect(harnessId('toString')).toBeUndefined()
  })
})
