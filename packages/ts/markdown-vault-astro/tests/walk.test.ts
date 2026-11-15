import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildAssetIndex } from '../src/assets.ts'
import { walkFiles } from '../src/walk.ts'
import { exportVault, transform } from '../src/run.ts'

const dirs: string[] = []
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), 'oa-walk-'))
  dirs.push(d)
  return d
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const rels = (root: string): string[] =>
  walkFiles(root)
    .map((f) => f.rel)
    .sort()

test('a link to a file is listed, a dangling link is skipped', () => {
  const root = tmp()
  mkdirSync(join(root, 'n'))
  writeFileSync(join(root, 'target.md'), 't')
  symlinkSync(join(root, 'target.md'), join(root, 'n', 'alias.md'))
  symlinkSync(join(root, 'missing.md'), join(root, 'n', 'dangling.md'))
  assert.deepEqual(rels(join(root, 'n')), ['alias.md'])
})

test('a link to a directory is followed', () => {
  const root = tmp()
  mkdirSync(join(root, 'n'))
  mkdirSync(join(root, 'elsewhere'))
  writeFileSync(join(root, 'elsewhere', 'linked.md'), 'l')
  symlinkSync(join(root, 'elsewhere'), join(root, 'n', 'sub'), 'dir')
  assert.deepEqual(rels(join(root, 'n')), ['sub/linked.md'])
})

test('two links to one directory list it once', () => {
  const root = tmp()
  mkdirSync(join(root, 'n'))
  mkdirSync(join(root, 'elsewhere'))
  writeFileSync(join(root, 'elsewhere', 'linked.md'), 'l')
  symlinkSync(join(root, 'elsewhere'), join(root, 'n', 'a'), 'dir')
  symlinkSync(join(root, 'elsewhere'), join(root, 'n', 'b'), 'dir')
  assert.deepEqual(rels(join(root, 'n')), ['a/linked.md']) // name order: a before b
})

test('a loop ends and lists each note once', () => {
  const root = tmp()
  mkdirSync(join(root, 'n'))
  writeFileSync(join(root, 'n', 'a.md'), 'a')
  symlinkSync(join(root, 'n'), join(root, 'n', 'loop'), 'dir')
  assert.deepEqual(rels(join(root, 'n')), ['a.md'])
})

function config(vault: string, astroRoot: string) {
  return {
    astroRoot,
    vault,
    assets: { publicDir: 'public/_media', publicBase: '/_media', vaultDir: '_attachments' },
    frontmatterAssets: [],
    collections: [{ name: 'notes', vaultDir: 'Notes', contentDir: 'src/content/notes' }],
    danglingRefPolicy: 'warn' as const,
  }
}

test('--clean refuses when a link in the source resolves into the destination', () => {
  const root = tmp()
  const vault = join(root, 'vault')
  const astroRoot = join(root, 'site')
  const dst = join(astroRoot, 'src/content/notes')
  mkdirSync(join(vault, 'Notes'), { recursive: true })
  mkdirSync(dst, { recursive: true })
  writeFileSync(join(dst, 'keep.md'), 'k')
  symlinkSync(dst, join(vault, 'Notes', 'sub'), 'dir')
  assert.throws(() => transform(config(vault, astroRoot), { clean: true }), /--clean refused/)
  assert.equal(rels(dst).length, 1)
})

test('--clean compares real paths: a linked contentDir that is the vault folder', () => {
  const root = tmp()
  const vault = join(root, 'vault')
  const astroRoot = join(root, 'site')
  mkdirSync(join(vault, 'Notes'), { recursive: true })
  writeFileSync(join(vault, 'Notes', 'a.md'), 'a')
  mkdirSync(join(astroRoot, 'src/content'), { recursive: true })
  symlinkSync(join(vault, 'Notes'), join(astroRoot, 'src/content/notes'), 'dir')
  assert.throws(() => transform(config(vault, astroRoot), { clean: true }), /--clean refused/)
  assert.throws(() => exportVault(config(vault, astroRoot), { clean: true }), /--clean refused/)
  assert.deepEqual(rels(join(vault, 'Notes')), ['a.md'])
})

test('--clean resolves a destination that does not exist yet through its existing ancestor', () => {
  const root = tmp()
  const vault = join(root, 'vault')
  mkdirSync(join(vault, 'Notes'), { recursive: true })
  writeFileSync(join(vault, 'Notes', 'a.md'), 'a')
  const astroRoot = join(root, 'site')
  mkdirSync(astroRoot)
  const alias = join(root, 'alias')
  symlinkSync(vault, alias, 'dir')
  const cfg = {
    ...config(vault, astroRoot),
    collections: [{ name: 'notes', vaultDir: 'Notes', contentDir: '../alias/Notes/new' }],
  }
  assert.throws(() => transform(cfg, { clean: true }), /--clean refused/)
})

test('a dot entry is skipped', () => {
  const root = tmp()
  mkdirSync(join(root, '.trash'))
  writeFileSync(join(root, '.trash', 'old.md'), 'o')
  writeFileSync(join(root, '.hidden.md'), 'h')
  writeFileSync(join(root, 'a.md'), 'a')
  assert.deepEqual(rels(root), ['a.md'])
})

test('a file reached through two links is listed once', () => {
  const root = tmp()
  mkdirSync(join(root, 'n'))
  writeFileSync(join(root, 'target.md'), 't')
  symlinkSync(join(root, 'target.md'), join(root, 'n', 'a.md'))
  symlinkSync(join(root, 'target.md'), join(root, 'n', 'b.md'))
  assert.deepEqual(rels(join(root, 'n')), ['a.md'])
})

test('an unreadable subfolder is skipped', (ctx) => {
  const root = tmp()
  mkdirSync(join(root, 'locked'))
  writeFileSync(join(root, 'locked', 'x.md'), 'x')
  writeFileSync(join(root, 'ok.md'), 'o')
  chmodSync(join(root, 'locked'), 0o000)
  try {
    if (process.platform === 'win32' || process.getuid?.() === 0) ctx.skip()
    assert.deepEqual(rels(root), ['ok.md'])
  } finally {
    chmodSync(join(root, 'locked'), 0o755)
  }
})

test('a read error that is not a permission error propagates', () => {
  const root = tmp()
  writeFileSync(join(root, 'file.md'), 'f')
  // The root itself is a file, not a directory: ENOTDIR, not a skippable error.
  assert.throws(() => walkFiles(join(root, 'file.md')), /ENOTDIR/)
})

test('an embed through the second link path resolves to the first path', () => {
  const root = tmp()
  mkdirSync(join(root, 'elsewhere'))
  writeFileSync(join(root, 'elsewhere', 'pic.png'), 'p')
  symlinkSync(join(root, 'elsewhere'), join(root, 'a'), 'dir')
  symlinkSync(join(root, 'elsewhere'), join(root, 'b'), 'dir')
  const index = buildAssetIndex(root, '_attachments')
  const viaB = index.resolve('b/pic.png')
  const viaA = index.resolve('a/pic.png')
  assert.equal(viaA.resolved, true)
  assert.equal(viaB.resolved, true)
  assert.equal(viaB.outSub, viaA.outSub)
})
