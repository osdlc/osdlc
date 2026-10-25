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
  expandTilde,
  expandTrustPath,
  normalizeTrustPath,
  pathGlobToRegExp,
  policyDecision,
  policyExecGate,
  resolveExecGate,
  resolveTrustRoot,
  trustDecision,
  trustStore,
  trustStoreDir,
  TRUST_MARKER_DIR,
  WHOLE_REPO_SCOPE,
  withheldHint,
  xdgHome,
  type ExecGate,
  type ExpandTrustPathOptions,
  type PolicyBy,
  type PolicyDecision,
  type PolicyDecisionOptions,
  type PolicyExecGate,
  type ResolveExecGateArgs,
  type TrustBy,
  type TrustDecision,
  type TrustGrant,
  type TrustPlatform,
  type TrustPolicy,
  type TrustResult,
  type TrustRules,
  type TrustStore,
  type TrustStoreOptions,
} from '@osdlc/trust-repo'
import { originOwner } from '@osdlc/trust-repo/git'

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

test('grant one tool, and gate on every tool a command runs', async () => {
  // A mise task runs mise as well as the task, so both scopes are asked for.
  await store.trust(repo, 'just')
  const gate: PolicyExecGate = await policyExecGate(
    store,
    { paths: [], owners: [] },
    { root: repo, configured: true, scopes: ['just', 'mise'] },
  )
  expect(gate).toMatchObject({ allowExec: false, missing: ['mise'] })

  await store.trust(repo, 'mise')
  const grants: TrustGrant[] = await store.listGrants()
  expect(grants.map((g) => g.scope)).toEqual(['just', 'mise'])
  expect(await store.list()).toEqual([])

  // A whole-repository grant covers every tool.
  await store.untrustAll(repo)
  await store.trust(repo, WHOLE_REPO_SCOPE)
  expect(await store.isTrusted(repo, 'cargo')).toBe(true)
  expect(await store.tighten()).toEqual([])
})

test('per-tool rules in the policy', async () => {
  const rules: TrustRules = { paths: [`${home}/work/**`], owners: [] }
  const policy: TrustPolicy = { paths: [], owners: [], scopes: { just: rules } }
  expect(await policyDecision(repo, policy, { scope: 'just' })).toMatchObject({
    trusted: true,
    scope: 'just',
  })
  expect((await policyDecision(repo, policy, { scope: 'mise' })).trusted).toBe(false)
})

test('expand a paths glob, and match on Windows', async () => {
  expect(expandTilde('~/work', home)).toBe(join(home, 'work'))
  expect(await expandTrustPath('~/work/**', home)).toBe(
    `${await resolveTrustRoot(join(home, 'work'))}/**`,
  )

  const platform: TrustPlatform = 'win32'
  const opts: ExpandTrustPathOptions = { platform, resolveRoot: (p) => p }
  expect(await expandTrustPath('~\\src\\**', 'C:\\Users\\me', opts)).toBe('c:/Users/me/src/**')
  expect(normalizeTrustPath('C:\\Users\\me\\src\\app', platform)).toBe('c:/Users/me/src/app')
})

test('the git-backed owner lookup for the owners rule', async () => {
  // Not a git repository, so there is no origin to read.
  expect(originOwner(repo)).toBeNull()
  expect(
    await policyDecision(repo, { paths: [], owners: ['example-org'] }, { ownerOf: originOwner }),
  ).toEqual({ trusted: false, by: null })
})
