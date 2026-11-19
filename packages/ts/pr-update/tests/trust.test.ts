/**
 * The repository-trust gate over `@osdlc/trust-repo`: which keys count
 * as commands, which layer they must come from, and what consent lifts it.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { makeGitFixture } from '@osdlc/typed-git/testing'

import {
  prUpdateTrustStore,
  projectSourcedCommands,
  untrustedMessage,
  withoutRepairChoice,
} from '../src/trust.ts'

const scratch = mkdtempSync(join(tmpdir(), 'pr-update-trust-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let n = 0
/** A repository and an isolated trust store. */
function repo(): { root: string; env: Record<string, string> } {
  const fx = makeGitFixture({ dir: mkdtempSync(join(scratch, `r${n}-`)) })
  fx.commit('init', { 'a.txt': 'a' })
  const env = { PATH: process.env.PATH ?? '', XDG_STATE_HOME: join(scratch, `state${n++}`) }
  return { root: realpathSync(fx.dir), env }
}

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
