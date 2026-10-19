// Runs the BUILT package under Node. The unit tests resolve the package name to
// the TypeScript source, so a broken emit could pass them and fail on the
// consumer's machine.
//
// It imports the package by name, so Node resolves it through `exports` as a
// consumer would. `pnpm run smoke` runs it here, where the name resolves to
// this package's own dist/. check-packages.mjs copies it into a clean project
// that installed the tarball, so it must not import other repo files. It is
// not a test-runner suite and is not in `files`.

import { strict as assert } from 'node:assert'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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
} from '@osdlc/path-guard'

// Plain Node loads the built package and the lexical layer works.
assert.equal(validateRelative('notes\\a.md/'), 'notes/a.md')
assert.throws(
  () => validateRelative('../etc/passwd'),
  (e) => e instanceof PathError && e.kind === 'parent_segment',
)
assert.equal(MAX_LINK_HOPS, 40)

// A resolver in which nothing exists: the containment layer is pure over it.
const missing = () => {
  throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
}
assert.equal(resolveInside('/v', 'a.md', { realpath: missing, readlink: missing }), '/v/a.md')

// The text helpers touch no filesystem.
assert.equal(lexicalAbsolute('/a/./b/../c/'), '/a/c')
assert.equal(toRelative('/v', '/v/Notes/a.md'), 'Notes/a.md')
assert.throws(
  () => toRelative('/v', '/other/a.md'),
  (e) => e instanceof PathError && e.kind === 'escapes',
)

// The real filesystem. The root is real, so `tmpdir()` being a symlink (as on
// macOS) does not change the paths below.
const root = realpathSync(mkdtempSync(join(tmpdir(), 'path-guard-smoke-')))
try {
  const vault = join(root, 'vault')
  mkdirSync(join(vault, 'notes'), { recursive: true })
  writeFileSync(join(vault, 'notes', 'a.md'), 'hello')
  writeFileSync(join(root, 'secret.txt'), 'secret')
  symlinkSync(join(root, 'secret.txt'), join(vault, 'leak.txt'))

  assert.equal(resolveInside(vault, 'notes/new/b.md'), join(vault, 'notes/new/b.md'))
  assert.equal(tryResolveInside(vault, 'leak.txt'), null)
  assert.throws(
    () => resolveInside(vault, 'leak.txt'),
    (e) => e instanceof PathError && e.kind === 'escapes',
  )
  assert.equal(contains(vault, join(vault, 'notes', 'new.md')), true)
  assert.equal(contains(vault, join(vault, 'leak.txt')), false)
  assert.equal(canonicalExistingPrefix(join(vault, 'leak.txt')), join(root, 'secret.txt'))
  assert.equal(realpathOrSelf(join(vault, 'leak.txt')), join(root, 'secret.txt'))
  assert.equal(nodeResolver.readlink(join(vault, 'leak.txt')), join(root, 'secret.txt'))

  assert.equal(isInside(vault, join(vault, 'leak.txt')), true)
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
