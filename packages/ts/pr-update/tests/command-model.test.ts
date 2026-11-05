/**
 * `survey` and `update` on cli-tool's command model: the top-level surface,
 * the JSON documents and their contracts, the error documents, and the
 * declarations an adapter reads. The flags and the runs themselves are
 * covered by the other CLI tests.
 */

import { afterAll, describe, expect, test } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { EXIT, captureContext } from '@osdlc/cli-tool'
import { ErrorDocumentSchema } from '@osdlc/cli-tool/command'
import { CONFIG_INVALID_EXIT, overlayPath } from '@osdlc/config-layers'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { PR_UPDATE_CONFIG_FILE, createApp, expandBareBranch, main } from '../src/cli.ts'
import { FIXTURE_REMOTE, fakeTools } from './support.ts'

const dirs: string[] = []
afterAll(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true })
})

/** An explicit environment: no ambient PR_UPDATE_CONFIG, trust state in a temp dir. */
function isolatedEnv(root: string): Record<string, string> {
  return { PATH: process.env.PATH ?? '', XDG_STATE_HOME: join(root, 'state') }
}

/** A repository with a github origin and, when given, a `pr-update.local.yaml`. */
function project(local?: string): { dir: string; env: Record<string, string> } {
  const repo = makeGitFixture({ dir: mkdtempSync(join(tmpdir(), 'pr-update-model-')) })
  dirs.push(repo.dir)
  repo.commit('init', { 'a.txt': 'a' })
  repo.git.remoteAdd('origin', FIXTURE_REMOTE)
  if (local !== undefined)
    writeFileSync(join(repo.dir, overlayPath(PR_UPDATE_CONFIG_FILE.name)), local)
  return { dir: repo.dir, env: isolatedEnv(repo.dir) }
}

/** Run through an app that checks every document against its contract. */
async function checked(dir: string, env: Record<string, string>, ...argv: string[]) {
  const ctx = captureContext({ cwd: dir, env })
  const code = await createApp(fakeTools, { checkOutput: true }).run(argv, ctx)
  return { code, out: ctx.io.out, err: ctx.io.err }
}

async function run(dir: string, env: Record<string, string>, ...argv: string[]) {
  const ctx = captureContext({ cwd: dir, env })
  const code = await main(argv, ctx, fakeTools)
  return { code, out: ctx.io.out, err: ctx.io.err }
}

describe('the top level', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'pr-update-model-top-'))
  dirs.push(cwd)
  const env = isolatedEnv(cwd)

  test('pr-update alone lists the commands on stdout and exits 0', async () => {
    const r = await run(cwd, env)
    expect(r.code).toBe(EXIT.ok)
    expect(r.err).toBe('')
    for (const name of ['survey', 'update', 'config', 'trust']) {
      expect(r.out).toMatch(new RegExp(`^\\s+${name}\\s`, 'm'))
    }
  })

  test('--help is the same list', async () => {
    const r = await run(cwd, env, '--help')
    expect(r.code).toBe(EXIT.ok)
    expect(r.out).toBe((await run(cwd, env)).out)
  })

  test('an unknown command is a usage error that suggests the close one', async () => {
    const r = await run(cwd, env, 'survy')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain("unknown command 'survy'; did you mean survey?")
    expect(r.out).toBe('')
  })

  test('survey --help and update --help exit 0 and need no tools', async () => {
    for (const verb of ['survey', 'update']) {
      const ctx = captureContext({ cwd, env })
      // `which` finds nothing: help must not reach the preflight.
      expect(await main([verb, '--help'], ctx, { which: () => undefined })).toBe(EXIT.ok)
      expect(ctx.io.out).toContain(`usage: pr-update ${verb} [options]`)
      expect(ctx.io.out).toContain('--branch <name>')
      expect(ctx.io.out).not.toContain('--current-branch')
    }
  })

  test('help --full documents the exit codes and examples', async () => {
    const r = await run(cwd, env, 'help', 'update', '--full')
    expect(r.code).toBe(EXIT.ok)
    expect(r.out).toMatch(/^\s+14\s+the config file is invalid/m)
    expect(r.out).toMatch(/^\s+21\s+refused/m)
    expect(r.out).toContain('pr-update update --branch --apply')
  })
})

