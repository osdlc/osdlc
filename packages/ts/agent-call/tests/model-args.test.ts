import { describe, expect, test } from 'vitest'

import { claudeAdapter } from '../src/adapters/claude.js'
import { codexAdapter } from '../src/adapters/codex.js'
import { modelArgs, modelArgsRefusal } from '../src/model-args.js'

describe('modelArgs', () => {
  test('claude: --model then --effort', () => {
    expect(modelArgs('claude', { model: 'opus', effort: 'high' })).toEqual([
      '--model',
      'opus',
      '--effort',
      'high',
    ])
  })

  test('codex: --model then a quoted model_reasoning_effort override', () => {
    expect(modelArgs('codex', { model: 'gpt-5.5', effort: 'high' })).toEqual([
      '--model',
      'gpt-5.5',
      '-c',
      'model_reasoning_effort="high"',
    ])
  })

  test('codex passes xhigh and max through', () => {
    expect(modelArgs('codex', { effort: 'xhigh' })).toEqual([
      '-c',
      'model_reasoning_effort="xhigh"',
    ])
    expect(modelArgs('codex', { effort: 'max' })).toEqual(['-c', 'model_reasoning_effort="max"'])
  })

  test('codex: a launch mode goes before the model (a local Ollama model)', () => {
    expect(
      modelArgs('codex', {
        via: ['--oss', '--local-provider', 'ollama'],
        model: 'gemma3:4b',
        effort: 'low',
      }),
    ).toEqual([
      '--oss',
      '--local-provider',
      'ollama',
      '--model',
      'gemma3:4b',
      '-c',
      'model_reasoning_effort="low"',
    ])
  })

  test('a tool with no flags wired refuses a launch mode too', () => {
    expect(modelArgsRefusal('cursor', { via: ['--oss'] })).toContain(`launch mode '--oss'`)
    expect(modelArgsRefusal('cursor', { via: [] })).toBeNull()
  })

  test('claude raises none and minimal to low', () => {
    expect(modelArgs('claude', { effort: 'none' })).toEqual(['--effort', 'low'])
    expect(modelArgs('claude', { effort: 'minimal' })).toEqual(['--effort', 'low'])
  })

  test('claude and pi pass xhigh through', () => {
    expect(modelArgs('claude', { effort: 'xhigh' })).toEqual(['--effort', 'xhigh'])
    expect(modelArgs('pi', { effort: 'xhigh' })).toEqual(['--thinking', 'xhigh'])
  })

  test('either half alone', () => {
    expect(modelArgs('claude', { model: 'sonnet' })).toEqual(['--model', 'sonnet'])
    expect(modelArgs('claude', { effort: 'low' })).toEqual(['--effort', 'low'])
  })

  test('nothing set yields nothing, for every tool', () => {
    for (const tool of ['claude', 'codex', 'cursor', 'pi']) {
      expect(modelArgs(tool, {})).toEqual([])
      expect(modelArgs(tool, { model: undefined, effort: undefined })).toEqual([])
    }
  })

  test('pi: --model as given, provider prefix and tag included, then --thinking', () => {
    expect(modelArgs('pi', { model: 'ollama/qwen3:4b', effort: 'high' })).toEqual([
      '--model',
      'ollama/qwen3:4b',
      '--thinking',
      'high',
    ])
    expect(modelArgs('pi', { effort: 'max' })).toEqual(['--thinking', 'max'])
    expect(modelArgsRefusal('pi', { model: 'ollama/x' })).toBeNull()
  })

  test('cursor refuses a model or effort, naming the tool and the model', () => {
    expect(() => modelArgs('cursor', { model: 'gpt-5', effort: 'high' })).toThrow(
      `tool 'cursor' has no model or effort flags wired; cannot pass model 'gpt-5' and effort 'high'`,
    )
    expect(modelArgsRefusal('cursor', { effort: 'low' })).toContain(`effort 'low'`)
  })

  test('an unknown tool refuses, even one named like an Object property', () => {
    expect(modelArgsRefusal('toString', { model: 'x' })).toContain(`tool 'toString'`)
  })

  test('agrees with what the headless adapters emit', () => {
    const claude = claudeAdapter().plan({ prompt: 'x', model: 'opus', effort: 'high' }).argv
    expect(claude.join(' ')).toContain(
      modelArgs('claude', { model: 'opus', effort: 'high' }).join(' '),
    )
    const codex = codexAdapter().plan({ prompt: 'x', model: 'gpt-5.5', effort: 'max' }).argv
    expect(codex.join(' ')).toContain(
      modelArgs('codex', { model: 'gpt-5.5', effort: 'max' }).join(' '),
    )
  })
})
