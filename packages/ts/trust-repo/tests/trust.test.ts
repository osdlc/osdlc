import { afterAll, describe, expect, test } from 'vitest'
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'

import {
  resolveExecGate,
  resolveTrustRoot,
  trustStore,
  trustStoreDir,
  TRUST_MARKER_DIR,
  withheldHint,
} from '../src/index.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })))
})

async function root(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'trust-repo-'))
  roots.push(dir)
  return dir
}

/**
 * A throwaway state home. Every test uses one. A test that reached the real
 * `~` would read the developer's own trust store, and one that wrote would
 * grant trust on their machine.
 */
async function home(): Promise<{ env: Record<string, string | undefined>; home: string }> {
  const dir = await root()
  return { env: { XDG_STATE_HOME: join(dir, '.local', 'state') }, home: dir }
}

describe('trustStoreDir', () => {
  test('puts the store under XDG_STATE_HOME when it is set', () => {
    expect(trustStoreDir('tooly', { XDG_STATE_HOME: '/state' }, '/home/dev')).toBe(
      `/state/tooly/${TRUST_MARKER_DIR}`,
    )
  })

  test('falls back to ~/.local/state on every platform, macOS included', () => {
    expect(trustStoreDir('tooly', {}, '/home/dev')).toBe('/home/dev/.local/state/tooly/trusted')
  })

  test('treats an empty XDG_STATE_HOME as unset', () => {
    // An exported but empty variable is a common shell mistake. Joining onto
    // "" would put the store at /tooly/trusted.
    expect(trustStoreDir('tooly', { XDG_STATE_HOME: '' }, '/home/dev')).toBe(
      '/home/dev/.local/state/tooly/trusted',
    )
  })

  test('ignores a relative XDG_STATE_HOME, as the XDG spec says', () => {
    // Resolved against the cwd, `.state` would put the store inside the
    // repository being judged, where it could ship its own marker.
    for (const value of ['.state', 'state/x', './s']) {
      expect(trustStoreDir('tooly', { XDG_STATE_HOME: value }, '/home/dev')).toBe(
        '/home/dev/.local/state/tooly/trusted',
      )
    }
  })

  test('expands a leading ~ rather than making a literal directory', () => {
    expect(trustStoreDir('tooly', { XDG_STATE_HOME: '~/state' }, '/home/dev')).toBe(
      '/home/dev/state/tooly/trusted',
    )
  })

  test('never consults the real home when one is injected', () => {
    // Every test in this file depends on this: once a home is supplied, no
    // code path falls back to os.homedir().
    const dir = trustStoreDir('tooly', {}, '/injected/home')
    expect(dir.startsWith('/injected/home/')).toBe(true)
  })

  test('scopes the directory by tool name', () => {
    expect(trustStoreDir('tooly', {}, '/home/dev')).not.toBe(
      trustStoreDir('other', {}, '/home/dev'),
    )
  })
})

describe('markerPath', () => {
  test('reports the would-be marker without creating it', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()

    const before = await store.markerPath(repo)
    expect(await store.isTrusted(repo)).toBe(false)

    const { marker } = await store.trust(repo)
    expect(before).toBe(marker)
    expect(await store.markerPath(repo)).toBe(marker)
  })
})

describe('marker naming', () => {
  test('names a marker after the basename and a 16-char hex digest of the resolved root', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()

    const { marker, root: resolved } = await store.trust(repo)
    expect(marker).toBe(join(store.dir(), basename(marker)))
    expect(basename(marker)).toMatch(/^[A-Za-z0-9._-]+-[0-9a-f]{16}$/)
    expect(basename(marker).startsWith(basename(resolved))).toBe(true)
  })
})

describe('trust round trip', () => {
  test('goes untrusted, trusted, untrusted', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()

    expect(await store.isTrusted(repo)).toBe(false)
    await store.trust(repo)
    expect(await store.isTrusted(repo)).toBe(true)
    expect(await store.untrust(repo)).toBe(true)
    expect(await store.isTrusted(repo)).toBe(false)
  })

  test('untrust of an unknown root is a no-op that returns false', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()
    expect(await store.untrust(repo)).toBe(false)
  })

  test('is idempotent and reports when nothing changed', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()

    const first = await store.trust(repo)
    expect(first.alreadyTrusted).toBe(false)

    const second = await store.trust(repo)
    expect(second.alreadyTrusted).toBe(true)
    expect(second.marker).toBe(first.marker)
    expect(await store.list()).toEqual([first.root])
  })

  test("writes the resolved path as the marker's contents", async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()
    const { marker, root: resolved } = await store.trust(repo)
    expect(await readFile(marker, 'utf-8')).toBe(`${resolved}\n`)
  })

  test('an atomic write leaves no .tmp file behind', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()

    const { marker } = await store.trust(repo)
    const names = await readdir(store.dir())
    expect(names).toEqual([basename(marker)])
    expect(names.some((n) => n.endsWith('.tmp'))).toBe(false)
  })

  test('survives concurrent grants for the same root in one process', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()

    const results = await Promise.all([store.trust(repo), store.trust(repo), store.trust(repo)])

    const resolved = await resolveTrustRoot(repo)
    for (const result of results) expect(result.root).toBe(resolved)
    expect(await store.isTrusted(repo)).toBe(true)
    expect(await store.list()).toEqual([resolved])
    expect(await readdir(store.dir())).toEqual([basename(results[0]!.marker)])
  })
})

