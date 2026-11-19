// The shared built-ins are deep-frozen, and query results hand out copies, so
// no caller can change what every other caller resolves against.
import { describe, expect, test } from 'vitest'

import { BUILTIN_CATALOGUE, BUILTIN_QUERY, SNAPSHOT_LAYER } from '../src/catalogue/snapshot.ts'
import { queryCatalogue } from '../src/catalogue/query.ts'
import { HEADLESS_SLOTS } from '../src/catalogue/schema.ts'
import { DEFAULT_CHAIN_ORDER } from '../src/chains.ts'
import { AVAILABILITY_REASONS, PROFILE_SKIP_REASONS } from '../src/choose.ts'
import { BUILTIN_CLASSIFY_RULES } from '../src/classify.ts'
import { BUILTIN_PROFILES, parseProfiles } from '../src/profile.ts'
import { TIERS, TRAITS } from '../src/ref.ts'
import { ROUTING_KEYS } from '../src/routing.ts'

function deeplyFrozen(value: unknown, path = '$'): string[] {
  if (typeof value !== 'object' || value === null) return []
  const own = Object.isFrozen(value) ? [] : [path]
  return [...own, ...Object.entries(value).flatMap(([k, v]) => deeplyFrozen(v, `${path}.${k}`))]
}

describe('shared built-ins are deep-frozen', () => {
  test.each([
    ['SNAPSHOT_LAYER', SNAPSHOT_LAYER],
    ['BUILTIN_CATALOGUE', BUILTIN_CATALOGUE],
    ['BUILTIN_QUERY', BUILTIN_QUERY],
    ['BUILTIN_PROFILES', BUILTIN_PROFILES],
    ['BUILTIN_CLASSIFY_RULES', BUILTIN_CLASSIFY_RULES],
    ['DEFAULT_CHAIN_ORDER', DEFAULT_CHAIN_ORDER],
    ['TIERS', TIERS],
    ['TRAITS', TRAITS],
    ['AVAILABILITY_REASONS', AVAILABILITY_REASONS],
    ['PROFILE_SKIP_REASONS', PROFILE_SKIP_REASONS],
    ['ROUTING_KEYS', ROUTING_KEYS],
    ['HEADLESS_SLOTS', HEADLESS_SLOTS],
  ])('%s', (_name, value) => {
    expect(deeplyFrozen(value)).toEqual([])
  })

  test('a push onto a built-in profile throws and changes nothing', () => {
    expect(() => (BUILTIN_PROFILES.default as string[]).push('claude/max')).toThrow(TypeError)
    const p = parseProfiles({})
    expect(p.ok && p.value.default?.order).toHaveLength(1)
  })
})

describe('query results are copies', () => {
  test('effortsFor hands out a fresh array', () => {
    const q = queryCatalogue(structuredClone(BUILTIN_CATALOGUE))
    const first = q.effortsFor('claude') as string[]
    first.push('ultra')
    expect(q.effortsFor('claude')).not.toContain('ultra')
    expect(q.tool('claude')?.efforts).not.toContain('ultra')
  })

  test('queryCatalogue copies order and pins, and freezes them', () => {
    const order = ['codex', 'claude']
    const pins: Record<string, string> = { 'claude/max': 'opus' }
    const q = queryCatalogue(BUILTIN_CATALOGUE, { order, pins })
    order.reverse()
    pins['claude/max'] = 'haiku'
    expect(q.chainOrder).toEqual(['codex', 'claude'])
    expect(q.tierModel('claude', 'max')).toBe('opus')
    expect(Object.isFrozen(q.chainOrder)).toBe(true)
    expect(Object.isFrozen(q.pins)).toBe(true)
    expect(Object.isFrozen(q.offerings)).toBe(true)
  })
})
