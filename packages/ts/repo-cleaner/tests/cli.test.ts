/**
 * The `repo-cleaner` CLI driven in process: argument handling, exit codes, and
 * branch mode from plan to apply against a worker with a bare remote.
 */

import { afterEach, describe, expect, test } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'
import { spawnRunner } from '@osdlc/command-seam'
import { makeBareAndWorker } from '@osdlc/typed-git/testing'

import { sh } from './helpers.ts'
import { main, type MainDeps } from '../src/cli.ts'
import type { Receipt } from '../src/receipt.ts'
import { worktreeRemoveCommand } from '../src/worktrees.ts'

const BRANCH = 'feat/s'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-cli-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function run(argv: string[], cwd: string, deps: MainDeps = {}) {
  const ctx = captureContext({ cwd })
  // No terminal in a test: a run that would ask is refused unless a test answers.
  const code = main(argv, ctx, { confirm: () => null, ...deps })
  return { code, out: ctx.io.out, err: ctx.io.err }
}

interface Fixture {
  root: string
  bare: string
  worktree: string
}

/** A worktree on `BRANCH` with one pushed commit, merged into `main`. */
function buildFixture(): Fixture {
  const pair = makeBareAndWorker()
  cleanups.push(pair.cleanup)
  const root = pair.worker.dir
  sh(root, ['commit', '--allow-empty', '-m', 'initial'])
  sh(root, ['push', '-q', '-u', 'origin', 'main'])
  const worktree = join(pair.parent, 'wt s')
  sh(root, ['worktree', 'add', '-q', '-b', BRANCH, worktree, 'main'])
  sh(worktree, ['commit', '-q', '--allow-empty', '-m', 'feat: s'])
  sh(worktree, ['push', '-q', '-u', 'origin', BRANCH])
  sh(root, ['merge', '-q', '--no-ff', '-m', 'Merge s', BRANCH])
  sh(root, ['push', '-q', 'origin', 'main'])
  return { root, bare: pair.bare.dir, worktree: realpathSync(worktree) }
}

const SWEEP = ['--no-gh', '--no-fetch']

describe('arguments', () => {
  test('--help exits 0 and names every command', () => {
    const res = run(['--help'], tempDir())
    expect(res.code).toBe(0)
    for (const verb of ['[status]', 'plan', 'apply'])
      expect(res.out).toContain(`repo-cleaner ${verb}`)
    expect(run(['apply', '--help'], tempDir()).code).toBe(0)
    expect(run(['plan', '--help'], tempDir()).code).toBe(0)
  })

  test('a malformed command exits 2', () => {
    const cwd = tempDir()
    expect(run(['--bogus'], cwd).code).toBe(2)
    expect(run(['--only', 'nope'], cwd).code).toBe(2)
    expect(run(['--scope', 'worktrees'], cwd).code).toBe(2)
    expect(run(['--branch', 'x', 'some/path'], cwd).code).toBe(2)
    expect(run(['--all'], cwd).code).toBe(2)
    expect(run(['--write-plan'], cwd).code).toBe(2)
    expect(run(['apply', '--plan', 'p.json', '--row', 'nope'], cwd).code).toBe(2)
    expect(run(['apply', '--plan', 'p.json', '--allow', 'a=nope'], cwd).code).toBe(2)
    expect(run(['apply', '--plan', 'p.json', '--authorize', 'abandon-unmerged'], cwd).code).toBe(2)
    expect(run(['apply', '--plan', 'p.json', '--branch', 'x'], cwd).code).toBe(2)
    expect(run(['apply', '--plan', 'p.json', 'some/path'], cwd).code).toBe(2)
  })

  test('--plan - needs --yes or --dry-run, because stdin cannot also answer', () => {
    const res = run(['apply', '--plan', '-'], tempDir())
    expect(res.code).toBe(2)
    expect(res.err).toContain('--yes')
  })

  test('--branch HEAD outside a repository exits 1', () => {
    const res = run(['--branch', 'HEAD'], tempDir())
    expect(res.code).toBe(1)
    expect(res.err).toContain('repo-cleaner:')
  })

  test('nothing to sweep exits 10, for every verb that sweeps', () => {
    const cwd = tempDir()
    expect(run([], cwd).code).toBe(10)
    expect(run(['status'], cwd).code).toBe(10)
    expect(run(['plan'], cwd).code).toBe(10)
    expect(run(['apply'], cwd).code).toBe(10)
  })

  test('an unreadable plan exits 1', () => {
    const res = run(['apply', '--plan', 'missing.json', '--yes'], tempDir())
    expect(res.code).toBe(1)
    expect(res.err).toContain('cannot read plan')
  })
})

