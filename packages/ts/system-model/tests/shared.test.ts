import { describe, expect, test } from 'vitest'

import { dependenciesIn, tierOf } from '../src/plugins/support/shared.ts'

describe('tierOf', () => {
  test('strips a ./ prefix but not a leading dot-directory', () => {
    expect(tierOf('./packages/a/package.json')).toBe('packages/a')
    expect(tierOf('.github/actions/my-action')).toBe('.github/actions')
    expect(tierOf('.config/tools/x')).toBe('.config/tools')
  })

  test('the root and root-level files group under .', () => {
    expect(tierOf('.')).toBe('.')
    expect(tierOf('./')).toBe('.')
    expect(tierOf('package.json')).toBe('.')
    expect(tierOf('./package.json')).toBe('.')
  })
})

describe('dependenciesIn', () => {
  test('resolves known names to ids, keeps the rest, and drops repeats', () => {
    expect(dependenciesIn('just', 'justfile', ['a', 'x', 'a', 'x'], new Set(['a']))).toEqual({
      dependsOn: ['just:justfile:a'],
      dependsOnUnresolved: ['x'],
    })
    expect(dependenciesIn('just', 'justfile', [], new Set())).toEqual({})
  })
})
