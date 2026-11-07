/**
 * The `repo-cleaner` CLI driven in process: argument handling, exit codes, the
 * combinations it refuses, and branch mode from plan to clean against a worker
 * with a bare remote.
 */

import { afterEach, describe, expect, test } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdirSync,
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
import type { Bucket, Kind } from '../src/types.ts'
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

/** Remote branches too, judged on git evidence alone, against the remote-tracking refs on disk. */
const REMOTE = ['--remote', '--provider', 'none', '--offline']

/** All three rows of the fixture's branch, named so a run does not depend on how each is judged. */
function rowsOf(fx: Fixture): string[] {
  return [`worktree:${fx.worktree}`, `branch:${BRANCH}`, `remote:origin/${BRANCH}`].flatMap((r) => [
    '--pick',
    r,
  ])
}

/**
 * Make the fixture's worktree look freshly made: no reflog and no upstream of
 * its own, so with no PR evidence it is a review row, not a delete.
 */
function looksFresh(fx: Fixture): void {
  rmSync(join(fx.root, '.git', 'logs', 'refs', 'heads', BRANCH), { force: true })
  sh(fx.root, ['branch', '--unset-upstream', BRANCH])
}

/** The URL target for a local bare repository. */
const urlOf = (bare: string): string => `file://${bare}`

const kindsOf = (plan: Plan): Kind[] =>
  plan.repos[0]!.rows.map((r) => r.id.slice(0, r.id.indexOf(':')) as Kind).sort()

