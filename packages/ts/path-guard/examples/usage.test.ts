/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that. The
 * examples build a small tree in a scratch directory, with a symlink in it, so
 * they run where symlinks can be made.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test } from 'vitest'

import {
  MAX_LINK_HOPS,
  PathError,
  canonicalExistingPrefix,
  contains,
  existingPathInside,
  isInside,
  lexicalAbsolute,
  nodeResolver,
  openContainedFile,
  readContainedFile,
  realPathInside,
  realpathOrSelf,
  resolveInside,
  toRelative,
  tryResolveInside,
  validateRelative,
  type ContainedFile,
  type ContainedPath,
  type PathErrorKind,
  type Resolver,
} from '@osdlc/path-guard'

/** What a call throws, or null when it returns. */
function thrown(run: () => unknown): unknown {
  try {
    run()
  } catch (e) {
    return e
  }
  return null
}

let root: string
let vault: string

// The tree: `vault/notes/a.md` is a file inside the vault. `secret.txt` is
// outside it, and `vault/leak.txt` is a symlink to it. The root is real, so
// `tmpdir()` being a symlink (as on macOS) does not change the paths below.
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'path-guard-example-')))
  vault = join(root, 'vault')
  mkdirSync(join(vault, 'notes'), { recursive: true })
  writeFileSync(join(vault, 'notes', 'a.md'), 'hello')
  writeFileSync(join(root, 'secret.txt'), 'secret')
  symlinkSync(join(root, 'secret.txt'), join(vault, 'leak.txt'))
})

afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('check a path a user typed', () => {
  test('validateRelative returns the normalised form', () => {
    expect(validateRelative('notes\\a.md/')).toBe('notes/a.md')
  })

  test('PathError names why a path was refused', () => {
    const kinds: PathErrorKind[] = []
    for (const raw of ['', 'a\0b', '~/x', 'C:\\x', '/etc', '../x', 'a//b']) {
      const error = thrown(() => validateRelative(raw))
      if (error instanceof PathError) kinds.push(error.kind)
    }
    expect(kinds).toEqual([
      'empty',
      'nul',
      'tilde',
      'windows_path',
      'absolute',
      'parent_segment',
      'degenerate_segment',
    ])
  })
})

describe('join a path under a root', () => {
  test('resolveInside returns the joined path, also for a path that does not exist yet', () => {
    expect(resolveInside(vault, 'notes/a.md')).toBe(join(vault, 'notes/a.md'))
    expect(resolveInside(vault, 'notes/new/b.md')).toBe(join(vault, 'notes/new/b.md'))
  })

  test('resolveInside refuses a symlink that leaves the root', () => {
    const error = thrown(() => resolveInside(vault, 'leak.txt'))
    expect(error).toBeInstanceOf(PathError)
    expect(error).toMatchObject({ kind: 'escapes' })
  })

  test('tryResolveInside returns null instead of throwing', () => {
    expect(tryResolveInside(vault, 'notes/a.md')).toBe(join(vault, 'notes/a.md'))
    expect(tryResolveInside(vault, 'leak.txt')).toBeNull()
    expect(tryResolveInside(vault, '../secret.txt')).toBeNull()
  })

  test('the README quick start', () => {
    expect(resolveInside('/srv/data', 'notes/a.md')).toBe('/srv/data/notes/a.md')
    expect(thrown(() => resolveInside('/srv/data', '../etc/passwd'))).toMatchObject({
      kind: 'parent_segment',
    })
  })
})

describe('ask about paths you already hold', () => {
  test('contains compares whole components, after symlinks are resolved', () => {
    expect(contains(vault, join(vault, 'notes', 'new.md'))).toBe(true)
    expect(contains(vault, join(root, 'secret.txt'))).toBe(false)
    expect(contains(vault, `${vault}-bee/x`)).toBe(false)
    expect(contains(vault, join(vault, 'leak.txt'))).toBe(false)
  })

  test('canonicalExistingPrefix keeps the part that does not exist as written', () => {
    expect(canonicalExistingPrefix(join(vault, 'leak.txt'))).toBe(join(root, 'secret.txt'))
    expect(canonicalExistingPrefix(join(vault, 'notes', 'new', 'b.md'))).toBe(
      join(vault, 'notes', 'new', 'b.md'),
    )
  })

  test('realpathOrSelf is the same for an absolute path on the real filesystem', () => {
    expect(realpathOrSelf(join(vault, 'leak.txt'))).toBe(join(root, 'secret.txt'))
  })
})