describe('isTrusted', () => {
  test('an empty or blank marker is not a grant, matching list()', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()
    const { marker } = await store.trust(repo)

    await writeFile(marker, '', 'utf-8')
    expect(await store.isTrusted(repo)).toBe(false)
    expect(await store.list()).toEqual([])

    await writeFile(marker, '  \n', 'utf-8')
    expect(await store.isTrusted(repo)).toBe(false)
    expect(await store.list()).toEqual([])
  })
})

describe('list', () => {
  test('returns exactly the trusted paths, sorted', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const a = await root()
    const b = await root()

    const first = await store.trust(a)
    const second = await store.trust(b)

    expect(await store.list()).toEqual([first.root, second.root].sort())
  })

  test('treats a missing store directory as empty, not as an error', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    expect(await store.list()).toEqual([])
  })

  test('ignores a half-written marker left by a killed process', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    await mkdir(store.dir(), { recursive: true })
    await writeFile(join(store.dir(), 'repo-0123456789abcdef.4242.tmp'), '/half/written\n', 'utf-8')
    expect(await store.list()).toEqual([])
  })
})

describe('resolveRoot', () => {
  test('makes a symlink and its target one trust decision', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()
    const parent = await root()
    const link = join(parent, 'link-to-repo')
    await symlink(repo, link)

    await store.trust(link)
    expect(await store.isTrusted(repo)).toBe(true)
    expect(await store.resolveRoot(link)).toBe(await store.resolveRoot(repo))
    expect(await store.list()).toEqual([await store.resolveRoot(repo)])
  })

  test('resolves symlinked ancestors when the root itself does not exist', async () => {
    const parent = await root()
    const gone = join(parent, 'never-existed')
    expect(await resolveTrustRoot(gone)).toBe(join(await realpath(parent), 'never-existed'))
  })

  test("a deleted repository's marker stays reachable", async () => {
    // The grant was keyed on the resolved path. If deletion changed the key,
    // untrust would report nothing to remove and leave the marker behind.
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const parent = await root()
    const link = join(await root(), 'link-to-parent')
    await symlink(parent, link)
    const repo = join(parent, 'repo')
    await mkdir(repo, { recursive: true })
    const viaLink = join(link, 'repo')

    await store.trust(viaLink)
    await rm(repo, { recursive: true, force: true })

    expect(await store.isTrusted(viaLink)).toBe(true)
    expect(await store.list()).toEqual([join(await realpath(parent), 'repo')])
    expect(await store.untrust(viaLink)).toBe(true)
    expect(await store.list()).toEqual([])
  })
})

describe('two stores for two tools never see each other', () => {
  test('trusting a root in one tool leaves the other untrusted', async () => {
    const { env, home: h } = await home()
    const tooly = trustStore({ tool: 'tooly', env, home: h })
    const other = trustStore({ tool: 'other', env, home: h })
    const repo = await root()

    await tooly.trust(repo)
    expect(await tooly.isTrusted(repo)).toBe(true)
    expect(await other.isTrusted(repo)).toBe(false)
    expect(await other.list()).toEqual([])
    expect(tooly.dir()).not.toBe(other.dir())
  })
})

