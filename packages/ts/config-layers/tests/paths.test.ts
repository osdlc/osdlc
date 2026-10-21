import { describe, expect, test } from 'vitest'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'

import {
  PATH_NAME,
  PathNameError,
  substitutePathNames,
  pathNames,
  pathsSchema,
  resolveConfigPath,
} from '../paths.ts'

const ROOT = '/work/app'

describe('resolveConfigPath', () => {
  test('expands ~ and resolves a relative path against the base', () => {
    expect(resolveConfigPath('~/Developer', ROOT)).toBe(join(homedir(), 'Developer'))
    expect(resolveConfigPath('./checkouts', ROOT)).toBe(resolve(ROOT, 'checkouts'))
    expect(resolveConfigPath('/srv/repos', ROOT)).toBe('/srv/repos')
  })

  test('a home option replaces the real home, with or without a trailing slash', () => {
    expect(resolveConfigPath('~/Developer', ROOT, { home: '/home/me' })).toBe('/home/me/Developer')
    expect(resolveConfigPath('~', ROOT, { home: '/home/me' })).toBe('/home/me')
  })

  test('~user is not expanded; it resolves as a relative path', () => {
    expect(resolveConfigPath('~bob/x', ROOT, { home: '/home/me' })).toBe(resolve(ROOT, '~bob/x'))
  })

  test('with HOME unset or empty, ~ falls back to os.homedir()', () => {
    const prev = process.env['HOME']
    try {
      delete process.env['HOME']
      expect(resolveConfigPath('~/x', ROOT)).toBe(join(homedir(), 'x'))
      process.env['HOME'] = ''
      // Under Node, os.homedir() reads the empty HOME too and returns ''. `~` stays unexpanded.
      expect(resolveConfigPath('~/x', ROOT)).toBe(resolve(ROOT, '~/x'))
      expect(resolveConfigPath('~/x', ROOT, { home: '' })).toBe(resolve(ROOT, '~/x'))
    } finally {
      if (prev === undefined) delete process.env['HOME']
      else process.env['HOME'] = prev
    }
  })

  test('without a home option, ~ follows $HOME at call time', () => {
    const prev = process.env['HOME']
    process.env['HOME'] = '/home/tester'
    try {
      expect(resolveConfigPath('~/auth', ROOT)).toBe('/home/tester/auth')
    } finally {
      if (prev === undefined) delete process.env['HOME']
      else process.env['HOME'] = prev
    }
  })

  test('leaves alone what is not a path — a URL, a bare word', () => {
    expect(resolveConfigPath('https://example.com/x', ROOT)).toBe('https://example.com/x')
    expect(resolveConfigPath('claude', ROOT)).toBe('claude')
  })
})

describe('pathNames', () => {
  test('the machine entry wins per name, and every value is absolute', () => {
    const names = pathNames(ROOT, { dev: '~/Machine' }, { dev: './Project', work: './w' })
    expect(names['dev']).toBe(join(homedir(), 'Machine'))
    expect(names['work']).toBe(resolve(ROOT, 'w'))
  })
})

describe('pathNames with a home', () => {
  test('~ expands to the given home', () => {
    expect(pathNames(ROOT, { dev: '~/Machine' }, {}, { home: '/home/me' })['dev']).toBe(
      '/home/me/Machine',
    )
  })
})

describe('substitutePathNames', () => {
  test('replaces every name it knows', () => {
    expect(substitutePathNames('{dev}/{owner}', { dev: '/d', owner: 'acme' }, 'repos:')).toBe(
      '/d/acme',
    )
  })

  test('an unknown name is an error naming the setting, the fix and what exists', () => {
    let err: unknown
    try {
      substitutePathNames('{nope}/x', { dev: '/d' }, 'repos:')
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(PathNameError)
    const message = (err as Error).message
    expect(message).toContain("'{nope}'")
    expect(message).toContain('repos:')
    expect(message).toContain('define it under paths:')
    expect(message).toContain('{dev}')
  })

  test('the tool names its own files in the hint', () => {
    expect(() =>
      substitutePathNames('{nope}', {}, 'repos:', { defineHint: 'define it in tooly.yaml' }),
    ).toThrow('define it in tooly.yaml')
  })
})

describe('pathsSchema', () => {
  test('accepts a name → directory map', () => {
    expect(pathsSchema().parse({ dev: '~/Developer' })).toEqual({ dev: '~/Developer' })
  })

  test('refuses a malformed name, an empty value, and a reserved name', () => {
    expect(PATH_NAME.test('dev_2')).toBe(true)
    expect(pathsSchema().safeParse({ '2dev': '/x' }).success).toBe(false)
    expect(pathsSchema().safeParse({ dev: '   ' }).success).toBe(false)
    const reserved = pathsSchema({ reserved: ['host', 'owner', 'repo'] })
    expect(reserved.safeParse({ owner: '/x' }).success).toBe(false)
    expect(reserved.safeParse({ dev: '/x' }).success).toBe(true)
  })
})
