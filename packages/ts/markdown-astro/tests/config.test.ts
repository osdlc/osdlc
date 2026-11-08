import { afterEach, describe, test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DEFAULT_CONFIG_NAME, loadConfig, resolveDefaultConfig } from '../src/config.ts'

const dirs: string[] = []
function site(files: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'markdown-astro-config-'))
  dirs.push(dir)
  for (const f of files) writeFileSync(join(dir, f), 'collections: []\n')
  return dir
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('resolveDefaultConfig', () => {
  test('names the default file when it does not exist, so the error points at it', () => {
    const dir = site([])
    assert.equal(resolveDefaultConfig(dir), join(dir, DEFAULT_CONFIG_NAME))
  })
})

describe('loadConfig collection dirs', () => {
  function load(collections: string[]): () => unknown {
    const dir = site([])
    const path = join(dir, DEFAULT_CONFIG_NAME)
    writeFileSync(path, ['vault: vault', 'collections:', ...collections, ''].join('\n'))
    return () => loadConfig(path)
  }

  test('rejects a vaultDir nested in another collection, so --clean cannot delete it', () => {
    const run = load([
      '  - {name: notes, vaultDir: Notes, contentDir: src/content/notes}',
      '  - {name: projects, vaultDir: Notes/Projects, contentDir: src/content/projects}',
    ])
    assert.throws(run, /"notes" and "projects" have equal or nested vaultDirs/)
  })

  test('rejects nesting in either order', () => {
    const run = load([
      '  - {name: projects, vaultDir: Notes/Projects, contentDir: src/content/projects}',
      '  - {name: notes, vaultDir: Notes, contentDir: src/content/notes}',
    ])
    assert.throws(run, /"projects" and "notes" have equal or nested vaultDirs/)
  })

  test('rejects equal or nested contentDirs', () => {
    assert.throws(
      load([
        '  - {name: a, vaultDir: A, contentDir: src/content/a}',
        '  - {name: b, vaultDir: B, contentDir: src/content/a/b}',
      ]),
      /"a" and "b" have equal or nested contentDirs/,
    )
    assert.throws(
      load([
        '  - {name: a, vaultDir: A, contentDir: src/content/x}',
        '  - {name: b, vaultDir: B, contentDir: src/content/x/}',
      ]),
      /equal or nested contentDirs/,
    )
  })

  test('rejects a child dir whose name starts with ..', () => {
    const run = load([
      '  - {name: notes, vaultDir: Notes, contentDir: src/content/notes}',
      '  - {name: drafts, vaultDir: Notes/..drafts, contentDir: src/content/drafts}',
    ])
    assert.throws(run, /"notes" and "drafts" have equal or nested vaultDirs/)
  })

  test('rejects nesting between absolute vaultDirs', () => {
    const base = join(tmpdir(), 'markdown-astro-abs')
    const run = load([
      `  - {name: notes, vaultDir: ${base}/Notes, contentDir: src/content/notes}`,
      `  - {name: sub, vaultDir: ${base}/Notes/Sub, contentDir: src/content/sub}`,
    ])
    assert.throws(run, /"notes" and "sub" have equal or nested vaultDirs/)
  })

  test('accepts sibling dirs that share a name prefix, and a collection without a contentDir', () => {
    const config = load([
      '  - {name: notes, vaultDir: Notes, contentDir: src/content/notes}',
      '  - {name: archive, vaultDir: NotesArchive, contentDir: src/content/notes-archive}',
      '  - {name: tasks, vaultDir: Tasks}',
    ])() as { collections: unknown[] }
    assert.equal(config.collections.length, 3)
  })
})

describe('loadConfig vault', () => {
  function write(lines: string[]): { dir: string; path: string } {
    const dir = site([])
    const path = join(dir, DEFAULT_CONFIG_NAME)
    writeFileSync(
      path,
      [...lines, 'collections:', '  - {name: n, vaultDir: N, contentDir: src/content/n}', ''].join(
        '\n',
      ),
    )
    return { dir, path }
  }

  test('defaults to <astroRoot>/vault', () => {
    const { dir, path } = write([])
    assert.equal(loadConfig(path).vault, join(dir, 'vault'))
  })

  test("reads the file's vault: relative to astroRoot", () => {
    const { dir, path } = write(['vault: ../elsewhere'])
    assert.equal(loadConfig(path).vault, join(dir, '..', 'elsewhere'))
  })

  test("the vault option wins over the file's vault:", () => {
    const { path } = write(['vault: ../elsewhere'])
    const other = site([])
    assert.equal(loadConfig(path, { vault: other }).vault, other)
  })
})
