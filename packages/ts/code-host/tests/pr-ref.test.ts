import { describe, expect, test } from 'vitest'

import { parsePrInput } from '../src/pr-ref.ts'

describe('parsePrInput', () => {
  test('nothing means the current branch', () => {
    expect(parsePrInput(null)).toEqual({ kind: 'current' })
    expect(parsePrInput('')).toEqual({ kind: 'current' })
    expect(parsePrInput('  ')).toEqual({ kind: 'current' })
  })

  test('a number, with or without the hash', () => {
    expect(parsePrInput('42')).toEqual({ kind: 'number', number: 42 })
    expect(parsePrInput('#42')).toEqual({ kind: 'number', number: 42 })
    expect(parsePrInput(' 7 ')).toEqual({ kind: 'number', number: 7 })
  })

  test('owner/repo#N names a PR in another repository', () => {
    expect(parsePrInput('acme/widgets#42')).toEqual({
      kind: 'slug',
      owner: 'acme',
      repo: 'widgets',
      number: 42,
    })
  })

  test('a GitHub URL names the repository too', () => {
    expect(parsePrInput('https://github.com/acme/widgets/pull/42/files')).toEqual({
      kind: 'url',
      ref: { codeHost: 'github', owner: 'acme', repo: 'widgets', number: 42 },
    })
  })

  test('anything else is null', () => {
    for (const raw of [
      '0',
      '#0',
      'abc',
      'owner/repo',
      'owner/repo#0',
      'https://github.com/acme/widgets/issues/3',
    ]) {
      expect(parsePrInput(raw)).toBeNull()
    }
  })
})
