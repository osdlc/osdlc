import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { ASSET_MANIFEST } from '../src/assets.ts'
import { exportVault, transform } from '../src/run.ts'

test('transform writes the asset manifest the build reads, copied media only', () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-run-'))
  const vault = join(root, 'vault')
  mkdirSync(join(vault, 'Notes'), { recursive: true })
  mkdirSync(join(vault, '_attachments'), { recursive: true })
  mkdirSync(join(vault, 'media'), { recursive: true })
  writeFileSync(join(vault, '_attachments', 'pic.png'), 'x')
  writeFileSync(join(vault, 'media', 'clip.mp4'), 'x')
  writeFileSync(
    join(vault, 'Notes', 'a.md'),
    '![[pic.png|300]]\n\n![[clip.mp4]]\n\n![[gone.pdf]]\n\n![[Other]]\n',
  )
  const astroRoot = join(root, 'site')
  const config = {
    astroRoot,
    vault,
    assets: { publicDir: 'public/_media', publicBase: '/_media', vaultDir: '_attachments' },
    frontmatterAssets: [],
    collections: [{ name: 'notes', vaultDir: 'Notes', contentDir: 'src/content/notes' }],
    danglingRefPolicy: 'warn' as const,
  }

  transform(config, { dryRun: true })
  assert.ok(!existsSync(join(astroRoot, ASSET_MANIFEST)), 'a dry run writes nothing')

  transform(config)
  assert.deepEqual(JSON.parse(readFileSync(join(astroRoot, ASSET_MANIFEST), 'utf8')), {
    'clip.mp4': 'media/clip.mp4',
    'pic.png': 'pic.png',
  })
  assert.ok(existsSync(join(astroRoot, 'public/_media/media/clip.mp4')))
})

test('transform include: a rejected note is not written and its assets are not copied', () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-run-'))
  const vault = join(root, 'vault')
  mkdirSync(join(vault, 'Notes'), { recursive: true })
  mkdirSync(join(vault, '_attachments'), { recursive: true })
  for (const f of ['shared.png', 'secret.png', 'cover.png']) {
    writeFileSync(join(vault, '_attachments', f), 'x')
  }
  writeFileSync(join(vault, 'Notes', 'keep.md'), '![[shared.png]]\n')
  writeFileSync(
    join(vault, 'Notes', 'drop.md'),
    '---\ndraft: true\ncover: cover.png\n---\n![[secret.png]] ![[shared.png]] ![[gone.png]]\n',
  )
  const astroRoot = join(root, 'site')
  const seen: string[] = []
  const stats = transform(
    { ...site(vault, astroRoot), frontmatterAssets: ['cover'] },
    {
      include: (collection, rel, text) => {
        seen.push(`${collection}:${rel}`)
        return !text.includes('draft: true')
      },
    },
  )
  assert.deepEqual(seen.sort(), ['notes:drop.md', 'notes:keep.md'])
  assert.equal(stats.files, 1)
  assert.equal(stats.assetsCopied, 1)
  assert.deepEqual(stats.assetsMissing, [])
  assert.ok(existsSync(join(astroRoot, 'src/content/notes/keep.md')))
  assert.ok(!existsSync(join(astroRoot, 'src/content/notes/drop.md')))
  assert.ok(existsSync(join(astroRoot, 'public/_media/shared.png')))
  assert.ok(!existsSync(join(astroRoot, 'public/_media/secret.png')))
  assert.ok(!existsSync(join(astroRoot, 'public/_media/cover.png')))
  assert.deepEqual(JSON.parse(readFileSync(join(astroRoot, ASSET_MANIFEST), 'utf8')), {
    'shared.png': 'shared.png',
  })
})

function site(vault: string, astroRoot: string) {
  return {
    astroRoot,
    vault,
    assets: { publicDir: 'public/_media', publicBase: '/_media', vaultDir: '_attachments' },
    frontmatterAssets: [],
    collections: [{ name: 'notes', vaultDir: 'Notes', contentDir: 'src/content/notes' }],
    danglingRefPolicy: 'warn' as const,
  }
}

test('exportVault copies the media of embeds the transform left as written', () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-run-'))
  const vault = join(root, 'vault')
  mkdirSync(join(vault, 'Notes'), { recursive: true })
  mkdirSync(join(vault, '_attachments'), { recursive: true })
  mkdirSync(join(vault, 'media'), { recursive: true })
  writeFileSync(join(vault, 'media', 'clip.mp4'), 'x')
  writeFileSync(join(vault, '_attachments', 'pic.png'), 'x')
  writeFileSync(join(vault, '_attachments', 'doc.pdf'), 'x')
  writeFileSync(join(vault, 'Notes', 'a.md'), '![[clip.mp4]]\n\n![[pic.png|300]]\n\n![[doc.pdf]]\n')
  const astroRoot = join(root, 'site')
  transform(site(vault, astroRoot))

  const vault2 = join(root, 'vault2')
  const stats = exportVault(site(vault2, astroRoot))
  assert.equal(stats.assetsCopied, 3)
  assert.deepEqual(stats.assetsMissing, [])
  for (const f of ['media/clip.mp4', 'pic.png', 'doc.pdf']) {
    assert.ok(existsSync(join(vault2, '_attachments', f)), f)
  }
})

