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
  chmodSync,
  rmSync,
  statSync,
  symlinkSync,
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
  checkClone,
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

describe('managedClones: the locks update holds', () => {
  const repos = () => join(scratch, 'repos')
  /** A clone of acme/<name> that pr-update made, as a target the survey found. */
  const existing = (name: string) => {
    const clone = clonePath(repos(), { host: 'github.com', owner: 'acme', name })
    mkdirSync(clone, { recursive: true })
    writeFileSync(join(clone, CLONE_MARKER), '{}\n')
    return {
      repo: `acme/${name}`,
      host: 'github.com',
      path: clone,
      source: 'clone' as const,
      remote: 'origin',
      found: null,
      github: true,
    }
  }
  const gh: CommandRunner = {
    run: () => {
      throw new Error('gh is not called for a clone that exists')
    },
  }
  const run = (extra: Partial<Parameters<typeof managedClones>[0]> = {}) =>
    managedClones({
      env: isolatedEnv(scratch),
      cwd: scratch,
      apply: true,
      gh,
      notice: () => {},
      ask: { canPrompt: () => false, choose: () => 0, text: () => '' },
      waitMs: 0,
      ...extra,
    })

  test('provide holds it, release lets go, removing takes it again around the removal, close lets go', () => {
    const target = existing('api')
    const clone = target.path
    const lock = cloneLockPath(clone)
    const clones = run()
    expect(clones.provide([target], { apply: true })).toEqual([target])
    expect(existsSync(lock)).toBe(true)
    expect(existsSync(join(clone, CLONE_STAMP))).toBe(true)
    clones.release(clone)
    expect(existsSync(lock)).toBe(false)
    let during: boolean | undefined
    const removed = clones.removing(clone, { path: join(scratch, 'wt'), kind: 'run' }, () => {
      during = existsSync(lock)
    })
    expect(removed).toBe(true)
    expect(during).toBe(true)
    expect(existsSync(lock)).toBe(false)
    // A clone whose group never reached `worktree add` is let go at the end of the run.
    clones.provide([target], { apply: true })
    expect(existsSync(lock)).toBe(true)
    clones.close()
    expect(existsSync(lock)).toBe(false)
  })

  test('locks are taken in sorted path order, whatever order the targets come in', () => {
    const api = existing('api')
    const web = existing('web')
    for (const order of [
      [web, api],
      [api, web],
    ]) {
      const claimed: string[] = []
      const clones = run({
        claim: (path, wait) => {
          claimed.push(path)
          return claimCloneLock(path, wait)
        },
      })
      clones.provide(order, { apply: true })
      expect(claimed).toEqual([cloneLockPath(api.path), cloneLockPath(web.path)])
      clones.close()
    }
  })

  test('given the same clones in opposite orders, neither run is kept busy by the other’s idle one', () => {
    const api = existing('api')
    const web = existing('web')
    // Run one updates api and has nothing to do in web; run two the other way round.
    const one = run()
    expect(one.provide([api, web], { apply: true }).every((t) => t.unserved === undefined)).toBe(
      true,
    )
    one.release(web.path) // idle: let go as soon as update knows
    one.release(api.path) // its worktree is added
    // While run one works in api, run two takes both.
    const two = run()
    const served = two.provide([web, api], { apply: true })
    expect(served.map((t) => t.unserved)).toEqual([undefined, undefined])
    two.close()
    one.close()
  })

  test('a rehearsal holds the lock too, without waiting: a busy clone is skipped as mirror busy', () => {
    const api = existing('api')
    const lock = cloneLockPath(api.path)
    const other = claimLock(lock, { holder: { pid: process.pid } }, { isStale: () => false })
    expect(other.ok).toBe(true)
    const waits: number[] = []
    const notes: string[] = []
    const clones = run({
      waitMs: 60_000,
      notice: (line) => notes.push(line),
      claim: (path, wait) => {
        waits.push(wait)
        return claimCloneLock(path, wait)
      },
    })
    const [busy] = clones.provide([api], { apply: false })
    expect(waits).toEqual([0])
    expect(busy).toMatchObject({
      path: null,
      source: null,
      unserved: expect.stringMatching(/^mirror busy: /),
    })
    expect(notes).toEqual([`github.com/acme/api: mirror busy: another pr-update run holds ${lock}`])
    releaseLock(lock, (other as { token: string }).token)

    // Free, it is held through the rehearsal's worktree add, and taken again, without waiting,
    // to remove it.
    const [held] = clones.provide([api], { apply: false })
    expect(held).toEqual(api)
    expect(existsSync(lock)).toBe(true)
    clones.release(api.path)
    expect(clones.removing(api.path, { path: join(scratch, 'wt'), kind: 'run' }, () => {})).toBe(
      true,
    )
    expect(waits).toEqual([0, 0, 0])
    expect(existsSync(lock)).toBe(false)
  })
})

