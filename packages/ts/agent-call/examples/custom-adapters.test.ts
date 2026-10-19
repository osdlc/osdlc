/**
 * Wrapping other CLIs: `customAdapter` for any one-shot command,
 * `templateAdapter` for an argument template, and the launch-argv helpers
 * (experimental) for callers that build a command line themselves. All of it
 * runs over `node`, so no agent CLI is needed.
 */

import { describe, expect, test } from 'vitest'

import {
  callAgent,
  claudePluginArgv,
  claudeResumeFlag,
  cursorAdapter,
  customAdapter,
  detectAgents,
  modelArgs,
  modelArgsRefusal,
  planCall,
  templateAdapter,
  templateRefusal,
  type AgentAdapter,
  type AgentAvailability,
  type CustomAdapterOptions,
  type ModelChoice,
  type ParsedOutput,
  type RawProcessOutput,
  type TemplateAdapterOptions,
} from '@osdlc/agent-call'

describe('customAdapter', () => {
  test('the effective prompt folds in context, system prompt and schema', () => {
    const options: CustomAdapterOptions = {
      name: 'tool',
      binary: 'node',
      args: (_spec, effectivePrompt) => ['-e', 'console.log(process.argv[1])', effectivePrompt],
    }
    const planned = planCall(customAdapter(options), {
      prompt: 'Do it.',
      systemPrompt: 'Be terse.',
      context: { text: 'Some background.' },
      permissions: { mode: 'edits' },
    })
    const prompt = planned.argv.at(-1)!
    expect(prompt).toContain('Be terse.')
    expect(prompt).toContain('Some background.')
    expect(prompt.endsWith('Do it.')).toBe(true)
    expect(planned.notes.find((n) => n.field === 'permissions.mode')?.support).toBe('dropped')
  })

  test('promptVia stdin sends the prompt on stdin', async () => {
    const reverse = customAdapter({
      name: 'reverse',
      binary: 'node',
      args: () => [
        '-e',
        "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>console.log([...s].reverse().join('')))",
      ],
      promptVia: 'stdin',
    })
    const result = await callAgent(reverse, { prompt: 'abc' })
    expect(result.text).toBe('cba')
  })

  test('parse turns raw output into a ParsedOutput', async () => {
    const json = customAdapter({
      name: 'json',
      binary: 'node',
      args: () => ['-e', 'console.log(JSON.stringify({ answer: 42 }))'],
      parse: (stdout: string, _stderr: string): ParsedOutput => ({
        text: stdout.trim(),
        structured: JSON.parse(stdout),
      }),
    })
    const result = await callAgent(json, { prompt: 'x' })
    expect(result.structured).toEqual({ answer: 42 })
  })

  test('a hand-written AgentAdapter works with callAgent', async () => {
    const adapter: AgentAdapter = {
      name: 'hand-written',
      binary: 'node',
      plan: (spec) => ({
        agent: 'hand-written',
        argv: ['node', '-e', 'console.error("note"); console.log("out")'],
        env: {},
        outputFormat: 'text',
        tempFiles: [],
        notes: [],
        spec,
      }),
      parseResult: (_planned, raw: RawProcessOutput): ParsedOutput => ({
        text: `${raw.stdout.trim()}+${raw.stderr.trim()}`,
      }),
    }
    const result = await callAgent(adapter, { prompt: 'x' })
    expect(result.text).toBe('out+note')
  })

  test('detectAgents probes `--version` for the adapters it is given', async () => {
    const node = customAdapter({ name: 'node', binary: 'node', args: () => [] })
    const missing = customAdapter({ name: 'missing', binary: 'no-such-cli-xyz', args: () => [] })
    const found: AgentAvailability[] = await detectAgents([node, missing])
    expect(found[0]).toMatchObject({ name: 'node', available: true })
    expect(found[0]?.version).toMatch(/^v\d+/)
    expect(found[1]).toEqual({ name: 'missing', available: false, version: undefined })
  })

  test('command takes a launcher or leading arguments, as on the built-in adapters', () => {
    const spec = { prompt: 'Fix the test.' }
    const viaNpx = customAdapter({
      name: 'my-cli',
      command: ['npx', '-y', 'my-cli'],
      args: (_spec, prompt) => ['--message', prompt],
    })
    // planCall(viaNpx, spec).argv starts ['npx', '-y', 'my-cli', '--message', ...]

    expect(planCall(viaNpx, spec).argv).toEqual([
      'npx',
      '-y',
      'my-cli',
      '--message',
      'Fix the test.',
    ])
    expect(viaNpx.binary).toBe('npx')
  })

  test('detectAgents says which command answered, for cursor and its two install names', async () => {
    const [cursor] = await detectAgents([cursorAdapter()])
    // cursor.command is ['agent'] or ['cursor-agent'] when available, else undefined.
    const adapter = cursorAdapter({ command: cursor?.command })

    expect(['agent', 'cursor-agent']).toContain(adapter.binary)
    expect(cursor?.command).toEqual(cursor?.available === true ? adapter.command : undefined)
  })
})

