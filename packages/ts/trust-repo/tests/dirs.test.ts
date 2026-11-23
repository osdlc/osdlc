/**
 * Where a store lives when its tool passes `vendorDirs`, and that such a
 * store starts empty: grants in the old place are not carried over
 * (osdlc/osdlc#1010, with the copy dropped).
 *
 * Every test injects `env` and `home`, or a `dirs` built from them, so no
 * test reads or writes the developer's real trust store.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, readdir, readFile, realpath, rename, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import { envVars, systemBaseDirs, TieredDirs } from '@osdlc/tiered-dirs'

import {
  trustStore,
  trustStoreDir,
  TRUST_MARKER_DIR,
  type TrustStoreOptions,
  type TrustVendorDirs,
} from '../src/index.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map((r) => rm(r, { recursive: true, force: true })))
})

async function root(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'trust-repo-dirs-')))
  roots.push(dir)
  return dir
}

/**
 * An absolute path on the host. These tests resolve on the host's own table,
 * and `/r` is not absolute on Windows, where `resolve` adds the drive.
 */
const abs = (p: string): string => resolve(p)

const TOOLY: TrustVendorDirs = { vendor: 'tooly', envVars: envVars('TOOLY') }
const OSDLC: TrustVendorDirs = { vendor: 'osdlc', envVars: envVars('OSDLC') }

/** A `dirs` factory for `platform`, as a tool that pins its convention passes one. */
function dirsFor(
  v: TrustVendorDirs,
  platform: string,
  env: Record<string, string | undefined>,
  home: string,
  convention: 'native' | 'xdg' = 'native',
): () => TieredDirs {
  return () =>
    new TieredDirs(v.vendor, systemBaseDirs(v.envVars, { platform, env, home, convention }))
}

