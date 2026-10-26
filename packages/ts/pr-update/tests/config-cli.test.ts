import { afterAll, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { CONFIG_INVALID_EXIT, overlayPath } from '@osdlc/config-layers'
import { trustStore } from '@osdlc/trust-repo'
import type { CommandRunner } from '@osdlc/command-seam'
import { IDENTITY, makeBareAndWorker, makeGitFixture } from '@osdlc/typed-git/testing'

import { FIXTURE_REMOTE, allToolsInstalled, fakeTools } from './support.ts'
import { PR_UPDATE_CONFIG_FILE, main } from '../src/cli.ts'

const PR_UPDATE_CONFIG_FILE_NAME = PR_UPDATE_CONFIG_FILE.name
import { EXIT_UNTRUSTED } from '../src/trust.ts'

const LOCAL_FILE_NAME = overlayPath(PR_UPDATE_CONFIG_FILE_NAME)

const scratch = mkdtempSync(join(tmpdir(), 'pr-update-config-'))
afterAll(() => rmSync(scratch, { recursive: true, force: true }))

let n = 0
/** A fresh git repo (a github origin; the faked `gh` lists no PRs) and an isolated trust state. */
function project(): { dir: string; env: Record<string, string> } {
  const repo = makeGitFixture({ dir: mkdtempSync(join(scratch, `p${n++}-`)) })
  repo.commit('init', { 'a.txt': 'a' })
  repo.git.remoteAdd('origin', FIXTURE_REMOTE)
  const env = { PATH: process.env.PATH ?? '', XDG_STATE_HOME: join(scratch, `state${n}`) }
  return { dir: repo.dir, env }
}

async function run(dir: string, env: Record<string, string>, ...argv: string[]) {
  const ctx = captureContext({ cwd: dir, env })
  const code = await main(argv, ctx, fakeTools)
  return { code, out: ctx.io.out, err: ctx.io.err }
}

describe('loader', () => {
  test('AC-1: skips a malformed unmounted top-level block', async () => {
    const { dir, env } = project()
    writeFileSync(
      join(dir, PR_UPDATE_CONFIG_FILE_NAME),
      'pr_update:\n  strategy: merge\ncode_host:\n  override: forgejo\norchestrator:\n  limits: "nonsense"\n',
    )
    const strategy = await run(dir, env, 'config', 'get', 'strategy')
    expect(strategy.code).toBe(EXIT.ok)
    expect(strategy.out).toBe('"merge"\n')
    expect((await run(dir, env, 'config', 'get', 'code_host.override')).out).toBe('"forgejo"\n')
  })

  test('AC-2: a nested unknown key under pr_update fails with exit 14', async () => {
    const { dir, env } = project()
    writeFileSync(
      join(dir, PR_UPDATE_CONFIG_FILE_NAME),
      'pr_update:\n  guards:\n    reviewd: merge\n',
    )
    const r = await run(dir, env, 'survey')
    expect(r.code).toBe(CONFIG_INVALID_EXIT)
    expect(r.err).toContain('reviewd')
  })
})

describe('the config file the binary reads', () => {
  test('AC-8: reads pr-update.yaml and its .local overlay; another tool’s file alone runs on defaults', async () => {
    const { dir, env } = project()
    // A file some other tool owns is not this binary's business, whatever it holds.
    writeFileSync(join(dir, 'other-tool.yaml'), 'pr_update:\n  strategy: merge\n')
    expect((await run(dir, env, 'config', 'get', 'strategy')).out).toBe('"rebase"\n')
    expect((await run(dir, env, 'survey')).code).toBe(EXIT.ok)

    writeFileSync(join(dir, 'pr-update.yaml'), 'pr_update:\n  strategy: merge\n')
    expect((await run(dir, env, 'config', 'get', 'strategy')).out).toBe('"merge"\n')
    writeFileSync(join(dir, 'pr-update.local.yaml'), 'pr_update:\n  max_failed_attempts: 4\n')
    expect((await run(dir, env, 'config', 'get', 'max_failed_attempts')).out).toBe('4\n')
  })

  test('AC-8: a leftover .pr-update.yaml is simply not read', async () => {
    const { dir, env } = project()
    writeFileSync(join(dir, '.pr-update.yaml'), 'strategy: merge\n')
    expect((await run(dir, env, 'survey')).code).toBe(EXIT.ok)
    expect((await run(dir, env, 'config', 'get', 'strategy')).out).toBe('"rebase"\n')
  })

  test('a config write lands in pr-update.yaml and nowhere else', async () => {
    const { dir, env } = project()
    expect((await run(dir, env, 'config', 'set', 'strategy', 'merge')).code).toBe(EXIT.ok)
    expect(readFileSync(join(dir, 'pr-update.yaml'), 'utf8')).toContain('strategy: merge')
    expect(existsSync(join(dir, 'other-tool.yaml'))).toBe(false)
  })

  test("the config help names the binary's file", async () => {
    const { dir, env } = project()
    expect((await run(dir, env, 'config', '--help')).out).toContain('pr-update.yaml')
  })

  test('main takes another file from its caller', async () => {
    const { dir, env } = project()
    writeFileSync(join(dir, 'tool.yaml'), 'pr_update:\n  strategy: merge\n')
    const ctx = captureContext({ cwd: dir, env })
    const code = await main(['config', 'get', 'strategy'], ctx, {
      configFile: { name: 'tool.yaml', envVar: 'TOOL_CONFIG' },
    })
    expect(code).toBe(EXIT.ok)
    expect(ctx.io.out).toBe('"merge"\n')
  })
})

describe('config subcommands', () => {
  test('AC-4: shorthand and qualified keys write byte-identical files; explain qualifies', async () => {
    const a = project()
    const b = project()
    expect((await run(a.dir, a.env, 'config', 'set', 'strategy', 'merge', '--local')).code).toBe(0)
    expect(
      (await run(b.dir, b.env, 'config', 'set', 'pr_update.strategy', 'merge', '--local')).code,
    ).toBe(0)
    const local = (dir: string) => readFileSync(join(dir, LOCAL_FILE_NAME), 'utf8')
    expect(local(a.dir)).toBe(local(b.dir))
    expect(local(a.dir)).toContain('strategy: merge')
    const explain = await run(a.dir, a.env, 'config', 'explain', 'strategy')
    expect(explain.code).toBe(0)
    expect(explain.out.startsWith('pr_update.strategy = "merge"')).toBe(true)
    expect(explain.out).toContain('local is the highest layer that sets it')
  })

  test('set refuses an invalid value as a usage error and leaves the file alone', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'config', 'set', 'strategy', 'sideways')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain('would leave')
    expect(() => readFileSync(join(dir, PR_UPDATE_CONFIG_FILE_NAME), 'utf8')).toThrow()
  })

  test('unset removes what set wrote; get and list read it back', async () => {
    const { dir, env } = project()
    await run(dir, env, 'config', 'set', 'max_failed_attempts', '3')
    expect((await run(dir, env, 'config', 'get', 'max_failed_attempts')).out).toBe('3\n')
    expect((await run(dir, env, 'config', 'list')).out).toMatch(
      /pr_update\.max_failed_attempts\s+3\s+\(project\)/,
    )
    await run(dir, env, 'config', 'unset', 'max_failed_attempts')
    expect((await run(dir, env, 'config', 'get', 'max_failed_attempts')).out).toBe('1\n')
  })

  test('scaffold prints both mounted blocks', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'config', 'scaffold')
    expect(r.code).toBe(0)
    expect(r.out).toContain('pr_update:')
    expect(r.out).toContain('code_host:')
    expect((await run(dir, env, 'config', 'scaffold', '--local')).out).toContain('# pr_update:')
  })

  test('AC-8: PR_UPDATE_CONFIG names another file in explain', async () => {
    const { dir, env } = project()
    const other = join(scratch, 'elsewhere')
    mkdirSync(other, { recursive: true })
    const file = join(other, 'custom.yaml')
    writeFileSync(file, 'pr_update:\n  strategy: merge\n')
    const r = await run(
      dir,
      { ...env, PR_UPDATE_CONFIG: file },
      'config',
      'explain',
      'pr_update.strategy',
      '--json',
    )
    expect(r.code).toBe(0)
    const doc = JSON.parse(r.out) as { source: string; layers: { layer: string; file?: string }[] }
    expect(doc.source).toBe('project')
    expect(doc.layers.find((l) => l.layer === 'project')).toMatchObject({
      file,
      envVar: 'PR_UPDATE_CONFIG',
    })
    const path = await run(dir, { ...env, PR_UPDATE_CONFIG: file }, 'config', 'path')
    expect(path.out).toContain(`${file} (exists) (from PR_UPDATE_CONFIG)`)
  })
})

