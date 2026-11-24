/**
 * Descriptor to plugin: every tier 1 example and first-set draft against the
 * contract suite, then each rule of the engine on a fixture home: folders per
 * OS, globs, prunes and wipes (D12), commands pointed at the checked folder
 * (D13), inUse, project, supersededBy, system and the path checks. Last, tier
 * 2: folders from variables, found where they were moved, and the config's
 * trusted values.
 */

import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, test } from 'vitest'

import type { CommandRunner } from '@osdlc/command-seam'
import type { ProcessHolder, ProcessProbe } from '@osdlc/repo-cleaner'
import { fakeNeverExited } from '@osdlc/command-seam/testing'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { CORPUS_DIR, FIRST_SET, draftStore } from '../scripts/draft-descriptor.ts'
import {
  IN_USE,
  NO_PRUNE_TOOL,
  OUTSIDE_ROOTS,
  PERSONAL_FOLDERS,
  clean,
  descriptorPlugin,
  globMatches,
  parseDescriptor,
  pathProblem,
  plan,
  pluginKit,
  skipReason,
  survey,
  type Descriptor,
  type DescriptorOptions,
  type Os,
  type PathCandidate,
  type Plugin,
  type RunCtx,
} from '../src/index.ts'
import { effectiveSettings, settingsIssues, settingsOf } from '../src/settings.ts'
import { contractSuite, fakeContext, fakeRunner, tempHome } from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

/** The kit's process table, as its `probe` and `ps` options. */
interface Processes {
  probe: ProcessProbe
  ps: CommandRunner
}

/**
 * A process table: `cwd` maps a folder to the processes working in it, for
 * the probe; `/` lists every process, read by `ps` with `command` as its
 * command line. Both read `table` when asked, so it may change.
 */
const processes = (table: Record<string, ProcessHolder[]> = {}): Processes => ({
  probe: { alive: () => false, holders: (path) => table[path] ?? [] },
  ps: {
    run: () => ({
      exitCode: 0,
      stdout: [{ pid: 1, command: '/sbin/init' }, ...(table['/'] ?? [])]
        .map((h) => `${h.pid} ${h.command}\n`)
        .join(''),
      stderr: '',
    }),
  },
})

const OS: Os = 'linux'

interface Built {
  home: string
  plugin: Plugin
  d: Descriptor
  calls: ReturnType<typeof fakeRunner>['calls']
  /** The folder of `paths.<key>` on {@link OS}. */
  folder(key: string): string
}

/**
 * The plugin for `text` over a new fixture home, with each of its folders made
 * and a file in it, and two matches of each glob. `programs` are on PATH.
 */
function build(
  name: string,
  text: string,
  o: {
    programs?: Parameters<typeof fakeRunner>[0]
    idleHours?: number
    processes?: Processes
    fill?: boolean
    opts?: DescriptorOptions
  } = {},
): Built {
  const h = tempHome()
  cleanups.push(h.cleanup)
  const d = parseDescriptor(text, `${name}.yaml`)
  const folder = (key: string): string => {
    const p = d.paths[key]!
    const f = (p.all ?? p[OS])!
    return f.startsWith('~/') ? join(h.home, f.slice(2)) : f
  }
  if (o.fill !== false) {
    for (const key of Object.keys(d.paths)) {
      const p = d.paths[key]!
      if ((p.all ?? p[OS]) === undefined) continue
      mkdirSync(folder(key), { recursive: true })
      writeFileSync(join(folder(key), 'blob'), 'x')
    }
    for (const c of d.candidates) {
      if (c.glob === undefined || (d.paths[c.path]!.all ?? d.paths[c.path]![OS]) === undefined) {
        continue
      }
      for (const n of ['a', 'b']) {
        const rel = c.glob.replace(/\/$/, '').replaceAll('*', n).replaceAll('?', n)
        mkdirSync(join(folder(c.path), rel), { recursive: true })
        writeFileSync(join(folder(c.path), rel, 'blob'), n)
      }
    }
  }
  const fake = fakeRunner(o.programs ?? {})
  const kit = pluginKit(name, { env: h.env, ...(o.processes ?? processes()), ...fake })
  const plugin = descriptorPlugin(name, d, { os: OS, ownDirs: [], ...o.opts }).create({
    settings: { idleHours: o.idleHours ?? 0 },
    only: [],
    env: h.env,
    kit,
  })
  return { home: h.home, plugin, d, calls: fake.calls, folder }
}

const ctxOf = (over: Partial<RunCtx> = {}): RunCtx => ({
  cwd: '/',
  targets: [],
  allow: [],
  ...over,
})

/** Surveys `plugin`, plans it with `allow`, and cleans the plan. */
async function surveyAndClean(plugin: Plugin, allow: string[] = [], over: Partial<RunCtx> = {}) {
  const ctx = ctxOf({ allow, ...over })
  const s = await survey([plugin], ctx)
  const p = plan(s, { allow, targets: ctx.targets })
  return { survey: s, receipt: await clean(p, [plugin], ctx) }
}

/** Sets every modification time under `dir` to `hours` ago. */
function age(dir: string, hours: number): void {
  const at = new Date(Date.now() - hours * 3_600_000)
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    try {
      age(p, hours)
    } catch {
      // a file
    }
    utimesSync(p, at, at)
  }
}

// The system description's tier 1 examples (as in descriptor-schema.test.ts).

const UV = `descriptor: 1
store: uv
detect:
  any: [{ onPath: uv }, { exists: cache }]
paths:
  cache: { all: ~/.cache/uv }
candidates:
  - path: cache
    costDescription: re-download
    command: [uv, cache, prune, --cache-dir, '{path}']
    removes: unused
inUse:
  processes: [uv]
`

const HUGGING_FACE = `descriptor: 1
store: huggingface-hub
paths:
  hub: { all: ~/.cache/huggingface/hub }
candidates:
  - path: hub
    glob: 'models--*/'
    costDescription: re-download
    idleHours: 720
`

const PIP_PER_OS = `descriptor: 1
paths:
  cache: { macos: ~/Library/Caches/pip, linux: ~/.cache/pip }
candidates:
  - { path: cache, costDescription: re-download }
`

const PNPM_TIER_1 = `descriptor: 1
paths: { store: { macos: ~/Library/pnpm/store, linux: ~/.local/share/pnpm/store } }
candidates:
  - { path: store, costDescription: re-download }
`

