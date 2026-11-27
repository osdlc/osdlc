/** The `toolchains` plugin against real repositories, a fake `rustup` and `node`, and version folders in a temp home. */

import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { delimiter, dirname, join } from 'node:path'

import { which } from '@osdlc/command-seam'
import type { ProcessHolder, ProcessProbe } from '@osdlc/repo-cleaner'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

import {
  clean,
  plan,
  pluginKit,
  survey,
  type Candidate,
  type Ctx,
  type Plugin,
} from '../src/index.ts'
import { attachKit } from '../src/kit.ts'
import { contractSuite, fakeRunner, tempHome } from '../src/testing.ts'
import {
  NO_TARGETS_NOTE,
  UNSEARCHED_NOTE,
  dfMountPoint,
  globalPackages,
  keeps,
  lastUsedMs,
  cappedAtimeNote,
  mountOptionsBy,
  noatimeNote,
  parseMountOutput,
  parseProcMounts,
  rustPin,
  toolchainsDefinition,
  toolchainsPlugin,
  type MountOptions,
} from '../src/toolchains.ts'

const HOST = 'aarch64-apple-darwin'

/** What a fake program prints for one call. */
interface Answer {
  exitCode?: number
  stdout?: string
  stderr?: string
}

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const sh = (cwd: string, args: string[]): void => {
  new Git(cwd, { env: { ...IDENTITY } }).rawChecked(args)
}

const write = (path: string, body: string): void => {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
}

/** A repository at `dir` with `files` committed. */
function repo(dir: string, files: Record<string, string> = {}): string {
  mkdirSync(dir, { recursive: true })
  makeGitFixture({ dir, initialBranch: 'main' })
  for (const [rel, body] of Object.entries(files)) write(join(dir, rel), body)
  sh(dir, ['add', '-A'])
  sh(dir, ['commit', '--allow-empty', '-q', '-m', 'initial'])
  return dir
}

interface Fixture {
  home: string
  dev: string
  rustup: string
  nvm: string
  volta: string
  ctx: Ctx
  calls: ReturnType<typeof fakeRunner>['calls']
  plugin: Plugin
}

const HOUR_MS = 3_600_000

/** A process probe that finds nothing running anywhere, so no test reads this machine's process table. */
const NOTHING_RUNS: ProcessProbe = { alive: () => true, holders: () => [] }

/** One installed version: a folder with a file in its `bin`, last used a year ago. */
const install = (dir: string, name: string): string => {
  const tool = join(dir, name, 'bin', 'tool')
  write(tool, 'x'.repeat(100))
  const old = new Date(Date.now() - 365 * 24 * HOUR_MS)
  utimesSync(tool, old, old)
  return join(dir, name)
}

/** Marks the version `name` in `dir` as run `hoursAgo` hours ago, as running its `bin/tool` would. */
const use = (dir: string, name: string, hoursAgo = 0): void => {
  const tool = join(dir, name, 'bin', 'tool')
  utimesSync(tool, new Date(Date.now() - hoursAgo * HOUR_MS), statSync(tool).mtime)
}

/**
 * A home with `rust` toolchains in `.rustup`, `nvm` versions and `volta`
 * versions, and a `dev` folder of checkouts as the one target. `rustup`
 * answers `answers.rustup` over a default of `stable` with no overrides and
 * removes a toolchain it uninstalls; `node` is on PATH only when given.
 * `mounts` gives each versions folder's mount options, by default none.
 * `probe` answers what works in a folder, by default nothing.
 */
function fixture(
  opts: {
    rust?: string[]
    nvm?: string[]
    volta?: string[]
    rustup?: Record<string, Answer>
    node?: string
    targets?: (dev: string) => string[]
    targetsGiven?: boolean
    idleHours?: number
    env?: Record<string, string> | ((home: string) => Record<string, string>)
    mounts?: MountOptions
    platform?: NodeJS.Platform
    now?: () => Date
    probe?: ProcessProbe
  } = {},
): Fixture {
  const h = tempHome('workstation-cleaner-toolchains-')
  cleanups.push(h.cleanup)
  const home = h.home
  const dev = join(home, 'dev')
  mkdirSync(dev)
  const rustup = join(home, '.rustup', 'toolchains')
  const nvm = join(home, '.nvm', 'versions', 'node')
  const volta = join(home, '.volta', 'tools', 'image', 'node')
  for (const name of opts.rust ?? []) install(rustup, name)
  for (const name of opts.nvm ?? []) install(nvm, name)
  for (const name of opts.volta ?? []) install(volta, name)

  const answers: Record<string, Answer> = {
    default: { stdout: `stable-${HOST} (default)\n` },
    'override list': { stdout: 'no overrides\n' },
    ...opts.rustup,
  }
  const fake = fakeRunner({
    rustup: (argv) => {
      if (argv[0] === 'toolchain' && argv[1] === 'uninstall') {
        rmSync(join(rustup, argv[2]!), { recursive: true, force: true })
        return { stdout: `info: toolchain '${argv[2]}' uninstalled\n` }
      }
      return answers[argv.join(' ')]
    },
    ...(opts.node === undefined ? {} : { node: { '--version': { stdout: `${opts.node}\n` } } }),
  })
  const env = {
    HOME: home,
    PATH: '',
    ...(typeof opts.env === 'function' ? opts.env(home) : opts.env),
  }
  const kit = pluginKit('toolchains', {
    env,
    runner: fake.runner,
    which: fake.which,
    now: opts.now,
    probe: opts.probe ?? NOTHING_RUNS,
  })
  const plugin = toolchainsPlugin(kit, env, {
    idleHours: opts.idleHours,
    mountOptions: opts.mounts ?? (async () => []),
    platform: opts.platform ?? 'linux',
  })
  attachKit(plugin, kit)
  return {
    home,
    dev,
    rustup,
    nvm,
    volta,
    calls: fake.calls,
    plugin,
    ctx: {
      cwd: home,
      targets: opts.targets?.(dev) ?? [dev],
      targetsGiven: opts.targetsGiven ?? true,
      allow: [],
      signal: new AbortController().signal,
    },
  }
}

/** What the plugin proposes, by name, and its refusals. */
async function proposed(fx: Fixture) {
  const s = await survey([fx.plugin], fx.ctx)
  return {
    s,
    names: s.candidates.map((c) => c.name).sort(),
    refused: s.objections.filter((o) => o.level === 'refuse'),
  }
}

const uninstalls = (fx: Fixture): string[][] =>
  fx.calls.filter((c) => c.argv[1] === 'toolchain').map((c) => c.argv)

