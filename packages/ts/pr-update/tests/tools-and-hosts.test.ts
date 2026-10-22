/**
 * A missing or failing tool must not read as "no open PRs", and the CLI picks
 * GitHub or Forgejo from the remote. Every tool is a fake: no real `gh`,
 * `curl` or network.
 */

import { afterAll, afterEach, beforeEach, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import type { CodeHost } from '@osdlc/code-host'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { main, type CliSeams } from '../src/cli.ts'
import { prUpdateConfigSchema } from '../src/config.ts'
import { PrListError, remoteSlug, runSurvey } from '../src/survey.ts'
import { EXIT_CODE_HOST, EXIT_MISSING_TOOL, EXIT_NO_REMOTE } from '../src/preflight.ts'
import { allToolsInstalled, emptyGh } from './support.ts'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** A repo whose `origin` is `remote` (none when null), plus an isolated environment. */
function repoWith(
  remote: string | null,
  config?: string,
): { dir: string; env: Record<string, string> } {
  const repo = makeGitFixture({ dir: mkdtempSync(join(tmpdir(), 'pr-update-hosts-')) })
  dirs.push(repo.dir)
  repo.commit('init', { 'a.txt': 'a' })
  if (remote !== null) repo.git.remoteAdd('origin', remote)
  if (config !== undefined) writeFileSync(join(repo.dir, 'pr-update.yaml'), config)
  return {
    dir: repo.dir,
    env: { PATH: process.env.PATH ?? '', XDG_STATE_HOME: join(repo.dir, '.st') },
  }
}

const without =
  (...missing: string[]) =>
  (binary: string): string | undefined =>
    missing.includes(binary) ? undefined : allToolsInstalled(binary)

/** A runner that fails every call, as a missing or signed-out binary does. */
const failing: CommandRunner = {
  run: (): CommandResult => ({ exitCode: 1, stdout: '', stderr: 'boom' }),
}

/** Records the argv of every call and answers an empty Forgejo PR list. */
function fakeCurl(): { runner: CommandRunner; calls: string[][] } {
  const calls: string[][] = []
  return {
    calls,
    runner: {
      run: (argv): CommandResult => {
        calls.push([...argv])
        return { exitCode: 0, stdout: '[]\nHTTPSTATUS:200', stderr: '' }
      },
    },
  }
}

async function run(
  dir: string,
  env: Record<string, string>,
  argv: string[],
  seams: CliSeams,
): Promise<{ code: number; out: string; err: string }> {
  const ctx = captureContext({ cwd: dir, env })
  const code = await main(argv, ctx, seams)
  return { code, out: ctx.io.out, err: ctx.io.err }
}

const GITHUB = 'https://github.com/o/r.git'
const FORGEJO = 'https://git.example.com/o/r.git'

describe('a missing tool', () => {
  test.each(['survey', 'update'])(
    '%s without gh says so and exits EXIT_MISSING_TOOL',
    async (sub) => {
      const { dir, env } = repoWith(GITHUB)
      const r = await run(dir, env, [sub], { which: without('gh') })
      expect(r.code).toBe(EXIT_MISSING_TOOL)
      expect(r.err).toBe(
        'pr-update needs the GitHub CLI (gh) on PATH to read pull requests. Install it from https://cli.github.com, then run `gh auth login`.\n',
      )
      expect(r.out).not.toContain('no open PRs')
    },
  )

  test('without git says so, even with gh missing too', async () => {
    const { dir, env } = repoWith(GITHUB)
    const r = await run(dir, env, ['survey'], { which: without('git', 'gh') })
    expect(r.code).toBe(EXIT_MISSING_TOOL)
    expect(r.err).toBe('pr-update needs git on PATH. Install it from https://git-scm.com.\n')
  })

  test('a bare --branch without git names git, not the branch', async () => {
    const { dir, env } = repoWith(GITHUB)
    const r = await run(dir, env, ['update', '--branch'], {
      which: without('git'),
      git: failing,
    })
    expect(r.code).toBe(EXIT_MISSING_TOOL)
    expect(r.err).toContain('needs git on PATH')
  })

  test('a Forgejo remote without curl asks for curl, not gh', async () => {
    const { dir, env } = repoWith(FORGEJO)
    const r = await run(dir, env, ['survey'], { which: without('curl') })
    expect(r.code).toBe(EXIT_MISSING_TOOL)
    expect(r.err).toBe('pr-update needs curl on PATH to talk to Forgejo.\n')
  })

  test('a Forgejo remote does not need gh', async () => {
    const { dir, env } = repoWith(FORGEJO)
    const prev = process.env['FORGEJO_TOKEN']
    process.env['FORGEJO_TOKEN'] = 't'
    try {
      const r = await run(dir, env, ['survey'], {
        which: without('gh'),
        curl: fakeCurl().runner,
      })
      expect(r.code).toBe(EXIT.ok)
    } finally {
      if (prev === undefined) delete process.env['FORGEJO_TOKEN']
      else process.env['FORGEJO_TOKEN'] = prev
    }
  })

  test('config and --help need no tools', async () => {
    const { dir, env } = repoWith(GITHUB)
    const seams = { which: without('git', 'gh', 'curl') }
    expect((await run(dir, env, ['config', 'list'], seams)).code).toBe(EXIT.ok)
    expect((await run(dir, env, ['survey', '--help'], seams)).code).toBe(EXIT.ok)
    expect((await run(dir, env, ['--help'], seams)).code).toBe(EXIT.ok)
  })
})

describe('a missing remote', () => {
  test('is named, not read as no PRs', async () => {
    const { dir, env } = repoWith(null)
    const r = await run(dir, env, ['survey'], { which: allToolsInstalled, gh: emptyGh })
    expect(r.code).toBe(EXIT_NO_REMOTE)
    expect(r.err).toContain("could not read the git remote 'origin'")
    expect(r.out).toBe('')
  })

  test('--repo does not need a local remote', async () => {
    const { dir, env } = repoWith(null)
    const r = await run(dir, env, ['survey', '--repo', 'o/r'], {
      which: allToolsInstalled,
      gh: emptyGh,
    })
    expect(r.code).toBe(EXIT.ok)
  })
})

describe('a failed listing', () => {
  test('survey is an error naming the repository, not "no open PRs"', async () => {
    const { dir, env } = repoWith(GITHUB)
    const r = await run(dir, env, ['survey'], { which: allToolsInstalled, gh: failing })
    expect(r.code).toBe(EXIT_CODE_HOST)
    expect(r.err).toBe(
      'pr-update could not list pull requests for o/r: gh failed. Check `gh auth status` and your network.\n',
    )
    expect(r.out).toBe('')
  })

  test('update --branch reports the failure, not a missing PR', async () => {
    const { dir, env } = repoWith(GITHUB)
    const r = await run(dir, env, ['update', '--branch', 'main'], {
      which: allToolsInstalled,
      gh: failing,
    })
    expect(r.code).toBe(EXIT_CODE_HOST)
    expect(r.err).toContain('could not list pull requests for o/r')
    expect(r.err).not.toContain('no open PR')
  })

  test('--report holds {error} and the same message', async () => {
    const { dir, env } = repoWith(GITHUB)
    const file = join(dir, 'out.json')
    writeFileSync(file, '{"stale":true}')
    const r = await run(dir, env, ['update', '--report', file], {
      which: allToolsInstalled,
      gh: failing,
    })
    expect(r.code).toBe(EXIT_CODE_HOST)
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      error: expect.stringContaining('could not list pull requests for o/r'),
    })
  })

  test('a refusal for a missing tool writes no report', async () => {
    const { dir, env } = repoWith(GITHUB)
    const file = join(dir, 'out.json')
    await run(dir, env, ['update', '--report', file], { which: without('gh') })
    expect(existsSync(file)).toBe(false)
  })

  test('a Forgejo failure points at the token and host', async () => {
    const { dir, env } = repoWith(FORGEJO)
    const prev = process.env['FORGEJO_TOKEN']
    process.env['FORGEJO_TOKEN'] = 't'
    try {
      const r = await run(dir, env, ['survey'], { which: allToolsInstalled, curl: failing })
      expect(r.code).toBe(EXIT_CODE_HOST)
      expect(r.err).toContain('could not list pull requests for o/r')
      expect(r.err).toContain('FORGEJO_TOKEN')
    } finally {
      if (prev === undefined) delete process.env['FORGEJO_TOKEN']
      else process.env['FORGEJO_TOKEN'] = prev
    }
  })
})

