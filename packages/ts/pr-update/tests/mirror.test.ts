/**
 * The managed clone's parts on their own: where clones go and who consents, the directory
 * check, the clone steps with git and gh as seams, the lock, and the machine-file write race.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { osdlcDirs } from '@osdlc/ecosystem'
import { claimLock, releaseLock } from '@osdlc/file-lock'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { machineConfigSchema, machineFile, prUpdatePaths } from '../src/machine.ts'
import {
  CLONE_MARKER,
  CLONE_STAMP,
  CloneError,
  MIRROR_MARKER,
  MirrorDirError,
  checkMirrorDir,
  claimCloneLock,
  clonePath,
  cloneLockPath,
  makeClone,
  managedClones,
  markMirrorDir,
  mirrorSetting,
  writeMirrorAnswer,
} from '../src/mirror.ts'
import { isolatedEnv } from './support.ts'

let scratch: string
let source: string

beforeEach(() => {
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'pr-update-mirror-')))
  const work = makeGitFixture({ dir: join(scratch, 'work') })
  work.commit('base', { 'a.txt': 'a' })
  work.git.rawChecked(['branch', 'topic'])
  source = join(scratch, 'source.git')
  spawnRunner('git').run(['clone', '-q', '--bare', work.dir, source], { cwd: scratch })
})
afterEach(() => rmSync(scratch, { recursive: true, force: true }))

const machine = (raw: Record<string, unknown> = {}) => machineConfigSchema.parse(raw)

describe('mirrorSetting', () => {
  const home = '/home/me'
  const env = { OSDLC_ROOT: '/osdlc', HOME: home }

  test('with nothing set there is no consent, and clones go to repos/ in the cache directory', () => {
    // OSDLC_ROOT and the home variables move the directory; they are not consent.
    expect(mirrorSetting({ env, machine: machine(), home })).toEqual({
      consent: null,
      dir: prUpdatePaths(osdlcDirs({ env, home })).repos,
      from: 'default',
    })
  })

  test('the machine file gives consent and the directory, ~/ expanded', () => {
    expect(
      mirrorSetting({ env, machine: machine({ checkout: 'mirror', mirror_dir: '~/c' }), home }),
    ).toEqual({ consent: 'mirror', dir: join(home, 'c'), from: 'machine' })
  })

  test('PR_UPDATE_MIRROR_DIR beats mirror_dir and checkout: local', () => {
    const local = machine({ checkout: 'local', mirror_dir: '/m' })
    expect(
      mirrorSetting({ env: { ...env, PR_UPDATE_MIRROR_DIR: '/e' }, machine: local, home }),
    ).toEqual({ consent: 'mirror', dir: '/e', from: 'env' })
  })

  test('--mirror-dir beats the variable, mirror_dir and checkout: local', () => {
    const local = machine({ checkout: 'local', mirror_dir: '/m' })
    expect(
      mirrorSetting({
        flag: '/f',
        env: { ...env, PR_UPDATE_MIRROR_DIR: '/e' },
        machine: local,
        home,
      }),
    ).toEqual({ consent: 'mirror', dir: '/f', from: 'flag' })
  })

  test('an empty PR_UPDATE_MIRROR_DIR is unset; a relative one is refused', () => {
    expect(
      mirrorSetting({ env: { ...env, PR_UPDATE_MIRROR_DIR: ' ' }, machine: machine(), home })
        .consent,
    ).toBeNull()
    expect(() =>
      mirrorSetting({ env: { ...env, PR_UPDATE_MIRROR_DIR: 'rel' }, machine: machine(), home }),
    ).toThrow(MirrorDirError)
  })
})

describe('checkMirrorDir and markMirrorDir', () => {
  test('a missing, an empty and a marked directory pass; marking twice is fine', () => {
    const dir = join(scratch, 'clones')
    checkMirrorDir(dir)
    mkdirSync(dir)
    checkMirrorDir(dir)
    markMirrorDir(dir)
    markMirrorDir(dir)
    writeFileSync(join(dir, 'other'), '')
    checkMirrorDir(dir)
    expect(readdirSync(dir).sort()).toEqual([MIRROR_MARKER, 'other'])
  })

  test('a file, a directory with others’ files, and one inside a git checkout are refused', () => {
    writeFileSync(join(scratch, 'file'), '')
    expect(() => checkMirrorDir(join(scratch, 'file'))).toThrow('is not a directory')
    mkdirSync(join(scratch, 'full'))
    writeFileSync(join(scratch, 'full', 'x'), '')
    expect(() => checkMirrorDir(join(scratch, 'full'))).toThrow('did not put there')
    expect(() => checkMirrorDir(join(scratch, 'work', 'deep', 'clones'))).toThrow(
      'is inside a git repository',
    )
    expect(() => checkMirrorDir(join(source, 'clones'))).toThrow('is inside a git repository')
    expect(existsSync(join(scratch, 'work', 'deep'))).toBe(false)
  })
})

/** A gh whose `repo clone` makes a bare clone of `source`. */
const gh: CommandRunner = {
  run: (argv, opts) => {
    if (argv[0] !== 'repo' || argv[1] !== 'clone') return { exitCode: 1, stdout: '', stderr: '?' }
    return spawnRunner('git').run(['clone', '-q', '--bare', source, argv[3]!], opts)
  },
}

