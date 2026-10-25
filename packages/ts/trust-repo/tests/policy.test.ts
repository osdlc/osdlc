/**
 * The trust policy (`../src/policy.ts`) without git: glob matching, the marker →
 * path → owner precedence, and the injected `ownerOf`/`expandPath` callbacks.
 * The git-backed `origin` lookup is the tool's own.
 */

import { afterEach, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { pathGlobToRegExp, policyDecision, policyExecGate, trustDecision } from '../src/policy.ts'
import { trustStore } from '../src/store.ts'

const dirs: string[] = []
function tmp(): string {
  const d = realpathSync(mkdtempSync(join(tmpdir(), 'trust-repo-policy-')))
  dirs.push(d)
  return d
}
const freshStore = () => trustStore({ tool: 'policy-test', dir: tmp() })

afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

describe('pathGlobToRegExp', () => {
  test('** crosses segments, * and ? stay inside one', () => {
    expect(pathGlobToRegExp('/a/**/c').test('/a/c')).toBe(true)
    expect(pathGlobToRegExp('/a/**/c').test('/a/x/y/c')).toBe(true)
    expect(pathGlobToRegExp('/a/*/c').test('/a/x/y/c')).toBe(false)
    expect(pathGlobToRegExp('/a/?').test('/a/x')).toBe(true)
    expect(pathGlobToRegExp('/a/?').test('/a/xy')).toBe(false)
    expect(pathGlobToRegExp('/a.b/**').test('/aXb/c')).toBe(false)
  })

  test('**/ matches whole segments only', () => {
    const re = pathGlobToRegExp('/w/**/trusted')
    expect(re.test('/w/trusted')).toBe(true)
    expect(re.test('/w/x/trusted')).toBe(true)
    expect(re.test('/w/untrusted')).toBe(false)
    expect(re.test('/w/x/untrusted')).toBe(false)
  })
})

describe('policyDecision', () => {
  test('paths: matches through an injected expandPath, literally without one', async () => {
    const home = tmp()
    const child = join(home, 'Developer', 'dev')
    mkdirSync(child, { recursive: true })
    const expandPath = (raw: string): string => raw.replace('{dev}', join(home, 'Developer'))
    expect(
      await policyDecision(child, { paths: ['{dev}/**'], owners: [] }, { expandPath }),
    ).toEqual({
      trusted: true,
      by: 'path',
      rule: '{dev}/**',
    })
    expect(await policyDecision(child, { paths: [`${home}/**`], owners: [] })).toMatchObject({
      by: 'path',
    })
    expect(await policyDecision(home, { paths: [`${home}/**`], owners: [] })).toEqual({
      trusted: false,
      by: null,
    })
  })

  test('a symlinked root matches on its resolved path', async () => {
    const home = tmp()
    const actual = join(home, 'real')
    mkdirSync(actual)
    symlinkSync(actual, join(home, 'link'))
    expect(
      (await policyDecision(join(home, 'link'), { paths: [`${home}/real`], owners: [] })).trusted,
    ).toBe(true)
  })

  test('owners: match the injected ownerOf, case-insensitively, and never without one', async () => {
    const root = tmp()
    const ownerOf = (): string => 'AcmeOwner'
    expect(await policyDecision(root, { paths: [], owners: ['acmeowner'] }, { ownerOf })).toEqual({
      trusted: true,
      by: 'owner',
      rule: 'acmeowner',
    })
    expect(await policyDecision(root, { paths: [], owners: ['acmeowner'] })).toEqual({
      trusted: false,
      by: null,
    })
    expect(
      await policyDecision(root, { paths: [], owners: ['acmeowner'] }, { ownerOf: () => null }),
    ).toEqual({ trusted: false, by: null })
  })

  test('owners: an entry matches the host as well as the owner', async () => {
    const root = tmp()
    const owners = async (entries: string[], owner: string): Promise<boolean> =>
      (await policyDecision(root, { paths: [], owners: entries }, { ownerOf: () => owner })).trusted
    // A bare entry is a GitHub owner, and a bare ownerOf answer is too.
    expect(await owners(['acme'], 'github.com/Acme')).toBe(true)
    expect(await owners(['acme'], 'acme')).toBe(true)
    expect(await owners(['GitHub.com/acme'], 'acme')).toBe(true)
    // The same owner name on another host is someone else.
    expect(await owners(['acme'], 'gitlab.com/acme')).toBe(false)
    expect(await owners(['github.com/acme'], 'bitbucket.org/acme')).toBe(false)
    expect(await owners(['gitlab.com/acme'], 'gitlab.com/ACME')).toBe(true)
    expect(await owners(['gitlab.com/acme'], 'github.com/acme')).toBe(false)
    // Entries are trimmed and compared without case, host included.
    expect(await owners(['  GitLab.COM/Acme  '], 'gitlab.com/acme')).toBe(true)
    expect(await owners([' Acme '], 'GITHUB.COM/acme')).toBe(true)
  })
})

describe('trustDecision and policyExecGate', () => {
  test('a marker grant wins over a matching policy', async () => {
    const store = freshStore()
    const root = tmp()
    const policy = { paths: [root], owners: [] }
    expect((await policyDecision(root, policy)).by).toBe('path')
    await store.trust(root)
    expect(await trustDecision(store, root, policy)).toEqual({ trusted: true, by: 'marker' })
  })

  test('with no marker it falls through to policy; with neither it is untrusted', async () => {
    const store = freshStore()
    const root = tmp()
    expect(await trustDecision(store, root, { paths: [root], owners: [] })).toMatchObject({
      by: 'path',
    })
    expect(await trustDecision(store, root, { paths: [], owners: [] })).toEqual({
      trusted: false,
      by: null,
    })
  })

  test('the gate carries by and rule, and a policy grant records no marker', async () => {
    const store = freshStore()
    const root = tmp()
    const gate = await policyExecGate(
      store,
      { paths: [root], owners: [] },
      { root, configured: true },
    )
    expect(gate).toMatchObject({ allowExec: true, reason: 'allowed', by: 'path', rule: root })
    expect(await store.isTrusted(root)).toBe(false)
  })

  test('an untrusted root withholds execution; configured: false withholds a trusted one', async () => {
    const store = freshStore()
    const root = tmp()
    expect(
      await policyExecGate(store, { paths: [], owners: [] }, { root, configured: true }),
    ).toMatchObject({ allowExec: false, reason: 'untrusted', by: null })
    await store.trust(root)
    expect(
      await policyExecGate(store, { paths: [], owners: [] }, { root, configured: false }),
    ).toMatchObject({ allowExec: false, reason: 'configured-off', trusted: true, by: 'marker' })
  })
})
