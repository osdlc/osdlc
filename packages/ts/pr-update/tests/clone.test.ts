/**
 * A `--repo` target with no checkout on this machine, served from a managed clone, through the
 * CLI. `gh` is `tests/fake-gh.mjs`, put first on PATH and run as the real program, which clones
 * a local bare repository: nothing reaches the network.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  chmodSync,
  cpSync,
  statSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { spawnRunner, type CommandRunner } from '@osdlc/command-seam'
import { osdlcDirs } from '@osdlc/ecosystem'
import { releaseLock } from '@osdlc/file-lock'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { main, type CliSeams } from '../src/cli.ts'
import { machineFile, prUpdatePaths } from '../src/machine.ts'
import { pruneMirror } from '../src/prune.ts'
import {
  CLONE_MARKER,
  CLONE_STAMP,
  claimCloneLock,
  cloneLockPath,
  credentialHelper,
  markMirrorDir,
} from '../src/mirror.ts'
import { CONFIG_INVALID_EXIT } from '@osdlc/config-layers'
import { allToolsInstalled, isolatedEnv, literal, worktreePaths } from './support.ts'
import { forwarded } from './support-signal.ts'

vi.mock('@osdlc/command-seam', async (original) =>
  (await import('./support-signal.ts')).mockForwarding(original),
)

const FAKE_GH = fileURLToPath(new URL('./fake-gh.mjs', import.meta.url))

let scratch: string
let project: string
/** The bare repository the fake `gh` clones acme/api from, and that pushes land in. */
let remote: string
let topic: string
let env: Record<string, string>
/** The default clone directory for `env`. */
let repos: string
let ghLog: string

/** Run git in `dir`, and fail the test when it fails. */
function git(dir: string, ...argv: string[]): string {
  const res = spawnRunner('git').run(argv, { cwd: dir })
  if (res.exitCode !== 0) throw new Error(`git ${argv.join(' ')}: ${res.stderr}`)
  return res.stdout.trim()
}

beforeEach(() => {
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-clone-')))
  const root = makeGitFixture({ dir: join(scratch, 'dev', 'widgets') })
  root.commit('init', { 'a.txt': 'a' })
  root.git.remoteAdd('origin', 'https://github.com/o/r.git')
  project = root.dir

  // acme/api, whose `topic` is one commit behind `main`, as a bare repository on "github.com".
  const work = makeGitFixture({ dir: join(scratch, 'work') })
  work.commit('base', { 'a.txt': 'a' })
  work.git.rawChecked(['checkout', '-q', '-b', 'topic'])
  topic = work.commit('topic work', { 't.txt': 't' })
  work.git.rawChecked(['checkout', '-q', 'main'])
  work.commit('main moves', { 'm.txt': 'm' })
  const ghRoot = join(scratch, 'gh')
  remote = join(ghRoot, 'github.com', 'acme', 'api.git')
  mkdirSync(dirname(remote), { recursive: true, mode: 0o755 })
  git(scratch, 'clone', '-q', '--bare', work.dir, remote)
  writeFileSync(
    join(ghRoot, 'prs.json'),
    JSON.stringify({
      'acme/api': [
        {
          number: 7,
          state: 'OPEN',
          title: 'topic',
          url: 'https://github.com/acme/api/pull/7',
          baseRefName: 'main',
          headRefName: 'topic',
          headRefOid: topic,
          isDraft: false,
          isCrossRepository: false,
          labels: [],
          reviews: [],
        },
      ],
    }),
  )

  // The fake gh, first on PATH, as `gh` and, for Windows, `gh.cmd`.
  const bin = join(scratch, 'bin')
  mkdirSync(bin)
  writeFileSync(join(bin, 'gh'), `#!/bin/sh\nexec node "${FAKE_GH}" "$@"\n`)
  chmodSync(join(bin, 'gh'), 0o755)
  writeFileSync(join(bin, 'gh.cmd'), `@node "${FAKE_GH}" %*\r\n`)
  ghLog = join(scratch, 'gh.log')
  vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH ?? ''}`)
  vi.stubEnv('FAKE_GH_ROOT', ghRoot)
  vi.stubEnv('FAKE_GH_LOG', ghLog)

  env = isolatedEnv(join(scratch, 'env'))
  repos = prUpdatePaths(osdlcDirs({ env })).repos
})
afterEach(() => {
  forwarded.signal = undefined
  vi.unstubAllEnvs()
  rmSync(scratch, { recursive: true, force: true })
})

async function runWith(
  seams: CliSeams,
  extraEnv: Record<string, string>,
  ...argv: string[]
): Promise<{ code: number; out: string; err: string }> {
  const ctx = captureContext({ cwd: project, env: { ...env, ...extraEnv } })
  const code = await main(argv, ctx, { which: allToolsInstalled, ...seams })
  return { code, out: ctx.io.out, err: ctx.io.err }
}

/** No terminal, as under CI: the default for these tests. */
const noTerminal: CliSeams = { terminal: { canPrompt: () => false } }
const run = (...argv: string[]) => runWith(noTerminal, {}, ...argv)

/** The `gh` calls the run made. */
function ghCalls(): { argv: string[]; host: string; hooksPath: string | null }[] {
  if (!existsSync(ghLog)) return []
  return readFileSync(ghLog, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line) as { argv: string[]; host: string; hooksPath: string | null })
}

const cloneOf = (dir: string) => join(dir, 'github.com', 'acme', 'api.git')

/** The helper a clone gets: the fake gh by its absolute path (on Windows, `gh.cmd`, with `/`). */
const ghHelper = () =>
  process.platform === 'win32'
    ? credentialHelper({ binary: 'gh' })
    : `!${join(scratch, 'bin', 'gh')} auth git-credential`

/** A terminal that answers with `lines`, and records what was asked. */
function answering(...lines: string[]): { seams: CliSeams; asked: () => string } {
  const file = join(scratch, `answers-${Math.random().toString(36).slice(2)}`)
  writeFileSync(file, lines.map((l) => `${l}\n`).join(''))
  const fd = openSync(file, 'r')
  let asked = ''
  afterEach(() => closeSync(fd))
  return {
    seams: { terminal: { canPrompt: () => true, fd, write: (t) => (asked += t) } },
    asked: () => asked,
  }
}

/** The machine file of `env`. */
const machinePath = () => machineFile({ env }).path()

/** Write the machine file of `env`. */
function writeMachine(text: string): void {
  mkdirSync(dirname(machinePath()), { recursive: true, mode: 0o755 })
  writeFileSync(machinePath(), text)
}

const readMachine = () => (existsSync(machinePath()) ? readFileSync(machinePath(), 'utf8') : null)

const clonesMade = () => ghCalls().filter((c) => c.argv[1] === 'clone')

describe("a managed clone's credential helper", () => {
  test.skipIf(process.platform === 'win32')(
    'never runs a gh planted in the worktree a push runs in, with . on PATH (final review)',
    async () => {
      const dir = join(scratch, 'clones')
      const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply')
      expect(r.code).toBe(EXIT.ok)
      // A worktree of the clone holding an executable `gh`, as a PR could commit one.
      const tree = join(scratch, 'tree')
      git(cloneOf(dir), 'worktree', 'add', '-q', '--detach', tree, 'origin/topic')
      const planted = join(scratch, 'planted-ran')
      writeFileSync(join(tree, 'gh'), `#!/bin/sh\n: > '${planted}'\n`)
      chmodSync(join(tree, 'gh'), 0o755)
      // The credential git asks for when it pushes over https, from that worktree.
      const res = spawnRunner('git').run(['credential', 'fill'], {
        cwd: tree,
        env: { PATH: `.${delimiter}${process.env.PATH ?? ''}`, GIT_TERMINAL_PROMPT: '0' },
        input: 'protocol=https\nhost=github.com\n\n',
      })
      expect(res.stdout).toContain('password=fake')
      expect(existsSync(planted)).toBe(false)
      expect(ghCalls().map((c) => c.argv.slice(0, 3))).toContainEqual([
        'auth',
        'git-credential',
        'get',
      ])
    },
  )
})

