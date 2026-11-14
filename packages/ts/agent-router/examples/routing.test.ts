import { describe, expect, test } from 'vitest'
import { unwrap } from '@osdlc/result'
import {
  RoutingConfigSchema,
  formatWhen,
  matchRule,
  parseRouting,
  shadowedRules,
} from '@osdlc/agent-router'

// A `routing:` section: rules that pick a profile name, first match wins.
const section = [
  { when: { workflow: 'implement', complexity: 'small' }, profile: 'quick' },
  { when: { workflow: 'implement' }, profile: 'deep' },
  { when: { workflow: 'implement', complexity: 'large' }, profile: 'never-reached' },
]

function rules() {
  return unwrap(parseRouting(section))
}

describe('routing rules', () => {
  test('parseRouting returns the rules in order', () => {
    expect(rules().map((r) => r.profile)).toEqual(['quick', 'deep', 'never-reached'])
  })

  test('parseRouting checks values against a vocabulary and names the rule', () => {
    const parsed = parseRouting(section, { complexity: ['small', 'medium'] })
    expect(parsed.ok).toBe(false)
    if (!parsed.ok) {
      expect(parsed.error).toMatchObject({ kind: 'invalid-value', index: 2, key: 'complexity' })
    }
  })

  test('RoutingConfigSchema is strict about the shape of a section', () => {
    expect(RoutingConfigSchema.safeParse(section).success).toBe(true)
    expect(RoutingConfigSchema.safeParse([{ when: { colour: 'red' }, profile: 'p' }]).success).toBe(
      false,
    )
  })

  test('matchRule returns the first rule that holds, with its index', () => {
    const hit = matchRule(rules(), { workflow: 'implement', complexity: 'large' })
    expect(hit?.index).toBe(1)
    expect(hit?.rule.profile).toBe('deep')
    expect(matchRule(rules(), { workflow: 'review' })).toBeUndefined()
  })

  test('shadowedRules finds a rule an earlier, broader rule always wins over', () => {
    expect(shadowedRules(rules())).toEqual([{ index: 2, by: 1 }])
  })

  test('formatWhen writes a `when` as the config does', () => {
    expect(formatWhen({ workflow: 'implement', tags: ['ui', 'web'] })).toBe(
      '{workflow: implement, tags: [ui, web]}',
    )
  })
})
