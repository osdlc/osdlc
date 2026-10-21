/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that. The
 * examples build a small tree in a scratch directory, with a symlink in it, so
 * they run where symlinks can be made.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, expectTypeOf, test } from 'vitest'

import {
  MAX_LINK_HOPS,
  PathError,
  PathGuard,
  lexical,
  type PathErrorKind,
  type PathWarning,
  type Resolver,
} from '@osdlc/path-guard'
import {
  absolute,
  isUnder,
  toRelative,
  validateRelative,
  type PathErrorKind as LexicalErrorKind,
  type PathWarning as LexicalWarning,
} from '@osdlc/path-guard/lexical'
import {
  existingPathInside,
  nodeGuard,
  nodeResolver,
  openContainedFile,
  readContainedFile,
  realPathInside,
  type ContainedFile,
  type ContainedPath,
} from '@osdlc/path-guard/node'

const WINDOWS = process.platform === 'win32'

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
// `tmpdir()` being a symlink (as on macOS) or holding a short name (as on
// Windows) does not change the paths below.
beforeEach(() => {
  root = realpathSync.native(mkdtempSync(join(tmpdir(), 'path-guard-example-')))
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
  test('lexical.validateRelative returns the normalised form', () => {
    expect(lexical.validateRelative('notes\\a.md/')).toBe('notes/a.md')
  })

  test('PathError names why a path was refused', () => {
    const kinds: PathErrorKind[] = []
    for (const raw of ['', 'a\0b', '~/x', 'C:\\x', '/etc', '../x', 'a//b']) {
      const error = thrown(() => lexical.validateRelative(raw))
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

  test('onWarning hears about Windows device names and streams, on every platform', () => {
    const warnings: PathWarning[] = []
    expect(lexical.validateRelative('logs/NUL.txt', { onWarning: (w) => warnings.push(w) })).toBe(
      'logs/NUL.txt',
    )
    expect(warnings).toEqual([{ kind: 'reserved_name', segment: 'NUL.txt' }])
  })
})

describe('join a path under a root, on the real disk', () => {
  test('nodeGuard.resolve returns the joined path, also for a path that does not exist yet', () => {
    expect(nodeGuard.resolve(vault, 'notes/a.md')).toBe(join(vault, 'notes/a.md'))
    expect(nodeGuard.resolve(vault, 'notes/new/b.md')).toBe(join(vault, 'notes/new/b.md'))
  })

  test('nodeGuard.resolve refuses a symlink that leaves the root', () => {
    const error = thrown(() => nodeGuard.resolve(vault, 'leak.txt'))
    expect(error).toBeInstanceOf(PathError)
    expect(error).toMatchObject({ kind: 'escapes' })
  })

  test('nodeGuard.tryResolve returns null instead of throwing', () => {
    expect(nodeGuard.tryResolve(vault, 'notes/a.md')).toBe(join(vault, 'notes/a.md'))
    expect(nodeGuard.tryResolve(vault, 'leak.txt')).toBeNull()
    expect(nodeGuard.tryResolve(vault, '../secret.txt')).toBeNull()
  })

  test('the root must be absolute; join the working directory yourself', () => {
    expect(thrown(() => nodeGuard.resolve('vault', 'a.md'))).toMatchObject({
      kind: 'not_absolute',
    })
    expect(thrown(() => nodeGuard.resolve('', 'a.md'))).toMatchObject({ kind: 'empty_root' })
  })

  test('the README quick start', () => {
    const srv = join(root, 'srv-data')
    expect(nodeGuard.resolve(srv, 'notes/a.md')).toBe(join(srv, 'notes', 'a.md'))
    expect(thrown(() => nodeGuard.resolve(srv, '../etc/passwd'))).toMatchObject({
      kind: 'parent_segment',
    })
  })
})

describe('ask about paths you already hold', () => {
  test('nodeGuard.contains compares whole components, after symlinks are resolved', () => {
    expect(nodeGuard.contains(vault, join(vault, 'notes', 'new.md'))).toBe(true)
    expect(nodeGuard.contains(vault, join(root, 'secret.txt'))).toBe(false)
    expect(nodeGuard.contains(vault, `${vault}-bee/x`)).toBe(false)
    expect(nodeGuard.contains(vault, join(vault, 'leak.txt'))).toBe(false)
  })

  test('nodeGuard.realPath resolves what exists and keeps the rest as written', () => {
    expect(nodeGuard.realPath(join(vault, 'leak.txt'))).toBe(join(root, 'secret.txt'))
    expect(nodeGuard.realPath(join(vault, 'notes', 'new', 'b.md'))).toBe(
      join(vault, 'notes', 'new', 'b.md'),
    )
  })
})

describe('fold a path as text, and shorten it against a root', () => {
  test('lexical.absolute joins a relative path onto cwd and folds `.` and `..`', () => {
    expect(lexical.absolute('/srv/data/a/./b/../c/', '/w')).toBe('/srv/data/a/c')
    // A `..` at the root stays there.
    expect(lexical.absolute('/../../etc', '/w')).toBe('/etc')
    // A relative path is joined onto `cwd`, which the caller passes.
    expect(lexical.absolute('notes/../a.md', '/work')).toBe('/work/a.md')
    expect(thrown(() => lexical.absolute('a.md', 'work'))).toMatchObject({ kind: 'not_absolute' })
  })

  // POSIX paths only, on every OS: it is text, like the `./lexical` entry it ships in.
  test('lexical.toRelative gives the root-relative path, or throws a PathError', () => {
    expect(lexical.toRelative('/vault', '/vault/notes/a.md')).toBe('notes/a.md')
    expect(thrown(() => lexical.toRelative('/vault', '/secret.txt'))).toMatchObject({
      kind: 'not_under_root',
    })
    expect(thrown(() => lexical.toRelative('/vault', '/vault/notes/../a.md'))).toMatchObject({
      kind: 'parent_segment',
    })
  })

  test('lexical.isUnder compares whole components, folds `..` and follows no symlink', () => {
    expect(lexical.isUnder('/vault', '/vault/a/b.md')).toBe(true)
    expect(lexical.isUnder('/vault', '/vault2/a.md')).toBe(false)
    expect(lexical.isUnder('/vault', '/vault/../etc')).toBe(false)
    // The text says `leak.txt` is under the vault, even when it is a link that leaves it.
    expect(lexical.isUnder('/vault', '/vault/leak.txt')).toBe(true)
    // A relative path is refused, not joined onto the working directory.
    expect(thrown(() => lexical.isUnder('/vault', 'a.md'))).toMatchObject({
      kind: 'not_absolute',
    })
  })
})

describe('the browser-safe entry', () => {
  test('holds the same functions as the lexical namespace', () => {
    expect(validateRelative).toBe(lexical.validateRelative)
    expect(isUnder('/vault', '/vault/a.md')).toBe(true)
    expect(absolute('a', '/w')).toBe('/w/a')
    expect(toRelative('/v', '/v/a.md')).toBe('a.md')
  })

  test('exports the same PathErrorKind and PathWarning types', () => {
    expectTypeOf<LexicalErrorKind>().toEqualTypeOf<PathErrorKind>()
    expectTypeOf<LexicalWarning>().toEqualTypeOf<PathWarning>()
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

  // The fake paths are POSIX paths, which are not absolute on Windows.
  test.skipIf(WINDOWS)('a PathGuard over a Resolver reads no disk', () => {
    const guard = new PathGuard(fs)
    expect(guard.resolve('/v', 'a.md')).toBe('/v/a.md')
    expect(guard.tryResolve('/v', '../a.md')).toBeNull()
    expect(guard.contains('/v', '/v/new/deep.md')).toBe(true)
    expect(guard.realPath('/v/new/deep.md')).toBe('/v/new/deep.md')
  })

  test.skipIf(WINDOWS)('a PathGuard hands Windows names to onWarning off Windows', () => {
    const warnings: PathWarning[] = []
    const guard = new PathGuard(fs, { onWarning: (w) => warnings.push(w) })
    expect(guard.resolve('/v', 'CON')).toBe('/v/CON')
    expect(warnings).toEqual([{ kind: 'reserved_name', segment: 'CON' }])
  })

  test.runIf(WINDOWS)('a PathGuard refuses Windows names on Windows', () => {
    expect(thrown(() => nodeGuard.resolve(vault, 'CON'))).toMatchObject({ kind: 'reserved_name' })
  })

  test('nodeResolver is the real filesystem', () => {
    expect(nodeResolver.realpath(join(vault, 'leak.txt'))).toBe(join(root, 'secret.txt'))
    expect(nodeResolver.readlink(join(vault, 'leak.txt'))).toBe(join(root, 'secret.txt'))
  })

  test('a chain of more than MAX_LINK_HOPS dangling links is unresolvable', () => {
    const dir = join(root, 'chain')
    mkdirSync(dir)
    const links = MAX_LINK_HOPS + 1
    for (let i = 0; i < links; i++) {
      symlinkSync(i + 1 === links ? 'end.json' : `l${i + 1}`, join(dir, `l${i}`))
    }
    expect(MAX_LINK_HOPS).toBe(40)
    expect(thrown(() => nodeGuard.resolve(dir, 'l0'))).toMatchObject({ kind: 'unresolvable' })
  })
})

describe('read a file only when it is inside the root', () => {
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