describe('where the store lives', () => {
  test('a tool that passes neither vendorDirs nor dir keeps the old place exactly', () => {
    const env = { XDG_STATE_HOME: '/state' }
    expect(trustStore({ tool: 'tooly', env, home: '/home/dev' }).dir()).toBe(
      join('/state', 'tooly', TRUST_MARKER_DIR),
    )
    expect(trustStoreDir({ tool: 'tooly', env: {}, home: '/home/dev' })).toBe(
      join('/home/dev', '.local', 'state', 'tooly', TRUST_MARKER_DIR),
    )
    expect(trustStoreDir({ tool: 'tooly', env, home: '/home/dev' })).toBe(
      trustStoreDir('tooly', env, '/home/dev'),
    )
  })

  test('Windows: the state home tiered-dirs gives, not ~/.local/state', () => {
    const local = 'C:\\Users\\dev\\AppData\\Local'
    const env = { USERPROFILE: 'C:\\Users\\dev', LOCALAPPDATA: local }
    for (const convention of ['native', 'xdg'] as const) {
      const opts: TrustStoreOptions = {
        tool: 'tooly',
        vendorDirs: TOOLY,
        dirs: dirsFor(TOOLY, 'win32', env, 'C:\\Users\\dev', convention),
      }
      expect(trustStoreDir(opts)).toBe(join(local, 'state', 'tooly', TRUST_MARKER_DIR))
      expect(trustStore(opts).dir()).toBe(trustStoreDir(opts))
    }
  })

  test('macOS: Application Support under native, the old XDG place under xdg', () => {
    const home = '/Users/dev'
    const native = dirsFor(TOOLY, 'darwin', {}, home, 'native')
    const xdg = dirsFor(TOOLY, 'darwin', {}, home, 'xdg')
    const base = { tool: 'tooly', vendorDirs: TOOLY }
    expect(trustStoreDir({ ...base, dirs: native })).toBe(
      join(home, 'Library', 'Application Support', 'tooly', TRUST_MARKER_DIR),
    )
    expect(trustStoreDir({ ...base, dirs: xdg })).toBe(trustStoreDir('tooly', {}, home))
  })

  test('<PREFIX>_CONVENTION picks the table', () => {
    const home = '/Users/dev'
    const env = { TOOLY_CONVENTION: 'xdg' }
    const xdgPlace = join(home, '.local', 'state', 'tooly', TRUST_MARKER_DIR)
    // macOS, whose default would be Application Support.
    const darwin = () =>
      new TieredDirs(TOOLY.vendor, systemBaseDirs(TOOLY.envVars, { platform: 'darwin', env, home }))
    expect(trustStoreDir({ tool: 'tooly', vendorDirs: TOOLY, dirs: darwin })).toBe(xdgPlace)
    // vendorDirs alone reads the variable from the injected env on the host's
    // own table, which is XDG on Linux and on macOS under xdg.
    if (process.platform !== 'win32') {
      expect(trustStoreDir({ tool: 'tooly', vendorDirs: TOOLY, env, home })).toBe(xdgPlace)
    }
  })

  test('<PREFIX>_ROOT and <PREFIX>_STATE_DIR move the store, as they move every other file', () => {
    const home = abs('/home/dev')
    const [r, s] = [abs('/r'), abs('/s')]
    expect(trustStoreDir({ tool: 'tooly', vendorDirs: TOOLY, env: { TOOLY_ROOT: r }, home })).toBe(
      join(r, 'state', 'tooly', TRUST_MARKER_DIR),
    )
    const env = { TOOLY_ROOT: r, TOOLY_STATE_DIR: s }
    expect(trustStoreDir({ tool: 'tooly', vendorDirs: TOOLY, env, home })).toBe(
      join(s, 'tooly', TRUST_MARKER_DIR),
    )
  })

  test('a tool under a family root: <state home>/<root>/<app>/trusted', () => {
    const s = abs('/s')
    const env = { OSDLC_STATE_DIR: s }
    const opts = { tool: 'osdlc', app: 'pr-update', vendorDirs: OSDLC, env, home: abs('/h') }
    expect(trustStoreDir(opts)).toBe(join(s, 'osdlc', 'pr-update', TRUST_MARKER_DIR))
    const { app: _app, ...family } = opts
    expect(trustStoreDir(family)).toBe(join(s, 'osdlc', TRUST_MARKER_DIR))
  })

  test('dir wins over vendorDirs', () => {
    const opts = { tool: 'osdlc', app: 'a', vendorDirs: OSDLC, env: {}, home: '/h', dir: '/x' }
    expect(trustStore(opts).dir()).toBe('/x')
  })

  test('env or home beside dirs is refused, since dirs alone places the store', () => {
    const dirs = dirsFor(OSDLC, 'linux', {}, '/h')
    const base = { tool: 'osdlc', app: 'a', vendorDirs: OSDLC, dirs }
    expect(() => trustStore({ ...base, env: {} })).toThrow(TypeError)
    expect(() => trustStore({ ...base, home: '/h' })).toThrow(TypeError)
    expect(() => trustStoreDir({ ...base, env: {} })).toThrow(/env is ignored/)
  })

  test("a pinned dirs factory closes over the tool's env, as the README shows", () => {
    const env = { OSDLC_ROOT: '/r', OSDLC_CONVENTION: 'native' }
    const dirs = () =>
      new TieredDirs(
        OSDLC.vendor,
        systemBaseDirs(OSDLC.envVars, {
          env,
          home: '/h',
          platform: 'darwin',
          convention: 'xdg',
          conventionFromEnv: false,
        }),
      )
    const store = trustStore({ tool: 'osdlc', app: 'pr-update', vendorDirs: OSDLC, dirs })
    expect(store.dir()).toBe(join('/r', 'state', 'osdlc', 'pr-update', TRUST_MARKER_DIR))
  })

  test('app and dirs need vendorDirs', () => {
    expect(() => trustStoreDir({ tool: 'osdlc', app: 'a', env: {}, home: '/h' })).toThrow(TypeError)
    const dirs = dirsFor(OSDLC, 'linux', {}, '/h')
    expect(() => trustStore({ tool: 'osdlc', dirs, env: {}, home: '/h' }).dir()).toThrow(TypeError)
  })

  test('an app that is not one path segment is refused', () => {
    expect(() =>
      trustStoreDir({ tool: 'osdlc', app: '../x', vendorDirs: OSDLC, env: {}, home: '/h' }),
    ).toThrow(/app/)
  })
})

describe('app isolation', () => {
  test('a grant through app a is not seen through app b or the family root', async () => {
    const home = await root()
    const repo = join(home, 'repo')
    await mkdir(repo)
    const env = { OSDLC_STATE_DIR: join(home, 'state') }
    const store = (app?: string) =>
      trustStore({ tool: 'osdlc', ...(app ? { app } : {}), vendorDirs: OSDLC, env, home })

    await store('a').trust(repo)
    await store('a').trust(repo, 'just')
    expect(await store('a').isTrusted(repo)).toBe(true)
    for (const other of [store('b'), store()]) {
      expect(await other.isTrusted(repo)).toBe(false)
      expect(await other.isTrusted(repo, 'just')).toBe(false)
      expect(await other.listGrants()).toEqual([])
    }
  })
})