const DOTNET_PROJECT = `descriptor: 1
paths:
  nuget: { all: ~/.nuget/packages }
candidates:
  - { path: nuget, costDescription: re-download }
project:
  - { dir: bin, marker: '*.csproj', costDescription: rebuild }
  - { dir: obj, marker: '*.csproj', costDescription: rebuild }
`

/** pnpm's store with its prune, on the default Linux folder. */
const PNPM_PRUNE = `descriptor: 1
paths:
  store: { all: ~/.local/share/pnpm/store }
candidates:
  - path: store
    costDescription: re-download
    command: [pnpm, store, prune, --store-dir, '{path}']
    removes: unused
inUse:
  processes: [pnpm]
`

/** A checkout made a target, with a `*.csproj` project and its `bin` and `obj` folders. */
function dotnetCheckout(home: string): string {
  const repo = join(home, 'dev', 'app')
  mkdirSync(repo, { recursive: true })
  makeGitFixture({ dir: repo, initialBranch: 'main' })
  writeFileSync(join(repo, 'App.csproj'), '<Project/>')
  for (const dir of ['bin', 'obj']) {
    mkdirSync(join(repo, dir))
    writeFileSync(join(repo, dir, 'App.dll'), 'x')
  }
  return repo
}

describe('the contract suite', () => {
  const examples = { UV, HUGGING_FACE, PIP_PER_OS, PNPM_TIER_1, DOTNET_PROJECT, PNPM_PRUNE }

  test.each(Object.entries(examples))('%s passes, with no tool on PATH', async (name, text) => {
    const b = build(name.toLowerCase(), text)
    const targets = name === 'DOTNET_PROJECT' ? [dotnetCheckout(b.home)] : []
    expect(await contractSuite(b.plugin, { targets })).toEqual([])
  })

  test.each([
    ['uv', UV],
    ['pnpm', PNPM_PRUNE],
  ])(
    '%s passes with its prune tool on PATH, which delete never runs on a moved folder',
    async (name, text) => {
      const b = build(name, text, { programs: { [name]: () => ({}) } })
      expect(await contractSuite(b.plugin)).toEqual([])
      expect(b.calls).toEqual([])
    },
  )

  test.each(FIRST_SET)('the %s draft passes', async (slug) => {
    const b = build(slug, draftStore(CORPUS_DIR, slug).text)
    expect(await contractSuite(b.plugin)).toEqual([])
  })
})

describe('pnpm missing from PATH (D12)', () => {
  test('the store is listed with a no-prune-tool protest', async () => {
    const b = build('pnpm', PNPM_PRUNE)
    const s = await survey([b.plugin], ctxOf())
    const store = b.folder('store')
    expect(s.candidates.map((c) => c.id)).toEqual([`pnpm:${store}`])
    expect(s.objections).toEqual([
      {
        by: 'pnpm',
        candidate: `pnpm:${store}`,
        level: 'protest',
        code: NO_PRUNE_TOOL,
        reason: `pnpm is not on PATH to prune it; --allow ${NO_PRUNE_TOOL} removes the whole folder instead`,
      },
    ])
  })

  test('it is untouched unless allowed, even when picked', async () => {
    const b = build('pnpm', PNPM_PRUNE)
    const id = `pnpm:${b.folder('store')}`
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps).toEqual([])
    const ctx = ctxOf()
    const picked = await clean(plan(await survey([b.plugin], ctx), { pick: [id] }), [b.plugin], ctx)
    expect(picked.steps).toEqual([])
    expect(picked.dropped).toEqual([
      { id, reason: 'not-allowed', detail: `needs --allow ${NO_PRUNE_TOOL}` },
    ])
    expect(existsSync(join(b.folder('store'), 'blob'))).toBe(true)
  })

  test('--allow no-prune-tool removes the folder, once it is idle', async () => {
    const busy = build('pnpm', PNPM_PRUNE, { idleHours: 24 })
    const held = await surveyAndClean(busy.plugin, [NO_PRUNE_TOOL])
    expect(held.survey.candidates[0]).toMatchObject({ held: true })
    expect(held.receipt.steps).toEqual([])
    expect(existsSync(busy.folder('store'))).toBe(true)

    const idle = build('pnpm', PNPM_PRUNE, { idleHours: 24 })
    age(idle.folder('store'), 48)
    const { receipt } = await surveyAndClean(idle.plugin, [NO_PRUNE_TOOL])
    expect(receipt.steps).toMatchObject([
      { result: 'ok', delete: expect.stringMatching(/^removed /) },
    ])
    expect(existsSync(idle.folder('store'))).toBe(false)
    expect(idle.calls).toEqual([])
  })
})