describe('rustup toolchains', () => {
  test('two checkouts pinning 1.80 and 1.82 keep both and the default, and 1.75 is proposed', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `1.80.0-${HOST}`, `1.82.0-${HOST}`, `stable-${HOST}`],
    })
    repo(join(fx.dev, 'a'), { 'rust-toolchain.toml': '[toolchain]\nchannel = "1.80"\n' })
    repo(join(fx.dev, 'b'), { 'rust-toolchain': '1.82.0\n' })

    const { s, names, refused } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`])
    expect(refused).toEqual([])
    expect(s.warnings).toEqual([])
    expect(s.candidates[0]).toMatchObject({
      id: `rust-toolchain:${join(fx.rustup, `1.75.0-${HOST}`)}`,
      kind: 'rust-toolchain',
      owner: 'toolchains',
      costDescription: 're-download',
      evidence: { tool: 'rustup', name: `1.75.0-${HOST}` },
    })
    expect(s.candidates[0]!.held).toBeUndefined()
    expect(s.candidates[0]!.bytes).toBeGreaterThan(0)
  })

  test('clean uninstalls it with rustup, in the same RUSTUP_HOME, and leaves the rest', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `1.80.0-${HOST}`, `stable-${HOST}`] })
    repo(join(fx.dev, 'a'), { 'rust-toolchain.toml': '[toolchain]\nchannel = "1.80"\n' })

    const receipt = await clean(plan(await survey([fx.plugin], fx.ctx)), [fx.plugin], fx.ctx)
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => [s.result, s.delete])).toEqual([
      [
        'ok',
        `rustup toolchain uninstall 1.75.0-${HOST} removed ${join(fx.rustup, `1.75.0-${HOST}`)}`,
      ],
    ])
    expect(uninstalls(fx)).toEqual([['rustup', 'toolchain', 'uninstall', `1.75.0-${HOST}`]])
    const call = fx.calls.find((c) => c.argv[1] === 'toolchain')!
    expect(call.opts.env).toMatchObject({ RUSTUP_HOME: dirname(fx.rustup) })
    expect(readdirSync(fx.rustup).sort()).toEqual([`1.80.0-${HOST}`, `stable-${HOST}`])
  })

  test('a pin made after the plan keeps the toolchain: it is gone at the re-check and not uninstalled', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`] })
    const a = repo(join(fx.dev, 'a'))
    const p = plan(await survey([fx.plugin], fx.ctx))
    write(join(a, 'rust-toolchain'), '1.75.0\n')

    const receipt = await clean(p, [fx.plugin], fx.ctx)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['gone'])
    expect(uninstalls(fx)).toEqual([])
    expect(existsSync(join(fx.rustup, `1.75.0-${HOST}`))).toBe(true)
  })

  test('a pin below the root, an untracked one, and one in a linked worktree elsewhere each keep theirs', async () => {
    const fx = fixture({
      rust: [`1.70.0-${HOST}`, `1.71.0-${HOST}`, `1.72.0-${HOST}`, `1.73.0-${HOST}`],
    })
    const a = repo(join(fx.dev, 'a'), {
      'crates/x/rust-toolchain.toml': '[toolchain]\nchannel = "1.70.0"\n',
    })
    write(join(a, 'tools', 'rust-toolchain'), '1.71\n')
    const wt = join(fx.home, 'elsewhere', 'wt')
    sh(a, ['worktree', 'add', '-q', wt, '-b', 'topic'])
    write(join(wt, 'rust-toolchain.toml'), '[toolchain]\nchannel = "1.72.0"\n')

    expect((await proposed(fx)).names).toEqual([`1.73.0-${HOST}`])
  })

  test('a repository in an untracked folder has its linked worktree elsewhere read for pins', async () => {
    const fx = fixture({ rust: [`1.70.0-${HOST}`, `1.73.0-${HOST}`] })
    const a = repo(join(fx.dev, 'a'))
    const inner = repo(join(a, 'vendor', 'inner'))
    const wt = join(fx.home, 'elsewhere', 'inner-wt')
    sh(inner, ['worktree', 'add', '-q', wt, '-b', 'topic'])
    write(join(wt, 'rust-toolchain'), '1.70.0\n')

    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.73.0-${HOST}`])
    expect(refused).toEqual([])
  })

  test('a home folder whose .git is broken is walked only in the targets', async () => {
    const fx = fixture({
      rust: [`1.70.0-${HOST}`, `1.71.0-${HOST}`, `1.73.0-${HOST}`],
      targets: (dev) => [join(dev, 'proj')],
    })
    mkdirSync(join(fx.home, '.git'))
    write(join(fx.dev, 'proj', 'x', 'rust-toolchain'), '1.70.0\n')
    write(join(fx.home, 'other', 'rust-toolchain'), '1.71.0\n')

    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.71.0-${HOST}`, `1.73.0-${HOST}`])
    expect(refused).toEqual([])
  })

  test('an empty RUSTUP_HOME, NVM_DIR or VOLTA_HOME counts as unset', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
      nvm: ['v14.21.3'],
      volta: ['16.0.0'],
      env: { RUSTUP_HOME: '', NVM_DIR: '', VOLTA_HOME: '' },
    })
    repo(join(fx.dev, 'a'))
    const { s, names } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`, '16.0.0', 'v14.21.3'])
    expect(s.candidates.map((c) => c.path).sort()).toEqual([
      join(fx.nvm, 'v14.21.3'),
      join(fx.rustup, `1.75.0-${HOST}`),
      join(fx.volta, '16.0.0'),
    ])
  })

  test("idle time is read from the kit's clock", async () => {
    const fx = fixture({ nvm: ['v14.21.3'], now: () => new Date(Date.now() + 48 * HOUR_MS) })
    repo(join(fx.dev, 'a'))
    use(fx.nvm, 'v14.21.3')
    const { s, names } = await proposed(fx)
    expect(names).toEqual(['v14.21.3'])
    expect(s.candidates[0]!.why).toContain('last used 48')
  })

  test('the default, an override and RUSTUP_TOOLCHAIN are kept, and so is a pin by prefix', async () => {
    const fx = fixture({
      rust: [
        `1.74-${HOST}`,
        `1.75.0-${HOST}`,
        `1.76.0-${HOST}`,
        `1.77.0-${HOST}`,
        `1.78.1-${HOST}`,
        `nightly-${HOST}`,
      ],
      rustup: {
        default: { stdout: `1.74-${HOST} (default)\n` },
        'override list': { stdout: `/somewhere/else              1.75.0-${HOST}\n` },
      },
      env: { RUSTUP_TOOLCHAIN: `1.76.0-${HOST}` },
    })
    repo(join(fx.dev, 'a'), { 'rust-toolchain': '1.78\n' })
    expect((await proposed(fx)).names).toEqual([`1.77.0-${HOST}`, `nightly-${HOST}`])
  })

  test('a toolchain rustup links, or one that is not a release, is never proposed', async () => {
    const fx = fixture({ rust: [`stable-${HOST}`, 'my-build'] })
    const outside = join(fx.home, 'build', 'stage1')
    install(dirname(outside), 'stage1')
    symlinkSync(outside, join(fx.rustup, `1.60.0-${HOST}`))
    repo(join(fx.dev, 'a'))
    expect((await proposed(fx)).names).toEqual([])
  })

  test('with rustup not answering, every toolchain is refused, since what is in use cannot be told', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
      rustup: { default: { exitCode: 1, stderr: 'error: could not read settings.toml' } },
    })
    repo(join(fx.dev, 'a'))
    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`, `stable-${HOST}`])
    expect(refused).toHaveLength(2)
    expect(refused[0]).toMatchObject({ by: 'toolchains', code: 'unused-unknown' })
    expect(refused[0]!.reason).toContain('could not read settings.toml')
  })

  test('with no rustup default set, there is no default to keep, and nothing is refused', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `1.80.0-${HOST}`, `stable-${HOST}`],
      rustup: { default: { exitCode: 1, stderr: 'error: no default toolchain is configured' } },
    })
    repo(join(fx.dev, 'a'), { 'rust-toolchain': '1.80\n' })
    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`, `stable-${HOST}`])
    expect(refused).toEqual([])
  })

  test('a target that is a link is followed, and so is the whole repository it leads into', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `1.78.0-${HOST}`, `1.79.0-${HOST}`, `stable-${HOST}`],
      targets: () => [],
    })
    const work = join(fx.home, 'volume', 'dev')
    repo(join(work, 'a'), { 'rust-toolchain': '1.79\n' })
    const link = join(fx.home, 'linked-dev')
    symlinkSync(work, link)
    const mono = repo(join(fx.home, 'mono'), { 'rust-toolchain': '1.78\n', 'apps/web/x': '' })
    const web = join(fx.home, 'web')
    symlinkSync(join(mono, 'apps', 'web'), web)
    fx.ctx = { ...fx.ctx, targets: [link, web] }
    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`])
    expect(refused).toEqual([])
  })

  test('a target that leads nowhere, is missing or is not a folder refuses every toolchain', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`] })
    const gone = join(fx.home, 'gone-dev')
    symlinkSync(join(fx.home, 'unmounted'), gone)
    const file = join(fx.home, 'notes.txt')
    write(file, '')
    for (const target of [gone, join(fx.home, 'missing'), file]) {
      fx.ctx = { ...fx.ctx, targets: [fx.dev, target] }
      const { names, refused } = await proposed(fx)
      expect(names).toEqual([`1.75.0-${HOST}`])
      expect(refused.map((o) => o.reason)).toEqual([
        expect.stringContaining(`the target ${target} could not be read`),
      ])
    }
  })

  test('a folder whose .git is broken is read on its own, to the bottom, and refuses nothing', async () => {
    const pins = ['1.70', '1.71', '1.72', '1.73', '1.74', '1.75']
    const fx = fixture({ rust: [...pins.map((v) => `${v}.0-${HOST}`), `1.60.0-${HOST}`] })
    const a = repo(join(fx.dev, 'a'))
    const old = join(fx.dev, 'old-wt')
    write(join(old, '.git'), `gitdir: ${join(fx.home, 'pruned', '.git', 'worktrees', 'old')}\n`)
    write(join(old, 'rust-toolchain'), '1.70\n')
    write(join(old, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'rust-toolchain'), '1.71\n')
    write(join(old, 'node_modules', 'x', 'rust-toolchain'), '1.60\n')
    repo(join(old, 'vendor', 'lib'), { 'rust-toolchain': '1.72\n' })
    mkdirSync(join(fx.dev, 'empty', '.git'), { recursive: true })
    write(join(fx.dev, 'empty', 'rust-toolchain'), '1.73\n')
    write(join(fx.dev, 'odd', '.git'), 'not a git file\n')
    write(join(fx.dev, 'odd', 'rust-toolchain'), '1.74\n')
    // A worktree its repository still lists, whose own .git names one that is gone.
    const wt = join(fx.home, 'elsewhere', 'wt')
    sh(a, ['worktree', 'add', '-q', wt, '-b', 'topic'])
    write(join(wt, '.git'), `gitdir: ${join(fx.home, 'gone')}\n`)
    write(join(wt, 'crates', 'x', 'rust-toolchain'), '1.75\n')

    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.60.0-${HOST}`])
    expect(refused).toEqual([])
  })

  test('a checkout git cannot read for another reason refuses every toolchain, by name', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`] })
    const a = repo(join(fx.dev, 'a'))
    write(join(a, '.git', 'config'), '[core\n')
    const { refused } = await proposed(fx)
    expect(refused.map((o) => o.reason)).toEqual([
      expect.stringContaining(`the worktrees of ${a} could not be listed`),
    ])
  })

  test('in a home folder that is a repository, what it does not track is searched only in the targets', async () => {
    // Committing the home reads every version's files, which on Linux counts as running them.
    const fx = fixture({
      rust: ['1.70', '1.71', '1.72', '1.73', '1.74', '1.75'].map((v) => `${v}.0-${HOST}`),
      nvm: ['v14.21.3'],
      idleHours: 0,
    })
    repo(fx.home, { 'rust-toolchain': '1.70\n', 'notes/x/rust-toolchain': '1.71\n' })
    repo(join(fx.dev, 'a'), { 'rust-toolchain': '1.72\n' })
    write(join(fx.dev, 'loose', 'rust-toolchain'), '1.73\n')
    write(join(fx.home, 'other', 'rust-toolchain'), '1.74\n')
    write(join(fx.home, 'other', 'package.json'), '{ "volta": broken')
    repo(join(fx.home, 'other', 'b'), { 'rust-toolchain': '1.75\n' })
    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.74.0-${HOST}`, `1.75.0-${HOST}`, 'v14.21.3'])
    expect(refused).toEqual([])

    fx.ctx = { ...fx.ctx, targets: [fx.home] }
    expect((await proposed(fx)).names).toEqual(['v14.21.3'])
  })

  test('every candidate carries a note naming the folders not searched', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`] })
    repo(join(fx.dev, 'a'))
    const { s } = await proposed(fx)
    expect(s.objections.filter((o) => o.level === 'note')).toEqual([
      {
        by: 'toolchains',
        candidate: s.candidates[0]!.id,
        level: 'note',
        code: 'unsearched-folders',
        reason: UNSEARCHED_NOTE,
      },
    ])
  })

  test('the worktrees of a bare repository each keep their pin', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `1.79.0-${HOST}`, `stable-${HOST}`] })
    const src = repo(join(fx.home, 'src'), { 'rust-toolchain': '1.79\n' })
    sh(fx.dev, ['clone', '-q', '--bare', src, 'proj.git'])
    sh(join(fx.dev, 'proj.git'), ['worktree', 'add', '-q', join(fx.dev, 'proj', 'main'), 'main'])
    expect((await proposed(fx)).names).toEqual([`1.75.0-${HOST}`])
  })

  test('a target inside a checkout reads the pins of the whole repository', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `1.79.0-${HOST}`, `stable-${HOST}`],
      targets: (dev) => [join(dev, 'mono', 'apps', 'web')],
    })
    repo(join(fx.dev, 'mono'), { 'rust-toolchain': '1.79\n', 'apps/web/README.md': '' })
    expect((await proposed(fx)).names).toEqual([`1.75.0-${HOST}`])
  })

  test('a repository nested in a checkout, untracked, keeps its pin', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `1.79.0-${HOST}`, `stable-${HOST}`] })
    const app = repo(join(fx.dev, 'app'))
    repo(join(app, 'vendor', 'engine'), { 'rust-toolchain': '1.79\n' })
    expect((await proposed(fx)).names).toEqual([`1.75.0-${HOST}`])
  })

  test('folders too deep to search for checkouts refuse every toolchain', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`] })
    repo(join(fx.dev, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'deep'), {
      'rust-toolchain': '1.75\n',
    })
    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`])
    expect(refused.map((o) => o.reason)).toEqual([expect.stringContaining('levels down')])
  })

  test('with the targets not given, only the run folder in their place, nothing is proposed, rustup is not asked, and detect says why', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`], targetsGiven: false })
    repo(join(fx.dev, 'a'))
    const s = await survey([fx.plugin], fx.ctx)
    expect(s.plugins.map((p) => p.name)).toEqual(['toolchains'])
    expect(s.candidates).toEqual([])
    expect(s.notes).toEqual({ toolchains: NO_TARGETS_NOTE })
    expect(fx.calls).toEqual([])
  })

  test('with no targets nothing is proposed and rustup is not asked', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`], targets: () => [] })
    const s = await survey([fx.plugin], fx.ctx)
    expect(s.plugins.map((p) => p.name)).toEqual(['toolchains'])
    expect(s.candidates).toEqual([])
    expect(s.notes).toEqual({})
    expect(fx.calls).toEqual([])
  })

  test('cargo +nightly with no pin file: a nightly run an hour ago is kept, one run two days ago is proposed', async () => {
    const fx = fixture({
      rust: [`stable-${HOST}`, `nightly-${HOST}`, `nightly-2026-01-01-${HOST}`],
    })
    repo(join(fx.dev, 'a'))
    use(fx.rustup, `nightly-${HOST}`, 1)
    use(fx.rustup, `nightly-2026-01-01-${HOST}`, 48)

    const { s, names, refused } = await proposed(fx)
    expect(names).toEqual([`nightly-2026-01-01-${HOST}`])
    expect(refused).toEqual([])
    expect(s.candidates[0]!.why).toMatch(/; last used 4[78](\.\d)? hours ago \(threshold 24\)$/)
    expect(s.candidates[0]!.evidence).toEqual({
      kind: 'toolchain',
      tool: 'rustup',
      name: `nightly-2026-01-01-${HOST}`,
      path: join(fx.rustup, `nightly-2026-01-01-${HOST}`),
    })
  })

  test('idleHours sets how recent a use keeps a toolchain, and 0 keeps none by use', async () => {
    const two = fixture({ rust: [`stable-${HOST}`, `nightly-${HOST}`], idleHours: 3 })
    repo(join(two.dev, 'a'))
    use(two.rustup, `nightly-${HOST}`, 2)
    expect((await proposed(two)).names).toEqual([])

    const one = fixture({ rust: [`stable-${HOST}`, `nightly-${HOST}`], idleHours: 1 })
    repo(join(one.dev, 'a'))
    use(one.rustup, `nightly-${HOST}`, 2)
    expect((await proposed(one)).names).toEqual([`nightly-${HOST}`])

    const zero = fixture({ rust: [`stable-${HOST}`, `nightly-${HOST}`], idleHours: 0 })
    repo(join(zero.dev, 'a'))
    use(zero.rustup, `nightly-${HOST}`)
    expect((await proposed(zero)).names).toEqual([`nightly-${HOST}`])
  })

  test('a toolchain with no bin folder is refused, since when it was last used cannot be told', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`] })
    repo(join(fx.dev, 'a'))
    rmSync(join(fx.rustup, `1.75.0-${HOST}`, 'bin'), { recursive: true })
    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`])
    expect(refused).toHaveLength(1)
    expect(refused[0]).toMatchObject({ code: 'unused-unknown' })
    expect(refused[0]!.reason).toMatch(/bin folder could not be read or holds no file$/)
  })

  test('a toolchain run after the plan is kept: it is gone at the re-check and not uninstalled', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`] })
    repo(join(fx.dev, 'a'))
    const p = plan(await survey([fx.plugin], fx.ctx))
    expect(p.candidates.map((c) => c.name)).toEqual([`1.75.0-${HOST}`])
    use(fx.rustup, `1.75.0-${HOST}`)

    const receipt = await clean(p, [fx.plugin], fx.ctx)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['gone'])
    expect(uninstalls(fx)).toEqual([])
  })

  test('rustup missing from PATH, and no nvm or Volta: not detected', async () => {
    const fx = fixture()
    expect((await survey([fx.plugin], fx.ctx)).plugins).toEqual([])
  })
})