describe('managedClones: taking a lock back to remove a worktree (review round 2)', () => {
  const repos = () => join(scratch, 'repos')
  const existing = (name: string) => {
    const clone = clonePath(repos(), { host: 'github.com', owner: 'acme', name })
    mkdirSync(clone, { recursive: true, mode: 0o755 })
    writeFileSync(join(clone, CLONE_MARKER), '{}\n')
    return {
      repo: `acme/${name}`,
      host: 'github.com',
      path: clone,
      source: 'clone' as const,
      remote: 'origin',
      found: null,
      github: true,
    }
  }
  const setup = (waitMs: number) => {
    const waits: number[] = []
    const notes: string[] = []
    const clones = managedClones({
      env: isolatedEnv(scratch),
      cwd: scratch,
      apply: true,
      gh: { run: () => ({ exitCode: 1, stdout: '', stderr: 'no gh here' }) } as CommandRunner,
      notice: (line) => notes.push(line),
      ask: { canPrompt: () => false, choose: () => 0, text: () => '' },
      waitMs,
      claim: (path, wait) => {
        waits.push(wait)
        return claimCloneLock(path, wait)
      },
    })
    return { clones, waits, notes }
  }
  /** Another run takes `clone`'s lock; the token releases it. */
  const otherRun = (clone: string): string => {
    const got = claimLock(
      cloneLockPath(clone),
      { holder: { pid: process.pid } },
      { isStale: () => false },
    )
    expect(got.ok).toBe(true)
    return (got as { token: string }).token
  }

  test('holding another clone, a busy retake does not wait, and leaves the worktree with a note', () => {
    const api = existing('api')
    const web = existing('web')
    const { clones, waits, notes } = setup(60_000)
    clones.provide([api, web], { apply: true })
    clones.release(api.path) // api's worktree is added; web's turn has not come
    const token = otherRun(api.path)
    waits.length = 0
    let ran = false
    const worktree = join(scratch, 'worktrees', 'run')
    const started = Date.now()
    expect(clones.removing(api.path, { path: worktree, kind: 'run' }, () => (ran = true))).toBe(
      false,
    )
    expect(Date.now() - started).toBeLessThan(5_000)
    expect(waits).toEqual([0])
    expect(ran).toBe(false)
    expect(notes).toEqual([
      `${worktree} is left, because another run holds its clone (${cloneLockPath(api.path)}); the next run in this clone, or \`pr-update mirror prune\`, removes it`,
    ])
    releaseLock(cloneLockPath(api.path), token)
    clones.close()
  })

  test('holding no other clone, a retake waits; when the wait times out the worktree is left too', () => {
    const api = existing('api')
    const { clones, waits, notes } = setup(300)
    clones.provide([api], { apply: true })
    clones.release(api.path)
    const token = otherRun(api.path)
    waits.length = 0
    let ran = false
    const started = Date.now()
    expect(
      clones.removing(api.path, { path: join(scratch, 'wt'), kind: 'run' }, () => (ran = true)),
    ).toBe(false)
    expect(Date.now() - started).toBeGreaterThanOrEqual(280)
    expect(waits).toEqual([300])
    expect(ran).toBe(false)
    expect(notes[0]).toContain(
      'the next run in this clone, or `pr-update mirror prune`, removes it',
    )
    releaseLock(cloneLockPath(api.path), token)

    // Free again, it is taken back, the removal runs, and it is let go.
    expect(
      clones.removing(api.path, { path: join(scratch, 'wt'), kind: 'run' }, () => (ran = true)),
    ).toBe(true)
    expect(ran).toBe(true)
    expect(existsSync(cloneLockPath(api.path))).toBe(false)
  })

  test('a kept worktree left behind is named as kept, with --discard-kept as the way to remove it', () => {
    const api = existing('api')
    const { clones, notes } = setup(60_000)
    const token = otherRun(api.path)
    const kept = join(scratch, 'kept', 'github.com', 'acme', 'api', '7')
    let ran = false
    expect(clones.removing(api.path, { path: kept, kind: 'kept' }, () => (ran = true))).toBe(false)
    expect(ran).toBe(false)
    expect(notes).toEqual([
      `the kept worktree ${kept} is left in place, because another run holds its clone (${cloneLockPath(api.path)}); run with --discard-kept again to remove it`,
    ])
    releaseLock(cloneLockPath(api.path), token)
  })

  test('a lock the run still holds is used as it is, and kept', () => {
    const api = existing('api')
    const { clones, waits } = setup(60_000)
    clones.provide([api], { apply: true })
    waits.length = 0
    let during = false
    expect(
      clones.removing(
        api.path,
        { path: join(scratch, 'kept'), kind: 'kept' },
        () => (during = existsSync(cloneLockPath(api.path))),
      ),
    ).toBe(true)
    expect(during).toBe(true)
    expect(waits).toEqual([])
    // Still held, for the worktree add to come.
    expect(existsSync(cloneLockPath(api.path))).toBe(true)
    clones.close()
    expect(existsSync(cloneLockPath(api.path))).toBe(false)
  })
})