describe('a command (D13)', () => {
  test('a prune with its tool on PATH runs from home on the checked folder, with no idle check', async () => {
    const b = build('pnpm', PNPM_PRUNE, {
      idleHours: 1000,
      programs: {
        pnpm: (argv) => {
          rmSync(join(argv[3]!, 'blob'))
          return {}
        },
      },
    })
    const store = b.folder('store')
    const { survey: s, receipt } = await surveyAndClean(b.plugin)
    expect(s.candidates[0]!.held).toBeUndefined()
    expect(s.objections).toEqual([])
    expect(b.calls.map((c) => [c.argv, c.opts.cwd])).toEqual([
      [['pnpm', 'store', 'prune', '--store-dir', store], b.home],
    ])
    expect(receipt.steps).toMatchObject([
      {
        result: 'ok',
        delete: expect.stringMatching(
          new RegExp(
            `^ran pnpm store prune --store-dir ${store}; \\d+ bytes before, \\d+ bytes after$`,
          ),
        ),
      },
    ])
    expect(existsSync(store)).toBe(true)
  })

  test('{path} in env is filled in too', async () => {
    const GO = `descriptor: 1
paths:
  modcache: { all: ~/go/pkg/mod }
candidates:
  - path: modcache
    costDescription: re-download
    command: [go, clean, -modcache]
    env: { GOMODCACHE: '{path}' }
    removes: all
`
    const b = build('go', GO, { programs: { go: () => ({}) } })
    await surveyAndClean(b.plugin)
    expect(b.calls.map((c) => [c.argv, c.opts.env?.GOMODCACHE])).toEqual([
      [['go', 'clean', '-modcache'], b.folder('modcache')],
    ])
  })

  test('a wipe keeps the idle check, and without its tool removes the folder', async () => {
    const WIPE = `descriptor: 1
paths:
  cache: { all: ~/.cache/tool }
candidates:
  - path: cache
    costDescription: rebuild
    command: [tool, wipe, '{path}']
    removes: all
`
    const fresh = build('tool', WIPE, { idleHours: 24, programs: { tool: () => ({}) } })
    const held = await surveyAndClean(fresh.plugin)
    expect(held.survey.candidates[0]).toMatchObject({ held: true })
    expect(fresh.calls).toEqual([])

    const gone = build('tool', WIPE)
    const { survey: s, receipt } = await surveyAndClean(gone.plugin)
    expect(s.objections).toEqual([])
    expect(receipt.steps).toMatchObject([
      { result: 'ok', delete: expect.stringMatching(/^removed /) },
    ])
    expect(existsSync(gone.folder('cache'))).toBe(false)
  })

  test('a command that fails fails the step and says why', async () => {
    const b = build('uv', UV, { programs: { uv: () => ({ exitCode: 2, stderr: 'locked\n' }) } })
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps).toMatchObject([
      {
        result: 'failed',
        error: `uv cache prune --cache-dir ${b.folder('cache')} failed (exit 2): locked`,
      },
    ])
  })

  test('the tool showing up after the plan drops the candidate as changed', async () => {
    let onPath = false
    const h = tempHome()
    cleanups.push(h.cleanup)
    const d = parseDescriptor(PNPM_PRUNE, 'pnpm.yaml')
    mkdirSync(join(h.home, '.local/share/pnpm/store'), { recursive: true })
    const kit = pluginKit('pnpm', {
      env: h.env,
      ...processes(),
      which: (p) => (onPath && p === 'pnpm' ? '/bin/pnpm' : undefined),
    })
    const plugin = descriptorPlugin('pnpm', d, { os: OS, ownDirs: [] }).create({
      settings: { idleHours: 0 },
      only: [],
      env: h.env,
      kit,
    })
    const ctx = ctxOf({ allow: [NO_PRUNE_TOOL] })
    const p = plan(await survey([plugin], ctx), { allow: [NO_PRUNE_TOOL] })
    onPath = true
    const receipt = await clean(p, [plugin], ctx)
    expect(receipt.dropped).toMatchObject([{ reason: 'changed' }])
    expect(existsSync(join(h.home, '.local/share/pnpm/store'))).toBe(true)
  })
})

describe('the plugin refuses an outside folder itself', () => {
  test('delete throws for a candidate moved out behind a symlink, and runs no command', async () => {
    const b = build('uv', UV, { programs: { uv: () => ({}) } })
    const s = await survey([b.plugin], ctxOf())
    const c = s.candidates[0]!
    const outside = tempHome()
    cleanups.push(outside.cleanup)
    const moved = join(outside.home, 'uv')
    renameSync(c.path!, moved)
    symlinkSync(moved, c.path!)
    await expect(b.plugin.delete!(c, fakeContext())).rejects.toThrow(/is now a symlink/)
    expect(b.calls).toEqual([])
    expect(existsSync(join(moved, 'blob'))).toBe(true)
  })

  test('delete throws for a path no entry gives, even inside its roots', async () => {
    const b = build('uv', UV)
    const s = await survey([b.plugin], ctxOf())
    const other = join(b.folder('cache'), 'other')
    mkdirSync(other)
    const c = { ...(s.candidates[0] as PathCandidate), id: `uv:${other}`, path: other }
    await expect(b.plugin.delete!(c, fakeContext())).rejects.toThrow(
      `${other} was not deleted: it is no longer ${b.folder('cache')}`,
    )
    expect(existsSync(other)).toBe(true)
  })

  test('delete throws for a sibling of the folder, which no root holds', async () => {
    const b = build('uv', UV)
    const s = await survey([b.plugin], ctxOf())
    const other = join(b.home, '.cache', 'other')
    mkdirSync(other)
    const c = { ...(s.candidates[0] as PathCandidate), id: `uv:${other}`, path: other }
    await expect(b.plugin.delete!(c, fakeContext())).rejects.toThrow(
      `${other} was not deleted: it is not inside uv's roots`,
    )
    expect(existsSync(other)).toBe(true)
  })
})

