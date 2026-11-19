import { describe, expect, test } from 'vitest'
import { formatRef, isTier, isWildcard, modelKind, parseRef, TIERS } from '../src/ref.ts'

describe('parseRef round trips', () => {
  test.each([
    ['claude', { tool: 'claude' }],
    ['claude/max', { tool: 'claude', model: 'max' }],
    ['claude/opus', { tool: 'claude', model: 'opus' }],
    ['claude/opus-5.5', { tool: 'claude', model: 'opus-5.5' }],
    ['claude/opus-5.5@high', { tool: 'claude', model: 'opus-5.5', effort: 'high' }],
    ['claude@high', { tool: 'claude', effort: 'high' }],
    ['pi/qwen2.5-coder:7b', { tool: 'pi', model: 'qwen2.5-coder:7b' }],
    ['pi/ollama/qwen2.5-coder:7b', { tool: 'pi', model: 'ollama/qwen2.5-coder:7b' }],
    [
      'pi/ollama/qwen2.5-coder:7b@low',
      { tool: 'pi', model: 'ollama/qwen2.5-coder:7b', effort: 'low' },
    ],
  ])('%s', (text, expected) => {
    const parsed = parseRef(text)
    expect(parsed).toEqual({ ok: true, value: expected })
    if (!parsed.ok) return
    expect(formatRef(parsed.value)).toBe(text)
    const again = parseRef(formatRef(parsed.value))
    expect(again).toEqual(parsed)
  })

  test('pi/user@host/model splits on the last @, so host/model is an unknown effort', () => {
    const r = parseRef('pi/user@host/model')
    expect(!r.ok && r.error.kind).toBe('unknown-effort')
  })

  test('splits on the last @', () => {
    expect(parseRef('a/b@c@high')).toEqual({
      ok: true,
      value: { tool: 'a', model: 'b@c', effort: 'high' },
    })
  })
})

describe('parseRef errors', () => {
  test.each([
    ['', 'empty-ref'],
    ['claude/', 'empty-model'],
    ['claude/@high', 'empty-model'],
    ['claude@', 'empty-effort'],
    ['Claude/max', 'invalid-tool'],
    ['my_tool', 'invalid-tool'],
    ['1tool', 'invalid-tool'],
    ['claude/opus@', 'empty-effort'],
    ['/max', 'empty-tool'],
    ['@high', 'empty-tool'],
    [' claude', 'whitespace'],
    ['claude /max', 'whitespace'],
    ['claude/opus\n', 'whitespace'],
  ])('%j -> %s', (text, kind) => {
    const parsed = parseRef(text)
    expect(parsed.ok).toBe(false)
    if (parsed.ok) return
    expect(parsed.error.kind).toBe(kind as typeof parsed.error.kind)
    expect(parsed.error.text).toBe(text)
    if (text !== '') expect(parsed.error.message).toContain(JSON.stringify(text))
  })
})

describe('modelKind / isTier', () => {
  test.each([
    [{ tool: 'claude' }, undefined],
    [{ tool: 'claude', model: 'fast' }, 'tier'],
    [{ tool: 'claude', model: 'standard' }, 'tier'],
    [{ tool: 'claude', model: 'max' }, 'tier'],
    [{ tool: 'claude', model: 'opus' }, 'name'],
    [{ tool: 'claude', model: 'MAX' }, 'name'],
  ])('%j', (ref, kind) => {
    expect(modelKind(ref)).toBe(kind as 'tier' | 'name' | undefined)
  })

  test('isTier', () => {
    expect(TIERS).toEqual(['fast', 'standard', 'max'])
    for (const t of TIERS) expect(isTier(t)).toBe(true)
    expect(isTier('opus')).toBe(false)
    expect(isTier('')).toBe(false)
  })
})

