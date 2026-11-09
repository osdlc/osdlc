import { describe, expect, test } from 'vitest'

import { SnapshotLayerSchema } from '../../src/catalogue/schema.ts'
import { BUILTIN_CATALOGUE, SNAPSHOT_LAYER } from '../../src/catalogue/snapshot.ts'

describe('the shipped snapshot', () => {
  test('matches the snapshot schema', () => {
    const parsed = SnapshotLayerSchema.safeParse(SNAPSHOT_LAYER)
    expect(parsed.success ? [] : parsed.error.issues).toEqual([])
  })

  test('merges with no problems', () => {
    expect(BUILTIN_CATALOGUE.problems).toEqual([])
  })

  test('has the tools and providers of the decision', () => {
    expect(Object.keys(BUILTIN_CATALOGUE.tools).sort()).toEqual([
      'antigravity',
      'claude',
      'codex',
      'cursor',
      'opencode',
      'pi',
    ])
    expect(Object.keys(BUILTIN_CATALOGUE.providers).sort()).toEqual([
      'anthropic',
      'google',
      'lmstudio',
      'ollama',
      'openai',
    ])
  })

  test('pi is verified against the version its note checked; antigravity is docs only', () => {
    expect(BUILTIN_CATALOGUE.tools.pi).toMatchObject({ checked_against: '1.1.0' })
    expect(BUILTIN_CATALOGUE.tools.pi?.verify).toBeUndefined()
    expect(BUILTIN_CATALOGUE.tools.antigravity?.checked_against).toBeUndefined()
    expect(BUILTIN_CATALOGUE.tools.antigravity?.verify).toEqual(['serves', 'model', 'effort'])
    expect(BUILTIN_CATALOGUE.tools.codex?.verify).toEqual(['context'])
    expect(BUILTIN_CATALOGUE.tools.cursor?.verify).toEqual(['effort', 'context'])
  })

  test('only opencode and pi call providers with the providers’ keys', () => {
    const keyed = Object.values(BUILTIN_CATALOGUE.tools)
      .filter((t) => t.provider_keys === true)
      .map((t) => t.id)
    expect(keyed.sort()).toEqual(['opencode', 'pi'])
  })

  test('claude takes xhigh and names fable', () => {
    expect(BUILTIN_CATALOGUE.tools.claude?.efforts).toContain('xhigh')
    expect(BUILTIN_CATALOGUE.tools.claude?.aliases?.fable).toBe('anthropic/claude-fable-5-1')
  })

  test('no key_env holds anything but a variable name', () => {
    for (const p of Object.values(BUILTIN_CATALOGUE.providers)) {
      if (p.key_env !== undefined) expect(p.key_env).toMatch(/^[A-Z_][A-Z0-9_]*$/)
    }
  })
})
