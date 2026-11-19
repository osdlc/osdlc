import { describe, expect, test } from 'vitest'
import {
  MAX_SIZE,
  TIERS,
  TOOL_ID_PATTERN,
  TRAITS,
  formatQualifiers,
  formatRef,
  formatSize,
  isEffortLevel,
  isTier,
  isToolId,
  isWildcard,
  modelKind,
  modelProblem,
  parseRef,
  parseSize,
} from '@osdlc/agent-router'

// A reference is `tool/model[qualifiers]@effort`; only the tool is required.
describe('parsing and formatting references', () => {
  test('parseRef splits a reference into its parts', () => {
    const parsed = parseRef('claude/opus@high')
    expect(parsed).toEqual({ ok: true, value: { tool: 'claude', model: 'opus', effort: 'high' } })
  })

  test('parseRef reads the bracket group: a context size and traits', () => {
    const parsed = parseRef('claude/fast[ctx=200k,local]')
    if (!parsed.ok) throw new Error(parsed.error.message)
    expect(parsed.value.qualifiers).toEqual({ ctx: 200_000, traits: ['local'] })
  })

  test('parseRef returns an error with a kind instead of throwing', () => {
    const parsed = parseRef('claude/opus[1m]')
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) expect(parsed.error.kind).toBe('native-bracket')
  })

  test('formatRef writes the canonical text, qualifiers sorted', () => {
    const text = formatRef({
      tool: 'codex',
      model: 'max',
      qualifiers: { ctx: 1_000_000, traits: ['reasoning', 'local'] },
      effort: 'high',
    })
    expect(text).toBe('codex/max[ctx=1m,local,reasoning]@high')
  })

  test('formatQualifiers writes the bracket group, or nothing', () => {
    expect(formatQualifiers({ ctx: 'max', traits: ['vision', 'local'] })).toBe(
      '[ctx=max,local,vision]',
    )
    expect(formatQualifiers({ traits: [] })).toBe('')
  })
})

describe('words of the grammar', () => {
  test('TIERS lists the tiers from least to most capable; isTier tests a word', () => {
    expect(TIERS).toEqual(['fast', 'standard', 'max'])
    expect(isTier('standard')).toBe(true)
    expect(isTier('opus')).toBe(false)
  })

  test('TRAITS lists the model traits a qualifier can filter on', () => {
    expect(TRAITS).toContain('local')
    expect(TRAITS).toContain('long-context')
  })

  test('isToolId and TOOL_ID_PATTERN accept lower-case identifiers', () => {
    expect(isToolId('claude')).toBe(true)
    expect(isToolId('my-tool2')).toBe(true)
    expect(isToolId('Claude')).toBe(false)
    expect(TOOL_ID_PATTERN.test('1tool')).toBe(false)
  })

  test('isWildcard is true for `*` with a tier', () => {
    const wildcard = parseRef('*/fast')
    const plain = parseRef('claude/fast')
    if (!wildcard.ok || !plain.ok) throw new Error('parse failed')
    expect(isWildcard(wildcard.value)).toBe(true)
    expect(isWildcard(plain.value)).toBe(false)
  })

  test('modelKind tells a tier from a model name from no model', () => {
    const kind = (text: string) => {
      const parsed = parseRef(text)
      if (!parsed.ok) throw new Error(parsed.error.message)
      return modelKind(parsed.value)
    }
    expect(kind('claude/max')).toBe('tier')
    expect(kind('claude/opus')).toBe('name')
    expect(kind('claude')).toBeUndefined()
  })
})

describe('context sizes', () => {
  test('parseSize reads digits plus k or m as decimal tokens', () => {
    expect(parseSize('200k')).toBe(200_000)
    expect(parseSize('1m')).toBe(1_000_000)
    expect(parseSize('1.5m')).toBeUndefined()
    expect(parseSize('lots')).toBeUndefined()
  })

  test('formatSize is the inverse, rounding down to whole k', () => {
    expect(formatSize(1_000_000)).toBe('1m')
    expect(formatSize(200_000)).toBe('200k')
    expect(formatSize(1_048_576)).toBe('1048k')
    expect(formatSize(500)).toBe('500')
  })
})

// What the parser refuses before anything reaches a tool's command line.
describe('input checks', () => {
  test('isEffortLevel accepts only the effort scale, none to max', () => {
    expect(isEffortLevel('high')).toBe(true)
    expect(isEffortLevel('hgih')).toBe(false)
    expect(parseRef('claude/max@hgih')).toMatchObject({
      ok: false,
      error: { kind: 'unknown-effort' },
    })
  })

  test('modelProblem refuses a model a tool could read as a flag, or that hides a character', () => {
    expect(modelProblem('qwen3:4b')).toBeUndefined()
    expect(modelProblem('--yolo')).toContain("must not start with '-'")
    expect(modelProblem('opus\u200b')).toContain('invisible')
    expect(parseRef('pi/--yolo')).toMatchObject({ ok: false, error: { kind: 'invalid-model' } })
  })

  test('MAX_SIZE is the largest context size a reference can hold', () => {
    expect(MAX_SIZE).toBe(Number.MAX_SAFE_INTEGER)
    expect(parseSize('1m')).toBe(1_000_000)
    expect(parseSize('99999999999999999999999m')).toBeUndefined()
  })
})
