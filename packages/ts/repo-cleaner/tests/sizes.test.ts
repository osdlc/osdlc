/**
 * `--sizes`: `du` through the command seam, the worktree rows' sizes, their
 * ranking, the reclaimable totals, and what a plan ignores.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'
import type { CommandResult, CommandRunner } from '@osdlc/command-seam'

import { commitFile, git, newRepo } from './helpers.ts'
import { main } from '../src/cli.ts'
import { plan } from '../src/plan.ts'
import { listMirrors } from '../src/remote-mirror.ts'
import { renderJson, renderRepo, renderSummary, renderText, renderTotals } from '../src/render.ts'
import { formatBytes, sizeOf } from '../src/size.ts'
import { sweep } from '../src/sweep.ts'
import type { Row, WorktreeRow } from '../src/types.ts'

const KIB = 1024

/** A `du` that answers by the path it is asked about, and records every call. */
function fakeDu(kib: Record<string, number | 'timeout' | 'fail'>) {
  const calls: string[][] = []
  const runner: CommandRunner = {
    run(argv): CommandResult {
      calls.push([...argv])
      const path = argv.at(-1)!
      const answer = kib[path]
      if (answer === 'timeout') {
        return { exitCode: 1, stdout: '', stderr: '', neverExited: true, reason: 'timeout' }
      }
      if (answer === undefined || answer === 'fail') {
        return { exitCode: 1, stdout: '', stderr: 'du: nope' }
      }
      return { exitCode: 0, stdout: `${answer}\t${path}\n`, stderr: '' }
    },
  }
  return { runner, calls }
}

let root: string
let big: string
let small: string
let dirty: string

beforeAll(() => {
  root = newRepo('repo-cleaner-sizes')
  // Both carry a commit that is merged into main, so both are `delete` rows.
  big = join(root, 'wt', 'big')
  small = join(root, 'wt', 'small')
  dirty = join(root, 'wt', 'dirty')
  git(['worktree', 'add', '-b', 'wt-big', big, 'main'], root)
  git(['worktree', 'add', '-b', 'wt-small', small, 'main'], root)
  for (const [name, dir] of [
    ['wt-big', big],
    ['wt-small', small],
  ] as const) {
    commitFile(dir, `${name}.txt`, `${name}\n`, `feat: ${name}`)
    git(['merge', '--no-ff', '-m', `Merge ${name}`, name], root)
  }
  git(['worktree', 'add', '-b', 'wt-dirty', dirty, 'main'], root)
  writeFileSync(join(dirty, 'scratch.txt'), 'uncommitted\n', 'utf-8')
}, 60_000)

afterAll(() => rmSync(root, { recursive: true, force: true }))

const worktrees = (rows: readonly Row[]): WorktreeRow[] =>
  rows.filter((r): r is WorktreeRow => r.kind === 'worktree')