describe('templateAdapter (experimental)', () => {
  const options: TemplateAdapterOptions = {
    name: 'templated',
    binary: 'node',
    args: ['-e', 'console.log(process.argv.slice(1).join("|"))', '{model}', '{prompt}'],
    promptVia: 'argv',
  }

  test('slots are filled whole', async () => {
    const result = await callAgent(templateAdapter(options), { prompt: 'hi', model: 'big' })
    expect(result.text).toBe('big|hi')
  })

  test('a model with no slot, or a slot with no model, is refused', () => {
    const choice: ModelChoice = { model: 'big' }
    expect(templateRefusal(options.args, choice)).toBeNull()
    expect(templateRefusal(options.args, {})).toContain('{model}')
    expect(templateRefusal(['{prompt}'], choice)).toContain('no {model} slot')
  })

  test('an agent with no built-in adapter, such as Aider', () => {
    const aider = templateAdapter({
      name: 'aider',
      binary: 'aider',
      args: ['--message', '{prompt}', '--model', '{model}', '--yes-always', '--no-auto-commits'],
      promptVia: 'argv',
    })
    const planned = planCall(aider, { prompt: 'Fix the typo.', model: 'deepseek/deepseek-chat' })
    expect(planned.argv).toEqual([
      'aider',
      '--message',
      'Fix the typo.',
      '--model',
      'deepseek/deepseek-chat',
      '--yes-always',
      '--no-auto-commits',
    ])
  })

  test('planning throws when the spec does not fit the template', () => {
    expect(() => planCall(templateAdapter(options), { prompt: 'hi' })).toThrow(
      /templated: .*\{model\}/,
    )
  })
})

describe('launch-argv helpers (experimental)', () => {
  test('modelArgs builds model and effort flags for claude, codex and pi', () => {
    expect(modelArgs('claude', { model: 'opus', effort: 'high' })).toEqual([
      '--model',
      'opus',
      '--effort',
      'high',
    ])
    expect(modelArgs('pi', { model: 'p/m', effort: 'low' })).toEqual([
      '--model',
      'p/m',
      '--thinking',
      'low',
    ])
  })

  test('modelArgsRefusal says why a tool cannot take a choice, and modelArgs throws it', () => {
    const choice: ModelChoice = { model: 'x', effort: 'high', via: ['--oss'] }
    const refusal = modelArgsRefusal('other-cli', choice)
    expect(refusal).toContain("tool 'other-cli'")
    expect(() => modelArgs('other-cli', choice)).toThrow(refusal!)
    expect(modelArgsRefusal('claude', choice)).toBeNull()
  })

  test('claudePluginArgv and claudeResumeFlag spell claude flags', () => {
    expect(claudePluginArgv({ dirs: ['/a'], disable: ['x@y'] })).toEqual([
      '--plugin-dir',
      '/a',
      '--settings',
      '{"enabledPlugins":{"x@y":false}}',
    ])
    expect(claudeResumeFlag('-abc')).toBe('--resume=-abc')
  })
})