describe('nvm and Volta Node versions', () => {
  test('pins by prefix, package.json volta, the defaults and the node on PATH are kept', async () => {
    const fx = fixture({
      nvm: ['v14.21.3', 'v16.20.0', 'v18.17.0', 'v18.19.1', 'v20.11.0'],
      volta: ['18.17.0', '21.0.0', '22.1.0'],
      node: 'v16.20.0',
    })
    write(join(fx.home, '.nvm', 'alias', 'default'), '20\n')
    write(
      join(fx.home, '.volta', 'tools', 'user', 'platform.json'),
      JSON.stringify({ node: { runtime: '22.1.0', npm: null } }),
    )
    repo(join(fx.dev, 'a'), { '.nvmrc': 'v18 # the LTS we ship on\n' })
    repo(join(fx.dev, 'b'), {
      'package.json': JSON.stringify({ name: 'b', volta: { node: '21.0.0' } }),
    })
    const { s, names, refused } = await proposed(fx)
    expect(names).toEqual(['v14.21.3'])
    expect(refused).toEqual([])
    expect(s.candidates[0]).toMatchObject({
      id: `node-version:${join(fx.nvm, 'v14.21.3')}`,
      kind: 'node-version',
      costDescription: 're-download',
    })
  })

  test('an nvm or Volta version run within idleHours is kept, through a link in bin as well', async () => {
    const fx = fixture({ nvm: ['v14.21.3', 'v16.20.0'], volta: ['18.17.0', '21.0.0'] })
    repo(join(fx.dev, 'a'))
    use(fx.nvm, 'v16.20.0', 2)
    const cli = join(fx.volta, '21.0.0', 'lib', 'npm-cli.js')
    write(cli, '')
    symlinkSync(cli, join(fx.volta, '21.0.0', 'bin', 'npm'))
    expect((await proposed(fx)).names).toEqual(['18.17.0', 'v14.21.3'])
  })

  test('clean removes the version folders through the kit', async () => {
    const fx = fixture({ nvm: ['v14.21.3', 'v18.17.0'], volta: ['16.0.0', '18.17.0'] })
    repo(join(fx.dev, 'a'), { '.node-version': '18.17.0\n' })
    const receipt = await clean(plan(await survey([fx.plugin], fx.ctx)), [fx.plugin], fx.ctx)
    expect(receipt.status).toBe('complete')
    expect(receipt.steps.map((s) => s.result)).toEqual(['ok', 'ok'])
    expect(readdirSync(fx.nvm)).toEqual(['v18.17.0'])
    expect(readdirSync(fx.volta)).toEqual(['18.17.0'])
  })

  test("lts/* is followed through nvm's aliases; with no alias for it, every version is refused", async () => {
    const fx = fixture({ nvm: ['v18.17.0', 'v20.11.0'] })
    repo(join(fx.dev, 'a'), { '.nvmrc': 'lts/*\n' })

    const unknown = await proposed(fx)
    expect(unknown.names).toEqual(['v18.17.0', 'v20.11.0'])
    expect(unknown.refused.map((o) => o.reason)).toEqual([
      expect.stringContaining('asks for node "lts/*"'),
      expect.stringContaining('asks for node "lts/*"'),
    ])

    write(join(fx.home, '.nvm', 'alias', 'lts', '*'), 'lts/iron\n')
    write(join(fx.home, '.nvm', 'alias', 'lts', 'iron'), 'v20.11.0\n')
    const known = await proposed(fx)
    expect(known.names).toEqual(['v18.17.0'])
    expect(known.refused).toEqual([])
  })

  test("nvm's `node` names the newest version nvm has, not Volta's", async () => {
    const fx = fixture({ nvm: ['v18.0.0', 'v20.1.0'], volta: ['22.0.0'] })
    repo(join(fx.dev, 'a'), { '.nvmrc': 'node\n' })
    expect((await proposed(fx)).names).toEqual(['22.0.0', 'v18.0.0'])
  })

  test("nvm's default naming no version refuses nvm's versions, not Volta's", async () => {
    const fx = fixture({ nvm: ['v18.17.0'], volta: ['16.0.0'] })
    write(join(fx.home, '.nvm', 'alias', 'default'), 'lts/hydrogen\n')
    repo(join(fx.dev, 'a'))
    const { names, refused } = await proposed(fx)
    expect(names).toEqual(['16.0.0', 'v18.17.0'])
    expect(refused.map((o) => o.reason)).toEqual([
      expect.stringContaining("nvm's default alias names no version"),
    ])
  })

  test("a package.json that is not JSON and names volta refuses Volta's versions, not nvm's", async () => {
    const fx = fixture({ nvm: ['v18.17.0'], volta: ['16.0.0'] })
    repo(join(fx.dev, 'a'), { 'package.json': '{ "volta": not json' })
    const { names, refused } = await proposed(fx)
    expect(names).toEqual(['16.0.0', 'v18.17.0'])
    expect(refused).toEqual([
      expect.objectContaining({
        candidate: `node-version:${join(fx.volta, '16.0.0')}`,
        reason: expect.stringMatching(/package\.json is not JSON$/),
      }),
    ])
  })

  test('a package.json that is not JSON and names no volta refuses nothing; a BOM is read past; extends is followed', async () => {
    const fx = fixture({ nvm: ['v18.17.0'], volta: ['16.0.0', '20.0.0', '21.0.0'] })
    repo(join(fx.dev, 'a'), {
      'tests/fixtures/bad/package.json': '{ invalid',
      'template/package.json': '{ "name": {{name}} }',
      'bom/package.json': `\uFEFF${JSON.stringify({ volta: { node: '20.0.0' } })}`,
      'child/package.json': JSON.stringify({ volta: { extends: '../base.json' } }),
      'base.json': JSON.stringify({ volta: { node: '21.0.0', extends: 'child/package.json' } }),
    })
    const { names, refused } = await proposed(fx)
    expect(names).toEqual(['16.0.0', 'v18.17.0'])
    expect(refused).toEqual([])
  })

  /** A global package installed into the version folder `dir`. */
  const addGlobal = (dir: string, name: string): void =>
    write(join(dir, 'lib', 'node_modules', name, 'package.json'), '{}')

  test('a Node version holding global packages is lost: held, and kept by clean unless picked and allowed', async () => {
    const fx = fixture({ nvm: ['v14.21.3', 'v16.20.0'], volta: ['18.0.0'] })
    repo(join(fx.dev, 'a'))
    for (const name of ['npm', 'corepack']) addGlobal(join(fx.nvm, 'v14.21.3'), name)
    for (const name of ['npm', 'some-cli', '@org/tool']) addGlobal(join(fx.nvm, 'v16.20.0'), name)
    addGlobal(join(fx.volta, '18.0.0'), 'other-cli')
    const { s } = await proposed(fx)
    const byName = new Map(s.candidates.map((c) => [c.name, c]))
    expect(byName.get('v14.21.3')).toMatchObject({ costDescription: 're-download' })
    expect(byName.get('v16.20.0')).toMatchObject({
      costDescription: 'lost',
      held: true,
      evidence: { globalPackages: ['@org/tool', 'some-cli'] },
    })
    expect(byName.get('v16.20.0')!.why).toMatch(/global packages .*: @org\/tool, some-cli$/)
    expect(byName.get('18.0.0')).toMatchObject({ costDescription: 'lost', held: true })

    const receipt = await clean(plan(s), [fx.plugin], fx.ctx)
    expect(receipt.steps.map((x) => x.id)).toEqual([byName.get('v14.21.3')!.id])
    expect(readdirSync(fx.nvm)).toEqual(['v16.20.0'])
    expect(readdirSync(fx.volta)).toEqual(['18.0.0'])

    const ctx = { ...fx.ctx, allow: ['discard-user-data'] }
    const opts = { pick: [byName.get('18.0.0')!.id], allow: ctx.allow }
    await clean(plan(await survey([fx.plugin], ctx), opts), [fx.plugin], ctx)
    expect(readdirSync(fx.nvm)).toEqual(['v16.20.0'])
    expect(readdirSync(fx.volta)).toEqual([])
  })

  test('a global package installed after the plan, or right before the delete, keeps the version', async () => {
    const fx = fixture({ nvm: ['v14.21.3', 'v16.20.0'] })
    repo(join(fx.dev, 'a'))
    const first = join(fx.nvm, 'v14.21.3')
    const second = join(fx.nvm, 'v16.20.0')
    const s = await survey([fx.plugin], fx.ctx)
    addGlobal(first, 'some-cli')
    const late: Plugin = {
      name: 'late',
      detect: () => true,
      prepare: (c) => addGlobal(c.path!, 'some-cli'),
    }
    const receipt = await clean(plan(s), [fx.plugin, late], fx.ctx)
    expect(receipt.dropped).toEqual([
      { id: `node-version:${first}`, reason: 'not-allowed', detail: expect.any(String) },
    ])
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([
      [`node-version:${second}`, 'failed'],
    ])
    expect(receipt.steps[0]!.error).toMatch(/changed: .*some-cli$/)
    expect(readdirSync(fx.nvm)).toEqual(['v14.21.3', 'v16.20.0'])
  })

  test('global packages that cannot be listed are null; a folder of none is empty', () => {
    const h = tempHome('workstation-cleaner-toolchains-')
    cleanups.push(h.cleanup)
    expect(globalPackages(h.home)).toEqual([])
    write(join(h.home, 'lib', 'node_modules'), 'not a folder')
    expect(globalPackages(h.home)).toBeNull()
  })

  test("Volta's shim on PATH is never run: the run folder's package.json pin, Volta's default and the next node are kept", async () => {
    const h = tempHome('workstation-cleaner-toolchains-')
    cleanups.push(h.cleanup)
    const ran = join(h.home, 'ran')
    const program = (path: string, body: string): void => {
      write(path, `#!/bin/sh\n${body}\n`)
      chmodSync(path, 0o755)
    }
    // Volta's own, and another folder's link to the shim, which installs what it lacks when run.
    program(join(h.home, '.volta', 'bin', 'volta-shim'), `echo shim >> '${ran}'`)
    symlinkSync('volta-shim', join(h.home, '.volta', 'bin', 'node'))
    mkdirSync(join(h.home, 'links'))
    symlinkSync(join(h.home, '.volta', 'bin', 'volta-shim'), join(h.home, 'links', 'node'))
    program(join(h.home, 'other', 'node'), `echo other >> '${ran}'; echo v21.0.0`)
    const volta = join(h.home, '.volta', 'tools', 'image', 'node')
    for (const v of ['18.17.0', '20.0.0', '21.0.0', '22.1.0']) install(volta, v)
    write(
      join(h.home, '.volta', 'tools', 'user', 'platform.json'),
      JSON.stringify({ node: { runtime: '20.0.0' } }),
    )
    const dev = repo(join(h.home, 'dev'))
    const cwd = join(h.home, 'proj', 'sub')
    mkdirSync(cwd, { recursive: true })
    write(join(dirname(cwd), 'package.json'), JSON.stringify({ volta: { node: '22.1.0' } }))

    const names = async (dirs: string[]): Promise<unknown[]> => {
      const env = { HOME: h.home, PATH: dirs.map((d) => join(h.home, d)).join(delimiter) }
      const kit = pluginKit('toolchains', { env, probe: NOTHING_RUNS })
      const plugin = toolchainsPlugin(kit, env, {
        mountOptions: async () => [],
        platform: 'linux',
      })
      attachKit(plugin, kit)
      const s = await survey([plugin], { cwd, targets: [dev], targetsGiven: true, allow: [] })
      expect(s.objections.filter((o) => o.level === 'refuse')).toEqual([])
      return s.candidates.map((c) => c.name)
    }
    expect(await names(['.volta/bin', 'links'])).toEqual(['18.17.0', '21.0.0'])
    expect(existsSync(ran)).toBe(false)
    expect(await names(['.volta/bin', 'links', 'other'])).toEqual(['18.17.0'])
    expect(readFileSync(ran, 'utf8')).toBe('other\n')
  })
})