describe('sizeOf', () => {
  test('reads du -sk as bytes, through the runner', () => {
    const { runner, calls } = fakeDu({ '/x': 12 })
    expect(sizeOf('/x', { du: runner, timeoutMs: 5_000 })).toBe(12 * KIB)
    expect(calls).toEqual([['-sk', '--', '/x']])
  })

  test('is null when du fails, times out or prints no number', () => {
    expect(sizeOf('/x', { du: fakeDu({ '/x': 'fail' }).runner })).toBeNull()
    expect(sizeOf('/x', { du: fakeDu({ '/x': 'timeout' }).runner })).toBeNull()
    const odd: CommandRunner = { run: () => ({ exitCode: 0, stdout: 'huh\n', stderr: '' }) }
    expect(sizeOf('/x', { du: odd })).toBeNull()
  })

  test('keeps the total of a du that exited non-zero over an unreadable file', () => {
    const partial: CommandRunner = {
      run: () => ({ exitCode: 1, stdout: '9\t/x\n', stderr: 'du: denied' }),
    }
    expect(sizeOf('/x', { du: partial })).toBe(9 * KIB)
  })

  test('resolves a relative path before asking du', () => {
    const { runner, calls } = fakeDu({ [resolve('rel/dir')]: 3 })
    expect(sizeOf('rel/dir', { du: runner })).toBe(3 * KIB)
    expect(calls[0]!.at(-1)).toBe(resolve('rel/dir'))
  })

  test('passes its timeout to the runner', () => {
    let seen: number | undefined
    const spy: CommandRunner = {
      run(_argv, opts) {
        seen = opts?.timeoutMs
        return { exitCode: 0, stdout: '1\t/x\n', stderr: '' }
      },
    }
    sizeOf('/x', { du: spy, timeoutMs: 1234 })
    expect(seen).toBe(1234)
  })

  test('measures a real directory with the real du', () => {
    const dir = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-du-')))
    try {
      writeFileSync(join(dir, 'a'), 'x'.repeat(10_000))
      const bytes = sizeOf(dir)
      expect(bytes).not.toBeNull()
      expect(bytes! % KIB).toBe(0)
      expect(bytes!).toBeGreaterThanOrEqual(8 * KIB)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('formats bytes in human units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(3 * KIB * KIB + 400 * KIB)).toBe('3.4 MB')
  })
})

describe('sweep with sizes', () => {
  const answers = () => fakeDu({ [big]: 5000, [small]: 10, [dirty]: 700, [root]: 100 })

  test('puts sizeBytes on every on-disk worktree row, and totals delete and review', () => {
    const { runner } = answers()
    const swept = sweep([root], { cwd: root, sizes: true, du: runner })
    const rows = worktrees(swept.repos[0]!.rows)
    expect(rows.find((r) => r.evidence.path === big)?.evidence.sizeBytes).toBe(5000 * KIB)
    expect(rows.find((r) => r.evidence.path === small)?.evidence.sizeBytes).toBe(10 * KIB)
    expect(rows.every((r) => typeof r.evidence.sizeBytes === 'number')).toBe(true)
    const byVerdict = (v: string) =>
      rows.filter((r) => r.verdict === v).reduce((n, r) => n + (r.evidence.sizeBytes as number), 0)
    expect(swept.reclaimableBytes).toEqual({
      delete: byVerdict('delete'),
      review: byVerdict('review'),
      unsized: 0,
    })
    expect(swept.reclaimableBytes!.delete).toBeGreaterThanOrEqual(5010 * KIB)
    expect(swept.repos[0]!.reclaimableBytes).toEqual(swept.reclaimableBytes)
  })

  test('lists rows largest first within a verdict, with a size column and a reclaimable line', () => {
    const swept = sweep([root], { cwd: root, sizes: true, du: answers().runner })
    const text = renderRepo(swept.repos[0]!)
    const names = ['wt/big', 'wt/small']
    const at = names.map((n) => text.indexOf(n))
    expect(at[0]).toBeGreaterThan(-1)
    expect(at[0]).toBeLessThan(at[1]!)
    expect(text).toContain('4.9 MB')
    const totals = renderTotals(swept)
    expect(totals).toMatch(/Reclaimable: .* to delete, .* to review\./)
    expect(renderSummary(swept)).toContain('Reclaimable:')
    expect(renderText(swept)).toContain('Reclaimable:')
  })

  test('carries raw bytes in JSON', () => {
    const swept = sweep([root], { cwd: root, sizes: true, du: answers().runner })
    const json = JSON.parse(renderJson(swept)) as {
      reclaimableBytes: { delete: number; review: number }
      repos: { rows: WorktreeRow[]; reclaimableBytes: unknown }[]
    }
    expect(json.reclaimableBytes).toEqual(swept.reclaimableBytes)
    const sized = json.repos[0]!.rows.find((r) => r.evidence.path === big)!
    expect(sized.evidence.sizeBytes).toBe(5000 * KIB)
  })

  test('without sizes no du runs and nothing is reported', () => {
    const { runner, calls } = answers()
    const swept = sweep([root], { cwd: root, du: runner })
    expect(calls).toEqual([])
    expect(swept.reclaimableBytes).toBeNull()
    expect(worktrees(swept.repos[0]!.rows).every((r) => r.evidence.sizeBytes === undefined)).toBe(
      true,
    )
    expect(renderTotals(swept)).not.toContain('Reclaimable')
    expect(renderRepo(swept.repos[0]!)).not.toMatch(/\d (B|KB|MB)\b/)
  })

  test('a du timeout leaves sizeBytes null and the verdict unchanged', () => {
    const plain = sweep([root], { cwd: root })
    const { runner } = fakeDu({
      [big]: 'timeout',
      [small]: 'timeout',
      [dirty]: 'timeout',
      [root]: 'timeout',
    })
    const timed = sweep([root], { cwd: root, sizes: true, du: runner })
    const was = worktrees(plain.repos[0]!.rows).map((r) => [r.id, r.verdict])
    const now = worktrees(timed.repos[0]!.rows).map((r) => [r.id, r.verdict])
    expect(now).toEqual(was)
    expect(worktrees(timed.repos[0]!.rows).every((r) => r.evidence.sizeBytes === null)).toBe(true)
    const counted = worktrees(timed.repos[0]!.rows).filter(
      (r) => r.verdict === 'delete' || r.verdict === 'review',
    ).length
    expect(counted).toBeGreaterThan(0)
    expect(timed.reclaimableBytes).toEqual({ delete: 0, review: 0, unsized: counted })
    expect(renderTotals(timed)).toContain(`(${counted} not measured)`)
    expect(renderRepo(timed.repos[0]!)).toContain('?')
  })

  test('a plan made with sizes has the same fingerprints as one made without', () => {
    const withSizes = plan(sweep([root], { cwd: root, sizes: true, du: answers().runner }))
    const without = plan(sweep([root], { cwd: root }))
    expect(withSizes.repos).toEqual(without.repos)
    expect(withSizes.options).toEqual(without.options)
  })
})

describe('listMirrors', () => {
  test('sizes each entry through the shared helper', () => {
    const cache = realpathSync(mkdtempSync(join(tmpdir(), 'repo-cleaner-cache-')))
    try {
      const entry = join(cache, 'abc.partial-1')
      mkdirSync(entry)
      const { runner, calls } = fakeDu({ [entry]: 7 })
      const [mirror] = listMirrors(cache, { du: runner })
      expect(mirror?.bytes).toBe(7 * KIB)
      expect(calls).toHaveLength(1)
    } finally {
      rmSync(cache, { recursive: true, force: true })
    }
  })
})

describe('--sizes on the command line', () => {
  test('adds reclaimableBytes to the JSON report; absent flag leaves it null', () => {
    const run = (argv: string[]) => {
      const ctx = captureContext({ cwd: root })
      const code = main(argv, ctx, { confirm: () => null })
      return { code, out: ctx.io.out }
    }
    const on = JSON.parse(run(['--sizes', '--format', 'json', '--no-progress']).out) as {
      reclaimableBytes: { delete: number } | null
    }
    expect(on.reclaimableBytes?.delete).toBeGreaterThan(0)
    const off = JSON.parse(run(['--format', 'json', '--no-progress']).out) as {
      reclaimableBytes: unknown
    }
    expect(off.reclaimableBytes).toBeNull()
  })
})
