import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { chmodSync, mkdtempSync, mkdirSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listMarkdown } from '../src/wikilink-ref.ts'
import { assetManifestReader, buildAssetIndex, writeAssetManifest } from '../src/assets.ts'

function vault(files: string[]): string {
  const root = mkdtempSync(join(tmpdir(), 'oa-assets-'))
  for (const rel of files) {
    const full = join(root, rel)
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, 'x')
  }
  return root
}

test('_attachments asset maps to a flat outSub', () => {
  const idx = buildAssetIndex(vault(['_attachments/photo.png']), '_attachments')
  assert.deepEqual(idx.resolve('photo.png'), {
    vaultPath: '_attachments/photo.png',
    outSub: 'photo.png',
    resolved: true,
  })
})

test('non-_attachments asset keeps its vault sub-path', () => {
  const idx = buildAssetIndex(vault(['images/diagram.png']), '_attachments')
  // bare basename resolves to where the file actually is:
  assert.deepEqual(idx.resolve('diagram.png'), {
    vaultPath: 'images/diagram.png',
    outSub: 'images/diagram.png',
    resolved: true,
  })
  // explicit vault path resolves the same:
  assert.deepEqual(idx.resolve('images/diagram.png'), {
    vaultPath: 'images/diagram.png',
    outSub: 'images/diagram.png',
    resolved: true,
  })
})

test('ambiguous basename prefers the _attachments copy', () => {
  const idx = buildAssetIndex(vault(['_attachments/x.png', 'elsewhere/x.png']), '_attachments')
  assert.equal(idx.resolve('x.png').vaultPath, '_attachments/x.png')
  // but an explicit path still wins:
  assert.equal(idx.resolve('elsewhere/x.png').vaultPath, 'elsewhere/x.png')
})

test('heading/size suffix and ./ prefix are ignored', () => {
  const idx = buildAssetIndex(vault(['_attachments/p.png']), '_attachments')
  assert.equal(idx.resolve('p.png#fragment').resolved, true)
  assert.equal(idx.resolve('./p.png').resolved, true)
})

test('unresolved target falls back to the _attachments convention, flagged', () => {
  const idx = buildAssetIndex(vault(['_attachments/p.png']), '_attachments')
  assert.deepEqual(idx.resolve('missing/q.png'), {
    vaultPath: '_attachments/q.png',
    outSub: 'q.png',
    resolved: false,
  })
})

test('.obsidian and other dot-dirs are skipped', () => {
  const idx = buildAssetIndex(
    vault(['.obsidian/workspace.json', '_attachments/p.png']),
    '_attachments',
  )
  assert.equal(idx.resolve('workspace.json').resolved, false)
})

test('the asset manifest round-trips and is re-read when it changes', () => {
  const file = join(vault([]), '.markdown-vault-astro', 'assets.json')
  const find = assetManifestReader(file, { recheckMs: 0 })
  assert.equal(find('clip.mp4'), null) // no manifest yet
  writeAssetManifest(file, new Map([['clip.mp4', 'media/clip.mp4']]))
  assert.equal(find('clip.mp4'), 'media/clip.mp4')
  assert.equal(find('toString'), null)
  writeAssetManifest(file, new Map([['clip.mp4', 'clip.mp4']]))
  // Force a new mtime: some filesystems keep a coarse one.
  utimesSync(file, new Date(), new Date(Date.now() + 5000))
  assert.equal(find('clip.mp4'), 'clip.mp4')
})

test('an unreadable manifest answers nothing and is read again once it is fixed', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'oa-manifest-')), 'assets.json')
  writeFileSync(file, '{ not json')
  const find = assetManifestReader(file, { recheckMs: 0 })
  assert.equal(find('a.mp4'), null)
  writeFileSync(file, JSON.stringify({ 'a.mp4': 'a.mp4' }))
  utimesSync(file, new Date(), new Date(Date.now() - 5_000)) // an mtime that matches no earlier read
  assert.equal(find('a.mp4'), 'a.mp4')
  writeFileSync(file, '{ not json again')
  assert.equal(find('a.mp4'), null)
})

test('a dangling symlink in the vault is skipped, not fatal', () => {
  const root = vault(['_attachments/p.png'])
  symlinkSync(join(root, 'nonexistent'), join(root, 'broken-link'))
  const idx = buildAssetIndex(root, '_attachments')
  assert.equal(idx.resolve('p.png').vaultPath, '_attachments/p.png')
})

// root reads any folder, so the folder below is unreadable only to other users
test.skipIf(process.getuid?.() === 0)(
  'an unreadable folder in the vault is skipped, not fatal',
  () => {
    const root = vault(['_attachments/p.png', 'locked/q.png'])
    chmodSync(join(root, 'locked'), 0o000)
    try {
      const idx = buildAssetIndex(root, '_attachments')
      assert.equal(idx.resolve('p.png').vaultPath, '_attachments/p.png')
    } finally {
      chmodSync(join(root, 'locked'), 0o755)
    }
  },
)

test('a directory symlink back to an ancestor does not recurse forever', () => {
  const root = vault(['_attachments/p.png', 'notes/q.png'])
  symlinkSync(root, join(root, 'notes', 'loop'))
  const idx = buildAssetIndex(root, '_attachments')
  assert.equal(idx.resolve('q.png').vaultPath, 'notes/q.png')
})