describe('a versions folder on a noatime volume', () => {
  /** Mount options by tool: rustup's, nvm's and Volta's versions folders; `rw` when not given. */
  const mounts =
    (by: { rustup?: string[] | null; nvm?: string[] | null }): MountOptions =>
    async (path) =>
      path.endsWith(join('.rustup', 'toolchains'))
        ? by.rustup === undefined
          ? ['rw']
          : by.rustup
        : path.endsWith(join('.nvm', 'versions', 'node'))
          ? by.nvm === undefined
            ? ['rw']
            : by.nvm
          : ['rw']

  test('noatime: none of its versions is proposed, rustup is not asked, and detect says why', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
      nvm: ['v14.21.3'],
      mounts: mounts({ rustup: ['rw', 'nosuid', 'noatime'] }),
    })
    repo(join(fx.dev, 'a'))
    const { s, names, refused } = await proposed(fx)
    expect(names).toEqual(['v14.21.3'])
    expect(refused).toEqual([])
    expect(s.notes).toEqual({
      toolchains: `${fx.rustup} is on a volume mounted noatime, so last use can't be measured and every version in it is kept`,
    })
    expect(fx.calls.filter((c) => c.argv[0] === 'rustup')).toEqual([])
  })

  test('relatime, or nodiratime: access times are trusted, and there is no note', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
      nvm: ['v14.21.3'],
      mounts: mounts({ rustup: ['rw', 'relatime'], nvm: ['rw', 'nodiratime'] }),
    })
    repo(join(fx.dev, 'a'))
    const { s, names } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`, 'v14.21.3'])
    expect(s.notes).toEqual({})
  })

  test('relatime: a version is kept for a day past the threshold, since its access time may lag that much', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
      mounts: mounts({ rustup: ['rw', 'relatime'] }),
    })
    repo(join(fx.dev, 'a'))
    use(fx.rustup, `1.75.0-${HOST}`, 25)
    expect((await proposed(fx)).names).toEqual([])
    use(fx.rustup, `1.75.0-${HOST}`, 49)
    const { s, names } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`])
    expect(s.candidates[0]!.why).toContain('(threshold 24, plus 24 for a relatime mount)')
  })

  test('options that cannot be read, or a lookup that throws: access times are trusted, and there is no note', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
      nvm: ['v14.21.3'],
      mounts: async (path) => {
        if (path.endsWith('node')) throw new Error('mount table unreadable')
        return null
      },
    })
    repo(join(fx.dev, 'a'))
    const { s, names } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`, 'v14.21.3'])
    expect(s.notes).toEqual({})
  })

  test('every folder noatime: nothing is proposed, nothing is asked, and the note names each', async () => {
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
      volta: ['16.0.0'],
      mounts: async () => ['noatime'],
    })
    repo(join(fx.dev, 'a'))
    const { s, names } = await proposed(fx)
    expect(names).toEqual([])
    expect(s.notes).toEqual({
      toolchains: `${noatimeNote(fx.rustup)}; ${noatimeNote(fx.volta)}`,
    })
    expect(fx.calls).toEqual([])
  })

  test('macOS: access times cannot show a recent use, so nothing is proposed unless strictatime', async () => {
    for (const options of [['local', 'journaled', 'nobrowse'], null]) {
      const fx = fixture({
        rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
        nvm: ['v14.21.3'],
        platform: 'darwin',
        mounts: async () => options,
      })
      repo(join(fx.dev, 'a'))
      const { s, names } = await proposed(fx)
      expect(names).toEqual([])
      expect(s.notes).toEqual({
        toolchains: `${cappedAtimeNote(fx.rustup)}; ${cappedAtimeNote(fx.nvm)}`,
      })
      expect(fx.calls).toEqual([])
    }
    const fx = fixture({
      rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
      platform: 'darwin',
      mounts: async () => ['local', 'strictatime'],
    })
    repo(join(fx.dev, 'a'))
    const { s, names } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`])
    expect(s.notes).toEqual({})
  })

  test('a version planned on Linux is not removed once the folder reads as macOS', async () => {
    const fx = fixture({ nvm: ['v14.21.3'] })
    repo(join(fx.dev, 'a'))
    const p = plan(await survey([fx.plugin], fx.ctx))
    expect(p.candidates.map((c) => c.name)).toEqual(['v14.21.3'])
    const env = { HOME: fx.home, PATH: '' }
    const kit = pluginKit('toolchains', { env, probe: NOTHING_RUNS })
    const mac = toolchainsPlugin(kit, env, {
      mountOptions: async () => ['local'],
      platform: 'darwin',
    })
    attachKit(mac, kit)
    const receipt = await clean(p, [mac], fx.ctx)
    expect(receipt.steps).toEqual([])
    expect(readdirSync(fx.nvm)).toEqual(['v14.21.3'])
  })

  test('a version planned before its folder turned noatime is not removed', async () => {
    let noatime = false
    const fx = fixture({
      nvm: ['v14.21.3', 'v18.17.0'],
      mounts: async () => (noatime ? ['noatime'] : ['rw']),
    })
    repo(join(fx.dev, 'a'), { '.nvmrc': '18\n' })
    const p = plan(await survey([fx.plugin], fx.ctx))
    expect(p.candidates.map((c) => c.name)).toEqual(['v14.21.3'])
    noatime = true
    const receipt = await clean(p, [fx.plugin], fx.ctx)
    expect(receipt.steps).toEqual([])
    expect(receipt.dropped.map((d) => d.reason)).toEqual(['gone'])
    expect(readdirSync(fx.nvm).sort()).toEqual(['v14.21.3', 'v18.17.0'])
  })
})

