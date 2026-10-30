/**
 * The guard's Windows path rules, through a fake filesystem, so they run on
 * every OS. `resolve.ts` reads `process.platform` once, at load, so the guard
 * is loaded again here as on Windows.
 */

import { describe, expect, test, vi } from 'vitest'

import type { Resolver } from '../src/resolve.ts'

const platform = Object.getOwnPropertyDescriptor(process, 'platform')!
Object.defineProperty(process, 'platform', { value: 'win32' })
vi.resetModules()
const { PathGuard } = await import('../src/guard.ts')
const { PathError } = await import('../src/errors.ts')
const { readSuite, run } = await import('./conformance.ts')
Object.defineProperty(process, 'platform', platform)

function enoent(): never {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
}

/**
 * A resolver over a fixed table, as `tests/guard.test.ts` has, keyed by the
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

function thrownBy(run: () => unknown): unknown {
  try {
    run()
  } catch (e) {
    return e
  }
  return null
}

/** The kind of the `PathError` `run` throws, or null when it returns. */
function kindOf(run: () => unknown): string | null {
  const e = thrownBy(run)
  if (e === null) return null
  if (e instanceof PathError) return e.kind
  throw e
}

describe('guard.resolve on Windows', () => {
  const fs = table(
    { 'C:/v': 'C:\\v', 'C:/v/escape': 'D:\\outside', 'C:/v/alias': 'C:\\v\\real' },
    { 'C:/v/out.json': '..\\outside\\p.json', 'C:/v/in.json': 'sub\\new.json' },
  )

  test('returns the joined path with `\\` separators', () => {
    expect(new PathGuard(fs).resolve('C:\\v', 'Notes/a.md')).toBe('C:\\v\\Notes\\a.md')
    expect(new PathGuard(fs).resolve('C:/v', 'Notes\\a.md')).toBe('C:\\v\\Notes\\a.md')
    expect(new PathGuard(fs).resolve('C:\\v\\', 'a.md')).toBe('C:\\v\\a.md')
  })

  test('refuses a link to another drive', () => {
    expect(new PathGuard(fs).tryResolve('C:\\v', 'escape/secret.txt')).toBeNull()
    expect(new PathGuard(fs).tryResolve('C:\\v', 'escape')).toBeNull()
  })

  test('accepts a link that stays inside', () => {
    expect(new PathGuard(fs).resolve('C:\\v', 'alias/a.md')).toBe('C:\\v\\alias\\a.md')
  })

  test('follows a dangling link with a `\\` target', () => {
    expect(new PathGuard(fs).tryResolve('C:\\v', 'out.json')).toBeNull()
    expect(new PathGuard(fs).resolve('C:\\v', 'in.json')).toBe('C:\\v\\in.json')
  })

  test('refuses an empty or relative root, as on POSIX', () => {
    expect(kindOf(() => new PathGuard(nothing).resolve('', 'a.md'))).toBe('empty_root')
    expect(kindOf(() => new PathGuard(nothing).resolve('missing\\..', 'a.md'))).toBe('not_absolute')
  })

  test('takes a root as absolute only with a drive and a root, or a UNC share', () => {
    const guard = new PathGuard(nothing)
    expect(guard.resolve('\\\\srv\\share', 'a.md')).toBe('\\\\srv\\share\\a.md')
    for (const root of ['/v', '\\v', 'C:v', 'C:', 'v']) {
      expect(kindOf(() => guard.resolve(root, 'a.md'))).toBe('not_absolute')
    }
  })

  // As Rust's prefix parser: a UNC root needs a server and a share.
  test('takes a UNC, verbatim or device root as absolute as Rust does', () => {
    const guard = new PathGuard(nothing)
    const absolute = [
      '\\\\srv\\x',
      '\\\\srv\\share',
      '//srv/share',
      '\\\\?\\C:\\x',
      '\\\\?\\UNC\\srv\\share',
      '\\\\.\\COM1',
    ]
    for (const path of absolute)
      expect(
        kindOf(() => guard.realPath(path)),
        path,
      ).toBeNull()
    // A server with an empty share, and a server alone.
    for (const path of ['\\\\srv\\\\x', '\\\\srv', '//srv']) {
      expect(
        kindOf(() => guard.realPath(path)),
        path,
      ).toBe('not_absolute')
    }
  })
})