describe('path checks', () => {
  const one = (folder: string) => `descriptor: 1
paths:
  data: { all: '${folder}' }
candidates:
  - { path: data, costDescription: re-download }
`

  /**
   * The plugin's own outside-roots refusal of `folder`, its roots and self
   * roots, and the core's warnings about its roots (none while the engine
   * refuses first).
   */
  async function refusal(folder: string, over: Partial<RunCtx> = {}, opts: DescriptorOptions = {}) {
    const b = build('x', one(folder), { fill: false, opts })
    const path = folder.startsWith('~/') ? join(b.home, folder.slice(2)) : folder
    mkdirSync(path, { recursive: true })
    const s = await survey([b.plugin], ctxOf(over))
    return {
      b,
      path,
      reasons: s.objections
        .filter((o) => o.by === 'x' && o.code === OUTSIDE_ROOTS)
        .map((o) => o.reason),
      roots: s.roots.x,
      selfRoots: s.selfRoots.x,
      rootWarnings: s.warnings.filter((w) => w.startsWith('x: roots:')),
      candidates: s.candidates,
    }
  }

  /** A refused folder: one reason from the engine, no root, and nothing for the core to leave out. */
  function refused(r: Awaited<ReturnType<typeof refusal>>, why: string): void {
    expect(r.reasons).toEqual([`${r.path}: ${why}`])
    expect(r.roots).toEqual([])
    expect(r.selfRoots).toEqual([])
    expect(r.rootWarnings).toEqual([])
    expect(r.candidates[0]).toMatchObject({ held: true })
    expect(r.candidates[0]!.bytes).toBeUndefined()
  }

  test('the root is the folder itself, as a self root', async () => {
    const r = await refusal('~/.npm')
    expect(r.reasons).toEqual([])
    expect(r.roots).toEqual([r.path])
    expect(r.selfRoots).toEqual([r.path])
    expect(r.rootWarnings).toEqual([])
    expect(r.candidates.map((c) => c.path)).toEqual([r.path])
  })

  test('the whole folder is removed through its self root', async () => {
    const b = build('x', one('~/.npm'))
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps).toMatchObject([
      { result: 'ok', delete: expect.stringMatching(/^removed /) },
    ])
    expect(existsSync(b.folder('data'))).toBe(false)
  })

  test.each(PERSONAL_FOLDERS)('~/%s is refused as a personal folder', async (name) => {
    refused(await refusal(`~/${name}`), `it is the personal folder ~/${name}`)
  })

  // macOS's default filesystem ignores case, so ~/documents is ~/Documents.
  const caseBlind = (() => {
    const h = tempHome()
    try {
      mkdirSync(join(h.home, 'Probe'))
      return existsSync(join(h.home, 'probe'))
    } finally {
      h.cleanup()
    }
  })()

  test.runIf(caseBlind)(
    'on a filesystem that ignores case, a personal folder, the home folder and a target are refused in any case',
    async () => {
      const b = build('x', one('~/documents'), { fill: false })
      mkdirSync(join(b.home, 'Documents'))
      mkdirSync(join(b.home, 'dev'))
      const at = { home: b.home, targets: [join(b.home, 'dev')], checkouts: [], ownDirs: [] }
      expect(pathProblem(join(b.home, 'documents'), at)).toBe(
        'it is the personal folder ~/Documents',
      )
      expect(pathProblem(join(b.home, 'DEV'), at)).toBe('it is a target')
      expect(pathProblem(b.home.toUpperCase(), at)).toBe('it is the home folder')
      const s = await survey([b.plugin], ctxOf())
      expect(s.objections.filter((o) => o.by === 'x').map((o) => o.reason)).toEqual([
        `${join(b.home, 'documents')}: it is the personal folder ~/Documents`,
      ])
      expect(s.roots.x).toEqual([])
    },
  )

  test('a folder inside a personal folder is not', async () => {
    const r = await refusal('~/Library/Caches/pip')
    expect(r.reasons).toEqual([])
    expect(r.roots).toEqual([r.path])
    expect(r.selfRoots).toEqual([r.path])
  })

  test('the filesystem root', async () => {
    refused(await refusal('/'), 'it is the filesystem root')
  })

  test('the home folder itself', async () => {
    const r = await refusal('~/')
    expect(r.path).toBe(r.b.home)
    refused(r, 'it is the home folder')
  })

  test('a folder holding home', async () => {
    const above = realpathSync.native(tmpdir())
    const b = build('x', one(above), { fill: false })
    expect(dirname(b.home)).toBe(above)
    const s = await survey([b.plugin], ctxOf())
    expect(s.objections.filter((o) => o.by === 'x').map((o) => o.reason)).toEqual([
      `${above}: it holds the home folder`,
    ])
    expect(s.roots.x).toEqual([])
    expect(s.warnings.filter((w) => w.startsWith('x: roots:'))).toEqual([])
  })

  test('a folder outside home', async () => {
    const elsewhere = tempHome()
    cleanups.push(elsewhere.cleanup)
    refused(await refusal(join(elsewhere.home, 'cache')), 'it is not inside the home folder')
  })

  test('a symlink', async () => {
    const b = build('x', one('~/.npm'), { fill: false })
    const real = join(b.home, 'npm-real')
    mkdirSync(real)
    symlinkSync(real, join(b.home, '.npm'))
    const s = await survey([b.plugin], ctxOf())
    expect(s.objections.filter((o) => o.by === 'x').map((o) => o.reason)).toEqual([
      `${join(b.home, '.npm')}: it is a symlink`,
    ])
    expect(s.roots.x).toEqual([])
    expect(s.warnings.filter((w) => w.startsWith('x: roots:'))).toEqual([])
  })

  test('a target', async () => {
    const b = build('x', one('~/work'), { fill: false })
    const work = join(b.home, 'work')
    mkdirSync(work)
    const s = await survey([b.plugin], ctxOf({ targets: [work] }))
    expect(s.objections.filter((o) => o.by === 'x').map((o) => o.reason)).toEqual([
      `${work}: it is a target`,
    ])
    expect(s.roots.x).toEqual([])
    expect(s.warnings.filter((w) => w.startsWith('x: roots:'))).toEqual([])
  })

  test('a folder holding a target', async () => {
    const b = build('x', one('~/work'), { fill: false })
    const inner = join(b.home, 'work', 'repo')
    mkdirSync(inner, { recursive: true })
    const s = await survey([b.plugin], ctxOf({ targets: [inner] }))
    expect(s.objections.filter((o) => o.by === 'x').map((o) => o.reason)).toEqual([
      `${join(b.home, 'work')}: it holds the target ${inner}`,
    ])
    expect(s.roots.x).toEqual([])
    expect(s.warnings.filter((w) => w.startsWith('x: roots:'))).toEqual([])
  })

  test('a checkout', async () => {
    const b = build('x', one('~/src'), { fill: false })
    mkdirSync(join(b.home, 'src'))
    makeGitFixture({ dir: join(b.home, 'src'), initialBranch: 'main' })
    const s = await survey([b.plugin], ctxOf())
    expect(s.objections.filter((o) => o.by === 'x').map((o) => o.reason)).toEqual([
      `${join(b.home, 'src')}: it is a checkout`,
    ])
    expect(s.roots.x).toEqual([])
    expect(s.warnings.filter((w) => w.startsWith('x: roots:'))).toEqual([])
  })

  test("a folder holding a checkout of the targets' repositories", async () => {
    const b = build('x', one('~/trees'), { fill: false })
    const repo = dotnetCheckout(b.home)
    const tree = join(b.home, 'trees', 'app-b')
    mkdirSync(dirname(tree))
    execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'b', tree])
    const s = await survey([b.plugin], ctxOf({ targets: [repo] }))
    expect(s.objections.filter((o) => o.by === 'x').map((o) => o.reason)).toEqual([
      `${join(b.home, 'trees')}: it holds the checkout ${tree}`,
    ])
    expect(s.roots.x).toEqual([])
    expect(s.warnings.filter((w) => w.startsWith('x: roots:'))).toEqual([])
  })

  test("a folder holding host-cleaner's own", async () => {
    const b = build('x', one('~/.local/state'), { fill: false })
    const state = join(b.home, '.local', 'state')
    mkdirSync(join(state, 'host-cleaner'), { recursive: true })
    const plugin = descriptorPlugin('x', b.d, {
      os: OS,
      ownDirs: [join(state, 'host-cleaner')],
    }).create({
      settings: { idleHours: 0 },
      only: [],
      env: { HOME: b.home },
      kit: pluginKit('x', { env: { HOME: b.home }, ...processes() }),
    })
    const s = await survey([plugin], ctxOf())
    expect(s.objections.filter((o) => o.by === 'x').map((o) => o.reason)).toEqual([
      `${state}: it holds host-cleaner's own folder ${join(state, 'host-cleaner')}`,
    ])
  })
})