describe('the folders between the clone directory and a clone (review round 2)', () => {
  const root = () => join(scratch, 'repos')
  const made = () => {
    markMirrorDir(root())
    const clone = clonePath(root(), { host: 'github.com', owner: 'acme', name: 'api' })
    mkdirSync(clone, { recursive: true, mode: 0o755 })
    writeFileSync(join(clone, CLONE_MARKER), '{}\n')
    return clone
  }
  const posix = process.platform !== 'win32'
  const fix = (dir: string) =>
    `run \`chmod go-w ${dir}\`, or choose a clone directory on a filesystem with Unix permissions ` +
    '(--mirror-dir, PR_UPDATE_MIRROR_DIR or `pr-update mirror enable --mirror-dir`)'

  test.skipIf(!posix)(
    'a clone directory, host or owner folder others can write to is refused, naming the chmod',
    () => {
      const clone = made()
      const host = join(root(), 'github.com')
      const owner = join(host, 'acme')
      for (const dir of [root(), host, owner]) {
        chmodSync(dir, 0o775)
        expect(checkClone(root(), clone)).toEqual({
          foreign: `${dir} can be written by its group or others, so ${clone} is not used; ${fix(dir)}`,
        })
        chmodSync(dir, 0o755)
      }
      expect(checkClone(root(), clone)).toBe('clone')
      // Before a clone is made too.
      chmodSync(owner, 0o777)
      const missing = join(owner, 'web.git')
      expect(checkClone(root(), missing)).toEqual({
        foreign: `${owner} can be written by its group or others, so ${missing} is not used; ${fix(owner)}`,
      })
      chmodSync(owner, 0o755)
      chmodSync(root(), 0o777)
      expect(() => checkMirrorDir(root())).toThrow(
        `the clone directory ${root()} can be written by its group or others; ${fix(root())}`,
      )
      chmodSync(root(), 0o755)
    },
  )

  test('a host or owner folder another user owns, or that is a symbolic link, is refused', () => {
    const clone = made()
    const host = join(root(), 'github.com')
    const owner = join(host, 'acme')
    for (const theirs of [host, owner]) {
      const owned = (st: import('node:fs').Stats) => st.ino !== statSync(theirs).ino
      expect(checkClone(root(), clone, owned)).toEqual({
        foreign: `${theirs} belongs to another user, so ${clone} is not used`,
      })
    }
    // A host folder planted as a link to somewhere else.
    const elsewhere = join(scratch, 'elsewhere')
    mkdirSync(join(elsewhere, 'acme'), { recursive: true, mode: 0o755 })
    const gl = join(root(), 'gitlab.com')
    symlinkSync(elsewhere, gl, 'dir')
    const planted = join(gl, 'acme', 'api.git')
    expect(checkClone(root(), planted)).toEqual({
      foreign: `${gl} is a symbolic link, so ${planted} is not used`,
    })
  })

  test.skipIf(!posix)(
    'the folders pr-update makes pass its own check, even under a umask that would let the group write',
    () => {
      const old = process.umask(0o002)
      try {
        const clones = managedClones({
          env: isolatedEnv(scratch),
          cwd: scratch,
          flag: root(),
          apply: true,
          gh: { run: () => ({ exitCode: 1, stdout: '', stderr: 'offline' }) } as CommandRunner,
          notice: () => {},
          ask: { canPrompt: () => false, choose: () => 0, text: () => '' },
          waitMs: 0,
        })
        const [t] = clones.provide(
          [
            {
              repo: 'acme/api',
              host: 'github.com',
              path: null,
              source: null,
              remote: 'origin',
              found: null,
              github: true,
            },
          ],
          { apply: true },
        )
        // It got as far as gh, which is offline here: no folder was refused.
        expect(t?.unserved).toMatch(/^the clone failed at gh repo clone: offline/)
        for (const dir of [
          root(),
          join(root(), 'github.com'),
          join(root(), 'github.com', 'acme'),
        ]) {
          expect(statSync(dir).mode & 0o022).toBe(0)
        }
        clones.close()
      } finally {
        process.umask(old)
      }
    },
  )
})

