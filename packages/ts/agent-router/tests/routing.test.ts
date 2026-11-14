import { describe, expect, test } from 'vitest'
import {
  formatWhen,
  matchRule,
  parseRouting,
  shadowedRules,
  type RoutingRule,
} from '../src/routing.ts'

const RULES: RoutingRule[] = [
  { when: { workflow: 'implement', complexity: 'small' }, profile: 'small' },
  { when: { workflow: 'implement', complexity: 'large' }, profile: 'deep' },
]

const VOCABULARY = { complexity: ['small', 'medium', 'large'] }

describe('parseRouting', () => {
  test('a list of rules parses', () => {
    expect(parseRouting(RULES, VOCABULARY)).toEqual({ ok: true, value: RULES })
  })

  test('an unknown when key names the rule index', () => {
    const r = parseRouting([RULES[0], { when: { size: 'small' }, profile: 'small' }])
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error.kind).toBe('invalid-shape')
      expect(r.error.message).toContain('routing[1]: when')
    }
  })

  test('a value outside the vocabulary names the index and the valid values', () => {
    const r = parseRouting(
      [RULES[0], { when: { complexity: 'low' }, profile: 'small' }],
      VOCABULARY,
    )
    expect(r).toEqual({
      ok: false,
      error: {
        kind: 'invalid-value',
        index: 1,
        key: 'complexity',
        value: 'low',
        valid: ['small', 'medium', 'large'],
        message: "routing[1]: when.complexity: 'low' is not one of small, medium, large",
      },
    })
  })

  test('a key with no vocabulary takes any value', () => {
    expect(parseRouting([{ when: { workflow: 'anything' }, profile: 'p' }], VOCABULARY).ok).toBe(
      true,
    )
  })

  test('a rule needs a profile', () => {
    expect(parseRouting([{ when: {} }]).ok).toBe(false)
  })
})

describe('matchRule', () => {
  test('the first rule whose every key holds wins', () => {
    expect(matchRule(RULES, { workflow: 'implement', complexity: 'small' })?.index).toBe(0)
    expect(matchRule(RULES, { workflow: 'implement', complexity: 'large' })?.index).toBe(1)
    expect(matchRule(RULES, { workflow: 'implement', complexity: 'medium' })).toBeUndefined()
  })

  test('of two matching rules, the first wins', () => {
    const rules: RoutingRule[] = [
      { when: { workflow: 'implement' }, profile: 'a' },
      { when: { workflow: 'implement', complexity: 'small' }, profile: 'b' },
    ]
    expect(matchRule(rules, { workflow: 'implement', complexity: 'small' })).toEqual({
      index: 0,
      rule: rules[0]!,
    })
  })

  test('a key the request lacks does not hold', () => {
    expect(matchRule(RULES, { workflow: 'implement' })).toBeUndefined()
  })

  test('tags match when the request carries any listed tag', () => {
    const rules: RoutingRule[] = [{ when: { tags: ['ui'] }, profile: 'design' }]
    expect(matchRule(rules, { tags: ['api', 'ui'] })?.index).toBe(0)
    expect(matchRule(rules, { tags: ['api'] })).toBeUndefined()
    expect(matchRule(rules, {})).toBeUndefined()
  })

  test('an empty when matches every request', () => {
    expect(matchRule([{ when: {}, profile: 'p' }], {})?.index).toBe(0)
  })
})

describe('shadowedRules', () => {
  test('a rule after one with a broader when is shadowed', () => {
    expect(
      shadowedRules([
        { when: { workflow: 'implement' }, profile: 'a' },
        { when: { workflow: 'implement', complexity: 'small' }, profile: 'b' },
      ]),
    ).toEqual([{ index: 1, by: 0 }])
  })

  test('the same when is shadowed; a narrower earlier rule shadows nothing', () => {
    expect(shadowedRules([...RULES, RULES[0]!])).toEqual([{ index: 2, by: 0 }])
    expect(shadowedRules(RULES)).toEqual([])
    expect(
      shadowedRules([
        { when: { workflow: 'implement', complexity: 'small' }, profile: 'b' },
        { when: { workflow: 'implement' }, profile: 'a' },
      ]),
    ).toEqual([])
  })

  test('tags shadow when the earlier rule lists every tag the later one does', () => {
    expect(
      shadowedRules([
        { when: { tags: ['ui', 'api'] }, profile: 'a' },
        { when: { tags: ['ui'], complexity: 'small' }, profile: 'b' },
        { when: { tags: ['ui', 'docs'] }, profile: 'c' },
        { when: { complexity: 'small' }, profile: 'd' },
      ]),
    ).toEqual([{ index: 1, by: 0 }])
  })
})

test('formatWhen writes the keys in order', () => {
  expect(formatWhen({ complexity: 'small', workflow: 'implement', tags: ['ui', 'api'] })).toBe(
    '{workflow: implement, complexity: small, tags: [ui, api]}',
  )
  expect(formatWhen({})).toBe('{}')
})