test('exportVault brings back the media files of embeds the transform left in place', () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-run-'))
  const vault = join(root, 'vault')
  mkdirSync(join(vault, 'Notes'), { recursive: true })
  mkdirSync(join(vault, '_attachments'), { recursive: true })
  mkdirSync(join(vault, 'media'), { recursive: true })
  for (const f of ['pic.png', 'big.png', 'doc.pdf'])
    writeFileSync(join(vault, '_attachments', f), f)
  writeFileSync(join(vault, 'media', 'clip.mp4'), 'clip.mp4')
  const note =
    '![[pic.png]]\n\n![[big.png|300]]\n\n![[clip.mp4]]\n\n![[doc.pdf#page=2]]\n\n![[Other]]\n'
  writeFileSync(join(vault, 'Notes', 'a.md'), note)
  const config = {
    astroRoot: join(root, 'site'),
    vault,
    assets: { publicDir: 'public/_media', publicBase: '/_media', vaultDir: '_attachments' },
    frontmatterAssets: [],
    collections: [{ name: 'notes', vaultDir: 'Notes', contentDir: 'src/content/notes' }],
    danglingRefPolicy: 'warn' as const,
  }
  assert.equal(transform(config).assetsCopied, 4)

  const fresh = join(root, 'fresh')
  const stats = exportVault({ ...config, vault: fresh })
  assert.deepEqual(stats.assetsMissing, [])
  assert.equal(stats.assetsCopied, 4)
  assert.equal(readFileSync(join(fresh, 'Notes', 'a.md'), 'utf8'), note)
  for (const f of ['pic.png', 'big.png', 'doc.pdf', 'media/clip.mp4']) {
    assert.ok(existsSync(join(fresh, '_attachments', f)), `${f} was not copied back`)
  }
})

afterEach(() => {
  vi.restoreAllMocks()
})

const cleanConfig = (root: string) => ({
  astroRoot: join(root, 'site'),
  vault: join(root, 'vault'),
  assets: { publicDir: 'public/_media', publicBase: '/_media', vaultDir: '_attachments' },
  frontmatterAssets: [],
  collections: [{ name: 'notes', vaultDir: 'Notes', contentDir: 'src/content/notes' }],
  danglingRefPolicy: 'warn' as const,
})

test('transform --clean keeps the output when the vault collection is empty or missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-run-'))
  const config = cleanConfig(root)
  mkdirSync(join(config.vault, 'Notes'), { recursive: true })
  writeFileSync(join(config.vault, 'Notes', 'a.md'), 'hello\n')
  transform(config)
  const out = join(config.astroRoot, 'src/content/notes/a.md')
  assert.ok(existsSync(out))

  rmSync(join(config.vault, 'Notes', 'a.md'))
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  transform(config, { clean: true })
  assert.ok(existsSync(out), 'an empty source wiped the output')
  assert.equal(warn.mock.calls.length, 1)
  assert.match(
    String(warn.mock.calls[0]?.[0]),
    /^notes: --clean skipped, .* has no notes; .* kept$/,
  )

  rmSync(join(config.vault, 'Notes'), { recursive: true })
  transform(config, { clean: true })
  assert.ok(existsSync(out), 'a missing source wiped the output')
})

test('exportVault --clean keeps the vault when the Astro content dir is empty or missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-run-'))
  const config = cleanConfig(root)
  mkdirSync(join(config.vault, 'Notes'), { recursive: true })
  const precious = join(config.vault, 'Notes', 'precious.md')
  writeFileSync(precious, 'keep me\n')

  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  exportVault(config, { clean: true })
  assert.ok(existsSync(precious), 'a missing content dir wiped the vault')
  assert.equal(warn.mock.calls.length, 1)
  assert.match(String(warn.mock.calls[0]?.[0]), /^notes: --clean skipped/)

  mkdirSync(join(config.astroRoot, 'src/content/notes'), { recursive: true })
  exportVault(config, { clean: true })
  assert.ok(existsSync(precious), 'an empty content dir wiped the vault')
})

test('--clean still replaces the output when the source has notes', () => {
  const root = mkdtempSync(join(tmpdir(), 'oa-run-'))
  const config = cleanConfig(root)
  mkdirSync(join(config.vault, 'Notes'), { recursive: true })
  writeFileSync(join(config.vault, 'Notes', 'a.md'), 'a\n')
  writeFileSync(join(config.vault, 'Notes', 'b.md'), 'b\n')
  transform(config)
  rmSync(join(config.vault, 'Notes', 'b.md'))
  transform(config, { clean: true })
  assert.ok(existsSync(join(config.astroRoot, 'src/content/notes/a.md')))
  assert.ok(!existsSync(join(config.astroRoot, 'src/content/notes/b.md')), 'a stale note survived')
})