describe('reading mount options', () => {
  const signal = new AbortController().signal
  const ctx = { signal } as Ctx

  test("df's mount point, spaces and all", () => {
    expect(
      dfMountPoint(
        'Filesystem   512-blocks       Used  Available Capacity  Mounted on\n' +
          '/dev/disk3s5 3896910480 2220769152 1605425008    59%    /System/Volumes/Data\n',
      ),
    ).toBe('/System/Volumes/Data')
    expect(
      dfMountPoint(
        'Filesystem 1024-blocks Used Available Capacity Mounted on\n/dev/sdb1 100 50 50 50% /mnt/my disk\n',
      ),
    ).toBe('/mnt/my disk')
    expect(dfMountPoint('')).toBeNull()
  })

  test("macOS's mount output and Linux's /proc/self/mounts", () => {
    expect(
      parseMountOutput(
        '/dev/disk3s5 on /System/Volumes/Data (apfs, local, journaled, nobrowse, protect, root data)\n' +
          'map auto_home on /System/Volumes/Data/home (autofs, automounted, nobrowse)\n' +
          '/dev/disk4s1 on /Volumes/Fast Disk (apfs, local, nodev, nosuid, journaled, noatime)\n',
      ),
    ).toEqual([
      {
        on: '/System/Volumes/Data',
        options: ['local', 'journaled', 'nobrowse', 'protect', 'root data'],
      },
      { on: '/System/Volumes/Data/home', options: ['automounted', 'nobrowse'] },
      {
        on: '/Volumes/Fast Disk',
        options: ['local', 'nodev', 'nosuid', 'journaled', 'noatime'],
      },
    ])
    expect(
      parseProcMounts(
        '/dev/sda1 / ext4 rw,relatime 0 0\n/dev/sdb1 /mnt/my\\040disk ext4 rw,noatime 0 0\n',
      ),
    ).toEqual([
      { on: '/', options: ['rw', 'relatime'] },
      { on: '/mnt/my disk', options: ['rw', 'noatime'] },
    ])
  })

  test('on macOS, the last mount of the name df gives; null when df or mount fails, or off macOS and Linux', async () => {
    const fake = (df: Answer, mount: Answer) => {
      const f = fakeRunner({ df: () => df, mount: () => mount })
      return pluginKit('toolchains', { env: {}, runner: f.runner, which: f.which })
    }
    const df = {
      stdout:
        'Filesystem 512-blocks Used Available Capacity Mounted on\n/dev/disk4s1 10 5 5 50% /Volumes/Fast\n',
    }
    const table = {
      stdout:
        '/dev/disk3s5 on /System/Volumes/Data (apfs, local)\n' +
        '/dev/disk4s1 on /Volumes/Fast (apfs, local)\n' +
        '/dev/disk4s1 on /Volumes/Fast (apfs, local, noatime)\n',
    }
    expect(await mountOptionsBy(fake(df, table), 'darwin')('/Volumes/Fast/x', ctx)).toEqual([
      'local',
      'noatime',
    ])
    expect(
      await mountOptionsBy(fake({ exitCode: 1 }, table), 'darwin')('/Volumes/Fast/x', ctx),
    ).toBeNull()
    expect(
      await mountOptionsBy(fake(df, { exitCode: 1 }), 'darwin')('/Volumes/Fast/x', ctx),
    ).toBeNull()
    expect(await mountOptionsBy(fake(df, table), 'win32')('C:\\x', ctx)).toBeNull()
  })

  test('the definition reads idleHours from its settings and asks df for each versions folder, on this platform', async () => {
    const h = tempHome('workstation-cleaner-toolchains-')
    cleanups.push(h.cleanup)
    const nvm = join(h.home, '.nvm', 'versions', 'node')
    install(nvm, 'v14.21.3')
    use(nvm, 'v14.21.3', 2)
    const dev = repo(join(h.home, 'dev', 'a'))
    const f = fakeRunner({ df: () => ({ exitCode: 1 }) })
    const env = { HOME: h.home, PATH: '' }
    const plugin = toolchainsDefinition.create({
      settings: { idleHours: 1 },
      env,
      kit: pluginKit('toolchains', { env, runner: f.runner, which: f.which, probe: NOTHING_RUNS }),
    })
    const s = await survey([plugin], {
      cwd: h.home,
      targets: [dev],
      targetsGiven: true,
      allow: [],
    })
    // With df failing, macOS's access times are not trusted, and those elsewhere are.
    if (process.platform === 'darwin') {
      expect(s.candidates).toEqual([])
      expect(s.notes).toEqual({ toolchains: cappedAtimeNote(nvm) })
    } else {
      expect(s.candidates.map((c) => c.name)).toEqual(['v14.21.3'])
      expect(s.notes).toEqual({})
    }
    expect(f.calls.map((c) => c.argv)).toContainEqual(['df', '-P', nvm])
  })
})