/** git that fails any call whose argv holds `word`, and otherwise runs with `env` added. */
function gitFailing(word: string | null, env: Record<string, string> = {}): CommandRunner {
  const real = spawnRunner('git')
  return {
    run: (argv, opts) =>
      word !== null && (argv[0] === word || argv.some((a) => a.startsWith(word)))
        ? { exitCode: 1, stdout: '', stderr: `fatal: no ${word} today` }
        : real.run(argv, { ...opts, env: { ...env, ...opts?.env } }),
  }
}

const req = { host: 'github.com', owner: 'acme', name: 'api', ghHost: 'github.com' }

describe('makeClone', () => {
  test("writes the credential helper in the clone's own config only: global and system config are untouched", () => {
    const global = join(scratch, 'global.gitconfig')
    const system = join(scratch, 'system.gitconfig')
    writeFileSync(global, '[user]\n\tname = Someone\n')
    writeFileSync(system, '[core]\n\tautocrlf = false\n')
    const isolation = {
      GIT_CONFIG_GLOBAL: global,
      GIT_CONFIG_SYSTEM: system,
      GIT_CONFIG_NOSYSTEM: '0',
    }
    const final = clonePath(join(scratch, 'clones'), req)
    mkdirSync(dirname(final), { recursive: true })
    makeClone(final, req, { gh, git: gitFailing(null, isolation) })

    expect(readFileSync(global, 'utf8')).toBe('[user]\n\tname = Someone\n')
    expect(readFileSync(system, 'utf8')).toBe('[core]\n\tautocrlf = false\n')
    const own = spawnRunner('git').run(
      [
        'config',
        '--file',
        join(final, 'config'),
        '--get-all',
        'credential.https://github.com.helper',
      ],
      { cwd: scratch },
    )
    expect(own.stdout).toBe('\n!gh auth git-credential\n')
    // The helper is seen only in the clone.
    const outside = spawnRunner('git').run(
      ['config', '--get-all', 'credential.https://github.com.helper'],
      { cwd: scratch, env: isolation },
    )
    expect(outside.exitCode).toBe(1)
    expect(existsSync(join(final, CLONE_MARKER))).toBe(true)
    expect(existsSync(join(final, CLONE_STAMP))).toBe(true)
    const refs = spawnRunner('git').run(['for-each-ref', '--format=%(refname)'], { cwd: final })
    // No branch of its own: only origin/*, with origin/HEAD when this git writes one.
    expect(
      refs.stdout
        .trim()
        .split('\n')
        .filter((r) => r !== 'refs/remotes/origin/HEAD')
        .sort(),
    ).toEqual(['refs/remotes/origin/main', 'refs/remotes/origin/topic'])
  })

  test.each([
    ['credential.', 'set the credential helper'],
    ['core.longpaths', 'set core.longpaths'],
    ['fetch', 'fetch into origin/*'],
    ['update-ref', 'fetch into origin/*'],
  ])(
    'a step whose git call (%s) fails names the step and removes the temporary directory',
    (word, step) => {
      const final = clonePath(join(scratch, 'clones'), req)
      mkdirSync(dirname(final), { recursive: true })
      let thrown: unknown
      try {
        makeClone(final, req, { gh, git: gitFailing(word) })
      } catch (e) {
        thrown = e
      }
      expect(thrown).toBeInstanceOf(CloneError)
      expect((thrown as Error).message.startsWith(`${step}: `)).toBe(true)
      expect((thrown as Error).message).toContain(`fatal: no ${word} today`)
      expect(readdirSync(dirname(final))).toEqual([])
    },
  )

  test('a credential key keeps the port of a host that has one', () => {
    const ported = { ...req, ghHost: 'ghe.example:8443' }
    const final = clonePath(join(scratch, 'clones'), ported)
    mkdirSync(dirname(final), { recursive: true })
    makeClone(final, ported, { gh })
    const own = spawnRunner('git').run(
      [
        'config',
        '--file',
        join(final, 'config'),
        '--get-all',
        'credential.https://ghe.example:8443.helper',
      ],
      { cwd: scratch },
    )
    expect(own.stdout).toBe('\n!gh auth git-credential\n')
  })
})