describe('a clone pr-update did not make, or that is not yours, is not used', () => {
  test('a symbolic link at the clone path, or a marker that is not a plain file, is foreign', () => {
    const root = join(scratch, 'repos')
    const real = clonePath(root, { host: 'github.com', owner: 'acme', name: 'real' })
    mkdirSync(real, { recursive: true })
    writeFileSync(join(real, CLONE_MARKER), '{}\n')
    expect(checkClone(root, real)).toBe('clone')
    const link = clonePath(root, { host: 'github.com', owner: 'acme', name: 'api' })
    symlinkSync(real, link, 'dir')
    expect(checkClone(root, link)).toEqual({
      foreign: `${link} is a symbolic link, so it is not used`,
    })

    const odd = clonePath(root, { host: 'github.com', owner: 'acme', name: 'odd' })
    mkdirSync(join(odd, CLONE_MARKER), { recursive: true })
    expect(checkClone(root, odd)).toEqual({
      foreign: `${join(odd, CLONE_MARKER)} is not a plain file, so ${odd} is not used`,
    })
    expect(checkClone(root, join(root, 'github.com', 'acme', 'none.git'))).toBe('missing')
  })

  test('a clone, a clone directory or a marker another user owns is refused', () => {
    const root = join(scratch, 'repos')
    markMirrorDir(root)
    const clone = clonePath(root, { host: 'github.com', owner: 'acme', name: 'api' })
    mkdirSync(clone, { recursive: true })
    writeFileSync(join(clone, CLONE_MARKER), '{}\n')
    for (const theirs of [root, clone, join(clone, CLONE_MARKER)]) {
      const owned = (st: import('node:fs').Stats) => st.ino !== statSync(theirs).ino
      expect(checkClone(root, clone, owned)).toEqual({
        foreign: `${theirs} belongs to another user, so ${clone} is not used`,
      })
    }
    const notMine = () => false
    expect(() => checkMirrorDir(root, undefined, notMine)).toThrow(
      `the clone directory ${root} belongs to another user`,
    )
    const marker = join(root, MIRROR_MARKER)
    const markerTheirs = (st: import('node:fs').Stats) => st.ino !== statSync(marker).ino
    expect(() => checkMirrorDir(root, undefined, markerTheirs)).toThrow(
      `${marker} belongs to another user, so ${root} is not used`,
    )
  })

  test('a marker of the clone directory that is a symbolic link is refused', () => {
    const root = join(scratch, 'repos')
    mkdirSync(root, { recursive: true })
    const elsewhere = join(scratch, 'elsewhere')
    writeFileSync(elsewhere, 'x\n')
    symlinkSync(elsewhere, join(root, MIRROR_MARKER))
    expect(() => checkMirrorDir(root)).toThrow(
      `${join(root, MIRROR_MARKER)} is not a plain file, so ${root} is not used`,
    )
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
