// Runs the built package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.ts copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { MAX_LINK_HOPS, PathError, PathGuard, lexical } from '@osdlc/path-guard'
import * as lexicalEntry from '@osdlc/path-guard/lexical'
import {
  existingPathInside,
  nodeGuard,
  nodeResolver,
  openContainedFile,
  readContainedFile,
  realPathInside,
} from '@osdlc/path-guard/node'

const WINDOWS = process.platform === 'win32'

// Plain Node loads the built package and the lexical layer works.
assert.equal(lexical.validateRelative('notes\\a.md/'), 'notes/a.md')
assert.throws(
  () => lexical.validateRelative('../etc/passwd'),
  (e) => e instanceof PathError && e.kind === 'parent_segment',
)
assert.equal(MAX_LINK_HOPS, 40)
const warnings = []
assert.equal(lexical.validateRelative('a/NUL', { onWarning: (w) => warnings.push(w) }), 'a/NUL')
assert.deepEqual(warnings, [{ kind: 'reserved_name', segment: 'NUL' }])

// A resolver in which nothing exists, so the guard reads no disk.
const missing = () => {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
}
const top = WINDOWS ? 'C:\\v' : '/v'
const pure = new PathGuard({ realpath: missing, readlink: missing })
assert.equal(pure.resolve(top, 'a.md'), join(top, 'a.md'))
assert.throws(
  () => pure.resolve('v', 'a.md'),
  (e) => e instanceof PathError && e.kind === 'not_absolute',
)

// The text helpers touch no filesystem and read no working directory.
assert.equal(lexical.absolute('a/./b/../c/', '/w'), '/w/a/c')
assert.equal(lexical.toRelative('/v', '/v/Notes/a.md'), 'Notes/a.md')
assert.throws(
  () => lexical.toRelative('/v', '/other/a.md'),
  (e) => e instanceof PathError && e.kind === 'not_under_root',
)
assert.equal(lexical.isUnder('/vault', '/vault/a.md'), true)

// The `./lexical` entry resolves through `exports` and shares the same classes and functions.
assert.equal(lexicalEntry.PathError, PathError)
assert.equal(lexicalEntry.validateRelative, lexical.validateRelative)
assert.equal(lexicalEntry.validateRelative('a/b/'), 'a/b')
assert.equal(lexicalEntry.absolute('a', '/w'), '/w/a')
assert.equal(lexicalEntry.toRelative('/v', '/v/a.md'), 'a.md')
assert.equal(lexicalEntry.isUnder('/vault', '/vault2/a.md'), false)

// The real filesystem, through `./node`. The root is real, so `tmpdir()` being
// a symlink (as on macOS) or holding a short name (as on Windows) does not
// change the paths below.
const root = realpathSync.native(mkdtempSync(join(tmpdir(), 'path-guard-smoke-')))
try {
  const vault = join(root, 'vault')
  mkdirSync(join(vault, 'notes'), { recursive: true })
  writeFileSync(join(vault, 'notes', 'a.md'), 'hello')
  writeFileSync(join(root, 'secret.txt'), 'secret')
  symlinkSync(join(root, 'secret.txt'), join(vault, 'leak.txt'))

  assert.equal(nodeGuard.resolve(vault, 'notes/new/b.md'), join(vault, 'notes/new/b.md'))
  assert.equal(nodeGuard.tryResolve(vault, 'leak.txt'), null)
  assert.throws(
    () => nodeGuard.resolve(vault, 'leak.txt'),
    (e) => e instanceof PathError && e.kind === 'escapes',
  )
  assert.equal(nodeGuard.contains(vault, join(vault, 'notes', 'new.md')), true)
  assert.equal(nodeGuard.contains(vault, join(vault, 'leak.txt')), false)
  assert.equal(nodeGuard.realPath(join(vault, 'leak.txt')), join(root, 'secret.txt'))
  assert.equal(nodeResolver.readlink(join(vault, 'leak.txt')), join(root, 'secret.txt'))
  // A device name: refused on Windows, accepted elsewhere.
  if (WINDOWS) {
    assert.throws(
      () => nodeGuard.resolve(vault, 'CON'),
      (e) => e instanceof PathError && e.kind === 'reserved_name',
    )
  } else assert.equal(nodeGuard.resolve(vault, 'CON'), join(vault, 'CON'))

  assert.equal(await realPathInside(vault, join(vault, 'leak.txt')), null)
  assert.deepEqual(await existingPathInside(vault, vault, join(vault, 'notes', 'a.md')), {
    realPath: join(vault, 'notes', 'a.md'),
    relativePath: 'notes/a.md',
  })

  const file = await openContainedFile(vault, join(vault, 'notes', 'a.md'))
  assert.notEqual(file, null)
  await file.handle.close()
  assert.equal((await readContainedFile(vault, join(vault, 'notes', 'a.md'))).toString(), 'hello')
  assert.equal(await readContainedFile(vault, join(vault, 'leak.txt')), null)
} finally {
  rmSync(root, { recursive: true, force: true })
}

console.log('path-guard smoke: OK')