describe('resolveExecGate', () => {
  test('flag: false wins over everything and does not consult the store', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()
    await store.trust(repo)

    const gate = await resolveExecGate(store, { root: repo, configured: true, flag: false })
    expect(gate.allowExec).toBe(false)
    expect(gate.reason).toBe('configured-off')
  })

  test('flag: true allows the run without recording anything', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()

    const gate = await resolveExecGate(store, { root: repo, configured: false, flag: true })
    expect(gate.allowExec).toBe(true)
    expect(gate.reason).toBe('allowed-by-flag')
    expect(gate.trusted).toBe(false)
    expect(await store.list()).toEqual([])
  })

  test("flag: true still reports the store's real answer", async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()
    await store.trust(repo)

    const gate = await resolveExecGate(store, { root: repo, configured: true, flag: true })
    expect(gate.trusted).toBe(true)
    expect(gate.reason).toBe('allowed-by-flag')
  })

  test('with no flag, exec needs both the configured value and trust', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()

    const off = await resolveExecGate(store, { root: repo, configured: false })
    expect(off.allowExec).toBe(false)
    expect(off.reason).toBe('configured-off')

    const untrusted = await resolveExecGate(store, { root: repo, configured: true })
    expect(untrusted.allowExec).toBe(false)
    expect(untrusted.reason).toBe('untrusted')

    await store.trust(repo)
    const allowed = await resolveExecGate(store, { root: repo, configured: true })
    expect(allowed.allowExec).toBe(true)
    expect(allowed.reason).toBe('allowed')
    expect(allowed.root).toBe(await store.resolveRoot(repo))
  })

  test('trust alone does not turn execution on', async () => {
    const { env, home: h } = await home()
    const store = trustStore({ tool: 'tooly', env, home: h })
    const repo = await root()
    await store.trust(repo)

    const gate = await resolveExecGate(store, { root: repo, configured: false })
    expect(gate.allowExec).toBe(false)
    expect(gate.trusted).toBe(true)
    expect(gate.reason).toBe('configured-off')
  })

  describe('args.trusted — the precomputed-decision hook', () => {
    test('overrides the store when the root has no marker', async () => {
      const { env, home: h } = await home()
      const store = trustStore({ tool: 'tooly', env, home: h })
      const repo = await root()

      const gate = await resolveExecGate(store, { root: repo, configured: true, trusted: true })
      expect(gate.allowExec).toBe(true)
      expect(gate.trusted).toBe(true)
      expect(gate.reason).toBe('allowed')
      // No marker was written. The gate used the caller's decision as given.
      expect(await store.isTrusted(repo)).toBe(false)
    })

    test('overrides a marker that says otherwise', async () => {
      const { env, home: h } = await home()
      const store = trustStore({ tool: 'tooly', env, home: h })
      const repo = await root()
      await store.trust(repo)

      const gate = await resolveExecGate(store, { root: repo, configured: true, trusted: false })
      expect(gate.allowExec).toBe(false)
      expect(gate.trusted).toBe(false)
      expect(gate.reason).toBe('untrusted')
    })

    test('omitted falls back to store.isTrusted as before', async () => {
      const { env, home: h } = await home()
      const store = trustStore({ tool: 'tooly', env, home: h })
      const repo = await root()
      await store.trust(repo)

      const gate = await resolveExecGate(store, { root: repo, configured: true })
      expect(gate.trusted).toBe(true)
      expect(gate.reason).toBe('allowed')
    })

    test('flag: false still short-circuits, ignoring a true trusted override', async () => {
      const { env, home: h } = await home()
      const store = trustStore({ tool: 'tooly', env, home: h })
      const repo = await root()

      const gate = await resolveExecGate(store, {
        root: repo,
        configured: true,
        flag: false,
        trusted: true,
      })
      expect(gate.allowExec).toBe(false)
      expect(gate.trusted).toBe(false)
      expect(gate.reason).toBe('configured-off')
    })
  })
})

describe('withheldHint', () => {
  test('names the tool and defaults verb/flag to trust/--exec', () => {
    expect(withheldHint('tooly')).toBe(
      'this repository is not trusted — run "tooly trust" to trust it, or pass --exec for this run only',
    )
  })

  test('accepts a namespaced verb', () => {
    expect(withheldHint('tooly', { verb: 'repo trust' })).toContain('"tooly repo trust"')
  })

  test('flag: null drops the per-run half — a surface with no such flag offers none', () => {
    expect(withheldHint('tooly', { verb: 'repo trust /repo', flag: null })).toBe(
      'this repository is not trusted — run "tooly repo trust /repo" to trust it',
    )
  })

  test('accepts a different per-run flag', () => {
    const hint = withheldHint('tooly', { verb: 'repo trust', flag: '--trust' })
    expect(hint).toBe(
      'this repository is not trusted — run "tooly repo trust" to trust it, or pass --trust for this run only',
    )
  })
})

describe('trustStore dir override', () => {
  test('opts.dir bypasses the tool+XDG derivation entirely', async () => {
    const dir = await root()
    const store = trustStore({ tool: 'tooly', dir })
    expect(store.dir()).toBe(dir)

    const repo = await root()
    const { root: resolved } = await store.trust(repo)
    expect(await store.list()).toEqual([resolved])
  })
})
