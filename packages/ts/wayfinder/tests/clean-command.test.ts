/**
 * `way clean`. HOME is a throwaway directory and the environment is empty in
 * every test. A test that let either default would delete the developer's
 * real stores.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { renderShim } from '@osdlc/cli-tool/devlink'

import { WAYFINDER_SPEC } from '../src/devlink.ts'
import { runWay, wayApp } from './app-support.ts'
import { fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

const exists = async (path: string): Promise<boolean> =>
  await stat(path).then(
    () => true,
    () => false,
  )

async function put(path: string, body = '{}'): Promise<void> {
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, body)
}

/** A home with the cache, trust store and user config at their xdg paths. */
async function populated(): Promise<{
  home: string
  cache: string
  trust: string
  config: string
}> {
  const home = await fixtureRoot({})
  roots.push(home)
  const p = {
    home,
    cache: join(home, '.cache', 'wayfinder'),
    trust: join(home, '.local', 'state', 'wayfinder', 'trusted'),
    config: join(home, '.config', 'wayfinder', 'config.json'),
  }
  await put(join(p.cache, 'reports', 'v2', 'a.json'))
  await put(join(p.trust, 'repo-abc'), '')
  await put(p.config)
  return p
}

const clean = (home: string, argv: string[], env: Record<string, string> = {}) =>
  runWay(['clean', ...argv], { cwd: home, home, env, app: wayApp({ platform: 'linux' }) })

