/** Pins the exact interactive argv of every harness, so moving the builders cannot change one. */

import { describe, expect, test } from 'vitest'

import { harnessArgv, hasInteractiveArgv } from '../src/index.ts'

const HOOK = 'sdlc hook'

describe('harnessArgv, every harness', () => {
  test('claude: model flags, session flags, then the guard', () => {
    expect(harnessArgv('claude', 'claude', 'p')).toEqual(['claude', '--', 'p'])
    expect(
      harnessArgv(
        'claude',
        '/bin/claude',
        '-x',
        {
          harnessSessionId: 's',
          appendSystemPrompt: 'pin',
          plugins: { dirs: ['/d'], disable: [] },
        },
        { model: 'opus', effort: 'high' },
        ['--inj'],
      ),
    ).toEqual([
      '/bin/claude',
      '--model',
      'opus',
      '--effort',
      'high',
      '--session-id',
      's',
      '--plugin-dir',
      '/d',
      '--append-system-prompt',
      'pin',
      '--inj',
      '--',
      '-x',
    ])
  })

  test('claude: hooks merge into one --settings', () => {
    const argv = harnessArgv('claude', 'claude', 'p', {
      hookCommand: HOOK,
      plugins: { dirs: [], disable: ['a@b'] },
    })
    expect(argv.indexOf('--settings')).toBe(1)
    const settings = JSON.parse(argv[2]!) as Record<string, unknown>
    expect(Object.keys(settings)).toEqual(['enabledPlugins', 'hooks'])
    expect(argv.slice(3)).toEqual(['--', 'p'])
  })

  test('codex, cursor and pi: <bin> <model> <injected> -- <prompt>', () => {
    for (const h of ['codex', 'cursor', 'pi']) {
      expect(harnessArgv(h, `/x/${h}`, 'p', {}, {}, ['-e', 'ext'])).toEqual([
        `/x/${h}`,
        '-e',
        'ext',
        '--',
        'p',
      ])
    }
    expect(
      harnessArgv('codex', 'codex', 'p', {}, { model: 'm', effort: 'low', via: ['--oss'] }),
    ).toEqual(['codex', '--oss', '--model', 'm', '-c', 'model_reasoning_effort="low"', '--', 'p'])
    expect(harnessArgv('pi', 'pi', 'p', {}, { model: 'a/b', effort: 'none' })).toEqual([
      'pi',
      '--model',
      'a/b',
      '--thinking',
      'off',
      '--',
      'p',
    ])
  })

  test('opencode binds the prompt with = and has no guard', () => {
    expect(harnessArgv('opencode', 'opencode', '-p')).toEqual(['opencode', '--prompt=-p'])
    expect(harnessArgv('opencode', 'opencode', 'p', {}, {}, ['--x'])).toEqual([
      'opencode',
      '--x',
      '--prompt=p',
    ])
  })

  test('a model choice on a tool without model flags throws; so does a tool with no launch', () => {
    expect(() => harnessArgv('cursor', 'cursor', 'p', {}, { model: 'm' })).toThrow(
      /no model or effort/,
    )
    expect(() => harnessArgv('antigravity', 'agy', 'p')).toThrow(
      "'antigravity' has no interactive launch",
    )
    expect(() => harnessArgv('toString', 'x', 'p')).toThrow(/no interactive launch/)
  })

  test('hasInteractiveArgv lists exactly the five launchable tools', () => {
    for (const h of ['claude', 'codex', 'cursor', 'pi', 'opencode']) {
      expect(hasInteractiveArgv(h)).toBe(true)
    }
    for (const h of ['antigravity', 'copilot', 'custom', 'toString']) {
      expect(hasInteractiveArgv(h)).toBe(false)
    }
  })
})