describe('a clean of several versions', () => {
  /** Puts a `git` first on PATH that logs each call, and returns how many `ls-files` it has had. */
  function countGit(home: string): () => number {
    const log = join(home, 'git.log')
    const bin = join(home, 'git-bin')
    write(join(bin, 'git'), `#!/bin/sh\necho "$*" >> '${log}'\nexec '${which('git')}' "$@"\n`)
    chmodSync(join(bin, 'git'), 0o755)
    vi.stubEnv('PATH', `${bin}${delimiter}${process.env.PATH}`)
    cleanups.push(() => void vi.unstubAllEnvs())
    return () =>
      existsSync(log) ? (readFileSync(log, 'utf8').match(/ls-files -z/g)?.length ?? 0) : 0
  }

  test('with every version used lately, the checkouts are not listed', async () => {
    const fx = fixture({ nvm: ['v14.21.3', 'v16.20.0'] })
    repo(join(fx.dev, 'a'))
    use(fx.nvm, 'v14.21.3', 1)
    use(fx.nvm, 'v16.20.0', 2)
    const calls = countGit(fx.home)
    expect((await proposed(fx)).names).toEqual([])
    expect(calls()).toBe(0)
  })

  test('lists the checkouts once, at the re-check, not again for each delete', async () => {
    const fx = fixture({ nvm: ['v12.0.0', 'v14.21.3', 'v16.20.0', 'v18.17.0'] })
    repo(join(fx.dev, 'a'), { '.nvmrc': '18\n' })
    const p = plan(await survey([fx.plugin], fx.ctx))
    const calls = countGit(fx.home)
    await survey([fx.plugin], fx.ctx)
    const one = calls()
    expect(one).toBeGreaterThan(0)

    const receipt = await clean(p, [fx.plugin], fx.ctx)
    expect(receipt.steps.map((s) => s.result)).toEqual(['ok', 'ok', 'ok'])
    expect(calls()).toBe(2 * one)
  })

  test('a pin made between two deletes, in a checkout known by then, keeps its version', async () => {
    const fx = fixture({ nvm: ['v14.21.3', 'v16.20.0'] })
    const a = repo(join(fx.dev, 'a'))
    const pinner: Plugin = {
      name: 'pinner',
      detect: () => true,
      deleted: () => write(join(a, '.nvmrc'), '16\n'),
    }
    const p = plan(await survey([fx.plugin, pinner], fx.ctx))
    const receipt = await clean(p, [fx.plugin, pinner], fx.ctx)
    expect(receipt.steps.map((s) => [s.result, s.error ?? null])).toEqual([
      ['ok', null],
      ['failed', expect.stringContaining('is no longer a candidate')],
    ])
    expect(readdirSync(fx.nvm)).toEqual(['v16.20.0'])
  })

  test('a minute after the listing, a delete lists the checkouts again', async () => {
    const fx = fixture({ nvm: ['v14.21.3'] })
    repo(join(fx.dev, 'a'))
    const s = await survey([fx.plugin], fx.ctx)
    const c = s.candidates[0] as Candidate
    repo(join(fx.dev, 'b'), { '.nvmrc': '14\n' })
    const now = Date.now()
    const clock = vi.spyOn(Date, 'now').mockReturnValue(now + 61_000)
    cleanups.push(() => clock.mockRestore())
    await expect(fx.plugin.delete!(c, fx.ctx)).rejects.toThrow(/is no longer a candidate/)
    // A clock that went back is not taken for a fresh listing either.
    clock.mockReturnValue(now - 1000)
    rmSync(join(fx.dev, 'b'), { recursive: true })
    repo(join(fx.dev, 'c'), { '.nvmrc': '14\n' })
    await expect(fx.plugin.delete!(c, fx.ctx)).rejects.toThrow(/is no longer a candidate/)
  })
})

