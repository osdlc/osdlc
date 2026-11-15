import { describe, expect, test } from 'vitest'

import { layerCatalogue, queryCatalogue } from '../src/catalogue/index.ts'
import { BUILTIN_QUERY, SNAPSHOT_LAYER } from '../src/catalogue/snapshot.ts'
import { launchMode, viaArgs } from '../src/launch-mode.ts'

/** The snapshot plus what a host's model refresh adds for a running Ollama. */
const MACHINE = queryCatalogue(
  layerCatalogue([
    SNAPSHOT_LAYER,
    {
      source: 'probe:ollama',
      observed_at: '2026-10-10',
      models: { 'ollama/gemma3:4b': { traits: ['local', 'agent'], status: 'current' } },
    },
  ]),
)

describe('launchMode', () => {
  test('a local model the catalogue holds takes its offering via and native name', () => {
    const local = {
      args: ['--oss', '--local-provider', 'ollama'],
      model: 'gemma3:4b',
      key: 'ollama/gemma3:4b',
    }
    expect(launchMode(MACHINE, 'codex', 'ollama/gemma3:4b')).toEqual(local)
    // A tier or a bare name resolves to the same offering.
    expect(launchMode(MACHINE, 'codex', 'gemma3:4b')).toEqual(local)
  })

  test('a provider-qualified model the catalogue lacks takes the mode codex serves its provider with', () => {
    expect(launchMode(BUILTIN_QUERY, 'codex', 'lmstudio/qwen3-8b')).toEqual({
      args: ['--oss', '--local-provider', 'lmstudio'],
      model: 'qwen3-8b',
      key: 'lmstudio/qwen3-8b',
    })
  })

  test('a model on a provider served directly needs no mode', () => {
    expect(launchMode(BUILTIN_QUERY, 'codex', 'gpt-6-astra')).toBeUndefined()
    expect(launchMode(BUILTIN_QUERY, 'codex', 'no-such-model')).toBeUndefined()
    expect(launchMode(BUILTIN_QUERY, 'codex', 'openai/no-such-model')).toBeUndefined()
    // pi names a local model `provider/id` itself; it serves ollama with no mode.
    expect(launchMode(MACHINE, 'pi', 'ollama/gemma3:4b')).toBeUndefined()
    expect(launchMode(BUILTIN_QUERY, 'claude', 'opus')).toBeUndefined()
  })

  test('a via splits on whitespace', () => {
    expect(viaArgs('  --oss   --local-provider ollama ')).toEqual([
      '--oss',
      '--local-provider',
      'ollama',
    ])
  })
})

describe('viaArgs', () => {
  test('a blank via is no flags, never an empty argument', () => {
    expect(viaArgs('   ')).toEqual([])
    expect(viaArgs('')).toEqual([])
    expect(viaArgs(' --oss  --local-provider ollama ')).toEqual([
      '--oss',
      '--local-provider',
      'ollama',
    ])
  })
})