describe('update --apply with a target that has no checkout', () => {
  test('--mirror-dir clones it with gh, updates the PR from the clone and pushes to its origin', async () => {
    const dir = join(scratch, 'clones')
    const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    // One line says the target is served from the clone, naming the roots searched.
    expect(r.err).toContain(
      `github.com/acme/api: no checkout under ${join(scratch, 'dev')} (set the roots in `,
    )
    expect(r.err).toContain(`; using the clone ${cloneOf(dir)}`)
    expect(r.err).not.toContain('mirror enable')
    const out = JSON.parse(r.out)
    expect(out.repos[0]).toMatchObject({
      repo: 'acme/api',
      measurable: true,
      checkout: { path: cloneOf(dir), source: 'clone' },
    })
    expect(out.results).toMatchObject([{ repo: 'acme/api', number: 7, status: 'updated' }])
    // The push reached the repository gh cloned from.
    expect(git(remote, 'rev-parse', 'topic')).not.toBe(topic)

    // gh was asked for owner/name on its host, with no upstream remote, as a bare clone, and
    // the git it runs has no hooks.
    expect(clonesMade()).toEqual([
      {
        host: 'github.com',
        hooksPath: '/dev/null',
        argv: [
          'repo',
          'clone',
          'acme/api',
          expect.stringMatching(/[\\/]\.tmp-api\.git-\d+-[A-Za-z0-9]{6}[\\/]api\.git$/),
          '--no-upstream',
          '--',
          '--bare',
        ],
      },
    ])
    // The clone keeps the remote-tracking layout and no branches of its own.
    const c = cloneOf(dir)
    expect(git(c, 'for-each-ref', '--format=%(refname)', 'refs/heads/')).toBe('')
    expect(git(c, 'config', '--get', 'remote.origin.fetch')).toBe(
      '+refs/heads/*:refs/remotes/origin/*',
    )
    expect(git(c, 'config', '--get', 'core.longpaths')).toBe('true')
    // An empty helper first, as `gh auth setup-git` writes, so no other helper runs before gh's.
    const helpers = spawnRunner('git').run(
      ['config', '--local', '--get-all', 'credential.https://github.com.helper'],
      { cwd: c },
    )
    // gh by its absolute path, so a `gh` in the directory a push runs in is never the one run.
    expect(helpers.stdout).toBe(`\n${ghHelper()}\n`)
    expect(existsSync(join(c, CLONE_STAMP))).toBe(true)
    expect(existsSync(join(dir, '.pr-update-mirror'))).toBe(true)
    // The lock beside the clone is released, and no temporary directory is left.
    expect(readdirSync(dirname(c))).toEqual(['api.git'])
    // The run worktree is out of the clone's records, and out of the cache.
    expect(git(c, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1)
    // Nothing was asked and nothing written to the machine file: the flag is consent for one run.
    expect(readMachine()).toBeNull()
  })

  test('PR_UPDATE_MIRROR_DIR is consent; the next run uses the clone it made, and says so', async () => {
    const dir = join(scratch, 'from-env')
    const first = await runWith(
      noTerminal,
      { PR_UPDATE_MIRROR_DIR: dir },
      'update',
      '--repo',
      'acme/api',
      '--apply',
    )
    expect(first.code).toBe(EXIT.ok)
    expect(existsSync(cloneOf(dir))).toBe(true)
    const second = await runWith(
      noTerminal,
      { PR_UPDATE_MIRROR_DIR: dir },
      'update',
      '--repo',
      'acme/api',
      '--apply',
      '--json',
    )
    expect(second.code).toBe(EXIT.ok)
    expect(second.err).toContain(`; using the clone ${cloneOf(dir)}`)
    expect(clonesMade()).toHaveLength(1)
  })

  test('a relative PR_UPDATE_MIRROR_DIR is a usage error', async () => {
    const r = await runWith(
      noTerminal,
      { PR_UPDATE_MIRROR_DIR: 'clones' },
      'update',
      '--repo',
      'acme/api',
      '--apply',
    )
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain('PR_UPDATE_MIRROR_DIR must be an absolute path')
  })

  test('a relative --mirror-dir is a usage error', async () => {
    const r = await run('survey', '--repo', 'acme/api', '--mirror-dir', 'clones')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain('--mirror-dir must be an absolute path')
  })

  test('with no terminal and nothing set, it exits 2 naming the flag, the variable and mirror enable, and writes nothing', async () => {
    const r = await run('update', '--repo', 'acme/api', '--apply')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain('github.com/acme/api has no checkout on this machine')
    expect(r.err).toContain('--mirror-dir <dir>')
    expect(r.err).toContain('PR_UPDATE_MIRROR_DIR')
    expect(r.err).toContain('pr-update mirror enable')
    expect(clonesMade()).toEqual([])
    expect(existsSync(repos)).toBe(false)
    expect(readMachine()).toBeNull()
  })

  test('checkout: mirror in the machine file clones into repos/ in the cache directory', async () => {
    writeMachine('checkout: mirror\n')
    const r = await run('update', '--repo', 'acme/api', '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).repos[0].checkout, r.err).toEqual({
      path: cloneOf(repos),
      source: 'clone',
    })
  })

  test('checkout: mirror with mirror_dir under ~/ clones there', async () => {
    writeMachine('checkout: mirror\nmirror_dir: ~/clones\n')
    const r = await run('update', '--repo', 'acme/api', '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).repos[0].checkout.path, r.err).toBe(cloneOf(join(env.HOME!, 'clones')))
  })

  test('checkout: local skips it without asking; --mirror-dir beats it for one run', async () => {
    writeMachine('checkout: local\n')
    const { seams, asked } = answering('1')
    const skipped = await runWith(seams, {}, 'update', '--repo', 'acme/api', '--apply', '--json')
    expect(skipped.code).toBe(EXIT.ok)
    expect(asked()).toBe('')
    expect(clonesMade()).toEqual([])
    expect(JSON.parse(skipped.out).skipped).toMatchObject([
      { repo: 'acme/api', number: 7, reason: expect.stringContaining('checkout: local') },
    ])
    expect(skipped.err).toContain('checkout: local')

    const dir = join(scratch, 'clones')
    const cloned = await run(
      'update',
      '--repo',
      'acme/api',
      '--apply',
      '--mirror-dir',
      dir,
      '--json',
    )
    expect(cloned.code).toBe(EXIT.ok)
    expect(JSON.parse(cloned.out).results).toMatchObject([{ number: 7, status: 'updated' }])
    expect(readMachine()).toBe('checkout: local\n')
  })

  test('a target on a host that is not GitHub is never asked about or cloned', async () => {
    const r = await run('update', '--repo', 'git.example.com/acme/api', '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(r.err).toContain('there is no managed clone for git.example.com')
    expect(clonesMade()).toEqual([])
  })
})

describe('the first-run question', () => {
  test('names the repository, its size, the roots searched and the clone directory; Enter clones and writes checkout: mirror', async () => {
    const { seams, asked } = answering('')
    const r = await runWith(seams, {}, 'update', '--repo', 'acme/api', '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    const q = asked()
    expect(q).toContain('github.com/acme/api  (about 2 MB)')
    expect(q).toContain(`no checkout under ${join(scratch, 'dev')}`)
    expect(q).toContain('repositories.yaml')
    expect(q).toContain(`Clone into ${repos}`)
    expect(q).toContain('Your working trees are never touched')
    expect(readMachine()).toBe('checkout: mirror\n')
    expect(r.err).toContain(`wrote checkout: mirror to ${machinePath()}`)
    expect(JSON.parse(r.out).results).toMatchObject([{ number: 7, status: 'updated' }])
    expect(existsSync(cloneOf(repos))).toBe(true)
    // gh was asked for the size on the target's host.
    expect(ghCalls().find((c) => c.argv[1] === 'view')).toMatchObject({
      host: 'github.com',
      argv: ['repo', 'view', 'acme/api', '--json', 'diskUsage'],
    })
  })

  test('a typed directory is resolved against the run directory; inside a git checkout it is refused with exit 2, and nothing is written', async () => {
    const { seams } = answering('2', 'my-clones')
    const r = await runWith(seams, {}, 'update', '--repo', 'acme/api', '--apply')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain(
      `the clone directory ${join(project, 'my-clones')} is inside a git repository`,
    )
    expect(readMachine()).toBeNull()
    expect(existsSync(join(project, 'my-clones'))).toBe(false)
  })

  test('another directory, typed under ~/, is written as mirror_dir and cloned into', async () => {
    const { seams } = answering('2', '~/clones')
    const r = await runWith(seams, {}, 'update', '--repo', 'acme/api', '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    const dir = join(env.HOME!, 'clones')
    expect(readMachine()).toBe(`checkout: mirror\nmirror_dir: ${dir}\n`)
    expect(JSON.parse(r.out).repos[0].checkout.path, r.err).toBe(cloneOf(dir))
  })

  test('no writes checkout: local, and the PR is skipped', async () => {
    const { seams } = answering('3')
    const r = await runWith(seams, {}, 'update', '--repo', 'acme/api', '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(readMachine()).toBe('checkout: local\n')
    expect(clonesMade()).toEqual([])
    expect(JSON.parse(r.out).skipped[0].reason).toContain('checkout: local')
  })

  test('an answer that loses the race to another run is dropped, and the run follows the one that won', async () => {
    // Another run answers "no" while this one is still asking.
    let answeredElsewhere = false
    const { seams } = answering('1')
    const terminal = seams.terminal!
    const racing: CliSeams = {
      terminal: {
        ...terminal,
        write: (text) => {
          terminal.write?.(text)
          if (!answeredElsewhere && text.includes('Choose')) {
            answeredElsewhere = true
            writeMachine('checkout: local\n')
          }
        },
      },
    }
    const r = await runWith(racing, {}, 'update', '--repo', 'acme/api', '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(answeredElsewhere).toBe(true)
    expect(readMachine()).toBe('checkout: local\n')
    expect(r.err).toContain('another run answered first')
    expect(clonesMade()).toEqual([])
    expect(JSON.parse(r.out).skipped[0].reason).toContain('checkout: local')
  })

  test('a shallow checkout of it is named in a note and in the question', async () => {
    const shallow = join(scratch, 'dev', 'api')
    git(scratch, 'clone', '-q', '--depth', '1', `file://${remote}`, shallow)
    git(shallow, 'remote', 'set-url', 'origin', 'https://github.com/acme/api.git')
    const { seams, asked } = answering('3')
    const r = await runWith(seams, {}, 'update', '--repo', 'acme/api', '--apply')
    expect(r.code).toBe(EXIT.ok)
    expect(r.err).toContain(`github.com/acme/api: ${shallow} is shallow, so it is not used`)
    expect(asked()).toContain(`${shallow} is shallow, so it is not used`)
  })
})

describe('the clone steps', () => {
  test('step 1: a clone directory inside a git working tree exits 2 and writes nothing', async () => {
    const dir = join(project, 'clones')
    const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain(`the clone directory ${dir} is inside a git repository`)
    expect(existsSync(dir)).toBe(false)
    expect(clonesMade()).toEqual([])
  })

  test('step 1: a clone directory holding files pr-update did not put there exits 2', async () => {
    const dir = join(scratch, 'busy-dir')
    mkdirSync(dir)
    writeFileSync(join(dir, 'notes.txt'), 'mine')
    const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain(`the clone directory ${dir} holds files pr-update did not put there`)
    expect(readdirSync(dir)).toEqual(['notes.txt'])
  })

  test('step 2: a clone another run holds is skipped as mirror busy, after the wait', async () => {
    const dir = join(scratch, 'clones')
    mkdirSync(dirname(cloneOf(dir)), { recursive: true, mode: 0o755 })
    writeFileSync(join(dir, '.pr-update-mirror'), '')
    const token = claimCloneLock(cloneLockPath(cloneOf(dir)), 0)!
    try {
      const r = await runWith(
        { ...noTerminal, mirrorWaitMs: 0 },
        {},
        'update',
        '--repo',
        'acme/api',
        '--mirror-dir',
        dir,
        '--apply',
        '--json',
      )
      expect(r.code).toBe(EXIT.ok)
      expect(JSON.parse(r.out).skipped).toMatchObject([
        { repo: 'acme/api', number: 7, reason: expect.stringMatching(/^mirror busy: /) },
      ])
      expect(clonesMade()).toEqual([])
    } finally {
      releaseLock(cloneLockPath(cloneOf(dir)), token)
    }
  })

  test('step 3: a gh clone that fails removes the temporary directory and skips the target with the error', async () => {
    vi.stubEnv('FAKE_GH_FAIL_CLONE', 'HTTP 401: Bad credentials')
    const dir = join(scratch, 'clones')
    const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).skipped[0].reason).toBe(
      'the clone failed at gh repo clone: HTTP 401: Bad credentials',
    )
    expect(readdirSync(dirname(cloneOf(dir)))).toEqual([])
  })

  test('step 7: a rename that fails removes the temporary directory and leaves what is in the way', async () => {
    const dir = join(scratch, 'clones')
    vi.stubEnv('FAKE_GH_SQUAT', cloneOf(dir))
    const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).skipped[0].reason).toMatch(
      /^the clone failed at put the clone in place: /,
    )
    expect(readdirSync(dirname(cloneOf(dir)))).toEqual(['api.git'])
    expect(readdirSync(cloneOf(dir))).toEqual(['squatter'])
  })

  test('a folder in the clone path that pr-update did not make is not used', async () => {
    const dir = join(scratch, 'clones')
    mkdirSync(cloneOf(dir), { recursive: true, mode: 0o755 })
    writeFileSync(join(dir, '.pr-update-mirror'), '')
    const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply', '--json')
    expect(JSON.parse(r.out).skipped[0].reason).toContain(
      'is in the way: pr-update did not make it',
    )
    expect(clonesMade()).toEqual([])
  })
})

describe('the trust gate for a clone', () => {
  test('is keyed by host/owner/name: untrusted is skipped, `pr-update trust github.com/acme/api` lets it run', async () => {
    writeFileSync(
      join(project, 'pr-update.local.yaml'),
      "pr_update:\n  verify: test\n  test_command: 'true'\n",
    )
    const dir = join(scratch, 'clones')
    const refused = await run(
      'update',
      '--repo',
      'acme/api',
      '--mirror-dir',
      dir,
      '--apply',
      '--json',
    )
    expect(refused.code).toBe(EXIT.ok)
    expect(JSON.parse(refused.out).skipped[0].reason).toContain(
      'run `pr-update trust github.com/acme/api`',
    )
    // The clone is made before the trust gate: cloning has its own consent, and runs nothing
    // from the repository. The gate then keeps its commands from running.
    expect(existsSync(join(cloneOf(dir), CLONE_MARKER))).toBe(true)
    expect(git(remote, 'rev-parse', 'topic')).toBe(topic)
    expect(await run('trust', 'github.com/acme/api')).toMatchObject({ code: EXIT.ok })
    const allowed = await run(
      'update',
      '--repo',
      'acme/api',
      '--mirror-dir',
      dir,
      '--apply',
      '--json',
    )
    expect(JSON.parse(allowed.out).results).toMatchObject([{ number: 7, status: 'updated' }])
  })
})

describe('survey and a rehearsal', () => {
  test('with no clone, report the target not measured, name mirror enable, and clone nothing', async () => {
    for (const argv of [['survey'], ['update']]) {
      const r = await run(...argv, '--repo', 'acme/api', '--json')
      expect(r.code).toBe(EXIT.ok)
      expect(JSON.parse(r.out).repos[0]).toMatchObject({ measurable: false, checkout: null })
      expect(r.err).toContain('run `pr-update mirror enable` so `update --apply` can clone it')
    }
    expect(clonesMade()).toEqual([])
    expect(existsSync(repos)).toBe(false)
  })

  test('use a clone that exists: fetch it under its lock, pruned, stamp it, and measure it there', async () => {
    writeMachine('checkout: mirror\n')
    expect((await run('update', '--repo', 'acme/api', '--apply')).code).toBe(EXIT.ok)
    const clone = cloneOf(repos)
    writeFileSync(join(clone, CLONE_STAMP), 'old\n')
    // The PR's head is where the update pushed it.
    const prs = join(scratch, 'gh', 'prs.json')
    writeFileSync(prs, readFileSync(prs, 'utf8').replace(topic, git(remote, 'rev-parse', 'topic')))
    // main moves on the remote; only a fetch shows it.
    const work = join(scratch, 'work')
    git(work, 'commit', '-q', '--allow-empty', '-m', 'main again')
    git(work, 'push', '-q', remote, 'main')
    // A branch deleted on the remote: the clone's fetch prunes it.
    git(remote, 'branch', '-q', 'gone', 'main')
    git(clone, 'fetch', '-q', 'origin')
    expect(git(clone, 'branch', '-r', '--list', 'origin/gone')).not.toBe('')
    git(remote, 'branch', '-q', '-D', 'gone')
    for (const argv of [['survey'], ['update']]) {
      const r = await run(...argv, '--repo', 'acme/api', '--json')
      expect(r.code).toBe(EXIT.ok)
      expect(r.err).toContain(`; using the clone ${clone}`)
      expect(JSON.parse(r.out).repos[0]).toMatchObject({
        measurable: true,
        fetched: true,
        checkout: { path: clone, source: 'clone' },
      })
      expect(readFileSync(join(clone, CLONE_STAMP), 'utf8')).not.toBe('old\n')
      writeFileSync(join(clone, CLONE_STAMP), 'old\n')
    }
    expect(git(clone, 'rev-parse', 'origin/main')).toBe(git(work, 'rev-parse', 'main'))
    expect(git(clone, 'branch', '-r', '--list', 'origin/gone')).toBe('')
    expect(existsSync(cloneLockPath(clone))).toBe(false)
  })

  test('read a clone another run holds as it is, with a note, and without waiting', async () => {
    writeMachine('checkout: mirror\n')
    expect((await run('update', '--repo', 'acme/api', '--apply')).code).toBe(EXIT.ok)
    const clone = cloneOf(repos)
    writeFileSync(join(clone, CLONE_STAMP), 'old\n')
    const token = claimCloneLock(cloneLockPath(clone), 0)!
    try {
      const r = await run('survey', '--repo', 'acme/api', '--json')
      expect(r.code).toBe(EXIT.ok)
      expect(r.err).toContain(`${clone}: another pr-update run holds ${cloneLockPath(clone)}`)
      expect(JSON.parse(r.out).repos[0]).toMatchObject({ measurable: true, fetched: false })
      expect(readFileSync(join(clone, CLONE_STAMP), 'utf8')).toBe('old\n')
    } finally {
      releaseLock(cloneLockPath(clone), token)
    }
  })

  test('checkout: local leaves a clone that exists unused', async () => {
    const dir = join(scratch, 'clones')
    expect((await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply')).code).toBe(
      EXIT.ok,
    )
    writeMachine(`checkout: local\nmirror_dir: ${dir}\n`)
    const r = await run('survey', '--repo', 'acme/api', '--json')
    expect(JSON.parse(r.out).repos[0]).toMatchObject({ measurable: false, checkout: null })
  })
})

describe('pr-update mirror', () => {
  test('enable writes checkout: mirror and keeps the rest of the file', async () => {
    writeMachine('# mine\nmirror_max_age_days: 10\n')
    const r = await run('mirror', 'enable', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out)).toMatchObject({
      file: machinePath(),
      checkout: 'mirror',
      mirrorDir: null,
    })
    expect(readMachine()).toBe('# mine\nmirror_max_age_days: 10\ncheckout: mirror\n')
  })

  test('enable --mirror-dir writes mirror_dir too, after checking it; disable writes checkout: local', async () => {
    const dir = join(scratch, 'clones')
    expect((await run('mirror', 'enable', '--mirror-dir', dir)).code).toBe(EXIT.ok)
    expect(readMachine()).toBe(`checkout: mirror\nmirror_dir: ${dir}\n`)
    expect(existsSync(dir)).toBe(false)
    expect((await run('mirror', 'disable')).code).toBe(EXIT.ok)
    expect(readMachine()).toBe(`checkout: local\nmirror_dir: ${dir}\n`)
  })

  test('enable refuses a relative directory, or one inside a checkout, with exit 2', async () => {
    const relative = await run('mirror', 'enable', '--mirror-dir', 'clones')
    expect(relative.code).toBe(EXIT.usage)
    const inside = await run('mirror', 'enable', '--mirror-dir', join(project, 'clones'))
    expect(inside.code).toBe(EXIT.usage)
    expect(inside.err).toContain('is inside a git repository')
    expect(readMachine()).toBeNull()
  })
})

describe('review round 1', () => {
  /** A second repository on the fake github.com, acme/<name>, with no PRs. */
  function idleRepo(name: string): void {
    git(
      scratch,
      'clone',
      '-q',
      '--bare',
      remote,
      join(scratch, 'gh', 'github.com', 'acme', `${name}.git`),
    )
  }

  test('a clone with nothing to do is let go before the next target’s work starts', async () => {
    idleRepo('web')
    const dir = join(scratch, 'clones')
    const webLock = cloneLockPath(join(dir, 'github.com', 'acme', 'web.git'))
    const apiLock = cloneLockPath(cloneOf(dir))
    const seen = join(scratch, 'seen')
    // The verify step of acme/api's PR records whether either lock is held while it runs.
    // The paths are quoted for sh, which would read a Windows path's backslashes as escapes.
    const probe =
      `node -e "const fs = require('fs'); fs.writeFileSync(process.argv[1], ` +
      `[process.argv[2], process.argv[3]].map((l) => fs.existsSync(l) ? 'held' : 'free').join(' '))" ` +
      `'${seen}' '${webLock}' '${apiLock}'`
    writeFileSync(
      join(project, 'pr-update.local.yaml'),
      `pr_update:\n  verify: test\n  test_command: ${JSON.stringify(probe)}\n`,
    )
    const r = await run(
      'update',
      '--repo',
      'acme/web',
      '--repo',
      'acme/api',
      '--mirror-dir',
      dir,
      '--apply',
      '--trust',
      '--json',
    )
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).results).toMatchObject([
      { repo: 'acme/api', number: 7, status: 'updated' },
    ])
    // web, idle, was let go before api's work; api was let go once its worktree was added.
    expect(readFileSync(seen, 'utf8')).toBe('free free')
    expect(existsSync(webLock)).toBe(false)
  })

  test.each([
    ['checkout: maybe\n', 'checkout: '],
    ['mirror_dir: clones\n', 'mirror_dir: '],
    ['checkout: [mirror\n', ''],
  ])('a machine file holding %j is reported with its path, and ignored', async (text, key) => {
    writeMachine(text)
    const r = await run('survey', '--repo', 'acme/api', '--json')
    expect(r.code).toBe(EXIT.ok)
    const note = r.err.split('\n').find((l) => l.includes(machinePath()))
    expect(note).toBeDefined()
    expect(note).toContain(`${machinePath()}: ${key}`)
    expect(note).toMatch(/; it is ignored$/)
  })

  test.each([
    ['not valid YAML', 'checkout: [mirror\n', 'not valid YAML'],
    ['a list, not a map', '- checkout\n- mirror\n', 'its top level is not a map of keys'],
  ])(
    'a machine file that is %s exits 14 before the question, and in mirror enable, and is left as it is',
    async (_what, text, why) => {
      writeMachine(text)
      const { seams, asked } = answering('')
      const r = await runWith(seams, {}, 'update', '--repo', 'acme/api', '--apply', '--json')
      expect(r.code).toBe(CONFIG_INVALID_EXIT)
      expect(r.err).toContain(machinePath())
      expect(r.err).toContain(why)
      expect(asked()).toBe('')
      expect(clonesMade()).toEqual([])
      for (const argv of [
        ['mirror', 'enable'],
        ['mirror', 'disable'],
      ]) {
        const m = await run(...argv)
        expect(m.code).toBe(CONFIG_INVALID_EXIT)
        expect(m.err).toContain(machinePath())
        expect(m.err).toContain(why)
      }
      expect(readMachine()).toBe(text)
    },
  )

  test('an Enterprise host on a port: GH_HOST keeps the port, and so does the credential key', async () => {
    git(project, 'remote', 'set-url', 'origin', 'https://ghe.example:8443/o/r.git')
    writeFileSync(join(project, 'pr-update.yaml'), 'code_host:\n  override: github\n')
    const enterprise = join(scratch, 'gh', 'ghe.example_8443', 'acme', 'api.git')
    mkdirSync(dirname(enterprise), { recursive: true, mode: 0o755 })
    git(scratch, 'clone', '-q', '--bare', remote, enterprise)
    const dir = join(scratch, 'clones')
    const r = await run(
      'update',
      '--repo',
      'ghe.example:8443/acme/api',
      '--mirror-dir',
      dir,
      '--apply',
      '--json',
    )
    expect(r.code).toBe(EXIT.ok)
    // The path has the host without its port.
    const clone = join(dir, 'ghe.example', 'acme', 'api.git')
    expect(JSON.parse(r.out).repos[0].checkout, r.err).toMatchObject({
      path: clone,
      source: 'clone',
    })
    expect(clonesMade()).toMatchObject([{ host: 'ghe.example:8443' }])
    expect(JSON.parse(r.out).results).toMatchObject([{ number: 7, status: 'updated' }])
    expect(git(clone, 'config', '--get-all', 'credential.https://ghe.example:8443.helper')).toBe(
      ghHelper(),
    )
  })

  test('a symbolic link at the clone path is not used, and nothing is cloned', async () => {
    const dir = join(scratch, 'clones')
    const real = join(scratch, 'planted.git')
    mkdirSync(real, { recursive: true, mode: 0o755 })
    writeFileSync(join(real, CLONE_MARKER), '{}\n')
    mkdirSync(dirname(cloneOf(dir)), { recursive: true, mode: 0o755 })
    writeFileSync(join(dir, '.pr-update-mirror'), '')
    symlinkSync(real, cloneOf(dir), 'dir')
    const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).skipped[0].reason).toBe(
      `${cloneOf(dir)} is a symbolic link, so it is not used`,
    )
    expect(clonesMade()).toEqual([])
    // survey says so too, and does not read it.
    const s = await run('survey', '--repo', 'acme/api', '--mirror-dir', dir, '--json')
    expect(s.err).toContain(
      `github.com/acme/api: ${cloneOf(dir)} is a symbolic link, so it is not used`,
    )
    expect(JSON.parse(s.out).repos[0].checkout ?? null).toBeNull()
  })

  test('a rehearsal skips a clone another run holds as mirror busy, without waiting', async () => {
    writeMachine('checkout: mirror\n')
    expect((await run('update', '--repo', 'acme/api', '--apply')).code).toBe(EXIT.ok)
    const clone = cloneOf(repos)
    const token = claimCloneLock(cloneLockPath(clone), 0)!
    try {
      const started = Date.now()
      // The default wait is 60 s: a rehearsal that waited would time out this test.
      const r = await runWith(
        { terminal: { canPrompt: () => false } },
        {},
        'update',
        '--repo',
        'acme/api',
        '--json',
      )
      expect(Date.now() - started).toBeLessThan(30_000)
      expect(r.code).toBe(EXIT.ok)
      expect(r.err).toContain(
        `github.com/acme/api: mirror busy: another pr-update run holds ${cloneLockPath(clone)}`,
      )
      expect(JSON.parse(r.out).skipped).toMatchObject([
        {
          repo: 'acme/api',
          number: 7,
          reason: `mirror busy: another pr-update run holds ${cloneLockPath(clone)}`,
        },
      ])
      expect(git(clone, 'worktree', 'list', '--porcelain').match(/^worktree /gm)).toHaveLength(1)
    } finally {
      releaseLock(cloneLockPath(clone), token)
    }
  })
})

