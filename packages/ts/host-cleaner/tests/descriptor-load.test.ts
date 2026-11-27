/**
 * Descriptor sources and one plugin namespace: shipped, the user's folder and
 * `--descriptor`, which one of a name a run uses, the clashes that are errors,
 * and the run's plugin list built from them.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterEach, describe, expect, test } from 'vitest'

import {
  BUILT_IN_PLUGINS,
  DescriptorError,
  DescriptorLoadError,
  SHIPPED_DESCRIPTORS,
  findDescriptors,
  findPlugins,
  loadDescriptors,
  loadPlugins,
  pluginKit,
  survey,
  type LoadedDescriptor,
  type Plugin,
} from '../src/index.ts'
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

  test('a link to a file is a descriptor; a link to a folder or nothing is not', () => {
    const s = sources({})
    const real = folder(join(tempDir(), 'real'), { 'npm.yaml': store('.npm') })
    symlinkSync(join(real, 'npm.yaml'), join(s.user, 'npm.yaml'))
    symlinkSync(real, join(s.user, 'shared.yaml'))
    symlinkSync(join(real, 'gone.yaml'), join(s.user, 'gone.yaml'))
    expect(loadDescriptors(s, RESERVED).map((d) => d.name)).toEqual(['npm'])
  })

  test('extensions are matched in any case', () => {
    const s = sources({ 'uv.YAML': store('.cache/uv'), 'npm.Json': '{}' })
    expect(() => loadDescriptors(s, RESERVED)).toThrow(DescriptorError)
    const ok = sources({ 'uv.YAML': store('.cache/uv') })
    expect(loadDescriptors(ok, RESERVED).map((d) => d.name)).toEqual(['uv'])
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

  test('three files of one name in one folder are an error naming all three', () => {
    const s = sources({}, { 'uv.json': '{}', 'uv.yaml': store('a'), 'uv.yml': store('b') })
    const [json, yaml, yml] = ['uv.json', 'uv.yaml', 'uv.yml'].map((f) => join(s.user, f))
    expect(() => loadDescriptors(s, RESERVED)).toThrow(
      `${json}, ${yaml} and ${yml} are all the descriptor uv; keep one`,
    )
  })

  test('two --descriptor files of one name are an error', () => {
    const a = join(folder(join(tempDir(), 'a'), { 'uv.yaml': store('a') }), 'uv.yaml')
    const b = join(folder(join(tempDir(), 'b'), { 'uv.yml': store('b') }), 'uv.yml')
    expect(() => loadDescriptors({ shipped: tempDir(), flag: [a, b] }, RESERVED)).toThrow(
      /are both the descriptor uv/,
    )
  })

  test('one --descriptor file named twice loads once; one not YAML or JSON is an error', () => {
    const dir = folder(join(tempDir(), 'mine'), { 'uv.yaml': store('a'), 'notes.md': store('b') })
    const uv = join(dir, 'uv.yaml')
    const loaded = loadDescriptors({ shipped: tempDir(), flag: [uv, uv] }, RESERVED)
    expect(loaded.map((d) => d.path)).toEqual([uv])
    expect(() =>
      loadDescriptors({ shipped: tempDir(), flag: [join(dir, 'notes.md')] }, RESERVED),
    ).toThrow(/notes\.md: not a descriptor file; use \.yaml, \.yml, \.json/)
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
    expect(definitions.map((d) => d.name)).toEqual([
      'git',
      'cargo',
      'node',
      'vscode',
      'cursor',
      'orca',
      'npm',
      'uv',
    ])
    expect(descriptors.map((d) => d.name)).toEqual(['npm', 'uv'])
  })

  test('supersededBy must name a built-in plugin: not itself, another descriptor or a typo', () => {
    const by = (name: string): string => `${store('.cache/x')}supersededBy: ${name}\n`
    expect(loadPlugins(sources({ 'uv.yaml': by('cargo') })).definitions.at(-1)!.name).toBe('uv')
    expect(() => loadPlugins(sources({ 'uv.yaml': by('uv') }))).toThrow(
      /supersededBy uv is no built-in plugin and no package the config names; have git, cargo, node, vscode, cursor, orca/,
    )
    expect(() => loadPlugins(sources({ 'a.yaml': by('b'), 'b.yaml': by('a') }))).toThrow(
      DescriptorLoadError,
    )
    expect(() => loadPlugins(sources({ 'uv.yaml': by('cargoo') }))).toThrow(/cargoo/)
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

  test('supersededBy may name a package the config names, loaded or not', () => {
    const s = sources({ 'uv.yaml': `${store('.cache/uv')}supersededBy: podman\n` })
    const entries = [{ name: 'podman', package: '@acme/host-cleaner-podman' }]
    expect(loadPlugins(s, {}, { loaded: [], entries }).descriptors.map((d) => d.name)).toEqual([
      'uv',
    ])
    expect(() => loadPlugins(s)).toThrow(
      /supersededBy podman is no built-in plugin and no package the config names/,
    )
  })

  /** The descriptor `uv`, superseded by cargo, its folder made, built for a temp home. */
  function supersededUv(): Plugin {
    const h = tempHome()
    cleanups.push(h.cleanup)
    folder(join(h.home, '.cache', 'x'), { blob: 'x' })
    const { definitions } = loadPlugins(
      sources({ 'uv.yaml': `${store('.cache/x')}supersededBy: cargo\n` }),
    )
    return definitions
      .find((d) => d.name === 'uv')!
      .create({
        settings: { idleHours: 0 },
        env: h.env,
        kit: pluginKit('uv', { env: h.env }),
      })
  }

  test('supersededBy: survey asks the built-in once, and the descriptor stands down', async () => {
    let asked = 0
    const cargo: Plugin = {
      name: 'cargo',
      detect: () => {
        asked += 1
        return true
      },
    }
    const result = await survey([cargo, supersededUv()], fakeContext())
    expect(asked).toBe(1)
    expect(result.plugins.map((p) => p.name)).toEqual(['cargo'])
  })

  test('supersededBy: a built-in whose detect answered past its limit does not run, so the descriptor does', async () => {
    const after = (ms: number): Promise<boolean> =>
      new Promise((done) => setTimeout(() => done(true), ms))
    // It answers while a later plugin's detect waits, or only once it is past its limit.
    const late: Array<Plugin['detect']> = [
      () => after(60),
      () => {
        const start = performance.now()
        while (performance.now() - start < 40);
        return true
      },
    ]
    for (const detect of late) {
      const cargo: Plugin = { name: 'cargo', limits: { detect: 20 }, detect }
      const slow: Plugin = { name: 'slow', detect: () => after(200) }
      const result = await survey([cargo, slow, supersededUv()], fakeContext())
      expect(result.plugins.map((p) => p.name)).toEqual(['slow', 'uv'])
      expect(result.warnings.join('\n')).toContain('cargo: detect failed')
    }
  })

  test('supersededBy: a built-in whose detect throws or answers no does not run', async () => {
    const answers: Array<Plugin['detect']> = [
      () => false,
      () => ({ active: false, note: 'down' }),
      () => {
        throw new Error('down')
      },
    ]
    for (const detect of answers) {
      const result = await survey([{ name: 'cargo', detect }, supersededUv()], fakeContext())
      expect(result.plugins.map((p) => p.name)).toEqual(['uv'])
    }
  })

  test('supersededBy: survey calls a class-based plugin as itself', async () => {
    class Cargo implements Plugin {
      readonly name = 'cargo'
      readonly #root: string = '/from/scope'
      detect(): boolean {
        return this.#root !== ''
      }
      scope(): string[] {
        return [this.#root]
      }
    }
    const cargo = new Cargo()
    const result = await survey([cargo, supersededUv()], fakeContext())
    expect(result.plugins).toHaveLength(1)
    expect(result.plugins[0]).toBe(cargo)
    expect(result.ctx.targets).toEqual(['/from/scope'])
  })
})

