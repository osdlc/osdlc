/**
 * A run started with `GIT_DIR`, `GIT_WORK_TREE` or another variable that picks a repository:
 * survey and update go ahead only when the variables find the checkout the run is in, as a git
 * hook's `GIT_DIR` does, and refuse with exit 2 before they list or fetch anything otherwise.
 */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXIT, EXIT_FAILURE, captureContext } from '@osdlc/cli-tool'
import { spawnRunner, type CommandResult, type CommandRunner } from '@osdlc/command-seam'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { main, type CliSeams } from '../src/cli.ts'
import { allToolsInstalled, isolatedEnv } from './support.ts'

let scratch: string
let project: string
let topic: string
/** The argv of every `gh` call. */
let asked: string[][]

beforeEach(() => {
  asked = []
  scratch = realpathSync.native(mkdtempSync(join(tmpdir(), 'pr-update-repo-vars-')))
  // The project root, whose `origin/topic` is one commit behind `origin/main`.
  const root = makeGitFixture({ dir: join(scratch, 'widgets') })
  root.commit('base', { 'a.txt': 'a' })
  root.git.rawChecked(['checkout', '-q', '-b', 'topic'])
  topic = root.commit('topic work', { 't.txt': 't' })
  root.git.rawChecked(['checkout', '-q', '-'])
  const main = root.commit('main moves', { 'm.txt': 'm' })
  root.git.remoteAdd('origin', 'https://github.com/o/r.git')
  root.git.rawChecked(['update-ref', 'refs/remotes/origin/main', main])
  root.git.rawChecked(['update-ref', 'refs/remotes/origin/topic', topic])
  project = root.dir
  mkdirSync(join(project, 'sub'))
})
afterEach(() => {
  vi.unstubAllEnvs()
  rmSync(scratch, { recursive: true, force: true })
})

/** A `gh` that lists one PR, #7 `topic` into `main`. */
const gh: CommandRunner = {
  run: (argv) => {
    asked.push([...argv])
    return {
      exitCode: 0,
      stderr: '',
      stdout: JSON.stringify([
        {
          number: 7,
          state: 'OPEN',
          title: 'topic',
          url: 'https://github.com/o/r/pull/7',
          baseRefName: 'main',
          headRefName: 'topic',
          headRefOid: topic,
        },
      ]),
    }
  },
}

/** Run the CLI in `cwd` with `vars` set in the environment git inherits. */
function runIn(
  cwd: string,
  vars: Record<string, string>,
  ...argv: string[]
): Promise<{ code: number; out: string; err: string }> {
  return runInWith({}, cwd, vars, ...argv)
}

/** {@link runIn}, with `seams` in place of the default ones. */
async function runInWith(
  seams: CliSeams,
  cwd: string,
  vars: Record<string, string>,
  ...argv: string[]
): Promise<{ code: number; out: string; err: string }> {
  for (const [name, value] of Object.entries(vars)) vi.stubEnv(name, value)
  const ctx = captureContext({ cwd, env: isolatedEnv(join(scratch, 'env')) })
  try {
    const code = await main(argv, ctx, { which: allToolsInstalled, gh, ...seams })
    return { code, out: ctx.io.out, err: ctx.io.err }
  } finally {
    vi.unstubAllEnvs()
  }
}

/** Run git in `dir`, and fail the test when it fails. */
function git(dir: string, ...argv: string[]): string {
  const res = spawnRunner('git').run(argv, { cwd: dir })
  if (res.exitCode !== 0) throw new Error(`git ${argv.join(' ')}: ${res.stderr}`)
  return res.stdout.trim()
}

