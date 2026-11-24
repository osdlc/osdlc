/**
 * withoutRepositoryVars: a runner whose children ignore an inherited GIT_DIR
 * and the other variables that pick a repository. hooksOffEnv: hooks off,
 * whatever config the environment brings.
 */

import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  Git,
  hooksOffEnv,
  REPOSITORY_VARS,
  spawnRunner,
  withoutRepositoryVars,
  type CommandRunner,
} from '../src/index.ts'
import { IDENTITY, makeGitFixture } from '../src/testing.ts'

let scratch: string
/**
 * git reads no config but the repositories' own, so a developer's global hooks or `insteadOf`
 * cannot change what a test sees: given to the fixtures, and to the run as a whole.
 */
let isolated: Record<string, string>
beforeEach(() => {
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'typed-git-repo-vars-')))
  const empty = join(scratch, 'empty.gitconfig')
  writeFileSync(empty, '')
  isolated = { GIT_CONFIG_GLOBAL: empty, GIT_CONFIG_NOSYSTEM: '1' }
  for (const [name, value] of Object.entries(isolated)) vi.stubEnv(name, value)
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(scratch, { recursive: true, force: true })
})

describe('withoutRepositoryVars', () => {
  test('unsets every variable that picks a repository, and keeps what the call sets', () => {
    const seen: (Record<string, string | undefined> | undefined)[] = []
    const runner: CommandRunner = {
      binary: 'git',
      run(_args, opts) {
        seen.push(opts.env)
        return { exitCode: 0, stdout: '', stderr: '' }
      },
    }
    const wrapped = withoutRepositoryVars(runner)
    expect(wrapped.binary).toBe('git')
    wrapped.run(['status'], { cwd: '/', env: { GIT_CEILING_DIRECTORIES: '/srv', LC_ALL: 'C' } })
    expect(seen).toEqual([
      {
        GIT_DIR: undefined,
        GIT_WORK_TREE: undefined,
        GIT_COMMON_DIR: undefined,
        GIT_INDEX_FILE: undefined,
        GIT_OBJECT_DIRECTORY: undefined,
        GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
        GIT_CEILING_DIRECTORIES: '/srv',
        LC_ALL: 'C',
      },
    ])
    expect([...REPOSITORY_VARS].sort()).toEqual(
      Object.keys(seen[0]!)
        .filter((k) => k !== 'LC_ALL')
        .sort(),
    )
  })

  test('git run through it answers for the directory it runs in, not an inherited GIT_DIR', () => {
    const identity = { ...IDENTITY, ...isolated }
    const mine = makeGitFixture({ dir: join(scratch, 'mine'), identity })
    mine.commit('mine', { 'm.txt': 'm' })
    const other = makeGitFixture({ dir: join(scratch, 'other'), identity })
    other.commit('other', { 'o.txt': 'o' })
    vi.stubEnv('GIT_DIR', join(other.dir, '.git'))
    const plain = new Git(mine.dir, { runner: spawnRunner('git') }).revParse('HEAD')
    const cleared = new Git(mine.dir, { runner: withoutRepositoryVars() }).revParse('HEAD')
    vi.stubEnv('GIT_DIR', undefined)
    expect(plain).toBe(other.git.revParse('HEAD'))
    expect(cleared).toBe(mine.git.revParse('HEAD'))
  })
})

describe('hooksOffEnv', () => {
  test('appends to the inherited GIT_CONFIG_* pairs and GIT_CONFIG_PARAMETERS', () => {
    expect(hooksOffEnv({})).toEqual({
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '/dev/null',
      GIT_CONFIG_PARAMETERS: "'core.hookspath'='/dev/null'",
    })
    expect(
      hooksOffEnv({ GIT_CONFIG_COUNT: '2', GIT_CONFIG_PARAMETERS: " 'core.hookspath'='.husky' " }),
    ).toEqual({
      GIT_CONFIG_COUNT: '3',
      GIT_CONFIG_KEY_2: 'core.hooksPath',
      GIT_CONFIG_VALUE_2: '/dev/null',
      GIT_CONFIG_PARAMETERS: "'core.hookspath'='.husky' 'core.hookspath'='/dev/null'",
    })
  })

  test("beats a relative core.hooksPath from the repository, the GIT_CONFIG_* pairs and a parent git's -c", () => {
    const fixture = makeGitFixture({
      dir: join(scratch, 'repo'),
      identity: { ...IDENTITY, ...isolated },
    })
    fixture.commit('one', { 'a.txt': 'a' })
    fixture.git.rawChecked(['branch', 'other'])
    const marker = join(scratch, 'ran')
    mkdirSync(join(fixture.dir, '.husky'))
    const hook = join(fixture.dir, '.husky', 'post-checkout')
    // A redirection, not `touch`: it needs no PATH.
    writeFileSync(hook, `#!/bin/sh\n: > '${marker}'\n`)
    chmodSync(hook, 0o755)
    const checkout = (env: Record<string, string>, into: string) => {
      const res = spawnRunner('git').run(['checkout', '-q', into], { cwd: fixture.dir, env })
      expect(res.stderr).toBe('')
      const ran = existsSync(marker)
      rmSync(marker, { force: true })
      return ran
    }
    // What a git alias or hook started as `git -c core.hooksPath=.husky` passes on.
    const inherited = {
      GIT_CONFIG_PARAMETERS: "'core.hooksPath'='.husky'",
      GIT_CONFIG_COUNT: '1',
      GIT_CONFIG_KEY_0: 'core.hooksPath',
      GIT_CONFIG_VALUE_0: '.husky',
    }
    // The control: the hook runs.
    expect(checkout(inherited, 'other')).toBe(true)
    expect(checkout({ ...inherited, ...hooksOffEnv(inherited) }, 'main')).toBe(false)
    fixture.git.rawChecked(['config', 'core.hooksPath', '.husky'])
    expect(checkout({}, 'other')).toBe(true)
    expect(checkout(hooksOffEnv({}), 'main')).toBe(false)
  })
})
