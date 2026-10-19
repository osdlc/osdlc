/**
 * The containment layer's Windows path rules, through a fake filesystem, so
 * they run on every OS. `resolve.ts` reads `process.platform` once, at load, so
 * it is loaded again here as on Windows.
 */

import { describe, expect, test, vi } from 'vitest'

import type { Resolver } from '../resolve.ts'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
Object.defineProperty(process, 'platform', { value: 'win32' })
vi.resetModules()
const { canonicalExistingPrefix, contains, resolveInside, tryResolveInside } =
  await import('../resolve.ts')
Object.defineProperty(process, 'platform', platform)

function enoent(): never {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
}

/**
 * A resolver over a fixed table, as `tests/resolve.test.ts` has, keyed by the
 * `/` form the guard asks in. Answers use `\`, as Windows gives them. Each
 * drive root exists.
 */
function table(entries: Record<string, string>, links: Record<string, string> = {}): Resolver {
  return {
    realpath: (path) =>
      /^[A-Z]:\/$/i.test(path) ? path.replace('/', '\\') : (entries[path] ?? enoent()),
    readlink: (path) => links[path] ?? enoent(),
  }
}

const nothing: Resolver = { realpath: enoent, readlink: enoent }

describe('resolveInside on Windows', () => {
  const fs = table(
    { 'C:/v': 'C:\\v', 'C:/v/escape': 'D:\\outside', 'C:/v/alias': 'C:\\v\\real' },
    { 'C:/v/out.json': '..\\outside\\p.json', 'C:/v/in.json': 'sub\\new.json' },
  )

  test('returns the joined path with `\\` separators', () => {
    expect(resolveInside('C:\\v', 'Notes/a.md', fs)).toBe('C:\\v\\Notes\\a.md')
    expect(resolveInside('C:/v', 'Notes\\a.md', fs)).toBe('C:\\v\\Notes\\a.md')
    expect(resolveInside('C:\\v\\', 'a.md', fs)).toBe('C:\\v\\a.md')
  })

  test('refuses a link to another drive', () => {
    expect(tryResolveInside('C:\\v', 'escape/secret.txt', fs)).toBeNull()
    expect(tryResolveInside('C:\\v', 'escape', fs)).toBeNull()
  })

  test('accepts a link that stays inside', () => {
    expect(resolveInside('C:\\v', 'alias/a.md', fs)).toBe('C:\\v\\alias\\a.md')
  })

  test('follows a dangling link with a `\\` target', () => {
    expect(tryResolveInside('C:\\v', 'out.json', fs)).toBeNull()
    expect(resolveInside('C:\\v', 'in.json', fs)).toBe('C:\\v\\in.json')
  })

  test('refuses an empty root, as on POSIX', () => {
    expect(tryResolveInside('', 'a.md', nothing)).toBeNull()
    expect(tryResolveInside('missing\\..', 'a.md', nothing)).toBeNull()
  })
})

describe('contains on Windows', () => {
  test('folds `..` as text before it follows a link, as Windows does', () => {
    const fs = table({ 'C:/v': 'C:\\v', 'C:/v/link': 'D:\\out' })
    // On POSIX `link/..` would be the parent of the link's target, `D:\`.
    expect(contains('C:\\v', 'C:\\v\\link\\..\\x', fs)).toBe(true)
    expect(contains('C:\\v', 'C:\\v\\..\\w', fs)).toBe(false)
  })

  test('matches a drive in any case', () => {
    expect(contains('c:\\v', 'C:\\v\\a', nothing)).toBe(true)
  })

  test('compares the names after the root as written', () => {
    expect(contains('C:\\v', 'C:\\V\\a', nothing)).toBe(false)
  })

  test('tells drives and shares apart', () => {
    expect(contains('C:\\v', 'D:\\v\\a', nothing)).toBe(false)
    expect(contains('C:\\v', '\\v\\a', nothing)).toBe(false)
    expect(contains('\\\\srv\\share\\v', '\\\\srv\\share\\v\\a', nothing)).toBe(true)
    expect(contains('\\\\srv\\share\\v', '\\\\srv\\other\\v\\a', nothing)).toBe(false)
    expect(contains('\\\\srv\\share', '\\\\srv\\share\\a', nothing)).toBe(true)
  })

  test('takes POSIX-style paths as rooted on the current drive', () => {
    expect(contains('/v', '/x/../v/out', nothing)).toBe(true)
    expect(contains('/v', '/v/../w', nothing)).toBe(false)
  })
})

describe('canonicalExistingPrefix on Windows', () => {
  test('gives the real path of the existing part with `\\` separators', () => {
    const fs = table({ 'C:/v': 'C:\\real\\v' })
    expect(canonicalExistingPrefix('C:/v/new/a.md', fs)).toBe('C:\\real\\v\\new\\a.md')
    expect(canonicalExistingPrefix('C:\\v\\x\\..\\a.md', fs)).toBe('C:\\real\\v\\a.md')
  })
})