describe('pruning at the end of update --apply', () => {
  /** A managed clone of acme/old in `dir`, last used `daysAgo` days ago. */
  function oldClone(dir: string, daysAgo: number): string {
    markMirrorDir(dir)
    const path = join(dir, 'github.com', 'acme', 'old.git')
    mkdirSync(dirname(path), { recursive: true })
    git(scratch, 'clone', '-q', '--bare', remote, path)
    writeFileSync(join(path, CLONE_MARKER), '{"tool":"pr-update","repo":"github.com/acme/old"}\n')
    writeFileSync(
      join(path, CLONE_STAMP),
      `${new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()}\n`,
    )
    return path
  }

  test('a run served from a clone removes clones past mirror_max_age_days, and says what it freed', async () => {
    const dir = join(scratch, 'clones')
    const old = oldClone(dir, 40)
    const fresh = join(dir, 'github.com', 'acme', 'fresh.git')
    cpSync(old, fresh, { recursive: true })
    writeFileSync(join(fresh, CLONE_STAMP), `${new Date().toISOString()}\n`)

    const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply')

    expect(r.code).toBe(EXIT.ok)
    expect(r.err).toMatch(new RegExp(`pruned the clone ${literal(old)} \\(`))
    expect(r.err).toMatch(/pruning freed /)
    expect(existsSync(old)).toBe(false)
    expect(existsSync(fresh)).toBe(true)
    // The clone the run just used is not old.
    expect(existsSync(cloneOf(dir))).toBe(true)
  })

  test('a run that never touches the cache, and a rehearsal, remove nothing', async () => {
    writeMachine('checkout: mirror\n')
    const old = oldClone(repos, 400)
    const older = join(dirname(old), 'older.git')
    cpSync(old, older, { recursive: true })

    const root = await run('update', '--apply')
    expect(root.code).toBe(EXIT.ok)
    expect(root.err).not.toContain('pruned')
    expect(existsSync(old)).toBe(true)

    // A rehearsal served from one old clone leaves the other.
    const rehearsal = await run('update', '--repo', 'acme/old', '--json')
    expect(JSON.parse(rehearsal.out).repos[0].checkout, rehearsal.err).toEqual({
      path: old,
      source: 'clone',
    })
    expect(rehearsal.err).not.toContain('pruned')
    expect(existsSync(older)).toBe(true)
  })

  test('a run that updated a located checkout under the cache prunes too', async () => {
    const old = oldClone(repos, 400)
    // A checkout of acme/api beside the project, found by its origin; fetch and push go to the
    // local bare repository.
    const url = 'https://github.com/acme/api.git'
    const located = join(scratch, 'dev', 'api')
    git(scratch, 'clone', '-q', remote, located)
    git(located, 'remote', 'set-url', 'origin', url)
    const real = spawnRunner('git')
    const viaBare: CommandRunner = {
      run: (argv, opts) =>
        real.run(
          argv[0] === 'fetch' || argv[0] === 'push'
            ? ['-c', `url.file://${remote}.insteadOf=${url}`, ...argv]
            : argv,
          opts,
        ),
    }

    const r = await runWith(
      { ...noTerminal, git: viaBare },
      {},
      'update',
      '--repo',
      'acme/api',
      '--apply',
      '--json',
    )

    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).repos[0].checkout, r.err).toEqual({ path: located, source: 'located' })
    expect(r.err).toMatch(new RegExp(`pruned the clone ${literal(old)} \\(`))
    expect(existsSync(old)).toBe(false)
  })

  test('never waits for a clone another run holds: it is left, and the run ends at once', async () => {
    const dir = join(scratch, 'clones')
    const old = oldClone(dir, 40)
    const token = claimCloneLock(cloneLockPath(old), 0)!
    try {
      const started = Date.now()
      // The default wait is 60 s: pruning that waited would time out this test.
      const r = await runWith(
        { terminal: { canPrompt: () => false } },
        {},
        'update',
        '--repo',
        'acme/api',
        '--mirror-dir',
        dir,
        '--apply',
      )
      expect(Date.now() - started).toBeLessThan(30_000)
      expect(r.code).toBe(EXIT.ok)
      expect(existsSync(old)).toBe(true)
    } finally {
      releaseLock(cloneLockPath(old), token)
    }
  })
})