describe('paths per OS, detect, system and supersededBy', () => {
  test("only the OS's own folder is used; a path with no entry for it does not apply", async () => {
    const PER_OS = `descriptor: 1
paths:
  cache: { macos: ~/Library/Caches/pip, linux: ~/.cache/pip }
  mac: { macos: ~/Library/Caches/only-mac }
candidates:
  - { path: cache, costDescription: re-download }
  - { path: mac, costDescription: re-download }
`
    const h = tempHome()
    cleanups.push(h.cleanup)
    for (const dir of ['Library/Caches/pip', '.cache/pip', 'Library/Caches/only-mac']) {
      mkdirSync(join(h.home, dir), { recursive: true })
    }
    const ids = async (os: Os) => {
      const plugin = descriptorPlugin('pip', parseDescriptor(PER_OS, 'pip.yaml'), {
        os,
        ownDirs: [],
      }).create({
        settings: { idleHours: 0 },
        only: [],
        env: h.env,
        kit: pluginKit('pip', { env: h.env, ...processes() }),
      })
      return (await survey([plugin], ctxOf())).candidates.map((c) => c.id)
    }
    expect(await ids('linux')).toEqual([`pip:${join(h.home, '.cache/pip')}`])
    expect(await ids('macos')).toEqual([
      `pip:${join(h.home, 'Library/Caches/pip')}`,
      `pip:${join(h.home, 'Library/Caches/only-mac')}`,
    ])
  })

  test('detect: any of its folders by default; any and all of onPath and exists', async () => {
    const detected = async (detect: string, programs: string[], fill: boolean) => {
      const b = build(
        'uv',
        `descriptor: 1
${detect}paths:
  cache: { all: ~/.cache/uv }
candidates:
  - { path: cache, costDescription: re-download }
`,
        { fill, programs: Object.fromEntries(programs.map((p) => [p, () => ({})])) },
      )
      return b.plugin.detect(fakeContext())
    }
    expect(await detected('', [], true)).toBe(true)
    expect(await detected('', ['uv'], false)).toBe(false)
    const any = 'detect: { any: [{ onPath: uv }, { exists: cache }] }\n'
    expect(await detected(any, ['uv'], false)).toBe(true)
    expect(await detected(any, [], false)).toBe(false)
    const all = 'detect: { all: [{ onPath: uv }, { exists: cache }] }\n'
    expect(await detected(all, ['uv'], false)).toBe(false)
    expect(await detected(all, ['uv'], true)).toBe(true)
  })

  test('system: true is skipped with a note', async () => {
    const b = build('sys', `${PIP_PER_OS}system: true\n`)
    expect(skipReason(b.d)).toBe(
      'skipped: it describes data that needs root (system: true), which host-cleaner does not clean',
    )
    expect(skipReason(parseDescriptor(PIP_PER_OS, 'pip.yaml'))).toBeUndefined()
    expect(await b.plugin.detect(fakeContext())).toBe(false)
  })

  test('supersededBy: not detected while that plugin runs', async () => {
    const asked: string[] = []
    const of = (running: boolean) =>
      build('pip', `${PIP_PER_OS}supersededBy: pip-code\n`, {
        opts: {
          runs: (plugin) => {
            asked.push(plugin)
            return running
          },
        },
      }).plugin
    expect(await of(true).detect(fakeContext())).toBe(false)
    expect(await of(false).detect(fakeContext())).toBe(true)
    expect(asked).toEqual(['pip-code', 'pip-code'])
  })
})

describe('candidates', () => {
  test('a glob makes one candidate per match, each judged idle on its own; links are not matched', async () => {
    const b = build('hf', HUGGING_FACE, { idleHours: 0 })
    const hub = b.folder('hub')
    age(join(hub, 'models--a'), 1000)
    const elsewhere = tempHome()
    cleanups.push(elsewhere.cleanup)
    symlinkSync(elsewhere.home, join(hub, 'models--link'))
    writeFileSync(join(hub, 'models--file'), 'not a folder')
    const s = await survey([b.plugin], ctxOf())
    expect(s.candidates.map((c) => [c.id, c.held ?? false])).toEqual([
      [`hf:${join(hub, 'models--a')}`, false],
      [`hf:${join(hub, 'models--b')}`, true],
    ])
    expect(s.candidates[0]).toMatchObject({
      kind: 'hf',
      owner: 'hf',
      costDescription: 're-download',
      evidence: { path: join(hub, 'models--a'), candidate: 0, action: 'remove' },
    })
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps.map((x) => x.id)).toEqual([`hf:${join(hub, 'models--a')}`])
    expect(existsSync(join(hub, 'models--a'))).toBe(false)
    expect(existsSync(join(hub, 'models--b'))).toBe(true)
  })

  test('past maxEntries the rest are left for a later run, with a note', async () => {
    const b = build(
      'pip',
      `descriptor: 1
paths:
  http: { all: ~/.cache/pip/http }
candidates:
  - { path: http, glob: '*/', maxEntries: 2, costDescription: re-download }
`,
    )
    for (const n of ['c', 'd']) mkdirSync(join(b.folder('http'), n))
    const s = await survey([b.plugin], ctxOf())
    expect(s.candidates.map((c) => c.path)).toEqual([
      join(b.folder('http'), 'a'),
      join(b.folder('http'), 'b'),
    ])
    expect(s.objections).toEqual([
      {
        by: 'pip',
        candidate: `pip:${join(b.folder('http'), 'b')}`,
        level: 'note',
        code: 'more-entries',
        reason: `2 more entries match */ in ${b.folder('http')}; they are listed once these are gone`,
      },
    ])
  })

  test('globMatches walks one level per part and takes folders only with a trailing /', () => {
    const h = tempHome()
    cleanups.push(h.cleanup)
    mkdirSync(join(h.home, 'a', 'cache'), { recursive: true })
    mkdirSync(join(h.home, 'b', 'other'), { recursive: true })
    writeFileSync(join(h.home, 'c'), 'x')
    expect(globMatches(h.home, '*/cache/')).toEqual([join(h.home, 'a', 'cache')])
    expect(globMatches(h.home, '*')).toEqual(['a', 'b', 'c'].map((n) => join(h.home, n)))
    expect(globMatches(h.home, '*/')).toEqual(['a', 'b'].map((n) => join(h.home, n)))
  })

  test('held and costDescription: lost are held; idleHours on the candidate beats the setting', async () => {
    const b = build(
      'x',
      `descriptor: 1
paths:
  a: { all: ~/.x/a }
  b: { all: ~/.x/b }
  c: { all: ~/.x/c }
candidates:
  - { path: a, costDescription: re-download, held: true }
  - { path: b, costDescription: lost }
  - { path: c, costDescription: rebuild, idleHours: 1000 }
`,
      { idleHours: 0 },
    )
    const s = await survey([b.plugin], ctxOf())
    expect(s.candidates.map((c) => c.held)).toEqual([true, true, true])
    expect(s.candidates[2]!.why).toMatch(/\(threshold 1000\)/)
  })

  test("idleHours comes from the plugin's setting, which inherits the config's", () => {
    const def = descriptorPlugin('pip', parseDescriptor(PIP_PER_OS, 'pip.yaml'))
    expect(settingsOf('pip', {}, { idleHours: 5 }, [def])).toEqual({ enabled: true, idleHours: 5 })
    expect(settingsOf('pip', { idleHours: 0.5 }, { idleHours: 5 }, [def])).toEqual({
      enabled: true,
      idleHours: 0.5,
    })
  })
})