describe('qualifiers and the wildcard', () => {
  test('AC-1: claude/opus[ctx=1m]@high', () => {
    expect(parseRef('claude/opus[ctx=1m]@high')).toEqual({
      ok: true,
      value: {
        tool: 'claude',
        model: 'opus',
        qualifiers: { ctx: 1_000_000, traits: [] },
        effort: 'high',
      },
    })
  })

  test.each<[string, number | 'max']>([
    ['claude/opus[ctx=1k]', 1_000],
    ['claude/opus[ctx=200k]', 200_000],
    ['claude/max[ctx=max]', 'max'],
    ['claude[ctx=2m]', 2_000_000],
  ])('%s -> ctx %j', (text, ctx) => {
    const r = parseRef(text)
    expect(r.ok && r.value.qualifiers?.ctx).toBe(ctx)
  })

  test('AC-2: */fast[local] is the wildcard with a trait', () => {
    expect(parseRef('*/fast[local]')).toEqual({
      ok: true,
      value: { tool: '*', model: 'fast', qualifiers: { traits: ['local'] } },
    })
    const r = parseRef('*/fast')
    expect(r.ok && isWildcard(r.value)).toBe(true)
  })

  test.each(['image-out', 'vision'])(
    '*/standard[%s] parses as a wildcard trait filter',
    (trait) => {
      expect(parseRef(`*/standard[${trait}]`)).toEqual({
        ok: true,
        value: { tool: '*', model: 'standard', qualifiers: { traits: [trait] } },
      })
    },
  )

  test('a tier entry may filter on traits', () => {
    const r = parseRef('claude/fast[reasoning]')
    expect(r.ok && r.value.qualifiers?.traits).toEqual(['reasoning'])
  })

  test.each([
    ['claude/opus[ctx=1m]@high'],
    ['*/fast[ctx=1m,local]@low'],
    ['claude[ctx=max]'],
    ['codex/ollama/gemma3:4b[ctx=32k]'],
  ])('%s round trips', (text) => {
    const r = parseRef(text)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(formatRef(r.value)).toBe(text)
  })

  test('formatRef prints ctx first, then traits sorted', () => {
    const r = parseRef('*/fast[reasoning,local,ctx=1m]')
    expect(r.ok && formatRef(r.value)).toBe('*/fast[ctx=1m,local,reasoning]')
  })

  test('an @ inside the model still splits at the last @ when there are no qualifiers', () => {
    expect(parseRef('a/b@c@low')).toEqual({
      ok: true,
      value: { tool: 'a', model: 'b@c', effort: 'low' },
    })
  })

  test.each([
    ['*', 'wildcard-needs-tier'],
    ['*/opus', 'wildcard-needs-tier'],
    ['*[ctx=1m]', 'wildcard-needs-tier'],
    ['claude/opus[local]', 'traits-need-tier'],
    ['claude[local]', 'traits-need-tier'],
    ['claude/opus[ctx=1m,ctx=2m]', 'duplicate-qualifier'],
    ['*/fast[local,local]', 'duplicate-qualifier'],
    ['claude/opus[1m]', 'native-bracket'],
    ['cursor/x[context=1m]', 'native-bracket'],
    ['claude/opus[]', 'invalid-qualifiers'],
    ['claude/opus[ctx=1m', 'invalid-qualifiers'],
    ['claude/opus]', 'invalid-qualifiers'],
    ['claude/opus[ctx=1m][ctx=2m]', 'invalid-qualifiers'],
    ['claude/opus[ctx=1000]', 'invalid-qualifiers'],
    ['claude/opus[ctx=1M]', 'invalid-qualifiers'],
    ['claude/opus[effort=high]', 'invalid-qualifiers'],
    ['*/fast[fast]', 'invalid-qualifiers'],
    ['claude/opus@high[ctx=1m]', 'invalid-qualifiers'],
    ['claude/opus[,]', 'invalid-qualifiers'],
  ])('%j -> %s', (text, kind) => {
    const r = parseRef(text)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.error.kind).toBe(kind as typeof r.error.kind)
  })

  test('AC-3: a tool bracket names the reference form', () => {
    for (const text of ['claude/opus[1m]', 'cursor/x[context=1m]']) {
      const r = parseRef(text)
      expect(!r.ok && r.error.message).toContain('[ctx=1m]')
    }
  })
})

describe('the model part is a string a tool can be handed', () => {
  test.each([
    'claude/--dangerously-skip-permissions',
    'codex/-c',
    'pi/ollama/-x',
    'claude/opus\u200b',
    'claude/opus\u202e',
    'claude/op\u0000us',
    'claude/opus\u0007',
    'claude/opus\u0085',
    'claude/opus\u2060',
  ])('%j is invalid-model', (text) => {
    const r = parseRef(text)
    expect(!r.ok && r.error.kind).toBe('invalid-model')
  })

  test.each(['pi/ollama/qwen3:4b', 'claude/opus;v2', 'opencode/ollama/x', 'pi/qwen-2.5_coder+q4'])(
    '%j still parses',
    (text) => {
      expect(parseRef(text).ok).toBe(true)
    },
  )

  test('whitespace stays its own error', () => {
    const r = parseRef('claude/opus x')
    expect(!r.ok && r.error.kind).toBe('whitespace')
  })
})

describe('an effort must be one of EFFORT_LEVELS', () => {
  test.each(['claude/max@hgih', '*/max@hgih', 'pi@off', 'claude/max[ctx=1m]@ultra'])(
    '%j is unknown-effort',
    (text) => {
      const r = parseRef(text)
      expect(!r.ok && r.error.kind).toBe('unknown-effort')
      expect(!r.ok && r.error.message).toContain(
        'levels: none, minimal, low, medium, high, xhigh, max',
      )
    },
  )
})

describe('parseRef never throws', () => {
  test.each([5, ['claude'], null, undefined, { tool: 'claude' }])('%j is not-a-string', (input) => {
    const r = parseRef(input)
    expect(!r.ok && r.error.kind).toBe('not-a-string')
  })

  test('an object with no toString is not-a-string, not a throw', () => {
    const r = parseRef(Object.create(null))
    expect(r).toMatchObject({ ok: false, error: { kind: 'not-a-string', text: 'object' } })
  })
})

describe('ctx= sizes are bounded', () => {
  test('a size above Number.MAX_SAFE_INTEGER tokens is refused, with its own message', () => {
    const r = parseRef('claude/opus[ctx=99999999999999999999999m]')
    expect(!r.ok && r.error.kind).toBe('invalid-qualifiers')
    expect(!r.ok && r.error.message).toContain('above the largest size')
  })

  test('the largest size round-trips through formatRef', () => {
    const r = parseRef('claude/opus[ctx=9007199254740k]')
    expect(r.ok && formatRef(r.value)).toBe('claude/opus[ctx=9007199254740k]')
  })
})
