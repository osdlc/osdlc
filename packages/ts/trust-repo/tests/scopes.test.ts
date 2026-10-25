/**
 * The store's per-scope grants, the read of a store written before scopes
 * existed, and the file modes of the store.
 */

import { afterEach, describe, expect, test } from 'vitest'
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { createHash } from 'node:crypto'

import { resolveExecGate, trustStore, WHOLE_REPO_SCOPE } from '../src/index.ts'

const dirs: string[] = []
async function tmp(): Promise<string> {
  const d = await realpath(await mkdtemp(join(tmpdir(), 'trust-repo-scopes-')))
  dirs.push(d)
  return d
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

async function setup() {
  const base = await tmp()
  const repo = join(base, 'repo')
  await mkdir(repo)
  const store = trustStore({ tool: 'tooly', env: {}, home: base })
  return { base, repo, store }
}

const mode = async (path: string): Promise<number> => (await stat(path)).mode & 0o777
const posixOnly = process.platform === 'win32' ? test.skip : test

describe('per-scope grants', () => {
  test('a scope grant trusts that scope only', async () => {
    const { repo, store } = await setup()
    const result = await store.trust(repo, 'just')
    expect(result).toMatchObject({ scope: 'just', alreadyTrusted: false })
    expect(await store.isTrusted(repo, 'just')).toBe(true)
    expect(await store.isTrusted(repo, 'mise')).toBe(false)
    expect(await store.isTrusted(repo)).toBe(false)
    expect((await store.trust(repo, 'just')).alreadyTrusted).toBe(true)
  })

  test('a whole-repository grant trusts every scope, but is not a scope grant', async () => {
    const { repo, store } = await setup()
    await store.trust(repo)
    expect(await store.isTrusted(repo, 'mise')).toBe(true)
    expect((await store.trust(repo, 'mise')).alreadyTrusted).toBe(false)
    expect(await store.untrust(repo)).toBe(true)
    expect(await store.isTrusted(repo, 'mise')).toBe(true)
    expect(await store.isTrusted(repo, 'just')).toBe(false)
  })

  test('list keeps whole-repository grants; listGrants shows every scope', async () => {
    const { base, repo, store } = await setup()
    const other = join(base, 'other')
    await mkdir(other)
    await store.trust(repo, 'mise')
    await store.trust(repo)
    await store.trust(repo, 'just')
    await store.trust(other, 'mise')
    expect(await store.list()).toEqual([repo])
    const grants = await store.listGrants()
    expect(grants.map((g) => [g.root, g.scope])).toEqual([
      [other, 'mise'],
      [repo, '*'],
      [repo, 'just'],
      [repo, 'mise'],
    ])
    for (const g of grants) expect(g.marker).toBe(await store.markerPath(g.root, g.scope))
  })

  test('untrust removes one grant; untrustAll removes every grant of a root', async () => {
    const { base, repo, store } = await setup()
    await store.trust(repo)
    await store.trust(repo, 'just')
    await store.trust(repo, 'mise')
    expect(await store.untrust(repo, 'just')).toBe(true)
    expect(await store.untrust(repo, 'just')).toBe(false)
    expect((await store.untrustAll(repo)).sort()).toEqual(['*', 'mise'])
    expect(await store.listGrants()).toEqual([])
    expect(await store.untrustAll(join(base, 'never'))).toEqual([])
    // The root's scope folder goes with its last grant.
    expect(await readdir(store.dir())).toEqual([])
  })

  test('a scope is opaque: any printable string, kept apart by its hash', async () => {
    const { repo, store } = await setup()
    await store.trust(repo, 'npm:scripts')
    await store.trust(repo, 'npm-scripts')
    expect(await store.isTrusted(repo, 'npm:scripts')).toBe(true)
    expect((await store.listGrants()).map((g) => g.scope)).toEqual(['npm-scripts', 'npm:scripts'])
  })

  test('an empty, oversized or control-character scope is a TypeError', async () => {
    const { repo, store } = await setup()
    for (const bad of ['', 'a\nb', 'x\u0000', 'z'.repeat(201)]) {
      await expect(store.trust(repo, bad)).rejects.toThrow(TypeError)
      await expect(store.isTrusted(repo, bad)).rejects.toThrow(TypeError)
      await expect(store.untrust(repo, bad)).rejects.toThrow(TypeError)
      await expect(store.markerPath(repo, bad)).rejects.toThrow(TypeError)
    }
  })

  test('the gate asks the store about every scope', async () => {
    const { repo, store } = await setup()
    await store.trust(repo, 'just')
    expect(
      await resolveExecGate(store, { root: repo, configured: true, scopes: ['just', 'mise'] }),
    ).toMatchObject({ allowExec: false, reason: 'untrusted', missing: ['mise'] })
    expect(
      await resolveExecGate(store, { root: repo, configured: true, scopes: ['just'] }),
    ).toMatchObject({ allowExec: true, reason: 'allowed', missing: [], scopes: ['just'] })
    expect(
      await resolveExecGate(store, {
        root: repo,
        configured: true,
        trusted: (s) => s === 'mise',
        scopes: ['mise'],
      }),
    ).toMatchObject({ allowExec: true })
    await expect(
      resolveExecGate(store, { root: repo, configured: true, scopes: [] }),
    ).rejects.toThrow(TypeError)
  })
})

describe('a store written before scopes existed', () => {
  test('its whole-repository markers read as they are, with no migration', async () => {
    const { repo, store } = await setup()
    // The marker an older release wrote: `<basename>-<sha16>`, holding the root.
    const digest = createHash('sha256').update(repo).digest('hex').slice(0, 16)
    const marker = join(store.dir(), `${basename(repo)}-${digest}`)
    await mkdir(dirname(marker), { recursive: true })
    await writeFile(marker, `${repo}\n`)
    expect(await store.markerPath(repo)).toBe(marker)
    expect(await store.markerPath(repo, WHOLE_REPO_SCOPE)).toBe(marker)
    expect(await store.isTrusted(repo)).toBe(true)
    expect(await store.isTrusted(repo, 'mise')).toBe(true)
    expect(await store.listGrants()).toEqual([{ root: repo, scope: '*', marker }])
    expect((await store.trust(repo)).alreadyTrusted).toBe(true)
    expect(await readFile(marker, 'utf-8')).toBe(`${repo}\n`)
  })
})

describe('file modes', () => {
  posixOnly('a new store is 0700 and its markers 0600', async () => {
    const { repo, store } = await setup()
    await store.trust(repo)
    await store.trust(repo, 'mise')
    expect(await mode(store.dir())).toBe(0o700)
    expect(await mode(await store.markerPath(repo))).toBe(0o600)
    const scoped = await store.markerPath(repo, 'mise')
    expect(await mode(dirname(scoped))).toBe(0o700)
    expect(await mode(scoped)).toBe(0o600)
  })

  posixOnly('trust tightens a store an older release left readable', async () => {
    const { base, repo, store } = await setup()
    await store.trust(repo)
    const marker = await store.markerPath(repo)
    await chmod(store.dir(), 0o755)
    await chmod(marker, 0o644)
    const other = join(base, 'other')
    await mkdir(other)
    await store.trust(other)
    expect(await mode(store.dir())).toBe(0o700)
    expect(await mode(marker)).toBe(0o600)
  })

  posixOnly('tighten reports what it changed, and nothing the second time', async () => {
    const { repo, store } = await setup()
    await store.trust(repo, 'mise')
    const scoped = await store.markerPath(repo, 'mise')
    await chmod(scoped, 0o640)
    await chmod(dirname(scoped), 0o750)
    expect((await store.tighten()).sort()).toEqual([dirname(scoped), scoped].sort())
    expect(await store.tighten()).toEqual([])
  })

  test('tighten on a store that was never written is a no-op', async () => {
    const { store } = await setup()
    expect(await store.tighten()).toEqual([])
  })
})
