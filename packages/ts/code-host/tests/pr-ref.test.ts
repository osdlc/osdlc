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

  test('owner/repo#N is held to typed-gh parsePrRef slug rule', () => {
    expect(parsePrInput('acme/widgets.js#7')).toEqual({
      kind: 'slug',
      owner: 'acme',
      repo: 'widgets.js',
      number: 7,
    })
    expect(parsePrInput('acme/_private#7')).toMatchObject({ kind: 'slug', repo: '_private' })
    for (const raw of ['-acme/widgets#7', '_acme/widgets#7', '.acme/widgets#7', 'acme/wid get#7']) {
      expect(parsePrInput(raw)).toBeNull()
    }
  })

  test('a GitHub Enterprise PR URL names its repository and keeps its host', () => {
    expect(parsePrInput('https://github.acme.com/acme/widgets/pull/9')).toEqual({
      kind: 'url',
      ref: { codeHost: 'github', host: 'github.acme.com', owner: 'acme', repo: 'widgets', number: 9 },
    })
  })

  test('a URL with a port keeps the host without it', () => {
    const input = parsePrInput('https://GitHub.Acme.com:8443/acme/widgets/pull/9')
    expect(input?.kind === 'url' ? input.ref.host : null).toBe('github.acme.com')
  })

  test('a GitHub URL names the repository too', () => {
    expect(parsePrInput('https://github.com/acme/widgets/pull/42/files')).toEqual({
      kind: 'url',
      ref: { codeHost: 'github', host: 'github.com', owner: 'acme', repo: 'widgets', number: 42 },
    })
  })

  test('anything else is null', () => {
    for (const raw of [
      '0',
      '#0',
      'abc',
      'owner/repo',
      'owner/repo#0',
      'feature/branch',
      'https://github.com/acme/widgets/issues/3',
    ]) {
      expect(parsePrInput(raw)).toBeNull()
    }
  })
})