const branchRefs = (dir: string): string => sh(dir, ['for-each-ref', 'refs/heads/'])

describe('plan', () => {
  test('writes the plan to stdout by default and the summary to stderr', () => {
    const fx = buildFixture()
    const res = run(['plan', '--branch', BRANCH, ...SWEEP], fx.root)
    expect(res.code).toBe(0)
    const plan = JSON.parse(res.out) as { repos: Array<{ rows: Array<{ category: string }> }> }
    expect(plan.repos[0]!.rows.map((r) => r.category).sort()).toEqual([
      'local_branch',
      'remote_branch',
      'worktree',
    ])
    expect(res.err).toContain('to delete')
  })

  test('-o writes a file and names it on stderr', () => {
    const fx = buildFixture()
    const out = join(fx.root, '.plans', 'p.json')
    const res = run(['plan', '--branch', BRANCH, ...SWEEP, '-o', out], fx.root)
    expect(res.code).toBe(0)
    expect(res.out).toBe('')
    expect(res.err).toContain(`plan: ${out}`)
    expect(existsSync(out)).toBe(true)
  })

  test('--only narrows the plan to the named dimensions', () => {
    const fx = buildFixture()
    const res = run(['plan', '--branch', BRANCH, ...SWEEP, '--only', 'remotes'], fx.root)
    const plan = JSON.parse(res.out) as { repos: Array<{ rows: Array<{ category: string }> }> }
    expect(plan.repos[0]!.rows.map((r) => r.category)).toEqual(['remote_branch'])
  })
})

