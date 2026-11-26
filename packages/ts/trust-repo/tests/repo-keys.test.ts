/**
 * Grants keyed on a repository, `{ repo: 'host/owner/name' }`: the key's
 * form, its scopes, and that no path ever shares a grant with one.
 */

import { afterEach, describe, expect, test } from 'vitest'
import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  normalizeTrustPath,
  parseTrustRepo,
  policyDecision,
  policyExecGate,
  resolveExecGate,
  trustDecision,
  trustStore,
  type TrustKey,
} from '../src/index.ts'

const dirs: string[] = []
async function tmp(): Promise<string> {
  const d = await realpath(await mkdtemp(join(tmpdir(), 'trust-repo-keys-')))
  dirs.push(d)
  return d
}
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((d) => rm(d, { recursive: true, force: true })))
})

async function setup() {
  const base = await tmp()
  const store = trustStore({ tool: 'tooly', env: {}, home: base })
  return { base, store }
}

const API = { repo: 'github.com/acme/api' }

describe('parseTrustRepo', () => {
  test('trims and lower-cases', () => {
    expect(parseTrustRepo('  GitHub.com/Acme/API ')).toBe('github.com/acme/api')
    expect(parseTrustRepo('gitlab.example.co.uk/a-b/c.d_e')).toBe('gitlab.example.co.uk/a-b/c.d_e')
    expect(parseTrustRepo('localhost/acme/api')).toBe('localhost/acme/api')
  })

  test.each([
    ['', 'three parts'],
    ['github.com/acme', 'three parts'],
    ['github.com/acme/api/extra', 'three parts'],
    ['github.com//api', 'empty'],
    ['github.com/acme/', 'empty'],
    ['/acme/api', 'empty'],
    ['/srv/acme/api', 'three parts'],
    ['github.com/./api', '. or ..'],
    ['github.com/acme/..', '. or ..'],
    ['github.com/ac me/api', 'space'],
    ['github.com/acme/a\tpi', 'space'],
    ['github.com\\acme\\api', 'three parts'],
    ['github.com/acme\\x/api', 'backslash'],
    ['github.com/acme/a\u0000pi', 'control'],
    ['github.com/acme/a\u007fpi', 'control'],
    ['c:/acme/api', 'not a host name'],
    ['github.com:443/acme/api', 'not a host name'],
    ['-github.com/acme/api', 'not a host name'],
    ['github..com/acme/api', 'not a host name'],
    ['gith_ub.com/acme/api', 'not a host name'],
    ['bücher.de/acme/api', 'not a host name'],
    [`github.com/acme/${'x'.repeat(201)}`, 'at most 200'],
    ['github.com/acme/api.git', 'pass the name without .git'],
    ['github.com/acme/API.GIT', 'pass the name without .git'],
    ['github.com/acme/.git', 'pass the name without .git'],
  ])('refuses %j', (input, why) => {
    expect(() => parseTrustRepo(input)).toThrow(TypeError)
    expect(() => parseTrustRepo(input)).toThrow(why)
  })

  test('refuses a value that is not a string', () => {
    expect(() => parseTrustRepo(42 as unknown as string)).toThrow(TypeError)
  })

  test('a store method refuses a bad key the same way', async () => {
    const { store } = await setup()
    await expect(store.trust({ repo: 'github.com/acme' })).rejects.toThrow(TypeError)
    await expect(store.isTrusted({ repo: '/srv/acme/api' })).rejects.toThrow(TypeError)
    await expect(store.markerPath({ repo: 'c:/acme/api' })).rejects.toThrow(TypeError)
  })
})

