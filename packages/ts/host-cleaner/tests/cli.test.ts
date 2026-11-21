/** The `host-cleaner` CLI driven in process: exit codes, refusals, and plan to receipt through fake plugins and the real git plugin. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

import { main, type MainDeps } from '../src/cli.ts'
import { hostDirs } from '../src/config.ts'
import type { Candidate, Objection, Plugin } from '../src/index.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

function tempDir(): string {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'host-cleaner-cli-')))
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

const sh = (cwd: string, args: string[]): void => {
  new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args)
}

/** A repository with a merged branch and an unmerged one. */
function repo(): string {
  const dir = tempDir()
  makeGitFixture({ dir, initialBranch: 'main' })
  sh(dir, ['commit', '--allow-empty', '-m', 'initial'])
  sh(dir, ['branch', 'merged-a'])
  sh(dir, ['checkout', '-q', '-b', 'topic'])
  sh(dir, ['commit', '--allow-empty', '-m', 'wip'])
  sh(dir, ['checkout', '-q', 'main'])
  return dir
}

function setup(): { home: string; cwd: string; env: Record<string, string> } {
  const home = tempDir()
  return {
    home,
    cwd: tempDir(),
    env: { ...(process.env as Record<string, string>), HOST_CLEANER_ROOT: home },
  }
}

function run(argv: string[], cwd: string, env: Record<string, string>, deps: MainDeps = {}) {
  const ctx = captureContext({ cwd, env })
  const code = main(argv, ctx, { confirm: () => null, ...deps })
  return { code, out: ctx.io.out, err: ctx.io.err }
}

/** A plugin that owns one candidate, `artifact:cache`, and records what it is asked to delete. */
function fake(
  name = 'fake',
  extra: { objections?: Objection[]; candidate?: Partial<Candidate> } = {},
): Plugin & { removed: string[] } {
  const removed: string[] = []
  return {
    name,
    detect: () => true,
    discover: () => [
      {
        id: `artifact:${name}`,
        kind: 'artifact',
        path: name,
        owner: name,
        why: 'idle for a week',
        evidence: { bytes: 10 },
        ...extra.candidate,
      },
    ],
    object: () => extra.objections ?? [],
    delete: (c) => {
      removed.push(c.id)
      return `removed ${c.path}`
    },
    removed,
  }
}