describe('review round 2', () => {
  test('--discard-kept removes a clone’s kept worktree only under the clone’s lock', async () => {
    const dir = join(scratch, 'clones')
    const clone = cloneOf(dir)
    writeFileSync(
      join(project, 'pr-update.local.yaml'),
      "pr_update:\n  verify: test\n  test_command: 'false'\n",
    )
    const failed = await run(
      'update',
      '--repo',
      'acme/api',
      '--mirror-dir',
      dir,
      '--apply',
      '--trust',
      '--keep-failed',
      '--json',
    )
    expect(failed.code).not.toBe(EXIT.usage)
    const trees = () => worktreePaths(git(clone, 'worktree', 'list', '--porcelain'))
    const [kept, ...more] = trees().filter((p) => p !== clone)
    expect(more).toEqual([])
    expect(kept).toBeDefined()
    // acme/api has nothing to update now, so the run lets go of its clone before it discards.
    writeFileSync(join(scratch, 'gh', 'prs.json'), '{}')

    // Another run takes the lock between this run's survey and its discard.
    const lock = cloneLockPath(clone)
    let claims = 0
    const busy: CliSeams = {
      ...noTerminal,
      mirrorClaim: (path, wait) =>
        path === lock && ++claims > 1 ? null : claimCloneLock(path, wait),
    }
    const left = await runWith(
      busy,
      {},
      'update',
      '--repo',
      'acme/api',
      '--mirror-dir',
      dir,
      '--apply',
      '--discard-kept',
      '--json',
    )
    expect(left.code).toBe(EXIT.ok)
    expect(left.err).toContain(
      `the kept worktree ${kept} is left in place, because another run holds its clone (${lock}); run with --discard-kept again to remove it`,
    )
    expect(trees()).toContain(kept)
    expect(existsSync(kept!)).toBe(true)

    const gone = await run(
      'update',
      '--repo',
      'acme/api',
      '--mirror-dir',
      dir,
      '--apply',
      '--discard-kept',
      '--json',
    )
    expect(gone.code).toBe(EXIT.ok)
    expect(trees()).toEqual([clone])
    expect(existsSync(kept!)).toBe(false)
    expect(existsSync(lock)).toBe(false)
  })
})

