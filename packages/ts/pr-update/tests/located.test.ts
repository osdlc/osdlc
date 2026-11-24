/**
 * A `--repo` target with a checkout on this machine, through the CLI: survey
 * measures it there, through its `origin`, and reports where; update runs in
 * it from a worktree under pr-update's cache, and pushes through its `origin`.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { main, type CliSeams } from '../src/cli.ts'
import { allToolsInstalled, isolatedEnv, worktreePaths } from './support.ts'

let scratch: string
let project: string
let located: string
let topic: string
/** The argv of every `gh` call, and the `GH_HOST` it ran with. */
let asked: { argv: string[]; host: string | undefined }[]

beforeEach(() => {
  asked = []
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-located-')))
  // The project root, whose `upstream` is the remote `--remote` names below.
  const root = makeGitFixture({ dir: join(scratch, 'dev', 'widgets') })
  root.commit('init', { 'a.txt': 'a' })
  root.git.remoteAdd('origin', 'https://github.com/o/r.git')
  root.git.remoteAdd('upstream', 'https://github.com/o/r.git')
  project = root.dir

  // A checkout of acme/api beside it, whose `origin/topic` is one commit behind `origin/main`.
  const api = makeGitFixture({ dir: join(scratch, 'dev', 'api') })
  api.commit('base', { 'a.txt': 'a' })
  api.git.rawChecked(['checkout', '-q', '-b', 'topic'])
  topic = api.commit('topic work', { 't.txt': 't' })
  api.git.rawChecked(['checkout', '-q', '-'])
  const main = api.commit('main moves', { 'm.txt': 'm' })
  api.git.remoteAdd('origin', 'https://github.com/Acme/API.git')
  api.git.rawChecked(['update-ref', 'refs/remotes/origin/main', main])
  api.git.rawChecked(['update-ref', 'refs/remotes/origin/topic', topic])
  located = api.dir
})
afterEach(() => rmSync(scratch, { recursive: true, force: true }))

/** A `gh` that lists one PR, #7 `topic` into `main`, for acme/api and none elsewhere. */
const gh: CommandRunner = {
  run: (argv, opts) => {
    asked.push({ argv: [...argv], host: opts?.env?.['GH_HOST'] })
    return {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify(
        argv.some((a) => a.endsWith('acme/api'))
          ? [
              {
                number: 7,
                state: 'OPEN',
                title: 'topic',
                url: 'https://github.com/acme/api/pull/7',
                baseRefName: 'main',
                headRefName: 'topic',
                headRefOid: topic,
              },
            ]
          : [],
      ),
    }
  },
}

async function runWith(
  seams: CliSeams,
  ...argv: string[]
): Promise<{ code: number; out: string; err: string }> {
  const ctx = captureContext({ cwd: project, env: isolatedEnv(join(scratch, 'env')) })
  const code = await main(argv, ctx, { which: allToolsInstalled, gh, ...seams })
  return { code, out: ctx.io.out, err: ctx.io.err }
}

const run = (...argv: string[]) => runWith({}, ...argv)

/** Run git in `dir`, and fail the test when it fails. */
function git(dir: string, ...argv: string[]): string {
  const res = spawnRunner('git').run(argv, { cwd: dir })
  if (res.exitCode !== 0) throw new Error(`git ${argv.join(' ')}: ${res.stderr}`)
  return res.stdout.trim()
}

