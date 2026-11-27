import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'

import { vaultRelativePath } from '../src/vault-relative.ts'

test('a file under the vault is returned relative to it', () => {
  assert.equal(vaultRelativePath('/v', '/v/notes/a.base'), 'notes/a.base')
})

test('a sibling directory sharing the vault path as a name prefix is outside', () => {
  assert.equal(vaultRelativePath('/v', '/v2/x.base'), undefined)
})

test('a directory whose name starts with `..` is inside the vault', () => {
  assert.equal(vaultRelativePath('/v', '/v/..x/a.base'), '..x/a.base')
})

test('a file above the vault is outside', () => {
  assert.equal(vaultRelativePath('/v', '/other/a.base'), undefined)
})

test('a file spelled through the real vault, not the vault as given, is never `..`-relative', () => {
  // On macOS tmpdir() sits under /var -> /private/var: the /tmp-vs-/private/tmp case.
  const dir = mkdtempSync(join(tmpdir(), 'vault-relative-'))
  try {
    mkdirSync(join(dir, 'real'))
    symlinkSync(join(dir, 'real'), join(dir, 'v'))
    const viaReal = join(realpathSync(dir), 'real', 'a.base')
    assert.equal(vaultRelativePath(join(dir, 'v'), viaReal), undefined)
    assert.equal(vaultRelativePath(join(dir, 'v'), join(dir, 'v', 'a.base')), 'a.base')
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a link inside the vault that leaves it is outside', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vault-relative-'))
  try {
    mkdirSync(join(dir, 'v'))
    mkdirSync(join(dir, 'out'))
    symlinkSync(join(dir, 'out'), join(dir, 'v', 'link'))
    assert.equal(vaultRelativePath(join(dir, 'v'), join(dir, 'v', 'link', 'a.base')), undefined)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
