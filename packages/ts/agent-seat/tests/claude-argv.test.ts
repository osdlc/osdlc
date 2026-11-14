import { describe, expect, test } from 'vitest'

import {
  CLAUDE_HOOK_EVENTS,
  claudeHookSettings,
  claudeResumeArgv,
  claudeSessionArgv,
  harnessArgv,
} from '../src/index.ts'

const CMD = "'/bin/sdlc' session hook --harness claude --project-root '/p'"

function settingsOf(argv: string[]): {
  hooks: Record<string, { hooks: Record<string, unknown>[] }[]>
} {
  const all = argv.flatMap((a, i) => (a === '--settings' ? [argv[i + 1]!] : []))
  expect(all).toHaveLength(1) // one --settings, never two
  return JSON.parse(all[0]!)
}

describe('claudeHookSettings', () => {
  test('every listed event runs the command; all async except SessionEnd, which has a timeout', () => {
    const { hooks } = claudeHookSettings(CMD)
    expect(Object.keys(hooks).sort()).toEqual(Object.keys(CLAUDE_HOOK_EVENTS).sort())
    expect(Object.keys(hooks)).toEqual(
      expect.arrayContaining([
        'SessionStart',
        'UserPromptSubmit',
        'PostToolUse',
        'PostToolUseFailure',
        'Stop',
        'SubagentStart',
        'SubagentStop',
        'Notification',
        'PreCompact',
        'PostModelSwitch',
        'SessionEnd',
        'PreToolUse',
        'PermissionRequest',
        'StopFailure',
      ]),
    )
    for (const [name, groups] of Object.entries(hooks)) {
      const hook = (groups as { hooks: Record<string, unknown>[] }[])[0]!.hooks[0]!
      expect(hook['type']).toBe('command')
      expect(hook['command']).toBe(CMD)
      if (name === 'SessionEnd') expect(hook).toMatchObject({ timeout: 10 })
      else expect(hook).toMatchObject({ async: true })
      if (name === 'SessionEnd') expect(hook['async']).toBeUndefined()
    }
  })
})

describe('hook events the status mapping needs', () => {
  test('every event claude-status maps to a status is subscribed, PreToolUse only for AskUserQuestion', () => {
    const mapped = [
      'UserPromptSubmit',
      'PreToolUse',
      'PostToolUse',
      'PostToolUseFailure',
      'PermissionRequest',
      'Notification',
      'Stop',
      'StopFailure',
      'SessionStart',
      'SessionEnd',
    ]
    for (const event of mapped) expect(Object.keys(CLAUDE_HOOK_EVENTS)).toContain(event)
    const { hooks } = claudeHookSettings(CMD)
    const groupOf = (name: string) => (hooks[name] as { matcher?: string }[])[0]!
    expect(groupOf('PreToolUse').matcher).toBe('AskUserQuestion')
    expect(groupOf('PermissionRequest').matcher).toBeUndefined()
  })
})

describe('claudeSessionArgv', () => {
  test('a fresh launch presets --session-id and adds the hooks', () => {
    const argv = claudeSessionArgv({ harnessSessionId: 'abc', hookCommand: CMD })
    expect(argv.slice(0, 2)).toEqual(['--session-id', 'abc'])
    expect(settingsOf(argv).hooks['Stop']).toBeDefined()
  })

  test('without a hook command nothing is injected', () => {
    expect(claudeSessionArgv({ appendSystemPrompt: 'x' })).toEqual(['--append-system-prompt', 'x'])
  })

  test('coexists with the system prompt and plugin flags: one --settings carries both', () => {
    const argv = claudeSessionArgv({
      hookCommand: CMD,
      appendSystemPrompt: 'pin',
      plugins: { dirs: ['/pl'], disable: ['a@b'] },
    })
    const settings = settingsOf(argv) as Record<string, unknown>
    expect(settings['enabledPlugins']).toEqual({ 'a@b': false })
    expect(settings['hooks']).toBeDefined()
    expect(argv).toContain('--plugin-dir')
    expect(argv.slice(-2)).toEqual(['--append-system-prompt', 'pin'])
  })

  test('plugins without a disable list get a --settings of just the hooks', () => {
    const argv = claudeSessionArgv({ hookCommand: CMD, plugins: { dirs: ['/pl'], disable: [] } })
    expect(Object.keys(settingsOf(argv))).toEqual(['hooks'])
  })
})