describe('fold a path as text, and shorten it against a root', () => {
  test('lexicalAbsolute folds `.` and `..` and touches no filesystem', () => {
    expect(lexicalAbsolute('/srv/data/a/./b/../c/')).toBe('/srv/data/a/c')
    expect(lexicalAbsolute('/srv/../../etc')).toBe('/etc')
    // A relative path is anchored at the working directory first.
    expect(lexicalAbsolute('notes/../a.md')).toBe(join(process.cwd(), 'a.md'))
    // No symlink is followed. The filesystem refuses `leak.txt/..`, as `leak.txt` is a file.
    expect(lexicalAbsolute(`${vault}/leak.txt/../x`)).toBe(join(vault, 'x'))
  })

  test('toRelative gives the root-relative path, or throws a PathError', () => {
    expect(toRelative(vault, join(vault, 'notes', 'a.md'))).toBe('notes/a.md')
    expect(thrown(() => toRelative(vault, join(root, 'secret.txt')))).toMatchObject({
      kind: 'escapes',
    })
    expect(thrown(() => toRelative(vault, `${vault}/notes/../a.md`))).toMatchObject({
      kind: 'parent_segment',
    })
  })
})

describe('give the guard another filesystem', () => {
  const missing = () => {
    throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
  }
  /** A filesystem of one directory, `/v`, and nothing in it. */
  const fs: Resolver = {
    realpath: (path) => (path === '/' || path === '/v' ? path : missing()),
    readlink: missing,
  }

  test('a Resolver answers realpath and readlink', () => {
    expect(resolveInside('/v', 'a.md', fs)).toBe('/v/a.md')
    expect(tryResolveInside('/v', '../a.md', fs)).toBeNull()
    expect(contains('/v', '/v/new/deep.md', fs)).toBe(true)
    expect(canonicalExistingPrefix('/v/new/deep.md', fs)).toBe('/v/new/deep.md')
  })

  test('nodeResolver is the real filesystem', () => {
    expect(nodeResolver.realpath(join(vault, 'leak.txt'))).toBe(join(root, 'secret.txt'))
    expect(nodeResolver.readlink(join(vault, 'leak.txt'))).toBe(join(root, 'secret.txt'))
  })

  test('a chain of more than MAX_LINK_HOPS dangling links is refused', () => {
    const dir = join(root, 'chain')
    mkdirSync(dir)
    const links = MAX_LINK_HOPS + 1
    for (let i = 0; i < links; i++) {
      symlinkSync(i + 1 === links ? 'end.json' : `l${i + 1}`, join(dir, `l${i}`))
    }
    expect(MAX_LINK_HOPS).toBe(40)
    expect(tryResolveInside(dir, 'l0')).toBeNull()
  })
})

describe('read a file only when it is inside the root', () => {
  test('isInside compares text and follows no symlink', () => {
    expect(isInside(vault, join(vault, 'notes'))).toBe(true)
    expect(isInside(vault, join(vault, '..', 'secret.txt'))).toBe(false)
    expect(isInside(vault, join(vault, 'leak.txt'))).toBe(true)
  })

  test('realPathInside returns the real path, or null when it leaves the root', async () => {
    await expect(realPathInside(vault, join(vault, 'notes', 'a.md'))).resolves.toBe(
      join(vault, 'notes', 'a.md'),
    )
    await expect(realPathInside(vault, join(vault, 'leak.txt'))).resolves.toBeNull()
  })

  test('existingPathInside returns the path to read and the path for a URL', async () => {
    const found: ContainedPath | null = await existingPathInside(
      vault,
      vault,
      join(vault, 'notes', 'a.md'),
    )
    expect(found).toEqual({ realPath: join(vault, 'notes', 'a.md'), relativePath: 'notes/a.md' })
    await expect(
      existingPathInside(vault, vault, join(vault, 'notes', 'missing.md')),
    ).resolves.toBeNull()
  })

  test('openContainedFile returns a verified handle that the caller closes', async () => {
    const file: ContainedFile | null = await openContainedFile(vault, join(vault, 'notes', 'a.md'))
    if (file === null) throw new Error('expected a handle')
    try {
      expect(file.stats.isFile()).toBe(true)
      expect((await file.handle.readFile()).toString()).toBe('hello')
    } finally {
      await file.handle.close()
    }
    await expect(openContainedFile(vault, join(vault, 'leak.txt'))).resolves.toBeNull()
  })

  test('readContainedFile reads a regular file inside the root', async () => {
    const content = await readContainedFile(vault, join(vault, 'notes', 'a.md'))
    expect(content?.toString()).toBe('hello')
    await expect(readContainedFile(vault, join(vault, 'leak.txt'))).resolves.toBeNull()
    await expect(readContainedFile(vault, join(vault, 'notes'))).resolves.toBeNull()
  })
})
