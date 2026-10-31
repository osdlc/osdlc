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
import type { Plan } from '../src/plan.ts'
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

/** All three rows of the fixture's branch. Without gh the worktree is a review row, so it is named. */
function rowsOf(fx: Fixture): string[] {
  return [
    `worktree:${fx.worktree}`,
    `local_branch:${BRANCH}`,
    `remote_branch:origin/${BRANCH}`,
  ].flatMap((r) => ['--row', r])
}

describe('arguments', () => {
  test('--help exits 0 and names every command', () => {
    const res = run(['--help'], tempDir())
    expect(res.code).toBe(0)
    for (const verb of ['[status]', 'summary', 'plan', 'apply'])
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

describe('status line', () => {
  test('drawn on a terminal stderr, erased before the report, never on stdout', () => {
    const fx = buildFixture()
    const res = run(['summary', ...SWEEP, '--remotes'], fx.root, { stderrIsTerminal: true })
    expect(res.code).toBe(0)
    expect(res.err).toContain('\r\x1b[2K')
    expect(res.err).toContain('checking remote branches')
    expect(res.err.endsWith('\r\x1b[2K')).toBe(true)
    expect(res.out).not.toContain('\x1b')
  })

  test('--no-progress, or a stderr that is not a terminal, draws none', () => {
    const fx = buildFixture()
    const off = run(['summary', ...SWEEP, '--remotes', '--no-progress'], fx.root, {
      stderrIsTerminal: true,
    })
    expect(off.err).not.toContain('\x1b')
    const piped = run(['summary', ...SWEEP, '--remotes'], fx.root)
    expect(piped.err).not.toContain('\x1b')
  })

  test('apply shows the re-check and each step', () => {
    const fx = buildFixture()
    const res = run(
      ['apply', '--branch', BRANCH, ...SWEEP, '--remotes', ...rowsOf(fx), '--yes'],
      fx.root,
      {
        stderrIsTerminal: true,
      },
    )
    expect(res.code).toBe(0)
    expect(res.err).toContain('re-checking')
    expect(res.err).toMatch(/deleting [░█]+ 1\//)
  })
})

describe('plan', () => {
  test('writes the plan to stdout by default and the summary to stderr', () => {
    const fx = buildFixture()
    const res = run(['plan', '--branch', BRANCH, ...SWEEP, '--remotes'], fx.root)
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
    const res = run(['plan', '--branch', BRANCH, ...SWEEP, '--remotes', '-o', out], fx.root)
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

describe('summary', () => {
  test('counts each category, with how many are merged', () => {
    const fx = buildFixture()
    sh(fx.root, ['branch', 'stale-unmerged'])
    sh(fx.root, ['checkout', '-q', 'stale-unmerged'])
    sh(fx.root, ['commit', '-q', '--allow-empty', '-m', 'not merged'])
    sh(fx.root, ['checkout', '-q', 'main'])
    const res = run(['summary', ...SWEEP, '--remotes', '--output', 'json'], fx.root)
    expect(res.code).toBe(0)
    const out = JSON.parse(res.out) as {
      repos: Array<{ summary: Record<string, { total: number; merged: number }> }>
      summary: { total: number; merged: number }
    }
    const counts = out.repos[0]!.summary
    // main (default, not judged), feat/s (held by the worktree, merged), stale-unmerged.
    expect(counts['local_branch']).toMatchObject({ total: 3, merged: 1 })
    // The primary worktree is not judged; the feature worktree is merged.
    expect(counts['worktree']).toMatchObject({ total: 2, merged: 1 })
    // origin/main (not judged) and origin/feat/s (merged).
    expect(counts['remote_branch']).toMatchObject({ total: 2, merged: 1 })
    expect(out.summary).toMatchObject({ total: 7, merged: 3 })
    expect(res.out).not.toContain('"items"')
  })

  test('text shows one table per repository and the closing summary line', () => {
    const fx = buildFixture()
    const res = run(['summary', ...SWEEP, '--remotes'], fx.root)
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/total\s+merged\s+delete\s+prune\s+review\s+keep/)
    expect(res.out).toMatch(/local branches\s+2\s+1\s/)
    expect(res.out).toContain('across 1 repository')
  })
})

describe('remote branches are opt-in', () => {
  test('by default only worktrees and local branches are swept, and the report says so', () => {
    const fx = buildFixture()
    const res = run(['status', ...SWEEP, '--keep'], fx.root)
    expect(res.code).toBe(0)
    expect(res.out).not.toContain('remote_branch')
    expect(res.out).toContain('local_branch')
    expect(res.out).toContain('remote branches not checked; add --remotes for all three.')
    const json = JSON.parse(run(['plan', '--branch', BRANCH, ...SWEEP], fx.root).out) as Plan
    expect(json.repos[0]!.rows.map((r) => r.category).sort()).toEqual(['local_branch', 'worktree'])
  })

  test('--remotes and --only remotes include them; the note goes away', () => {
    const fx = buildFixture()
    for (const flags of [
      ['--remotes'],
      ['--only', 'remotes'],
      ['--only', 'branches', '--remotes'],
    ]) {
      const res = run(['status', ...SWEEP, '--keep', ...flags], fx.root)
      expect(res.code).toBe(0)
      expect(res.out).toContain(`origin/${BRANCH}`)
      expect(res.out).not.toContain('remote branches not checked')
    }
  })

  test('apply re-checks only the categories its rows are in', () => {
    const fx = buildFixture()
    const plan = join(tempDir(), 'p.json')
    expect(run(['plan', '--branch', BRANCH, ...SWEEP, '--remotes', '-o', plan], fx.root).code).toBe(
      0,
    )
    const res = run(
      ['apply', '--plan', plan, '--yes', '--row', `worktree:${fx.worktree}`],
      fx.root,
      {
        stderrIsTerminal: true,
      },
    )
    expect(res.code).toBe(0)
    expect(res.err).toContain('re-checking')
    expect(res.err).not.toContain('checking local branches')
    expect(res.err).not.toContain('checking remote branches')
    expect(existsSync(fx.worktree)).toBe(false)
    // The branches were in the plan but not selected: they are still there.
    expect(branchRefs(fx.root)).toContain(BRANCH)
    expect(branchRefs(fx.bare)).toContain(BRANCH)
  })
})

describe('local by default means offline', () => {
  test('without --remotes nothing is fetched and the plan records no gh', () => {
    const fx = buildFixture()
    // A commit on the remote the worker has not fetched.
    const other = join(tempDir(), 'other')
    sh(tempDir(), ['clone', '-q', fx.bare, other])
    sh(other, ['commit', '-q', '--allow-empty', '-m', 'elsewhere'])
    sh(other, ['push', '-q', 'origin', 'main'])
    const before = sh(fx.root, ['rev-parse', 'origin/main'])

    const local = run(['status'], fx.root)
    expect(local.code).toBe(0)
    expect(local.out).toContain('not fetched')
    expect(local.out).toContain('Local only: nothing fetched, no gh')
    expect(sh(fx.root, ['rev-parse', 'origin/main'])).toBe(before)
    const plan = JSON.parse(run(['plan'], fx.root).out) as Plan
    expect(plan.repos[0]!.no_gh).toBe(true)

    const online = run(['status', '--remotes', '--no-gh'], fx.root)
    expect(online.code).toBe(0)
    expect(online.out).not.toContain('not fetched')
    expect(sh(fx.root, ['rev-parse', 'origin/main'])).not.toBe(before)
  })
})

describe('color', () => {
  function colorRun(
    argv: string[],
    cwd: string,
    env: Record<string, string | undefined>,
    deps: MainDeps = {},
  ) {
    const base: Record<string, string | undefined> = { ...process.env, TERM: 'xterm-256color' }
    delete base['NO_COLOR']
    delete base['FORCE_COLOR']
    const ctx = captureContext({
      cwd,
      env: { ...base, ...env },
      terminal: { stdin: true, stdout: true, stderr: false },
    })
    const code = main(argv, ctx, { confirm: () => null, ...deps })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }

  test('a terminal gets colored action words; NO_COLOR and a pipe do not', () => {
    const fx = buildFixture()
    sh(fx.root, ['branch', 'gone-already'])
    const colored = colorRun(['status', ...SWEEP], fx.root, {})
    expect(colored.out).toContain('\x1b[31mdelete')
    expect(colored.out).toContain('\x1b[1m')
    expect(colorRun(['status', ...SWEEP], fx.root, { NO_COLOR: '1' }).out).not.toContain('\x1b[')
    expect(run(['status', ...SWEEP], fx.root).out).not.toContain('\x1b[')
  })

  test('on a terminal apply lists every step, then checks each off as it runs', () => {
    const fx = buildFixture()
    const res = colorRun(
      ['apply', '--branch', BRANCH, ...SWEEP, '--remotes', '--yes', ...rowsOf(fx)],
      fx.root,
      { NO_COLOR: '1' },
    )
    expect(res.code).toBe(0)
    const out = res.out
    const preview = out.indexOf(`delete  remote_branch  origin/${BRANCH}`)
    const done = out.indexOf(`✓ delete  remote_branch  origin/${BRANCH}`)
    expect(preview).toBeGreaterThanOrEqual(0)
    expect(done).toBeGreaterThan(preview)
    expect(out).toContain(`✓ delete  worktree`)
    expect(out).toContain(`✓ delete  local_branch  ${BRANCH}`)
    expect(out).toContain('✓ prune')
    // The steps are not listed a second time under the counts.
    expect(out).not.toMatch(/^ok {7}/m)
    expect(out).toContain('deleted: 1 worktree, 1 local branch, 1 remote branch')
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
  })

  test('a live run names a row its own re-check dropped after the preview', () => {
    const fx = buildFixture()
    const res = colorRun(
      ['apply', '--branch', BRANCH, ...SWEEP, '--remotes', ...rowsOf(fx)],
      fx.root,
      { NO_COLOR: '1' },
      {
        // The branch moves while the question is open.
        confirm: () => {
          sh(fx.worktree, ['commit', '-q', '--allow-empty', '-m', 'late'])
          return true
        },
      },
    )
    // After the preview's counts: the run's own output.
    const tail = res.out.slice(res.out.lastIndexOf('would delete:'))
    expect(tail).toMatch(/skip {2}local_branch {2}feat\/s\n +facts-changed: /)
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('the preview before the question is colored and summarized', () => {
    const fx = buildFixture()
    const asked: string[] = []
    const res = colorRun(
      ['apply', '--branch', BRANCH, ...SWEEP, '--remotes'],
      fx.root,
      {},
      {
        confirm: (q) => {
          asked.push(q)
          return false
        },
      },
    )
    expect(res.code).toBe(0)
    expect(asked).toEqual(['Delete 2 items?'])
    expect(res.out).toContain('\x1b[31mdelete')
    expect(res.out).toContain('\x1b[33mskip')
    expect(res.out).toContain('\x1b[1mwould delete: 1 local branch, 1 remote branch')
    expect(branchRefs(fx.bare)).toContain(BRANCH)
  })
})

describe('prune rows', () => {
  test('a stale worktree link shows as prune in status and summary', () => {
    const fx = buildFixture()
    rmSync(fx.worktree, { recursive: true, force: true })
    const status = run(['status', ...SWEEP, '--remotes'], fx.root)
    expect(status.code).toBe(0)
    const row = status.out.split('\n').find((l) => l.includes('wt s'))!
    expect(row).toMatch(/worktree\s+\S.*\s+prune\s+worktree directory no longer on disk/)
    expect(status.out).toMatch(/\d+ to delete, 1 to prune, \d+ to review/)

    const text = run(['summary', ...SWEEP, '--remotes'], fx.root)
    // worktrees: total 2 (primary + stale), 1 merged-or-not, delete 0, prune 1.
    expect(text.out).toMatch(/worktrees\s+2\s+\d+\s+0\s+1\s/)
    const json = JSON.parse(
      run(['summary', ...SWEEP, '--remotes', '--output', 'json'], fx.root).out,
    ) as {
      repos: Array<{ summary: Record<string, { prune: number; 'safe-to-delete': number }> }>
      summary: { prune: number }
    }
    expect(json.repos[0]!.summary['worktree']).toMatchObject({ prune: 1, 'safe-to-delete': 1 })
    expect(json.summary.prune).toBe(1)
  })
})

describe('--remote-url', () => {
  /** A run whose cache directory is a fresh temp dir, so the mirror is the test's own. */
  function remoteRun(argv: string[], cwd: string, cache: string, deps: MainDeps = {}) {
    const ctx = captureContext({ cwd, env: { ...process.env, REPO_CLEANER_CACHE_DIR: cache } })
    const code = main(argv, ctx, { confirm: () => null, ...deps })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }

  test('status sweeps the remote branches of a URL with no checkout', () => {
    const fx = buildFixture()
    const cache = tempDir()
    const away = tempDir()
    const res = remoteRun(['--remote-url', fx.bare, ...SWEEP], away, cache)
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/remote_branch\s+origin\/feat\/s\s+delete/)
    expect(res.out).not.toContain('worktree')
    expect(res.out).not.toContain('local_branch')
    // One mirror, a clone with no files checked out.
    const mirrors = readdirSync(cache, { recursive: true }).filter((p) =>
      String(p).endsWith('.git'),
    )
    expect(mirrors).toHaveLength(1)
  })

  test('apply deletes the branch on the remote, and the mirror is reused', () => {
    const fx = buildFixture()
    const cache = tempDir()
    const away = tempDir()
    const res = remoteRun(['apply', '--remote-url', fx.bare, ...SWEEP, '--yes'], away, cache)
    expect(res.code).toBe(0)
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
    expect(branchRefs(fx.bare)).toContain('main')

    // A branch pushed since is found on the next run: the mirror is fetched, not re-cloned.
    sh(fx.root, ['push', '-q', 'origin', `main:refs/heads/feat/later`])
    const again = remoteRun(['--remote-url', fx.bare, '--no-gh'], away, cache)
    expect(again.code).toBe(0)
    expect(again.out).toMatch(/origin\/feat\/later\s+delete/)
  })

  test('a plan written from a URL applies later from anywhere', () => {
    const fx = buildFixture()
    const cache = tempDir()
    const away = tempDir()
    const plan = join(away, 'p.json')
    expect(
      remoteRun(['plan', '--remote-url', fx.bare, ...SWEEP, '-o', plan], away, cache).code,
    ).toBe(0)
    const applied = remoteRun(['apply', '--plan', plan, '--yes'], tempDir(), cache)
    expect(applied.code).toBe(0)
    expect(applied.out).toContain('deleted: 1 remote branch')
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
  })

  test('refuses paths, --branch and other categories', () => {
    const cache = tempDir()
    const cwd = tempDir()
    expect(remoteRun(['--remote-url', 'u', 'some/path'], cwd, cache).code).toBe(2)
    expect(remoteRun(['--remote-url', 'u', '--branch', 'x'], cwd, cache).code).toBe(2)
    expect(remoteRun(['--remote-url', 'u', '--only', 'worktrees'], cwd, cache).code).toBe(2)
    expect(readdirSync(cache)).toEqual([])
  })

  test('an empty URL is refused, not dropped in favour of the checkout you are in', () => {
    const fx = buildFixture()
    const res = remoteRun(['apply', '--remote-url', '', ...SWEEP, '--yes'], fx.root, tempDir())
    expect(res.code).toBe(2)
    expect(res.err).toContain('--remote-url needs a URL')
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('--plan fixes what is swept, so --remote-url is refused with it', () => {
    const res = remoteRun(['apply', '--plan', 'p.json', '--remote-url', 'u'], tempDir(), tempDir())
    expect(res.code).toBe(2)
    expect(res.err).toContain('--remote-url')
  })

  test('a mirror that pushes elsewhere is refused, swept or from a plan', () => {
    const fx = buildFixture()
    const cache = tempDir()
    const away = tempDir()
    const plan = join(away, 'p.json')
    expect(
      remoteRun(['plan', '--remote-url', fx.bare, ...SWEEP, '-o', plan], away, cache).code,
    ).toBe(0)
    const mirror = (JSON.parse(readFileSync(plan, 'utf8')) as { repos: Array<{ root: string }> })
      .repos[0]!.root
    const elsewhere = makeBareAndWorker()
    cleanups.push(elsewhere.cleanup)
    sh(mirror, ['config', 'remote.origin.pushurl', elsewhere.bare.dir])

    const swept = remoteRun(['--remote-url', fx.bare, ...SWEEP], away, cache)
    expect(swept.code).toBe(1)
    expect(swept.err).toContain('pushes somewhere other than')
    const applied = remoteRun(['apply', '--plan', plan, '--yes'], away, cache)
    expect(applied.code).toBe(1)
    expect(applied.err).toContain('refusing to apply')
    expect(branchRefs(fx.bare)).toContain(BRANCH)
  })

  test('a failed clone does not print the credentials in its URL', () => {
    const res = remoteRun(
      ['--remote-url', 'https://me:SECRET@127.0.0.1:9/acme/repo.git?t=SECRET', ...SWEEP],
      tempDir(),
      tempDir(),
    )
    expect(res.code).toBe(1)
    expect(res.err).toContain('cannot clone https://127.0.0.1:9/acme/repo.git')
    expect(res.err).not.toContain('SECRET')
  })

  test('a URL that cannot be cloned exits 1 and leaves nothing in the cache', () => {
    const cache = tempDir()
    const res = remoteRun(
      ['--remote-url', join(tempDir(), 'missing.git'), ...SWEEP],
      tempDir(),
      cache,
    )
    expect(res.code).toBe(1)
    expect(res.err).toContain('cannot clone')
    expect(
      readdirSync(cache, { recursive: true }).filter((p) => String(p).includes('partial')),
    ).toEqual([])
  })
})

describe('apply', () => {
  test('from a plan file: deletes everywhere and writes the receipt beside the plan', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    expect(
      run(['plan', '--branch', 'HEAD', ...SWEEP, '--remotes', '-o', plan], fx.worktree).code,
    ).toBe(0)

    const applied = run(
      ['apply', '--plan', plan, ...rowsOf(fx), '--yes', '--output', 'json'],
      fx.root,
    )
    expect(applied.code).toBe(0)
    const out = JSON.parse(applied.out) as {
      receiptPath: string
      receipt: Receipt
      summary: unknown
    }
    expect(out.receipt.status).toBe('complete')
    expect(out.summary).toMatchObject({
      deleted: { worktree: 1, local_branch: 1, remote_branch: 1 },
    })
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
    const res = run(['apply', '--branch', BRANCH, ...SWEEP, '--remotes', ...rowsOf(fx)], fx.root, {
      confirm: (q) => {
        asked.push(q)
        return true
      },
    })
    expect(res.code).toBe(0)
    expect(asked).toEqual(['Delete 3 items?'])
    expect(res.out).toContain('would delete: 1 worktree, 1 local branch, 1 remote branch')
    expect(res.out).toContain('deleted: 1 worktree, 1 local branch, 1 remote branch')
    expect(res.out).toMatch(/delete  local_branch +feat\/s\n +git /)
    expect(res.out).toContain('status: complete')
    expect(existsSync(fx.worktree)).toBe(false)
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
  })

  test('with no --row a review row is dropped, not applied', () => {
    const fx = buildFixture()
    const res = run(
      ['apply', '--branch', BRANCH, ...SWEEP, '--only', 'worktrees', '--yes'],
      fx.root,
    )
    expect(res.code).toBe(0)
    expect(res.out).toContain('needs-review')
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a repository the sweep cannot read fails the run instead of reading as empty', () => {
    const fx = buildFixture()
    sh(fx.root, ['remote', 'set-url', 'origin', join(tempDir(), 'missing.git')])
    const res = run(['apply', '--remotes', '--no-gh', '--yes'], fx.root)
    expect(res.code).toBe(1)
    expect(res.err).toContain('fetch failed')
    const plan = run(['plan', '--remotes', '--no-gh'], fx.root)
    expect(plan.code).toBe(1)
    expect(plan.err).toContain('fetch failed')
  })

  test('the receipt file records the rows the preview dropped', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    run(['plan', '--branch', BRANCH, ...SWEEP, '--remotes', '-o', plan], fx.root)
    const res = run(['apply', '--plan', plan, '--yes', '--output', 'json'], fx.root)
    const out = JSON.parse(res.out) as { receiptPath: string; receipt: Receipt }
    const saved = JSON.parse(readFileSync(out.receiptPath, 'utf-8')) as Receipt
    expect(saved.dropped.map((d) => d.reason)).toContain('needs-review')
    expect(saved.dropped).toEqual(out.receipt.dropped)
  })

  test('a run with no receipt file says so on stderr', () => {
    const fx = buildFixture()
    const res = run(
      ['apply', '--branch', BRANCH, ...SWEEP, '--remotes', ...rowsOf(fx), '--yes'],
      fx.root,
    )
    expect(res.code).toBe(0)
    expect(res.err).toContain('no receipt written')
  })

  test('an empty plan reports a status that matches the run', () => {
    const fx = buildFixture()
    const plan = join(fx.root, 'empty.json')
    writeFileSync(plan, JSON.stringify({ version: 1, created_at: 'x', repos: [] }))
    const real = run(['apply', '--plan', plan, '--yes', '--output', 'json'], fx.root)
    expect((JSON.parse(real.out) as { receipt: Receipt }).receipt.status).toBe('complete')
    const dry = run(['apply', '--plan', plan, '--dry-run', '--output', 'json'], fx.root)
    expect((JSON.parse(dry.out) as { receipt: Receipt }).receipt.status).toBe('dry-run')
  })

  test('two clones of one remote: apply deletes each remote branch once', () => {
    const fx = buildFixture()
    const parent = tempDir()
    sh(parent, ['clone', '-q', fx.bare, 'a'])
    sh(parent, ['clone', '-q', fx.bare, 'b'])
    sh(join(parent, 'a'), ['fetch', '-q'])
    const res = run(['apply', ...SWEEP, '--only', 'remotes', '--yes', 'a', 'b'], parent)
    expect(res.code).toBe(0)
    expect(res.out).toContain('duplicate')
    expect(res.out).toContain('status: complete')
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
  })

  test('a row that turns into a review row while the question waits is dropped, not run', () => {
    const fx = buildFixture()
    sh(fx.root, ['branch', 'extra', 'main'])
    const res = run(['apply', ...SWEEP, '--only', 'branches'], fx.root, {
      confirm: () => {
        // Work lands on `extra` after the preview judged it merged.
        sh(fx.root, ['checkout', '-q', 'extra'])
        sh(fx.root, ['commit', '-q', '--allow-empty', '-m', 'late'])
        sh(fx.root, ['checkout', '-q', 'main'])
        return true
      },
    })
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/dropped\s+local_branch:extra — needs-review/)
    expect(branchRefs(fx.root)).toContain('refs/heads/extra')
  })

  test('--repo-root that names no plan repository exits 1', () => {
    const fx = buildFixture()
    const plan = join(fx.root, 'p.json')
    run(['plan', '--branch', BRANCH, ...SWEEP, '--remotes', '-o', plan], fx.root)
    const res = run(['apply', '--plan', plan, '--repo-root', tempDir(), '--yes'], fx.root)
    expect(res.code).toBe(1)
    expect(res.err).toContain('no plan repository at')
  })

  test('a no deletes nothing', () => {
    const fx = buildFixture()
    const res = run(['apply', '--branch', BRANCH, ...SWEEP, '--remotes'], fx.root, {
      confirm: () => false,
    })
    expect(res.code).toBe(0)
    expect(res.err).toContain('nothing deleted')
    expect(existsSync(fx.worktree)).toBe(true)
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('with no terminal and no --yes it refuses, after showing the steps', () => {
    const fx = buildFixture()
    const res = run(['apply', '--branch', BRANCH, ...SWEEP, '--remotes'], fx.root)
    expect(res.code).toBe(2)
    expect(res.out).toContain(`delete  remote_branch  origin/${BRANCH}`)
    expect(res.out).toContain('would delete: 1 local branch, 1 remote branch')
    expect(res.err).toContain('--yes')
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('--dry-run deletes nothing and writes no receipt', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    run(['plan', '--branch', BRANCH, ...SWEEP, '--remotes', '-o', plan], fx.root)
    const dry = run(['apply', '--plan', plan, '--dry-run', '--output', 'json'], fx.root)
    expect(dry.code).toBe(0)
    expect((JSON.parse(dry.out) as { receiptPath: string | null }).receiptPath).toBeNull()
    expect(readdirSync(dirname(plan))).toEqual(['p.json'])
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('--plan - reads the plan from stdin', () => {
    const fx = buildFixture()
    const plan = run(['plan', '--branch', BRANCH, ...SWEEP, '--remotes'], fx.root).out
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
    expect(run(['plan', '--branch', BRANCH, ...SWEEP, '--remotes', '-o', plan], fx.root).code).toBe(
      0,
    )
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
