/**
 * Plugins loaded from packages: where a package is looked for, the checks on
 * what it exports and on what its `create` returns, and the run's plugin list
 * with packages between the built-ins and the descriptors.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, isAbsolute, join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import {
  DescriptorLoadError,
  PLUGIN_API,
  PackageError,
  PackageLoadError,
  loadPackages,
  loadPlugins,
  packageEntries,
  packageRoots,
  pluginKit,
  survey,
  type PackageEntry,
  type PluginDefinition,
} from '../src/index.ts'
import { withPackages } from '../src/registry.ts'
import { contractSuite, fakeContext, tempHome } from '../src/testing.ts'
import {
  CLASS_PLUGIN,
  FIXTURE,
  FIXTURE_PLUGIN,
  exporting,
  nodeModules,
} from './fixtures/packages.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-packages-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const entry = (name = 'fixture', pkg = FIXTURE): PackageEntry => ({ name, package: pkg })

/** `source` installed as the fixture package, and the result of loading it as `plugins.<name>`. */
async function load(source: string, name = 'fixture', manifest?: Record<string, unknown>) {
  const nm = nodeModules(tempDir())
  const path = nm.add(FIXTURE, source, manifest)
  return { path, root: nm.root, ...(await loadPackages([entry(name)], [nm.root])) }
}

/** The one failure `load` gave. */
async function failure(source: string, name = 'fixture'): Promise<string> {
  const r = await load(source, name)
  expect(r.loaded).toEqual([])
  expect(r.failed).toHaveLength(1)
  return r.failed[0]!.reason
}

/** `def` created over a temporary home with a `.fixture/old` folder. */
function created(def: PluginDefinition) {
  const h = tempHome()
  cleanups.push(h.cleanup)
  mkdirSync(join(h.home, '.fixture', 'old'), { recursive: true })
  writeFileSync(join(h.home, '.fixture', 'old', 'blob'), 'x')
  const kit = pluginKit(def.name, { env: h.env })
  return { home: h.home, plugin: def.create({ settings: { keep: [] }, env: h.env, kit }) }
}

