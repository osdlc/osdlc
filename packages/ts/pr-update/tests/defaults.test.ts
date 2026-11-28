/** The standalone `Ports` built from a `PrUpdateConfig`. */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { absolutePathEntries, spawnRunner } from '@osdlc/command-seam'
import { osdlcDirs } from '@osdlc/ecosystem'
import { Git } from '@osdlc/typed-git'
import { tmpdir } from 'node:os'
import { delimiter, join } from 'node:path'

import { prUpdateConfigSchema, prUpdateStandaloneSchema } from '../src/config.ts'
import { commandRepair, refEnv, standalonePorts } from '../src/defaults.ts'
import { prUpdatePaths } from '../src/machine.ts'
import { listAttempts } from '../src/update/attempts.ts'
import type { RepairRequest } from '../src/ports.ts'
import { targetGitEnv, targetGitOptions } from '../src/update/execute.ts'
import { isolatedEnv } from './support.ts'

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'pr-update-repair-'))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const request = (): RepairRequest => ({
  kind: 'conflict',
  pr: 7,
  base: 'main',
  head: 'topic',
  worktree: dir,
  paths: ['a.ts', 'b.ts'],
  reason: 'unclaimed conflicts',
})

describe('commandRepair', () => {
  test('runs in the worktree with the request on stdin and in the environment', async () => {
    const repair = commandRepair('cat > req.json; echo "$PR_UPDATE_KIND #$PR_UPDATE_PR"')
    expect(await repair(request())).toEqual({ ok: true, note: 'conflict #7' })
    expect(JSON.parse(readFileSync(join(dir, 'req.json'), 'utf8'))).toEqual(request())
  })

  test('a rebase stop adds the commit being replayed to the environment', async () => {
    const repair = commandRepair(
      'echo "${PR_UPDATE_COMMIT-unset} ${PR_UPDATE_COMMIT_SUBJECT-unset} ${PR_UPDATE_ONTO-unset}"',
    )
    const replaying = { sha: 'abc123', subject: 'add a', onto: 'main' }
    expect(await repair({ ...request(), replaying })).toEqual({
      ok: true,
      note: 'abc123 add a main',
    })
    expect(await repair(request())).toEqual({ ok: true, note: 'unset unset unset' })
  })

  test('runs without an inherited GIT_DIR, which a git hook exports', async () => {
    vi.stubEnv('GIT_DIR', join(dir, 'elsewhere.git'))
    try {
      const repair = commandRepair('echo "${GIT_DIR-unset} ${GIT_WORK_TREE-unset}"')
      expect(await repair(request())).toEqual({ ok: true, note: 'unset unset' })
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test('a non-zero exit is a failed repair, with its last line as the note', async () => {
    const repair = commandRepair('echo trying; echo "cannot fix" >&2; exit 3')
    expect(await repair(request())).toEqual({ ok: false, note: 'trying' })
  })
})

describe('commandRepair timeout', () => {
  test('a command past repair.timeout_seconds is killed and reads as giving up', async () => {
    const repair = commandRepair('sleep 30', 1)
    const res = await repair(request())
    expect(res.ok).toBe(false)
  })
})

describe('standalonePorts', () => {
  test('no repair without a command', () => {
    expect(standalonePorts(prUpdateConfigSchema.parse({})).repair).toBeUndefined()
  })

  test('a configured command becomes the repair port', () => {
    const cfg = prUpdateConfigSchema.parse({ repair: { command: 'true' } })
    expect(cfg.repair.on).toEqual(['conflict'])
    expect(typeof standalonePorts(cfg).repair).toBe('function')
  })

  test("the project root's file attempts are its home's, in the state directory, not the checkout (one layout)", () => {
    const cfg = prUpdateConfigSchema.parse({})
    const env = isolatedEnv(join(dir, 'env'))
    const ports = standalonePorts(cfg, dir, 'origin', () => {}, { env })
    expect(ports.attempts).toBeUndefined()
    const home = ports.targetHome({
      host: 'github.com',
      owner: 'o',
      name: 'r',
      path: dir,
      source: 'root',
      remote: 'origin',
    })
    const paths = prUpdatePaths(osdlcDirs({ env }))
    expect(home.worktrees).toBe(join(paths.worktrees, 'github.com', 'o', 'r'))
    expect(home.kept).toBe(join(paths.kept, 'github.com', 'o', 'r'))
    const key = { repo: 'o/r', head: 'h', headOid: '1', base: 'main', baseOid: '2' }
    home.attempts!.recordFailure(key, 'boom')
    expect(listAttempts(join(paths.attempts, 'github.com', 'o', 'r'))).toHaveLength(1)
    expect(existsSync(join(dir, '.pr-update'))).toBe(false)
  })

  test('verify: test runs test_command', async () => {
    const cfg = prUpdateStandaloneSchema.parse({ verify: 'test', test_command: 'make test' })
    expect(
      await standalonePorts(cfg).resolveVerifyVerbs({
        which: 'test',
        trust: false,
        repo: 'o/r',
        checkout: '/repo',
      }),
    ).toEqual(['make test'])
  })

  test.each([undefined, null])('verify: test with test_command %p fails loudly', async (cmd) => {
    const cfg = prUpdateStandaloneSchema.parse({ verify: 'test', test_command: cmd })
    await expect(
      standalonePorts(cfg).resolveVerifyVerbs({
        which: 'test',
        trust: false,
        repo: 'o/r',
        checkout: '/repo',
      }),
    ).rejects.toThrow('verify: test needs test_command')
  })

  test('verify: check fails loudly even with test_command set', async () => {
    const cfg = prUpdateStandaloneSchema.parse({ verify: 'check', test_command: 'make test' })
    await expect(
      standalonePorts(cfg).resolveVerifyVerbs({
        which: 'check',
        trust: false,
        repo: 'o/r',
        checkout: '/repo',
      }),
    ).rejects.toThrow('verify: check has no meaning in a standalone run')
  })
})

describe("the config of a target's git calls (final review)", () => {
  /** What git reads for `key` in `cwd`, with `env` merged over the process environment. */
  const read = (cwd: string, env: Record<string, string>, key: string): string =>
    spawnRunner('git').run(['config', key], { cwd, env }).stdout.trim()

  test("keeps hooks and background maintenance off, over a parent git's -c", () => {
    spawnRunner('git').run(['init', '-q', dir], { cwd: dir })
    // What a git alias or hook started as `git -c gc.auto=1 -c maintenance.auto=true` passes on.
    vi.stubEnv(
      'GIT_CONFIG_PARAMETERS',
      "'gc.auto'='1' 'maintenance.auto'='true' 'core.hooksPath'='.husky'",
    )
    try {
      for (const env of [refEnv(dir, undefined), refEnv(join(dir, 'missing'), undefined)]) {
        expect(read(dir, env, 'gc.auto')).toBe('0')
        expect(read(dir, env, 'maintenance.auto')).toBe('false')
        expect(read(dir, env, 'core.hooksPath')).toBe('/dev/null')
      }
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test("PATH holds only the parent's absolute entries, and never comes out empty", () => {
    const abs = process.platform === 'win32' ? ['C:\\Git\\cmd', 'D:\\bin'] : ['/usr/bin', '/bin']
    const path = ['.', abs[0], '', 'bin', abs[1]].join(delimiter)
    expect(targetGitEnv({ PATH: path }).PATH).toBe(abs.join(delimiter))
    // Windows names it in any case.
    if (process.platform === 'win32') expect(targetGitEnv({ Path: path }).PATH).toBe(abs.join(';'))
    else expect(targetGitEnv({ PATH: `.${delimiter}bin` }).PATH).toBe('/usr/bin:/bin')
    expect('PATH' in targetGitEnv({})).toBe(false)
    for (const env of [refEnv(dir, undefined), targetGitOptions().env]) {
      expect(env.PATH).toBe(absolutePathEntries(process.env.PATH))
    }
  })

  test("a target's git client keeps background maintenance off, over a parent git's -c", () => {
    spawnRunner('git').run(['init', '-q', dir], { cwd: dir })
    vi.stubEnv('GIT_CONFIG_PARAMETERS', "'gc.auto'='1' 'maintenance.auto'='true'")
    try {
      const git = new Git(dir, targetGitOptions())
      expect(git.raw(['config', 'gc.auto']).stdout.trim()).toBe('0')
      expect(git.raw(['config', 'maintenance.auto']).stdout.trim()).toBe('false')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