describe('way clean', () => {
  test('with no flag it reports every store and removes nothing', async () => {
    const p = await populated()
    const ran = await clean(p.home, [])
    expect(ran.exit).toBe(0)
    for (const flag of ['--cache', '--trust', '--config', '--dev']) expect(ran.out).toContain(flag)
    expect(ran.out).toContain('Nothing was removed.')
    expect(await exists(p.cache)).toBe(true)
    expect(await exists(p.config)).toBe(true)
  })

  test('--json reports sizes, and null for an empty store', async () => {
    const p = await populated()
    const ran = await clean(p.home, ['--json'])
    const stores = (ran.json() as { stores: { key: string; bytes: number | null }[] }).stores
    expect(stores.map((s) => s.key)).toEqual(['cache', 'trust', 'config', 'dev'])
    expect(stores.find((s) => s.key === 'config')?.bytes).toBe(2)
    expect(stores.find((s) => s.key === 'dev')?.bytes).toBeNull()
  })

  test('--cache removes the cache only, and prunes nothing above the base', async () => {
    const p = await populated()
    const ran = await clean(p.home, ['--cache'])
    expect(ran.exit).toBe(0)
    expect(ran.out).toContain('removed stored probe results')
    expect(await exists(p.cache)).toBe(false)
    expect(await exists(join(p.home, '.cache'))).toBe(true)
    expect(await exists(p.trust)).toBe(true)
  })

  test('--trust removes the store, prunes its empty parent and says trust is asked again', async () => {
    const p = await populated()
    const ran = await clean(p.home, ['--trust'])
    expect(ran.exit).toBe(0)
    expect(ran.err).toContain('will ask again')
    expect(await exists(join(p.home, '.local', 'state', 'wayfinder'))).toBe(false)
    expect(await exists(join(p.home, '.local', 'state'))).toBe(true)
  })

  test('a parent that still holds something is kept', async () => {
    const p = await populated()
    await put(join(p.home, '.local', 'state', 'wayfinder', 'other'))
    await clean(p.home, ['--trust'])
    expect(await readdir(join(p.home, '.local', 'state', 'wayfinder'))).toEqual(['other'])
  })

  test('--config without --yes is a usage error naming the file, and removes nothing', async () => {
    const p = await populated()
    const ran = await clean(p.home, ['--config'])
    expect(ran.exit).toBe(2)
    expect(ran.err).toContain(p.config)
    expect(ran.err).toContain('needs --yes')
    expect(await exists(p.config)).toBe(true)
  })

  test('--config --yes removes the file and its empty directory', async () => {
    const p = await populated()
    expect((await clean(p.home, ['--config', '--yes'])).exit).toBe(0)
    expect(await exists(join(p.home, '.config', 'wayfinder'))).toBe(false)
  })

  test('a config WAYFINDER_CONFIG names is named in the report, the refusal and before removal', async () => {
    const p = await populated()
    const own = join(p.home, 'dotfiles', 'way.json')
    await put(own)
    const env = { WAYFINDER_CONFIG: own }
    expect((await clean(p.home, [], env)).out).toContain('from WAYFINDER_CONFIG')
    const refused = await clean(p.home, ['--config'], env)
    expect(refused.err).toContain('named by WAYFINDER_CONFIG')
    const ran = await clean(p.home, ['--config', '--yes'], env)
    expect(ran.err).toContain(`removing ${own}, which WAYFINDER_CONFIG names`)
    expect(await exists(own)).toBe(false)
    // Nothing above a file the variable names is removed.
    expect(await exists(join(p.home, 'dotfiles'))).toBe(true)
    expect(await exists(p.config)).toBe(true)
  })

  test('--dev removes link state and the marked shims, and leaves other files on PATH', async () => {
    const p = await populated()
    const state = join(p.home, '.config', 'way')
    await put(join(state, 'link.json'))
    const bin = join(p.home, '.local', 'bin')
    await put(join(bin, 'way'), renderShim(WAYFINDER_SPEC, '/checkout/bin/way.js'))
    await put(join(bin, 'wayfinder'), '#!/bin/sh\necho mine\n')
    const report = await clean(p.home, [])
    expect(report.out).toContain('the way shim')
    expect(report.out).not.toContain('the wayfinder shim')
    const ran = await clean(p.home, ['--dev'])
    expect(ran.exit).toBe(0)
    expect(await exists(state)).toBe(false)
    expect(await exists(join(bin, 'way'))).toBe(false)
    expect(await exists(join(bin, 'wayfinder'))).toBe(true)
  })

  test('--legacy removes the files under the old name, and is listed only when they exist', async () => {
    const p = await populated()
    expect((await clean(p.home, [])).out).not.toContain('--legacy')
    const old = join(p.home, '.config', 'waypost', 'config.json')
    await put(old)
    expect((await clean(p.home, [])).out).toContain('--legacy')
    expect((await clean(p.home, ['--legacy'])).exit).toBe(0)
    expect(await exists(join(p.home, '.config', 'waypost'))).toBe(false)
    expect(await exists(p.config)).toBe(true)
  })

  test('on macOS --legacy also removes the old native link state', async () => {
    const p = await populated()
    const native = join(p.home, 'Library', 'Application Support', 'way')
    await put(join(native, 'link.json'))
    const app = wayApp({ platform: 'darwin' })
    expect((await runWay(['clean', '--legacy'], { cwd: p.home, home: p.home, app })).exit).toBe(0)
    expect(await exists(native)).toBe(false)
  })

  test('--everything needs --yes, then removes every store', async () => {
    const p = await populated()
    expect((await clean(p.home, ['--everything'])).exit).toBe(2)
    expect(await exists(p.cache)).toBe(true)
    expect((await clean(p.home, ['--everything', '--yes'])).exit).toBe(0)
    for (const path of [p.cache, p.trust, p.config]) expect(await exists(path)).toBe(false)
  })

  test('a flag for an empty store says nothing is stored and exits 0', async () => {
    const home = await fixtureRoot({})
    roots.push(home)
    const ran = await clean(home, ['--cache'])
    expect(ran.exit).toBe(0)
    expect(ran.out).toContain('nothing stored at')
  })

  test('the adapters get the report but cannot remove', async () => {
    const p = await populated()
    const app = wayApp({ platform: 'linux' })
    const ctx = { cwd: p.home, env: { HOME: p.home } }
    for (const surface of ['mcp', 'http'] as const) {
      expect(await app.call(['clean'], { cache: true }, ctx, { surface })).toMatchObject({
        status: 'refused',
        reason: 'cli-only',
      })
      expect(await app.call(['clean'], {}, ctx, { surface })).toMatchObject({ status: 'ok' })
    }
    expect(await exists(p.cache)).toBe(true)
  })
})