/** A machine with an old pr-update store and the osdlc family's new place for it. */
async function machine() {
  const home = await root()
  const env = { XDG_STATE_HOME: join(home, '.local', 'state') }
  const repos = [join(home, 'one'), join(home, 'two')]
  for (const r of repos) await mkdir(r)
  // The store a release before vendorDirs wrote.
  const legacy = () => trustStore({ tool: 'pr-update', env, home })
  const current = (extra: Partial<TrustStoreOptions> = {}) =>
    trustStore({ tool: 'osdlc', app: 'pr-update', vendorDirs: OSDLC, env, home, ...extra })
  return { home, env, repos, legacy, current }
}

/** Every file under `dir` with its bytes, mode and mtime. */
async function snapshot(dir: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const walk = async (d: string): Promise<void> => {
    for (const name of (await readdir(d)).sort()) {
      const path = join(d, name)
      const s = await stat(path)
      if (s.isDirectory()) {
        out[path] = `dir ${s.mode}`
        await walk(path)
      } else {
        out[path] = `${s.mode} ${s.mtimeMs} ${await readFile(path, 'utf-8')}`
      }
    }
  }
  await walk(dir)
  return out
}

describe('opting in', () => {
  test('a store opened with vendorDirs ignores the old store and leaves it untouched', async () => {
    const { repos, legacy, current } = await machine()
    const [one, two] = repos as [string, string]
    await legacy().trust(one)
    await legacy().trust(two, 'just')
    const before = await snapshot(legacy().dir())

    const store = current()
    expect(store.dir()).not.toBe(legacy().dir())
    expect(await store.isTrusted(one)).toBe(false)
    expect(await store.isTrusted(two, 'just')).toBe(false)
    expect(await store.listGrants()).toEqual([])
    // The person consents again, once, in the new place.
    await store.trust(one)
    expect(await store.isTrusted(one)).toBe(true)
    expect(await store.untrust(one)).toBe(true)
    expect(await snapshot(legacy().dir())).toEqual(before)
    // An older release still finds every grant it knew.
    expect(await legacy().isTrusted(one)).toBe(true)
    expect(await legacy().isTrusted(two, 'just')).toBe(true)
  })

  test('list, listGrants and tighten throw when the store cannot be resolved', async () => {
    const store = trustStore({
      tool: 'tooly',
      vendorDirs: TOOLY,
      env: { TOOLY_ROOT: 'relative' },
      home: '/h',
    })
    await expect(store.list()).rejects.toThrow()
    await expect(store.listGrants()).rejects.toThrow()
    await expect(store.tighten()).rejects.toThrow()
  })
})

describe('listGrants', () => {
  test.skipIf(process.platform === 'win32')(
    'a root whose path ends in whitespace keeps its per-scope grants listed',
    async () => {
      const home = await root()
      const repo = join(home, 'repo ')
      await mkdir(repo)
      const store = trustStore({ tool: 'tooly', env: {}, home })
      await store.trust(repo, 'just')
      expect(await store.isTrusted(repo, 'just')).toBe(true)
      const resolved = await store.resolveRoot(repo)
      expect(resolved.endsWith(' ')).toBe(true)
      expect(await store.listGrants()).toEqual([
        expect.objectContaining({ root: resolved, scope: 'just' }),
      ])
      expect(await store.untrustAll(repo)).toEqual(['just'])
      expect(await store.isTrusted(repo, 'just')).toBe(false)
    },
  )

  test("a per-scope marker filed in another root's folder is not listed", async () => {
    const { repos, legacy } = await machine()
    const [one, two] = repos as [string, string]
    await legacy().trust(one, 'just')
    await legacy().trust(two, 'mise')
    // Move two's marker into one's scope folder: no lookup ever reads it there.
    const [twoGrant] = (await legacy().listGrants()).filter((g) => g.scope === 'mise')
    const oneFolder = dirname((await legacy().listGrants()).find((g) => g.scope === 'just')!.marker)
    const misfiled = join(oneFolder, twoGrant!.marker.split(/[\\/]/).pop()!)
    await rename(twoGrant!.marker, misfiled)
    await rm(dirname(twoGrant!.marker), { recursive: true })

    expect((await legacy().listGrants()).map((g) => g.scope)).toEqual(['just'])
    expect(await legacy().isTrusted(two, 'mise')).toBe(false)
    expect(await legacy().list()).toEqual([])
    // untrustAll for two removes nothing and reports nothing it did not remove.
    expect(await legacy().untrustAll(two)).toEqual([])
    expect(await legacy().isTrusted(one, 'just')).toBe(true)
  })
})
