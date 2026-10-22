import { describe, expect, test } from 'vitest'

import { closestMatches, didYouMean } from '../src/index.ts'

describe('closestMatches', () => {
  test('finds a transposition', () => {
    expect(closestMatches('taks', ['task', 'term', 'dev'])).toEqual(['task'])
  })

  test('returns nothing when nothing is close', () => {
    expect(closestMatches('zzzz', ['task'])).toEqual([])
  })

  test('accepts a 3+ character prefix', () => {
    expect(closestMatches('con', ['config', 'conventions', 'task'])).toEqual([
      'config',
      'conventions',
    ])
  })

  test('ignores a prefix shorter than 3 characters', () => {
    expect(closestMatches('ta', ['tasks-and-more'])).toEqual([])
  })

  test('sorts ties alphabetically and caps the count', () => {
    expect(closestMatches('cat', ['cot', 'cut', 'cit', 'cab'])).toEqual(['cab', 'cit', 'cot'])
    expect(closestMatches('cat', ['cot', 'cut', 'cit'], { max: 1 })).toEqual(['cit'])
  })

  test('compares case-insensitively', () => {
    expect(closestMatches('TASK', ['task'])).toEqual(['task'])
  })
})

describe('didYouMean', () => {
  test('formats the line', () => {
    expect(didYouMean('taks', ['task'])).toBe('did you mean: task?')
  })

  test('is null without a match', () => {
    expect(didYouMean('zzzz', ['task'])).toBeNull()
  })
})