describe('arguments', () => {
  test('--help exits 0 and names every command', () => {
    const res = run(['--help'], tempDir())
    expect(res.code).toBe(0)
    for (const verb of ['[target...]', 'plan', 'clean', 'cache'])
      expect(res.out).toContain(`repo-cleaner ${verb}`)
    expect(run(['clean', '--help'], tempDir()).code).toBe(0)
    expect(run(['plan', '--help'], tempDir()).code).toBe(0)
    expect(run(['cache', '--help'], tempDir()).code).toBe(0)
  })

  test('a malformed command exits 2', () => {
    const fx = buildFixture()
    const cwd = tempDir()
    expect(run(['--bogus'], cwd).code).toBe(2)
    expect(run(['--only', 'nope'], cwd).code).toBe(2)
    expect(run(['--scope', 'worktree'], cwd).code).toBe(2)
    expect(run(['--branch', 'x', 'some/path', 'other/path'], cwd).code).toBe(2)
    expect(run(['--all', '--format', 'json'], cwd).code).toBe(2)
    expect(run(['--write-plan'], cwd).code).toBe(2)
    // A malformed row is only refused once there is a plan to hold it.
    expect(run(['clean', '--pick', 'nope:x', '--yes'], fx.root).code).toBe(2)
    expect(run(['clean', '--plan', 'p.json', '--allow', 'a=nope'], cwd).code).toBe(2)
    expect(run(['clean', '--plan', 'p.json', '--authorize', 'abandon-unmerged'], cwd).code).toBe(2)
    expect(run(['clean', '--plan', 'p.json', '--branch', 'x'], cwd).code).toBe(2)
    expect(run(['clean', '--plan', 'p.json', 'some/path'], cwd).code).toBe(2)
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('--plan - needs --yes or --dry-run, because stdin cannot also answer', () => {
    const res = run(['clean', '--plan', '-'], tempDir())
    expect(res.code).toBe(2)
    expect(res.err).toContain('--yes')
  })

  test('--branch HEAD outside a repository is refused', () => {
    const res = run(['--branch', 'HEAD'], tempDir())
    expect(res.code).toBe(2)
    expect(res.err).toContain('repo-cleaner:')
  })

  test('nothing to sweep exits 10, for every command that sweeps', () => {
    const cwd = tempDir()
    expect(run([], cwd).code).toBe(10)
    expect(run(['plan'], cwd).code).toBe(10)
    expect(run(['clean'], cwd).code).toBe(10)
  })

  test('an unreadable plan exits 1', () => {
    const res = run(['clean', '--plan', 'missing.json', '--yes'], tempDir())
    expect(res.code).toBe(1)
    expect(res.err).toContain('cannot read plan')
  })
})

describe('help', () => {
  for (const [label, prefix] of [
    ['the report', []],
    ['clean', ['clean']],
  ] as const) {
    test(`${label}: --help is the short tier, ending with the pointer to --help --extended`, () => {
      const res = run([...prefix, '--help'], tempDir())
      expect(res.code).toBe(0)
      expect(res.out.trimEnd()).toMatch(/Run with --help --extended for the full reference[^\n]*$/)
      expect(res.out).not.toContain('Refused before anything is deleted')
    })

    test(`${label}: --help --extended prints the full reference`, () => {
      const res = run([...prefix, '--help', '--extended'], tempDir())
      expect(res.code).toBe(0)
      expect(res.out).toContain('Refused before anything is deleted (exit 2)')
      expect(res.out).toContain('Refused after the sweep, before deleting (exit 1)')
      expect(res.out).toContain('Allowed, because nothing contradicts')
      expect(res.out).toContain('Verdicts')
      expect(res.out).toContain('Exit codes')
    })

    test(`${label}: --extended without --help exits 2`, () => {
      const res = run([...prefix, '--extended'], tempDir())
      expect(res.code).toBe(2)
      expect(res.err).toContain('--extended goes with --help')
      expect(res.out).toBe('')
    })
  }

  test('each reference carries its own command', () => {
    expect(run(['--help', '--extended'], tempDir()).out).toContain('--format summary')
    const clean = run(['clean', '--help', '--extended'], tempDir()).out
    expect(clean).toContain('--spare <row>')
    expect(clean).toContain('--allow <risk>=<row>')
  })
})

const branchRefs = (dir: string): string => sh(dir, ['for-each-ref', 'refs/heads/'])

describe('status line', () => {
  test('drawn on a terminal stderr, erased before the report, never on stdout', () => {
    const fx = buildFixture()
    const res = run(['--format', 'summary', ...REMOTE], fx.root, { stderrIsTerminal: true })
    expect(res.code).toBe(0)
    expect(res.err).toContain('\r\x1b[2K')
    expect(res.err).toContain('checking remote branches')
    expect(res.err.endsWith('\r\x1b[2K')).toBe(true)
    expect(res.out).not.toContain('\x1b')
  })

  test('--no-progress, or a stderr that is not a terminal, draws none', () => {
    const fx = buildFixture()
    const off = run(['--format', 'summary', ...REMOTE, '--no-progress'], fx.root, {
      stderrIsTerminal: true,
    })
    expect(off.err).not.toContain('\x1b')
    const piped = run(['--format', 'summary', ...REMOTE], fx.root)
    expect(piped.err).not.toContain('\x1b')
  })

  test('clean shows the re-check and each step', () => {
    const fx = buildFixture()
    const res = run(['clean', '--branch', BRANCH, ...REMOTE, ...rowsOf(fx), '--yes'], fx.root, {
      stderrIsTerminal: true,
    })
    expect(res.code).toBe(0)
    expect(res.err).toContain('re-checking')
    expect(res.err).toMatch(/deleting [░█]+ 1\//)
  })
})

describe('plan', () => {
  test('writes the plan to stdout by default and the totals to stderr', () => {
    const fx = buildFixture()
    const res = run(['plan', '--branch', BRANCH, ...REMOTE], fx.root)
    expect(res.code).toBe(0)
    const plan = JSON.parse(res.out) as Plan
    expect(plan.version).toBe(2)
    expect(kindsOf(plan)).toEqual(['branch', 'remote', 'worktree'])
    expect(res.err).toContain('to delete')
  })

  test('-o writes a file and names it on stderr', () => {
    const fx = buildFixture()
    const out = join(fx.root, '.plans', 'p.json')
    const res = run(['plan', '--branch', BRANCH, ...REMOTE, '-o', out], fx.root)
    expect(res.code).toBe(0)
    expect(res.out).toBe('')
    expect(res.err).toContain(`plan: ${out}`)
    expect(existsSync(out)).toBe(true)
  })

  test('--only narrows the plan to the named kinds', () => {
    const fx = buildFixture()
    const res = run(
      ['plan', '--branch', BRANCH, '--provider', 'none', '--offline', '--only', 'remote'],
      fx.root,
    )
    expect(res.code).toBe(0)
    const plan = JSON.parse(res.out) as Plan
    expect(kindsOf(plan)).toEqual(['remote'])
    expect(plan.options.only).toEqual(['remote'])
  })
})

describe('--format summary', () => {
  test('counts each kind, with how many are merged', () => {
    const fx = buildFixture()
    sh(fx.root, ['branch', 'stale-unmerged'])
    sh(fx.root, ['checkout', '-q', 'stale-unmerged'])
    sh(fx.root, ['commit', '-q', '--allow-empty', '-m', 'not merged'])
    sh(fx.root, ['checkout', '-q', 'main'])
    const res = run(['--format', 'json', ...REMOTE], fx.root)
    expect(res.code).toBe(0)
    const out = JSON.parse(res.out) as {
      repos: Array<{ counts: Record<Kind, Bucket> }>
      counts: Record<Kind, Bucket>
      totals: Bucket
    }
    const counts = out.repos[0]!.counts
    // main (default, not judged), feat/s (held by the worktree, merged), stale-unmerged.
    expect(counts.branch).toMatchObject({ total: 3, merged: 1 })
    // The primary worktree is not judged; the feature worktree is merged.
    expect(counts.worktree).toMatchObject({ total: 2, merged: 1 })
    // origin/main (not judged) and origin/feat/s (merged).
    expect(counts.remote).toMatchObject({ total: 2, merged: 1 })
    expect(out.counts).toEqual(counts)
    expect(out.totals).toMatchObject({ total: 7, merged: 3 })
  })

  test('text shows one table per repository and the closing totals line', () => {
    const fx = buildFixture()
    const res = run(['--format', 'summary', ...REMOTE], fx.root)
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/total\s+merged\s+delete\s+prune\s+review\s+blocked\s+keep/)
    expect(res.out).toMatch(/local branches\s+2\s+1\s/)
    expect(res.out).toContain('across 1 repository')
  })
})

describe('remote branches are opt-in', () => {
  test('by default only worktrees and local branches are swept, and the report says so', () => {
    const fx = buildFixture()
    const res = run(['--all'], fx.root)
    expect(res.code).toBe(0)
    expect(res.out).not.toMatch(/^ {2}remote {2}/m)
    expect(res.out).toMatch(/^ {2}branch {4}/m)
    expect(res.out).toContain('remote branches not checked; add --remote for all three.')
    const json = JSON.parse(run(['plan', '--branch', BRANCH], fx.root).out) as Plan
    expect(kindsOf(json)).toEqual(['branch', 'worktree'])
  })

  test('--remote and --only remote include them; the note goes away', () => {
    const fx = buildFixture()
    for (const flags of [
      ['--remote', '--provider', 'none', '--offline'],
      ['--only', 'remote', '--provider', 'none', '--offline'],
      ['--only', 'branch,remote', '--remote', '--provider', 'none', '--offline'],
    ]) {
      const res = run(['--all', ...flags], fx.root)
      expect(res.code).toBe(0)
      expect(res.out).toContain(`origin/${BRANCH}`)
      expect(res.out).not.toContain('remote branches not checked')
    }
  })

  test('clean re-checks only the kinds its rows are', () => {
    const fx = buildFixture()
    const plan = join(tempDir(), 'p.json')
    expect(run(['plan', '--branch', BRANCH, ...REMOTE, '-o', plan], fx.root).code).toBe(0)
    const res = run(
      ['clean', '--plan', plan, '--yes', '--pick', `worktree:${fx.worktree}`],
      fx.root,
      { stderrIsTerminal: true },
    )
    expect(res.code).toBe(0)
    expect(res.err).toContain('re-checking')
    expect(res.err).not.toContain('checking local branches')
    expect(res.err).not.toContain('checking remote branches')
    expect(existsSync(fx.worktree)).toBe(false)
    // The branches were in the plan but not picked: they are still there.
    expect(branchRefs(fx.root)).toContain(BRANCH)
    expect(branchRefs(fx.bare)).toContain(BRANCH)
  })
})

describe('local by default means offline', () => {
  test('without --remote nothing is fetched and the plan records no provider', () => {
    const fx = buildFixture()
    // A commit on the remote the worker has not fetched.
    const other = join(tempDir(), 'other')
    sh(tempDir(), ['clone', '-q', fx.bare, other])
    sh(other, ['commit', '-q', '--allow-empty', '-m', 'elsewhere'])
    sh(other, ['push', '-q', 'origin', 'main'])
    const before = sh(fx.root, ['rev-parse', 'origin/main'])

    const local = run([], fx.root)
    expect(local.code).toBe(0)
    expect(local.out).toContain('not fetched')
    expect(local.out).toContain('Local only: nothing fetched, no pull requests looked up')
    expect(sh(fx.root, ['rev-parse', 'origin/main'])).toBe(before)
    const plan = JSON.parse(run(['plan'], fx.root).out) as Plan
    expect(plan.options.provider).toBe('none')
    expect(plan.options.remote).toBe(false)
    expect(plan.repos[0]!.fetched).toBe(false)
    const fetched = JSON.parse(run(['plan', '--remote', '--provider', 'none'], fx.root).out) as Plan
    expect(fetched.repos[0]!.fetched).toBe(true)

    const online = run(['--remote', '--provider', 'none'], fx.root)
    expect(online.code).toBe(0)
    expect(online.out).not.toContain('not fetched')
    expect(sh(fx.root, ['rev-parse', 'origin/main'])).not.toBe(before)
  })

  test('--against names the remote to measure against; --remotes is not a flag', () => {
    const fx = buildFixture()
    const plan = JSON.parse(run(['plan', '--against', 'origin'], fx.root).out) as Plan
    expect(plan.options.against).toBe('origin')
    expect((JSON.parse(run(['plan'], fx.root).out) as Plan).options.against).toBeNull()
    const typo = run(['--remotes'], fx.root)
    expect(typo.code).toBe(2)
    expect(typo.err).toContain("unknown option '--remotes'")
    expect(typo.err).toContain('Did you mean --remote?')
    expect(run(['clean', '--plan', 'p.json', '--against', 'origin'], fx.root).err).toContain(
      '--against',
    )
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
    const code = main(argv, ctx, {
      confirm: () => null,
      terminalSize: () => ({ width: 200, height: 40 }),
      ...deps,
    })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }

  test('a terminal gets colored verdict words; NO_COLOR and a pipe do not', () => {
    const fx = buildFixture()
    sh(fx.root, ['branch', 'gone-already'])
    const colored = colorRun([], fx.root, {})
    expect(colored.out).toContain('\x1b[31mdelete')
    expect(colored.out).toContain('\x1b[1m')
    expect(colorRun([], fx.root, { NO_COLOR: '1' }).out).not.toContain('\x1b[')
    expect(run([], fx.root).out).not.toContain('\x1b[')
  })

  test('on a terminal clean lists every step, then checks each off as it runs', () => {
    const fx = buildFixture()
    const res = colorRun(
      ['clean', '--branch', BRANCH, ...REMOTE, '--yes', ...rowsOf(fx)],
      fx.root,
      { NO_COLOR: '1' },
    )
    expect(res.code).toBe(0)
    const out = res.out
    const preview = out.indexOf(`delete  remote:origin/${BRANCH}`)
    const done = out.indexOf(`✓ delete  remote:origin/${BRANCH}`)
    expect(preview).toBeGreaterThanOrEqual(0)
    expect(done).toBeGreaterThan(preview)
    expect(out).toContain(`✓ delete  worktree:`)
    expect(out).toContain(`✓ delete  branch:${BRANCH}`)
    // The steps are not listed a second time under the counts.
    expect(out).not.toMatch(/^ok {7}/m)
    expect(out).toContain('deleted: 1 worktree, 1 local branch, 1 remote branch')
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
  })

  test('a live run that fails shows the cross on the board and the error in full', () => {
    const fx = buildFixture()
    const hook = join(fx.bare, 'hooks', 'pre-receive')
    writeFileSync(hook, '#!/bin/sh\nexit 1\n')
    chmodSync(hook, 0o755)
    const res = colorRun(
      ['clean', '--branch', BRANCH, ...REMOTE, '--yes', '--pick', `remote:origin/${BRANCH}`],
      fx.root,
      { NO_COLOR: '1' },
    )
    expect(res.code).toBe(11)
    expect(res.out).toContain(`█ ✗ delete  remote:origin/${BRANCH}`)
    // Under the board, the full error.
    expect(res.out).toMatch(/\n {2}✗ delete +remote:origin\/feat\/s\n +.*pre-receive hook declined/)
  })

  test("a live run keeps a failed step's error when the receipt then cannot be saved", () => {
    const fx = buildFixture()
    const receiptDir = join(tempDir(), 'receipts')
    mkdirSync(receiptDir)
    cleanups.push(() => chmodSync(receiptDir, 0o700))
    // The hook runs after the first save: it locks the receipt directory, then refuses the push.
    const hook = join(fx.bare, 'hooks', 'pre-receive')
    writeFileSync(hook, `#!/bin/sh\nchmod 500 '${receiptDir}'\nexit 1\n`)
    chmodSync(hook, 0o755)
    const res = colorRun(
      [
        'clean',
        '--branch',
        BRANCH,
        ...REMOTE,
        '--yes',
        '--pick',
        `remote:origin/${BRANCH}`,
        '--receipt',
        join(receiptDir, 'r.json'),
      ],
      fx.root,
      { NO_COLOR: '1' },
    )
    expect(res.code).toBe(1)
    expect(res.out).toMatch(/\n {2}✗ delete +remote:origin\/feat\/s\n +.*pre-receive hook declined/)
  })

  test('a live run names a row its own re-check dropped after the preview', () => {
    const fx = buildFixture()
    const res = colorRun(
      ['clean', '--branch', BRANCH, ...REMOTE, ...rowsOf(fx)],
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
    expect(tail).toMatch(/skip {2}branch:feat\/s\n +changed: /)
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('the preview before the question is colored and summarized', () => {
    const fx = buildFixture()
    looksFresh(fx)
    const asked: string[] = []
    const res = colorRun(
      ['clean', '--branch', BRANCH, ...REMOTE],
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
    expect(asked).toEqual(['Delete 1 item?'])
    expect(res.out).toContain('\x1b[31mdelete')
    expect(res.out).toContain('\x1b[33mskip')
    expect(res.out).toContain('\x1b[1mwould delete: 1 remote branch')
    expect(branchRefs(fx.bare)).toContain(BRANCH)
  })
})

describe('prune rows', () => {
  test('a stale worktree link shows as prune in the report and the summary', () => {
    const fx = buildFixture()
    rmSync(fx.worktree, { recursive: true, force: true })
    const report = run([...REMOTE], fx.root)
    expect(report.code).toBe(0)
    const row = report.out.split('\n').find((l) => l.includes('wt s'))!
    expect(row).toMatch(/worktree\s+\S.*\s+prune\s+worktree directory no longer on disk/)
    expect(report.out).toMatch(/\d+ to delete, 1 to prune, \d+ to review/)

    const text = run(['--format', 'summary', ...REMOTE], fx.root)
    // worktrees: total 2 (primary + stale), merged, delete 0 (prune is counted apart), prune 1.
    expect(text.out).toMatch(/worktrees\s+2\s+\d+\s+0\s+1\s/)
    const json = JSON.parse(run(['--format', 'json', ...REMOTE], fx.root).out) as {
      repos: Array<{ counts: Record<Kind, Bucket> }>
      totals: Bucket
    }
    expect(json.repos[0]!.counts.worktree).toMatchObject({ prune: 1, delete: 0 })
    expect(json.totals.prune).toBe(1)
  })
})

describe('a remote URL target', () => {
  /** A run whose cache directory is a fresh temp dir, so the mirror is the test's own. */
  function remoteRun(argv: string[], cwd: string, cache: string, deps: MainDeps = {}) {
    const ctx = captureContext({ cwd, env: { ...process.env, REPO_CLEANER_CACHE_DIR: cache } })
    const code = main(argv, ctx, { confirm: () => null, ...deps })
    return { code, out: ctx.io.out, err: ctx.io.err }
  }
  const NONE = ['--provider', 'none']

  test('the report sweeps the remote branches of a URL with no checkout', () => {
    const fx = buildFixture()
    const cache = tempDir()
    const away = tempDir()
    const res = remoteRun([urlOf(fx.bare), ...NONE], away, cache)
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/remote\s+origin\/feat\/s\s+delete/)
    expect(res.out).not.toContain('worktree')
    expect(res.out).not.toMatch(/^ {2}branch /m)
    // One mirror, a clone with no files checked out.
    const mirrors = readdirSync(cache, { recursive: true }).filter((p) =>
      String(p).endsWith('.git'),
    )
    expect(mirrors).toHaveLength(1)
  })

  test('clean deletes the branch on the remote, and the mirror is reused', () => {
    const fx = buildFixture()
    const cache = tempDir()
    const away = tempDir()
    const res = remoteRun(['clean', urlOf(fx.bare), ...NONE, '--yes'], away, cache)
    expect(res.code).toBe(0)
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
    expect(branchRefs(fx.bare)).toContain('main')

    // A branch pushed since is found on the next run: the mirror is fetched, not re-cloned.
    sh(fx.root, ['push', '-q', 'origin', `main:refs/heads/feat/later`])
    const again = remoteRun([urlOf(fx.bare), ...NONE], away, cache)
    expect(again.code).toBe(0)
    expect(again.out).toMatch(/origin\/feat\/later\s+delete/)
  })

  test('a plan written from a URL runs later from anywhere', () => {
    const fx = buildFixture()
    const cache = tempDir()
    const away = tempDir()
    const plan = join(away, 'p.json')
    expect(remoteRun(['plan', urlOf(fx.bare), ...NONE, '-o', plan], away, cache).code).toBe(0)
    const cleaned = remoteRun(['clean', '--plan', plan, '--yes'], tempDir(), cache)
    expect(cleaned.code).toBe(0)
    expect(cleaned.out).toContain('deleted: 1 remote branch')
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
  })

  test('refuses paths, --branch and other kinds, before cloning anything', () => {
    const cache = tempDir()
    const cwd = tempDir()
    const url = 'https://example.invalid/u.git'
    expect(remoteRun([url, 'some/path'], cwd, cache).code).toBe(2)
    expect(remoteRun([url, '--branch', 'x'], cwd, cache).code).toBe(2)
    expect(remoteRun([url, '--only', 'worktree'], cwd, cache).code).toBe(2)
    expect(remoteRun([url, '--only', 'branch'], cwd, cache).code).toBe(2)
    expect(remoteRun([url, '--offline'], cwd, cache).code).toBe(2)
    expect(readdirSync(cache)).toEqual([])
  })

  test('an empty target is refused, not dropped in favour of the checkout you are in', () => {
    const fx = buildFixture()
    const res = remoteRun(['clean', '', ...REMOTE, '--yes'], fx.root, tempDir())
    expect(res.code).toBe(2)
    expect(res.err).toContain('a target is empty')
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('--plan fixes what is swept, so a URL target is refused with it', () => {
    const res = remoteRun(
      ['clean', '--plan', 'p.json', 'https://example.invalid/u.git'],
      tempDir(),
      tempDir(),
    )
    expect(res.code).toBe(2)
    expect(res.err).toContain('targets')
  })

  test('a mirror that pushes elsewhere is refused, swept or from a plan', () => {
    const fx = buildFixture()
    const cache = tempDir()
    const away = tempDir()
    const plan = join(away, 'p.json')
    expect(remoteRun(['plan', urlOf(fx.bare), ...NONE, '-o', plan], away, cache).code).toBe(0)
    const mirror = (JSON.parse(readFileSync(plan, 'utf8')) as Plan).repos[0]!.root
    const elsewhere = makeBareAndWorker()
    cleanups.push(elsewhere.cleanup)
    sh(mirror, ['config', 'remote.origin.pushurl', elsewhere.bare.dir])

    const swept = remoteRun(['plan', urlOf(fx.bare), ...NONE], away, cache)
    expect(swept.code).toBe(1)
    expect(swept.err).toContain('pushes somewhere other than')
    const report = remoteRun([urlOf(fx.bare), ...NONE], away, cache)
    expect(report.out).toContain('pushes somewhere other than')
    const cleaned = remoteRun(['clean', '--plan', plan, '--yes'], away, cache)
    expect(cleaned.code).toBe(1)
    expect(cleaned.err).toContain('refusing to run')
    expect(branchRefs(fx.bare)).toContain(BRANCH)
  })

  test('a failed clone does not print the credentials in its URL', () => {
    const res = remoteRun(
      ['plan', 'https://me:SECRET@127.0.0.1:9/acme/repo.git?t=SECRET', ...NONE],
      tempDir(),
      tempDir(),
    )
    expect(res.code).toBe(1)
    expect(res.err).toContain('cannot clone https://127.0.0.1:9/acme/repo.git')
    expect(res.out + res.err).not.toContain('SECRET')
    const report = remoteRun(
      ['https://me:SECRET@127.0.0.1:9/acme/repo.git?t=SECRET', ...NONE],
      tempDir(),
      tempDir(),
    )
    expect(report.out).toContain('cannot clone https://127.0.0.1:9/acme/repo.git')
    expect(report.out + report.err).not.toContain('SECRET')
  })

  test('a URL that cannot be cloned exits 1 and leaves nothing in the cache', () => {
    const cache = tempDir()
    const res = remoteRun(
      ['plan', urlOf(join(tempDir(), 'missing.git')), ...NONE],
      tempDir(),
      cache,
    )
    expect(res.code).toBe(1)
    expect(res.err).toContain('cannot clone')
    expect(
      readdirSync(cache, { recursive: true }).filter((p) => String(p).includes('partial')),
    ).toEqual([])
  })

  describe('cache', () => {
    test('list shows each clone with its URL, and remove drops one by URL', () => {
      const fx = buildFixture()
      const cache = tempDir()
      const away = tempDir()
      const url = urlOf(fx.bare)
      expect(remoteRun(['cache'], away, cache).out).toMatch(/^no clones in /)
      expect(remoteRun([url, ...NONE], away, cache).code).toBe(0)

      const list = remoteRun(['cache', 'list'], away, cache)
      expect(list.code).toBe(0)
      expect(list.out).toContain(url)
      expect(list.out).toMatch(/1 clone, [\d.]+ (B|KB|MB), in /)
      const json = JSON.parse(remoteRun(['cache', '--format', 'json'], away, cache).out) as {
        mirrors: Array<{ dir: string; url: string; problem: string | null }>
      }
      expect(json.mirrors).toHaveLength(1)
      expect(json.mirrors[0]).toMatchObject({ url, problem: null })

      const removed = remoteRun(['cache', 'remove', url], away, cache)
      expect(removed.code).toBe(0)
      expect(existsSync(json.mirrors[0]!.dir)).toBe(false)
      const again = remoteRun(['cache', 'remove', url], away, cache)
      expect(again.code).toBe(1)
      expect(again.err).toContain('no clone of')
    })

    test('remove --all removes every clone, a stopped clone included', () => {
      const fx = buildFixture()
      const cache = tempDir()
      const away = tempDir()
      expect(remoteRun([urlOf(fx.bare), ...NONE], away, cache).code).toBe(0)
      const dir = (
        JSON.parse(remoteRun(['cache', '--format', 'json'], away, cache).out) as {
          cache: string
        }
      ).cache
      mkdirSync(join(dir, 'x-123.partial-99'))
      mkdirSync(join(dir, 'y\x1b[31m-1.partial-98'))
      const listed = remoteRun(['cache'], away, cache).out
      expect(listed).toContain('left by a stopped clone')
      expect(listed).not.toContain('\x1b')
      const res = remoteRun(['cache', 'remove', '--all'], away, cache)
      expect(res.code).toBe(0)
      expect(readdirSync(dir)).toEqual([])
    })

    test('remove --format json names the URLs with no clone', () => {
      const cache = tempDir()
      const away = tempDir()
      const res = remoteRun(
        ['cache', 'remove', 'https://u:TOKEN@host.example/a/b.git', '--format', 'json'],
        away,
        cache,
      )
      expect(res.code).toBe(1)
      const json = JSON.parse(res.out) as {
        removed: string[]
        missing: string[]
        failed: unknown[]
      }
      expect(json).toMatchObject({
        removed: [],
        missing: ['https://host.example/a/b.git'],
        failed: [],
      })
      expect(res.out + res.err).not.toContain('TOKEN')
    })

    test('a clone that cannot be removed is reported, and the rest still go', () => {
      if (process.platform === 'win32' || process.getuid?.() === 0) return
      const fx = buildFixture()
      const cache = tempDir()
      const away = tempDir()
      expect(remoteRun([urlOf(fx.bare), ...NONE], away, cache).code).toBe(0)
      const dir = (
        JSON.parse(remoteRun(['cache', '--format', 'json'], away, cache).out) as { cache: string }
      ).cache
      const stuck = join(dir, 'z-stuck.partial-97')
      mkdirSync(join(stuck, 'inner'), { recursive: true })
      chmodSync(stuck, 0o500)
      try {
        const res = remoteRun(['cache', 'remove', '--all'], away, cache)
        expect(res.code).toBe(1)
        expect(res.err).toContain('cannot remove')
        expect(readdirSync(dir)).toEqual(['z-stuck.partial-97'])
      } finally {
        chmodSync(stuck, 0o700)
      }
    })

    test('remove needs URLs or --all, and list takes neither', () => {
      const cache = tempDir()
      const away = tempDir()
      expect(remoteRun(['cache', 'remove'], away, cache).code).toBe(2)
      expect(remoteRun(['cache', 'remove', '--all', 'x'], away, cache).code).toBe(2)
      expect(remoteRun(['cache', 'list', 'x'], away, cache).code).toBe(2)
      expect(remoteRun(['cache', 'prune'], away, cache).err).toContain('use list or remove')
    })
  })
})

describe('clean', () => {
  test('from a plan file: deletes everywhere and writes the receipt beside the plan', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    expect(run(['plan', '--branch', 'HEAD', ...REMOTE, '-o', plan], fx.worktree).code).toBe(0)

    const cleaned = run(
      ['clean', '--plan', plan, ...rowsOf(fx), '--yes', '--format', 'json'],
      fx.root,
    )
    expect(cleaned.code).toBe(0)
    const out = JSON.parse(cleaned.out) as {
      receiptPath: string
      receipt: Receipt
      summary: unknown
    }
    expect(out.receipt.status).toBe('complete')
    expect(out.summary).toMatchObject({ deleted: { worktree: 1, branch: 1, remote: 1 } })
    // The worktree path holds a space; the receipt's command quotes it.
    const remove = out.receipt.steps.find((s) => s.action === 'remove-worktree')!
    expect(remove.command).toContain(`'${fx.worktree}'`)
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
    const res = run(['clean', '--branch', BRANCH, ...REMOTE, ...rowsOf(fx)], fx.root, {
      confirm: (q) => {
        asked.push(q)
        return true
      },
    })
    expect(res.code).toBe(0)
    expect(asked).toEqual(['Delete 3 items?'])
    expect(res.out).toContain('would delete: 1 worktree, 1 local branch, 1 remote branch')
    expect(res.out).toContain('deleted: 1 worktree, 1 local branch, 1 remote branch')
    expect(res.out).toMatch(/delete  branch:feat\/s\n +git /)
    expect(res.out).toContain('status: complete')
    expect(existsSync(fx.worktree)).toBe(false)
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
  })

  test('--spare leaves a remote branch, checks its tip, and deletes the rest', () => {
    const fx = buildFixture()
    const spare = `remote:origin/${BRANCH}`
    const res = run(
      [
        'clean',
        '--branch',
        BRANCH,
        ...REMOTE,
        '--yes',
        '--spare',
        spare,
        '--pick',
        `worktree:${fx.worktree}`,
        '--pick',
        `branch:${BRANCH}`,
      ],
      fx.root,
    )
    expect(res.code).toBe(0)
    expect(res.out).toContain('deleted: 1 worktree, 1 local branch')
    expect(res.out).toMatch(
      /ok +remote:origin\/feat\/s — git ls-remote origin refs\/heads\/feat\/s \(tip unchanged; spared\)/,
    )
    expect(branchRefs(fx.bare)).toContain(BRANCH)
    expect(branchRefs(fx.root)).not.toContain(BRANCH)
    const both = run(
      ['clean', '--branch', BRANCH, ...REMOTE, '--yes', '--spare', spare, '--pick', spare],
      fx.root,
    )
    expect(both.code).toBe(2)
    expect(both.err).toContain('both picked and spared')
  })

  test('with no --pick a review row is dropped, not run', () => {
    const fx = buildFixture()
    looksFresh(fx)
    const res = run(['clean', '--branch', BRANCH, '--only', 'worktree', '--yes'], fx.root)
    expect(res.code).toBe(0)
    expect(res.out).toContain('needs-pick')
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a repository the sweep cannot read fails the run instead of reading as empty', () => {
    const fx = buildFixture()
    sh(fx.root, ['remote', 'set-url', 'origin', join(tempDir(), 'missing.git')])
    const res = run(['clean', '--remote', '--provider', 'none', '--yes'], fx.root)
    expect(res.code).toBe(1)
    expect(res.err).toContain('fetch failed')
    const plan = run(['plan', '--remote', '--provider', 'none'], fx.root)
    expect(plan.code).toBe(1)
    expect(plan.err).toContain('fetch failed')
  })

  test('the receipt file records the rows the preview dropped', () => {
    const fx = buildFixture()
    looksFresh(fx)
    const plan = join(fx.root, '.plans', 'p.json')
    run(['plan', '--branch', BRANCH, ...REMOTE, '-o', plan], fx.root)
    const res = run(['clean', '--plan', plan, '--yes', '--format', 'json'], fx.root)
    const out = JSON.parse(res.out) as { receiptPath: string; receipt: Receipt }
    const saved = JSON.parse(readFileSync(out.receiptPath, 'utf-8')) as Receipt
    expect(saved.dropped.map((d) => d.reason)).toContain('needs-pick')
    expect(saved.dropped).toEqual(out.receipt.dropped)
  })

  test('a run with no receipt file says so on stderr', () => {
    const fx = buildFixture()
    const res = run(['clean', '--branch', BRANCH, ...REMOTE, ...rowsOf(fx), '--yes'], fx.root)
    expect(res.code).toBe(0)
    expect(res.err).toContain('no receipt written')
  })

  test('an empty plan reports whether it was a dry run', () => {
    const fx = buildFixture()
    const plan = join(fx.root, 'empty.json')
    const made = JSON.parse(run(['plan'], fx.root).out) as Plan
    writeFileSync(plan, JSON.stringify({ ...made, repos: [] }))
    const real = run(['clean', '--plan', plan, '--yes', '--format', 'json'], fx.root)
    expect(real.code).toBe(0)
    expect(JSON.parse(real.out)).toMatchObject({ dryRun: false, steps: [], dropped: [] })
    const dry = run(['clean', '--plan', plan, '--dry-run', '--format', 'json'], fx.root)
    expect(dry.code).toBe(0)
    expect(JSON.parse(dry.out)).toMatchObject({ dryRun: true, steps: [], dropped: [] })
    expect(run(['clean', '--plan', plan, '--yes'], fx.root).out).toMatch(/^would delete: nothing$/m)
  })

  test('two clones of one remote: clean deletes each remote branch once', () => {
    const fx = buildFixture()
    const parent = tempDir()
    sh(parent, ['clone', '-q', fx.bare, 'a'])
    sh(parent, ['clone', '-q', fx.bare, 'b'])
    sh(join(parent, 'a'), ['fetch', '-q'])
    const res = run(
      ['clean', '--provider', 'none', '--offline', '--only', 'remote', '--yes', 'a', 'b'],
      parent,
    )
    expect(res.code).toBe(0)
    expect(res.out).toContain('duplicate')
    expect(res.out).toContain('status: complete')
    expect(branchRefs(fx.bare)).not.toContain(BRANCH)
  })

  test('a row that turns into a review row while the question waits is dropped, not run', () => {
    const fx = buildFixture()
    sh(fx.root, ['branch', 'extra', 'main'])
    const res = run(['clean', '--only', 'branch'], fx.root, {
      confirm: () => {
        // Work lands on `extra` after the preview judged it merged.
        sh(fx.root, ['checkout', '-q', 'extra'])
        sh(fx.root, ['commit', '-q', '--allow-empty', '-m', 'late'])
        sh(fx.root, ['checkout', '-q', 'main'])
        return true
      },
    })
    expect(res.code).toBe(0)
    expect(res.out).toMatch(/skipped\s+branch:extra — needs-pick/)
    expect(branchRefs(fx.root)).toContain('refs/heads/extra')
  })

  test('a no deletes nothing', () => {
    const fx = buildFixture()
    const res = run(['clean', '--branch', BRANCH, ...REMOTE], fx.root, {
      confirm: () => false,
    })
    expect(res.code).toBe(0)
    expect(res.err).toContain('nothing deleted')
    expect(existsSync(fx.worktree)).toBe(true)
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('with no terminal and no --yes it refuses, after showing the steps', () => {
    const fx = buildFixture()
    looksFresh(fx)
    const res = run(['clean', '--branch', BRANCH, ...REMOTE], fx.root)
    expect(res.code).toBe(2)
    expect(res.out).toContain(`delete  remote:origin/${BRANCH}`)
    // The branch goes only with its worktree, which needs --pick here.
    expect(res.out).toContain('which this run does not remove')
    expect(res.out).toContain('would delete: 1 remote branch')
    expect(res.err).toContain('--yes')
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('--dry-run deletes nothing and writes no receipt', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    run(['plan', '--branch', BRANCH, ...REMOTE, '-o', plan], fx.root)
    const dry = run(['clean', '--plan', plan, '--dry-run', '--format', 'json'], fx.root)
    expect(dry.code).toBe(0)
    const out = JSON.parse(dry.out) as { dryRun: boolean; receiptPath?: unknown }
    expect(out.dryRun).toBe(true)
    expect(out.receiptPath).toBeUndefined()
    expect(readdirSync(dirname(plan))).toEqual(['p.json'])
    expect(branchRefs(fx.root)).toContain(BRANCH)
  })

  test('--plan - reads the plan from stdin', () => {
    const fx = buildFixture()
    const plan = run(['plan', '--branch', BRANCH, ...REMOTE], fx.root).out
    const res = run(
      ['clean', '--plan', '-', '--yes', '--pick', `remote:origin/${BRANCH}`],
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
    const res = run(['clean', '--branch', BRANCH, '--only', 'worktree', '--yes'], fx.root)
    expect(res.code).toBe(0)
    expect(existsSync(fx.worktree)).toBe(true)
  })

  test('a failed step exits 11 under text and json; --receipt names the file', () => {
    const fx = buildFixture()
    const plan = join(fx.root, '.plans', 'p.json')
    expect(run(['plan', '--branch', BRANCH, ...REMOTE, '-o', plan], fx.root).code).toBe(0)
    const hook = join(fx.bare, 'hooks', 'pre-receive')
    writeFileSync(hook, '#!/bin/sh\nexit 1\n')
    chmodSync(hook, 0o755)

    const receipt = join(fx.root, 'r.json')
    const args = ['clean', '--plan', plan, '--yes', '--pick', `remote:origin/${BRANCH}`]
    const text = run([...args, '--receipt', receipt], fx.root)
    expect(text.code).toBe(11)
    expect(text.out).toContain('(failed)')
    expect((JSON.parse(readFileSync(receipt, 'utf-8')) as Receipt).status).toBe('failed')
    const json = run([...args, '--format', 'json'], fx.root)
    expect(json.code).toBe(11)
    expect((JSON.parse(json.out) as { receipt: Receipt }).receipt.status).toBe('failed')
  })
})

describe('refused combinations', () => {
  /** Nothing of the fixture's branch was deleted: worktree, local branch and remote branch. */
  function untouched(fx: Fixture): void {
    expect(existsSync(fx.worktree)).toBe(true)
    expect(branchRefs(fx.root)).toContain(BRANCH)
    expect(branchRefs(fx.bare)).toContain(BRANCH)
  }

  function refused(res: { code: number; err: string }, code: 1 | 2, message?: string): void {
    expect(res.code).toBe(code)
    if (message !== undefined) expect(res.err).toContain(message)
  }

  describe('exit 2, before anything is deleted', () => {
    test('the same row in --pick and --spare', () => {
      const fx = buildFixture()
      const row = `remote:origin/${BRANCH}`
      refused(
        run(
          ['clean', '--branch', BRANCH, ...REMOTE, '--pick', row, '--spare', row, '--yes'],
          fx.root,
        ),
        2,
        'both picked and spared',
      )
      // Named differently, it is still the same row.
      refused(
        run(
          ['clean', ...REMOTE, '--pick', BRANCH, '--spare', `branch:${BRANCH}`, '--yes'],
          fx.root,
        ),
        2,
        'both picked and spared',
      )
      untouched(fx)
    })

    test('--allow <risk>=<row> for a spared row', () => {
      const fx = buildFixture()
      refused(
        run(
          [
            'clean',
            ...REMOTE,
            '--spare',
            `branch:${BRANCH}`,
            '--allow',
            `abandon-unmerged=branch:${BRANCH}`,
            '--yes',
          ],
          fx.root,
        ),
        2,
        'is spared',
      )
      untouched(fx)
    })

    test('--allow <risk>=<row> for a row outside --pick', () => {
      const fx = buildFixture()
      refused(
        run(
          [
            'clean',
            ...REMOTE,
            '--pick',
            `worktree:${fx.worktree}`,
            '--allow',
            `abandon-unmerged=branch:${BRANCH}`,
            '--yes',
          ],
          fx.root,
        ),
        2,
        'is not picked',
      )
      untouched(fx)
    })

    test('a picked or spared row of a kind --only leaves out', () => {
      const fx = buildFixture()
      refused(
        run(['clean', '--only', 'worktree', '--pick', `branch:${BRANCH}`, '--yes'], fx.root),
        2,
        'the sweep has no branch rows',
      )
      refused(
        run(['clean', '--pick', `remote:origin/${BRANCH}`, '--yes'], fx.root),
        2,
        'the sweep has no remote rows',
      )
      refused(
        run(['clean', '--only', 'branch', '--spare', `worktree:${fx.worktree}`, '--yes'], fx.root),
        2,
        'the sweep has no worktree rows',
      )
      refused(
        run(
          ['clean', '--only', 'worktree', '--allow', `abandon-unmerged=branch:${BRANCH}`, '--yes'],
          fx.root,
        ),
        2,
        'the sweep has no branch rows',
      )
      untouched(fx)
    })

    test('a picked or spared row that is not one of --branch rows', () => {
      const fx = buildFixture()
      sh(fx.root, ['branch', 'other', 'main'])
      refused(
        run(['clean', '--branch', BRANCH, ...REMOTE, '--pick', 'branch:other', '--yes'], fx.root),
        2,
        `is not a row of --branch ${BRANCH}`,
      )
      refused(
        run(
          ['clean', '--branch', BRANCH, ...REMOTE, '--spare', 'remote:origin/other', '--yes'],
          fx.root,
        ),
        2,
        `is not a row of --branch ${BRANCH}`,
      )
      untouched(fx)
      expect(branchRefs(fx.root)).toContain('refs/heads/other')
    })

    test('--branch with more than one target, a remote URL, or the default branch', () => {
      const fx = buildFixture()
      const parent = tempDir()
      sh(parent, ['clone', '-q', fx.bare, 'a'])
      sh(parent, ['clone', '-q', fx.bare, 'b'])
      refused(run(['--branch', BRANCH, 'a', 'b'], parent), 2, 'one repository')
      refused(run(['clean', '--branch', BRANCH, 'a', 'b', '--yes'], parent), 2, 'one repository')
      // A directory that holds two checkouts is more than one target too.
      refused(run(['--branch', BRANCH], parent), 2, 'one repository')
      refused(
        run(['--branch', BRANCH, 'https://example.invalid/r.git'], tempDir()),
        2,
        'remote URL',
      )
      refused(run(['--branch', 'main'], fx.root), 2, 'default branch')
      refused(run(['clean', '--branch', 'main', '--yes'], fx.root), 2, 'default branch')
      untouched(fx)
    })

    test('--plan with targets or sweep options', () => {
      const fx = buildFixture()
      const plan = join(tempDir(), 'p.json')
      expect(run(['plan', '-o', plan], fx.root).code).toBe(0)
      for (const extra of [
        [fx.root],
        ['--only', 'worktree'],
        ['--branch', BRANCH],
        ['--remote'],
        ['--offline'],
        ['--against', 'origin'],
        ['--provider', 'none'],
      ]) {
        refused(
          run(['clean', '--plan', plan, ...extra, '--yes'], fx.root),
          2,
          '--plan already fixed what is swept',
        )
      }
      untouched(fx)
    })

    test('--plan - without --yes or --dry-run', () => {
      const fx = buildFixture()
      const plan = run(['plan'], fx.root).out
      refused(run(['clean', '--plan', '-'], fx.root, { readStdin: () => plan }), 2, '--yes')
      expect(
        run(['clean', '--plan', '-', '--dry-run'], fx.root, { readStdin: () => plan }).code,
      ).toBe(0)
      untouched(fx)
    })

    test('--yes with --dry-run, and --receipt with --dry-run', () => {
      const fx = buildFixture()
      refused(run(['clean', '--yes', '--dry-run'], fx.root), 2, 'contradict')
      const receipt = join(tempDir(), 'r.json')
      refused(run(['clean', '--dry-run', '--receipt', receipt], fx.root), 2, '--receipt')
      expect(existsSync(receipt)).toBe(false)
      untouched(fx)
    })

    test('--offline or --provider without --remote, for every command that sweeps', () => {
      const fx = buildFixture()
      for (const verb of [[], ['plan'], ['clean', '--yes']]) {
        refused(run([...verb, '--offline'], fx.root), 2, '--offline has no effect without --remote')
        refused(
          run([...verb, '--provider', 'none'], fx.root),
          2,
          '--provider has no effect without --remote',
        )
      }
      untouched(fx)
    })

    test('--remote with an --only that leaves remote out', () => {
      const fx = buildFixture()
      refused(run(['--remote', '--only', 'branch'], fx.root), 2, 'leaves them out')
      refused(run(['clean', '--remote', '--only', 'worktree,branch', '--yes'], fx.root), 2)
      untouched(fx)
    })

    test('a remote URL target with --only worktree or branch, --offline, or a checkout', () => {
      const fx = buildFixture()
      const cache = tempDir()
      const env = { ...process.env, REPO_CLEANER_CACHE_DIR: cache }
      const at = (argv: string[]) => {
        const ctx = captureContext({ cwd: tempDir(), env })
        return { code: main(argv, ctx, { confirm: () => null }), err: ctx.io.err }
      }
      const url = urlOf(fx.bare)
      refused(at(['clean', url, '--only', 'worktree', '--yes']), 2, 'only remote branches')
      refused(at(['clean', url, '--only', 'branch', '--yes']), 2, 'only remote branches')
      refused(at(['clean', url, '--offline', '--yes']), 2, '--offline would have no effect')
      refused(at(['clean', url, fx.root, '--yes']), 2, 'apart from checkouts')
      expect(readdirSync(cache)).toEqual([])
      untouched(fx)
    })

    test('--all with any --format but text', () => {
      const fx = buildFixture()
      for (const format of ['json', 'summary', 'commands']) {
        const res = run(['--all', '--format', format], fx.root)
        refused(res, 2, '--all has no effect')
        expect(res.code).toBe(2)
      }
      expect(run(['--all', '--format', 'text'], fx.root).code).toBe(0)
    })
  })

  describe('exit 1, after the sweep and before deleting', () => {
    test('a picked, spared or allowed row the plan does not have', () => {
      const fx = buildFixture()
      const plan = join(tempDir(), 'p.json')
      expect(run(['plan', ...REMOTE, '-o', plan], fx.root).code).toBe(0)
      refused(
        run(['clean', '--plan', plan, '--pick', 'branch:nope', '--yes'], fx.root),
        1,
        'no such row in the plan',
      )
      refused(
        run(['clean', '--plan', plan, '--spare', 'remote:origin/nope', '--yes'], fx.root),
        1,
        'no such row in the plan',
      )
      refused(
        run(['clean', '--plan', plan, '--allow', 'abandon-unmerged=nope', '--yes'], fx.root),
        1,
        'no such row in the plan',
      )
      // Swept now rather than planned: the same.
      refused(
        run(['clean', ...REMOTE, '--pick', 'branch:nope', '--yes'], fx.root),
        1,
        'no such row in the plan',
      )
      untouched(fx)
    })

    test('a row name that matches rows in more than one repository', () => {
      const fx = buildFixture()
      const parent = tempDir()
      for (const name of ['a', 'b']) {
        sh(parent, ['clone', '-q', fx.bare, name])
        sh(join(parent, name), ['branch', 'dup', 'main'])
      }
      refused(run(['clean', '--pick', 'dup', '--yes'], parent), 1, 'matches 2 rows')
      expect(branchRefs(join(parent, 'a'))).toContain('refs/heads/dup')
      expect(branchRefs(join(parent, 'b'))).toContain('refs/heads/dup')
      // Named by its full id it is still in both; swept one repository at a time it is one row.
      expect(run(['clean', 'a', '--pick', 'dup', '--yes'], parent).code).toBe(0)
      expect(branchRefs(join(parent, 'a'))).not.toContain('refs/heads/dup')
      expect(branchRefs(join(parent, 'b'))).toContain('refs/heads/dup')
    })

    test('a spared remote branch that moved since the plan stops the run', () => {
      const fx = buildFixture()
      const plan = join(tempDir(), 'p.json')
      expect(run(['plan', '--branch', BRANCH, ...REMOTE, '-o', plan], fx.root).code).toBe(0)
      const other = join(tempDir(), 'other')
      sh(tempDir(), ['clone', '-q', fx.bare, other])
      sh(other, ['checkout', '-q', BRANCH])
      sh(other, ['commit', '-q', '--allow-empty', '-m', 'moved'])
      sh(other, ['push', '-q', 'origin', BRANCH])
      sh(fx.root, ['fetch', '-q', 'origin'])
      const res = run(
        [
          'clean',
          '--plan',
          plan,
          '--spare',
          `remote:origin/${BRANCH}`,
          '--pick',
          `worktree:${fx.worktree}`,
          '--yes',
        ],
        fx.root,
      )
      refused(res, 1, 'moved since the plan')
      expect(existsSync(fx.worktree)).toBe(true)
      expect(branchRefs(fx.root)).toContain(BRANCH)
    })

    test('a version 1 plan', () => {
      const fx = buildFixture()
      const plan = join(tempDir(), 'v1.json')
      writeFileSync(plan, JSON.stringify({ version: 1, created_at: 'x', repos: [] }))
      refused(run(['clean', '--plan', plan, '--yes'], fx.root), 1, 'is version 1')
      refused(
        run(['clean', '--plan', '-', '--yes'], fx.root, {
          readStdin: () => readFileSync(plan, 'utf8'),
        }),
        1,
        'Sweep again',
      )
      untouched(fx)
    })
    // A plan where nothing could run still has its --spare and --allow rows checked.
    test('a spared or allowed row the plan does not have, when no plan row could run', () => {
      const fx = buildFixture()
      // The fixture's only local branch besides main is held by its worktree: nothing could run.
      const plan = JSON.parse(run(['plan', '--only', 'branch'], fx.root).out) as Plan
      expect(plan.repos[0]!.rows.every((r) => r.action === null)).toBe(true)
      refused(
        run(['clean', '--only', 'branch', '--spare', 'branch:nope', '--yes'], fx.root),
        1,
        'no such row in the plan',
      )
      refused(
        run(['clean', '--only', 'branch', '--allow', 'abandon-unmerged=nope', '--yes'], fx.root),
        1,
        'no such row in the plan',
      )
    })
  })

  describe('allowed, because nothing contradicts', () => {
    test('the same row picked twice runs once', () => {
      const fx = buildFixture()
      sh(fx.root, ['branch', 'extra', 'main'])
      const res = run(
        [
          'clean',
          '--only',
          'branch',
          '--pick',
          'branch:extra',
          '--pick',
          'branch:extra',
          '--pick',
          'extra',
          '--yes',
          '--format',
          'json',
        ],
        fx.root,
      )
      expect(res.code).toBe(0)
      const out = JSON.parse(res.out) as { receipt: Receipt; summary: { deleted: unknown } }
      expect(out.summary.deleted).toMatchObject({ branch: 1 })
      expect(out.receipt.steps.filter((s) => s.row === 'branch:extra')).toHaveLength(1)
      expect(branchRefs(fx.root)).not.toContain('refs/heads/extra')
    })

    test('--allow <risk> with --allow <risk>=<row>: the broader one covers it', () => {
      const fx = buildFixture()
      sh(fx.worktree, ['commit', '-q', '--allow-empty', '-m', 'unmerged'])
      const row = `worktree:${fx.worktree}`
      const res = run(
        [
          'clean',
          '--only',
          'worktree',
          '--pick',
          row,
          '--allow',
          'abandon-unmerged',
          '--allow',
          `abandon-unmerged=${row}`,
          '--yes',
        ],
        fx.root,
      )
      expect(res.code).toBe(0)
      expect(res.out).toContain('deleted: 1 worktree')
      expect(existsSync(fx.worktree)).toBe(false)
    })

    test('--allow for a risk no row that runs carries: the preview lists it as unused', () => {
      const fx = buildFixture()
      const res = run(
        [
          'clean',
          '--branch',
          BRANCH,
          ...REMOTE,
          ...rowsOf(fx),
          '--allow',
          'discard-changes',
          '--allow',
          `confirm-open-pr=branch:${BRANCH}`,
          '--dry-run',
        ],
        fx.root,
      )
      expect(res.code).toBe(0)
      expect(res.out).toContain('unused: --allow discard-changes (no row that runs carries it)')
      expect(res.out).toContain(`unused: --allow confirm-open-pr=branch:${BRANCH}`)
      const json = JSON.parse(
        run(
          [
            'clean',
            '--branch',
            BRANCH,
            ...REMOTE,
            ...rowsOf(fx),
            '--allow',
            'discard-changes',
            '--dry-run',
            '--format',
            'json',
          ],
          fx.root,
        ).out,
      ) as { dryRun: boolean; unusedAllows: unknown }
      expect(json.dryRun).toBe(true)
      expect(json.unusedAllows).toEqual([{ risk: 'discard-changes', row: null }])
      untouched(fx)
    })

    // A plan holds blocked and structural rows too, so a pick of one is skipped with its reason.
    test('picking a blocked row: it is skipped and shown with the reason', () => {
      const fx = buildFixture()
      sh(fx.root, ['worktree', 'lock', fx.worktree])
      const res = run(
        ['clean', '--only', 'worktree', '--pick', `worktree:${fx.worktree}`, '--dry-run'],
        fx.root,
      )
      expect(res.code).toBe(0)
      expect(res.out).toMatch(/skip +worktree:.*\n +blocked: /)
      expect(existsSync(fx.worktree)).toBe(true)
    })

    test('picking a keep row: it is skipped and shown with the reason', () => {
      const fx = buildFixture()
      const res = run(['clean', '--only', 'branch', '--pick', 'branch:main', '--dry-run'], fx.root)
      expect(res.code).toBe(0)
      expect(res.out).toMatch(/skip +branch:main\n +keep: /)
      expect(branchRefs(fx.root)).toContain('refs/heads/main')
    })

    test('--only remote without --remote: asking for remote branches implies the network', () => {
      const fx = buildFixture()
      const res = run(['--only', 'remote', '--provider', 'none', '--offline', '--all'], fx.root)
      expect(res.code).toBe(0)
      expect(res.out).toContain(`origin/${BRANCH}`)
      const plan = JSON.parse(
        run(['plan', '--only', 'remote', '--provider', 'none'], fx.root).out,
      ) as Plan
      expect(plan.options).toMatchObject({ only: ['remote'], remote: true })
      expect(plan.repos[0]!.fetched).toBe(true)
    })
  })
})

describe('branch mode', () => {
  test('an emitted command acts on a path with a space when pasted into sh', () => {
    const fx = buildFixture()
    const command = worktreeRemoveCommand(fx.root, fx.worktree)
    spawnRunner('sh').run(['-c', command], { cwd: tempDir() })
    expect(existsSync(fx.worktree)).toBe(false)
  })

  test('--branch from a directory holding two checkouts is refused', () => {
    const a = buildFixture()
    const b = buildFixture()
    const parent = tempDir()
    sh(parent, ['clone', '-q', a.bare, 'a'])
    sh(parent, ['clone', '-q', b.bare, 'b'])
    const res = run(['--branch', BRANCH], parent)
    expect(res.code).toBe(2)
    expect(res.err).toContain('one repository')
  })

  test('--branch on the default branch is refused', () => {
    const fx = buildFixture()
    const res = run(['--branch', 'main'], fx.root)
    expect(res.code).toBe(2)
    expect(res.err).toContain('default branch')
  })
})

/** `text` as a literal inside a regular expression. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

describe('a pull request listing that fails (#653)', () => {
  /**
   * Put a `gh` on PATH that is installed and signed in, but whose every
   * listing fails with `stderr`, for the duration of `fn`.
   */
  function withFailingGh<T>(stderr: string, fn: () => T): T {
    const bin = tempDir()
    const gh = join(bin, 'gh')
    writeFileSync(
      gh,
      `#!/bin/sh\ncase "$1" in --version|auth) exit 0;; esac\nprintf '%b' '${stderr}' >&2\nexit 1\n`,
    )
    chmodSync(gh, 0o755)
    const before = process.env['PATH']
    process.env['PATH'] = `${bin}:${before ?? ''}`
    try {
      return fn()
    } finally {
      process.env['PATH'] = before
    }
  }
  const GH = ['--remote', '--offline', '--provider', 'github', '--no-progress']
  // An escape sequence in the provider's output must not reach the terminal.
  const STDERR = '\\033[31mboom: no such repository\\n'

  test('every output names the failure, with terminal controls stripped', () => {
    const fx = buildFixture()
    withFailingGh(STDERR, () => {
      const commands = run([...GH, '--format', 'commands'], fx.root)
      expect(commands.code).toBe(0)
      expect(commands.err).toMatch(
        // The sweep names the repository by its real path (macOS: /var is /private/var).
        new RegExp(
          `^repo-cleaner: ${escapeRegExp(realpathSync(fx.root))}: Listing PRs with \`gh pr list\` failed \\(.*boom`,
          'm',
        ),
      )
      expect(commands.err).not.toContain('\x1b')

      const summary = run([...GH, '--format', 'summary'], fx.root)
      expect(summary.out).toContain('note: Listing PRs with `gh pr list` failed')

      const planFile = join(tempDir(), 'p.json')
      const plan = run(['plan', ...GH, '-o', planFile], fx.root)
      expect(plan.code).toBe(0)
      expect(plan.err).toContain('repo-cleaner plan: ')
      expect(plan.err).toContain('Listing PRs with `gh pr list` failed')

      // A saved plan's re-check sweeps again, and says what it judged without.
      const dry = run(['clean', '--plan', planFile, '--dry-run'], fx.root)
      expect(dry.code).toBe(0)
      expect(dry.err).toContain('repo-cleaner clean: ')
      expect(dry.err).toContain('Listing PRs with `gh pr list` failed')
      expect(dry.err).not.toContain('\x1b')
    })
  })

  test('a remote branch with no known PR is not deleted without confirm-open-pr', () => {
    const fx = buildFixture()
    withFailingGh(STDERR, () => {
      const res = run(['clean', ...GH, '--yes', '--format', 'json'], fx.root)
      expect(res.code).toBe(0)
      const out = JSON.parse(res.out) as { receipt: Receipt }
      expect(out.receipt.dropped).toContainEqual(
        expect.objectContaining({
          row: `remote:origin/${BRANCH}`,
          reason: 'not-allowed',
          detail: 'needs confirm-open-pr',
        }),
      )
      expect(sh(fx.root, ['ls-remote', '--heads', 'origin', BRANCH])).not.toBe('')
    })
  })
})
