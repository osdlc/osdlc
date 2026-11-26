/**
 * Descriptor to plugin: every tier 1 example and first-set draft against the
 * contract suite, then each rule of the engine on a fixture home: folders per
 * OS, globs, prunes and wipes (D12), commands pointed at the checked folder
 * (D13), inUse, project, supersededBy, system and the path checks.
 */

import { execFileSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join } from 'node:path'
import { afterEach, describe, expect, test, vi } from 'vitest'

import type { CommandRunner } from '@osdlc/command-seam'
import type { ProcessHolder, ProcessProbe } from '@osdlc/repo-cleaner'
import { makeGitFixture } from '@osdlc/typed-git/testing'

import { CORPUS_DIR, FIRST_SET, draftStore } from '../scripts/draft-descriptor.ts'
import {
  DISCARD_USER_DATA,
  DUPLICATE_ENTRY,
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
  type Kit,
  type Os,
  type PathCandidate,
  type Plugin,
  type RunCtx,
} from '../src/index.ts'
import { settingsOf } from '../src/settings.ts'
import { contractSuite, fakeContext, fakeRunner, tempHome } from '../src/testing.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  while (cleanups.length > 0) cleanups.pop()!()
})

/** The kit's process table, as its `probe` and `ps` options. */
interface Processes {
  probe: ProcessProbe
  ps: CommandRunner
}

/**
 * A process table: `cwd` maps a folder to the processes working in it, for
 * the probe; `/` lists every process, read by `ps` as a child of init with
 * `command` as its command line. Both read `table` when asked, so it may
 * change.
 */
