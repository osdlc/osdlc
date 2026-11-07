import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureOutput } from './capture-output.ts'
import { commitAll, makeRepo, writeFile } from './fixture-repo.ts'
import { checksMain } from '../src/checks-command.ts'

let scratch: string
let checks: string
let outDir: string

/** A script that records its stdin and CHECK_BASE under `outDir`, named after the check. */
function recorder(headers: string[]): string {
  return [
    '#!/bin/sh',
    ...headers.map((h) => `# applies_to: ${h}`),
    `cat > "${outDir}/$CHECK_NAME.stdin"`,
    `printf %s "$CHECK_BASE" > "${outDir}/$CHECK_NAME.base"`,
    '',
  ].join('\n')
}

const seen = (name: string, ext: 'stdin' | 'base') =>
  readFileSync(join(outDir, `${name}.${ext}`), 'utf8')

function runCli(root: string, ...args: string[]) {
  return captureOutput(() => checksMain([checks, '-C', root, ...args]))
}

/** HEAD commit changes only src/a.ts; clean tree. */
let committed: { root: string; base: string }
/** docs/d.md staged; src/a.ts edited but not staged. */
let staged: { root: string }

beforeAll(() => {
  scratch = mkdtempSync(join(tmpdir(), 'rule-review-select-'))
  checks = join(scratch, 'checks.d')
  outDir = join(scratch, 'out')
  mkdirSync(checks)

  const scripts: Record<string, string[]> = {
    '1-any': [],
    '2-src': ['src/**'],
    '3-docs': ['docs/**'],
    '4-several': ['docs/**', 'src/**'],
  }
  for (const [entry, headers] of Object.entries(scripts)) {
    writeFile(checks, entry, recorder(headers))
    chmodSync(join(checks, entry), 0o755)
  }

  const files = { 'src/a.ts': 'a\n', 'docs/d.md': 'd\n', 'README.md': 'r\n' }
  const c = makeRepo(files)
  const base = c.git.revParse('HEAD')!
  writeFile(c.root, 'src/a.ts', 'a2\n')
  commitAll(c.git, 'change src')
  committed = { root: c.root, base }

  const s = makeRepo(files)
  writeFile(s.root, 'docs/d.md', 'd2\n')
  s.git.add(['docs/d.md'])
  writeFile(s.root, 'src/a.ts', 'a3\n')
  staged = { root: s.root }
})

beforeEach(() => {
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(outDir)
})

afterAll(() => {
  for (const d of [scratch, committed.root, staged.root])
    rmSync(d, { recursive: true, force: true })
})

