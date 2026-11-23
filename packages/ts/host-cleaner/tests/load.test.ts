/**
 * Plugins loaded from packages: where a package is looked for, the checks on
 * what it exports and on what its `create` returns, and the run's plugin list
 * with packages between the built-ins and the descriptors.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
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
  type PackageEntry,
  type PluginDefinition,
} from '../src/index.ts'
import { contractSuite, fakeContext, tempHome } from '../src/testing.ts'
import { FIXTURE, FIXTURE_PLUGIN, exporting, nodeModules } from './fixtures/packages.ts'

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

  test('the global prefix defaults to the one Node is installed under', () => {
    const roots = packageRoots({}, '/x')
    expect(roots.at(-1)).toBe(
      process.platform === 'win32'
        ? join(dirname(process.execPath), 'node_modules')
        : join(dirname(dirname(process.execPath)), 'lib', 'node_modules'),
    )
  })

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

  test('a wrong api is refused, naming the package and both versions', async () => {
    const reason = await failure(
      exporting(
        "definePlugin({ name: 'fixture', api: 2, settings: z.object({}), create: () => ({ name: 'fixture', detect: () => true }) })",
      ),
    )
    expect(reason).toBe(
      `plugins.fixture.package: ${FIXTURE} 1.0.0 is written for plugin api 2, and this host-cleaner supports plugin api ${PLUGIN_API}; install versions of the two that match`,
    )
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
      'default export has no zod object settings',
    )
  })

  test('an import that throws is a failure, not a crash', async () => {
    expect(await failure("throw new Error('boom')\n")).toMatch(
      /^plugins\.fixture\.package: @acme\/host-cleaner-fixture 1\.0\.0 at .* failed to import: boom$/,
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
  test('only entries with a package, by name; a path or a taken name is an error', () => {
    const taken = (n: string) => (n === 'git' ? 'the built-in plugin' : undefined)
    expect(
      packageEntries({ zeta: { package: 'z' }, cargo: {}, alpha: { package: '@a/b' } }, taken),
    ).toEqual([
      { name: 'alpha', package: '@a/b' },
      { name: 'zeta', package: 'z' },
    ])
    for (const bad of ['./plugin', '/abs/plugin', '../x', 'Up', 1]) {
      expect(() => packageEntries({ x: { package: bad } }, taken)).toThrow(PackageError)
    }
    expect(() => packageEntries({ git: { package: 'git-cleaner' } }, taken)).toThrow(
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
      'orca',
      'alpha',
      'beta',
      'aardvark',
    ])
    expect(loaded.packages.map((p) => p.version)).toEqual(['1.0.0', '1.0.0'])
    writeFileSync(join(user, 'beta.yaml'), descriptor)
    expect(() => loadPlugins({ shipped, user }, {}, { loaded: [], entries })).toThrow(
      new DescriptorLoadError(
        `descriptor ${join(user, 'beta.yaml')} is named beta, as the package plugins.beta.package names (${FIXTURE}-b); every plugin has its own name, so rename the file`,
      ),
    )
  })
})
