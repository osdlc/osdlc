/**
 * pr-update's directories under the osdlc root, and its machine file: where
 * it is, what it holds, and that a project file cannot set its keys.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { CONFIG_INVALID_EXIT, overlayPath } from '@osdlc/config-layers'
import { osdlcDirs } from '@osdlc/ecosystem'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { PR_UPDATE_CONFIG_FILE, main } from '../src/cli.ts'
import { MACHINE_CONFIG_ENV, machineFile, prUpdatePaths } from '../src/machine.ts'
import { FIXTURE_REMOTE, fakeTools, isolatedEnv } from './support.ts'

let root: string
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'pr-update-machine-')))
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(root, { recursive: true, force: true })
})

const rooted = () => osdlcDirs({ env: { OSDLC_ROOT: join(root, 'osdlc') } })

describe('prUpdatePaths', () => {
  test('every directory is pr-update under the osdlc root, in its home', () => {
    const r = join(root, 'osdlc')
    expect(prUpdatePaths(rooted())).toEqual({
      config: join(r, 'config', 'osdlc', 'pr-update'),
      cache: join(r, 'cache', 'osdlc', 'pr-update'),
      state: join(r, 'state', 'osdlc', 'pr-update'),
      repos: join(r, 'cache', 'osdlc', 'pr-update', 'repos'),
      worktrees: join(r, 'cache', 'osdlc', 'pr-update', 'worktrees'),
      kept: join(r, 'state', 'osdlc', 'pr-update', 'kept'),
      attempts: join(r, 'state', 'osdlc', 'pr-update', 'attempts'),
    })
  })

  test.skipIf(process.platform === 'win32')(
    'with no variable set, the Xdg defaults on Linux and macOS alike',
    () => {
      const home = join(root, 'home')
      const paths = prUpdatePaths(osdlcDirs({ env: { HOME: home } }))
      expect(paths.config).toBe(join(home, '.config', 'osdlc', 'pr-update'))
      expect(paths.cache).toBe(join(home, '.cache', 'osdlc', 'pr-update'))
      expect(paths.state).toBe(join(home, '.local', 'state', 'osdlc', 'pr-update'))
    },
  )
})

describe('machineFile', () => {
  const file = () => join(prUpdatePaths(rooted()).config, 'config.yaml')
  const write = (text: string): void => {
    mkdirSync(dirname(file()), { recursive: true })
    writeFileSync(file(), text)
  }

  test('is config.yaml in pr-update’s config directory', () => {
    expect(machineFile({ dirs: rooted }).path()).toBe(file())
  })

  test('with no file, checkout and mirror_dir are unset and the age is 30 days', () => {
    expect(machineFile({ dirs: rooted }).load()).toEqual({ mirror_max_age_days: 30 })
  })

  test('reads every key, and allows an age of 0', () => {
    write('checkout: mirror\nmirror_dir: /srv/clones\nmirror_max_age_days: 0\n')
    expect(machineFile({ dirs: rooted }).load()).toEqual({
      checkout: 'mirror',
      mirror_dir: '/srv/clones',
      mirror_max_age_days: 0,
    })
  })

  test('reports an unknown key and an invalid value, and keeps the rest', () => {
    write('checkout: sometimes\nmirror_dirs: /x\nmirror_max_age_days: 7\n')
    const { value, issues } = machineFile({ dirs: rooted }).loadWithIssues()
    expect(value).toEqual({ mirror_max_age_days: 7 })
    expect(issues.map((i) => [i.code, i.path.join('.')])).toEqual(
      expect.arrayContaining([
        ['unknown_key', 'mirror_dirs'],
        ['invalid', 'checkout'],
      ]),
    )
  })

  test(`${MACHINE_CONFIG_ENV} moves the file`, () => {
    const moved = join(root, 'elsewhere.yaml')
    writeFileSync(moved, 'checkout: local\n')
    vi.stubEnv(MACHINE_CONFIG_ENV, moved)
    const handle = machineFile({ dirs: rooted })
    expect(handle.path()).toBe(moved)
    expect(handle.load().checkout).toBe('local')
  })

  test(`a relative ${MACHINE_CONFIG_ENV} is refused before anything is read or written`, () => {
    vi.stubEnv(MACHINE_CONFIG_ENV, 'machine.yaml')
    const handle = machineFile({ dirs: rooted })
    const refused = `${MACHINE_CONFIG_ENV} must be an absolute path to the file; it is 'machine.yaml'`
    expect(() => handle.path()).toThrow(refused)
    expect(() => handle.load()).toThrow(refused)
    expect(() => handle.write('checkout: local\n')).toThrow(refused)
  })
})

describe('a project file cannot set a machine key', () => {
  function project(name: string, text: string): string {
    const repo = makeGitFixture({ dir: join(root, 'p') })
    repo.commit('init', { 'a.txt': 'a' })
    repo.git.remoteAdd('origin', FIXTURE_REMOTE)
    writeFileSync(join(repo.dir, name), text)
    return repo.dir
  }
  async function survey(dir: string): Promise<{ code: number; err: string }> {
    const ctx = captureContext({ cwd: dir, env: isolatedEnv(join(root, 'env')) })
    const code = await main(['survey', '--no-fetch'], ctx, fakeTools)
    return { code, err: ctx.io.err }
  }

  test.each([['checkout: mirror'], ['mirror_dir: /srv/clones'], ['mirror_max_age_days: 1']])(
    '`%s` in the pr_update block is an unknown key',
    async (line) => {
      const dir = project(PR_UPDATE_CONFIG_FILE.name, `pr_update:\n  ${line}\n`)
      const r = await survey(dir)
      expect(r.code).toBe(CONFIG_INVALID_EXIT)
      expect(r.err).toContain(line.split(':')[0])
    },
  )

  test('nor can its local overlay', async () => {
    const dir = project(overlayPath(PR_UPDATE_CONFIG_FILE.name), 'pr_update:\n  checkout: mirror\n')
    expect((await survey(dir)).code).toBe(CONFIG_INVALID_EXIT)
  })

  test('at the top level it is another tool’s key, and ignored', async () => {
    const dir = project(PR_UPDATE_CONFIG_FILE.name, 'checkout: mirror\nmirror_dir: /srv/clones\n')
    expect((await survey(dir)).code).toBe(EXIT.ok)
  })
})