describe('a process working in a version folder', () => {
  const server = { pid: 42, command: 'node' } as ProcessHolder

  /** A fixture whose probe finds `holders` working in `busy.path`, or throws `busy.error`; nothing until either is set. */
  function busyFixture(opts: Parameters<typeof fixture>[0]) {
    const busy: { path?: string | undefined; holders?: ProcessHolder[]; error?: Error } = {}
    const fx = fixture({
      ...opts,
      probe: {
        alive: () => true,
        holders: (p) => {
          if (busy.error !== undefined) throw busy.error
          return p === busy.path ? (busy.holders ?? [server]) : []
        },
      },
    })
    return { fx, busy }
  }

  test('refuses that version, rustup or nvm, and clean leaves it', async () => {
    const { fx, busy } = busyFixture({
      rust: [`1.75.0-${HOST}`, `1.76.0-${HOST}`, `stable-${HOST}`],
      nvm: ['v14.21.3', 'v16.20.0'],
    })
    repo(join(fx.dev, 'a'), { '.nvmrc': '16\n', 'rust-toolchain': '1.76.0\n' })
    const rust = join(fx.rustup, `1.75.0-${HOST}`)
    const node = join(fx.nvm, 'v14.21.3')
    for (const [path, id] of [
      [rust, `rust-toolchain:${rust}`],
      [node, `node-version:${node}`],
    ] as const) {
      busy.path = path
      const { names, refused } = await proposed(fx)
      expect(names).toEqual([`1.75.0-${HOST}`, 'v14.21.3'])
      expect(refused).toEqual([
        expect.objectContaining({
          candidate: id,
          code: 'live-process',
          reason: `running in ${path}: node (pid 42)`,
        }),
      ])
    }
    busy.path = node
    const receipt = await clean(plan(await survey([fx.plugin], fx.ctx)), [fx.plugin], fx.ctx)
    expect(receipt.steps.map((x) => [x.id, x.result])).toEqual([[`rust-toolchain:${rust}`, 'ok']])
    expect(readdirSync(fx.nvm).sort()).toEqual(['v14.21.3', 'v16.20.0'])
  })

  test('an idle shell in it refuses nothing; a process table that cannot be read refuses every version', async () => {
    const { fx, busy } = busyFixture({
      rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
      nvm: ['v14.21.3'],
    })
    repo(join(fx.dev, 'a'))
    busy.path = join(fx.nvm, 'v14.21.3')
    busy.holders = [{ pid: 7, command: 'zsh', hasChildren: false }]
    expect((await proposed(fx)).refused).toEqual([])
    busy.error = new Error('lsof did not run')
    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`, 'v14.21.3'])
    expect(refused.map((o) => [o.code, o.reason])).toEqual([
      ['process-table-unreadable', 'process table unreadable: lsof did not run'],
      ['process-table-unreadable', 'process table unreadable: lsof did not run'],
    ])
  })

  test('one that starts after the plan, or right before the delete, keeps the version', async () => {
    const { fx, busy } = busyFixture({
      rust: [`1.75.0-${HOST}`, `stable-${HOST}`],
      nvm: ['v14.21.3'],
    })
    repo(join(fx.dev, 'a'))
    const rust = join(fx.rustup, `1.75.0-${HOST}`)
    const node = join(fx.nvm, 'v14.21.3')
    const p = plan(await survey([fx.plugin], fx.ctx))
    expect(p.candidates.map((c) => c.path).sort()).toEqual([rust, node].sort())
    busy.path = node
    const late: Plugin = {
      name: 'late',
      detect: () => true,
      prepare: (c) => void (busy.path = c.path),
    }
    const receipt = await clean(p, [fx.plugin, late], fx.ctx)
    expect(receipt.dropped).toEqual([
      {
        id: `node-version:${node}`,
        reason: 'blocked',
        detail: `toolchains: running in ${node}: node (pid 42)`,
      },
    ])
    expect(receipt.steps.map((x) => [x.id, x.result, x.error])).toEqual([
      [`rust-toolchain:${rust}`, 'failed', `${rust} is refused: running in ${rust}: node (pid 42)`],
    ])
    expect(uninstalls(fx)).toEqual([])
    expect(existsSync(rust) && existsSync(node)).toBe(true)
  })
})

describe('the contract', () => {
  test('passes the contract suite', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`], nvm: ['v14.21.3'] })
    repo(join(fx.dev, 'a'))
    expect(await contractSuite(fx.plugin, fx.ctx)).toEqual([])
    expect(uninstalls(fx)).toEqual([])
  })

  test('a toolchain folder swapped for a link to a folder outside is not uninstalled', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`] })
    repo(join(fx.dev, 'a'))
    const p = plan(await survey([fx.plugin], fx.ctx))
    const tc = join(fx.rustup, `1.75.0-${HOST}`)
    const outside = install(join(fx.home, 'outside'), 'kept')
    rmSync(tc, { recursive: true })
    symlinkSync(outside, tc)

    const receipt = await clean(p, [fx.plugin], fx.ctx)
    expect(receipt.steps.filter((s) => s.result === 'ok')).toEqual([])
    expect(uninstalls(fx)).toEqual([])
    expect(readdirSync(join(outside, 'bin'))).toEqual(['tool'])
  })

  test('delete refuses a folder outside the version folders, and one that is a link, itself', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`], nvm: ['v14.21.3'] })
    repo(join(fx.dev, 'a'))
    await survey([fx.plugin], fx.ctx)
    const outside = install(join(fx.home, 'outside'), 'v14.21.3')
    const at = (path: string) => ({
      id: `node-version:${path}`,
      kind: 'node-version',
      owner: 'toolchains',
      why: 'x',
      path,
      evidence: {},
    })
    await expect(fx.plugin.delete!(at(outside), fx.ctx)).rejects.toThrow(
      /not a version folder of rustup, nvm or Volta/,
    )
    const linked = join(fx.nvm, 'v12.0.0')
    symlinkSync(outside, linked)
    await expect(fx.plugin.delete!(at(linked), fx.ctx)).rejects.toThrow(
      /not a version folder|no longer a folder/,
    )
    expect(readdirSync(join(outside, 'bin'))).toEqual(['tool'])
  })
})