describe('mirror prune and a run worktree a run left in its clone', () => {
  test('a run that cannot take its clone’s lock back leaves its worktree; prune removes it under the lock once the run is gone', async () => {
    const dir = join(scratch, 'clones')
    const clone = cloneOf(dir)
    const lock = cloneLockPath(clone)
    // Another run takes the lock after this run's worktree is added.
    let claims = 0
    const busy: CliSeams = {
      ...noTerminal,
      mirrorClaim: (path, wait) =>
        path === lock && ++claims > 1 ? null : claimCloneLock(path, wait),
    }
    const r = await runWith(
      busy,
      {},
      'update',
      '--repo',
      'acme/api',
      '--mirror-dir',
      dir,
      '--apply',
    )
    expect(r.code).toBe(EXIT.ok)
    const trees = () =>
      worktreePaths(git(clone, 'worktree', 'list', '--porcelain')).filter((p) => p !== clone)
    const [left, ...more] = trees()
    expect(more).toEqual([])
    expect(r.err).toContain(
      `${left} is left, because another run holds its clone (${lock}); the next run in this clone, or \`pr-update mirror prune\`, removes it`,
    )

    // While the run that made it could still be alive, it stays.
    expect(pruneMirror({ env, dir }).removed).toEqual([])
    const order: string[] = []
    const report = pruneMirror({
      env,
      dir,
      // The run has ended.
      alive: () => false,
      claim: (path, wait) => {
        order.push(`claim ${path} ${wait} ${existsSync(left!)}`)
        return claimCloneLock(path, wait)
      },
    })
    expect(order).toEqual([`claim ${lock} 0 true`])
    expect(report.removed.map((e) => [e.kind, e.path])).toEqual([['worktree', left]])
    expect(trees()).toEqual([])
    expect(existsSync(left!)).toBe(false)
    expect(git(clone, 'for-each-ref', 'refs/heads/')).toBe('')
    expect(existsSync(lock)).toBe(false)
  })
})