describe('claude launch and resume argv', () => {
  test('interactive: claude --session-id <uuid> --settings <json> -- <prompt>', () => {
    const argv = harnessArgv('claude', 'claude', 'do it', {
      harnessSessionId: 'abc',
      hookCommand: CMD,
    })
    expect(argv[0]).toBe('claude')
    expect(argv.slice(1, 3)).toEqual(['--session-id', 'abc'])
    expect(argv.slice(-2)).toEqual(['--', 'do it'])
    expect(settingsOf(argv).hooks['SessionEnd']).toBeDefined()
  })

  test('other harnesses are untouched', () => {
    expect(
      harnessArgv('codex', 'codex', 'p', { harnessSessionId: 'abc', hookCommand: CMD }),
    ).toEqual(['codex', '--', 'p'])
  })

  test('a resolved choice puts the model flags before the session flags and the `--` guard', () => {
    const choice = { model: 'opus', effort: 'high' }
    expect(harnessArgv('claude', 'claude', 'p', { harnessSessionId: 'abc' }, choice)).toEqual([
      'claude',
      '--model',
      'opus',
      '--effort',
      'high',
      '--session-id',
      'abc',
      '--',
      'p',
    ])
    expect(harnessArgv('codex', 'codex', 'p', {}, { model: 'gpt-5.5', effort: 'high' })).toEqual([
      'codex',
      '--model',
      'gpt-5.5',
      '-c',
      'model_reasoning_effort="high"',
      '--',
      'p',
    ])
  })

  test("codex takes a local model's launch mode before the model, ahead of the `--` guard", () => {
    expect(
      harnessArgv(
        'codex',
        'codex',
        'p',
        {},
        { via: ['--oss', '--local-provider', 'ollama'], model: 'gemma3:4b' },
      ),
    ).toEqual(['codex', '--oss', '--local-provider', 'ollama', '--model', 'gemma3:4b', '--', 'p'])
  })

  test('no choice, or an empty one, leaves the argv as it was', () => {
    expect(harnessArgv('claude', 'claude', 'p', { harnessSessionId: 'abc' }, {})).toEqual(
      harnessArgv('claude', 'claude', 'p', { harnessSessionId: 'abc' }),
    )
    expect(harnessArgv('codex', 'codex', 'p', {}, { model: undefined, effort: undefined })).toEqual(
      ['codex', '--', 'p'],
    )
  })

  test('pi takes the model as given and its effort as --thinking, before the `--` guard', () => {
    expect(harnessArgv('pi', 'pi', 'p', {}, { model: 'ollama/x' })).toEqual([
      'pi',
      '--model',
      'ollama/x',
      '--',
      'p',
    ])
    expect(harnessArgv('pi', 'pi', 'p', {}, { model: 'ollama/x', effort: 'low' })).toEqual([
      'pi',
      '--model',
      'ollama/x',
      '--thinking',
      'low',
      '--',
      'p',
    ])
    expect(harnessArgv('pi', 'pi', 'p')).toEqual(['pi', '--', 'p'])
    expect(harnessArgv('pi', 'pi', 'p', {}, {})).toEqual(['pi', '--', 'p'])
  })

  test('cursor refuses a choice, naming the tool and the model', () => {
    expect(() => harnessArgv('cursor', 'cursor-agent', 'p', {}, { model: 'gpt-5' })).toThrow(
      `tool 'cursor' has no model or effort flags wired; cannot pass model 'gpt-5'`,
    )
  })

  test('resume passes the hooks again and never a --session-id', () => {
    const argv = claudeResumeArgv('abc', { hookCommand: CMD, appendSystemPrompt: 'pin' })
    expect(argv[0]).toBe('--resume=abc')
    expect(argv).not.toContain('--session-id')
    expect(settingsOf(argv).hooks['PostToolUse']).toBeDefined()
    expect(argv.slice(-2)).toEqual(['--append-system-prompt', 'pin'])
  })

  test('a session launched before hooks existed resumes as before', () => {
    expect(claudeResumeArgv('abc', {})).toEqual(['--resume=abc'])
  })
})
