/**
 * A `--repo` target with a checkout on this machine, through the CLI: survey
 * measures it there, through its `origin`, and reports where; update leaves
 * it alone until it can run in one.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { existsSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { main, type CliSeams } from '../src/cli.ts'
import { allToolsInstalled, isolatedEnv } from './support.ts'

let scratch: string
let project: string
let located: string
let topic: string
/** The argv of every `gh` call, and the `GH_HOST` it ran with. */
let asked: { argv: string[]; host: string | undefined }[]

beforeEach(() => {
  asked = []
  scratch = realpathSync(mkdtempSync(join(tmpdir(), 'pr-update-located-')))
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

  test('update skips its PRs and writes nothing in it', async () => {
    const r = await run('update', '--repo', 'acme/api', '--no-fetch', '--json')
    expect(r.code).toBe(EXIT.ok)
    const out = JSON.parse(r.out)
    expect(out.results).toEqual([])
    expect(out.skipped).toEqual([
      {
        repo: 'acme/api',
        number: 7,
        head: 'topic',
        reason: `checked out at ${located}, which update does not run in yet; survey measures it`,
      },
    ])
    expect(existsSync(join(located, '.pr-update'))).toBe(false)
  })
})

describe('fetching a located checkout', () => {
  test('writes only its branches into origin/*: no tags, no FETCH_HEAD', async () => {
    // A bare origin a commit ahead of what the checkout last fetched, with a tag on its tip.
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
  })
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

  test('is github.com when the project root is on Forgejo', async () => {
    git(project, 'remote', 'set-url', 'origin', 'https://git.example.com/o/r.git')
    vi.stubEnv('FORGEJO_TOKEN', 't')
    const curl: CommandRunner = {
      run: (): CommandResult => ({ exitCode: 0, stdout: '[]\nHTTPSTATUS:200', stderr: '' }),
    }
    try {
      const r = await runWith({ curl }, 'survey', '--repo', 'acme/gone', '--no-fetch', '--json')
      expect(r.code).toBe(EXIT.ok)
      expect(r.err).toContain('github.com/acme/gone: no checkout under')
      expect(r.err).not.toContain('git.example.com/acme/gone')
    } finally {
      vi.unstubAllEnvs()
    }
  })
})
