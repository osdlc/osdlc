/**
 * The package used the way a consumer uses it: through the package name
 * only. Every export of `@osdlc/trust-repo` appears here at least once.
 * `tests/exports.test.ts` checks that.
 */

import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, expect, test } from 'vitest'

import {
  pathGlobToRegExp,
  policyDecision,
  policyExecGate,
  resolveExecGate,
  resolveTrustRoot,
  trustDecision,
  trustStore,
  trustStoreDir,
  TRUST_MARKER_DIR,
  withheldHint,
  xdgHome,
  type ExecGate,
  type PolicyBy,
  type PolicyDecision,
  type PolicyDecisionOptions,
  type ResolveExecGateArgs,
  type TrustBy,
  type TrustDecision,
  type TrustPolicy,
  type TrustResult,
  type TrustStore,
  type TrustStoreOptions,
} from '@osdlc/trust-repo'

let home: string
let repo: string
let options: TrustStoreOptions
let store: TrustStore
beforeEach(() => {
  home = realpathSync(mkdtempSync(join(tmpdir(), 'trust-example-')))
  repo = join(home, 'work', 'app')
  mkdirSync(repo, { recursive: true })
  // Inject env and home so the example never touches the real trust store.
  options = { tool: 'tooly', env: {}, home }
  store = trustStore(options)
})
afterEach(() => rmSync(home, { recursive: true, force: true }))

test('where the store lives: XDG state, one directory per tool', () => {
  expect(xdgHome({ XDG_STATE_HOME: '~/s' }, home, 'XDG_STATE_HOME', '.local', 'state')).toBe(
    join(home, 's'),
  )
  expect(trustStoreDir('tooly', {}, home)).toBe(join(home, '.local', 'state', 'tooly', 'trusted'))
  expect(store.dir().endsWith(join('tooly', TRUST_MARKER_DIR))).toBe(true)
})

test('trust a repository once, and the answer is remembered', async () => {
  expect(await store.isTrusted(repo)).toBe(false)
  const result: TrustResult = await store.trust(repo)
  expect(result.alreadyTrusted).toBe(false)
  expect(result.root).toBe(await resolveTrustRoot(repo))
  expect(await store.isTrusted(repo)).toBe(true)
  expect(await store.list()).toEqual([result.root])
  expect(await store.untrust(repo)).toBe(true)
  expect(await store.isTrusted(repo)).toBe(false)
})

test('the gate combines the configured value, a per-run flag and the store', async () => {
  const args: ResolveExecGateArgs = { root: repo, configured: true }
  const untrusted: ExecGate = await resolveExecGate(store, args)
  expect(untrusted).toMatchObject({ allowExec: false, reason: 'untrusted' })
  expect(await resolveExecGate(store, { ...args, flag: true })).toMatchObject({
    allowExec: true,
    reason: 'allowed-by-flag',
  })
  await store.trust(repo)
  expect(await resolveExecGate(store, args)).toMatchObject({ allowExec: true, reason: 'allowed' })
})

test('the hint every surface shows when the gate withholds', () => {
  expect(withheldHint('tooly', { verb: 'repo trust', flag: '--trust' })).toBe(
    'this repository is not trusted — run "tooly repo trust" to trust it, or pass --trust for this run only',
  )
})

test('a standing policy trusts by path glob or by owner', async () => {
  const policy: TrustPolicy = { paths: [`${home}/work/**`], owners: ['example-org'] }
  expect(pathGlobToRegExp('/a/**/c').test('/a/b/c')).toBe(true)

  const byPath: PolicyDecision = await policyDecision(repo, policy)
  const pathBy: PolicyBy | null = byPath.by
  expect(pathBy).toBe('path')

  const elsewhere = join(home, 'other')
  mkdirSync(elsewhere)
  const withOwner: PolicyDecisionOptions = { ownerOf: () => 'Example-Org' }
  expect(await policyDecision(elsewhere, policy, withOwner)).toMatchObject({ by: 'owner' })
  expect(await policyDecision(elsewhere, policy)).toEqual({ trusted: false, by: null })

  const decision: TrustDecision = await trustDecision(store, repo, { paths: [], owners: [] })
  expect(decision).toEqual({ trusted: false, by: null })
  await store.trust(repo)
  const marker: TrustBy | null = (await trustDecision(store, repo, policy)).by
  expect(marker).toBe('marker')

  const gate = await policyExecGate(
    store,
    { paths: [`${home}/work/**`], owners: [] },
    { root: elsewhere, configured: true },
  )
  expect(gate).toMatchObject({ allowExec: false, by: null })
})