describe('inUse', () => {
  test('a running process or a lock file refuses every candidate', async () => {
    const running = build('uv', UV, {
      processes: processes({ '/': [{ pid: 7, command: 'uv' }] }),
    })
    const s = await survey([running.plugin], ctxOf())
    expect(s.objections.filter((o) => o.level === 'refuse')).toEqual([
      {
        by: 'uv',
        candidate: `uv:${running.folder('cache')}`,
        level: 'refuse',
        code: IN_USE,
        reason: 'running: uv (pid 7)',
      },
    ])

    const locked = build('gradle', `${PIP_PER_OS}inUse: { locks: [~/.cache/pip.lock] }\n`)
    writeFileSync(join(locked.home, '.cache', 'pip.lock'), '')
    const l = await survey([locked.plugin], ctxOf())
    expect(l.objections.map((o) => [o.code, o.reason])).toEqual([
      [IN_USE, `the lock ${join(locked.home, '.cache', 'pip.lock')} exists`],
    ])
  })

  test('delete checks again: a process that started after the plan fails the step', async () => {
    const table: Record<string, ProcessHolder[]> = {}
    const b = build('pip', `${PIP_PER_OS}inUse: { processes: [pip] }\n`, {
      processes: processes(table),
    })
    const ctx = ctxOf()
    const p = plan(await survey([b.plugin], ctx))
    // The re-check's survey sees no process; delete, after it, does.
    const deleting = b.plugin.delete!.bind(b.plugin)
    b.plugin.delete = (c, x) => {
      table['/'] = [{ pid: 9, command: 'pip' }]
      return deleting(c, x)
    }
    const receipt = await clean(p, [b.plugin], ctx)
    expect(receipt.steps).toMatchObject([
      { result: 'failed', error: `${b.folder('cache')} was not deleted: running: pip (pid 9)` },
    ])
    expect(existsSync(b.folder('cache'))).toBe(true)
  })
})

describe('project', () => {
  test("build folders beside a marker in the targets' checkouts, refused while a process works there", async () => {
    const b = build('dotnet', DOTNET_PROJECT)
    const repo = dotnetCheckout(b.home)
    mkdirSync(join(repo, 'lib', 'bin'), { recursive: true })
    const s = await survey([b.plugin], ctxOf({ targets: [repo] }))
    expect(s.candidates.map((c) => c.path).sort()).toEqual(
      [b.folder('nuget'), join(repo, 'bin'), join(repo, 'obj')].sort(),
    )
    expect(s.candidates.find((c) => c.path === join(repo, 'obj'))).toMatchObject({
      costDescription: 'rebuild',
      evidence: { path: join(repo, 'obj'), project: 1, checkout: repo },
    })

    const busy = build('dotnet', DOTNET_PROJECT, {
      processes: processes({ [repo]: [{ pid: 3, command: 'dotnet' }] }),
    })
    const live = await survey([busy.plugin], ctxOf({ targets: [repo] }))
    expect(live.objections.map((o) => [o.candidate, o.code])).toEqual([
      [`dotnet:${join(repo, 'bin')}`, 'live-process'],
      [`dotnet:${join(repo, 'obj')}`, 'live-process'],
    ])

    const { receipt } = await surveyAndClean(b.plugin, [], { targets: [repo] })
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual(
      expect.arrayContaining([
        [`dotnet:${join(repo, 'bin')}`, 'ok'],
        [`dotnet:${join(repo, 'obj')}`, 'ok'],
      ]),
    )
    expect(existsSync(join(repo, 'bin'))).toBe(false)
    expect(existsSync(join(repo, 'App.csproj'))).toBe(true)
  })
})

// The system description's tier 2 examples (as in descriptor-schema.test.ts).

const PNPM_VARS = `descriptor: 1
store: pnpm
vars:
  STORE:
    - command: [pnpm, store, path]
    - value: { macos: ~/Library/pnpm/store, linux: '\${XDG_DATA_HOME}/pnpm/store' }
paths:
  store: { all: '\${STORE}' }
candidates:
  - path: store
    costDescription: re-download
    command: [pnpm, store, prune, --store-dir, '{path}']
    removes: unused
inUse:
  processes: [pnpm]
`