test('an _attachments file and a vault file at the stripped path publish to different places', () => {
  const idx = buildAssetIndex(vault(['chart.png', '_attachments/chart.png']), '_attachments')
  const root = idx.resolve('chart.png')
  const attached = idx.resolve('_attachments/chart.png')
  assert.equal(root.vaultPath, 'chart.png')
  assert.equal(attached.vaultPath, '_attachments/chart.png')
  assert.notEqual(root.outSub, attached.outSub)
})

test('a path under the asset dir, written without the prefix, resolves to that file', () => {
  // export-vault writes `![[images/diagram.png]]` for `_attachments/images/diagram.png`.
  const idx = buildAssetIndex(
    vault(['_attachments/diagram.png', '_attachments/images/diagram.png']),
    '_attachments',
  )
  assert.equal(idx.resolve('diagram.png').vaultPath, '_attachments/diagram.png')
  assert.equal(idx.resolve('images/diagram.png').vaultPath, '_attachments/images/diagram.png')
})

test('a partial path picks the file whose path ends with it over an _attachments namesake', () => {
  const idx = buildAssetIndex(
    vault(['_attachments/flow.png', 'notes/diagrams/flow.png']),
    '_attachments',
  )
  assert.deepEqual(idx.resolve('diagrams/flow.png'), {
    vaultPath: 'notes/diagrams/flow.png',
    outSub: 'notes/diagrams/flow.png',
    resolved: true,
  })
  // a bare basename still prefers the _attachments copy:
  assert.equal(idx.resolve('flow.png').vaultPath, '_attachments/flow.png')
})

test('a bare name resolves to the asset-dir root file over namesakes in its sub-folders', () => {
  // After export-vault, `![[diagram.png]]` names `_attachments/diagram.png`
  // and `![[a/diagram.png]]` names `_attachments/a/diagram.png`. The walk
  // lists the sub-folder copies before or beside the root one.
  const idx = buildAssetIndex(
    vault([
      '_attachments/a/diagram.png',
      '_attachments/b/diagram.png',
      '_attachments/diagram.png',
      '_attachments/images/diagram.png',
      '_attachments/z/diagram.png',
    ]),
    '_attachments',
  )
  assert.equal(idx.resolve('diagram.png').vaultPath, '_attachments/diagram.png')
})

test('an _attachments asset keeps its full path when its flat path is taken', () => {
  const idx = buildAssetIndex(
    vault([
      'x.png',
      '_attachments/x.png',
      'images/a.png',
      '_attachments/images/a.png',
      '_attachments/b.png',
    ]),
    '_attachments',
  )
  const outSub = (p: string) => idx.resolve(p).outSub
  assert.equal(outSub('x.png'), 'x.png')
  assert.equal(outSub('_attachments/x.png'), '_attachments/x.png')
  assert.equal(outSub('images/a.png'), 'images/a.png')
  assert.equal(outSub('_attachments/images/a.png'), '_attachments/images/a.png')
  // No collision, so the flat path stays.
  assert.equal(outSub('b.png'), 'b.png')
})

afterEach(() => {
  vi.useRealTimers()
})

test('a manifest rewritten within one mtime tick is still re-read', () => {
  const file = join(vault([]), '.markdown-vault-astro', 'assets.json')
  const find = assetManifestReader(file, { recheckMs: 0 })
  const stamp = new Date('2026-01-01T00:00:00Z')
  writeAssetManifest(file, new Map([['clip.mp4', 'a/clip.mp4']]))
  utimesSync(file, stamp, stamp)
  assert.equal(find('clip.mp4'), 'a/clip.mp4')
  // Same mtime, different content: the writer renames a new file into place.
  writeAssetManifest(file, new Map([['clip.mp4', 'b/longer/clip.mp4']]))
  utimesSync(file, stamp, stamp)
  assert.equal(find('clip.mp4'), 'b/longer/clip.mp4')
})

test('the manifest is stat-ed at most once per interval, not once per lookup', () => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
  const file = join(vault([]), '.markdown-vault-astro', 'assets.json')
  const find = assetManifestReader(file, { recheckMs: 1000 })
  writeAssetManifest(file, new Map([['clip.mp4', 'one.mp4']]))
  assert.equal(find('clip.mp4'), 'one.mp4')
  writeAssetManifest(file, new Map([['clip.mp4', 'two.mp4']]))
  utimesSync(file, new Date(), new Date(Date.now() + 5000))
  assert.equal(find('clip.mp4'), 'one.mp4', 'a lookup inside the interval touched the disk')
  vi.advanceTimersByTime(1001)
  assert.equal(find('clip.mp4'), 'two.mp4')
})

test('a note named with an upper-case extension is a note, not an asset', () => {
  const root = vault(['Notes/Note.MD', 'Notes/other.Md', 'pic.png'])
  const idx = buildAssetIndex(root, '_attachments')
  assert.equal(idx.resolve('Note.MD').resolved, false)
  assert.equal(idx.resolve('other.Md').resolved, false)
  assert.equal(idx.resolve('pic.png').resolved, true)
  assert.deepEqual(listMarkdown(join(root, 'Notes')).sort(), ['Note.MD', 'other.Md'])
})