describe('where a package is looked for', () => {
  test('beside host-cleaner first, then the global prefix', () => {
    const roots = packageRoots({ npm_config_prefix: '/opt/npm' }, '/a/node_modules/@osdlc/hc')
    expect(roots).toEqual(
      process.platform === 'win32'
        ? expect.arrayContaining([join('/opt/npm', 'node_modules')])
        : [
            '/a/node_modules/@osdlc/hc/node_modules',
            '/a/node_modules/@osdlc/node_modules',
            '/a/node_modules',
            '/node_modules',
            '/opt/npm/lib/node_modules',
          ],
    )
  })

  test('the global prefix defaults to npm’s: %APPDATA%\\npm on Windows, else where Node is installed', () => {
    const roots = packageRoots({}, '/x')
    expect(roots.at(-1)).toBe(
      process.platform === 'win32'
        ? join(dirname(process.execPath), 'node_modules')
        : join(dirname(dirname(process.execPath)), 'lib', 'node_modules'),
    )
    const appData = packageRoots({ APPDATA: '/users/me/AppData/Roaming' }, '/x')
    expect(appData.at(-1)).toBe(
      process.platform === 'win32'
        ? join('/users/me/AppData/Roaming', 'npm', 'node_modules')
        : join(dirname(dirname(process.execPath)), 'lib', 'node_modules'),
    )
  })

  test('no root is relative to the folder host-cleaner runs in: an empty prefix is unset, a relative one gives none', () => {
    const beside = packageRoots({ npm_config_prefix: '/opt/npm' }, '/a').slice(0, -1)
    expect(packageRoots({ npm_config_prefix: '' }, '/a')).toEqual(packageRoots({}, '/a'))
    expect(packageRoots({ APPDATA: '' }, '/a')).toEqual(packageRoots({}, '/a'))
    for (const npm_config_prefix of ['lib', '.', './npm', '../npm', '~/npm', ' ']) {
      expect(packageRoots({ npm_config_prefix }, '/a')).toEqual(beside)
    }
    for (const env of [{}, { npm_config_prefix: '' }, { APPDATA: '' }, { APPDATA: 'x' }]) {
      expect(packageRoots(env).filter((r) => !isAbsolute(r))).toEqual([])
    }
  })

  /** The global root under `prefix`. */
  const globalRoot = (prefix: string): string =>
    process.platform === 'win32'
      ? join(prefix, 'node_modules')
      : join(prefix, 'lib', 'node_modules')

  /** `text` written to `file`, its folders made. */
  const write = (file: string, text: string): void => {
    mkdirSync(dirname(file), { recursive: true })
    writeFileSync(file, text)
  }

  /** An npm installed under `<dir>/npm`, its `bin` on PATH, with `npmrc` beside it as a distributor ships it. */
  function npmAt(dir: string, npmrc: string): string {
    const cli = join(dir, 'npm', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js')
    write(cli, '')
    write(join(dir, 'npm', 'lib', 'node_modules', 'npm', 'npmrc'), npmrc)
    mkdirSync(join(dir, 'npm', 'bin'))
    symlinkSync(cli, join(dir, 'npm', 'bin', 'npm'))
    return join(dir, 'npm', 'bin')
  }

  test('the prefix is read from npmrc as npm reads it: the user’s, then the global one', () => {
    const home = tempDir()
    write(
      join(home, '.npmrc'),
      `; mine\n# also a comment\nregistry=https://example.test/\nprefix = '${home}/g' \n[section]\nprefix=/elsewhere\n`,
    )
    expect(packageRoots({ HOME: home }, '/a').at(-1)).toBe(globalRoot(join(home, 'g')))
    write(join(home, '.npmrc'), 'prefix=~/tilde\n')
    expect(packageRoots({ HOME: home }, '/a').at(-1)).toBe(globalRoot(join(home, 'tilde')))
    write(join(home, 'other.npmrc'), 'prefix=${HOME}/other ; a comment\n')
    expect(
      packageRoots({ HOME: home, NPM_CONFIG_USERCONFIG: join(home, 'other.npmrc') }, '/a').at(-1),
    ).toBe(globalRoot(join(home, 'other')))
    // The global npmrc is `<prefix>/etc/npmrc`, the prefix as far as the files above it set it.
    write(join(home, 'u.npmrc'), `globalconfig=${join(home, 'g.npmrc')}\n`)
    write(join(home, 'g.npmrc'), `prefix=${join(home, 'system')}\n`)
    expect(
      packageRoots({ HOME: home, npm_config_userconfig: join(home, 'u.npmrc') }, '/a').at(-1),
    ).toBe(globalRoot(join(home, 'system')))
    write(join(home, 'p', 'etc', 'npmrc'), `prefix=${join(home, 'from-etc')}\n`)
    expect(
      packageRoots(
        { HOME: home, npm_config_userconfig: '/none', PREFIX: join(home, 'p') },
        '/a',
      ).at(-1),
    ).toBe(globalRoot(join(home, 'from-etc')))
  })

  test('the environment wins over npmrc, in any case, and PREFIX is npm’s default', () => {
    const home = tempDir()
    write(join(home, '.npmrc'), `prefix=${join(home, 'user')}\n`)
    expect(packageRoots({ HOME: home, NPM_CONFIG_PREFIX: '/opt/up' }, '/a').at(-1)).toBe(
      globalRoot('/opt/up'),
    )
    expect(packageRoots({ HOME: home, npm_config_prefix: '' }, '/a').at(-1)).toBe(
      globalRoot(join(home, 'user')),
    )
    expect(packageRoots({ PREFIX: '/opt/termux' }, '/a').at(-1)).toBe(globalRoot('/opt/termux'))
    expect(packageRoots({ HOME: home, PREFIX: '/opt/termux' }, '/a').at(-1)).toBe(
      globalRoot(join(home, 'user')),
    )
  })

  test.skipIf(process.platform === 'win32')(
    'the npmrc the npm on PATH ships with sets the prefix, as Homebrew’s does',
    () => {
      const dir = tempDir()
      const bin = npmAt(dir, `prefix=${join(dir, 'brew')}\n`)
      expect(packageRoots({ PATH: `/nowhere:${bin}` }, '/a').at(-1)).toBe(
        globalRoot(join(dir, 'brew')),
      )
      // Below the user's npmrc and the global one, which `<prefix>/etc/npmrc` names.
      write(join(dir, 'brew', 'etc', 'npmrc'), `prefix=${join(dir, 'etc')}\n`)
      expect(packageRoots({ PATH: bin }, '/a').at(-1)).toBe(globalRoot(join(dir, 'etc')))
      write(join(dir, '.npmrc'), `prefix=${join(dir, 'user')}\n`)
      expect(packageRoots({ PATH: bin, HOME: dir }, '/a').at(-1)).toBe(
        globalRoot(join(dir, 'user')),
      )
    },
  )

  test.skipIf(process.platform === 'win32')(
    'no npmrc is read from the folder host-cleaner runs in or from a node_modules/.bin on PATH',
    () => {
      const checkout = tempDir()
      write(join(checkout, '.npmrc'), `prefix=${join(checkout, 'project')}\n`)
      const bin = npmAt(join(checkout, 'node_modules', '.bin'), `prefix=${join(checkout, 'dep')}\n`)
      const shim = join(tempDir(), 'npm')
      write(shim, '#!/bin/sh\n')
      const plain = packageRoots({}, checkout)
      for (const env of [
        { PATH: bin },
        { PATH: `.:${bin}` },
        { PATH: `${dirname(shim)}:${npmAt(tempDir(), 'prefix=/later\n')}` },
        { HOME: checkout, npm_config_userconfig: '.npmrc' },
      ]) {
        expect(packageRoots(env, checkout)).toEqual(plain)
      }
      expect(packageRoots({ PREFIX: 'project' }, checkout)).toEqual(plain.slice(0, -1))
    },
  )

  test('the first root that has the package wins', async () => {
    const first = nodeModules(tempDir())
    const second = nodeModules(tempDir())
    const empty = join(tempDir(), 'node_modules')
    second.add(FIXTURE, FIXTURE_PLUGIN, { version: '2.0.0' })
    first.add(FIXTURE, FIXTURE_PLUGIN, { version: '1.5.0' })
    const r = await loadPackages([entry()], [empty, first.root, second.root])
    expect(r.failed).toEqual([])
    expect(r.loaded.map((p) => [p.name, p.package, p.version, p.path])).toEqual([
      ['fixture', FIXTURE, '1.5.0', join(first.root, '@acme', 'host-cleaner-fixture')],
    ])
  })

  test('a package that is not installed names where it was looked for', async () => {
    const empty = join(tempDir(), 'node_modules')
    const r = await loadPackages([entry()], [empty])
    expect(r.failed).toEqual([
      {
        ...entry(),
        reason: `plugins.fixture.package: ${FIXTURE} is not installed; looked in ${empty}`,
      },
    ])
  })

  test('the entry is found through exports conditions, as Node imports it', async () => {
    const r = await load(FIXTURE_PLUGIN, 'fixture', {
      exports: { '.': { types: './index.d.ts', import: './index.js' } },
    })
    expect(r.failed).toEqual([])
    expect(r.loaded[0]!.definition.name).toBe('fixture')
  })

  test.each(['index', '.', './index.js'])(
    'a legacy main of %s resolves as Node resolves it',
    async (main) => {
      const r = await load(FIXTURE_PLUGIN, 'fixture', { exports: undefined, main })
      expect(r.failed).toEqual([])
      expect(r.loaded[0]!.definition.name).toBe('fixture')
    },
  )
})

describe('what a package must export', () => {
  test('the fixture loads and passes the contract suite, and its delete refuses a folder outside', async () => {
    const r = await load(FIXTURE_PLUGIN)
    expect(r.failed).toEqual([])
    const { plugin } = created(r.loaded[0]!.definition)
    expect(await contractSuite(plugin)).toEqual([])
    const outside = join(tempDir(), 'outside')
    mkdirSync(outside)
    const c = {
      id: `scratch:${outside}`,
      kind: 'scratch',
      owner: 'fixture',
      path: outside,
      why: 'moved',
      evidence: {},
    }
    // The suite left the kit bound to the fixture home; the outside folder is not in it.
    expect(() => plugin.delete!(c, fakeContext())).toThrow(/not inside/)
  })

  test('a plugin made as a class, with a private field and a getter-only name, runs as it is', async () => {
    const r = await load(CLASS_PLUGIN)
    expect(r.failed).toEqual([])
    const { home, plugin } = created(r.loaded[0]!.definition)
    expect(plugin.constructor.name).toBe('Fixture')
    expect(await contractSuite(plugin)).toEqual([])
    const s = await survey([plugin], fakeContext())
    expect(s.candidates.map((c) => c.id)).toEqual([`scratch:${join(home, '.fixture', 'old')}`])
  })

  test('a wrong api is refused, naming the package and both versions', async () => {
    const reason = await failure(
      exporting(
        "definePlugin({ name: 'fixture', api: 2, settings: z.object({}), create: () => ({ name: 'fixture', detect: () => true }) })",
      ),
    )
    expect(reason).toBe(
      `plugins.fixture.package: ${FIXTURE} 1.0.0 is written for plugin api 2, and this host-cleaner supports plugin api ${PLUGIN_API}; install versions of the two that match`,
    )
    // Before the shape, which another api may change.
    expect(
      await failure(exporting("{ name: 'fixture', api: 0, settings: {}, create() {} }")),
    ).toContain('is written for plugin api 0')
  })

  test('a plugin named other than its config key is refused', async () => {
    const reason = await failure(FIXTURE_PLUGIN, 'scratch')
    expect(reason).toBe(
      `plugins.scratch.package: ${FIXTURE} 1.0.0 is the plugin fixture, so its entry must be plugins.fixture, not plugins.scratch`,
    )
  })

  test('a default export that is not a plugin definition is refused', async () => {
    expect(await failure('export const x = 1\n')).toContain(
      `${FIXTURE} 1.0.0 has no default export; it must export default definePlugin({ ... })`,
    )
    expect(await failure(exporting("{ name: 'fixture', api: 1, create() {} }"))).toContain(
      'default export has no zod object settings; it must export default definePlugin({ ... })',
    )
    expect(
      await failure(exporting("{ name: 'fixture', settings: z.object({}), create() {} }")),
    ).toContain('default export has no api; it must export default definePlugin({ ... })')
  })

  test('settings made with a zod that cannot be extended are refused as that, not as no settings', async () => {
    expect(
      await failure(
        exporting("{ name: 'fixture', api: 1, settings: { shape: {}, parse() {} }, create() {} }"),
      ),
    ).toBe(
      `plugins.fixture.package: ${FIXTURE} 1.0.0 has settings made with a zod this host-cleaner can't extend; make them with the z that @osdlc/host-cleaner/plugin exports`,
    )
  })

  test('an import that throws is a failure, not a crash', async () => {
    expect(await failure("throw new Error('boom')\n")).toMatch(
      /^plugins\.fixture\.package: @acme\/host-cleaner-fixture 1\.0\.0 at .* failed to import: boom$/,
    )
    expect(await failure("throw 'missing native binding'\n")).toMatch(
      /failed to import: missing native binding$/,
    )
  })

  test('a default export that is a list is no definition', async () => {
    expect(await failure('export default []\n')).toBe(
      `plugins.fixture.package: ${FIXTURE} 1.0.0 has no default export; it must export default definePlugin({ ... })`,
    )
  })

  test('create that throws anything, or returns no object, is reported as that', async () => {
    const creating = async (body: string) => {
      const r = await load(
        exporting(
          `definePlugin({ name: 'fixture', api: PLUGIN_API, settings: z.object({}), create: () => { ${body} } })`,
        ),
      )
      let reason = ''
      try {
        created(r.loaded[0]!.definition)
      } catch (err) {
        expect(err).toBeInstanceOf(PackageLoadError)
        reason = (err as PackageLoadError).failure.reason
      }
      return reason
    }
    expect(await creating("throw 'no token'")).toBe(
      `plugins.fixture.package: ${FIXTURE} 1.0.0 could not be created: no token`,
    )
    expect(await creating('return undefined')).toBe(
      `plugins.fixture.package: ${FIXTURE} 1.0.0 returned a plugin named undefined from create, not fixture`,
    )
  })

  test('create must return a plugin of the same name', async () => {
    const r = await load(
      exporting(
        "definePlugin({ name: 'fixture', api: PLUGIN_API, settings: z.object({}), create: () => ({ name: 'other', detect: () => true }) })",
      ),
    )
    expect(() => created(r.loaded[0]!.definition)).toThrow(
      new PackageLoadError({
        ...entry(),
        reason: `plugins.fixture.package: ${FIXTURE} 1.0.0 returned a plugin named "other" from create, not fixture`,
      }),
    )
  })

  test('create must return a plugin whose hooks the core can call', async () => {
    const returning = async (plugin: string) => {
      const r = await load(
        exporting(
          `definePlugin({ name: 'fixture', api: PLUGIN_API, settings: z.object({}), create: () => (${plugin}) })`,
        ),
      )
      expect(r.failed).toEqual([])
      let reason = ''
      try {
        created(r.loaded[0]!.definition)
      } catch (err) {
        expect(err).toBeInstanceOf(PackageLoadError)
        reason = (err as PackageLoadError).failure.reason
      }
      return reason
    }
    const from = `plugins.fixture.package: ${FIXTURE} 1.0.0 returned a plugin from create whose`
    expect(await returning("{ name: 'fixture' }")).toBe(`${from} detect is missing`)
    expect(await returning("{ name: 'fixture', detect: () => true, discover: [] }")).toBe(
      `${from} discover is not a function`,
    )
    expect(
      await returning("{ name: 'fixture', detect: () => true, limits: { detect: 'soon' } }"),
    ).toBe(`${from} limits.detect is not a positive number of milliseconds`)
    // As the core reads limits: undefined is the default, and Infinity is no limit.
    expect(
      await returning("{ name: 'fixture', detect: () => true, limits: { detect: Infinity } }"),
    ).toBe(`${from} limits.detect is not a positive number of milliseconds`)
    expect(
      await returning("{ name: 'fixture', detect: () => true, limits: { detect: undefined } }"),
    ).toBe('')
    expect(await returning("{ name: 'fixture', detect: () => true, limits: { sweep: 10 } }")).toBe(
      `${from} limits names sweep, not a hook`,
    )
    expect(
      await returning(
        "{ name: 'fixture', detect: () => true, roots: () => [], limits: { roots: 5 } }",
      ),
    ).toBe('')
  })

  test('a definition not made with this host-cleaner’s definePlugin is refused when created', async () => {
    const r = await load(
      exporting(
        "{ name: 'fixture', api: PLUGIN_API, settings: z.object({}), create: () => ({ name: 'fixture', detect: () => true }) }",
      ),
    )
    expect(r.failed).toEqual([])
    expect(() => created(r.loaded[0]!.definition)).toThrow(
      /was not made with the definePlugin of the host-cleaner running it/,
    )
  })
})

describe('config entries and the run’s plugins', () => {
  test('only entries with a package, by name; a path or a built-in name is an error', () => {
    expect(
      packageEntries({ zeta: { package: 'z' }, cargo: {}, alpha: { package: '@a/b' } }),
    ).toEqual([
      { name: 'alpha', package: '@a/b' },
      { name: 'zeta', package: 'z' },
    ])
    for (const bad of ['./plugin', '/abs/plugin', '../x', 'Up', 1]) {
      expect(() => packageEntries({ x: { package: bad } })).toThrow(PackageError)
    }
    expect(() => packageEntries({ git: { package: 'git-cleaner' } })).toThrow(
      'plugins.git.package: git is the built-in plugin; every plugin has its own name, so a package plugin needs another',
    )
  })

  test('packages run after the built-ins and before the descriptors, each by name', async () => {
    const nm = nodeModules(tempDir())
    const named = (n: string) => FIXTURE_PLUGIN.replaceAll("'fixture'", `'${n}'`)
    nm.add(`${FIXTURE}-b`, named('beta'))
    nm.add(`${FIXTURE}-a`, named('alpha'))
    const entries = [entry('beta', `${FIXTURE}-b`), entry('alpha', `${FIXTURE}-a`)]
    const packages = await loadPackages(entries, [nm.root])
    const user = tempDir()
    const descriptor =
      'descriptor: 1\npaths: { s: { all: ~/.s } }\ncandidates: [{ path: s, costDescription: re-download }]\n'
    writeFileSync(join(user, 'aardvark.yaml'), descriptor)
    const shipped = tempDir()
    const loaded = loadPlugins({ shipped, user }, {}, { loaded: packages.loaded, entries })
    expect(loaded.definitions.map((d) => d.name)).toEqual([
      'git',
      'cargo',
      'node',
      'vscode',
      'cursor',
      'orca',
      'docker',
      'ollama',
      'agent-history',
      'jetbrains',
      'alpha',
      'beta',
      'aardvark',
    ])
    expect(loaded.packages.map((p) => p.version)).toEqual(['1.0.0', '1.0.0'])
    // Packages already in `found` are replaced, not added twice.
    expect(withPackages(loaded, packages.loaded).definitions).toEqual(loaded.definitions)
    // A shipped descriptor of a package's name is replaced by the package.
    writeFileSync(join(shipped, 'beta.yaml'), descriptor)
    const over = loadPlugins({ shipped, user }, {}, { loaded: packages.loaded, entries })
    expect(over.definitions.map((d) => d.name)).toEqual(loaded.definitions.map((d) => d.name))
    expect(over.problems).toEqual([])
    expect(over.descriptors.map((d) => d.name)).toEqual(['aardvark'])
    writeFileSync(join(user, 'beta.yaml'), descriptor)
    // A package of that name clashes by its entry, or by itself when the caller gives no entry.
    for (const of of [
      { loaded: [], entries },
      { loaded: packages.loaded, entries: [] },
    ]) {
      expect(() => loadPlugins({ shipped, user }, {}, of)).toThrow(
        new DescriptorLoadError(
          `descriptor ${join(user, 'beta.yaml')} is named beta, as the package plugins.beta.package names (${FIXTURE}-b); every plugin has its own name, so rename the file`,
        ),
      )
    }
  })

  test('a package named as a built-in is refused by its entry, or by itself', async () => {
    const nm = nodeModules(tempDir())
    nm.add(FIXTURE, FIXTURE_PLUGIN.replaceAll("'fixture'", "'node'"))
    const entries = [entry('node')]
    const { loaded, failed } = await loadPackages(entries, [nm.root])
    expect(failed).toEqual([])
    const sources = { shipped: tempDir() }
    for (const of of [
      { loaded: [], entries },
      { loaded, entries: [] },
    ]) {
      expect(() => loadPlugins(sources, {}, of)).toThrow(
        new PackageError(
          'plugins.node.package: node is the built-in plugin; every plugin has its own name, so a package plugin needs another',
        ),
      )
    }
  })
})
