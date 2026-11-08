import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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
  assert.equal(rels(join(root, 'n')).length, 1)
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
