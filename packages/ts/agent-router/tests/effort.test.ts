import { describe, expect, test } from 'vitest'

import { EFFORT_LEVELS } from '@osdlc/agent-call/models'

import { BUILTIN_QUERY } from '../src/catalogue/snapshot.ts'
import { adjustEffort, effortAdjustedMessage } from '../src/effort.ts'
import { parseRef } from '../src/ref.ts'
import { resolveRef } from '../src/resolve.ts'

describe('adjustEffort', () => {
  test('a supported effort is kept', () => {
    expect(adjustEffort('high', ['low', 'high'])).toEqual({ effort: 'high' })
  })

  test('one step up is preferred over one step down', () => {
    expect(adjustEffort('medium', ['low', 'high'])).toEqual({
      effort: 'high',
      adjusted: { requested: 'medium', direction: 'up', used: 'high' },
    })
  })

  test('one step down when the step up is not supported', () => {
    expect(adjustEffort('max', ['high', 'xhigh'])).toEqual({
      effort: 'xhigh',
      adjusted: { requested: 'max', direction: 'down', used: 'xhigh' },
    })
  })

  test('two steps is no match, at either end of the scale', () => {
    expect(adjustEffort('none', ['low', 'medium'])).toBeUndefined()
    expect(adjustEffort('max', ['low', 'high'])).toBeUndefined()
    expect(adjustEffort('medium', [])).toBeUndefined()
  })

  test('an effort off the scale is never moved', () => {
    expect(adjustEffort('ultra', ['max'])).toBeUndefined()
    expect(adjustEffort('off', ['off'])).toEqual({ effort: 'off' })
  })

  test('the message names both levels and the direction', () => {
    expect(effortAdjustedMessage({ requested: 'xhigh', direction: 'down', used: 'high' })).toBe(
      "effort 'xhigh' is not supported; using 'high', one step down",
    )
  })
})

// The catalogue speaks agent-call's scale; each adapter translates to its tool's own word.
describe('the snapshot speaks EFFORT_LEVELS', () => {
  test('every effort on every tool and model is a level', () => {
    const levels: readonly string[] = EFFORT_LEVELS
    const off: string[] = []
    for (const tool of BUILTIN_QUERY.knownTools()) {
      for (const e of BUILTIN_QUERY.effortsFor(tool) ?? []) {
        if (!levels.includes(e)) off.push(`${tool}: ${e}`)
      }
      for (const o of BUILTIN_QUERY.offerings.filter((x) => x.tool === tool)) {
        for (const e of BUILTIN_QUERY.effortsFor(tool, o.native_name) ?? []) {
          if (!levels.includes(e)) off.push(`${tool}/${o.native_name}: ${e}`)
        }
      }
    }
    expect(off).toEqual([])
  })

  test("pi@none resolves: agent-call sends it as pi's --thinking off", () => {
    const ref = parseRef('pi@none')
    if (!ref.ok) throw new Error(ref.error.message)
    const resolved = resolveRef(ref.value, { catalogue: BUILTIN_QUERY })
    expect(resolved.ok && resolved.value.effort).toBe('none')
  })
})
