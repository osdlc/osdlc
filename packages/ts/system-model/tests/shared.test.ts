import { describe, expect, test } from 'vitest'

import type { Task } from '../src/model.ts'
import { dependenciesIn, shLineArgs, tierOf } from '../src/plugins/support/shared.ts'

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

describe('shLineArgs', () => {
  const task = (line: string) => ({ runner: 'procfile', argv: ['sh', '-c', line] }) as Task

  test('a redirection is not a second command', () => {
    for (const line of ['make 2>&1', 'make <&3', 'make &>log']) {
      expect(shLineArgs(task(line), ['x'])).toEqual(['sh', '-c', `${line} "$@"`, 'sh', 'x'])
    }
  })

  test('a separator still refuses arguments', () => {
    for (const line of ['a && b', 'a & b', 'make 2>&1 &']) {
      expect(() => shLineArgs(task(line), ['x'])).toThrow('more than one command')
    }
  })
})