describe('host selection', () => {
  let saved: string | undefined
  beforeEach(() => {
    saved = process.env['FORGEJO_TOKEN']
  })
  afterEach(() => {
    if (saved === undefined) delete process.env['FORGEJO_TOKEN']
    else process.env['FORGEJO_TOKEN'] = saved
  })

  test('a Forgejo remote with a token lists through curl, not gh', async () => {
    process.env['FORGEJO_TOKEN'] = 'secret'
    const { dir, env } = repoWith(FORGEJO)
    const curl = fakeCurl()
    const r = await run(dir, env, ['survey', '--no-fetch'], {
      which: allToolsInstalled,
      gh: failing,
      curl: curl.runner,
    })
    expect(r.code).toBe(EXIT.ok)
    expect(r.out).toContain('no open PRs')
    expect(
      curl.calls.some((a) =>
        a.join(' ').includes('https://git.example.com/api/v1/repos/o/r/pulls'),
      ),
    ).toBe(true)
  })

  test('a Forgejo remote without a token names the variable', async () => {
    delete process.env['FORGEJO_TOKEN']
    const { dir, env } = repoWith(FORGEJO)
    const r = await run(dir, env, ['survey'], { which: allToolsInstalled, curl: fakeCurl().runner })
    expect(r.code).toBe(EXIT_CODE_HOST)
    expect(r.err).toContain('set FORGEJO_TOKEN')
  })

  test('code_host.override: github uses gh on a non-github remote', async () => {
    delete process.env['FORGEJO_TOKEN']
    const { dir, env } = repoWith(FORGEJO, 'code_host:\n  override: github\n')
    const curl = fakeCurl()
    const r = await run(dir, env, ['survey', '--no-fetch'], {
      which: without('curl'),
      gh: emptyGh,
      curl: curl.runner,
    })
    expect(r.code).toBe(EXIT.ok)
    expect(curl.calls).toEqual([])
  })

  test('code_host.override: forgejo uses curl on a github remote', async () => {
    process.env['FORGEJO_TOKEN'] = 'secret'
    const { dir, env } = repoWith(GITHUB, 'code_host:\n  override: forgejo\n')
    const r = await run(dir, env, ['survey', '--no-fetch'], {
      which: without('gh'),
      gh: failing,
      curl: fakeCurl().runner,
    })
    // The github.com remote cannot name a Forgejo host to build the adapter from,
    // but the override is honoured: the adapter is built, so gh is never needed.
    expect(r.code).toBe(EXIT.ok)
  })

  test('a GitHub remote still lists through gh', async () => {
    const { dir, env } = repoWith(GITHUB)
    const r = await run(dir, env, ['survey', '--no-fetch'], {
      which: without('curl'),
      gh: emptyGh,
    })
    expect(r.code).toBe(EXIT.ok)
    expect(r.out).toContain('PR-SURVEY: no open PRs')
  })
})