describe('a located checkout', () => {
  test('survey measures it there, through origin, and reports where', async () => {
    // `--remote upstream` names a remote of the project root; the checkout is read through origin.
    const r = await run(
      'survey',
      '--repo',
      'Acme/API',
      '--remote',
      'upstream',
      '--no-fetch',
      '--json',
    )
    expect(r.code).toBe(EXIT.ok)
    const out = JSON.parse(r.out)
    expect(out.repos).toEqual([
      {
        repo: 'acme/api',
        measurable: true,
        checkout: { path: located, source: 'located' },
        fetched: false,
        cycles: [],
      },
    ])
    expect(out.prs[0]).toMatchObject({ repo: 'acme/api', number: 7, status: 'behind', behind: 1 })
  })

  test('the project root is reported as the root', async () => {
    const r = await run('survey', '--no-fetch', '--json')
    expect(JSON.parse(r.out).repos[0].checkout).toEqual({ path: project, source: 'root' })
  })

  test('a target with no checkout is reported unmeasured, with where it was looked for', async () => {
    const r = await run('survey', '--repo', 'acme/gone', '--no-fetch', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).repos[0]).toMatchObject({ measurable: false, checkout: null })
    expect(r.err).toContain(`github.com/acme/gone: no checkout under ${join(scratch, 'dev')}`)
    expect(r.err).toContain('repositories.yaml')
  })

  test('--pr names a PR of it in any letter case', async () => {
    const r = await run(
      'survey',
      '--repo',
      'acme/api',
      '--pr',
      'ACME/api#7',
      '--no-fetch',
      '--json',
    )
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).prs.map((p: { number: number }) => p.number)).toEqual([7])
  })

  test('one owner/name on two hosts is a usage error naming both', async () => {
    const r = await run('survey', '--repo', 'acme/api', '--repo', 'git.example.com/acme/api')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain(
      '--repo acme/api and --repo git.example.com/acme/api are acme/api on different hosts',
    )
  })

  test('the unpushed_local guard reads every checkout of it, not only the one used', async () => {
    // A second checkout of acme/api, on `topic`, holding a commit its origin has not seen.
    const other = makeGitFixture({ dir: join(scratch, 'dev', 'api2') })
    other.commit('base', { 'a.txt': 'a' })
    other.git.remoteAdd('origin', 'https://github.com/acme/api.git')
    git(other.dir, 'fetch', '-q', located, '+refs/remotes/origin/*:refs/remotes/origin/*')
    git(other.dir, 'checkout', '-q', '-b', 'topic', topic)
    other.commit('not pushed', { 'u.txt': 'u' })

    const r = await run('survey', '--repo', 'acme/api', '--no-fetch', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(r.err).toContain(`using ${located}; also checked out at ${other.dir}`)
    const out = JSON.parse(r.out)
    expect(out.repos[0].checkout.path).toBe(located)
    expect(out.prs[0]).toMatchObject({ number: 7, unpushedLocal: true, strategy: 'skip' })

    // Pushed, it no longer holds the branch back.
    git(other.dir, 'update-ref', 'refs/remotes/origin/topic', 'topic')
    const after = JSON.parse(
      (await run('survey', '--repo', 'acme/api', '--no-fetch', '--json')).out,
    )
    expect(after.prs[0]).toMatchObject({ unpushedLocal: false, strategy: 'rebase' })
  })
})

