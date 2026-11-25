import { mkdtempSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { captureContext, EXIT_FAILURE } from '@osdlc/cli-tool'
import { isCheckout } from '@osdlc/cli-tool/devlink'
import { describe, expect, test } from 'vitest'

import { spawnRunner } from '@osdlc/command-seam'
import { fakeRunner } from '@osdlc/command-seam/testing'

import { DEVLINK_SPEC } from '../src/cli/devlink.ts'
import type { Runners } from '../src/git/repo.ts'
import { createApp, createMain } from '../src/cli/main.ts'
import { testRepo } from './repo-fixture.ts'

async function run(cwd: string, ...argv: string[]) {
  return runWith({}, cwd, ...argv)
}

async function runWith(runners: Runners, cwd: string, ...argv: string[]) {
  const ctx = captureContext({ cwd })
  const code = await createMain(runners)(argv, ctx)
  return { code, out: ctx.io.out, err: ctx.io.err }
}

function repo() {
  const r = testRepo()
  r.commit('one', { 'src/a.ts': '// a\nexport const a = 1\n', 'docs/x.md': '# X\n' })
  r.commit('two', { 'src/a.ts': '// a\nexport const a = 2\n' })
  return r
}

describe('code-stats', () => {
  test('usage, help and an unknown command', async () => {
    const r = repo()
    expect((await run(r.dir)).code).toBe(2)
    const help = await run(r.dir, '--help')
    expect(help.code).toBe(0)
    expect(help.out).toContain('usage: code-stats <command>')
    const unknown = await run(r.dir, 'constructor')
    expect(unknown.code).toBe(2)
    expect(unknown.err).toContain("unknown command 'constructor'")
  })

  test('help, schema and --json come from the app, and each answer matches its schema', async () => {
    const r = repo()
    const help = await run(r.dir, 'help', 'count', '--full')
    expect(help.code).toBe(0)
    expect(help.out).toContain('--tree-sitter')
    expect(help.out).toContain('count --rev HEAD~10 --json')
    expect((await run(r.dir, 'diff', '--help')).out).toContain('usage: code-stats diff')

    const schema = JSON.parse((await run(r.dir, 'schema', '--json')).out)
    const kinds = schema.commands.map((c: { kind?: string }) => c.kind)
    expect(kinds).toEqual(expect.arrayContaining(['count', 'diff', 'compare', 'describe']))

    const app = createApp()
    const count = JSON.parse((await run(r.dir, 'count', '--json')).out)
    expect(count).toMatchObject({ schemaVersion: 1, kind: 'count', schema: 1 })
    expect(() => app.documentContract(['count']).parse(count)).not.toThrow()
    const diff = JSON.parse((await run(r.dir, 'diff', 'HEAD~1..HEAD', '--json')).out)
    expect(() => app.documentContract(['diff']).parse(diff)).not.toThrow()
    const compare = JSON.parse(
      (await run(r.dir, 'compare', 'HEAD~1..HEAD', 'HEAD~1..HEAD', '--json')).out,
    )
    expect(() => app.documentContract(['compare']).parse(compare)).not.toThrow()

    const bad = await run(r.dir, 'diff', 'nope..HEAD', '--json')
    expect(bad.code).toBe(2)
    expect(JSON.parse(bad.out)).toMatchObject({ kind: 'error', code: 'usage', exit: 2 })
  })

  test('count: markdown, JSON, paths relative to the working directory', async () => {
    const r = repo()
    const md = await run(r.dir, 'count')
    expect(md.code).toBe(0)
    expect(md.out).toContain('| TypeScript | 1 | 1 | 0 | 1 | 0 | 0 | 2 |')
    const json = await run(join(r.dir, 'src'), 'count', '.', '--json')
    expect(JSON.parse(json.out)).toMatchObject({ paths: ['.'], files: 1 })
    const outside = await run(r.dir, 'count', '..')
    expect(outside.code).toBe(2)
    expect(outside.err).toContain('.. is outside')
    const committed = await run(join(r.dir, 'src'), 'count', '.', '--rev', 'HEAD', '--json')
    expect(JSON.parse(committed.out)).toMatchObject({ paths: ['src'], files: 1 })
  })

  test('count --detail lists every file; a path with nothing under it is noted', async () => {
    const r = repo()
    const out = await run(r.dir, 'count', '--detail')
    expect(out.out).toContain('| `src/a.ts` | TypeScript | source |')
    const odd = await run(r.dir, 'count', 'nowhere', '--json')
    expect(JSON.parse(odd.out).notes).toContain('no files under nowhere')
  })

  test('a path whose name starts with .. is inside the repository', async () => {
    const r = repo()
    r.commit('odd', { '..odd/q.ts': 'export const q = 1\n' })
    const out = await run(r.dir, 'count', '..odd', '--json')
    expect(out.code).toBe(0)
    expect(JSON.parse(out.out).files).toBe(1)
  })

  test('count --tree-sitter reads with the syntax tree and agrees here', async () => {
    const r = repo()
    const plain = JSON.parse((await run(r.dir, 'count', '--json')).out)
    const tree = JSON.parse((await run(r.dir, 'count', '--json', '--tree-sitter')).out)
    expect(tree.kinds).toEqual(plain.kinds)
  })

  test('count --docs moves files into a group', async () => {
    const r = repo()
    const json = await run(r.dir, 'count', '--json', '--docs', 'src/**')
    expect(JSON.parse(json.out).groups.docs.files).toBe(2)
  })

  test('diff: a revision pair, the working tree, and usage errors', async () => {
    const r = repo()
    const pair = await run(r.dir, 'diff', 'HEAD~1..HEAD')
    expect(pair.code).toBe(0)
    expect(pair.out).toContain('| Logic | 0 | 1 | 0 | 0 | 0 |')
    r.write({ 'src/a.ts': '// a\nexport const a = 3\n// more\n' })
    const tree = await run(r.dir, 'diff', '--worktree', '--json')
    expect(JSON.parse(tree.out).change.label).toBe('HEAD...worktree')
    const branch = await run(r.dir, 'diff', 'HEAD~1', '--worktree', '--json')
    expect(JSON.parse(branch.out).change.label).toBe('HEAD~1...worktree')
    expect((await run(r.dir, 'diff', 'HEAD~1..HEAD', '--worktree')).code).toBe(2)
    expect((await run(r.dir, 'diff', '7', '--worktree')).code).toBe(2)
    expect((await run(r.dir, 'diff', 'HEAD~1..HEAD', '--write')).err).toContain(
      '--write needs a PR number',
    )
    const bad = await run(r.dir, 'diff', 'nope..HEAD')
    expect(bad.code).toBe(2)
    expect(bad.err).toContain("unknown revision 'nope'")
  })

  test('diff --write splices the table into the PR body', async () => {
    const r = repo()
    const base = r.git('rev-parse', 'HEAD~1')
    const head = r.git('rev-parse', 'HEAD')
    let body = 'Summary\n'
    const gh = fakeRunner((argv) => {
      if (argv.join(' ') === 'pr view 3 --json baseRefOid,headRefOid') {
        return { stdout: JSON.stringify({ baseRefOid: base, headRefOid: head }) }
      }
      if (argv[0] === 'pr' && argv[1] === 'view')
        return { stdout: JSON.stringify({ number: 3, body }) }
      if (argv[0] === 'pr' && argv[1] === 'edit') {
        body = argv[argv.indexOf('--body') + 1] ?? ''
        return { stdout: '' }
      }
      return undefined
    })
    const first = await runWith({ gh: gh.runner }, r.dir, 'diff', '3', '--write')
    expect(first.code).toBe(0)
    expect(first.err).toContain('wrote the statistics into PR #3')
    expect(body).toContain('## Change statistics')
    const again = await runWith({ gh: gh.runner }, r.dir, 'diff', '#3', '--write')
    expect(again.err).toContain('PR #3 already holds these statistics')
  })

  test('compare: two changes side by side', async () => {
    const r = repo()
    const out = await run(r.dir, 'compare', 'HEAD~1..HEAD', 'HEAD~1..HEAD')
    expect(out.code).toBe(0)
    expect(out.out).toContain('## HEAD~1..HEAD vs HEAD~1..HEAD')
    expect((await run(r.dir, 'compare', 'HEAD~1..HEAD')).code).toBe(2)
  })

  test('count reads files on disk with no repository and no git; history needs git', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'code-stats-plain-'))
    writeFileSync(join(dir, 'a.ts'), '// a\nexport const a = 1\n')
    const noGit: Runners = { git: spawnRunner('git-is-not-installed') }

    const plain = await runWith(noGit, dir, 'count', '--json')
    expect(plain.code).toBe(0)
    expect(JSON.parse(plain.out)).toMatchObject({ source: { label: 'files on disk' }, files: 1 })

    const diff = await runWith(noGit, dir, 'diff', 'HEAD~1..HEAD')
    expect(diff.code).toBe(EXIT_FAILURE.missingTool)
    expect(diff.err).toBe(
      'code-stats: git is not installed, or not on PATH Install git from https://git-scm.com.\n' +
        'diff, compare, describe and count --rev read git history; count without --rev reads the files on disk and needs no git.\n',
    )
    const rev = await run(dir, 'count', '--rev', 'HEAD')
    expect(rev.code).toBe(EXIT_FAILURE.repository)
    expect(rev.err).toContain('code-stats: not a git repository')
  })

  test('a missing or signed-out gh exits with the shared codes and keeps its hint', async () => {
    const r = repo()
    const missing = await runWith({ gh: spawnRunner('gh-is-not-installed') }, r.dir, 'diff', '3')
    expect(missing.code).toBe(EXIT_FAILURE.missingTool)
    expect(missing.err).toMatch(
      /^code-stats: could not read PR #3: .* is not installed or not on PATH\. /,
    )
    expect(missing.err).toContain('https://cli.github.com')

    const signedOut = fakeRunner(() => ({
      exitCode: 4,
      stderr: 'To get started with GitHub CLI, please run:  gh auth login\n',
    }))
    const out = await runWith({ gh: signedOut.runner }, r.dir, 'diff', '3')
    expect(out.code).toBe(EXIT_FAILURE.service)
    expect(out.err).toBe(
      'code-stats: could not read PR #3: gh is not signed in to GitHub. Run `gh auth login`.\n',
    )
  })

  test("a command's error text reaches the terminal without its control characters", async () => {
    const r = repo()
    const hostile = fakeRunner(() => ({
      exitCode: 1,
      stderr: 'boom\u001b]0;pwned\u0007 \u001b[31mred\n',
    }))
    const out = await runWith({ gh: hostile.runner }, r.dir, 'diff', '3')
    expect(out.code).toBe(1)
    expect(out.err).toMatch(/^code-stats: could not read PR #3: boom/)
    expect([...out.err].filter((c) => c === '\u001b' || c === '\u0007')).toEqual([])
  })
})

describe('the installed command', () => {
  const bin = fileURLToPath(new URL('../bin/code-stats.js', import.meta.url))

  test('this package is a devlink checkout, its parent is not, and the launcher is executable', () => {
    const root = fileURLToPath(new URL('..', import.meta.url))
    expect(isCheckout(DEVLINK_SPEC, root)).toBe(true)
    expect(isCheckout(DEVLINK_SPEC, fileURLToPath(new URL('../..', import.meta.url)))).toBe(false)
    // Windows has no executable bit.
    if (process.platform !== 'win32') expect(statSync(bin).mode & 0o111).not.toBe(0)
  })
})