describe('mirror prune review round 1', () => {
  const paths = () => prUpdatePaths(osdlcDirs({ env }))
  /** A managed clone of acme/old in `dir`, last used `daysAgo` days ago. */
  function oldClone(dir: string, daysAgo: number): string {
    markMirrorDir(dir)
    const path = join(dir, 'github.com', 'acme', 'old.git')
    mkdirSync(dirname(path), { recursive: true })
    git(scratch, 'clone', '-q', '--bare', remote, path)
    writeFileSync(join(path, CLONE_MARKER), '{"tool":"pr-update","repo":"github.com/acme/old"}\n')
    writeFileSync(
      join(path, CLONE_STAMP),
      `${new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()}\n`,
    )
    return path
  }

  test.skipIf(process.platform === 'win32')(
    'under umask 002, the folders a run makes for its worktree and its kept worktree are 0755',
    async () => {
      writeFileSync(
        join(project, 'pr-update.local.yaml'),
        "pr_update:\n  verify: test\n  test_command: 'false'\n",
      )
      const old = process.umask(0o002)
      let r: Awaited<ReturnType<typeof run>>
      try {
        r = await run(
          'update',
          '--repo',
          'acme/api',
          '--mirror-dir',
          join(scratch, 'clones'),
          '--apply',
          '--trust',
          '--keep-failed',
          '--json',
        )
      } finally {
        process.umask(old)
      }
      expect(JSON.parse(r.out).results).toMatchObject([{ number: 7, status: 'failed' }])
      const { worktrees, kept } = paths()
      for (const dir of [
        worktrees,
        join(worktrees, 'github.com'),
        join(worktrees, 'github.com', 'acme'),
        join(worktrees, 'github.com', 'acme', 'api'),
        join(kept, 'github.com', 'acme', 'api'),
      ]) {
        expect([dir, statSync(dir).mode & 0o777]).toEqual([dir, 0o755])
      }
      // So the next prune finds nothing to refuse.
      const pruned = pruneMirror({ env, dir: join(scratch, 'clones') })
      expect(pruned.skipped.filter((e) => e.skip === 'folder')).toEqual([])
    },
  )

  test.skipIf(process.platform === 'win32')(
    'under umask 000, nothing git writes after the clone can be written by others (review round 1)',
    async () => {
      writeFileSync(
        join(project, 'pr-update.local.yaml'),
        "pr_update:\n  verify: test\n  test_command: 'false'\n",
      )
      const clones = join(scratch, 'clones')
      const old = process.umask(0)
      let r: Awaited<ReturnType<typeof run>>
      try {
        r = await run(
          'update',
          '--repo',
          'acme/api',
          '--mirror-dir',
          clones,
          '--apply',
          '--trust',
          '--keep-failed',
          '--json',
        )
      } finally {
        process.umask(old)
      }
      expect(JSON.parse(r.out).results, r.err).toMatchObject([{ number: 7, status: 'failed' }])
      const clone = cloneOf(clones)
      const keptTree = join(paths().kept, 'github.com', 'acme', 'api', '7')
      // The kept tree's admin folder in the clone, written by `git worktree add` after the clone.
      const [admin, ...others] = readdirSync(join(clone, 'worktrees'))
      expect(others).toEqual([])
      const written = [
        join(clone, 'worktrees', admin!, 'commondir'),
        join(clone, 'worktrees', admin!, 'gitdir'),
        join(clone, 'worktrees', admin!, 'HEAD'),
      ]
      for (const file of written) expect(existsSync(file), file).toBe(true)
      const writable: string[] = []
      const walk = (dir: string): void => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const path = join(dir, e.name)
          if (e.isSymbolicLink()) continue
          if ((statSync(path).mode & 0o022) !== 0) writable.push(path)
          if (e.isDirectory()) walk(path)
        }
      }
      walk(clone)
      walk(keptTree)
      expect(writable).toEqual([])
    },
  )

  test.skipIf(process.platform === 'win32')(
    'the end-of-run prune notes a run worktree it left for a folder anyone can write to',
    async () => {
      const { worktrees } = paths()
      const dead = join(worktrees, 'github.com', 'acme', 'web', '2147483646.1')
      mkdirSync(dead, { recursive: true, mode: 0o755 })
      chmodSync(join(worktrees, 'github.com'), 0o777)

      const r = await run(
        'update',
        '--repo',
        'acme/api',
        '--mirror-dir',
        join(scratch, 'clones'),
        '--apply',
      )

      expect(r.code).toBe(EXIT.ok)
      expect(r.err).toContain(
        `did not prune the run worktree ${dead}: ${join(worktrees, 'github.com')} can be written by anyone; run \`chmod -R go-w ${worktrees}\``,
      )
      expect(existsSync(dead)).toBe(true)
    },
  )

  test('an end-of-run prune that fails is noted, and the run still exits 0', async () => {
    const dir = join(scratch, 'clones')
    const broken = oldClone(dir, 400)
    rmSync(join(broken, 'HEAD'))

    const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply')

    expect(r.code).toBe(EXIT.ok)
    expect(r.err).toMatch(new RegExp(`could not prune ${literal(broken)}: `))
    expect(existsSync(broken)).toBe(true)
  })

  test('a run a signal stopped prunes nothing', async () => {
    const dir = join(scratch, 'clones')
    const old = oldClone(dir, 400)
    forwarded.signal = 'SIGTERM'

    const r = await run('update', '--repo', 'acme/api', '--mirror-dir', dir, '--apply')

    expect(r.code).toBe(128 + 15)
    expect(r.err).not.toContain('prune')
    expect(existsSync(old)).toBe(true)
  })

  test('survey holds a clone’s lock while it reads the clone, not only while it fetches', async () => {
    writeMachine('checkout: mirror\n')
    expect((await run('update', '--repo', 'acme/api', '--apply')).code).toBe(EXIT.ok)
    const clone = cloneOf(repos)
    const real = spawnRunner('git')
    const lockedAt: Record<string, boolean> = {}
    const watching: CommandRunner = {
      run: (argv, opts) => {
        if (
          opts?.cwd !== undefined &&
          realpathSync.native(opts.cwd) === realpathSync.native(clone)
        ) {
          lockedAt[argv.slice(0, 2).join(' ')] = existsSync(cloneLockPath(clone))
        }
        return real.run(argv, opts)
      },
    }

    const r = await runWith({ ...noTerminal, git: watching }, {}, 'survey', '--repo', 'acme/api')

    expect(r.code).toBe(EXIT.ok)
    expect(lockedAt).toMatchObject({ 'fetch --prune': true, 'worktree list': true })
    expect(Object.values(lockedAt).every(Boolean)).toBe(true)
    expect(existsSync(cloneLockPath(clone))).toBe(false)
  })

  test('after a clone is fetched, git maintenance runs in the foreground under its lock (review round 2)', async () => {
    writeMachine('checkout: mirror\n')
    expect((await run('update', '--repo', 'acme/api', '--apply')).code).toBe(EXIT.ok)
    const clone = cloneOf(repos)
    const real = spawnRunner('git')
    const calls: { argv: string[]; locked: boolean }[] = []
    const watching: CommandRunner = {
      run: (argv, opts) => {
        if (
          opts?.cwd !== undefined &&
          realpathSync.native(opts.cwd) === realpathSync.native(clone)
        ) {
          calls.push({ argv: [...argv], locked: existsSync(cloneLockPath(clone)) })
        }
        return real.run(argv, opts)
      },
    }

    const r = await runWith({ ...noTerminal, git: watching }, {}, 'survey', '--repo', 'acme/api')

    expect(r.code, r.err).toBe(EXIT.ok)
    const fetchAt = calls.findIndex((c) => c.argv.includes('fetch'))
    const maintainAt = calls.findIndex((c) => c.argv.includes('maintenance'))
    expect(fetchAt).toBeGreaterThanOrEqual(0)
    expect(maintainAt).toBeGreaterThan(fetchAt)
    expect(calls[maintainAt]).toEqual({
      argv: [
        '-c',
        'gc.auto=6700',
        '-c',
        'gc.autoDetach=false',
        '-c',
        'maintenance.autoDetach=false',
        'maintenance',
        'run',
        '--auto',
        '--quiet',
      ],
      locked: true,
    })
    // The clone's own config still keeps every other git from starting one in the background.
    expect(git(clone, 'config', '--get', 'maintenance.auto')).toBe('false')
    expect(git(clone, 'config', '--get', 'gc.auto')).toBe('0')
  })

  test('a survey that reads a busy clone without its lock, while a prune removes it, reports the target not measured', async () => {
    writeMachine('checkout: mirror\n')
    expect((await run('update', '--repo', 'acme/api', '--apply')).code).toBe(EXIT.ok)
    const clone = cloneOf(repos)
    const seams: CliSeams = {
      ...noTerminal,
      // A prune holds the lock, and removes the clone while the survey reads it.
      mirrorClaim: (path, wait) => {
        if (path !== cloneLockPath(clone)) return claimCloneLock(path, wait)
        rmSync(clone, { recursive: true, force: true })
        return null
      },
    }

    const r = await runWith(seams, {}, 'survey', '--repo', 'acme/api', '--json')

    expect(r.code).toBe(EXIT.ok)
    expect(r.err).toContain(
      `${clone} was removed (by a prune) while this run read it without its lock`,
    )
    const out = JSON.parse(r.out)
    expect(out.repos[0]).toMatchObject({ measurable: false, checkout: null, fetched: false })
    // The PR is listed, unmeasured: nothing read from the clone half gone.
    expect(out.prs).toMatchObject([{ number: 7, status: 'unknown', behind: null, baseOid: null }])
  })

  test('a survey whose clone a prune removed just before it took the lock reports the target not measured (second review)', async () => {
    writeMachine('checkout: mirror\n')
    expect((await run('update', '--repo', 'acme/api', '--apply')).code).toBe(EXIT.ok)
    const clone = cloneOf(repos)
    const seams: CliSeams = {
      ...noTerminal,
      // A prune removes the clone and lets go of the lock as this run asks for it.
      mirrorClaim: (path, wait) => {
        if (path === cloneLockPath(clone)) rmSync(clone, { recursive: true, force: true })
        return claimCloneLock(path, wait)
      },
    }

    const r = await runWith(seams, {}, 'survey', '--repo', 'acme/api', '--json')

    expect(r.code).toBe(EXIT.ok)
    expect(r.err).toContain(`${clone} was removed (by a prune) before this run took its lock`)
    const out = JSON.parse(r.out)
    expect(out.repos[0]).toMatchObject({ measurable: false, checkout: null, fetched: false })
    expect(existsSync(clone)).toBe(false)
    expect(existsSync(cloneLockPath(clone))).toBe(false)
  })

  describe('a clone removed while the run waits for its lock', () => {
    /** A clone of acme/api in `dir` that `locate` finds, and a claim that removes it first. */
    function removedOnClaim(dir: string): { clone: string; seams: CliSeams } {
      markMirrorDir(dir)
      const clone = cloneOf(dir)
      mkdirSync(dirname(clone), { recursive: true, mode: 0o755 })
      git(scratch, 'clone', '-q', '--bare', remote, clone)
      writeFileSync(
        join(clone, CLONE_MARKER),
        '{"tool":"pr-update","repo":"github.com/acme/api"}\n',
      )
      let removed = false
      return {
        clone,
        seams: {
          ...noTerminal,
          // As a prune would: it held the lock, removed the clone, and let go.
          mirrorClaim: (path, wait) => {
            if (!removed && path === cloneLockPath(clone)) {
              removed = true
              rmSync(clone, { recursive: true, force: true })
            }
            return claimCloneLock(path, wait)
          },
        },
      }
    }

    test('update --apply with consent makes it again under the lock it holds', async () => {
      const dir = join(scratch, 'clones')
      const { clone, seams } = removedOnClaim(dir)

      const r = await runWith(
        seams,
        {},
        'update',
        '--repo',
        'acme/api',
        '--mirror-dir',
        dir,
        '--apply',
        '--json',
      )

      expect(r.code).toBe(EXIT.ok)
      expect(r.err).toContain(
        `github.com/acme/api: ${clone} was removed (by a prune) before this run took its lock`,
      )
      expect(clonesMade()).toHaveLength(1)
      expect(JSON.parse(r.out).results).toMatchObject([{ number: 7, status: 'updated' }])
      expect(existsSync(join(clone, CLONE_MARKER))).toBe(true)
    })

    test('a rehearsal reports the target unserved, and does not throw', async () => {
      const dir = join(scratch, 'clones')
      const { clone, seams } = removedOnClaim(dir)

      const r = await runWith(
        seams,
        {},
        'update',
        '--repo',
        'acme/api',
        '--mirror-dir',
        dir,
        '--json',
      )

      expect(r.code).toBe(EXIT.ok)
      expect(r.err).toContain(
        `github.com/acme/api: ${clone} was removed (by \`pr-update mirror prune\`, say) before this run could use it`,
      )
      expect(clonesMade()).toEqual([])
      expect(existsSync(clone)).toBe(false)
      expect(existsSync(cloneLockPath(clone))).toBe(false)
    })
  })
})