describe('updating a located checkout', () => {
  test('runs in a worktree under the cache, pushes through its origin, and leaves only git records in it', async () => {
    // Its origin is on a host with a port; the push and fetch go to a bare repository instead.
    const url = 'https://ghe.example:8443/acme/api.git'
    git(located, 'remote', 'set-url', 'origin', url)
    const bare = join(scratch, 'remote', 'api.git')
    git(scratch, 'init', '-q', '--bare', bare)
    const main = git(located, 'rev-parse', 'refs/remotes/origin/main')
    git(located, 'push', '-q', bare, `${main}:refs/heads/main`, `${topic}:refs/heads/topic`)
    const real = spawnRunner('git')
    /** The located checkout's branch.pr-update/* keys, read at each push, while the run is on. */
    const tracking: string[] = []
    const viaBare: CommandRunner = {
      run: (argv, opts): CommandResult => {
        if (argv[0] === 'push') {
          const keys = real.run(['config', '--get-regexp', '^branch\\.pr-update/'], {
            cwd: located,
          })
          tracking.push(keys.stdout)
        }
        return real.run(
          argv[0] === 'fetch' || argv[0] === 'push'
            ? ['-c', `url.file://${bare}.insteadOf=${url}`, ...argv]
            : argv,
          opts,
        )
      },
    }

    const r = await runWith(
      { git: viaBare },
      'update',
      '--repo',
      'ghe.example:8443/acme/api',
      '--apply',
      '--json',
    )
    expect(r.code).toBe(EXIT.ok)
    const out = JSON.parse(r.out)
    expect(out.repos[0]).toMatchObject({ repo: 'acme/api', checkout: { path: located } })
    expect(out.results).toMatchObject([
      { repo: 'acme/api', number: 7, status: 'updated', pushed: true },
    ])
    expect(asked.find((c) => c.argv.includes('acme/api'))?.host).toBe('ghe.example:8443')
    // Rebased onto main and pushed to the origin it was found by.
    const pushed = git(bare, 'rev-parse', 'refs/heads/topic')
    expect(pushed).not.toBe(topic)
    expect(git(bare, 'merge-base', main, pushed)).toBe(main)

    // The run worktree was made under pr-update's cache, by the host without its port, and removed.
    const env = isolatedEnv(join(scratch, 'env'))
    const runs = join(env.OSDLC_ROOT!, 'cache', 'osdlc', 'pr-update', 'worktrees')
    expect(readdirSync(join(runs, 'ghe.example', 'acme', 'api'))).toEqual([])
    expect(readdirSync(runs)).toEqual(['ghe.example'])
    expect(existsSync(join(located, '.pr-update'))).toBe(false)
    expect(
      worktreePaths(git(located, 'worktree', 'list', '--porcelain')).filter((p) =>
        p.startsWith(runs),
      ),
    ).toEqual([])
    expect(git(located, 'branch', '--list', 'pr-update/*')).toBe('')
    // The scratch branch is made with --no-track: the person's config gets no branch.pr-update/*
    // keys, not even while the run is on, and none are left after it (final review).
    expect(tracking.length).toBeGreaterThan(0)
    expect(tracking.every((keys) => keys === '')).toBe(true)
    const keys = real.run(['config', '--get-regexp', '^branch\\.pr-update/'], { cwd: located })
    expect(keys.stdout).toBe('')
  })
})

describe('a run started with GIT_DIR set', () => {
  test('acts on the located target, not on the repository GIT_DIR names', async () => {
    // A git hook in the project root exports GIT_DIR; the run's git calls in the target clear it.
    const url = 'https://github.com/Acme/API.git'
    const bare = join(scratch, 'remote', 'api.git')
    git(scratch, 'init', '-q', '--bare', bare)
    const main = git(located, 'rev-parse', 'refs/remotes/origin/main')
    git(located, 'push', '-q', bare, `${main}:refs/heads/main`, `${topic}:refs/heads/topic`)
    const real = spawnRunner('git')
    const viaBare: CommandRunner = {
      run: (argv, opts): CommandResult =>
        real.run(
          argv[0] === 'fetch' || argv[0] === 'push'
            ? ['-c', `url.file://${bare}.insteadOf=${url}`, ...argv]
            : argv,
          opts,
        ),
    }

    vi.stubEnv('GIT_DIR', join(project, '.git'))
    let r: { code: number; out: string; err: string }
    try {
      r = await runWith({ git: viaBare }, 'update', '--repo', 'acme/api', '--apply', '--json')
    } finally {
      vi.unstubAllEnvs()
    }
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).results).toMatchObject([
      { repo: 'acme/api', number: 7, status: 'updated', pushed: true },
    ])
    // The fetch and the worktree were the target's: the rebased branch reached its origin, and
    // its own origin/topic records the push.
    const pushed = git(bare, 'rev-parse', 'refs/heads/topic')
    expect(git(bare, 'merge-base', main, pushed)).toBe(main)
    expect(git(located, 'rev-parse', 'refs/remotes/origin/topic')).toBe(pushed)
    // Nothing of the run landed in the project root.
    expect(git(project, 'for-each-ref', '--format=%(refname)', 'refs/remotes/origin')).toBe('')
    expect(git(project, 'branch', '--list', 'pr-update/*')).toBe('')
    expect(git(project, 'worktree', 'list', '--porcelain').split('\n\n')).toHaveLength(1)
    expect(existsSync(join(project, '.git', 'worktrees'))).toBe(false)
  })
})

