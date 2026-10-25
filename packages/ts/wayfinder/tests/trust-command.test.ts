/**
 * `way trust`: cli-tool's shared `trust` command over wayfinder's store and
 * the user file's policy. HOME is a throwaway directory in every case, so no
 * test grants trust on the developer's machine.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

import { resolveTrustRoot } from '@osdlc/trust-repo'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { appTrustStore } from '../src/trust-store.ts'
import { runWay, wayApp } from './app-support.ts'
import { CONFIG_HOME, STATE_HOME, fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(): Promise<string> {
  const dir = await fixtureRoot({})
  roots.push(dir)
  return dir
}

/** Write a user-layer trust policy at `home`. */
async function userTrust(home: string, trust: Record<string, unknown>): Promise<void> {
  await mkdir(join(home, CONFIG_HOME, 'wayfinder'), { recursive: true })
  await writeFile(join(home, CONFIG_HOME, 'wayfinder', 'config.json'), JSON.stringify({ trust }))
}

async function setup() {
  const dir = await root()
  const home = await root()
  return {
    dir,
    home,
    key: await resolveTrustRoot(dir),
    store: appTrustStore({ env: {}, home }),
    run: (argv: string[], at: string = dir) => runWay(argv, { cwd: at, home }),
  }
}

describe('way trust', () => {
  test('grants, names the root it keyed on, and says when it was already trusted', async () => {
    const s = await setup()
    const first = await s.run(['trust'])
    expect(first).toMatchObject({ exit: 0, out: `trusted ${s.key}\n` })
    expect(await s.store.list()).toEqual([s.key])
    expect((await s.run(['trust'])).out).toBe(`already trusted ${s.key}\n`)
  })

  test('the store is under the state home', async () => {
    const s = await setup()
    await s.run(['trust'])
    expect(s.store.dir()).toBe(join(s.home, STATE_HOME, 'wayfinder', 'trusted'))
  })

  test('--json answers { action, changed, roots } with what decided', async () => {
    const s = await setup()
    const ran = await s.run(['trust', '--json'])
    expect(ran.json()).toEqual({
      schemaVersion: 1,
      kind: 'trust',
      action: 'trust',
      changed: true,
      roots: [{ root: s.key, trusted: true, by: 'marker' }],
    })
  })

  test('-C names the repository', async () => {
    const s = await setup()
    const elsewhere = await root()
    expect((await s.run(['trust', '-C', s.dir], elsewhere)).exit).toBe(0)
    expect(await s.store.list()).toEqual([s.key])
  })

  test('a project config that will not parse fails the grant, writing nothing', async () => {
    const s = await setup()
    await writeFile(join(s.dir, 'wayfinder.config.json'), '{ not json')
    const ran = await s.run(['trust'])
    expect(ran.exit).toBe(1)
    expect(ran.err).toContain('invalid JSON')
    expect(await s.store.list()).toEqual([])
  })
})

describe('way trust --untrust', () => {
  test('removes the grant', async () => {
    const s = await setup()
    await s.store.trust(s.dir)
    expect(await s.run(['trust', '--untrust'])).toMatchObject({
      exit: 0,
      out: `untrusted ${s.key}\n`,
    })
    expect(await s.store.list()).toEqual([])
  })

  test('exits 1 when there was nothing to remove, still answering under --json', async () => {
    const s = await setup()
    const ran = await s.run(['trust', '--untrust', '--json'])
    expect(ran.exit).toBe(1)
    expect(ran.json()).toMatchObject({ action: 'untrust', changed: false })
    expect(ran.err).toContain(`not trusted: ${s.key}`)
  })

  test('notes when the owner policy still trusts the root', async () => {
    const base = await root()
    const repo = makeGitFixture({ dir: join(base, 'repo') })
    repo.git.remoteAdd('origin', 'https://github.com/AcmeOwner/dev.git')
    const home = await root()
    await userTrust(home, { owners: ['acmeowner'] })
    await runWay(['trust'], { cwd: repo.dir, home })
    const ran = await runWay(['trust', '--untrust'], { cwd: repo.dir, home })
    expect(ran.exit).toBe(0)
    expect(ran.err).toContain("is still trusted by owner ('acmeowner')")
  })
})