const GO_VARS = `descriptor: 1
store: go
detect:
  any: [{ onPath: go }, { exists: modcache }]
vars:
  GOPATH:
    - env: GOPATH
    - value: ~/go
  GOMODCACHE:
    - env: GOMODCACHE
    - command: [go, env, GOMODCACHE]
    - value: '\${GOPATH}/pkg/mod'
  GOCACHE:
    - env: GOCACHE
    - command: [go, env, GOCACHE]
    - value: { macos: ~/Library/Caches/go-build, linux: '\${XDG_CACHE_HOME}/go-build' }
paths:
  modcache: { all: '\${GOMODCACHE}' }
  buildcache: { all: '\${GOCACHE}' }
candidates:
  - path: modcache
    costDescription: re-download
    idleHours: 720
    command: [go, clean, -modcache]
    env: { GOMODCACHE: '{path}' }
    removes: all
  - path: buildcache
    costDescription: rebuild
    idleHours: 168
    command: [go, clean, -cache]
    env: { GOCACHE: '{path}' }
    removes: all
`

/** A folder made under `root` with a file in it. */
function filled(root: string, ...parts: string[]): string {
  const dir = join(root, ...parts)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'blob'), 'x')
  return dir
}

/**
 * The plugin for `text` over a new fixture home, with `env` over its HOME, the
 * config's `vars` and `programs` on PATH. No folder is made.
 */
function buildVars(
  name: string,
  text: string,
  o: {
    env?: (home: string) => Record<string, string>
    vars?: Record<string, string>
    programs?: Parameters<typeof fakeRunner>[0]
  } = {},
) {
  const h = tempHome()
  cleanups.push(h.cleanup)
  const env = { ...h.env, ...o.env?.(h.home) }
  const fake = fakeRunner(o.programs ?? {})
  const def = descriptorPlugin(name, parseDescriptor(text, `${name}.yaml`), {
    os: OS,
    ownDirs: [],
  })
  const plugin = def.create({
    settings: { idleHours: 0, vars: o.vars },
    only: [],
    env,
    kit: pluginKit(name, { env, ...processes(), ...fake }),
  })
  return { home: h.home, plugin, def, calls: fake.calls }
}

/** A directory outside every fixture home. */
function outsideHome(): string {
  const t = tempHome()
  cleanups.push(t.cleanup)
  return t.home
}