describe('fetching a located checkout', () => {
  /**
   * A bare origin a commit ahead of what the checkout last fetched, with a tag on its tip, and a
   * git that sends the checkout's fetches there. The checkout is left on a detached HEAD.
   */
  function bareOrigin(): { tip: string; viaBare: CommandRunner } {
    const bare = join(scratch, 'remote', 'api.git')
    git(scratch, 'init', '-q', '--bare', bare)
    const before = git(located, 'rev-parse', 'refs/remotes/origin/main')
    git(located, 'push', '-q', bare, `${before}:refs/heads/main`, `${topic}:refs/heads/topic`)
    git(located, 'checkout', '-q', '--detach', before)
    const tip = makeGitFixture({ dir: located }).commit('main again', { 'n.txt': 'n' })
    git(located, 'push', '-q', bare, `${tip}:refs/heads/main`)
    git(bare, 'tag', 'v1', tip)
    // The scan reads origin as GitHub's; the fetch is sent to the bare repository instead.
    const real = spawnRunner('git')
    const viaBare: CommandRunner = {
      run: (argv, opts): CommandResult =>
        real.run(
          argv[0] === 'fetch'
            ? ['-c', `url.file://${bare}.insteadOf=https://github.com/Acme/API.git`, ...argv]
            : argv,
          opts,
        ),
    }
    return { tip, viaBare }
  }

  /** A ref the checkout's own fetch line keeps under origin/, with no branch behind it. */
  function keepPr1(): void {
    git(
      located,
      'config',
      '--add',
      'remote.origin.fetch',
      '+refs/pull/*/head:refs/remotes/origin/pr/*',
    )
    git(located, 'update-ref', 'refs/remotes/origin/pr/1', topic)
  }

  test('writes only its branches into origin/*: no tags, no FETCH_HEAD, no pruning', async () => {
    const { tip, viaBare } = bareOrigin()
    keepPr1()

    const r = await runWith(
      { git: viaBare },
      'survey',
      '--repo',
      'acme/api',
      '--remote',
      'upstream',
      '--json',
    )
    expect(r.code).toBe(EXIT.ok)
    const out = JSON.parse(r.out)
    expect(out.repos[0]).toMatchObject({ fetched: true, checkout: { source: 'located' } })
    expect(git(located, 'rev-parse', 'refs/remotes/origin/main')).toBe(tip)
    expect(out.prs[0]).toMatchObject({ number: 7, behind: 2 })
    expect(git(located, 'tag', '--list')).toBe('')
    expect(existsSync(join(located, '.git', 'FETCH_HEAD'))).toBe(false)
    expect(git(located, 'rev-parse', 'refs/remotes/origin/pr/1')).toBe(topic)
  })

  test.each([
    ['an unscoped', []],
    ['a scoped', ['--pr', 'acme/api#7']],
  ])(
    '%s fetch leaves a local branch its own fetch line maps into refs/heads/',
    async (_, scope) => {
      const { viaBare } = bareOrigin()
      // `topic` here carries a commit its remote does not have; git would force it back to the
      // remote's through this line, which it applies to every fetch from origin.
      git(located, 'config', '--add', 'remote.origin.fetch', '+refs/heads/topic:refs/heads/topic')
      const mine = makeGitFixture({ dir: located })
      git(located, 'checkout', '-q', 'topic')
      const unpushed = mine.commit('not pushed', { 'u.txt': 'u' })
      git(located, 'checkout', '-q', '--detach')

      const r = await runWith(
        { git: viaBare },
        'survey',
        '--repo',
        'acme/api',
        ...scope,
        '--remote',
        'upstream',
        '--json',
      )
      expect(r.code).toBe(EXIT.ok)
      expect(JSON.parse(r.out).repos[0]).toMatchObject({ fetched: true })
      expect(git(located, 'rev-parse', 'refs/heads/topic')).toBe(unpushed)
      expect(git(located, 'rev-parse', 'refs/remotes/origin/topic')).toBe(topic)
    },
  )

  test.each(['fetch.prune', 'remote.origin.prune'])(
    'keeps a ref its own fetch line keeps under origin/ with %s set',
    async (key) => {
      const { tip, viaBare } = bareOrigin()
      keepPr1()
      git(located, 'config', key, 'true')

      const r = await runWith(
        { git: viaBare },
        'survey',
        '--repo',
        'acme/api',
        '--remote',
        'upstream',
        '--json',
      )
      expect(r.code).toBe(EXIT.ok)
      expect(git(located, 'rev-parse', 'refs/remotes/origin/main')).toBe(tip)
      expect(git(located, 'rev-parse', 'refs/remotes/origin/pr/1')).toBe(topic)
    },
  )
})

