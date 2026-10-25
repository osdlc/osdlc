/**
 * Per-tool trust: a grant for one runner lets that runner run while the rest
 * stay withheld, a runner a tool manager wraps needs the manager trusted too,
 * and a revoke withholds it again. `env` has no PATH, so no tool is found and
 * nothing runs; `skippedForExec` says what the gate decided.
 */

import { afterAll, describe, expect, test } from 'vitest'

import type { Catalog } from '@osdlc/system-model/detect'

import { CONFIG_ENV_VAR } from '../src/app.ts'
import { createSession, type Session } from '../src/core/session.ts'
import { withheldLabel } from '../src/vocabulary.ts'
import { captureIo } from '@osdlc/cli-tool'

import { main } from '../src/cli.ts'
import { fixtureRoot, removeRoot } from './support.ts'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string>): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/** mise as a runner and a tool manager, and moon, which mise wraps. */
const MISE_AND_MOON = {
  'mise.toml': '[tasks.hello]\nrun = "echo hi"\n',
  '.moon/workspace.yml': 'projects: {}\n',
}

function withheld(catalog: Catalog): string[] {
  return catalog.reports.filter((r) => r.skippedForExec).map((r) => r.runner)
}

async function open(dir: string, home = dir, env: Record<string, string> = {}): Promise<Session> {
  return createSession({ dir, cwd: dir, env, home })
}