describe('rule-review checks selection', () => {
  test('--base <rev> selects by the diff against that revision', async () => {
    const { code, out } = await runCli(committed.root, '--base', committed.base)

    expect(code).toBe(0)
    expect(out).toContain('PASS  1-any')
    expect(out).toContain('PASS  2-src')
    expect(out).toContain('SKIP  3-docs - no changed files in scope')
    expect(out).toContain('PASS  4-several')
    expect(out).toContain('3 passed, 0 failed, 0 errored, 1 skipped')
  })

  test('a selected script reads exactly its in-scope files on stdin and sees CHECK_BASE', async () => {
    await runCli(committed.root, '--base', committed.base)

    expect(seen('any', 'stdin')).toBe('src/a.ts\n')
    expect(seen('src', 'stdin')).toBe('src/a.ts\n')
    expect(seen('src', 'base')).toBe(committed.base)
  })

  test('--staged selects by the index, not the working tree', async () => {
    const { out } = await runCli(staged.root, '--staged')

    expect(out).toContain('PASS  1-any')
    expect(out).toContain('SKIP  2-src - no changed files in scope')
    expect(out).toContain('PASS  3-docs')
    expect(seen('any', 'stdin')).toBe('docs/d.md\n')
    expect(seen('docs', 'stdin')).toBe('docs/d.md\n')
    expect(seen('docs', 'base')).toBe('HEAD')
  })

  test('with no flag, uncommitted work is the changeset', async () => {
    const { out } = await runCli(staged.root)

    expect(out).toContain('PASS  2-src')
    expect(out).toContain('PASS  3-docs')
    expect(seen('several', 'stdin')).toBe('docs/d.md\nsrc/a.ts\n')
    expect(seen('several', 'base')).toBe('HEAD')
  })

  test('with no flag on a clean tree every script is skipped', async () => {
    const { code, out } = await runCli(committed.root)

    expect(code).toBe(0)
    expect(out).toContain('0 passed, 0 failed, 0 errored, 4 skipped')
  })

  test('--base leaves deleted files off stdin, as --staged does', async () => {
    const r = makeRepo({ 'src/a.ts': 'a\n', 'src/old.ts': 'old\n' })
    try {
      const base = r.git.revParse('HEAD')!
      writeFile(r.root, 'src/a.ts', 'a2\n')
      rmSync(join(r.root, 'src/old.ts'))
      commitAll(r.git, 'edit a, delete old')

      await runCli(r.root, '--base', base)

      expect(seen('src', 'stdin')).toBe('src/a.ts\n')
    } finally {
      rmSync(r.root, { recursive: true, force: true })
    }
  })

  test('--all selects by every tracked file, with an empty CHECK_BASE', async () => {
    const { out } = await runCli(committed.root, '--all')

    expect(out).toContain('4 passed')
    expect(seen('docs', 'stdin')).toBe('docs/d.md\n')
    expect(seen('any', 'stdin')).toBe('README.md\ndocs/d.md\nsrc/a.ts\n')
    expect(seen('any', 'base')).toBe('')
  })

  test('a skipped check is in the JSON report with its reason, in prefix order', async () => {
    const { out } = await runCli(committed.root, '--base', committed.base, '--json')
    const json = JSON.parse(out)

    expect(json.results.map((r: { entry: string; status: string }) => [r.entry, r.status])).toEqual(
      [
        ['1-any', 'PASS'],
        ['2-src', 'PASS'],
        ['3-docs', 'SKIP'],
        ['4-several', 'PASS'],
      ],
    )
    expect(json.results[2].reason).toBe('no changed files in scope')
    expect(json.summary).toEqual({ PASS: 3, FAIL: 0, SKIP: 1, ERROR: 0 })
  })

  test('--dry-run reflects the selection', async () => {
    const { out } = await runCli(committed.root, '--base', committed.base, '--dry-run')

    expect(out).toContain('RUN   2-src')
    expect(out).toContain('SKIP  3-docs - no changed files in scope')
    expect(out).toContain('3 would run, 1 skipped.')
  })

  test('--base, --staged and --all are mutually exclusive', async () => {
    for (const args of [
      ['--staged', '--all'],
      ['--base', 'main', '--staged'],
      ['--all', '--base', 'main'],
    ]) {
      const { code, err } = await runCli(committed.root, ...args)

      expect(code).toBe(2)
      expect(err).toContain('mutually exclusive')
    }
  })

  test('a changeset flag outside a git repository is a usage error', async () => {
    const { code, err } = await runCli(scratch, '--all')

    expect(code).toBe(2)
    expect(err).toContain('not inside a git repository')
  })
})

describe('rule-review checks scope errors', () => {
  test('an unreadable applies_to pattern is a usage error naming the script', async () => {
    const bad = mkdtempSync(join(tmpdir(), 'rule-review-badscope-'))
    try {
      writeFile(bad, '1-bad', recorder(['src/{1..3}.ts']))
      chmodSync(join(bad, '1-bad'), 0o755)

      const { code, err } = await captureOutput(() =>
        checksMain([bad, '-C', committed.root, '--base', committed.base]),
      )

      expect(code).toBe(2)
      expect(err).toContain("scope of '1-bad'")
    } finally {
      rmSync(bad, { recursive: true, force: true })
    }
  })
})
