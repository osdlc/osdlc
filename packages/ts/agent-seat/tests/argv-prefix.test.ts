import { describe, expect, test } from 'vitest'

import * as seat from '../src/index.ts'
import { harnessArgv, harnessAvailable } from '../src/index.ts'

describe('harnessArgv with a launcher prefix', () => {
  const prefix = ['npx', '-y', 'claude']

  test('claude: the prefix leads, session flags follow it', () => {
    const argv = harnessArgv('claude', prefix, 'hi', { harnessSessionId: 'abc' }, {}, ['--x'])
    expect(argv).toEqual(['npx', '-y', 'claude', '--session-id', 'abc', '--x', '--', 'hi'])
  })

  test('a one-word array equals the string form, for every harness shape', () => {
    for (const h of ['claude', 'codex', 'cursor', 'pi', 'opencode'] as const) {
      expect(harnessArgv(h, [h], 'p')).toEqual(harnessArgv(h, h, 'p'))
    }
  })

  test('codex and opencode keep their own shape after the prefix', () => {
    expect(harnessArgv('codex', ['npx', 'codex'], 'p')).toEqual(['npx', 'codex', '--', 'p'])
    expect(harnessArgv('opencode', ['npx', 'opencode'], 'p')).toEqual([
      'npx',
      'opencode',
      '--prompt=p',
    ])
  })

  test('an empty binary, empty prefix or empty word throws', () => {
    expect(() => harnessArgv('claude', [], 'p')).toThrow(/needs a binary/)
    expect(() => harnessArgv('claude', '', 'p')).toThrow(/needs a binary/)
    expect(() => harnessArgv('claude', ['npx', ''], 'p')).toThrow(/needs a binary/)
  })

  test('harnessAvailable looks up the first word', () => {
    expect(harnessAvailable('claude', ['node', '-y'])).toBe(true)
    expect(harnessAvailable('claude', ['no-such-launcher', 'node'])).toBe(false)
    expect(harnessAvailable('claude', [])).toBe(false)
  })
})

describe('pure argv builders are exported', () => {
  test('the create and spawn builders are on the package entry', () => {
    const names = Object.keys(seat).filter((k) =>
      /^(orca|cmux|otty|herdr|wezterm|tmux).*Argv$/.test(k),
    )
    expect(names).toEqual(
      expect.arrayContaining([
        'orcaCreateArgv',
        'cmuxCreateArgv',
        'ottyCreateArgv',
        'herdrWorkspaceCreateArgv',
        'weztermSpawnArgv',
        'tmuxCreateArgv',
      ]),
    )
    for (const n of names) expect(typeof (seat as Record<string, unknown>)[n]).toBe('function')
  })

  test('orcaCreateArgv and cmuxCreateArgv build the create commands', () => {
    const req = { cwd: '/w', title: 't', argv: ['echo', 'a b'] }
    expect(seat.orcaCreateArgv(req)).toEqual(
      expect.arrayContaining(['terminal', 'create', '--worktree', 'path:/w', '--title', 't']),
    )
    expect(seat.cmuxCreateArgv(req).slice(0, 2)).toEqual(['workspace', 'create'])
  })
})