describe('the engine', () => {
  test('remoteSlug reads a self-hosted remote, not only the well-known hosts', () => {
    expect(remoteSlug('https://git.example.com/o/r.git')).toBe('o/r')
    expect(remoteSlug('git@git.example.com:o/r.git')).toBe('o/r')
    expect(remoteSlug('https://github.com/o/r.git')).toBe('o/r')
    expect(remoteSlug('not a url')).toBeNull()
  })

  test('runSurvey throws PrListError when the host cannot list, never an empty report', () => {
    const { dir } = repoWith(GITHUB)
    const codeHost = {
      listPrDetails: () => ({ ok: false, error: { kind: 'exit', message: 'x', host: 'github' } }),
    } as unknown as CodeHost
    expect(() =>
      runSurvey(
        { repo: [], noFetch: true, noDrafts: false, limit: 10, remote: 'origin', pr: [] },
        {
          projectRoot: dir,
          dryRun: false,
          git: spawnRunner('git'),
          gh: failing,
          codeHost: () => codeHost,
          cfg: prUpdateConfigSchema.parse({}),
          ports: { locate: () => null },
        },
      ),
    ).toThrow(PrListError)
  })
})

describe('an unreadable remote url', () => {
  test('is named, not read as no PRs', async () => {
    const { dir, env } = repoWith('not a url')
    const r = await run(dir, env, ['survey'], { which: allToolsInstalled, gh: emptyGh })
    expect(r.code).toBe(EXIT_NO_REMOTE)
    expect(r.err).toContain('could not tell which repository')
  })
})