describe('way trust --show', () => {
  test('reports either answer and exits 0', async () => {
    const s = await setup()
    expect((await s.run(['trust', '--show'])).out).toBe(`not trusted ${s.key}\n`)
    await s.store.trust(s.dir)
    expect((await s.run(['trust', '--show'])).out).toBe(`trusted ${s.key} (by marker)\n`)
  })

  test('a trust.paths policy trusts with no marker, and a marker wins once there is one', async () => {
    const s = await setup()
    await userTrust(s.home, { paths: [s.dir] })
    const policy = await s.run(['trust', '--show', '--json'])
    expect(policy.json()).toMatchObject({ roots: [{ trusted: true, by: 'path', rule: s.dir }] })
    await s.store.trust(s.dir)
    const marker = await s.run(['trust', '--show', '--json'])
    expect(marker.json()).toMatchObject({ roots: [{ trusted: true, by: 'marker' }] })
  })

  test('a trust.owners policy covers a root by its origin owner', async () => {
    const base = await root()
    const repo = makeGitFixture({ dir: join(base, 'repo') })
    repo.git.remoteAdd('origin', 'https://github.com/AcmeOwner/dev.git')
    const home = await root()
    await userTrust(home, { owners: ['acmeowner'] })
    const ran = await runWay(['trust', '--show', '--json'], { cwd: repo.dir, home })
    expect(ran.json()).toMatchObject({
      roots: [{ trusted: true, by: 'owner', rule: 'acmeowner' }],
    })
  })
})

describe('way trust --scope', () => {
  test('grants one tool, which leaves the whole repository untrusted', async () => {
    const s = await setup()
    const ran = await s.run(['trust', '--scope', 'mise', '--json'])
    expect(ran.json()).toMatchObject({
      changed: true,
      roots: [{ root: s.key, trusted: true, by: 'marker', scope: 'mise' }],
    })
    expect(await s.store.isTrusted(s.dir, 'mise')).toBe(true)
    expect(await s.store.isTrusted(s.dir)).toBe(false)
    expect((await s.run(['trust', '--show', '--scope', 'mise'])).out).toBe(
      `trusted ${s.key} (by marker)\n`,
    )
  })

  test('trust.tools.<tool> trusts that tool alone, with no marker', async () => {
    const s = await setup()
    await userTrust(s.home, { tools: { just: { paths: [s.dir] } } })
    const just = await s.run(['trust', '--show', '--scope', 'just', '--json'])
    expect(just.json()).toMatchObject({
      roots: [{ trusted: true, by: 'path', rule: s.dir, scope: 'just' }],
    })
    const mise = await s.run(['trust', '--show', '--scope', 'mise', '--json'])
    expect(mise.json()).toMatchObject({ roots: [{ trusted: false, by: null, scope: 'mise' }] })
  })

  test('--untrust --scope removes that scope only', async () => {
    const s = await setup()
    await s.store.trust(s.dir)
    await s.store.trust(s.dir, 'mise')
    expect((await s.run(['trust', '--untrust', '--scope', 'mise'])).exit).toBe(0)
    expect(await s.store.isTrusted(s.dir)).toBe(true)
    expect((await s.store.listGrants()).map((g) => g.scope)).toEqual(['*'])
  })

  test("'*' and an empty scope are usage errors", async () => {
    const s = await setup()
    expect((await s.run(['trust', '--scope', '*'])).exit).toBe(2)
    expect((await s.run(['trust', '--scope', ''])).exit).toBe(2)
    expect(await s.store.listGrants()).toEqual([])
  })
})

describe('way trust --list and --untrust-all', () => {
  test('--list prints every grant, scopes named', async () => {
    const s = await setup()
    expect((await s.run(['trust', '--list'])).out).toBe('')
    await s.store.trust(s.dir)
    await s.store.trust(s.dir, 'mise')
    expect((await s.run(['trust', '--list'])).out).toBe(`${s.key}\n${s.key} (mise)\n`)
  })

  test('--list needs no config, so a broken project file does not break it', async () => {
    const s = await setup()
    await writeFile(join(s.dir, 'wayfinder.config.json'), '{ nope')
    expect((await s.run(['trust', '--list'])).exit).toBe(0)
  })

  test('--untrust-all removes every grant of the root', async () => {
    const s = await setup()
    await s.store.trust(s.dir)
    await s.store.trust(s.dir, 'just')
    const ran = await s.run(['trust', '--untrust-all', '--json'])
    expect(ran.exit).toBe(0)
    expect(ran.json()).toMatchObject({ action: 'untrust', changed: true })
    expect(await s.store.listGrants()).toEqual([])
    expect((await s.run(['trust', '--untrust-all'])).exit).toBe(1)
  })

  test('two modes together are a usage error', async () => {
    const s = await setup()
    expect((await s.run(['trust', '--show', '--list'])).exit).toBe(2)
  })
})

describe('way trust over the adapters', () => {
  test('a grant is refused over MCP and HTTP; show, list and untrust are open', async () => {
    const s = await setup()
    const app = wayApp()
    const ctx = { cwd: s.dir, env: { HOME: s.home } }
    for (const surface of ['mcp', 'http'] as const) {
      expect(await app.call(['trust'], {}, ctx, { surface })).toMatchObject({
        status: 'refused',
        reason: 'cli-only',
      })
      expect(await app.call(['trust'], { scope: 'mise' }, ctx, { surface })).toMatchObject({
        status: 'refused',
      })
    }
    expect(await s.store.listGrants()).toEqual([])
    expect(await app.call(['trust'], { show: true }, ctx, { surface: 'mcp' })).toMatchObject({
      status: 'ok',
    })
  })
})