describe('variables that point at another repository', () => {
  /** A dotfiles setup: a bare repository whose work tree is a home directory that is no checkout. */
  function dotfiles(): { home: string; vars: Record<string, string> } {
    const bare = join(scratch, 'dotfiles.git')
    const home = join(scratch, 'home')
    mkdirSync(home)
    git(scratch, 'init', '-q', '--bare', bare)
    return { home, vars: { GIT_DIR: bare, GIT_WORK_TREE: home } }
  }

  test.each(['survey', 'update'])(
    '%s refuses a bare repository and GIT_WORK_TREE, a dotfiles setup, with exit 2',
    async (verb) => {
      const { home, vars } = dotfiles()
      const r = await runIn(home, vars, verb, '--no-fetch')
      expect(r.code).toBe(EXIT.usage)
      expect(r.err).toContain(
        'pr-update runs in a git checkout; GIT_DIR and GIT_WORK_TREE are set and point elsewhere — unset them',
      )
      expect(asked).toEqual([])
    },
  )

  test.each([
    ['survey', []],
    ['update', ['--apply']],
  ])('%s refuses GIT_DIR naming another repository with exit 2', async (verb, flags) => {
    const other = makeGitFixture({ dir: join(scratch, 'other') })
    other.commit('init', { 'o.txt': 'o' })
    const before = git(other.dir, 'for-each-ref')
    const r = await runIn(project, { GIT_DIR: join(other.dir, '.git') }, verb, ...flags)
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain(
      'pr-update runs in a git checkout; GIT_DIR is set and points elsewhere — unset it',
    )
    // Nothing was listed or fetched, in either repository.
    expect(asked).toEqual([])
    expect(git(other.dir, 'for-each-ref')).toBe(before)
    expect(git(project, 'branch', '--list', 'pr-update/*')).toBe('')
  })

  test("GIT_DIR alone from a subdirectory is refused: git takes the subdirectory for the work tree's top", async () => {
    const r = await runIn(
      join(project, 'sub'),
      { GIT_DIR: join(project, '.git') },
      'survey',
      '--no-fetch',
    )
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain('GIT_DIR is set and points elsewhere — unset it')
  })
})

describe('variables that find the checkout the run is in', () => {
  test("survey goes ahead with GIT_DIR set to the root's own .git, as a git hook sets it", async () => {
    const r = await runIn(
      project,
      { GIT_DIR: join(project, '.git') },
      'survey',
      '--no-fetch',
      '--json',
    )
    expect(r.code).toBe(EXIT.ok)
    expect(JSON.parse(r.out).prs[0]).toMatchObject({ number: 7, status: 'behind', behind: 1 })
  })

  test.each([
    ['no variables', {}],
    ['GIT_DIR and GIT_WORK_TREE set to the root', 'root'],
  ] as const)('a run from a subdirectory with %s goes ahead', async (_, which) => {
    const vars = which === 'root' ? { GIT_DIR: join(project, '.git'), GIT_WORK_TREE: project } : {}
    const sub = join(project, 'sub')
    const survey = await runIn(sub, vars, 'survey', '--no-fetch', '--json')
    expect(survey.code).toBe(EXIT.ok)
    expect(JSON.parse(survey.out).prs[0]).toMatchObject({ number: 7, status: 'behind' })
    const update = await runIn(sub, vars, 'update', '--no-fetch', '--json')
    expect(update.code).toBe(EXIT.ok)
    expect(JSON.parse(update.out).results).toMatchObject([{ number: 7 }])
  })
})

describe('variables set where no checkout is found', () => {
  test('outside a checkout, GIT_CEILING_DIRECTORIES does not refuse survey --repo', async () => {
    const outside = join(scratch, 'outside')
    mkdirSync(outside)
    const r = await runIn(
      outside,
      { GIT_CEILING_DIRECTORIES: '/nonexistent' },
      'survey',
      '--repo',
      'acme/widgets',
      '--no-fetch',
      '--json',
    )
    expect(r.err).not.toContain('pr-update runs in a git checkout')
    expect(r.code).toBe(EXIT.ok)
  })

  test("without git, a run with GIT_DIR set gets preflight's missing-tool exit", async () => {
    const noGit: CommandRunner = {
      run: (): CommandResult => ({
        exitCode: 1,
        stdout: '',
        stderr: '',
        neverExited: true,
        reason: 'spawn',
        error: 'spawn git ENOENT',
      }),
    }
    const r = await runInWith(
      { git: noGit, which: (b) => (b === 'git' ? undefined : `/usr/bin/${b}`) },
      project,
      { GIT_DIR: join(project, '.git') },
      'survey',
    )
    expect(r.code).toBe(EXIT_FAILURE.missingTool)
    expect(r.err).toContain('`git` is not installed')
  })
})