describe('apply', () => {
  test('from a plan file: deletes everywhere and writes the receipt beside the plan', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    expect(run(['plan', '--branch', 'HEAD', ...SWEEP, '-o', plan], fx.worktree).code).toBe(0)

    const applied = run(['apply', '--plan', plan, '--yes', '--output', 'json'], fx.root)
    expect(applied.code).toBe(0)
    const out = JSON.parse(applied.out) as { receiptPath: string; receipt: Receipt }
    expect(out.receipt.status).toBe('complete')
    // The worktree path holds a space; the receipt's command quotes it.
    expect(out.receipt.steps[0]!.command).toContain(`'${fx.worktree}'`)
    expect(dirname(out.receiptPath)).toBe(dirname(plan))
    expect(basename(out.receiptPath)).toMatch(/^p\.receipt-.*\.json$/)
    expect(existsSync(out.receiptPath)).toBe(true)
    expect(existsSync(fx.worktree)).toBe(false)
    expect(branchRefs(fx.root)).not.toContain(BRANCH)
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
  })

  test('without a plan: sweeps, shows the steps, and deletes on yes', () => {
    const fx = buildFixture()
    const asked: string[] = []
    const res = run(['apply', '--branch', BRANCH, ...SWEEP], fx.root, {
      confirm: (q) => {
        asked.push(q)
        return true
      },
    })
    expect(res.code).toBe(0)
    expect(asked).toEqual(['Delete 3 items?'])
    expect(res.out).toContain('would-run')
    expect(res.out).toContain('status: complete')
    expect(existsSync(fx.worktree)).toBe(false)
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
  })

  test('a no deletes nothing', () => {
    const fx = buildFixture()
    const res = run(['apply', '--branch', BRANCH, ...SWEEP], fx.root, { confirm: () => false })
    expect(res.code).toBe(0)
    expect(res.err).toContain('nothing deleted')
    expect(existsSync(fx.worktree)).toBe(true)
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('with no terminal and no --yes it refuses, after showing the steps', () => {
    const fx = buildFixture()
    const res = run(['apply', '--branch', BRANCH, ...SWEEP], fx.root)
    expect(res.code).toBe(2)
    expect(res.out).toContain('would-run')
    expect(res.err).toContain('--yes')
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('--dry-run deletes nothing and writes no receipt', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    run(['plan', '--branch', BRANCH, ...SWEEP, '-o', plan], fx.root)
    const dry = run(['apply', '--plan', plan, '--dry-run', '--output', 'json'], fx.root)
    expect(dry.code).toBe(0)
    expect((JSON.parse(dry.out) as { receiptPath: string | null }).receiptPath).toBeNull()
    expect(readdirSync(dirname(plan))).toEqual(['p.json'])
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('--plan - reads the plan from stdin', () => {
    const fx = buildFixture()
    const plan = run(['plan', '--branch', BRANCH, ...SWEEP], fx.root).out
    const res = run(
      ['apply', '--plan', '-', '--yes', '--row', `remote_branch:origin/${BRANCH}`],
      fx.root,
      {
        readStdin: () => plan,
      },
    )
    expect(res.code).toBe(0)
    expect(res.out).toContain('status: complete')
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a row whose risk was not allowed is dropped, not deleted', () => {
    const fx = buildFixture()
    sh(fx.worktree, ['commit', '-q', '--allow-empty', '-m', 'unmerged'])
    const res = run(
      ['apply', '--branch', BRANCH, ...SWEEP, '--only', 'worktrees', '--yes'],
      fx.root,
    )
    expect(res.code).toBe(0)
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a failed step exits 11 under text and json; --receipt names the file', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    expect(run(['plan', '--branch', BRANCH, ...SWEEP, '-o', plan], fx.root).code).toBe(0)
    const hook = join(fx.bare, 'hooks', 'pre-receive')
    writeFileSync(hook, '#!/bin/sh\nexit 1\n')
    chmodSync(hook, 0o755)

    const receipt = join(fx.root, 'r.json')
    const args = ['apply', '--plan', plan, '--yes', '--row', `remote_branch:origin/${BRANCH}`]
    const text = run([...args, '--receipt', receipt], fx.root)
    expect(text.code).toBe(11)
    expect(text.out).toContain('(failed)')
    expect((JSON.parse(readFileSync(receipt, 'utf-8')) as Receipt).status).toBe('failed')
    const json = run([...args, '--output', 'json'], fx.root)
    expect(json.code).toBe(11)
    expect((JSON.parse(json.out) as { receipt: Receipt }).receipt.status).toBe('failed')
  })
})

describe('branch mode', () => {
  test('an emitted command acts on a path with a space when pasted into sh', () => {
    const fx = buildFixture()
    const command = worktreeRemoveCommand(fx.root, fx.worktree)
    spawnRunner('sh').run(['-c', command], { cwd: tempDir() })
    expect(existsSync(fx.worktree)).toBe(false)
  })

  test('--branch from a directory holding two checkouts exits 1', () => {
    const a = buildFixture()
    const b = buildFixture()
    const parent = tempDir()
    sh(parent, ['clone', '-q', a.bare, 'a'])
    sh(parent, ['clone', '-q', b.bare, 'b'])
    const res = run(['--branch', BRANCH, ...SWEEP], parent)
    expect(res.code).toBe(1)
    expect(res.err).toContain('one repository')
  })

  test('--branch on the default branch exits 1', () => {
    const fx = buildFixture()
    const res = run(['--branch', 'main', ...SWEEP], fx.root)
    expect(res.code).toBe(1)
    expect(res.err).toContain('default branch')
  })
})