describe('per-tool trust', () => {
  test('with no grant, each exec runner is withheld and names the scopes it needs', async () => {
    const dir = await root(MISE_AND_MOON)
    const session = await open(dir)
    const snap = await session.catalog()
    expect(withheld(snap.catalog).sort()).toEqual(['mise', 'moon'])
    const moon = session.unknowns(snap).find((u) => u.kind === 'withheld' && u.runner === 'moon')
    expect(moon).toEqual({
      kind: 'withheld',
      runner: 'moon',
      reason: 'untrusted',
      missing: ['moon', 'mise'],
      label: withheldLabel('untrusted'),
    })
    expect(session.settings().trustedTools).toEqual([])
  })

  test('a repository-wide grant lets every runner run', async () => {
    const dir = await root(MISE_AND_MOON)
    const session = await open(dir)
    await session.grantTrust()
    const snap = await session.catalog()
    expect(withheld(snap.catalog)).toEqual([])
    expect(session.missingScopes('moon')).toBeUndefined()
    expect(session.unknowns(snap).filter((u) => u.kind === 'withheld')).toEqual([])
  })

  test('a tool-only grant lets that runner run and keeps the others withheld', async () => {
    const dir = await root(MISE_AND_MOON)
    const session = await open(dir)
    expect(await session.grantTrust('mise')).toEqual({ changed: true })
    // The repository as a whole is still not trusted.
    expect(session.gate.allowExec).toBe(false)
    const snap = await session.catalog()
    expect(withheld(snap.catalog)).toEqual(['moon'])
    const moon = session.unknowns(snap).find((u) => u.kind === 'withheld')
    expect(moon).toMatchObject({
      runner: 'moon',
      reason: 'tool-untrusted',
      missing: ['moon'],
      label: 'withheld: moon is not trusted',
    })
    expect(session.settings().trustedTools).toEqual(['mise'])

    // The grant lasts: a new session reads it from the store.
    const again = await open(dir)
    expect(withheld((await again.catalog()).catalog)).toEqual(['moon'])
  })

  test('a runner a tool manager wraps needs the manager granted too', async () => {
    const dir = await root(MISE_AND_MOON)
    const session = await open(dir)
    await session.grantTrust('moon')
    const first = await session.catalog()
    expect(withheld(first.catalog).sort()).toEqual(['mise', 'moon'])
    const moon = session.unknowns(first).find((u) => u.kind === 'withheld' && u.runner === 'moon')
    expect(moon).toMatchObject({ missing: ['mise'], label: 'withheld: mise is not trusted' })

    await session.grantTrust('mise')
    expect(withheld((await session.catalog()).catalog)).toEqual([])
  })

  test('without a wrapping tool manager, the runner alone is enough', async () => {
    const dir = await root({ '.moon/workspace.yml': 'projects: {}\n' })
    const session = await open(dir)
    await session.grantTrust('moon')
    expect(withheld((await session.catalog()).catalog)).toEqual([])
  })

  test('a revoke withholds the runner again on the next probe', async () => {
    const dir = await root(MISE_AND_MOON)
    const session = await open(dir)
    await session.grantTrust('mise')
    expect(withheld((await session.catalog()).catalog)).toEqual(['moon'])
    expect(await session.revokeTrust('mise')).toEqual({ changed: true })
    expect(await session.revokeTrust('mise')).toEqual({ changed: false })
    expect(withheld((await session.catalog()).catalog).sort()).toEqual(['mise', 'moon'])
    expect(session.settings().trustedTools).toEqual([])
  })

  test('trust.tools in the user config grants one tool with no marker', async () => {
    const dir = await root(MISE_AND_MOON)
    const user = await root({
      'config.json': JSON.stringify({ trust: { tools: { mise: { paths: [dir] } } } }),
    })
    const session = await open(dir, dir, { [CONFIG_ENV_VAR]: `${user}/config.json` })
    expect(withheld((await session.catalog()).catalog)).toEqual(['moon'])
    // Revoking the marker cannot undo a config rule.
    await session.revokeTrust('mise')
    expect(withheld((await session.catalog()).catalog)).toEqual(['moon'])
  })

  test('--cached keeps the split: a granted runner is read as granted', async () => {
    const dir = await root(MISE_AND_MOON)
    const session = await open(dir)
    await session.grantTrust('mise')
    await session.catalog()
    const stored = await session.catalog({ cached: true })
    expect(withheld(stored.catalog)).toEqual(['moon'])
  })

  test('a tool grant is refused when trust does not decide execution', async () => {
    const dir = await root(MISE_AND_MOON)
    const session = await createSession({
      dir,
      cwd: dir,
      env: {},
      home: dir,
      flags: { allowExec: false },
    })
    await expect(session.grantTrust('mise')).rejects.toMatchObject({ code: 'not-trustable' })
    const snap = await session.catalog()
    const unknown = session.unknowns(snap).find((u) => u.kind === 'withheld')
    expect(unknown).toMatchObject({ reason: 'exec-off' })
    expect(unknown).not.toHaveProperty('missing')
  })

  test('the reserved scope * is not a tool grant', async () => {
    const dir = await root(MISE_AND_MOON)
    const session = await open(dir)
    await expect(session.grantTrust('*')).rejects.toMatchObject({ code: 'bad-arguments' })
  })

  test('way trust --scope grants one tool, and way list --json shows the rest withheld', async () => {
    const dir = await root(MISE_AND_MOON)
    const way = async (argv: string[]) => {
      const io = captureIo()
      const code = await main(argv, {}, dir, io)
      return { code, out: io.out, err: io.err }
    }
    expect((await way(['trust', '--scope', 'mise', '-C', dir])).code).toBe(0)
    const listed = await way(['list', '--json', '-C', dir])
    const doc = JSON.parse(listed.out) as {
      unknowns: Array<{ kind: string; runner: string; missing?: string[]; label: string }>
      trustedTools: string[]
    }
    expect(doc.trustedTools).toEqual(['mise'])
    const withheldNow = doc.unknowns.filter((u) => u.kind === 'withheld')
    expect(withheldNow).toEqual([
      {
        kind: 'withheld',
        runner: 'moon',
        reason: 'tool-untrusted',
        missing: ['moon'],
        label: 'withheld: moon is not trusted',
      },
    ])
  })

  test('way list --json has no trusted tools before a tool grant', async () => {
    const dir = await root(MISE_AND_MOON)
    const io = captureIo()
    expect(await main(['list', '--json', '-C', dir], {}, dir, io)).toBe(0)
    expect((JSON.parse(io.out) as { trustedTools: string[] }).trustedTools).toEqual([])
  })
})
