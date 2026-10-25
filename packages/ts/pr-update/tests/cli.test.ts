import { afterAll, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { isatty } from 'node:tty'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { overlayPath } from '@osdlc/config-layers'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { PR_UPDATE_CONFIG_FILE, main } from '../src/cli.ts'
import { FIXTURE_REMOTE, fakeTools } from './support.ts'

const PR_UPDATE_CONFIG_FILE_NAME = PR_UPDATE_CONFIG_FILE.name

const LOCAL_FILE_NAME = overlayPath(PR_UPDATE_CONFIG_FILE_NAME)

/** An explicit environment: no ambient PR_UPDATE_CONFIG, trust state in a temp dir. */
function isolatedEnv(root: string): Record<string, string> {
  return { PATH: process.env.PATH ?? '', XDG_STATE_HOME: join(root, 'state') }
}

describe('pr-update update --confirm-push', () => {
  // Not a repository: a run that got past the checks would fail loudly. `--repo`
  // spares the run its local remote, and `fakeTools` its real tool lookup.
  const cwd = mkdtempSync(join(tmpdir(), 'pr-update-cli-'))
  afterAll(() => rmSync(cwd, { recursive: true, force: true }))

  test('--confirm-push without --apply is a usage error', async () => {
    const ctx = captureContext({ cwd, env: isolatedEnv(cwd) })
    expect(await main(['update', '--confirm-push', '--repo', 'o/r'], ctx, fakeTools)).toBe(
      EXIT.usage,
    )
    expect(ctx.io.err).toContain('--confirm-push needs --apply')
  })

  test.skipIf(isatty(0))('without a terminal on stdin is a usage error', async () => {
    const ctx = captureContext({ cwd, env: isolatedEnv(cwd) })
    expect(
      await main(['update', '--confirm-push', '--apply', '--repo', 'o/r'], ctx, fakeTools),
    ).toBe(EXIT.usage)
    expect(ctx.io.err).toContain('needs a terminal')
  })
})

describe('pr-update update with verify: test', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  /** Its own repo (a github origin, with a faked `gh` that lists no PRs) holding `config`. */
  function project(config: string): { dir: string; env: Record<string, string> } {
    const repo = makeGitFixture({ dir: mkdtempSync(join(tmpdir(), 'pr-update-cli-test-')) })
    dirs.push(repo.dir)
    repo.commit('init', { 'a.txt': 'a' })
    repo.git.remoteAdd('origin', FIXTURE_REMOTE)
    writeFileSync(join(repo.dir, LOCAL_FILE_NAME), config)
    return { dir: repo.dir, env: isolatedEnv(repo.dir) }
  }

  test('accepts test_command as the verify list', async () => {
    const { dir, env } = project('pr_update:\n  verify: test\n  test_command: make test\n')
    expect(await main(['update'], captureContext({ cwd: dir, env }), fakeTools)).toBe(EXIT.ok)
  })

  test('without test_command fails before touching any PR', async () => {
    const { dir, env } = project('pr_update:\n  verify: test\n  test_command: null\n')
    await expect(main(['update'], captureContext({ cwd: dir, env }), fakeTools)).rejects.toThrow(
      'verify: test needs test_command',
    )
  })
})

describe('pr-update update --report', () => {
  const dirs: string[] = []
  afterAll(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function project(config: string): { dir: string; env: Record<string, string> } {
    const repo = makeGitFixture({ dir: mkdtempSync(join(tmpdir(), 'pr-update-cli-report-')) })
    dirs.push(repo.dir)
    repo.commit('init', { 'a.txt': 'a' })
    repo.git.remoteAdd('origin', FIXTURE_REMOTE)
    writeFileSync(join(repo.dir, LOCAL_FILE_NAME), config)
    return { dir: repo.dir, env: isolatedEnv(repo.dir) }
  }

  test('a run that throws replaces the previous report with an error report', async () => {
    const { dir, env } = project('pr_update:\n  verify: test\n  test_command: null\n')
    const file = join(dir, 'out.json')
    writeFileSync(file, '{"stale":true}')
    await expect(
      main(['update', '--report', file], captureContext({ cwd: dir, env }), fakeTools),
    ).rejects.toThrow('verify: test needs test_command')
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      error: expect.stringContaining('verify: test needs test_command'),
    })
  })

  test('a refusal before the run leaves no stale report', async () => {
    const { dir, env } = project('')
    const file = join(dir, 'out.json')
    writeFileSync(file, '{"stale":true}')
    const ctx = captureContext({ cwd: dir, env })
    const argv = ['update', '--repair-agent', 'claude', '--repair-command', 'x', '--report', file]
    expect(await main(argv, ctx)).toBe(EXIT.usage)
    expect(existsSync(file)).toBe(false)
  })
})

describe('pr-update usage errors', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pr-update-cli-usage-'))
  afterAll(() => rmSync(cwd, { recursive: true, force: true }))

  async function run(...argv: string[]) {
    return runIn(cwd, ...argv)
  }
  async function runIn(dir: string, ...argv: string[]) {
    const ctx = captureContext({ cwd: dir, env: isolatedEnv(cwd) })
    const code = await main(argv, ctx, fakeTools)
    return { code, out: ctx.io.out, err: ctx.io.err }
  }

  test('a non-integer --limit or --pr is refused', async () => {
    const limit = await run('survey', '--limit', 'abc')
    expect(limit.code).toBe(EXIT.usage)
    expect(limit.err).toContain("--limit must be an integer, got 'abc'")
    const pr = await run('update', '--pr', '1.5')
    expect(pr.code).toBe(EXIT.usage)
    expect(pr.err).toContain("--pr must be an integer, got '1.5'")
  })

  test('an unknown command is a usage error', async () => {
    const r = await run('frobnicate')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain("unknown command 'frobnicate'")
  })

  test('trust takes no arguments, and says so the second time it is run', async () => {
    const repo = makeGitFixture({ dir: mkdtempSync(join(cwd, 'repo-')) })
    repo.commit('init', { 'a.txt': 'a' })
    const extra = await runIn(repo.dir, 'trust', 'x')
    expect(extra.code).toBe(EXIT.usage)
    expect(extra.err).toContain('takes no arguments')
    expect((await runIn(repo.dir, 'trust')).out).toMatch(/^trusted: /)
    expect((await runIn(repo.dir, 'trust')).out).toMatch(/^already trusted: /)
  })
})
