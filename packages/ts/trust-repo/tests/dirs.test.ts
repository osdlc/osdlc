/**
 * Where a store lives when its tool passes `vendorDirs`, and the one-time
 * move of an old store's markers into that place (osdlc/osdlc#1010).
 *
 * Every test injects `env` and `home`, or a `dirs` built from them, so no
 * test reads or writes the developer's real trust store.
 */

import { afterAll, describe, expect, test, vi } from 'vitest'
import {
  chmod,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  symlink,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { envVars, rootedBaseDirs, systemBaseDirs, testRoot, TieredDirs } from '@osdlc/tiered-dirs'

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
        env,
        home: 'C:\\Users\\dev',
      }
      expect(trustStoreDir(opts)).toBe(join(local, 'state', 'tooly', TRUST_MARKER_DIR))
      expect(trustStore(opts).dir()).toBe(trustStoreDir(opts))
    }
  })

  test('macOS: Application Support under native, the old XDG place under xdg', () => {
    const home = '/Users/dev'
    const native = dirsFor(TOOLY, 'darwin', {}, home, 'native')
    const xdg = dirsFor(TOOLY, 'darwin', {}, home, 'xdg')
    const base = { tool: 'tooly', vendorDirs: TOOLY, env: {}, home }
    expect(trustStoreDir({ ...base, dirs: native })).toBe(
      join(home, 'Library', 'Application Support', 'tooly', TRUST_MARKER_DIR),
    )
    expect(trustStoreDir({ ...base, dirs: xdg })).toBe(trustStoreDir('tooly', {}, home))
  })

  test('<PREFIX>_CONVENTION picks the table when vendorDirs alone is passed', () => {
    // The host's own table: on Linux both conventions are XDG; on macOS the
    // variable moves the store out of Application Support.
    const home = '/Users/dev'
    const env = { TOOLY_CONVENTION: 'xdg' }
    expect(trustStoreDir({ tool: 'tooly', vendorDirs: TOOLY, env, home })).toBe(
      join(systemBaseDirs(TOOLY.envVars, { env, home }).state, 'tooly', TRUST_MARKER_DIR),
    )
  })

  test('<PREFIX>_ROOT and <PREFIX>_STATE_DIR move the store, as they move every other file', () => {
    const home = '/home/dev'
    expect(
      trustStoreDir({ tool: 'tooly', vendorDirs: TOOLY, env: { TOOLY_ROOT: '/r' }, home }),
    ).toBe(join('/r', 'state', 'tooly', TRUST_MARKER_DIR))
    const env = { TOOLY_ROOT: '/r', TOOLY_STATE_DIR: '/s' }
    expect(trustStoreDir({ tool: 'tooly', vendorDirs: TOOLY, env, home })).toBe(
      join('/s', 'tooly', TRUST_MARKER_DIR),
    )
  })

  test('a tool under a family root: <state home>/<root>/<app>/trusted', () => {
    const env = { OSDLC_STATE_DIR: '/s' }
    const opts = { tool: 'osdlc', app: 'pr-update', vendorDirs: OSDLC, env, home: '/h' }
    expect(trustStoreDir(opts)).toBe(join('/s', 'osdlc', 'pr-update', TRUST_MARKER_DIR))
    const { app: _app, ...family } = opts
    expect(trustStoreDir(family)).toBe(join('/s', 'osdlc', TRUST_MARKER_DIR))
  })

  test('dir wins over vendorDirs', () => {
    const opts = { tool: 'osdlc', app: 'a', vendorDirs: OSDLC, env: {}, home: '/h', dir: '/x' }
    expect(trustStore(opts).dir()).toBe('/x')
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

/** The record of a store's move, beside the store: `<parent>/.trusted.moved`. */
function record(storeDir: string): Promise<string> {
  return readFile(join(dirname(storeDir), `.${TRUST_MARKER_DIR}.moved`), 'utf-8')
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

describe('the one-time move', () => {
  test('copies every grant, records the move, and leaves the old markers as they were', async () => {
    const { repos, legacy, current } = await machine()
    const [one, two] = repos as [string, string]
    await legacy().trust(one)
    await legacy().trust(two, 'just')
    const before = await snapshot(legacy().dir())

    const store = current()
    expect(store.dir()).not.toBe(legacy().dir())
    expect(await store.isTrusted(one)).toBe(true)
    expect(await store.isTrusted(two, 'just')).toBe(true)
    expect(await store.isTrusted(two)).toBe(false)
    const strip = (gs: { root: string; scope: string }[]) =>
      gs.map(({ root: r, scope }) => ({ root: r, scope }))
    expect(strip(await store.listGrants())).toEqual(strip(await legacy().listGrants()))
    expect(await record(store.dir())).toBe(`${legacy().dir()}\n`)
    expect(await snapshot(legacy().dir())).toEqual(before)
    // No staging folder is left beside the store.
    expect((await readdir(dirname(store.dir()))).sort()).toEqual([
      `.${TRUST_MARKER_DIR}.moved`,
      TRUST_MARKER_DIR,
    ])
  })

  test('a second run is a no-op: later old markers are not copied, and a revoked grant stays revoked', async () => {
    const { repos, legacy, current } = await machine()
    const [one, two] = repos as [string, string]
    await legacy().trust(one)
    expect(await current().isTrusted(one)).toBe(true)

    // An older release keeps writing the old place.
    await legacy().trust(two)
    expect(await current().untrust(one)).toBe(true)

    const again = current()
    expect(await again.isTrusted(one)).toBe(false)
    expect(await again.isTrusted(two)).toBe(false)
    expect(await legacy().isTrusted(one)).toBe(true)
  })

  test('with no old store, a read moves nothing and creates nothing', async () => {
    const { repos, current } = await machine()
    const store = current()
    expect(await store.isTrusted(repos[0]!)).toBe(false)
    expect(await store.list()).toEqual([])
    await expect(stat(store.dir())).rejects.toThrow()
  })

  test('the first grant records the move when the old store was empty, so the old place is never read again', async () => {
    const { repos, legacy, current } = await machine()
    const [one, two] = repos as [string, string]
    await current().trust(one)
    const store = current()
    expect(await record(store.dir())).toBe(`${legacy().dir()}\n`)

    // An older release writes the old place after the new store exists.
    await legacy().trust(two)
    const again = current()
    expect(await again.isTrusted(one)).toBe(true)
    expect(await again.isTrusted(two)).toBe(false)
  })

  test('a new place that already exists, made through dir, gets no old markers', async () => {
    const { home, env, repos, legacy, current } = await machine()
    const [one, two] = repos as [string, string]
    await trustStore({ tool: 'x', dir: current().dir(), env, home }).trust(one)
    await legacy().trust(two)

    const store = current()
    expect(await store.isTrusted(one)).toBe(true)
    expect(await store.isTrusted(two)).toBe(false)
    expect(await record(store.dir())).toBe(`${legacy().dir()}\n`)
  })

  test('a grant revoked through dir at the new place stays revoked when the store reopens', async () => {
    const { home, env, repos, legacy, current } = await machine()
    const [one] = repos as [string]
    await legacy().trust(one)
    const viaDir = trustStore({ tool: 'x', dir: current().dir(), env, home })
    await viaDir.trust(one)
    expect(await viaDir.untrust(one)).toBe(true)

    expect(await current().isTrusted(one)).toBe(false)
    expect(await current().isTrusted(one)).toBe(false)
  })

  test('a store folder left with no record (a crash after mkdir) gets no old markers', async () => {
    const { repos, legacy, current } = await machine()
    const [one] = repos as [string]
    await legacy().trust(one)
    await mkdir(current().dir(), { recursive: true })

    expect(await current().isTrusted(one)).toBe(false)
    expect(await record(current().dir())).toBe(`${legacy().dir()}\n`)
  })

  test('a new store this package makes holds its record from the moment it exists', async () => {
    const { repos, legacy, current } = await machine()
    const store = current()
    await store.trust(repos[0]!, 'just')
    // Inside, published with the folder, and beside it.
    expect(await readFile(join(store.dir(), '.moved'), 'utf-8')).toBe(`${legacy().dir()}\n`)
    expect(await record(store.dir())).toBe(`${legacy().dir()}\n`)
    expect(await store.isTrusted(repos[0]!, 'just')).toBe(true)
    expect(await store.listGrants()).toHaveLength(1)
  })

  test('deleting the store folder forgets every grant; the old place is not read again', async () => {
    const { repos, legacy, current } = await machine()
    const [one] = repos as [string]
    await legacy().trust(one)
    expect(await current().isTrusted(one)).toBe(true)
    await rm(current().dir(), { recursive: true, force: true })
    expect(await current().isTrusted(one)).toBe(false)
    expect(await current().list()).toEqual([])
  })

  test.skipIf(process.platform === 'win32')(
    'an old store others could write, or a symlink, is not copied',
    async () => {
      for (const plant of ['group-writable', 'world-writable', 'symlink'] as const) {
        const { home, repos, legacy, current } = await machine()
        const [one] = repos as [string]
        await legacy().trust(one)
        if (plant === 'symlink') {
          const real = join(home, 'elsewhere')
          await rename(legacy().dir(), real)
          await symlink(real, legacy().dir())
        } else {
          await chmod(legacy().dir(), plant === 'group-writable' ? 0o720 : 0o702)
        }
        expect(await current().isTrusted(one)).toBe(false)
        expect(await record(current().dir())).toBe(`${legacy().dir()}\n`)
        // Recorded: making the old store safe later does not start the move.
        if (plant !== 'symlink') await chmod(legacy().dir(), 0o700)
        expect(await current().isTrusted(one)).toBe(false)
      }
    },
  )

  test('a convention the environment picks copies nothing, so a revoked grant stays revoked', async () => {
    const { env, home, repos, legacy } = await machine()
    const [one] = repos as [string]
    await legacy().trust(one)
    const at = (extra: Record<string, string>) =>
      trustStore({
        tool: 'osdlc',
        app: 'pr-update',
        vendorDirs: OSDLC,
        env: { ...env, ...extra },
        home,
      })
    expect(await at({}).isTrusted(one)).toBe(true)
    expect(await at({}).untrust(one)).toBe(true)
    // Switching the convention picks another new place (on macOS); it must
    // not be filled from the untouched old store.
    for (const convention of ['xdg', 'native']) {
      expect(await at({ OSDLC_CONVENTION: convention }).isTrusted(one)).toBe(false)
    }
  })

  test('a misfiled per-scope marker is neither copied nor listed', async () => {
    const { repos, legacy, current } = await machine()
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
    const store = current()
    expect(await store.isTrusted(two, 'mise')).toBe(false)
    expect((await store.listGrants()).map((g) => g.scope)).toEqual(['just'])
    // untrustAll for two removes nothing it did not list.
    expect(await legacy().untrustAll(two)).toEqual([])
  })

  test('two processes moving at once leave one complete store', async () => {
    const { repos, legacy, current } = await machine()
    const [one, two] = repos as [string, string]
    await legacy().trust(one)
    await legacy().trust(two, 'just')

    const results = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        i % 2 === 0 ? current().isTrusted(one) : current().isTrusted(two, 'just'),
      ),
    )
    expect(results).toEqual([true, true, true, true, true, true])
    const store = current()
    expect((await store.listGrants()).map((g) => g.scope)).toEqual(['*', 'just'])
    expect((await readdir(dirname(store.dir()))).sort()).toEqual([
      `.${TRUST_MARKER_DIR}.moved`,
      TRUST_MARKER_DIR,
    ])
  })

  test("pr-update's shape (a dirs pinned to xdg, the run's env) moves the old pr-update markers once", async () => {
    const { home, env, repos, legacy } = await machine()
    await legacy().trust(repos[0]!)
    const runEnv = { ...env, HOME: home, USERPROFILE: home }
    const dirs = () =>
      new TieredDirs(
        'osdlc',
        systemBaseDirs(OSDLC.envVars, { env: runEnv, convention: 'xdg', conventionFromEnv: false }),
      )
    const store = trustStore({
      tool: 'osdlc',
      app: 'pr-update',
      vendorDirs: OSDLC,
      dirs,
      env: runEnv,
    })
    expect(store.dir()).not.toBe(legacy().dir())
    expect(await store.isTrusted(repos[0]!)).toBe(true)
    expect(await record(store.dir())).toBe(`${legacy().dir()}\n`)
  })

  /** pr-update's store for one run: a dirs pinned to xdg, built from the run's env. */
  const prUpdateRun = (home: string, env: Record<string, string>) => {
    const runEnv = { ...env, HOME: home, USERPROFILE: home }
    const dirs = () =>
      new TieredDirs(
        'osdlc',
        systemBaseDirs(OSDLC.envVars, { env: runEnv, convention: 'xdg', conventionFromEnv: false }),
      )
    return trustStore({ tool: 'osdlc', app: 'pr-update', vendorDirs: OSDLC, dirs, env: runEnv })
  }

  test.each([
    ['OSDLC_CONVENTION', () => 'native'],
    ['OSDLC_STATE_DIR', (home: string) => join(home, '.local', 'state')],
    ['OSDLC_ROOT', (home: string) => join(home, '.local')],
  ] as const)(
    'while %s is set the move does not run, even in the unmoved folder, and the store is recorded',
    async (name, value) => {
      const { home, env, repos, legacy } = await machine()
      const [one, two] = repos as [string, string]
      await legacy().trust(one)
      const run1 = prUpdateRun(home, { ...env, [name]: value(home) })
      expect(await run1.isTrusted(one)).toBe(false)
      // A grant written and revoked here records the store.
      await run1.trust(two)
      expect(await run1.untrust(two)).toBe(true)
      expect(await record(run1.dir())).toBe('\n')

      // A later run in the same folder never merges the old store in.
      const again = prUpdateRun(home, { ...env, [name]: value(home) })
      expect(await again.isTrusted(one)).toBe(false)
      expect(await again.isTrusted(two)).toBe(false)
      const unmoved = prUpdateRun(home, env)
      if (unmoved.dir() === run1.dir()) {
        expect(await unmoved.isTrusted(one)).toBe(false)
      } else {
        // A place that never had a revoke moves once, the first time no
        // variable is set.
        expect(await unmoved.isTrusted(one)).toBe(true)
        expect(await unmoved.untrust(one)).toBe(true)
        expect(await prUpdateRun(home, env).isTrusted(one)).toBe(false)
      }
      expect(await legacy().isTrusted(one)).toBe(true)
    },
  )

  test("a variable that points a pinned store at the other convention's place copies nothing there", async () => {
    // Pinned to xdg, OSDLC_STATE_DIR names the native place. Inferring "not
    // moved" from a match under either convention filled both places.
    const { home, env, repos, legacy } = await machine()
    const [one] = repos as [string]
    await legacy().trust(one)
    const native = join(home, 'Library', 'Application Support')
    const run1 = prUpdateRun(home, { ...env, OSDLC_STATE_DIR: native })
    expect(run1.dir().startsWith(native)).toBe(true)
    expect(await run1.isTrusted(one)).toBe(false)
    expect(await run1.untrust(one)).toBe(false)

    // The xdg place moves once and its own revoke holds.
    const run2 = prUpdateRun(home, env)
    expect(await run2.isTrusted(one)).toBe(true)
    expect(await run2.untrust(one)).toBe(true)
    expect(await prUpdateRun(home, env).isTrusted(one)).toBe(false)
    expect(await prUpdateRun(home, { ...env, OSDLC_STATE_DIR: native }).isTrusted(one)).toBe(false)
  })

  test('an unpinned dirs factory: OSDLC_CONVENTION stops the move, and a revoke in either place holds', async () => {
    const { home, env, repos, legacy } = await machine()
    const [one] = repos as [string]
    await legacy().trust(one)
    const run = (extra: Record<string, string>) => {
      const runEnv = { ...env, HOME: home, USERPROFILE: home, ...extra }
      const dirs = () => new TieredDirs('osdlc', systemBaseDirs(OSDLC.envVars, { env: runEnv }))
      return trustStore({ tool: 'osdlc', app: 'pr-update', vendorDirs: OSDLC, dirs, env: runEnv })
    }
    for (const convention of ['xdg', 'native']) {
      const s1 = run({ OSDLC_CONVENTION: convention })
      expect(await s1.isTrusted(one)).toBe(false)
      await s1.trust(one)
      expect(await s1.untrust(one)).toBe(true)
    }
    // With no variable: the default convention's place, one of the two
    // above, recorded and revoked.
    expect(await run({}).isTrusted(one)).toBe(false)
    for (const convention of ['xdg', 'native']) {
      expect(await run({ OSDLC_CONVENTION: convention }).isTrusted(one)).toBe(false)
    }
  })

  test('a store <PREFIX>_STATE_DIR really moves gets no old markers; the unmoved place still moves once', async () => {
    const { home, env, repos, legacy } = await machine()
    const [one] = repos as [string]
    await legacy().trust(one)
    const scratch = prUpdateRun(home, { ...env, OSDLC_STATE_DIR: join(home, 'scratch') })
    expect(scratch.dir().startsWith(join(home, 'scratch'))).toBe(true)
    expect(await scratch.isTrusted(one)).toBe(false)
    await scratch.trust(repos[1]!)
    expect(await record(scratch.dir())).toBe('\n')
    expect(await prUpdateRun(home, env).isTrusted(one)).toBe(true)
  })

  test('a dirs factory with neither env nor home has no old place', async () => {
    // Were the real environment read, the old place would be this stand-in.
    const { env, home, repos, legacy } = await machine()
    await legacy().trust(repos[0]!)
    vi.stubEnv('XDG_STATE_HOME', env.XDG_STATE_HOME)
    try {
      const dirs = () => new TieredDirs('osdlc', rootedBaseDirs(join(home, 'rooted')))
      const store = trustStore({ tool: 'osdlc', app: 'pr-update', vendorDirs: OSDLC, dirs })
      expect(await store.isTrusted(repos[0]!)).toBe(false)
      await expect(stat(store.dir())).rejects.toThrow()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test('the test root is recognised through a symlinked temp dir', async () => {
    // On macOS the temp dir is /var/..., which resolves to /private/var/....
    const { env, home, repos, legacy } = await machine()
    await legacy().trust(repos[0]!)
    const scratch = testRoot()
    expect(scratch).toBeDefined()
    await mkdir(scratch!, { recursive: true })
    const tree = join(await realpath(scratch!), `trust-repo-real-${process.pid}`)
    roots.push(tree)
    const dirs = () => new TieredDirs('osdlc', rootedBaseDirs(tree))
    const store = trustStore({
      tool: 'osdlc',
      app: 'pr-update',
      vendorDirs: OSDLC,
      dirs,
      env,
      home,
    })
    expect(await store.isTrusted(repos[0]!)).toBe(false)
  })

  test("an injected env without home moves from that env's HOME, never the real one", async () => {
    const { home, env, repos, legacy } = await machine()
    await legacy().trust(repos[0]!)
    const store = trustStore({
      tool: 'osdlc',
      app: 'pr-update',
      vendorDirs: OSDLC,
      env: { ...env, HOME: home, USERPROFILE: home },
    })
    expect(store.dir().startsWith(home)).toBe(true)
    expect(await store.isTrusted(repos[0]!)).toBe(true)
    // With no HOME in the env there is no old place, and nothing is read.
    const homeless = trustStore({
      tool: 'osdlc',
      app: 'pr-update',
      vendorDirs: OSDLC,
      dirs: () => new TieredDirs('osdlc', rootedBaseDirs(join(home, 'rooted'))),
      env: {},
    })
    expect(await homeless.isTrusted(repos[0]!)).toBe(false)
  })

  test('legacyDir names another old store, and null turns the move off', async () => {
    const { home, env, repos, current } = await machine()
    const other = join(home, 'old-trust')
    await trustStore({ tool: 'x', dir: other, env, home }).trust(repos[0]!)
    expect(await current({ legacyDir: null }).isTrusted(repos[0]!)).toBe(false)
    expect(await current({ legacyDir: other }).isTrusted(repos[0]!)).toBe(true)
  })

  test('a store moved by <PREFIX>_ROOT or <PREFIX>_STATE_DIR starts empty', async () => {
    const { home, env, repos, legacy } = await machine()
    await legacy().trust(repos[0]!)
    for (const moved of [{ OSDLC_ROOT: join(home, 'r') }, { OSDLC_STATE_DIR: join(home, 's') }]) {
      const store = trustStore({
        tool: 'osdlc',
        app: 'pr-update',
        vendorDirs: OSDLC,
        env: { ...env, ...moved },
        home,
      })
      expect(await store.isTrusted(repos[0]!)).toBe(false)
    }
  })

  test("a store under tiered-dirs' test root is not filled from the old place", async () => {
    // A tool built from the real environment in a test runner gets the
    // per-process test root, while its old place is the developer's real
    // store. Here both are stand-ins: a rooted tree under the test root, and
    // a temp old store.
    const { env, home, repos, legacy } = await machine()
    await legacy().trust(repos[0]!)
    const scratch = testRoot()
    expect(scratch).toBeDefined()
    const tree = join(scratch!, `trust-repo-${process.pid}`)
    roots.push(tree)
    const dirs = () => new TieredDirs('osdlc', rootedBaseDirs(tree))
    const store = trustStore({
      tool: 'osdlc',
      app: 'pr-update',
      vendorDirs: OSDLC,
      dirs,
      env,
      home,
    })
    expect(await store.isTrusted(repos[0]!)).toBe(false)
    await expect(stat(store.dir())).rejects.toThrow()
  })
})