describe('claimCloneLock', () => {
  test('a lock another live run holds is not taken, after waiting; a dead holder’s is', () => {
    const lock = join(scratch, 'api.git.lock')
    const live = claimLock(lock, { holder: { pid: process.pid } }, { isStale: () => false })
    expect(live.ok).toBe(true)
    const started = Date.now()
    expect(claimCloneLock(lock, 300)).toBeNull()
    expect(Date.now() - started).toBeGreaterThanOrEqual(280)
    releaseLock(lock, (live as { token: string }).token)

    // A pid no process has: the holder is gone.
    claimLock(lock, { holder: { pid: 2 ** 22 + 7 } }, { isStale: () => false })
    const token = claimCloneLock(lock, 0)
    expect(token).not.toBeNull()
    releaseLock(lock, token!)
  })
})

describe('managedClones: the lock update --apply holds', () => {
  test('provide holds it, added lets go, removing takes it again around the removal, close lets go', () => {
    const clone = clonePath(join(scratch, 'repos'), {
      host: 'github.com',
      owner: 'acme',
      name: 'api',
    })
    mkdirSync(clone, { recursive: true })
    writeFileSync(join(clone, CLONE_MARKER), '{}\n')
    const lock = cloneLockPath(clone)
    const gh: CommandRunner = {
      run: () => {
        throw new Error('gh is not called for a clone that exists')
      },
    }
    const clones = managedClones({
      env: isolatedEnv(scratch),
      cwd: scratch,
      apply: true,
      gh,
      notice: () => {},
      ask: { canPrompt: () => false, choose: () => 0, text: () => '' },
      waitMs: 0,
    })
    const target = {
      repo: 'acme/api',
      host: 'github.com',
      path: clone,
      source: 'clone' as const,
      remote: 'origin',
      found: null,
      github: true,
    }
    expect(clones.provide([target])).toEqual([target])
    expect(existsSync(lock)).toBe(true)
    expect(existsSync(join(clone, CLONE_STAMP))).toBe(true)
    clones.added(clone)
    expect(existsSync(lock)).toBe(false)
    let during: boolean | undefined
    clones.removing(clone, () => {
      during = existsSync(lock)
    })
    expect(during).toBe(true)
    expect(existsSync(lock)).toBe(false)
    // A clone whose group never reached `worktree add` is let go at the end of the run.
    clones.provide([target])
    expect(existsSync(lock)).toBe(true)
    clones.close()
    expect(existsSync(lock)).toBe(false)
  })
})

describe('writeMirrorAnswer', () => {
  const fileFor = () => machineFile({ env: isolatedEnv(join(scratch, 'env')) })

  test('keeps the comments and keys already there', () => {
    const file = fileFor()
    mkdirSync(dirname(file.path()), { recursive: true })
    writeFileSync(file.path(), '# my machine\nmirror_max_age_days: 5\n')
    expect(writeMirrorAnswer(file, { checkout: 'mirror', mirror_dir: '/c' })).toMatchObject({
      wrote: true,
      config: { checkout: 'mirror', mirror_dir: '/c', mirror_max_age_days: 5 },
    })
    expect(readFileSync(file.path(), 'utf8')).toBe(
      '# my machine\nmirror_max_age_days: 5\ncheckout: mirror\nmirror_dir: /c\n',
    )
  })

  test('a lost race with yield uses the answer that won, and writes nothing', () => {
    const file = fileFor()
    const before = file.read()
    mkdirSync(dirname(file.path()), { recursive: true })
    writeFileSync(file.path(), 'checkout: local\n')
    expect(writeMirrorAnswer(file, { checkout: 'mirror' }, { before, yield: true })).toMatchObject({
      wrote: false,
      config: { checkout: 'local' },
    })
    expect(readFileSync(file.path(), 'utf8')).toBe('checkout: local\n')
  })

  test('a lost race without yield, or to a write that set no checkout, writes again on the new file', () => {
    const file = fileFor()
    const before = file.read()
    mkdirSync(dirname(file.path()), { recursive: true })
    writeFileSync(file.path(), 'mirror_max_age_days: 3\n')
    expect(writeMirrorAnswer(file, { checkout: 'mirror' }, { before, yield: true })).toMatchObject({
      wrote: true,
      config: { checkout: 'mirror', mirror_max_age_days: 3 },
    })
    const again = file.read()
    writeFileSync(file.path(), 'checkout: local\n')
    expect(writeMirrorAnswer(file, { checkout: 'mirror' }, { before: again })).toMatchObject({
      wrote: true,
      config: { checkout: 'mirror' },
    })
  })
})