describe('phases', () => {
  test('the bare command explains the phases and exits 2; nothing runs', () => {
    const { env, cwd } = setup()
    const plugin = fake()
    const r = run([], cwd, env, { plugins: [plugin] })
    expect(r.code).toBe(2)
    expect(r.err).toContain('Nothing ran. Name a phase')
    expect(r.out).toBe('')
    expect(run(['--help'], cwd, env).code).toBe(0)
  })

  test('a word that is no phase is refused with exit 2', () => {
    const { env, cwd } = setup()
    const r = run([cwd], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('is not a phase')
  })
})

describe('status', () => {
  test('the real git plugin lists the merged branch as delete and the unmerged one as review', () => {
    const { env } = setup()
    const r = run(['status'], repo(), env)
    expect(r.code).toBe(0)
    expect(r.out).toContain('plugins: git')
    expect(r.out).toMatch(/delete\s+branch:.*:merged-a/)
    expect(r.out).toMatch(/review\s+branch:.*:topic/)
    expect(r.out).toContain('protest abandon-unmerged (git)')
  })

  test('json carries the candidates and objections', () => {
    const { env, cwd } = setup()
    const r = run(['status', '--format', 'json'], cwd, env, { plugins: [fake()] })
    const doc = JSON.parse(r.out)
    expect(doc.plugins).toEqual(['fake'])
    expect(doc.candidates.map((c: Candidate) => c.id)).toEqual(['artifact:fake'])
  })

  test('a refused candidate is hidden unless --all-rows', () => {
    const { env, cwd } = setup()
    const objections: Objection[] = [
      { by: 'fake', candidate: 'artifact:fake', level: 'refuse', code: 'busy', reason: 'in use' },
    ]
    const plugins = [fake('fake', { objections })]
    expect(run(['status'], cwd, env, { plugins }).out).not.toContain('artifact:fake')
    expect(run(['status', '--all-rows'], cwd, env, { plugins }).out).toContain(
      'refused artifact:fake',
    )
  })

  test('with nothing found it exits 10', () => {
    const { env, cwd } = setup()
    expect(
      run(['status'], cwd, env, { plugins: [{ name: 'empty', detect: () => true }] }).code,
    ).toBe(10)
  })

  test('--plugin, its alias --adapter, and --skip-plugin choose among plugins', () => {
    const { env, cwd } = setup()
    const plugins = [fake('a'), fake('b')]
    const ids = (argv: string[]) =>
      JSON.parse(run(['status', ...argv, '--format', 'json'], cwd, env, { plugins }).out).plugins
    expect(ids(['--plugin', 'a'])).toEqual(['a'])
    expect(ids(['--adapter', 'b'])).toEqual(['b'])
    expect(ids(['--skip-plugin', 'a'])).toEqual(['b'])
  })

  test('--worktrees and --branches narrow the git candidates, as in repo-cleaner', () => {
    const { env } = setup()
    const dir = repo()
    const ids = (argv: string[]) =>
      JSON.parse(run(['status', ...argv, '--format', 'json'], dir, env).out).candidates.map(
        (c: Candidate) => c.kind,
      )
    expect(new Set(ids([]))).toEqual(new Set(['branch']))
    expect(ids(['--worktrees'])).toEqual([])
    expect(new Set(ids(['--branches']))).toEqual(new Set(['branch']))
  })

  test('targets come from the config file when none is named', () => {
    const { env, home } = setup()
    const config = join(home, 'c.json')
    writeFileSync(config, JSON.stringify({ targets: [repo()] }))
    const r = run(['status', '--config', config], tempDir(), env)
    expect(r.out).toContain('merged-a')
  })

  test('a bad config and an unknown plugin are refused with exit 2', () => {
    const { env, home, cwd } = setup()
    const config = join(home, 'c.json')
    writeFileSync(config, '{"targets": 3}')
    expect(run(['status', '--config', config], cwd, env).code).toBe(2)
    expect(run(['status', '--plugin', 'nope'], cwd, env).code).toBe(2)
    expect(run(['status', '--skip-plugin', 'nope'], cwd, env).code).toBe(2)
    writeFileSync(config, JSON.stringify({ plugins: { ghost: {} } }))
    const r = run(['status', '--config', config], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('ghost')
  })
})

describe('plan and clean', () => {
  test('plan writes one file, and clean --plan runs it into a receipt and a log line', () => {
    const { env, home, cwd } = setup()
    const plugin = fake()
    const planFile = join(home, 'plan.json')
    expect(run(['plan', '-o', planFile], cwd, env, { plugins: [plugin] }).code).toBe(0)
    expect(JSON.parse(readFileSync(planFile, 'utf8')).candidates).toHaveLength(1)
    const r = run(['clean', '--plan', planFile, '--yes'], cwd, env, { plugins: [plugin] })
    expect(r.code).toBe(0)
    expect(plugin.removed).toEqual(['artifact:fake'])
    expect(r.out).toContain('removed fake')
    const dirs = hostDirs(env)
    const receipts = readdirSync(join(dirs.state, 'receipts'))
    expect(receipts).toHaveLength(1)
    expect(
      JSON.parse(readFileSync(join(dirs.state, 'receipts', receipts[0]!), 'utf8')),
    ).toMatchObject({
      status: 'complete',
      plan: planFile,
    })
    expect(readFileSync(join(dirs.logs, 'host-cleaner.log'), 'utf8')).toContain('"complete"')
  })

  test('clean --plan checks the targets the plan was made over, whatever the directory', () => {
    const { env } = setup()
    const dir = repo()
    const elsewhere = tempDir()
    const planFile = join(tempDir(), 'plan.json')
    expect(run(['plan', dir, '-o', planFile], elsewhere, env).code).toBe(0)
    expect(JSON.parse(readFileSync(planFile, 'utf8')).targets).toEqual([dir])
    const r = run(['clean', '--plan', planFile, '--yes'], elsewhere, env)
    expect(r.code).toBe(0)
    expect(new Git(dir).rawChecked(['branch', '--format=%(refname:short)']).stdout).not.toContain(
      'merged-a',
    )
  })

  test('a plugins.git entry is refused until the git plugin reads settings', () => {
    const { env, cwd, home } = setup()
    const config = join(home, 'config.json')
    writeFileSync(config, JSON.stringify({ plugins: { git: { offline: true } } }))
    const r = run(['status', '--config', config], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('plugins.git')
  })

  test('clean with the real git plugin deletes the merged branch and spares the unmerged one', () => {
    const { env } = setup()
    const dir = repo()
    const r = run(['clean', '--yes'], dir, env)
    expect(r.code).toBe(0)
    const branches = new Git(dir).rawChecked(['branch', '--format=%(refname:short)']).stdout
    expect(branches).not.toContain('merged-a')
    expect(branches).toContain('topic')
    expect(r.out).not.toContain(':topic')
  })

  test('a protest is skipped until its code is allowed by name', () => {
    const { env, cwd } = setup()
    const objections: Objection[] = [
      {
        by: 'fake',
        candidate: 'artifact:fake',
        level: 'protest',
        code: 'lossy',
        reason: 'loses data',
      },
    ]
    const plugin = fake('fake', { objections })
    const skipped = run(['clean', '--yes'], cwd, env, { plugins: [plugin] })
    expect(plugin.removed).toEqual([])
    expect(skipped.out).toContain('would delete: 0')
    const done = run(['clean', '--yes', '--allow', 'lossy'], cwd, env, { plugins: [plugin] })
    expect(done.code).toBe(0)
    expect(plugin.removed).toEqual(['artifact:fake'])
  })

  test('--dry-run shows the steps and deletes nothing', () => {
    const { env, cwd } = setup()
    const plugin = fake()
    const r = run(['clean', '--dry-run'], cwd, env, { plugins: [plugin] })
    expect(r.code).toBe(0)
    expect(r.out).toContain('delete  artifact:fake')
    expect(plugin.removed).toEqual([])
    expect(existsSync(join(hostDirs(env).state, 'receipts'))).toBe(false)
  })

  test('without --yes it asks; no terminal refuses with 2, a no deletes nothing', () => {
    const { env, cwd } = setup()
    const plugin = fake()
    expect(run(['clean'], cwd, env, { plugins: [plugin] }).code).toBe(2)
    const no = run(['clean'], cwd, env, { plugins: [plugin], confirm: () => false })
    expect(no.code).toBe(0)
    expect(no.err).toContain('nothing deleted')
    expect(plugin.removed).toEqual([])
    const yes = run(['clean'], cwd, env, { plugins: [plugin], confirm: () => true })
    expect(yes.code).toBe(0)
    expect(plugin.removed).toEqual(['artifact:fake'])
  })

  test('a failed delete exits 11 and the receipt says which', () => {
    const { env, cwd } = setup()
    const broken: Plugin = {
      ...fake(),
      delete: () => {
        throw new Error('disk on fire')
      },
    }
    const r = run(['clean', '--yes', '--format', 'json'], cwd, env, { plugins: [broken] })
    expect(r.code).toBe(11)
    expect(JSON.parse(r.out).receipt.steps[0]).toMatchObject({
      result: 'failed',
      error: 'disk on fire',
    })
  })

  test('--plan - reads stdin, and needs --yes or --dry-run', () => {
    const { env, cwd } = setup()
    const plugin = fake()
    const planned = run(['plan'], cwd, env, { plugins: [plugin] }).out
    expect(run(['clean', '--plan', '-'], cwd, env, { plugins: [plugin] }).code).toBe(2)
    const r = run(['clean', '--plan', '-', '--yes'], cwd, env, {
      plugins: [plugin],
      readStdin: () => planned,
    })
    expect(r.code).toBe(0)
    expect(plugin.removed).toEqual(['artifact:fake'])
  })

  test('options that contradict each other are refused', () => {
    const { env, cwd, home } = setup()
    const f = join(home, 'p.json')
    expect(run(['clean', '--yes', '--dry-run'], cwd, env).code).toBe(2)
    expect(run(['clean', '--dry-run', '--receipt', f], cwd, env).code).toBe(2)
    expect(run(['clean', '--plan', f, '--pick', 'x'], cwd, env).code).toBe(2)
    expect(run(['clean', '--plan', f, '--spare', 'x'], cwd, env).code).toBe(2)
    expect(run(['clean', '--plan', f, '--worktrees'], cwd, env).code).toBe(2)
    expect(run(['clean', '-i', '--pick', 'x'], cwd, env).code).toBe(2)
    expect(run(['clean', '-i', '--plan', '-'], cwd, env).code).toBe(2)
    const both = run(['clean', '--pick', 'a:x', '--spare', 'a:x', '--dry-run'], cwd, env, {
      plugins: [fake()],
    })
    expect(both.code).toBe(2)
    expect(both.err).toContain('a:x is both picked and spared')
  })

  test('--pick adds a candidate held for review to the default; --spare takes one away', () => {
    const { env, cwd } = setup()
    const held = fake('held', { candidate: { unattended: false } })
    const plain = fake('plain')
    const plugins = [held, plain]
    const ran = (argv: string[]) =>
      JSON.parse(
        run(['clean', '--dry-run', '--format', 'json', ...argv], cwd, env, { plugins }).out,
      ).run
    expect(ran([])).toEqual(['artifact:plain'])
    expect(ran(['--pick', 'artifact:held'])).toEqual(['artifact:plain', 'artifact:held'])
    expect(ran(['--spare', 'artifact:plain'])).toEqual([])
    expect(ran(['--spare', 'artifact:*', '--pick', 'artifact:held'])).toEqual([])
  })

  test('-i runs exactly the ticked candidates and asks for their protests by code', () => {
    const { env, cwd } = setup()
    const objections: Objection[] = [
      { by: 'b', candidate: 'artifact:b', level: 'protest', code: 'lossy', reason: 'loses data' },
    ]
    const a = fake('a')
    const b = fake('b', { objections })
    const shown: string[] = []
    const asked: string[] = []
    const r = run(['clean', '-i', '--yes'], cwd, env, {
      plugins: [a, b],
      checklist: (_q, items) => {
        shown.push(...items.map((i) => `${i.label} ${i.checked ? '[x]' : '[ ]'}`))
        return [1]
      },
      confirm: (q) => {
        asked.push(q)
        return true
      },
    })
    expect(r.code).toBe(0)
    expect(shown).toEqual([
      'artifact:a  delete: idle for a week [x]',
      'artifact:b  review: idle for a week [ ]',
    ])
    expect(asked).toEqual(['artifact:b carries lossy (loses data): allow it?'])
    expect(a.removed).toEqual([])
    expect(b.removed).toEqual(['artifact:b'])
  })

  test('-i with no terminal is refused with exit 2', () => {
    const { env, cwd } = setup()
    expect(run(['clean', '-i'], cwd, env, { plugins: [fake()] }).code).toBe(2)
  })

  test('a plan that moved since is dropped as changed', () => {
    const { env, cwd, home } = setup()
    let bytes = 10
    const plugin: Plugin = {
      ...fake(),
      discover: () => [
        { ...fake().discover!({ cwd, targets: [], allow: [] })[0]!, evidence: { bytes } },
      ],
    }
    const planFile = join(home, 'plan.json')
    run(['plan', '-o', planFile], cwd, env, { plugins: [plugin] })
    bytes = 99
    const r = run(['clean', '--plan', planFile, '--yes'], cwd, env, { plugins: [plugin] })
    expect(r.out).toContain('skip    artifact:fake')
    expect(r.out).toContain('changed')
  })

  test('--help and a missing plan file', () => {
    const { env, cwd } = setup()
    expect(run(['clean', '--help'], cwd, env).code).toBe(0)
    expect(run(['clean', '--plan', join(cwd, 'nope.json'), '--yes'], cwd, env).code).toBe(1)
  })
})