describe('reading pins', () => {
  test('rust-toolchain as one line or TOML', () => {
    expect(rustPin('1.80.0\n')).toBe('1.80.0')
    expect(rustPin('[toolchain]\nchannel = "nightly-2026-01-01"\ncomponents = ["rustfmt"]\n')).toBe(
      'nightly-2026-01-01',
    )
    expect(rustPin('[toolchain]\npath = "/opt/rust"\n')).toBeNull()
  })

  test('last used is the newest access or modification time in bin, links followed; null with no bin', () => {
    const h = tempHome('workstation-cleaner-toolchains-')
    cleanups.push(h.cleanup)
    const dir = install(h.home, 'v1.0.0')
    const tool = join(dir, 'bin', 'tool')
    const at = new Date('2026-01-02T00:00:00Z')
    utimesSync(tool, at, new Date('2026-01-01T00:00:00Z'))
    expect(lastUsedMs(dir)).toBe(at.getTime())
    utimesSync(tool, new Date('2025-01-01T00:00:00Z'), at)
    expect(lastUsedMs(dir)).toBe(at.getTime())
    expect(lastUsedMs(join(h.home, 'missing'))).toBeNull()
  })

  test('a pin keeps the same name, or one that goes on after a - or a .', () => {
    expect(keeps('1.80', `1.80-${HOST}`)).toBe(true)
    expect(keeps('1.80', `1.80.1-${HOST}`)).toBe(true)
    expect(keeps('1.8', `1.80.0-${HOST}`)).toBe(false)
    expect(keeps('18', '18.17.0')).toBe(true)
    expect(keeps('18.1', '18.17.0')).toBe(false)
  })
})
