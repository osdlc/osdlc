/**
 * Runs the README's examples. The TypeScript ones run through the package name
 * against a throwaway repository, with a stand-in `claude` on PATH, so the
 * whole path down to the agent's process is exercised. The CI and hook files
 * are checked to parse and to match the README's copies of them.
 */
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { spawnRunner } from '@osdlc/command-seam'
import { afterAll, afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { parse } from 'yaml'

import { fakeClaude, withPath } from '../tests/fake-agent.ts'
import { commitAll, makeRepo, writeFile } from '../tests/fixture-repo.ts'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const README = readFileSync(join(HERE, '..', 'README.md'), 'utf8')

const cleanup: string[] = []
afterAll(() => {
  for (const dir of cleanup) rmSync(dir, { recursive: true, force: true })
})

/** A repo on branch `feature`, forked from `main`, with `changes` committed on it. */
function branchRepo(base: Record<string, string>, changes: Record<string, string>): string {
  const { root, git } = makeRepo(base)
  cleanup.push(root)
  git.raw(['switch', '-q', '-c', 'feature'])
  for (const [rel, body] of Object.entries(changes)) writeFile(root, rel, body)
  commitAll(git, 'change')
  return root
}

describe('the TypeScript examples', () => {
  const cwd = process.cwd()
  let logs: string[]
  beforeEach(() => {
    logs = []
    vi.spyOn(console, 'log').mockImplementation((line: string) => void logs.push(line))
    vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => {
    process.chdir(cwd)
    process.exitCode = 0
    vi.restoreAllMocks()
  })

  test('review-a-branch prints each finding and exits 1 on a violation', async () => {
    const root = branchRepo(
      { 'CLAUDE.md': 'Never use the any type.\n', 'src/a.ts': 'export const a = 1\n' },
      { 'src/a.ts': 'export const a: any = 1\n' },
    )
    const agent = fakeClaude([
      { file: 'src/a.ts', line: 1, evidence: 'a: any', why: 'Uses any.', severity: 'violation' },
    ])
    cleanup.push(agent)

    process.chdir(root)
    await withPath(agent, () => import('./review-a-branch.ts'))

    expect(logs).toEqual(['violation src/a.ts:1 (CLAUDE.md): Uses any.'])
    expect(process.exitCode).toBe(1)
  })

  test('custom-provider adds a rule source with a scope of its own', async () => {
    const root = branchRepo(
      { 'docs/STYLE.md': 'Headings are sentence case.\n', 'guide/intro.md': '# Intro\n' },
      { 'guide/intro.md': '# An Intro In Title Case\n' },
    )
    const agent = fakeClaude([])
    cleanup.push(agent)

    process.chdir(root)
    await withPath(agent, () => import('./custom-provider.ts'))

    // No CLAUDE.md here, so the style guide is the one judgement.
    expect(logs).toEqual(['0 findings from 1 judgements'])
  })

  test('run-checks runs the sample checks.d on the staged files', async () => {
    const { root, git } = makeRepo({ 'README.md': 'hello\n' })
    cleanup.push(root)
    mkdirSync(join(root, 'checks.d'))
    for (const name of readdirSync(join(HERE, 'checks.d'))) {
      copyFileSync(join(HERE, 'checks.d', name), join(root, 'checks.d', name))
    }
    writeFile(root, 'README.md', '<<<<<<< HEAD\nhello\n=======\nhi\n>>>>>>> other\n')
    git.add(['README.md'])
    let out = ''
    vi.spyOn(process.stdout, 'write').mockImplementation((s) => {
      out += String(s)
      return true
    })

    process.chdir(root)
    await import('./run-checks.ts')

    expect(out).toMatch(/FAIL\s+10-no-conflict-markers/)
    expect(out).toContain('SKIP  20-shell-syntax - no changed files in scope')
    expect(process.exitCode).toBe(1)
  })
})

/** Every `<!-- example: <path> -->` marker in the README and the fenced block after it. */
function readmeExamples(): { path: string; body: string }[] {
  const out: { path: string; body: string }[] = []
  const re = /<!-- example: (\S+) -->\n+```[^\n]*\n([\s\S]*?)```/g
  for (const m of README.matchAll(re)) out.push({ path: m[1]!, body: m[2]! })
  return out
}

describe('the README', () => {
  const examples = readmeExamples()

  test('copies every example file verbatim', () => {
    const listed = new Set(examples.map((e) => e.path))
    for (const dir of ['ci', 'hooks', 'checks.d']) {
      for (const name of readdirSync(join(HERE, dir))) {
        expect(listed, `examples/${dir}/${name} is not in the README`).toContain(
          `examples/${dir}/${name}`,
        )
      }
    }
    for (const name of ['review-a-branch.ts', 'custom-provider.ts', 'run-checks.ts']) {
      expect(listed).toContain(`examples/${name}`)
    }
    for (const { path, body } of examples) {
      const file = readFileSync(join(HERE, '..', path), 'utf8')
      expect(body, `${path} in the README differs from the file`).toBe(file)
    }
  })

  test('the CI and hook YAML parses', () => {
    for (const { path } of examples.filter((e) => /\.ya?ml$/.test(e.path))) {
      expect(() => parse(readFileSync(join(HERE, '..', path), 'utf8')), path).not.toThrow()
    }
    const workflow = parse(readFileSync(join(HERE, 'ci', 'github-actions.yml'), 'utf8'))
    const steps = workflow.jobs['rule-review'].steps as { with?: Record<string, unknown> }[]
    expect(steps[0]?.with?.['fetch-depth']).toBe(0)
  })

  test('the plain pre-push hook is valid sh and executable', () => {
    const hook = join(HERE, 'hooks', 'pre-push')
    expect(statSync(hook).mode & 0o111).not.toBe(0)
    // `sh -n` parses without running.
    const parsed = spawnRunner('sh').run(['-n', hook], {})
    expect(parsed.exitCode, parsed.stderr).toBe(0)
  })
})
