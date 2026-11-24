/**
 * Descriptor sources and one plugin namespace: shipped, the user's folder and
 * `--descriptor`, which one of a name a run uses, the clashes that are errors,
 * and the run's plugin list built from them.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'

import {
  BUILT_IN_PLUGINS,
  DescriptorError,
  DescriptorLoadError,
  SHIPPED_DESCRIPTORS,
  loadDescriptors,
  loadPlugins,
  pluginKit,
  type Detection,
  type LoadedDescriptor,
  type Plugin,
} from '../src/index.ts'
import { runsAmong } from '../src/registry.ts'
import { contractSuite, fakeContext, tempHome } from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-load-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const RESERVED = BUILT_IN_PLUGINS.map((d) => d.name)

/** A descriptor whose one folder is `~/<folder>`. */
const store = (folder: string): string => `descriptor: 1
paths:
  store: { all: ~/${folder} }
candidates:
  - { path: store, costDescription: re-download }
`

/** Writes each `name: text` into `dir`, and returns `dir`. */
function folder(dir: string, files: Record<string, string>): string {
  mkdirSync(dir, { recursive: true })
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, name), text)
  return dir
}

/** A shipped folder and a user folder under one temp folder. */
function sources(shipped: Record<string, string>, user: Record<string, string> = {}) {
  const root = tempDir()
  return { shipped: folder(join(root, 'shipped'), shipped), user: folder(join(root, 'user'), user) }
}

const folderOf = (d: LoadedDescriptor): string | undefined => d.descriptor.paths.store?.all

describe('sources', () => {
  test('shipped and user descriptors load sorted by name, each from its file', () => {
    const s = sources(
      { 'uv.yaml': store('.cache/uv'), 'npm.yml': store('.npm') },
      {
        'gradle.json': JSON.stringify({
          descriptor: 1,
          paths: { store: { all: '~/.gradle/caches' } },
          candidates: [{ path: 'store', costDescription: 're-download' }],
        }),
      },
    )
    const loaded = loadDescriptors(s, RESERVED)
    expect(loaded.map((d) => [d.name, d.source])).toEqual([
      ['gradle', 'user'],
      ['npm', 'shipped'],
      ['uv', 'shipped'],
    ])
    expect(loaded[1]!.path).toBe(join(s.shipped, 'npm.yml'))
    expect(loaded.every((d) => d.replaces === undefined)).toBe(true)
  })

  test('missing folders have none', () => {
    const root = tempDir()
    expect(
      loadDescriptors({ shipped: join(root, 'no'), user: join(root, 'nor') }, RESERVED),
    ).toEqual([])
    expect(loadDescriptors({ shipped: join(root, 'no') }, RESERVED)).toEqual([])
  })

  test('hidden files, other extensions and folders are not descriptors', () => {
    const s = sources({
      'uv.yaml': store('.cache/uv'),
      '.pnpm.yaml': 'not read',
      'README.md': 'not read',
      'notes.txt': 'not read',
    })
    mkdirSync(join(s.shipped, 'go.yaml'))
    expect(loadDescriptors(s, RESERVED).map((d) => d.name)).toEqual(['uv'])
  })

  test('the shipped folder is the package’s descriptors/', () => {
    const pkg = dirname(dirname(fileURLToPath(import.meta.url)))
    expect(SHIPPED_DESCRIPTORS.replace(/[/\\]$/, '')).toBe(join(pkg, 'descriptors'))
  })
})