describe('the JSON documents', () => {
  test('survey --json is the survey report with schemaVersion and kind', async () => {
    const { dir, env } = project()
    const r = await checked(dir, env, 'survey', '--no-fetch', '--json')
    expect(r.code).toBe(EXIT.ok)
    const doc = JSON.parse(r.out)
    expect(doc).toMatchObject({ schemaVersion: 1, kind: 'survey', prs: [] })
    expect(Object.keys(doc).slice(0, 2)).toEqual(['schemaVersion', 'kind'])
    createApp().documentContract(['survey']).parse(doc)
  })

  test('--output json is --json', async () => {
    const { dir, env } = project()
    const a = await checked(dir, env, 'survey', '--no-fetch', '--json')
    const b = await checked(dir, env, 'survey', '--no-fetch', '--output', 'json')
    expect(b).toEqual(a)
  })

  test('update --json is the update result with schemaVersion and kind', async () => {
    const { dir, env } = project()
    const r = await checked(dir, env, 'update', '--no-fetch', '--json')
    expect(r.code).toBe(EXIT.ok)
    const doc = JSON.parse(r.out)
    expect(doc).toMatchObject({ schemaVersion: 1, kind: 'update', applied: false })
    createApp().documentContract(['update']).parse(doc)
  })

  test('the text form is the same report as before, with no JSON', async () => {
    const { dir, env } = project()
    const r = await checked(dir, env, 'survey', '--no-fetch')
    expect(r.code).toBe(EXIT.ok)
    expect(r.out).toContain('no open PRs')
    expect(r.out).not.toContain('schemaVersion')
  })

  test('--output jsonl is refused: each command prints one document', async () => {
    const { dir, env } = project()
    for (const verb of ['survey', 'update']) {
      const r = await run(dir, env, verb, '--output', 'jsonl')
      expect(r.code).toBe(EXIT.usage)
      expect(r.err).toContain(`'pr-update ${verb}' prints one document; use --json`)
    }
  })

  test('--json with --output text is refused as two forms', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'survey', '--json', '--output', 'text')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain('--json and --output text ask for different forms')
  })
})

describe('failures', () => {
  test('a usage error under --json also prints the error document', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'survey', '--limit', 'abc', '--json')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain("pr-update: --limit must be an integer, got 'abc'")
    expect(ErrorDocumentSchema.parse(JSON.parse(r.out))).toMatchObject({
      code: 'usage',
      exit: EXIT.usage,
    })
  })

  test('an invalid config exits 14 from survey and update, with the config-invalid code', async () => {
    const { dir, env } = project('pr_update:\n  no_such_key: 1\n')
    for (const verb of ['survey', 'update']) {
      const r = await run(dir, env, verb, '--json')
      expect(r.code).toBe(CONFIG_INVALID_EXIT)
      expect(r.err).toMatch(/^pr-update: /)
      expect(JSON.parse(r.out)).toMatchObject({ kind: 'error', code: 'config-invalid', exit: 14 })
    }
  })

  test('a named --branch and a bare one together are refused', async () => {
    const { dir, env } = project()
    const r = await run(dir, env, 'survey', '--branch', 'main', '--branch')
    expect(r.code).toBe(EXIT.usage)
    expect(r.err).toContain('--branch names one branch; give it once')
  })

  test('an unexpected error is one line and exit 1, not a throw', async () => {
    const { dir, env } = project('pr_update:\n  verify: test\n  test_command: null\n')
    const r = await run(dir, env, 'update', '--json')
    expect(r.code).toBe(EXIT.error)
    expect(r.err).toMatch(/^pr-update: verify: test needs test_command[^\n]*\n$/)
    expect(JSON.parse(r.out)).toMatchObject({ kind: 'error', code: 'error', exit: 1 })
  })
})

describe('the declarations an adapter reads', () => {
  const app = createApp(fakeTools)
  const cwd = mkdtempSync(join(tmpdir(), 'pr-update-model-call-'))
  dirs.push(cwd)

  test('survey is read-only; update is destructive and cli-only for some inputs', () => {
    const byPath = new Map(app.schema().map((e) => [e.path.join(' '), e]))
    expect(byPath.get('survey')).toMatchObject({ readOnly: true, exposure: 'all', kind: 'survey' })
    expect(byPath.get('update')).toMatchObject({
      destructive: true,
      exposure: 'by-input',
      kind: 'update',
    })
  })

  test.each([
    ['trust', { trust: true }],
    ['repairAgent', { repairAgent: 'claude' }],
    ['repairCommand', { repairCommand: 'true' }],
  ])('an adapter may not give consent on the command line: %s', async (_, args) => {
    const r = await app.call(['update'], args, { cwd, env: isolatedEnv(cwd) }, { surface: 'mcp' })
    expect(r).toMatchObject({ status: 'refused', reason: 'cli-only' })
  })

  test('an adapter call takes currentBranch where the command line takes a bare --branch', () => {
    const props = (app.argsSchema(['survey']) as { properties: Record<string, unknown> }).properties
    expect(Object.keys(props)).toEqual(expect.arrayContaining(['branch', 'currentBranch']))
  })
})

describe('expandBareBranch', () => {
  test.each([
    [
      ['survey', '--branch'],
      ['survey', '--current-branch'],
    ],
    [
      ['update', '--branch', '--apply'],
      ['update', '--current-branch', '--apply'],
    ],
    [
      ['update', '--branch', '--', 'x'],
      ['update', '--current-branch', '--', 'x'],
    ],
    [
      ['--output', 'json', 'survey', '--branch'],
      ['--output', 'json', 'survey', '--current-branch'],
    ],
    [
      ['--json', 'survey', '--branch'],
      ['--json', 'survey', '--current-branch'],
    ],
  ])('%j becomes %j', (argv, want) => {
    expect(expandBareBranch(argv)).toEqual(want)
  })

  test.each([
    [['survey', '--branch', 'main']],
    [['update', '--', '--branch']],
    [['config', 'get', '--branch']],
    [['--branch']],
    [[]],
  ])('%j is left as it is', (argv) => {
    expect(expandBareBranch(argv)).toEqual(argv)
  })
})
