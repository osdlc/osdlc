import { describe, expect, test } from 'vitest'

import { BYTES_PER_TOKEN, estimateTokens, formatTokens, jobLabel } from '../src/tokens.ts'

describe('estimateTokens', () => {
  test('divides bytes by the documented constant', () => {
    expect(estimateTokens(400_000)).toBe(400_000 / BYTES_PER_TOKEN)
    expect(estimateTokens(0)).toBe(0)
  })

  test('rounds rather than truncating', () => {
    expect(estimateTokens(BYTES_PER_TOKEN * 3 - 1)).toBe(3)
  })
})

describe('formatTokens', () => {
  test('renders at the precision the magnitude justifies', () => {
    expect(formatTokens(430)).toBe('430')
    expect(formatTokens(8_240)).toBe('8.2k')
    // Above 10k the fraction is noise against a context budget.
    expect(formatTokens(54_800)).toBe('55k')
  })

  test('the 1k and 10k boundaries do not skip a form', () => {
    expect(formatTokens(999)).toBe('999')
    expect(formatTokens(1_000)).toBe('1.0k')
    expect(formatTokens(9_900)).toBe('9.9k')
    // Rounds to 10.0k at one decimal, so it takes the whole-thousand form
    // rather than printing "10.0k" beside a real 10k.
    expect(formatTokens(9_999)).toBe('10k')
    expect(formatTokens(10_000)).toBe('10k')
  })
})

describe('jobLabel', () => {
  const source = { label: 'Core surfaces' }

  test('an unsharded job is named by its source alone', () => {
    expect(jobLabel({ source })).toBe('Core surfaces')
  })

  test('a shard says which slice of the source it is', () => {
    expect(jobLabel({ source, shard: { index: 2, of: 5 } })).toBe('Core surfaces (2/5)')
  })
})