describe('repository grants', () => {
  test('a grant is found whatever the case it is asked in', async () => {
    const { store } = await setup()
    const result = await store.trust({ repo: 'GitHub.com/Acme/API' })
    expect(result).toMatchObject({
      root: 'github.com/acme/api',
      kind: 'repo',
      scope: '*',
      alreadyTrusted: false,
    })
    expect(await store.isTrusted(API)).toBe(true)
    expect(await store.isTrusted({ repo: 'GITHUB.COM/ACME/API' })).toBe(true)
    expect((await store.trust(API)).alreadyTrusted).toBe(true)
    expect(await store.resolveRoot({ repo: ' GitHub.com/Acme/API ' })).toEqual(API)
    expect(await store.isTrusted({ repo: 'github.com/acme/web' })).toBe(false)
    expect(await store.isTrusted({ repo: 'gitlab.com/acme/api' })).toBe(false)
  })

  test('a resolved key is passed back in its own kind', async () => {
    const { store } = await setup()
    await store.trust(API, 'just')
    const resolved = await store.resolveRoot({ repo: 'GitHub.com/Acme/API' })
    expect(resolved).toEqual({ repo: 'github.com/acme/api' })
    expect(await store.isTrusted(resolved, 'just')).toBe(true)
    expect(await store.untrust(resolved, 'just')).toBe(true)
    expect(await store.isTrusted(API, 'just')).toBe(false)
  })

  test('the marker follows the path rule, with the key in place of the root', async () => {
    const { store } = await setup()
    const { marker } = await store.trust(API)
    expect(marker).toBe(await store.markerPath(API))
    expect(marker.startsWith(join(store.dir(), 'api-'))).toBe(true)
    expect(await readFile(marker, 'utf-8')).toBe('github.com/acme/api\n')
  })

  test('scopes work as they do for a root', async () => {
    const { store } = await setup()
    await store.trust(API, 'just')
    expect(await store.isTrusted(API, 'just')).toBe(true)
    expect(await store.isTrusted(API, 'mise')).toBe(false)
    expect(await store.isTrusted(API)).toBe(false)
    await expect(store.trust(API, '*')).rejects.toThrow(TypeError)
    expect(await store.markerPath(API, 'just')).toMatch(/\.scopes[/\\]just-[0-9a-f]{16}$/)

    await store.trust(API)
    expect(await store.isTrusted(API, 'mise')).toBe(true)
    expect(await store.untrust(API)).toBe(true)
    expect(await store.isTrusted(API, 'just')).toBe(true)
    expect(await store.untrust(API, 'just')).toBe(true)
    expect(await store.untrust(API, 'just')).toBe(false)
    expect(await readdir(store.dir())).toEqual([])
  })

  test('untrustAll removes every grant of the key', async () => {
    const { store } = await setup()
    await store.trust(API)
    await store.trust(API, 'mise')
    await store.trust(API, 'just')
    expect(await store.untrustAll({ repo: 'GitHub.com/acme/api' })).toEqual(['*', 'just', 'mise'])
    expect(await store.listGrants()).toEqual([])
  })
})

describe('a path never shares a grant with a repository', () => {
  /** Paths that look like `github.com/acme/api`, relative and absolute. */
  async function lookalikes(base: string): Promise<string[]> {
    const nested = join(base, 'github.com', 'acme', 'api')
    await mkdir(nested, { recursive: true })
    return [
      'github.com/acme/api',
      'GitHub.com/Acme/API',
      './github.com/acme/api',
      nested,
      join(base, 'deleted', 'github.com', 'acme', 'api'),
      '/github.com/acme/api',
    ]
  }

  test('a repository grant matches no path', async () => {
    const { base, store } = await setup()
    await store.trust(API)
    await store.trust(API, 'just')
    for (const path of await lookalikes(base)) {
      expect(await store.isTrusted(path), path).toBe(false)
      expect(await store.isTrusted(path, 'just'), path).toBe(false)
      expect(await store.markerPath(path)).not.toBe(await store.markerPath(API))
      expect(await store.untrust(path), path).toBe(false)
      expect(await store.untrustAll(path), path).toEqual([])
    }
    expect(await store.isTrusted(API, 'just')).toBe(true)
  })

  test('a path grant matches no repository', async () => {
    const { base, store } = await setup()
    const paths = await lookalikes(base)
    for (const path of paths) await store.trust(path, 'just')
    for (const path of paths) await store.trust(path)
    expect(await store.isTrusted(API)).toBe(false)
    expect(await store.isTrusted(API, 'just')).toBe(false)
    expect(await store.untrust(API)).toBe(false)
    expect(await store.untrustAll(API)).toEqual([])
    const grants = await store.listGrants()
    expect(grants.length).toBeGreaterThan(0)
    expect(grants.every((g) => g.kind === 'path' && g.root !== API.repo)).toBe(true)
  })

  test('on Windows a drive path is never a repository key', () => {
    // The form a Windows root is stored in: `/` separators and a lower-case drive letter.
    const root = normalizeTrustPath('C:\\github.com\\acme', 'win32')
    expect(root).toBe('c:/github.com/acme')
    expect(() => parseTrustRepo(root)).toThrow(TypeError)
    expect(() => parseTrustRepo('c:/acme/api')).toThrow(TypeError)
  })
})