describe('problems', () => {
  test('a descriptor that cannot be used is a problem of its name; the others load', () => {
    const s = sources(
      { 'uv.yaml': store('.cache/uv'), 'git.yaml': store('.cache/git') },
      { 'bad.yaml': 'descriptor: 1\npaths: {}\ncandidates: []\n', 'My_tool.yaml': store('x') },
    )
    const { descriptors, problems } = findDescriptors(s, RESERVED)
    expect(descriptors.map((d) => d.name)).toEqual(['uv'])
    expect(problems.map((p) => [p.name, p.error.name])).toEqual([
      ['My_tool', 'DescriptorLoadError'],
      ['bad', 'DescriptorError'],
      ['git', 'DescriptorLoadError'],
    ])
  })

  test('a supersededBy that names no built-in is a problem of that name', () => {
    const { definitions, problems } = findPlugins(
      sources({ 'uv.yaml': `${store('x')}supersededBy: cargoo\n`, 'npm.yaml': store('.npm') }),
    )
    expect(definitions.at(-1)!.name).toBe('npm')
    expect(problems.map((p) => p.name)).toEqual(['uv'])
    expect(problems[0]!.error.message).toContain('cargoo')
  })

  test('one --descriptor file named directly and through a link loads once', () => {
    const dir = tempDir()
    const uv = join(dir, 'uv.yaml')
    writeFileSync(uv, store('.cache/uv'))
    const link = join(tempDir(), 'uv.yaml')
    symlinkSync(uv, link)
    const linked = join(tempDir(), 'linked')
    symlinkSync(dir, linked)
    const flag = [uv, link, join(linked, 'uv.yaml')]
    const loaded = loadDescriptors({ shipped: tempDir(), flag }, RESERVED)
    expect(loaded.map((d) => [d.name, d.path])).toEqual([['uv', uv]])
  })

  test('a --descriptor link of another name is its own descriptor, and replaces the one of that name', () => {
    const s = sources({ 'pip.yaml': store('shipped-pip') })
    const dir = folder(join(tempDir(), 'mine'), { 'uv.yaml': store('.cache/uv') })
    const uv = join(dir, 'uv.yaml')
    const pip = join(dir, 'pip.yaml')
    symlinkSync(uv, pip)
    const loaded = loadDescriptors({ ...s, flag: [uv, pip] }, RESERVED)
    expect(loaded.map((d) => [d.name, d.path])).toEqual([
      ['pip', pip],
      ['uv', uv],
    ])
  })

  test('a name whose files clash in one source is usable once a later source replaces it', () => {
    const s = sources({ 'pip.yaml': store('a'), 'pip.yml': store('b') })
    expect(findDescriptors(s, RESERVED).problems.map((p) => p.name)).toEqual(['pip'])
    folder(s.user, { 'pip.yaml': store('user-pip') })
    const { descriptors, problems } = findDescriptors(s, RESERVED)
    expect(problems).toEqual([])
    expect(descriptors.map((d) => [d.name, d.source])).toEqual([['pip', 'user']])
  })
})
