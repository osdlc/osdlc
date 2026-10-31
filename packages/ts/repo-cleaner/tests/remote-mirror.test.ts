/** Mirror names and messages never carry a URL's credentials. */

import { describe, expect, test } from 'vitest'

import { mirrorName, redactUrl } from '../src/remote-mirror.ts'

describe('redactUrl', () => {
  test('drops user-info, query and fragment, and leaves other text alone', () => {
    expect(redactUrl('https://me:TOKEN@host.example/acme/repo.git')).toBe(
      'https://host.example/acme/repo.git',
    )
    expect(redactUrl('fatal: https://x:TOKEN@h/a/b.git?t=SECRET#f not found')).toBe(
      'fatal: https://h/a/b.git not found',
    )
    expect(redactUrl('git@github.com:acme/repo.git')).toBe('git@github.com:acme/repo.git')
  })
})

describe('mirrorName', () => {
  test('a token in user-info or a query never reaches the name', () => {
    for (const url of [
      'https://me:TOKEN@git.example.com/acme/repo.git',
      'https://git.example.com/acme/repo.git?token=TOKEN',
      'https://git.example.com/acme/repo.git#TOKEN',
    ]) {
      const name = mirrorName(url)
      expect(name).not.toContain('TOKEN')
      expect(name).toMatch(/^git\.example\.com-acme-repo-[0-9a-f]{12}$/)
    }
  })

  test('two URLs of one repository get two mirrors', () => {
    expect(mirrorName('https://github.com/acme/repo.git')).not.toBe(
      mirrorName('git@github.com:acme/repo.git'),
    )
  })
})