describe('trust gate on update', () => {
  const gated = 'pr_update:\n  lockfile_install: bun install\n'

  test('AC-6: a project-sourced command exits 21; --trust and a recorded trust let it run', async () => {
    const { dir, env } = project()
    writeFileSync(join(dir, PR_UPDATE_CONFIG_FILE_NAME), gated)
    const refused = await run(dir, env, 'update')
    expect(refused.code).toBe(EXIT_UNTRUSTED)
    expect(refused.err).toContain('lockfile_install')

    expect((await run(dir, env, 'update', '--trust')).code).toBe(EXIT.ok)

    expect((await run(dir, env, 'update')).code).toBe(EXIT_UNTRUSTED)
    expect((await run(dir, env, 'trust')).code).toBe(EXIT.ok)
    expect((await run(dir, env, 'update')).code).toBe(EXIT.ok)
    expect(await trustStore({ tool: 'pr-update', env }).list()).toEqual([realpathSync(dir)])
  })

  test('AC-6: a trusted run executes the project-sourced command; an untrusted one does not', async () => {
    // A real remote: the worker's `origin` fetches as github.com/o/r (so the
    // survey names a repository) and pushes to the bare store. `gh` is the
    // only fake, answering from the store's refs.
    const fx = makeBareAndWorker({
      initialBranch: 'main',
      parent: mkdtempSync(join(scratch, 'pair-')),
    })
    const { worker } = fx
    worker.commit('initial', { 'shared.txt': 'base\n' })
    worker.git.push('origin', 'main')
    worker.git.checkout('main', { branch: 'topic' })
    worker.commit('topic work', { 't.txt': 't\n' })
    worker.git.push('origin', 'topic')
    worker.git.checkout('main')
    worker.commit('main moves', { 'm.txt': 'm\n' })
    worker.git.push('origin', 'main')
    worker.git.configSet('remote.origin.url', 'https://github.com/o/r.git')
    worker.git.configSet('remote.origin.pushurl', fx.bare.dir)

    const marker = join(scratch, `ran-${n++}`)
    writeFileSync(
      join(worker.dir, PR_UPDATE_CONFIG_FILE_NAME),
      `pr_update:\n  verify: test\n  test_command: touch ${marker}\n`,
    )
    const gh: CommandRunner = {
      run: () => ({
        exitCode: 0,
        stderr: '',
        stdout: JSON.stringify([
          {
            number: 1,
            state: 'OPEN',
            title: 'topic',
            url: 'https://github.com/o/r/pull/1',
            baseRefName: 'main',
            headRefName: 'topic',
            headRefOid: worker.git.resolveRef('origin/topic'),
          },
        ]),
      }),
    }
    const env = { ...project().env, ...IDENTITY }
    const argv = ['update', '--apply', '--no-fetch', '--strategy', 'merge']
    const go = (...extra: string[]) => {
      const ctx = captureContext({ cwd: worker.dir, env })
      return main([...argv, ...extra], ctx, { gh, which: allToolsInstalled }).then((code) => ({
        code,
        err: ctx.io.err,
      }))
    }
    try {
      const refused = await go()
      expect(refused.code).toBe(EXIT_UNTRUSTED)
      expect(existsSync(marker)).toBe(false)

      const trusted = await go('--trust')
      expect(trusted.err).toBe('')
      expect(trusted.code).toBe(EXIT.ok)
      expect(existsSync(marker)).toBe(true)
    } finally {
      fx.cleanup()
    }
  })

  test('the same command in the .local overlay needs no consent', async () => {
    const { dir, env } = project()
    writeFileSync(join(dir, LOCAL_FILE_NAME), gated)
    expect((await run(dir, env, 'update')).code).toBe(EXIT.ok)
  })

  test('resolvers and repair.command are gated too', async () => {
    for (const block of [
      'pr_update:\n  resolvers:\n    - paths: [docs/**]\n      run: make docs\n',
      'pr_update:\n  repair:\n    command: fix-it\n',
    ]) {
      const { dir, env } = project()
      writeFileSync(join(dir, PR_UPDATE_CONFIG_FILE_NAME), block)
      expect((await run(dir, env, 'update')).code).toBe(EXIT_UNTRUSTED)
    }
  })
})

