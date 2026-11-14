import { describe, expect, test } from 'vitest'

import {
  HARNESS_SLUGS,
  configDirEnv,
  credentialEnv,
  idFor,
  loadKnowledge,
  slugFor,
} from '../src/index.js'

describe('HARNESS_SLUGS', () => {
  for (const [id, slug] of Object.entries(HARNESS_SLUGS)) {
    test(`${id} maps to ${slug}, which the data has`, () =>
      expect(loadKnowledge().harnesses[slug], slug).toBeDefined())
  }
})

test('HARNESS_SLUGS cannot be changed at run time', () => {
  expect(Object.isFrozen(HARNESS_SLUGS)).toBe(true)
})

test('slugFor and idFor map both ways, and a name passes through to itself', () => {
  expect(slugFor('claude')).toBe('claude-code')
  expect(slugFor('claude-code')).toBe('claude-code')
  expect(idFor('claude-code')).toBe('claude')
  expect(idFor('claude')).toBe('claude')
  expect(idFor('dsh')).toBe('deepseek')
})

test('an unmapped name has no slug and no id', () => {
  expect(slugFor('nope')).toBeUndefined()
  expect(idFor('nope')).toBeUndefined()
  expect(slugFor('toString')).toBeUndefined()
  expect(idFor('constructor')).toBeUndefined()
})

test('credentialEnv names the credential variables, by id or slug', () => {
  expect(credentialEnv('claude')).toContain('ANTHROPIC_API_KEY')
  expect(credentialEnv('claude-code')).toContain('ANTHROPIC_API_KEY')
  expect(credentialEnv('codex')).toContain('CODEX_API_KEY')
  expect(credentialEnv('cursor')).toContain('CURSOR_API_KEY')
  expect(credentialEnv('no-such-harness')).toEqual([])
})

test('configDirEnv names the config folder variable, by id or slug', () => {
  expect(configDirEnv('claude')).toBe('CLAUDE_CONFIG_DIR')
  expect(configDirEnv('claude-code')).toBe('CLAUDE_CONFIG_DIR')
  expect(configDirEnv('codex')).toBe('CODEX_HOME')
  expect(configDirEnv('no-such-harness')).toBeUndefined()
})