describe('list and listGrants', () => {
  test('list both kinds, roots first, and tell them apart', async () => {
    const { base, store } = await setup()
    const repo = join(base, 'zz-repo')
    await mkdir(repo)
    const key = normalizeTrustPath(repo)
    await store.trust({ repo: 'gitlab.com/acme/web' })
    await store.trust(API, 'mise')
    await store.trust(API)
    await store.trust(repo)
    await store.trust(repo, 'just')
    expect(await store.list()).toEqual([key, 'github.com/acme/api', 'gitlab.com/acme/web'])
    const grants = await store.listGrants()
    expect(grants.map(({ root, kind, scope }) => ({ root, kind, scope }))).toEqual([
      { root: key, kind: 'path', scope: '*' },
      { root: key, kind: 'path', scope: 'just' },
      { root: 'github.com/acme/api', kind: 'repo', scope: '*' },
      { root: 'github.com/acme/api', kind: 'repo', scope: 'mise' },
      { root: 'gitlab.com/acme/web', kind: 'repo', scope: '*' },
    ])
  })

  test('a root sorts before a repository whose key sorts first', async () => {
    const { store } = await setup()
    // A Windows root, written as a release on Windows writes it: `z:/w` sorts
    // after `a.com/x/y` by code unit, so only the kind puts it first.
    const digest = createHash('sha256').update('z:/w').digest('hex').slice(0, 16)
    await mkdir(store.dir(), { recursive: true })
    await writeFile(join(store.dir(), `w-${digest}`), 'z:/w\n')
    await store.trust({ repo: 'a.com/x/y' })
    expect(await store.list()).toEqual(['z:/w', 'a.com/x/y'])
    expect((await store.listGrants()).map((g) => g.kind)).toEqual(['path', 'repo'])
  })
})

describe('the gate and the policy', () => {
  test('resolveExecGate asks about the repository, not a path', async () => {
    const { store } = await setup()
    const ask = (root: TrustKey) =>
      resolveExecGate(store, { root, configured: true, scopes: ['just'] })
    expect(await ask(API)).toMatchObject({ allowExec: false, missing: ['just'] })
    await store.trust(API, 'just')
    expect(await ask({ repo: 'GitHub.com/Acme/API' })).toMatchObject({
      allowExec: true,
      reason: 'allowed',
      root: 'github.com/acme/api',
    })
    // The same text as a plain string is a path, which has no grant.
    expect(await ask('github.com/acme/api')).toMatchObject({ allowExec: false })
  })

  test('owners match the key; ownerOf is never called', async () => {
    let lookups = 0
    const ownerOf = (): string => {
      lookups += 1
      return 'github.com/someone-else'
    }
    const policy = { paths: [], owners: ['acme'] }
    expect(await policyDecision(API, policy, { ownerOf })).toEqual({
      trusted: true,
      by: 'owner',
      rule: 'acme',
      scope: '*',
    })
    expect(await policyDecision({ repo: 'gitlab.com/acme/api' }, policy, { ownerOf })).toEqual({
      trusted: false,
      by: null,
    })
    expect(
      await policyDecision(
        { repo: 'gitlab.com/acme/api' },
        { paths: [], owners: ['GitLab.com/Acme'] },
      ),
    ).toMatchObject({ trusted: true, by: 'owner' })
    expect(lookups).toBe(0)
  })

  test('paths never match a repository key, not even **', async () => {
    const policy = {
      paths: ['**', '*/*/*', 'github.com/acme/api', 'github.com/**'],
      owners: [],
      scopes: { just: { paths: ['**'], owners: [] } },
    }
    expect(await policyDecision(API, policy)).toEqual({ trusted: false, by: null })
    expect(await policyDecision(API, policy, { scope: 'just' })).toEqual({
      trusted: false,
      by: null,
    })
  })

  test('trustDecision and policyExecGate take the key', async () => {
    const { store } = await setup()
    const policy = { paths: [], owners: [], scopes: { just: { paths: [], owners: ['acme'] } } }
    expect(await trustDecision(store, API, policy)).toEqual({ trusted: false, by: null })
    await store.trust(API, 'mise')
    expect(await trustDecision(store, API, policy, { scope: 'mise' })).toEqual({
      trusted: true,
      by: 'marker',
      scope: 'mise',
    })
    const gate = await policyExecGate(store, policy, {
      root: API,
      configured: true,
      scopes: ['mise', 'just'],
    })
    expect(gate).toMatchObject({
      allowExec: true,
      root: 'github.com/acme/api',
      decisions: { mise: { by: 'marker' }, just: { by: 'owner', rule: 'acme', scope: 'just' } },
    })
  })
})