describe('repair agent presets in config', () => {
  test('AC-7: repair.agent with repair.command fails validation with exit 14', async () => {
    const { dir, env } = project()
    writeFileSync(
      join(dir, PR_UPDATE_CONFIG_FILE_NAME),
      'pr_update:\n  repair:\n    agent: claude\n    command: fix-it\n',
    )
    const r = await run(dir, env, 'survey')
    expect(r.code).toBe(CONFIG_INVALID_EXIT)
    expect(r.err).toContain('mutually exclusive')
  })

  test('an unknown agent is refused with exit 14', async () => {
    const { dir, env } = project()
    writeFileSync(
      join(dir, PR_UPDATE_CONFIG_FILE_NAME),
      'pr_update:\n  repair:\n    agent: gemini\n',
    )
    expect((await run(dir, env, 'survey')).code).toBe(CONFIG_INVALID_EXIT)
  })

  test('config set refuses the second of the pair and writes nothing', async () => {
    const { dir, env } = project()
    expect((await run(dir, env, 'config', 'set', 'repair.agent', 'pi')).code).toBe(EXIT.ok)
    const r = await run(dir, env, 'config', 'set', 'repair.command', 'fix-it')
    expect(r.code).toBe(EXIT.usage)
    expect(readFileSync(join(dir, PR_UPDATE_CONFIG_FILE_NAME), 'utf8')).not.toContain('fix-it')
  })

  test('AC-7: a project-file repair.agent without trust exits 21; the flag and trust lift it', async () => {
    const { dir, env } = project()
    writeFileSync(
      join(dir, PR_UPDATE_CONFIG_FILE_NAME),
      'pr_update:\n  repair:\n    agent: claude\n',
    )
    const refused = await run(dir, env, 'update')
    expect(refused.code).toBe(EXIT_UNTRUSTED)
    expect(refused.err).toContain('repair.agent')
    expect((await run(dir, env, 'update', '--trust')).code).toBe(EXIT.ok)
  })

  test('AC-7: --repair-agent on the command line needs no trust, and replaces the project file’s choice', async () => {
    const { dir, env } = project()
    writeFileSync(
      join(dir, PR_UPDATE_CONFIG_FILE_NAME),
      'pr_update:\n  repair:\n    agent: claude\n',
    )
    expect((await run(dir, env, 'update', '--repair-agent', 'codex')).code).toBe(EXIT.ok)
    expect((await run(dir, env, 'update', '--repair-command', 'fix-it')).code).toBe(EXIT.ok)
  })

  test('a repair.agent in the .local overlay needs no consent', async () => {
    const { dir, env } = project()
    writeFileSync(join(dir, LOCAL_FILE_NAME), 'pr_update:\n  repair:\n    agent: pi\n')
    expect((await run(dir, env, 'update')).code).toBe(EXIT.ok)
  })

  test('both repair flags together are a usage error', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'update', '--repair-agent', 'pi', '--repair-command', 'x')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain('mutually exclusive')
  })

  test('AC-6: update --help lists each agent with a line of its own', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'update', '--help')
    expect(r.out).toContain('--repair-agent')
    expect(r.out).toContain('--repair-command')
    for (const [name, line] of [
      ['claude', 'Claude Code'],
      ['codex', 'Codex'],
      ['cursor', 'Cursor'],
      ['pi', 'pi coding agent'],
    ]) {
      expect(r.out).toMatch(new RegExp(`^\\s+${name}\\s+.*${line}`, 'm'))
    }
  })
})

