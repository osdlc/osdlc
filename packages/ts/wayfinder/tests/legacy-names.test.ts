/**
 * The old waypost names still work after the rename to wayfinder: the config
 * variable, the user file, the project file and the trust store. The cache has
 * no fallback; a re-probe is cheap.
 *
 * Every case injects its own `env` and `home`, so none of them reads or writes
 * the developer's real files.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { trustStore } from '@osdlc/trust-repo'

import { cacheDir } from '../src/cache.ts'
import { runCleanCommand } from '../src/clean-command.ts'
import { runConfigCommand } from '../src/config-command.ts'
import { configLocations, loadConfig } from '../src/config.ts'
import { appTrustStore } from '../src/trust-store.ts'
import { fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string> = {}): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

const json = (value: unknown): string => JSON.stringify(value)

describe('config variable', () => {
  test('WAYPOST_CONFIG is read when WAYFINDER_CONFIG is unset', () => {
    const at = configLocations('/repo', { WAYPOST_CONFIG: '/old/mine.json' }, '/home/dev')
    expect(at.user).toBe('/old/mine.json')
    expect(at.userFromEnv).toBe(true)
    expect(at.userEnvVar).toBe('WAYPOST_CONFIG')
  })

  test('WAYFINDER_CONFIG wins when both are set', () => {
    const at = configLocations(
      '/repo',
      { WAYPOST_CONFIG: '/old/mine.json', WAYFINDER_CONFIG: '/new/mine.json' },
      '/home/dev',
    )
    expect(at.user).toBe('/new/mine.json')
    expect(at.userEnvVar).toBe('WAYFINDER_CONFIG')
  })

  test('loading through WAYPOST_CONFIG warns with the new name', async () => {
    const other = await root({ 'mine.json': json({ discovery: 'walk' }) })
    const loaded = await loadConfig(
      await root(),
      { WAYPOST_CONFIG: join(other, 'mine.json') },
      await root(),
    )
    expect(loaded.effective.discovery).toBe('walk')
    expect(loaded.warnings.join('\n')).toContain('set WAYFINDER_CONFIG instead')
  })

  test('a missing file named by WAYPOST_CONFIG is an error that names WAYPOST_CONFIG', async () => {
    await expect(
      loadConfig(await root(), { WAYPOST_CONFIG: '/nowhere/mine.json' }, await root()),
    ).rejects.toThrow('WAYPOST_CONFIG names a file that does not exist')
  })
})

describe('user file', () => {
  test('the waypost user file is read when the wayfinder one does not exist', async () => {
    const home = await root({ '.config/waypost/config.json': json({ discovery: 'git' }) })
    const loaded = await loadConfig(await root(), {}, home)
    expect(loaded.locations.user).toBe(join(home, '.config/waypost/config.json'))
    expect(loaded.locations.userLegacy).toBe(true)
    expect(loaded.effective.discovery).toBe('git')
    expect(loaded.warnings.join('\n')).toContain(
      `move it to ${join(home, '.config/wayfinder/config.json')}`,
    )
  })

  test('the wayfinder user file wins when both exist', async () => {
    const home = await root({
      '.config/waypost/config.json': json({ discovery: 'git' }),
      '.config/wayfinder/config.json': json({ discovery: 'walk' }),
    })
    const loaded = await loadConfig(await root(), {}, home)
    expect(loaded.locations.userLegacy).toBe(false)
    expect(loaded.effective.discovery).toBe('walk')
    expect(loaded.warnings).toEqual([])
  })

  test('the fallback follows XDG_CONFIG_HOME', async () => {
    const xdg = await root({ 'waypost/config.json': json({ discovery: 'git' }) })
    const at = configLocations('/repo', { XDG_CONFIG_HOME: xdg }, '/home/dev')
    expect(at.user).toBe(join(xdg, 'waypost/config.json'))
  })

  test('config set --user edits the waypost file it reads', async () => {
    const home = await root({ '.config/waypost/config.json': json({ discovery: 'git' }) })
    const code = await runConfigCommand(
      'wayfinder',
      await root(),
      ['set', '--user', 'allowExec', 'false'],
      {
        stdout: () => {},
        stderr: () => {},
        env: {},
        home,
      },
    )
    expect(code).toBe(0)
    const written = JSON.parse(await readFile(join(home, '.config/waypost/config.json'), 'utf-8'))
    expect(written).toEqual({ allowExec: false, discovery: 'git' })
  })
})

describe('project file', () => {
  test('waypost.config.json is read when wayfinder.config.json does not exist', async () => {
    const project = await root({ 'waypost.config.json': json({ excludePaths: ['fixtures'] }) })
    const loaded = await loadConfig(project, {}, await root())
    expect(loaded.locations.project).toBe(join(project, 'waypost.config.json'))
    expect(loaded.locations.projectLegacy).toBe(true)
    expect(loaded.effective.excludePaths).toEqual(['fixtures'])
    expect(loaded.warnings.join('\n')).toContain('rename it to wayfinder.config.json')
  })

  test('wayfinder.config.json wins when both exist', async () => {
    const project = await root({
      'waypost.config.json': json({ excludePaths: ['old'] }),
      'wayfinder.config.json': json({ excludePaths: ['new'] }),
    })
    const loaded = await loadConfig(project, {}, await root())
    expect(loaded.locations.projectLegacy).toBe(false)
    expect(loaded.effective.excludePaths).toEqual(['new'])
  })

  test('the old file keeps the same limits: it cannot raise allowExec', async () => {
    const project = await root({ 'waypost.config.json': json({ allowExec: true }) })
    const loaded = await loadConfig(project, {}, await root())
    expect(loaded.effective.allowExec).toBe(false)
  })

  test('a new project file is wayfinder.config.json', () => {
    expect(configLocations('/repo', {}, '/home/dev').project).toBe('/repo/wayfinder.config.json')
  })
})

describe('trust store', () => {
  async function stores() {
    const home = await root()
    const env = { XDG_STATE_HOME: join(home, 'state') }
    const repo = await root({ 'package.json': '{}' })
    return {
      env,
      home,
      repo,
      app: appTrustStore({ env, home }),
      legacy: trustStore({ tool: 'waypost', env, home }),
      current: trustStore({ tool: 'wayfinder', env, home }),
    }
  }

  test('a grant in the waypost store is honoured', async () => {
    const { app, legacy, repo } = await stores()
    await legacy.trust(repo)
    expect(await app.isTrusted(repo)).toBe(true)
    expect(await app.list()).toEqual([await app.resolveRoot(repo)])
  })

  test('a new grant goes to the wayfinder store', async () => {
    const { app, current, legacy, repo } = await stores()
    const result = await app.trust(repo)
    expect(result.alreadyTrusted).toBe(false)
    expect(result.marker.startsWith(current.dir())).toBe(true)
    expect(await current.isTrusted(repo)).toBe(true)
    expect(await legacy.isTrusted(repo)).toBe(false)
  })

  test('trusting a root the waypost store holds reports it as already trusted', async () => {
    const { app, legacy, repo } = await stores()
    await legacy.trust(repo)
    expect((await app.trust(repo)).alreadyTrusted).toBe(true)
  })

  test('untrust removes the grant from both stores', async () => {
    const { app, current, legacy, repo } = await stores()
    await legacy.trust(repo)
    await current.trust(repo)
    expect(await app.untrust(repo)).toBe(true)
    expect(await legacy.isTrusted(repo)).toBe(false)
    expect(await current.isTrusted(repo)).toBe(false)
    expect(await app.untrust(repo)).toBe(false)
  })

  test('a root in both stores is listed once', async () => {
    const { app, current, legacy, repo } = await stores()
    await legacy.trust(repo)
    await current.trust(repo)
    expect(await app.list()).toHaveLength(1)
  })

  test('clean --trust clears the waypost store too', async () => {
    const { app, env, home, legacy, repo } = await stores()
    await legacy.trust(repo)
    let out = ''
    const code = await runCleanCommand('wayfinder', ['--trust'], {
      stdout: (t) => void (out += t),
      stderr: () => {},
      env,
      home,
    })
    expect(code).toBe(0)
    expect(out).toContain('the old waypost name')
    expect(await app.isTrusted(repo)).toBe(false)
  })

  test('bare clean lists the waypost store only when it holds something', async () => {
    const { env, home, legacy, repo } = await stores()
    const report = async (): Promise<string> => {
      let out = ''
      await runCleanCommand('wayfinder', [], {
        stdout: (t) => void (out += t),
        stderr: () => {},
        env,
        home,
      })
      return out
    }
    expect(await report()).not.toContain('waypost')
    await legacy.trust(repo)
    expect(await report()).toContain(legacy.dir())
  })
})

describe('cache', () => {
  test('has no waypost fallback', async () => {
    const home = await root()
    await mkdir(join(home, '.cache/waypost'), { recursive: true })
    await writeFile(join(home, '.cache/waypost/x'), '', 'utf-8')
    expect(cacheDir({}, home)).toBe(join(home, '.cache/wayfinder'))
  })
})
