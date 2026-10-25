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
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'
import { spawnRunner } from '@osdlc/command-seam'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeBareAndWorker } from '@osdlc/typed-git/testing'

import { main } from '../src/cli.ts'
import { CONFIG_ENV, clearConfigCache } from '../src/config.ts'
import type { Receipt } from '../src/receipt.ts'
import { worktreeRemoveCommand } from '../src/worktrees.ts'

const BRANCH = 'feat/s'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function sh(cwd: string, args: string[]): string {
  return new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args).stdout.trim()
}

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-cli-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

function run(argv: string[], cwd: string, env?: Record<string, string>) {
  const ctx = captureContext({
    cwd,
    ...(env === undefined ? {} : { env: { ...process.env, ...env } }),
  })
  const code = main(argv, ctx)
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

describe('arguments', () => {
  test('--help exits 0 and names the apply command', () => {
    const res = run(['--help'], tempDir())
    expect(res.code).toBe(0)
    expect(res.out).toContain('repo-cleaner apply')
  })

  test('a malformed command exits 2', () => {
    const cwd = tempDir()
    expect(run(['--bogus'], cwd).code).toBe(2)
    expect(run(['--scope', 'nope'], cwd).code).toBe(2)
    expect(run(['--branch', 'x', '--all'], cwd).code).toBe(2)
    expect(run(['apply', '--plan', 'p.json', '--row', 'nope'], cwd).code).toBe(2)
    expect(run(['apply'], cwd).code).toBe(2)
    expect(run(['--config', 'c.yaml'], cwd).code).toBe(2)
    expect(run(['apply', '--plan', 'p.json', '--authorize', 'a=nope'], cwd).code).toBe(2)
  })

  test('--config points --all at that file and leaves the environment alone', () => {
    const cwd = tempDir()
    const config = join(cwd, 'config.yaml')
    writeFileSync(config, 'repos: []\n')
    const previous = process.env[CONFIG_ENV]
    expect(run(['--all', '--config', config], cwd).code).toBe(10)
    expect(process.env[CONFIG_ENV]).toBe(previous)
  })

  test('--branch HEAD outside a repository exits 1', () => {
    const res = run(['--branch', 'HEAD'], tempDir())
    expect(res.code).toBe(1)
    expect(res.err).toContain('repo-cleaner:')
  })

  test('nothing to sweep exits 10', () => {
    const cwd = tempDir()
    expect(run([], cwd).code).toBe(10)

    const config = join(cwd, 'config.yaml')
    writeFileSync(config, 'repos: []\n')
    const previous = process.env[CONFIG_ENV]
    process.env[CONFIG_ENV] = config
    clearConfigCache()
    try {
      expect(run(['--all'], cwd).code).toBe(10)
    } finally {
      if (previous === undefined) delete process.env[CONFIG_ENV]
      else process.env[CONFIG_ENV] = previous
      clearConfigCache()
    }
  })

  test('an unreadable plan exits 1', () => {
    const cwd = tempDir()
    const res = run(['apply', '--plan', 'missing.json', '--row', 'local_branch:x'], cwd)
    expect(res.code).toBe(1)
    expect(res.err).toContain('cannot read plan')
  })
})

describe('branch mode', () => {
  test('--branch HEAD plans the branch, and apply removes it everywhere', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    const planned = run(
      ['--branch', 'HEAD', '--no-gh', '--no-fetch', '--plan-out', plan, '--output', 'json'],
      fx.worktree,
    )
    expect(planned.code).toBe(0)
    const report = JSON.parse(planned.out) as {
      plan_path: string
      repos: Array<{ items: Array<{ category: string; id: string; commands: string[] }> }>
    }
    expect(report.plan_path).toBe(plan)
    const items = report.repos[0]!.items
    expect(items.map((i) => i.category).sort()).toEqual([
      'local_branch',
      'remote_branch',
      'worktree',
    ])

    const receipts = join(fx.root, '.receipts')
    const rows = items.flatMap((i) => ['--row', `${i.category}:${i.id}`])
    const applied = run(
      ['apply', '--plan', plan, ...rows, '--receipt-dir', receipts, '--output', 'json'],
      fx.root,
    )
    expect(applied.code).toBe(0)
    const out = JSON.parse(applied.out) as { receiptPath: string; receipt: Receipt }
    expect(out.receipt.status).toBe('complete')
    // The worktree path holds a space; the receipt's command quotes it.
    expect(out.receipt.steps[0]!.command).toContain(`'${fx.worktree}'`)
    expect(existsSync(out.receiptPath)).toBe(true)
    expect(existsSync(fx.worktree)).toBe(false)
    expect(sh(fx.root, ['for-each-ref', 'refs/heads/'])).not.toContain(BRANCH)
    expect(sh(fx.bare, ['for-each-ref', 'refs/heads/'])).not.toContain(BRANCH)
  })

  test('a failed step exits 11 under text and json', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    expect(
      run(['--branch', BRANCH, '--no-gh', '--no-fetch', '--plan-out', plan], fx.root).code,
    ).toBe(0)
    const hook = join(fx.bare, 'hooks', 'pre-receive')
    writeFileSync(hook, '#!/bin/sh\nexit 1\n')
    chmodSync(hook, 0o755)

    const receipts = join(fx.root, '.receipts')
    const args = [
      'apply',
      '--plan',
      plan,
      '--row',
      `remote_branch:origin/${BRANCH}`,
      '--receipt-dir',
      receipts,
    ]
    const text = run(args, fx.root)
    expect(text.code).toBe(11)
    expect(text.out).toContain('(failed)')
    const json = run([...args, '--output', 'json'], fx.root)
    expect(json.code).toBe(11)
    expect((JSON.parse(json.out) as { receipt: Receipt }).receipt.status).toBe('failed')
    expect(readdirSync(receipts)).toHaveLength(2)
  })

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
    const res = run(['--branch', BRANCH, '--no-gh', '--no-fetch'], parent)
    expect(res.code).toBe(1)
    expect(res.err).toContain('one repository')
  })

  test('plans and receipts default to the durable home; --dry-run writes no receipt', () => {
    const fx = buildFixture()
    const env = { REPO_CLEANER_ROOT: tempDir() }
    const planned = run(
      ['--branch', BRANCH, '--no-gh', '--no-fetch', '--write-plan', '--output', 'json'],
      fx.root,
      env,
    )
    expect(planned.code).toBe(0)
    const report = JSON.parse(planned.out) as {
      plan_path: string
      repos: Array<{ items: Array<{ category: string; id: string }> }>
    }
    const planPath = report.plan_path
    expect(planPath.startsWith(env.REPO_CLEANER_ROOT)).toBe(true)
    expect(planPath).toContain(join('repo-cleaner', 'plans'))

    const rows = report.repos[0]!.items.flatMap((i) => ['--row', `${i.category}:${i.id}`])
    const args = ['apply', '--plan', planPath, ...rows]
    const dry = run([...args, '--dry-run', '--output', 'json'], fx.root, env)
    expect(dry.code).toBe(0)
    expect((JSON.parse(dry.out) as { receiptPath: string | null }).receiptPath).toBeNull()
    expect(sh(fx.root, ['for-each-ref', 'refs/heads/'])).toContain(BRANCH)

    const applied = run([...args, '--output', 'json'], fx.root, env)
    expect(applied.code).toBe(0)
    const receiptPath = (JSON.parse(applied.out) as { receiptPath: string }).receiptPath
    expect(receiptPath).toContain(join('repo-cleaner', 'receipts'))
    expect(existsSync(receiptPath)).toBe(true)
  })

  test('--branch on the default branch exits 1', () => {
    const fx = buildFixture()
    const res = run(['--branch', 'main', '--no-gh', '--no-fetch'], fx.root)
    expect(res.code).toBe(1)
    expect(res.err).toContain('default branch')
  })
})
