/**
 * The repository-trust gate over `@osdlc/trust-repo`: which keys count
 * as commands, which layer they must come from, and what consent lifts it.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { trustStore } from '@osdlc/trust-repo'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { main } from '../src/cli.ts'

import { prUpdateConfigSchema, type PrUpdateConfig } from '../src/config.ts'
import type { TargetCheckout } from '../src/ports.ts'
import {
  prUpdateTrustStore,
  projectSourcedCommands,
  targetTrustGate,
  targetTrustKey,
  untrustedMessage,
  withoutRepairChoice,
  worktreeCommands,
} from '../src/trust.ts'
import { allToolsInstalled, isolatedEnv } from './support.ts'

const scratch = mkdtempSync(join(tmpdir(), 'pr-update-trust-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let n = 0
/** A repository and an isolated trust store. */
function repo(): { root: string; env: Record<string, string> } {
  const fx = makeGitFixture({ dir: mkdtempSync(join(scratch, `r${n}-`)) })
  fx.commit('init', { 'a.txt': 'a' })
  const env = isolatedEnv(join(scratch, `env${n++}`))
  return { root: realpathSync.native(fx.dir), env }
}

describe('the trust store', () => {
  test("is pr-update's own directory in the osdlc state home", async () => {
    const { root, env } = repo()
    await prUpdateTrustStore(env).trust(root)
    const dir = join(env.OSDLC_ROOT!, 'state', 'osdlc', 'pr-update', 'trusted')
    expect(prUpdateTrustStore(env).dir()).toBe(dir)
    expect(existsSync(dir)).toBe(true)
  })

  test('a grant in the old place, $XDG_STATE_HOME/pr-update/trusted/, no longer counts', async () => {
    const { root, env } = repo()
    const old = trustStore({ tool: 'pr-update', env })
    await old.trust(root)
    expect(old.dir()).toBe(join(env.XDG_STATE_HOME!, 'pr-update', 'trusted'))
    expect(await prUpdateTrustStore(env).isTrusted(root)).toBe(false)
    const project = { pr_update: { test_command: 'make test' } }
    expect(await untrustedMessage({ root, project, local: null, trust: false, env })).toContain(
      'pr-update trust',
    )
  })
})

describe('repair.mode', () => {
  test('a non-headless mode in the project file is gated, headless is not', () => {
    const gated = (mode: string, local: Record<string, unknown> | null = null) =>
      projectSourcedCommands({ pr_update: { repair: { mode } } }, local)
    expect(gated('terminal')).toEqual(['pr_update.repair.mode'])
    expect(gated('interactive')).toEqual(['pr_update.repair.mode'])
    expect(gated('headless')).toEqual([])
    expect(gated('terminal', { pr_update: { repair: { mode: 'interactive' } } })).toEqual([])
    expect(gated('terminal', { pr_update: { repair: { mode: 'headless' } } })).toEqual([])
  })

  test('a flag consents to the keys it names only', () => {
    const project = { pr_update: { repair: { agent: 'claude', mode: 'terminal' } } }
    expect(withoutRepairChoice(project, ['mode'])).toEqual({
      pr_update: { repair: { agent: 'claude' } },
    })
    expect(withoutRepairChoice(project)).toEqual({ pr_update: { repair: {} } })
  })
})

describe('projectSourcedCommands', () => {
  test.each([
    ['lockfile_install', { lockfile_install: 'bun install' }],
    ['resolvers', { resolvers: [{ paths: ['docs/**'], run: 'make docs' }] }],
    ['repair.command', { repair: { command: 'fix-it' } }],
    ['test_command', { test_command: 'make test' }],
  ])('%s set in the project file is a gated key', (key, block) => {
    expect(projectSourcedCommands({ pr_update: block }, null)).toEqual([`pr_update.${key}`])
  })

  test('lists every gated key the project sets, in a stable order', () => {
    const project = {
      pr_update: { test_command: 'make test', lockfile_install: 'bun install', strategy: 'merge' },
    }
    expect(projectSourcedCommands(project, null)).toEqual([
      'pr_update.lockfile_install',
      'pr_update.test_command',
    ])
  })

  test('verify: detect in the project file is gated, as the repository chooses the command', () => {
    expect(projectSourcedCommands({ pr_update: { verify: 'detect' } }, null)).toEqual([
      'pr_update.verify',
    ])
    expect(projectSourcedCommands({ pr_update: { verify: 'test' } }, null)).toEqual([])
    expect(
      projectSourcedCommands(
        { pr_update: { verify: 'detect' } },
        { pr_update: { verify: 'none' } },
      ),
    ).toEqual([])
  })

  test("a key the overlay also sets is the person's own and not gated", () => {
    const block = { test_command: 'make test' }
    expect(projectSourcedCommands({ pr_update: block }, { pr_update: block })).toEqual([])
  })

  test('null, an empty list and an absent block are not commands', () => {
    expect(projectSourcedCommands(null, null)).toEqual([])
    expect(
      projectSourcedCommands({ pr_update: { test_command: null, resolvers: [] } }, null),
    ).toEqual([])
  })
})