describe('the host of a bare owner/name', () => {
  test("is the project root's GitHub Enterprise host under code_host.override: github", async () => {
    git(project, 'remote', 'set-url', 'origin', 'https://github.acme.com/o/r.git')
    writeFileSync(join(project, 'pr-update.yaml'), 'code_host:\n  override: github\n')
    git(located, 'remote', 'set-url', 'origin', 'https://github.acme.com/acme/api.git')
    const r = await run(
      'survey',
      '--repo',
      'acme/api',
      '--repo',
      'acme/gone',
      '--no-fetch',
      '--json',
    )
    expect(r.code).toBe(EXIT.ok)
    const out = JSON.parse(r.out)
    // Found on that host, listed there, and reported by owner/name.
    expect(out.repos[0]).toMatchObject({ repo: 'acme/api', checkout: { path: located } })
    const listing = asked.find((c) => c.argv.includes('acme/api'))
    expect(listing?.host).toBe('github.acme.com')
    expect(out.prs[0]).toMatchObject({ repo: 'acme/api', number: 7 })
    expect(r.err).toContain('github.acme.com/acme/gone: no checkout under')
  })

  test.each([
    ['with a Forgejo token', 't'],
    ['with no Forgejo token', ''],
  ])(
    'is github.com when the project root is on Forgejo, %s, and listed by gh',
    async (_, token) => {
      git(project, 'remote', 'set-url', 'origin', 'https://git.example.com/o/r.git')
      vi.stubEnv('FORGEJO_TOKEN', token)
      let curled = 0
      const curl: CommandRunner = {
        run: (): CommandResult => {
          curled++
          return { exitCode: 0, stdout: '[]\nHTTPSTATUS:200', stderr: '' }
        },
      }
      try {
        const r = await runWith({ curl }, 'survey', '--repo', 'acme/gone', '--no-fetch', '--json')
        expect(r.code).toBe(EXIT.ok)
        expect(r.err).toContain('github.com/acme/gone: no checkout under')
        expect(r.err).not.toContain('git.example.com/acme/gone')
        expect(curled).toBe(0)
        const listing = asked.find((c) => c.argv.includes('acme/gone'))
        expect(listing?.host).toBe('github.com')
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )
})

describe('the host a target is listed on', () => {
  test('is named for github.com too, over a GH_HOST in the environment', async () => {
    vi.stubEnv('GH_HOST', 'ghe.example')
    try {
      const r = await run('survey', '--repo', 'github.com/acme/api', '--no-fetch', '--json')
      expect(r.code).toBe(EXIT.ok)
      const listing = asked.find((c) => c.argv.includes('acme/api'))
      expect(listing?.host).toBe('github.com')
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test("is listed through the project root's code host when it shares the root's host", async () => {
    git(project, 'remote', 'set-url', 'origin', 'https://git.example.com/o/r.git')
    git(located, 'remote', 'set-url', 'origin', 'https://git.example.com/acme/api.git')
    vi.stubEnv('FORGEJO_TOKEN', 't')
    const urls: string[] = []
    const curl: CommandRunner = {
      run: (argv): CommandResult => {
        urls.push(argv.join(' '))
        return { exitCode: 0, stdout: '[]\nHTTPSTATUS:200', stderr: '' }
      },
    }
    try {
      const r = await runWith(
        { curl },
        'survey',
        '--repo',
        'git.example.com/acme/api',
        '--no-fetch',
        '--json',
      )
      expect(r.code).toBe(EXIT.ok)
      expect(JSON.parse(r.out).repos[0]).toMatchObject({ checkout: { path: located } })
      expect(asked.some((c) => c.argv.includes('acme/api'))).toBe(false)
      expect(urls.some((u) => u.includes('git.example.com') && u.includes('acme/api'))).toBe(true)
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe("the project root's host", () => {
  /** A `curl` that answers every Forgejo call with no PRs, and records each argv. */
  function forgejo(): { curl: CommandRunner; calls: string[] } {
    const calls: string[] = []
    return {
      calls,
      curl: {
        run: (argv): CommandResult => {
          calls.push(argv.join(' '))
          return { exitCode: 0, stdout: '[]\nHTTPSTATUS:200', stderr: '' }
        },
      },
    }
  }

  /** An `ssh` that answers `ssh -G` from `hosts`, and fails for an alias it lacks; records each alias. */
  function sshWith(hosts: Record<string, string>): { ssh: CommandRunner; asked: string[] } {
    const asked: string[] = []
    return {
      asked,
      ssh: {
        run: (argv): CommandResult => {
          const alias = argv[argv.length - 1] ?? ''
          asked.push(alias)
          const host = hosts[alias]
          return host === undefined
            ? { exitCode: 255, stdout: '', stderr: `ssh: Could not resolve hostname ${alias}` }
            : { exitCode: 0, stdout: `host ${alias}\nhostname ${host}\nport 22\n`, stderr: '' }
        },
      },
    }
  }

  test('is compared without a port', async () => {
    git(project, 'remote', 'set-url', 'origin', 'http://forgejo.local:3000/o/r.git')
    vi.stubEnv('FORGEJO_TOKEN', 't')
    const { curl, calls } = forgejo()
    try {
      const r = await runWith(
        { curl },
        'survey',
        '--repo',
        'forgejo.local:3000/x/y',
        '--no-fetch',
        '--json',
      )
      expect(r.code).toBe(EXIT.ok)
      // Listed through the project root's Forgejo, not gh.
      expect(calls.some((c) => c.includes('forgejo.local:3000') && c.includes('x/y'))).toBe(true)
      expect(asked.some((c) => c.argv.includes('x/y'))).toBe(false)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  test('behind an SSH config alias is the host ssh resolves it to', async () => {
    git(project, 'remote', 'set-url', 'origin', 'git@github-work:o/r.git')
    writeFileSync(join(project, 'pr-update.yaml'), 'code_host:\n  override: github\n')
    const { ssh, asked: aliases } = sshWith({ 'github-work': 'github.com' })
    const r = await runWith({ ssh }, 'survey', '--repo', 'acme/api', '--no-fetch', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(aliases).toEqual(['github-work'])
    // The bare owner/name means github.com: found there, and listed there.
    expect(JSON.parse(r.out).repos[0]).toMatchObject({ checkout: { path: located } })
    expect(asked.find((c) => c.argv.includes('acme/api'))?.host).toBe('github.com')
  })

  test('behind an SSH config alias ssh cannot resolve is read as written, with a note', async () => {
    git(project, 'remote', 'set-url', 'origin', 'git@github-work:o/r.git')
    writeFileSync(join(project, 'pr-update.yaml'), 'code_host:\n  override: github\n')
    const { ssh } = sshWith({})
    const r = await runWith({ ssh }, 'survey', '--repo', 'acme/api', '--no-fetch', '--json')
    expect(r.code).toBe(EXIT.ok)
    expect(r.err).toContain('ssh -G github-work failed, so the host github-work is read as written')
    expect(r.err).toContain('github-work/acme/api: no checkout under')
    expect(asked.find((c) => c.argv.includes('acme/api'))?.host).toBe('github-work')
  })

  test("is origin's, which the code host is picked from, whatever --remote names", async () => {
    // origin on Forgejo, upstream (the --remote) on github.com.
    git(project, 'remote', 'set-url', 'origin', 'https://git.example.com/o/r.git')
    vi.stubEnv('FORGEJO_TOKEN', 't')
    const { curl, calls } = forgejo()
    try {
      const r = await runWith(
        { curl },
        'survey',
        '--remote',
        'upstream',
        '--repo',
        'acme/api',
        '--no-fetch',
        '--json',
      )
      expect(r.code).toBe(EXIT.ok)
      // A bare owner/name on a Forgejo origin means github.com, listed by gh, not Forgejo.
      expect(JSON.parse(r.out).repos[0]).toMatchObject({ checkout: { path: located } })
      expect(calls).toEqual([])
      expect(asked.find((c) => c.argv.includes('acme/api'))?.host).toBe('github.com')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
