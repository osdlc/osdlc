/**
 * The config schema and what derives from it: the settable keys, the shipped
 * `schema/config.json`, `$schema`, did-you-mean, the user-only keys, the
 * shared reader and writer, and where the files live.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

import {
  CLI_ONLY_KEYS,
  CONFIG_KEYS,
  CONFIG_SCHEMA_URL,
  ConfigError,
  configJsonSchema,
  configLocations,
  loadConfig,
  projectWriteRefusal,
  readSettings,
  removeSetting,
  trustPolicyFromConfig,
  validateConfig,
  writeConfigFile,
  writeSetting,
} from '../src/config.ts'
import { cacheDir } from '../src/cache.ts'
import { appTrustStore } from '../src/trust-store.ts'
import { appDirs } from '../src/xdg.ts'
import { CONFIG_HOME, USER_CONFIG, fixtureRoot, removeRoot } from './support.ts'

const WINDOWS = process.platform === 'win32'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string> = {}): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

describe('the schema', () => {
  test('lists every setting in schema order, trust.tools as one key', () => {
    expect(CONFIG_KEYS).toEqual([
      'runners.disabled',
      'runners.order',
      'runners.timeout',
      'allowExec',
      'discovery',
      'excludePaths',
      'trust.paths',
      'trust.owners',
      'trust.tools',
      'tools',
      'open',
      'theme',
      'skills',
    ])
  })

  test('schema/config.json is the schema this build derives', async () => {
    const shipped = JSON.parse(
      await readFile(new URL('../schema/config.json', import.meta.url), 'utf8'),
    ) as unknown
    expect(shipped).toEqual(configJsonSchema())
  })

  test('the schema URL names this release line or the next one', async () => {
    // Before a release the package still carries the last version; the
    // release bump then catches up with the URL. A URL behind the package
    // version is stale.
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as {
      version: string
    }
    const line = (v: string): number => {
      const [major, minor] = v.split('.').map(Number)
      return (major ?? 0) * 1000 + (minor ?? 0)
    }
    const url = /@osdlc\/wayfinder@(\d+\.\d+)\//.exec(CONFIG_SCHEMA_URL)?.[1]
    expect(url).toBeDefined()
    expect(line(url!)).toBeGreaterThanOrEqual(line(pkg.version))
    expect(line(url!) - line(pkg.version)).toBeLessThanOrEqual(1)
    expect(configJsonSchema()['$id']).toBe(CONFIG_SCHEMA_URL)
  })

  test('$schema is accepted and is not a setting', () => {
    const { config, warnings } = validateConfig({ $schema: 'x', allowExec: false }, 'f.json')
    expect(warnings).toEqual([])
    expect(config).toEqual({ allowExec: false })
  })

  test('an unknown key warns with the closest known key', () => {
    const { warnings } = validateConfig({ runner: {}, trust: { owner: [] } }, 'f.json')
    expect(warnings).toEqual([
      'f.json: unknown setting "runner" (ignored); did you mean runners?',
      'f.json: unknown setting "trust.owner" (ignored); did you mean trust.owners?',
    ])
  })

  test('open and theme take only their values', () => {
    expect(() => validateConfig({ open: 'gui' }, 'f.json')).toThrow(
      'f.json: open must be one of tui, web, got "gui"',
    )
    expect(() => validateConfig({ theme: 'blue' }, 'f.json')).toThrow(ConfigError)
    expect(validateConfig({ open: 'web', theme: 'dark' }, 'f.json').config).toEqual({
      open: 'web',
      theme: 'dark',
    })
  })

  test('trust.tools holds paths and owners per tool, checked like the top level', () => {
    const { config, warnings } = validateConfig(
      { trust: { tools: { mise: { paths: ['~/work/**'], deny: true } } } },
      'f.json',
    )
    expect(config.trust?.tools).toEqual({ mise: { paths: ['~/work/**'] } })
    expect(warnings[0]).toContain('unknown setting "trust.tools.mise.deny"')
    expect(() => validateConfig({ trust: { tools: { mise: { owners: 'x' } } } }, 'f.json')).toThrow(
      'trust.tools.mise.owners must be an array of strings, got a string',
    )
    expect(() => validateConfig({ trust: { tools: { '': {} } } }, 'f.json')).toThrow(
      'trust.tools has an empty key',
    )
  })

  test('trust.tools becomes the policy scopes trust-repo checks per tool', () => {
    expect(
      trustPolicyFromConfig({ trust: { paths: ['/a'], tools: { mise: { owners: ['org'] } } } }),
    ).toEqual({ paths: ['/a'], owners: [], scopes: { mise: { paths: [], owners: ['org'] } } })
    expect(trustPolicyFromConfig({})).toEqual({ paths: [], owners: [] })
  })

  test('trust, allowExec and tools are the keys only the command line writes', () => {
    expect(CLI_ONLY_KEYS).toEqual(['trust', 'allowExec', 'tools'])
  })
})

describe('the project layer', () => {
  test('open and theme in a project file are dropped with a warning naming the user file', async () => {
    const home = await root()
    const project = await root({
      'wayfinder.config.json': JSON.stringify({ open: 'web', theme: 'dark' }),
    })
    const loaded = await loadConfig(project, {}, home)
    expect(loaded.effective.open).toBe('tui')
    expect(loaded.effective.theme).toBe('system')
    expect(loaded.files.project).toEqual({ open: 'web', theme: 'dark' })
    expect(loaded.warnings).toHaveLength(2)
    expect(loaded.warnings[0]).toContain('open is ignored in a project file')
    expect(loaded.warnings[0]).toContain(loaded.locations.user)
  })

  test('a project trust.tools block is dropped like the rest of trust', async () => {
    const home = await root()
    const project = await root({
      'wayfinder.config.json': JSON.stringify({ trust: { tools: { just: { paths: ['/**'] } } } }),
    })
    const loaded = await loadConfig(project, {}, home)
    expect(loaded.effective.trust?.tools).toEqual({})
    expect(loaded.warnings.join('\n')).toContain('cannot grant itself trust')
  })

  test('projectWriteRefusal names each key a project file may not hold', () => {
    expect(projectWriteRefusal('allowExec', true)).toContain('way trust')
    expect(projectWriteRefusal('allowExec', false)).toBeNull()
    expect(projectWriteRefusal('trust.tools.mise.paths', [])).toContain('grant itself trust')
    expect(projectWriteRefusal('open', 'web')).toContain('user config')
    expect(projectWriteRefusal('theme', 'dark')).toContain('user config')
    expect(projectWriteRefusal('runners.order', ['a'])).toBeNull()
  })
})

describe('readSettings', () => {
  test('gives every setting with its source, and the defaults wayfinder runs with', async () => {
    const home = await root({
      [USER_CONFIG]: JSON.stringify({ open: 'web', theme: 'dark' }),
    })
    const project = await root({
      'wayfinder.config.json': JSON.stringify({ runners: { order: ['just'] } }),
    })
    const s = await readSettings(project, {}, home)
    expect(s.allowExec).toEqual({ key: 'allowExec', value: true, source: 'default', file: null })
    expect(s.open).toMatchObject({ value: 'web', source: 'user', file: s.loaded.locations.user })
    expect(s.theme.value).toBe('dark')
    expect(s.runnerOrder).toMatchObject({
      value: ['just'],
      source: 'project',
      file: join(project, 'wayfinder.config.json'),
    })
    expect(s.settings.map((x) => x.key)).toEqual([...CONFIG_KEYS])
  })

  test('a project allowExec: false is the effective value, from the project', async () => {
    const home = await root()
    const project = await root({ 'wayfinder.config.json': '{"allowExec": false}' })
    const s = await readSettings(project, {}, home)
    expect(s.allowExec).toMatchObject({ value: false, source: 'project' })
  })
})

describe('writeSetting and removeSetting', () => {
  test('write the user file atomically, with $schema, and leave no temp file', async () => {
    const home = await root()
    const project = await root()
    const target = { layer: 'user' as const, root: project, env: {}, home }
    const written = await writeSetting(target, 'theme', 'dark')
    expect(written.file).toBe(join(home, CONFIG_HOME, 'wayfinder', 'config.json'))
    await writeSetting(target, 'runners.order', ['moon'])
    expect(JSON.parse(await readFile(written.file, 'utf8'))).toEqual({
      $schema: CONFIG_SCHEMA_URL,
      runners: { order: ['moon'] },
      theme: 'dark',
    })
    expect(await readdir(join(home, CONFIG_HOME, 'wayfinder'))).toEqual(['config.json'])
    expect(await removeSetting(target, 'theme')).toEqual({ file: written.file, removed: true })
    expect(await removeSetting(target, 'theme')).toEqual({ file: written.file, removed: false })
  })

  test('take a key under trust.tools in the user file', async () => {
    const home = await root()
    const target = { layer: 'user' as const, root: await root(), env: {}, home }
    await writeSetting(target, 'trust.tools.mise.paths', ['~/work/**'])
    const loaded = await loadConfig(target.root, {}, home)
    expect(loaded.effective.trust?.tools).toEqual({ mise: { paths: ['~/work/**'] } })
  })

  test('refuse a project write the project file may not hold, before touching it', async () => {
    const home = await root()
    const project = await root()
    const target = { layer: 'project' as const, root: project, env: {}, home }
    for (const [key, value] of [
      ['allowExec', true],
      ['trust.paths', ['/x']],
      ['open', 'web'],
      ['theme', 'dark'],
    ] as const) {
      const err = await writeSetting(target, key, value).catch((e: unknown) => e)
      expect(err).toBeInstanceOf(ConfigError)
      expect((err as ConfigError).file).toBe('')
    }
    expect(await readdir(project)).toEqual([])
    await writeSetting(target, 'allowExec', false)
    expect(await readdir(project)).toEqual(['wayfinder.config.json'])
  })

  test('refuse an unknown key and a wrong value', async () => {
    const target = { layer: 'user' as const, root: await root(), env: {}, home: await root() }
    await expect(writeSetting(target, 'runner.order', [])).rejects.toThrow('unknown setting')
    await expect(writeSetting(target, 'open', 'gui')).rejects.toThrow('open must be one of')
  })

  test('a write survives an existing file whose mode it keeps', async () => {
    const dir = await root()
    const file = join(dir, 'wayfinder.config.json')
    await writeConfigFile(file, { allowExec: false })
    await writeConfigFile(file, { allowExec: false })
    expect(await readdir(dir)).toEqual(['wayfinder.config.json'])
  })
})

describe('paths', () => {
  test('every store is under WAYFINDER_ROOT when it is set', async () => {
    const home = await root()
    const top = await root()
    const env = { WAYFINDER_ROOT: top }
    expect(configLocations('/repo', env, home).user).toBe(
      join(top, 'config', 'wayfinder', 'config.json'),
    )
    expect(cacheDir(env, home)).toBe(join(top, 'cache', 'wayfinder'))
    expect(appTrustStore({ env, home }).dir()).toBe(join(top, 'state', 'wayfinder', 'trusted'))
  })

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)(
    'the xdg convention holds on macOS, and WAYFINDER_CONVENTION does not move it',
    () => {
      const dirs = appDirs({
        env: { WAYFINDER_CONVENTION: 'native' },
        home: '/Users/ada',
        platform: 'darwin',
      })
      expect(dirs.userConfig).toBe('/Users/ada/.config/wayfinder/config.json')
      expect(dirs.trustStore).toBe('/Users/ada/.local/state/wayfinder/trusted')
      expect(dirs.cache).toBe('/Users/ada/.cache/wayfinder')
    },
  )

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)('WAYFINDER_CONFIG_DIR moves the user config alone', () => {
    const dirs = appDirs({ env: { WAYFINDER_CONFIG_DIR: '/etc/way' }, home: '/home/ada' })
    expect(dirs.userConfig).toBe('/etc/way/wayfinder/config.json')
    expect(dirs.cache).toBe('/home/ada/.cache/wayfinder')
  })

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)('a relative WAYFINDER_ROOT is an error, not a path under the cwd', () => {
    expect(() => appDirs({ env: { WAYFINDER_ROOT: 'rel' }, home: '/home/ada' })).toThrow(
      'WAYFINDER_ROOT',
    )
  })
})