describe('untrustedMessage', () => {
  const project = { pr_update: { test_command: 'make test' } }

  test('a project with no gated command needs no consent', async () => {
    const { root, env } = repo()
    expect(
      await untrustedMessage({
        root,
        project: { pr_update: { strategy: 'merge' } },
        local: null,
        trust: false,
        env,
      }),
    ).toBeNull()
  })

  test('a gated command with no consent is refused, naming the key and the way out', async () => {
    const { root, env } = repo()
    const msg = await untrustedMessage({ root, project, local: null, trust: false, env })
    expect(msg).toContain('pr_update.test_command')
    expect(msg).toContain('pr-update trust')
    expect(msg).toContain('--trust')
  })

  test('--trust lifts the refusal for one run and records nothing', async () => {
    const { root, env } = repo()
    expect(await untrustedMessage({ root, project, local: null, trust: true, env })).toBeNull()
    expect(await prUpdateTrustStore(env).list()).toEqual([])
    expect(await untrustedMessage({ root, project, local: null, trust: false, env })).not.toBeNull()
  })

  test('a recorded trust lifts it', async () => {
    const { root, env } = repo()
    await prUpdateTrustStore(env).trust(root)
    expect(await untrustedMessage({ root, project, local: null, trust: false, env })).toBeNull()
  })

  test('the overlay setting the same command lifts it without consent', async () => {
    const { root, env } = repo()
    expect(await untrustedMessage({ root, project, local: project, trust: false, env })).toBeNull()
  })
})

describe('a target other than the project root', () => {
  const none = prUpdateConfigSchema.parse({})
  const cfg = (patch: Record<string, unknown>): PrUpdateConfig =>
    prUpdateConfigSchema.parse({ ...patch })

  function target(path: string, source: TargetCheckout['source'] = 'located'): TargetCheckout {
    return { host: 'forgejo.local', owner: 'x', name: 'y', path, source, remote: 'origin' }
  }

  test('every setting that starts a command in its worktree is one, whichever layer set it', () => {
    expect(worktreeCommands(none)).toEqual([])
    expect(
      worktreeCommands(
        cfg({
          lockfile_install: 'bun install',
          resolvers: [{ paths: ['docs/**'], run: 'make docs' }],
          verify: 'test',
          repair: { command: 'fix-it' },
        }),
      ),
    ).toEqual(['lockfile_install', 'resolvers', 'verify: test', 'repair.command'])
    expect(worktreeCommands(cfg({ verify: 'detect', repair: { agent: 'claude' } }))).toEqual([
      'verify: detect',
      'repair.agent',
    ])
  })

  test('a located checkout is trusted by its path, a clone by host/owner/name', () => {
    expect(targetTrustKey(target('/srv/y'))).toBe('/srv/y')
    expect(targetTrustKey(target('/cache/y.git', 'clone'))).toEqual({ repo: 'forgejo.local/x/y' })
  })

  test('needs no trust when the run starts no command in it', async () => {
    const { root, env } = repo()
    expect(await targetTrustGate({ cfg: none, trust: false, env })(target(root))).toBeNull()
  })

  test('is refused untrusted, naming what would run and the way out', async () => {
    const { root, env } = repo()
    const why = await targetTrustGate({ cfg: cfg({ verify: 'detect' }), trust: false, env })(
      target(root),
    )
    expect(why).toMatch(/^untrusted: /)
    expect(why).toContain(root)
    expect(why).toContain('verify: detect')
    expect(why).toContain('pr-update trust')
    expect(why).toContain('--trust')
  })

  test('--trust and a grant on its path each let it run', async () => {
    const { root, env } = repo()
    const gated = cfg({ lockfile_install: 'bun install' })
    expect(await targetTrustGate({ cfg: gated, trust: true, env })(target(root))).toBeNull()
    expect(await prUpdateTrustStore(env).list()).toEqual([])
    await prUpdateTrustStore(env).trust(root)
    expect(await targetTrustGate({ cfg: gated, trust: false, env })(target(root))).toBeNull()
  })

  test('a grant on its repository does not cover a located checkout of it', async () => {
    const { root, env } = repo()
    await prUpdateTrustStore(env).trust({ repo: 'forgejo.local/x/y' })
    const gate = targetTrustGate({ cfg: cfg({ verify: 'detect' }), trust: false, env })
    expect(await gate(target(root))).toMatch(/^untrusted: /)
    expect(await gate(target(root, 'clone'))).toBeNull()
  })
})

describe('pr-update trust with a repository', () => {
  async function trust(env: Record<string, string>, cwd: string, ...argv: string[]) {
    const ctx = captureContext({ cwd, env })
    const code = await main(['trust', ...argv, '--json'], ctx, { which: allToolsInstalled })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }

  test('grants, shows, lists and removes host/owner/name, not the working directory', async () => {
    const { root, env } = repo()
    const granted = await trust(env, root, 'GitHub.com/Acme/API')
    expect(granted.code).toBe(EXIT.ok)
    const entry = { root: 'github.com/acme/api', kind: 'repo', trusted: true, by: 'marker' }
    expect(JSON.parse(granted.out)).toMatchObject({ action: 'trust', roots: [entry] })
    expect(await prUpdateTrustStore(env).isTrusted({ repo: 'github.com/acme/api' })).toBe(true)
    expect(await prUpdateTrustStore(env).isTrusted(root)).toBe(false)

    const shown = await trust(env, root, '--show', 'github.com/acme/api')
    expect(JSON.parse(shown.out)).toMatchObject({ action: 'show', roots: [entry] })
    const listed = await trust(env, root, '--list')
    expect(JSON.parse(listed.out)).toMatchObject({ action: 'list', roots: [entry] })

    expect((await trust(env, root, '--untrust', 'github.com/acme/api')).code).toBe(EXIT.ok)
    expect(await prUpdateTrustStore(env).list()).toEqual([])
  })

  test('a repository that cannot be a key is a usage error, and nothing is granted', async () => {
    const { root, env } = repo()
    for (const bad of ['github.com:443/acme/api', 'acme/api', 'github.com/acme/api.git']) {
      expect((await trust(env, root, bad)).code).toBe(EXIT.usage)
    }
    expect(await prUpdateTrustStore(env).list()).toEqual([])
  })
})
