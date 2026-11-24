/**
 * withoutRepositoryVars: a runner whose children ignore an inherited GIT_DIR
 * and the other variables that pick a repository.
 */

import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import {
  Git,
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