describe('one namespace', () => {
  test('a user pnpm.yaml replaces the shipped one, and says which it replaced', () => {
    const s = sources(
      { 'pnpm.yaml': store('shipped-pnpm'), 'uv.yaml': store('.cache/uv') },
      { 'pnpm.yaml': store('user-pnpm') },
    )
    const [pnpm, uv] = loadDescriptors(s, RESERVED)
    expect(pnpm).toMatchObject({
      name: 'pnpm',
      source: 'user',
      path: join(s.user, 'pnpm.yaml'),
      replaces: { source: 'shipped', path: join(s.shipped, 'pnpm.yaml') },
    })
    expect(folderOf(pnpm!)).toBe('~/user-pnpm')
    expect(uv).toMatchObject({ name: 'uv', source: 'shipped' })
    expect(uv!.replaces).toBeUndefined()
  })

  test('--descriptor replaces the one the name had, for that run', () => {
    const s = sources({ 'pnpm.yaml': store('shipped-pnpm') }, { 'pnpm.yaml': store('user-pnpm') })
    const file = join(
      folder(join(tempDir(), 'mine'), { 'pnpm.yaml': store('flag-pnpm') }),
      'pnpm.yaml',
    )
    const [pnpm] = loadDescriptors({ ...s, flag: [file] }, RESERVED)
    expect(pnpm).toMatchObject({
      source: 'flag',
      path: file,
      replaces: { source: 'user', path: join(s.user, 'pnpm.yaml') },
    })
    expect(folderOf(pnpm!)).toBe('~/flag-pnpm')
  })

  test('a descriptor named as a built-in plugin is an error, from any source', () => {
    for (const name of RESERVED) {
      expect(() => loadDescriptors(sources({ [`${name}.yaml`]: store('x') }), RESERVED)).toThrow(
        DescriptorLoadError,
      )
    }
    const s = sources({}, { 'git.yaml': store('x') })
    expect(() => loadDescriptors(s, RESERVED)).toThrow(
      `descriptor ${join(s.user, 'git.yaml')} is named git, as the built-in plugin`,
    )
    const flag = join(folder(join(tempDir(), 'mine'), { 'cargo.yml': store('x') }), 'cargo.yml')
    expect(() => loadDescriptors({ shipped: s.shipped, flag: [flag] }, RESERVED)).toThrow(
      /named cargo, as the built-in plugin/,
    )
  })

  test('the name is checked before the file is read', () => {
    const s = sources({}, { 'git.yaml': ': not yaml [' })
    expect(() => loadDescriptors(s, RESERVED)).toThrow(DescriptorLoadError)
  })

  test('two files of one name in one folder are an error naming both', () => {
    const s = sources({}, { 'pnpm.yaml': store('a'), 'pnpm.json': '{}' })
    expect(() => loadDescriptors(s, RESERVED)).toThrow(
      `${join(s.user, 'pnpm.json')} and ${join(s.user, 'pnpm.yaml')} are both the descriptor pnpm`,
    )
  })

  test('two --descriptor files of one name are an error', () => {
    const a = join(folder(join(tempDir(), 'a'), { 'uv.yaml': store('a') }), 'uv.yaml')
    const b = join(folder(join(tempDir(), 'b'), { 'uv.yml': store('b') }), 'uv.yml')
    expect(() => loadDescriptors({ shipped: tempDir(), flag: [a, b] }, RESERVED)).toThrow(
      /are both the descriptor uv/,
    )
  })

  test('a file name that is no plugin name is an error', () => {
    for (const bad of ['My_Store.yaml', '9lives.yaml', 'Uv.yaml']) {
      expect(() => loadDescriptors(sources({}, { [bad]: store('x') }), RESERVED)).toThrow(
        /is not a plugin name/,
      )
    }
  })

  test('only the file a name ends up with is read: a user file stands in for a broken shipped one', () => {
    const s = sources({ 'pnpm.yaml': 'descriptor: 2\n' }, { 'pnpm.yaml': store('user-pnpm') })
    expect(loadDescriptors(s, RESERVED).map((d) => d.source)).toEqual(['user'])
    expect(() => loadDescriptors({ shipped: s.shipped }, RESERVED)).toThrow(DescriptorError)
  })

  test('a bad file names its path, the field and the line', () => {
    const s = sources({}, { 'uv.yaml': 'descriptor: 1\npaths: {}\ncandidates: []\n' })
    expect(() => loadDescriptors(s, RESERVED)).toThrow(
      new RegExp(`bad descriptor ${join(s.user, 'uv.yaml')}: line 2: paths`),
    )
  })
})

describe('the run’s plugins', () => {
  test('the built-ins in run order, then one plugin per descriptor by name', () => {
    const s = sources({ 'uv.yaml': store('.cache/uv'), 'npm.yaml': store('.npm') })
    const { definitions, descriptors } = loadPlugins(s)
    expect(definitions.map((d) => d.name)).toEqual(['git', 'cargo', 'node', 'orca', 'npm', 'uv'])
    expect(descriptors.map((d) => d.name)).toEqual(['npm', 'uv'])
  })

  test('a loaded descriptor passes the contract suite, and its delete refuses a folder outside', async () => {
    const h = tempHome()
    cleanups.push(h.cleanup)
    folder(join(h.home, '.cache', 'fixture'), { blob: 'x' })
    const outside = folder(join(tempDir(), 'outside'), { blob: 'x' })
    const { definitions } = loadPlugins(sources({ 'fixture.yaml': store('.cache/fixture') }))
    const def = definitions.find((d) => d.name === 'fixture')!
    const plugin = def.create({
      settings: { idleHours: 0 },
      only: [],
      env: h.env,
      kit: pluginKit('fixture', { env: h.env }),
    })
    expect(await contractSuite(plugin)).toEqual([])
    const candidate = {
      id: `fixture:${outside}`,
      kind: 'fixture',
      owner: 'fixture',
      path: outside,
      why: 'moved',
      evidence: { path: outside, candidate: 0, action: 'remove' },
    }
    await expect(Promise.resolve(plugin.delete!(candidate, fakeContext()))).rejects.toThrow(
      /was not deleted/,
    )
  })

  test('supersededBy: a plugin runs only when chosen and detected', async () => {
    const plugin = (name: string, detected: boolean | Detection): Plugin => ({
      name,
      detect: () => detected,
    })
    let chosen: Plugin[] = [
      plugin('cargo', true),
      plugin('node', false),
      plugin('docker', { active: true, note: 'up' }),
      plugin('ollama', { active: false, note: 'not running' }),
    ]
    const runs = runsAmong(() => chosen)
    expect(await runs('cargo', fakeContext())).toBe(true)
    expect(await runs('node', fakeContext())).toBe(false)
    expect(await runs('docker', fakeContext())).toBe(true)
    expect(await runs('ollama', fakeContext())).toBe(false)
    expect(await runs('orca', fakeContext())).toBe(false)
    chosen = []
    expect(await runs('cargo', fakeContext())).toBe(false)
  })
})