describe('guard.contains on Windows', () => {
  test('folds `..` as text before it follows a link, as Windows does', () => {
    const fs = table({ 'C:/v': 'C:\\v', 'C:/v/link': 'D:\\out' })
    // On POSIX `link/..` would be the parent of the link's target, `D:\`.
    expect(new PathGuard(fs).contains('C:\\v', 'C:\\v\\link\\..\\x')).toBe(true)
    expect(new PathGuard(fs).contains('C:\\v', 'C:\\v\\..\\w')).toBe(false)
  })

  test('matches a drive in any case', () => {
    expect(new PathGuard(nothing).contains('c:\\v', 'C:\\v\\a')).toBe(true)
  })

  // A known difference from the Rust crate, recorded in D-03: Rust compares a UNC server and
  // share exactly, and matches only a drive letter in any case.
  test('matches a UNC server and share in any case, as Windows does', () => {
    expect(new PathGuard(nothing).contains('\\\\srv\\share\\v', '\\\\SRV\\Share\\v\\a')).toBe(true)
  })

  test('compares the names after the root as written', () => {
    expect(new PathGuard(nothing).contains('C:\\v', 'C:\\V\\a')).toBe(false)
  })

  test('tells drives and shares apart', () => {
    expect(new PathGuard(nothing).contains('C:\\v', 'D:\\v\\a')).toBe(false)
    expect(new PathGuard(nothing).contains('\\\\srv\\share\\v', '\\\\srv\\share\\v\\a')).toBe(true)
    expect(new PathGuard(nothing).contains('\\\\srv\\share\\v', '\\\\srv\\other\\v\\a')).toBe(false)
    expect(new PathGuard(nothing).contains('\\\\srv\\share', '\\\\srv\\share\\a')).toBe(true)
  })

  test('refuses a path with a root but no drive, which reads the current drive', () => {
    expect(kindOf(() => new PathGuard(nothing).contains('/v', 'C:\\v'))).toBe('not_absolute')
    expect(kindOf(() => new PathGuard(nothing).contains('C:\\v', '\\v\\a'))).toBe('not_absolute')
  })
})

describe('guard.realPath on Windows', () => {
  test('gives the real path of the existing part with `\\` separators', () => {
    const fs = table({ 'C:/v': 'C:\\real\\v' })
    expect(new PathGuard(fs).realPath('C:/v/new/a.md')).toBe('C:\\real\\v\\new\\a.md')
    expect(new PathGuard(fs).realPath('C:\\v\\x\\..\\a.md')).toBe('C:\\real\\v\\a.md')
  })
})

// `C:` with no separator is the working directory on drive C, so `C:..` is its
// parent. The guard takes no such path as input, but a link target can be one.
describe('a link to a bare drive on Windows', () => {
  const fs = table(
    { 'C:': 'C:\\work', 'C:/work': 'C:\\work', 'C:..': 'C:\\' },
    {
      'C:/work/up': 'C:..\\secret',
      'C:/work/twice': 'C:a\\..\\..\\secret',
      'C:/work/in': 'C:new\\a.md',
    },
  )

  test('keeps a `..` after a bare drive, so it climbs out of the working directory', () => {
    expect(new PathGuard(fs).contains('C:\\work', 'C:\\work\\up')).toBe(false)
    expect(new PathGuard(fs).realPath('C:\\work\\up')).toBe('C:\\secret')
    expect(new PathGuard(fs).realPath('C:\\work\\twice')).toBe('C:\\secret')
  })

  test('joins a name onto a bare drive with no separator', () => {
    expect(new PathGuard(fs).realPath('C:\\work\\in')).toBe('C:\\work\\new\\a.md')
    expect(new PathGuard(fs).contains('C:\\work', 'C:\\work\\in')).toBe(true)
  })
})

// The conformance suite's `resolve_windows_names` cases that run on Windows,
// on every host, through the suite's runner loaded as on Windows. On Windows,
// tests/conformance.test.ts runs them too.
describe('Windows names', () => {
  for (const c of readSuite().sections['resolve_windows_names']?.cases ?? []) {
    if (c.platforms?.includes('windows') === false) continue
    test(c.name, () => {
      expect(run('resolve_windows_names', c.input)).toEqual(
        c.error === undefined ? { expect: c.expect } : { error: { kind: c.error.kind } },
      )
    })
  }

  test('the refusal names the segment', () => {
    expect(
      thrownBy(() => new PathGuard(nothing).resolve('C:\\v', 'logs/aux.txt/a:b')),
    ).toMatchObject({
      kind: 'reserved_name',
      message: 'path names a reserved device name on Windows: "aux.txt" in "logs/aux.txt/a:b"',
    })
  })

  test('the refusal comes before the filesystem is read', () => {
    let calls = 0
    const counting: Resolver = {
      realpath: () => (calls++, enoent()),
      readlink: () => (calls++, enoent()),
    }
    expect(new PathGuard(counting).tryResolve('C:\\v', 'a/NUL')).toBeNull()
    expect(calls).toBe(0)
  })
})
