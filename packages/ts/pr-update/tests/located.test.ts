/**
 * A `--repo` target with a checkout on this machine, through the CLI: survey
 * measures it there, through its `origin`, and reports where; update leaves
 * it alone until it can run in one.
 */

import { afterEach, beforeEach, describe, expect, test } from 'vitest'
import { existsSync, mkdtempSync, realpathSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import type { CommandRunner } from '@osdlc/command-seam'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { main } from '../src/cli.ts'
import { allToolsInstalled, isolatedEnv } from './support.ts'

let scratch: string
let project: string
let located: string
let topic: string

beforeEach(() => {
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
  run: (argv) => ({
    exitCode: 0,
    stderr: '',
    stdout: JSON.stringify(
      argv.includes('acme/api')
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
  }),
}

async function run(...argv: string[]): Promise<{ code: number; out: string; err: string }> {
  const ctx = captureContext({ cwd: project, env: isolatedEnv(join(scratch, 'env')) })
  const code = await main(argv, ctx, { which: allToolsInstalled, gh })
  return { code, out: ctx.io.out, err: ctx.io.err }
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