describe('config set/unset --dry-run, get on an unset key, unknown subcommands', () => {
  test('set --dry-run reports what it would write and writes nothing', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'config', 'set', 'strategy', 'merge', '--dry-run')
    expect(r.code).toBe(EXIT.ok)
    expect(r.out).toMatch(/pr-update\.yaml: would set pr_update\.strategy = "merge"\n$/)
    expect(existsSync(join(dir, PR_UPDATE_CONFIG_FILE_NAME))).toBe(false)
  })

  test('setting the value a key already has succeeds and writes the same file', async () => {
    const { dir, env } = project()
    expect((await run(dir, env, 'config', 'set', 'strategy', 'merge')).code).toBe(EXIT.ok)
    const before = readFileSync(join(dir, PR_UPDATE_CONFIG_FILE_NAME), 'utf8')
    const again = await run(dir, env, 'config', 'set', 'strategy', 'merge')
    expect(again.code).toBe(EXIT.ok)
    expect(again.out).toMatch(/pr-update\.yaml: pr_update\.strategy = "merge"\n$/)
    expect(readFileSync(join(dir, PR_UPDATE_CONFIG_FILE_NAME), 'utf8')).toBe(before)
  })

  test('unset --dry-run leaves the file as it was', async () => {
    const { dir, env } = project()
    await run(dir, env, 'config', 'set', 'strategy', 'merge')
    const before = readFileSync(join(dir, PR_UPDATE_CONFIG_FILE_NAME), 'utf8')
    const r = await run(dir, env, 'config', 'unset', 'strategy', '--dry-run')
    expect(r.code).toBe(EXIT.ok)
    expect(r.out).toContain('would remove pr_update.strategy')
    expect(readFileSync(join(dir, PR_UPDATE_CONFIG_FILE_NAME), 'utf8')).toBe(before)
  })

  test('unset of a key the file does not set exits 1', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'config', 'unset', 'strategy')
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toContain('pr_update.strategy is not set in')
  })

  test('get reads a key below a listed one; one with no value is an error', async () => {
    const { dir, env } = project()
    // `repair.agent` defaults to null ("no agent"), a value like any other, as at the top level.
    const byDefault = await run(dir, env, 'config', 'get', 'repair.agent')
    expect(byDefault.code).toBe(EXIT.ok)
    expect(byDefault.out).toBe('null\n')
    const missing = await run(dir, env, 'config', 'get', 'repair.nope')
    expect(missing.code).toBe(EXIT.error)
    expect(missing.err).toContain('no value for repair.nope')
    expect((await run(dir, env, 'config', 'set', 'repair.agent', 'pi')).code).toBe(EXIT.ok)
    expect((await run(dir, env, 'config', 'get', 'repair.agent')).out).toBe('"pi"\n')
  })

  test('an unknown key is a usage error naming the keys that would resolve', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'config', 'set', 'strategee', 'merge')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain('strategee')
  })

  test('a broken config file exits 14 for config get', async () => {
    const { dir, env } = project()
    writeFileSync(join(dir, PR_UPDATE_CONFIG_FILE_NAME), 'pr_update:\n  strategy: sideways\n')
    expect((await run(dir, env, 'config', 'get', 'strategy')).code).toBe(CONFIG_INVALID_EXIT)
    // A set over an already-invalid file is the file's fault, not the command's.
    expect((await run(dir, env, 'config', 'set', 'max_failed_attempts', '3')).code).toBe(
      CONFIG_INVALID_EXIT,
    )
  })

  test('an unknown config subcommand is a usage error', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'config', 'bogus')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain("unknown command 'config bogus'")
  })
})