describe('variables (tier 2)', () => {
  test('the contract suite passes for pnpm and go, with and without their tools', async () => {
    for (const [name, text] of [
      ['pnpm', PNPM_VARS],
      ['go', GO_VARS],
    ] as const) {
      const bare = buildVars(name, text)
      filled(bare.home, name === 'pnpm' ? '.local/share/pnpm/store' : 'go/pkg/mod')
      expect(await contractSuite(bare.plugin), name).toEqual([])

      const tooled = buildVars(name, text, {
        programs: {
          [name]: (argv) =>
            argv[0] === 'env' || argv[1] === 'path' ? { exitCode: 1 } : { exitCode: 0 },
        },
      })
      filled(tooled.home, name === 'pnpm' ? '.local/share/pnpm/store' : 'go/pkg/mod')
      expect(await contractSuite(tooled.plugin), name).toEqual([])
    }
  })

  test("pnpm's store is found where pnpm says it is, and the prune is pointed there", async () => {
    let moved = ''
    const b = buildVars('pnpm', PNPM_VARS, {
      programs: {
        pnpm: (argv) => (argv[1] === 'path' ? { stdout: `${moved}\n` } : {}),
      },
    })
    moved = filled(b.home, 'disk', 'pnpm-store')
    filled(b.home, '.local/share/pnpm/store')
    const { survey: s } = await surveyAndClean(b.plugin)
    expect(s.candidates.map((c) => c.path)).toEqual([moved])
    expect(s.roots.pnpm).toEqual([join(b.home, 'disk')])
    expect(b.calls.map((c) => c.argv)).toEqual([
      // The survey, the re-check, then the prune.
      ['pnpm', 'store', 'path'],
      ['pnpm', 'store', 'path'],
      ['pnpm', 'store', 'prune', '--store-dir', moved],
    ])
  })

  test('without pnpm, the per-OS value is used, under XDG_DATA_HOME when it is set', async () => {
    const plain = buildVars('pnpm', PNPM_VARS)
    const store = filled(plain.home, '.local/share/pnpm/store')
    expect((await survey([plain.plugin], ctxOf())).candidates.map((c) => c.path)).toEqual([store])

    const moved = buildVars('pnpm', PNPM_VARS, {
      env: (home) => ({ XDG_DATA_HOME: join(home, 'data') }),
    })
    const there = filled(moved.home, 'data/pnpm/store')
    filled(moved.home, '.local/share/pnpm/store')
    expect((await survey([moved.plugin], ctxOf())).candidates.map((c) => c.path)).toEqual([there])
  })

  test("go's module cache follows GOMODCACHE, or GOPATH, and its env entry gets the folder", async () => {
    const env = buildVars('go', GO_VARS, {
      env: (home) => ({ GOMODCACHE: join(home, 'mod') }),
      programs: { go: (argv) => (argv[0] === 'env' ? { exitCode: 1 } : {}) },
    })
    const mod = filled(env.home, 'mod')
    // Past its idleHours of 720.
    age(mod, 1000)
    filled(env.home, 'go/pkg/mod')
    const { survey: s } = await surveyAndClean(env.plugin)
    expect(s.candidates.map((c) => c.path)).toEqual([mod])
    expect(env.calls.filter((c) => c.argv[1] === 'clean')).toMatchObject([
      { argv: ['go', 'clean', '-modcache'], opts: { env: { GOMODCACHE: mod } } },
    ])

    const gopath = buildVars('go', GO_VARS, { env: (home) => ({ GOPATH: join(home, 'work') }) })
    const viaPath = filled(gopath.home, 'work/pkg/mod')
    expect((await survey([gopath.plugin], ctxOf())).candidates.map((c) => c.path)).toEqual([
      viaPath,
    ])
  })

  test('a go env that hangs times out, and the next source gives the folder', async () => {
    const b = buildVars('go', GO_VARS, {
      programs: { go: { 'env GOMODCACHE': fakeNeverExited('timeout'), 'env GOCACHE': {} } },
    })
    const mod = filled(b.home, 'go/pkg/mod')
    const s = await survey([b.plugin], ctxOf())
    expect(s.warnings).toEqual([])
    expect(s.candidates.map((c) => c.path)).toEqual([mod])
  })

  test('a variable with no value leaves its folder out: no candidate, no root', async () => {
    const NONE = `descriptor: 1
vars:
  DIR:
    - env: TOOL_DIR
paths:
  data: { all: '\${DIR}' }
  other: { all: ~/.cache/other }
candidates:
  - { path: data, costDescription: rebuild }
  - { path: other, costDescription: rebuild }
`
    const b = buildVars('tool', NONE)
    const other = filled(b.home, '.cache/other')
    const s = await survey([b.plugin], ctxOf())
    expect(s.candidates.map((c) => c.path)).toEqual([other])
    expect(s.roots.tool).toEqual([join(b.home, '.cache')])
  })

  test('each survey works the folder out again; a store moved after the plan is not deleted', async () => {
    let at = ''
    const b = buildVars('pnpm', PNPM_VARS, {
      programs: { pnpm: (argv) => (argv[1] === 'path' ? { stdout: `${at}\n` } : {}) },
    })
    const first = filled(b.home, 'one/store')
    const second = filled(b.home, 'two/store')
    at = first
    const ctx = ctxOf()
    const p = plan(await survey([b.plugin], ctx), {})
    at = second
    const receipt = await clean(p, [b.plugin], ctx)
    expect(receipt.dropped).toMatchObject([{ id: `pnpm:${first}`, reason: 'gone' }])
    expect(receipt.steps).toEqual([])
    expect(b.calls.filter((c) => c.argv[2] === 'prune')).toEqual([])
    expect(existsSync(join(first, 'blob'))).toBe(true)
  })

  test('a folder a variable puts outside home is refused outside-roots, and the plugin will not delete it', async () => {
    const elsewhere = filled(outsideHome(), 'cache')
    const b = buildVars('go', GO_VARS, { env: () => ({ GOMODCACHE: elsewhere }) })
    const s = await survey([b.plugin], ctxOf())
    expect(s.objections.filter((o) => o.by === 'go')).toMatchObject([
      { code: OUTSIDE_ROOTS, reason: `${elsewhere}: it is not inside the home folder` },
    ])
    expect(s.roots.go).not.toContain(join(elsewhere, '..'))
    const c = s.candidates.find((x) => x.path === elsewhere)!
    expect(c).toMatchObject({ held: true })
    await expect(b.plugin.delete!(c, fakeContext())).rejects.toThrow(
      `${elsewhere} was not deleted: it is not inside go's roots`,
    )
    const p = plan(s, { pick: [c.id], allow: [OUTSIDE_ROOTS] })
    await clean(p, [b.plugin], ctxOf())
    expect(existsSync(join(elsewhere, 'blob'))).toBe(true)
  })

  test('a folder from a variable set in the config is trusted outside home, and cleaned', async () => {
    const disk = outsideHome()
    const mod = filled(disk, 'go', 'mod')
    age(mod, 1000)
    const b = buildVars('go', GO_VARS, { vars: { GOMODCACHE: mod } })
    const { survey: s, receipt } = await surveyAndClean(b.plugin)
    expect(s.objections).toEqual([])
    expect(s.roots.go).toContain(join(disk, 'go'))
    expect(receipt.steps).toMatchObject([{ id: `go:${mod}`, result: 'ok' }])
    expect(existsSync(mod)).toBe(false)
  })

  test('a trusted folder is still refused when it holds home, or is a target', async () => {
    const holdsHome = buildVars('go', GO_VARS)
    const parent = join(holdsHome.home, '..')
    const again = buildVars('go', GO_VARS, { vars: { GOMODCACHE: parent } })
    const s = await survey([again.plugin], ctxOf())
    expect(s.objections.map((o) => o.reason)).toContainEqual(
      expect.stringMatching(/: it holds the home folder$/),
    )

    const disk = outsideHome()
    const target = filled(disk, 'repo')
    const t = buildVars('go', GO_VARS, { vars: { GOMODCACHE: target } })
    const st = await survey([t.plugin], ctxOf({ targets: [target] }))
    expect(st.objections.filter((o) => o.by === 'go')).toMatchObject([
      { code: OUTSIDE_ROOTS, reason: `${target}: it is a target` },
    ])
  })

  test('a lock may use a variable', async () => {
    const LOCKED = PNPM_VARS.replace('processes: [pnpm]', "locks: ['${STORE}/lock']")
    const b = buildVars('pnpm', LOCKED)
    const store = filled(b.home, '.local/share/pnpm/store')
    writeFileSync(join(store, 'lock'), '')
    const s = await survey([b.plugin], ctxOf())
    expect(s.objections).toContainEqual(
      expect.objectContaining({ code: IN_USE, reason: `the lock ${join(store, 'lock')} exists` }),
    )
  })

  test("the config's vars name only the descriptor's variables, each a folder", () => {
    const { def } = buildVars('go', GO_VARS)
    expect(
      settingsIssues(
        { go: { vars: { GOMODCACHE: '/Volumes/build/go/mod', GOROOT: '/x', GOCACHE: 'rel' } } },
        'plugins',
        [def],
      ),
    ).toEqual([
      'plugins.go.vars.GOCACHE: must start with ~/ or be absolute',
      'plugins.go.vars: Unrecognized key: "GOROOT"',
    ])
    expect(settingsIssues({ go: { vars: { GOPATH: '~/go' } } }, 'plugins', [def])).toEqual([])
    const tier1 = descriptorPlugin('pip', parseDescriptor(PIP_PER_OS, 'pip.yaml'))
    expect(settingsIssues({ pip: { vars: {} } }, 'plugins', [tier1])).toEqual([
      'plugins.pip: Unrecognized key: "vars"',
    ])
  })

  test('config lists each variable, with the value the config sets', () => {
    const { def } = buildVars('go', GO_VARS)
    const rows = effectiveSettings({ go: { vars: { GOPATH: '/work/go' } } }, {}, [def]).go!
    expect(rows.map((r) => [r.key, r.value, r.source])).toEqual([
      ['enabled', true, 'default'],
      ['idleHours', 24, 'default'],
      ['vars.GOPATH', '/work/go', 'config'],
      ['vars.GOMODCACHE', undefined, 'default'],
      ['vars.GOCACHE', undefined, 'default'],
    ])
  })
})