const processes = (table: Record<string, ProcessHolder[]> = {}): Processes => ({
  probe: { alive: () => false, holders: (path) => table[path] ?? [] },
  ps: {
    run: () => ({
      exitCode: 0,
      stdout: [{ pid: 1, command: '/sbin/init' }, ...(table['/'] ?? [])]
        .map((h) => `${h.pid} ${h.pid === 1 ? 0 : 1} ${h.command}\n`)
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
    /** Changes the plugin's kit in place before the plugin is built on it. */
    kit?: (kit: Kit) => void
  } = {},
): Built {
  const h = tempHome()
  cleanups.push(h.cleanup)
  const d = parseDescriptor(text, `${name}.yaml`)
  const osFolder = (key: string): string | undefined => {
    const p = d.paths[key]!
    return p.all ?? p[OS]
  }
  const folder = (key: string): string => {
    const f = osFolder(key)!
    return f.startsWith('~/') ? join(h.home, f.slice(2)) : f
  }
  if (o.fill !== false) {
    for (const key of Object.keys(d.paths)) {
      if (osFolder(key) === undefined) continue
      mkdirSync(folder(key), { recursive: true })
      writeFileSync(join(folder(key), 'blob'), 'x')
    }
    for (const c of d.candidates) {
      if (c.glob === undefined || osFolder(c.path) === undefined) continue
      for (const n of ['a', 'b']) {
        const rel = c.glob.replace(/\/$/, '').replaceAll('*', n).replaceAll('?', n)
        mkdirSync(join(folder(c.path), rel), { recursive: true })
        writeFileSync(join(folder(c.path), rel, 'blob'), n)
      }
    }
  }
  const fake = fakeRunner(o.programs ?? {})
  const kit = pluginKit(name, { env: h.env, ...(o.processes ?? processes()), ...fake })
  o.kit?.(kit)
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
      // `p` is a file, which readdirSync cannot read.
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

  test('the filesystem root and the home folder itself, which the format refuses too', () => {
    const { home, cleanup } = tempHome()
    cleanups.push(cleanup)
    const at = { home, targets: [], checkouts: [], ownDirs: [] }
    expect(pathProblem('/', at)).toBe('it is the filesystem root')
    expect(pathProblem(home, at)).toBe('it is the home folder')
    for (const folder of ['/', '~/']) {
      expect(() => parseDescriptor(one(folder), 'x.yaml')).toThrow(/must name a folder below/)
    }
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

  test('a symlink written with a trailing /', async () => {
    const b = build('x', one('~/.npm/'), { fill: false })
    const real = join(b.home, 'npm-real')
    mkdirSync(real)
    writeFileSync(join(real, 'keep'), 'x')
    symlinkSync(real, join(b.home, '.npm'))
    const { survey: s } = await surveyAndClean(b.plugin)
    expect(s.objections.filter((o) => o.by === 'x').map((o) => o.reason)).toEqual([
      `${join(b.home, '.npm')}: it is a symlink`,
    ])
    expect(s.roots.x).toEqual([])
    expect(existsSync(join(real, 'keep'))).toBe(true)
  })

  test("a folder inside host-cleaner's own", () => {
    const h = tempHome()
    cleanups.push(h.cleanup)
    const own = join(h.home, '.local', 'state', 'host-cleaner')
    const receipts = join(own, 'receipts')
    mkdirSync(receipts, { recursive: true })
    const at = { home: h.home, targets: [], checkouts: [], ownDirs: [own] }
    expect(pathProblem(receipts, at)).toBe(`it is inside host-cleaner's own folder ${own}`)
  })

  test("a folder that will hold host-cleaner's own, not made yet, behind a linked home", () => {
    const h = tempHome()
    cleanups.push(h.cleanup)
    const real = realpathSync(h.home)
    const linked = `${real}-linked`
    symlinkSync(real, linked)
    cleanups.push(() => rmSync(linked))
    const state = join(real, '.local', 'state')
    mkdirSync(state, { recursive: true })
    const own = join(linked, '.local', 'state', 'host-cleaner')
    const at = { home: linked, targets: [], checkouts: [], ownDirs: [own] }
    expect(pathProblem(state, at)).toBe(`it holds host-cleaner's own folder ${own}`)
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
    expect(await b.plugin.detect(fakeContext())).toEqual({ active: false, note: skipReason(b.d) })
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
    expect(await of(true).detect(fakeContext())).toEqual({
      active: false,
      note: 'skipped: the plugin pip-code runs instead',
    })
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

  test('past maxEntries the rest are combined into one candidate that removes each', async () => {
    const b = build(
      'pip',
      `descriptor: 1
paths:
  http: { all: ~/.cache/pip/http }
candidates:
  - { path: http, glob: '*/', maxEntries: 2, costDescription: re-download }
`,
    )
    const http = b.folder('http')
    for (const n of ['c', 'd']) mkdirSync(join(http, n))
    const s = await survey([b.plugin], ctxOf())
    const rest = `pip:${join(http, 'c')}`
    expect(s.candidates.map((c) => c.id)).toEqual([
      `pip:${join(http, 'a')}`,
      `pip:${join(http, 'b')}`,
      rest,
    ])
    // The evidence counts them, so that a huge cache does not flood the plan.
    expect(s.candidates[2]!.evidence.rest).toEqual({
      matches: 2,
      digest: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
    expect(s.candidates[2]!.held).toBeUndefined()
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps.map((x) => x.id)).toContain(rest)
    for (const n of ['a', 'b', 'c', 'd']) expect(existsSync(join(http, n))).toBe(false)
  })

  test('the combined rest is held while one of its matches changed recently', async () => {
    const b = build(
      'pip',
      `descriptor: 1
paths:
  http: { all: ~/.cache/pip/http }
candidates:
  - { path: http, glob: '*/', maxEntries: 1, costDescription: re-download }
`,
      { idleHours: 24 },
    )
    const http = b.folder('http')
    age(http, 48)
    writeFileSync(join(http, 'b', 'fresh'), 'x')
    const s = await survey([b.plugin], ctxOf())
    const rest = s.candidates.find((c) => c.evidence.rest !== undefined)!
    expect(rest.path).toBe(join(http, 'b'))
    expect(rest.held).toBe(true)
  })

  test('the combined rest leaves out a match on the ignore list', async () => {
    const b = build(
      'pip',
      `descriptor: 1
paths:
  http: { all: ~/.cache/pip/http }
candidates:
  - { path: http, glob: '*/', maxEntries: 1, costDescription: re-download }
`,
    )
    const http = b.folder('http')
    for (const n of ['c', 'd']) mkdirSync(join(http, n, 'in'), { recursive: true })
    const ignore = [join(http, 'c'), join(http, 'd', 'in')]
    const { survey: s } = await surveyAndClean(b.plugin, [], { ignore })
    expect(s.candidates.map((c) => [c.path, c.evidence.rest])).toEqual([
      [join(http, 'a'), undefined],
      [join(http, 'b'), expect.objectContaining({ matches: 1 })],
    ])
    expect(readdirSync(http).sort()).toEqual(['blob', 'c', 'd'])
  })

  test('a glob that matches files gives one candidate per file', async () => {
    const b = build(
      'logs',
      `descriptor: 1
paths:
  logs: { all: ~/.app/logs }
candidates:
  - { path: logs, glob: '*.log', costDescription: rebuild }
`,
      { fill: false },
    )
    const logs = b.folder('logs')
    mkdirSync(logs, { recursive: true })
    writeFileSync(join(logs, 'a.log'), 'x')
    writeFileSync(join(logs, 'keep.txt'), 'x')
    const { survey: s } = await surveyAndClean(b.plugin)
    expect(s.candidates.map((c) => c.path)).toEqual([join(logs, 'a.log')])
    expect(existsSync(join(logs, 'a.log'))).toBe(false)
    expect(existsSync(join(logs, 'keep.txt'))).toBe(true)
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

  test('a {a,b} glob takes each alternative, one with a / in it too', () => {
    const h = tempHome()
    cleanups.push(h.cleanup)
    for (const d of ['models--x', 'datasets--y', 'spaces--z', 'a/b']) {
      mkdirSync(join(h.home, d), { recursive: true })
    }
    expect(globMatches(h.home, '{models,datasets}--*/')).toEqual(
      ['datasets--y', 'models--x'].map((n) => join(h.home, n)),
    )
    expect(globMatches(h.home, 'a/{,b}')).toEqual([join(h.home, 'a'), join(h.home, 'a', 'b')])
  })

  test('a {a,b} marker marks a project by any alternative', async () => {
    const b = build(
      'dotnet',
      `descriptor: 1
paths:
  nuget: { all: ~/.nuget/packages }
candidates:
  - { path: nuget, costDescription: re-download }
project:
  - { dir: obj, marker: '*.{csproj,fsproj}', costDescription: rebuild }
`,
    )
    const repo = dotnetCheckout(b.home)
    const fs = join(repo, 'lib')
    mkdirSync(join(fs, 'obj'), { recursive: true })
    writeFileSync(join(fs, 'Lib.fsproj'), '<Project/>')
    const s = await survey([b.plugin], ctxOf({ targets: [repo] }))
    const objs = s.candidates.map((c) => c.path).filter((p) => p?.endsWith('obj'))
    expect(objs.sort()).toEqual([join(repo, 'lib', 'obj'), join(repo, 'obj')])
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

  test('a target inside a repository: only build folders inside the target', async () => {
    const b = build('dotnet', DOTNET_PROJECT)
    const repo = dotnetCheckout(b.home)
    const lib = join(repo, 'lib')
    mkdirSync(join(lib, 'bin'), { recursive: true })
    writeFileSync(join(lib, 'Lib.csproj'), '<Project/>')
    const s = await survey([b.plugin], ctxOf({ targets: [lib] }))
    expect(s.candidates.map((c) => c.path).sort()).toEqual(
      [b.folder('nuget'), join(lib, 'bin')].sort(),
    )
  })
})

/** pip's HTTP cache: one candidate per folder, past the first as one. */
const REST = `descriptor: 1
paths:
  http: { all: ~/.cache/pip/http }
candidates:
  - { path: http, glob: '*/', maxEntries: 1, costDescription: re-download }
`

/** {@link REST} over folders `a` to `d`, unchanged for 48 hours, with a 24 hour threshold. */
function buildRest(kit?: (kit: Kit) => void) {
  const b = build('pip', REST, { idleHours: 24, ...(kit === undefined ? {} : { kit }) })
  const http = b.folder('http')
  for (const n of ['c', 'd']) {
    mkdirSync(join(http, n))
    writeFileSync(join(http, n, 'blob'), n)
  }
  age(http, 48)
  return { ...b, http, id: `pip:${join(http, 'b')}` }
}

/** Runs `before` right before the plugin's `delete`, once, as something that happens after the re-check. */
function beforeDelete(plugin: Plugin, before: () => void): void {
  const deleting = plugin.delete!.bind(plugin)
  let done = false
  plugin.delete = (c, x) => {
    if (!done) before()
    done = true
    return deleting(c, x)
  }
}

describe('idle is checked again at delete', () => {
  test('a folder that changed after the re-check is not deleted', async () => {
    const b = build('pip', PIP_PER_OS, { idleHours: 24 })
    const cache = b.folder('cache')
    age(cache, 48)
    beforeDelete(b.plugin, () => writeFileSync(join(cache, 'fresh'), 'x'))
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps).toMatchObject([
      {
        result: 'failed',
        error: `${cache} was not deleted: it is no longer idle: it changed 0 hours ago (threshold 24)`,
      },
    ])
    expect(existsSync(join(cache, 'fresh'))).toBe(true)
  })

  test('nor is one that can no longer be measured, or read', async () => {
    let measured = true
    const b = build('pip', PIP_PER_OS, {
      idleHours: 24,
      kit: (kit) => {
        const idle = kit.idle
        kit.idle = (...args) => (measured ? idle(...args) : { unmeasured: true })
      },
    })
    const cache = b.folder('cache')
    age(cache, 48)
    beforeDelete(b.plugin, () => {
      measured = false
    })
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps[0]!.error).toMatch(/could not be measured idle in the time budget now$/)
    measured = true
    const inner = join(cache, 'inner')
    mkdirSync(inner)
    const locked = build('pip', PIP_PER_OS, {
      idleHours: 24,
      kit: (kit) => {
        const idle = kit.idle
        kit.idle = (...args) => {
          if (!measured) throw new Error('EACCES')
          return idle(...args)
        }
      },
    })
    age(locked.folder('cache'), 48)
    beforeDelete(locked.plugin, () => {
      measured = false
    })
    const unread = await surveyAndClean(locked.plugin)
    expect(unread.receipt.steps[0]!.error).toMatch(/it cannot be read now$/)
    expect(existsSync(cache) && existsSync(locked.folder('cache'))).toBe(true)
  })

  test('nor is one that changed between the plan and the re-check, which drops it', async () => {
    const b = build('pip', PIP_PER_OS, { idleHours: 24 })
    const cache = b.folder('cache')
    age(cache, 48)
    const ctx = ctxOf()
    const p = plan(await survey([b.plugin], ctx))
    writeFileSync(join(cache, 'fresh'), 'x')
    const receipt = await clean(p, [b.plugin], ctx)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped).toMatchObject([{ id: `pip:${cache}`, reason: 'changed' }])
    expect(existsSync(join(cache, 'fresh'))).toBe(true)
  })

  test('a held folder a person picked is deleted as it is', async () => {
    const b = build('pip', PIP_PER_OS, { idleHours: 24 })
    const cache = b.folder('cache')
    const ctx = ctxOf()
    const p = plan(await survey([b.plugin], ctx), { pick: [`pip:${cache}`] })
    expect((await clean(p, [b.plugin], ctx)).steps).toMatchObject([{ result: 'ok' }])
    expect(existsSync(cache)).toBe(false)
  })

  test('one held by its entry or as lost, picked idle, is not deleted once it changed', async () => {
    for (const held of ['costDescription: re-download, held: true', 'costDescription: lost']) {
      const b = build(
        'x',
        `descriptor: 1
paths:
  a: { all: ~/.x/a }
candidates:
  - { path: a, ${held} }
`,
        { idleHours: 24 },
      )
      const folder = b.folder('a')
      age(folder, 48)
      beforeDelete(b.plugin, () => writeFileSync(join(folder, 'fresh'), 'x'))
      const ctx = ctxOf({ allow: [DISCARD_USER_DATA] })
      const p = plan(await survey([b.plugin], ctx), {
        pick: [`x:${folder}`],
        allow: [DISCARD_USER_DATA],
      })
      expect((await clean(p, [b.plugin], ctx)).steps).toMatchObject([
        { result: 'failed', error: expect.stringMatching(/it is no longer idle/) },
      ])
      expect(existsSync(join(folder, 'fresh'))).toBe(true)
    }
  })

  test('a wipe that changed after the re-check runs no command; a prune has no idle check', async () => {
    const WIPE = UV.replace('removes: unused', 'removes: all')
    for (const [text, calls] of [
      [WIPE, 0],
      [UV, 1],
    ] as const) {
      const b = build('uv', text, { idleHours: 24, programs: { uv: () => ({}) } })
      age(b.folder('cache'), 48)
      beforeDelete(b.plugin, () => writeFileSync(join(b.folder('cache'), 'fresh'), 'x'))
      await surveyAndClean(b.plugin)
      expect(b.calls).toHaveLength(calls)
    }
  })

  test('a glob match, a file and a build folder are checked too', async () => {
    const b = build(
      'x',
      `descriptor: 1
paths:
  dirs: { all: ~/.x/dirs }
  files: { all: ~/.x/files }
candidates:
  - { path: dirs, glob: '*/', costDescription: rebuild }
  - { path: files, glob: '*.log', costDescription: rebuild }
project:
  - { dir: obj, marker: '*.csproj', costDescription: rebuild }
`,
      { fill: false, idleHours: 24 },
    )
    const repo = dotnetCheckout(b.home)
    const dir = join(b.folder('dirs'), 'a')
    const file = join(b.folder('files'), 'a.log')
    mkdirSync(dir, { recursive: true })
    mkdirSync(b.folder('files'), { recursive: true })
    writeFileSync(join(dir, 'blob'), 'x')
    writeFileSync(file, 'x')
    for (const at of [b.folder('dirs'), b.folder('files'), join(repo, 'obj')]) age(at, 48)
    beforeDelete(b.plugin, () => {
      for (const f of [join(dir, 'blob'), file, join(repo, 'obj', 'App.dll')]) {
        writeFileSync(f, 'fresh')
      }
    })
    const { receipt } = await surveyAndClean(b.plugin, [], { targets: [repo] })
    expect(receipt.steps.map((x) => [x.id, x.error?.includes('is no longer idle')])).toEqual(
      [dir, file, join(repo, 'obj')].map((path) => [`x:${path}`, true]),
    )
    for (const path of [dir, file, join(repo, 'obj')]) expect(existsSync(path)).toBe(true)
  })

  test('of the combined rest, none goes when one changed after the re-check', async () => {
    const b = buildRest()
    beforeDelete(b.plugin, () => writeFileSync(join(b.http, 'c', 'fresh'), 'x'))
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps[1]).toMatchObject({
      id: b.id,
      result: 'failed',
      error: expect.stringMatching(/was not deleted: .*\/c: it is no longer idle/),
    })
    expect(readdirSync(b.http).sort()).toEqual(['b', 'blob', 'c', 'd'])
  })

  test('of the combined rest, one that changes while the others go is kept, and those after it', async () => {
    const b = buildRest((kit) => {
      const remove = kit.remove
      kit.remove = (path, ctx) => {
        const said = remove(path, ctx)
        if (path.endsWith('/b')) writeFileSync(join(dirname(path), 'c', 'fresh'), 'x')
        return said
      }
    })
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps[1]!.error).toMatch(
      /^removed 1 of 3 matches; removed .*\/b; .*not removed: .*\/c: it is no longer idle.*; 1 not tried$/,
    )
    expect(readdirSync(b.http).sort()).toEqual(['blob', 'c', 'd'])
  })

  test('the combined rest is not deleted by a plugin whose last survey did not list it', async () => {
    const b = buildRest()
    const s = await survey([b.plugin], ctxOf())
    const rest = s.candidates.find((c) => c.id === b.id)!
    mkdirSync(join(b.http, 'e'))
    await survey([b.plugin], ctxOf())
    await expect(b.plugin.delete!(rest, fakeContext())).rejects.toThrow(
      `${b.id} was not deleted: the last survey did not list its matches`,
    )
    expect(readdirSync(b.http).sort()).toEqual(['a', 'b', 'blob', 'c', 'd', 'e'])
  })
})

describe('the combined rest', () => {
  test('one that cannot be removed does not stop the others, and the error names what went', async () => {
    const b = buildRest((kit) => {
      const remove = kit.remove
      kit.remove = (path, ctx) => {
        if (path.endsWith('/c')) throw new Error('EACCES')
        return remove(path, ctx)
      }
    })
    const { receipt } = await surveyAndClean(b.plugin)
    const [, rest] = receipt.steps
    expect(rest).toMatchObject({ id: b.id, result: 'failed' })
    expect(rest!.error).toMatch(
      /^removed 2 of 3 matches; removed .*\/b; .*removed .*\/d; .*not removed: .*\/c: EACCES$/,
    )
    expect(readdirSync(b.http).sort()).toEqual(['blob', 'c'])
  })

  test('one that cannot be read is left, and the others go', async () => {
    const b = buildRest((kit) => {
      const idle = kit.idle
      kit.idle = (path, o) => {
        if (String(path).endsWith('/c')) throw new Error('EACCES')
        return idle(path, o)
      }
    })
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps[1]).toMatchObject({
      result: 'ok',
      delete: expect.stringMatching(/; left .*\/c: it cannot be read now$/),
    })
    expect(readdirSync(b.http).sort()).toEqual(['blob', 'c'])
  })

  test('its matches share the time of one measurement, for idle and for size', async () => {
    // Each measurement takes 6 seconds of a clock the test moves.
    let now = 0
    vi.spyOn(performance, 'now').mockImplementation(() => now)
    const took: string[] = []
    const slow = (what: 'idle' | 'size') => (kit: Kit) => {
      const real = { idle: kit.idle, size: kit.size }
      kit.idle = (path, o) => {
        if (what === 'idle') now += 6_000
        took.push(`idle ${String(path)}`)
        return real.idle(path, o)
      }
      kit.size = (path) => {
        if (what === 'size') now += 6_000
        took.push(`size ${path}`)
        return real.size(path)
      }
    }
    const of = async (what: 'idle' | 'size') => {
      took.length = 0
      const b = buildRest(slow(what))
      // `performance.now` also times the hook, so it stays put until discover.
      const found = await b.plugin.discover!(fakeContext())
      const past = took.filter((x) => !x.endsWith('/a')).map((x) => x.replace(/ .*\//, ' '))
      return { rest: found.find((c) => c.id === b.id)!, past }
    }
    const idle = await of('idle')
    expect(idle.past).toEqual(['idle b', 'idle c'])
    expect(idle.rest).toMatchObject({ unmeasured: true })
    expect(idle.rest.bytes).toBeUndefined()
    const size = await of('size')
    expect(size.past).toEqual(['idle b', 'idle c', 'idle d', 'size b', 'size c'])
    expect(size.rest.unmeasured).toBeUndefined()
    expect(size.rest.bytes).toBeUndefined()
  })

  test('its evidence does not hold its matches', async () => {
    const b = buildRest()
    const text = JSON.stringify((await survey([b.plugin], ctxOf())).candidates)
    expect(text).not.toContain(join(b.http, 'd'))
  })
})

describe('the time limit of discover', () => {
  test('stops discover between two folders once it has passed', async () => {
    const walked: string[] = []
    const b = build('hf', HUGGING_FACE, {
      kit: (kit) => {
        kit.idle = (path) => {
          walked.push(String(path))
          const end = performance.now() + 400
          while (performance.now() < end);
          return { unmeasured: true }
        }
      },
    })
    const s = await survey([{ ...b.plugin, limits: { discover: 300 } }], ctxOf())
    expect(s.candidates).toEqual([])
    expect(s.warnings).toEqual(['hf: discover failed: timed out after 300 ms'])
    // Nothing goes on after the survey has moved on.
    await new Promise((resolve) => setTimeout(resolve, 600))
    expect(walked.length).toBeLessThanOrEqual(1)
  })
})

describe('a command that does not exit', () => {
  test.each([
    ['spawn', 'did not run'],
    ['timeout', 'stopped before it exited (timeout); it may have removed part of the folder'],
    ['signal', 'stopped before it exited (signal); it may have removed part of the folder'],
  ] as const)('%s: %s', async (reason, said) => {
    const b = build('uv', UV, {
      programs: { uv: () => ({ exitCode: 1, neverExited: true, reason }) },
    })
    const { receipt } = await surveyAndClean(b.plugin)
    expect(receipt.steps).toMatchObject([
      {
        result: 'failed',
        error: expect.stringContaining(
          `uv cache prune --cache-dir ${b.folder('cache')} failed (${said})`,
        ),
      },
    ])
  })
})

describe('one folder, two entries', () => {
  const PRUNE = `  - path: cache
    costDescription: re-download
    command: [uv, cache, prune, --cache-dir, '{path}']
    removes: unused
`
  const REMOVE = '  - { path: cache, costDescription: re-download }\n'
  const SAME = `  - { path: again, costDescription: re-download }
`
  const two = (first: string, second: string) => `descriptor: 1
paths:
  cache: { all: ~/.cache/uv }
  again: { all: ~/.cache/uv/ }
candidates:
${first}${second}`

  test.each([
    ['a prune and a removal', PRUNE, REMOVE],
    ['a removal and a prune', REMOVE, PRUNE],
    ['two names for one folder', REMOVE, SAME],
    ['a prune and another name', SAME, PRUNE],
  ])('%s are one refused candidate', async (_, first, second) => {
    for (const programs of [{}, { uv: () => ({}) }]) {
      const b = build('uv', two(first, second), { programs })
      const { survey: s, receipt } = await surveyAndClean(b.plugin, [NO_PRUNE_TOOL])
      expect(s.candidates.map((c) => c.id)).toEqual([`uv:${b.folder('cache')}`])
      expect(s.objections.filter((o) => o.level === 'refuse')).toMatchObject([
        {
          code: DUPLICATE_ENTRY,
          reason: `two entries of uv give ${b.folder('cache')}; which one deletes it is not clear`,
        },
      ])
      expect(receipt.steps).toEqual([])
      expect(b.calls).toEqual([])
      expect(existsSync(b.folder('cache'))).toBe(true)
    }
  })

  test('overlapping globs are refused where they meet, the combined rest included', async () => {
    const b = build(
      'x',
      `descriptor: 1
paths:
  data: { all: ~/.x/data }
candidates:
  - { path: data, glob: '*/', maxEntries: 1, costDescription: re-download }
  - { path: data, glob: 'd*/', costDescription: lost }
`,
      { fill: false },
    )
    const data = b.folder('data')
    for (const n of ['a', 'b', 'c', 'd']) mkdirSync(join(data, n), { recursive: true })
    const { survey: s } = await surveyAndClean(b.plugin)
    expect(s.objections.filter((o) => o.code === DUPLICATE_ENTRY).map((o) => o.candidate)).toEqual([
      `x:${join(data, 'b')}`,
      `x:${join(data, 'd')}`,
    ])
    expect(readdirSync(data).sort()).toEqual(['b', 'c', 'd'])
  })

  test('entries for a folder the checks refuse are listed once, with that reason alone', async () => {
    const b = build(
      'x',
      `descriptor: 1
paths:
  docs: { all: ~/Documents }
candidates:
  - { path: docs, glob: 'a*/', costDescription: re-download }
  - { path: docs, glob: 'b*/', costDescription: re-download }
`,
    )
    const s = await survey([b.plugin], ctxOf())
    expect(s.objections.filter((o) => o.by === 'x').map((o) => o.code)).toEqual([OUTSIDE_ROOTS])
  })

  test('two project entries whose markers are both there are one build folder, by the stricter of each', async () => {
    const CS = "  - { dir: bin, marker: '*.csproj', costDescription: rebuild }\n"
    const FS = "  - { dir: bin, marker: '*.fsproj', costDescription: lost, idleHours: 1000 }\n"
    for (const entries of [CS + FS, FS + CS]) {
      const text = `${DOTNET_PROJECT.slice(0, DOTNET_PROJECT.indexOf('  - { dir: bin'))}${entries}`
      const b = build('dotnet', text)
      const repo = dotnetCheckout(b.home)
      writeFileSync(join(repo, 'App.fsproj'), '<Project/>')
      age(join(repo, 'bin'), 48)
      const ctx = { targets: [repo] }
      const { survey: s } = await surveyAndClean(b.plugin, [], ctx)
      const bin = s.candidates.filter((c) => c.path === join(repo, 'bin'))
      expect(bin).toMatchObject([
        {
          held: true,
          costDescription: 'lost',
          why: expect.stringContaining('(threshold 1000)'),
          evidence: { project: 0 },
        },
      ])
      expect(s.objections.filter((o) => o.code === DUPLICATE_ENTRY)).toEqual([])
      expect(existsSync(join(repo, 'bin'))).toBe(true)
      // With the stricter marker gone, the other entry's rules are the folder's.
      rmSync(join(repo, 'App.fsproj'))
      mkdirSync(b.folder('nuget'))
      await surveyAndClean(b.plugin, [], ctx)
      expect(existsSync(join(repo, 'bin'))).toBe(false)
    }
  })
})

describe('home', () => {
  test("is the run's, over the one the plugin was created with", async () => {
    const other = tempHome()
    cleanups.push(other.cleanup)
    const cache = join(other.home, '.cache', 'uv')
    const b = build('uv', `${UV.replace('processes: [uv]', 'locks: [~/uv.lock]')}`, {
      programs: { uv: () => ({}) },
    })
    mkdirSync(cache, { recursive: true })
    const { survey: s } = await surveyAndClean(b.plugin, [], { home: other.home })
    expect(s.candidates.map((c) => c.path)).toEqual([cache])
    expect(s.selfRoots.uv).toEqual([cache])
    expect(b.calls.map((c) => [c.argv.at(-1), c.opts.cwd])).toEqual([[cache, other.home]])
    writeFileSync(join(other.home, 'uv.lock'), '')
    const locked = await survey([b.plugin], ctxOf({ home: other.home }))
    expect(locked.objections.map((o) => o.reason)).toEqual([
      `the lock ${join(other.home, 'uv.lock')} exists`,
    ])
  })
})

describe('what is walked and asked once', () => {
  /** Every folder `kit.idle` and `kit.size` were asked of. */
  const counting = (seen: string[]) => (kit: Kit) => {
    const { idle, size } = kit
    kit.idle = (path, o) => {
      seen.push(`idle ${String(path)}`)
      return idle(path, o)
    }
    kit.size = (path) => {
      seen.push(`size ${path}`)
      return size(path)
    }
  }

  test('a target inside another, or given twice, is not walked again', async () => {
    const seen: string[] = []
    const b = build('dotnet', DOTNET_PROJECT, { kit: counting(seen) })
    const repo = dotnetCheckout(b.home)
    const lib = join(repo, 'lib')
    const objs = [join(lib, 'web', 'obj'), join(lib, 'obj')]
    for (const obj of objs) {
      mkdirSync(obj, { recursive: true })
      writeFileSync(join(dirname(obj), 'App.csproj'), '<Project/>')
    }
    const targets = [join(lib, 'web'), lib, lib]
    const s = await survey([b.plugin], ctxOf({ targets }))
    expect(s.candidates.map((c) => c.path)).toEqual([b.folder('nuget'), ...objs])
    expect(s.objections).toEqual([])
    expect(seen.filter((x) => x.endsWith('obj'))).toEqual(
      objs.flatMap((obj) => [`idle ${obj}`, `size ${obj}`]),
    )
  })

  test('a worktree inside a checkout is walked once, as its own checkout', async () => {
    const seen: string[] = []
    const b = build('dotnet', DOTNET_PROJECT, { kit: counting(seen) })
    const repo = dotnetCheckout(b.home)
    const tree = join(repo, 'trees', 'b')
    mkdirSync(dirname(tree))
    execFileSync('git', ['-C', repo, 'worktree', 'add', '-q', '-b', 'b', tree])
    writeFileSync(join(tree, 'App.csproj'), '<Project/>')
    mkdirSync(join(tree, 'obj'))
    const s = await survey([b.plugin], ctxOf({ targets: [repo] }))
    expect(seen.filter((x) => x.endsWith(join(tree, 'obj')))).toHaveLength(2)
    expect(s.candidates.find((c) => c.path === join(tree, 'obj'))!.evidence.checkout).toBe(tree)
  })

  /** A `git` first on PATH that logs each call; `lists` counts the `worktree list` calls since the last `reset`. */
  const gitLog = () => {
    const real = execFileSync('which', ['git'], { encoding: 'utf-8' }).trim()
    const shim = tempHome()
    cleanups.push(shim.cleanup)
    const log = join(shim.home, 'log')
    writeFileSync(join(shim.home, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\nexec '${real}' "$@"\n`)
    chmodSync(join(shim.home, 'git'), 0o755)
    return {
      reset: () => {
        writeFileSync(log, '')
        vi.stubEnv('PATH', `${shim.home}${delimiter}${process.env.PATH}`)
      },
      lists: (): number => {
        vi.unstubAllEnvs()
        return readFileSync(log, 'utf-8')
          .split('\n')
          .filter((line) => line.includes('worktree list')).length
      },
    }
  }

  test.skipIf(process.platform === 'win32')(
    "git is asked for a run's checkouts the same number of times whatever it deletes",
    async () => {
      const git = gitLog()
      const lists = async (folders: number): Promise<number> => {
        const b = build(
          'dotnet',
          DOTNET_PROJECT.replace('path: nuget,', "path: nuget, glob: '*/',"),
          {
            fill: false,
          },
        )
        const repo = dotnetCheckout(b.home)
        for (let i = 0; i < folders; i++) {
          mkdirSync(join(b.folder('nuget'), `p${i}`), { recursive: true })
          mkdirSync(join(repo, `p${i}`, 'obj'), { recursive: true })
          writeFileSync(join(repo, `p${i}`, 'P.csproj'), '<Project/>')
        }
        git.reset()
        const { receipt } = await surveyAndClean(b.plugin, [], { targets: [repo] })
        const n = git.lists()
        expect(receipt.steps.map((x) => x.result)).toEqual(Array(2 * folders + 2).fill('ok'))
        return n
      }
      const few = await lists(1)
      expect(few).toBeGreaterThan(0)
      expect(await lists(5)).toBe(few)
    },
  )

  test.skipIf(process.platform === 'win32')(
    'descriptors in one survey ask git for its checkouts no more often than one does',
    async () => {
      const git = gitLog()
      const repo = dotnetCheckout(build('dotnet', DOTNET_PROJECT).home)
      const lists = async (descriptors: number): Promise<number> => {
        const plugins = Array.from(
          { length: descriptors },
          (_, i) => build(`dotnet${i}`, DOTNET_PROJECT).plugin,
        )
        git.reset()
        const s = await survey(plugins, ctxOf({ targets: [repo] }))
        const n = git.lists()
        expect(s.candidates.filter((c) => c.path?.startsWith(repo))).toHaveLength(2)
        return n
      }
      const one = await lists(1)
      expect(one).toBeGreaterThan(0)
      expect(await lists(3)).toBe(one)
    },
  )
})

describe('a folder that goes while it is surveyed', () => {
  test.each(['before', 'while'])('%s it is measured gives no row', async (when) => {
    const b = build('hf', HUGGING_FACE, {
      kit: (kit) => {
        const { idle } = kit
        kit.idle = (path, o) => {
          // Gone right before its own walk, or, as the next match, before its turn.
          const gone = when === 'while' ? String(path) : String(path).replace(/--a$/, '--b')
          rmSync(gone, { recursive: true, force: true })
          return idle(path, o)
        }
      },
    })
    const s = await survey([b.plugin], ctxOf())
    expect(s.candidates.map((c) => c.path)).toEqual(
      when === 'while' ? [] : [join(b.folder('hub'), 'models--a')],
    )
    const repo = dotnetCheckout(b.home)
    const net = build('dotnet', DOTNET_PROJECT, {
      kit: (kit) => {
        const { idle } = kit
        kit.idle = (path, o) => {
          rmSync(String(path), { recursive: true })
          return idle(path, o)
        }
      },
    })
    expect((await survey([net.plugin], ctxOf({ targets: [repo] }))).candidates).toEqual([])
  })
})
