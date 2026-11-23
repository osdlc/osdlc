/** The `toolchains` plugin against real repositories, a fake `rustup` and `node`, and version folders in a temp home. */

import { afterEach, describe, expect, test } from 'vitest'
import { existsSync, mkdirSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

import { clean, plan, pluginKit, survey, type Ctx, type Plugin } from '../src/index.ts'
import { contractSuite, fakeRunner, tempHome } from '../src/testing.ts'
import { keeps, rustPin, toolchainsDefinition } from '../src/toolchains.ts'

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

/** One installed version: a folder with a file in it. */
const install = (dir: string, name: string): string => {
  write(join(dir, name, 'bin', 'tool'), 'x'.repeat(100))
  return join(dir, name)
}

/**
 * A home with `rust` toolchains in `.rustup`, `nvm` versions and `volta`
 * versions, and a `dev` folder of checkouts as the one target. `rustup`
 * answers `answers.rustup` over a default of `stable` with no overrides and
 * removes a toolchain it uninstalls; `node` is on PATH only when given.
 */
function fixture(
  opts: {
    rust?: string[]
    nvm?: string[]
    volta?: string[]
    rustup?: Record<string, Answer>
    node?: string
    targets?: (dev: string) => string[]
  } = {},
): Fixture {
  const h = tempHome('host-cleaner-toolchains-')
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
    'show active-toolchain': { stdout: `stable-${HOST} (default)\n` },
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
  const env = { HOME: home, PATH: '' }
  const plugin = toolchainsDefinition.create({
    settings: {},
    only: [],
    env,
    kit: pluginKit('toolchains', { env, runner: fake.runner, which: fake.which }),
  })
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

  test('the default, an override and the active toolchain are kept, and so is a pin by prefix', async () => {
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
        'show active-toolchain': {
          stdout: `1.76.0-${HOST} (overridden by environment variable RUSTUP_TOOLCHAIN)\n`,
        },
      },
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
      rustup: { default: { exitCode: 1, stderr: 'error: no default toolchain is configured' } },
    })
    repo(join(fx.dev, 'a'))
    const { names, refused } = await proposed(fx)
    expect(names).toEqual([`1.75.0-${HOST}`, `stable-${HOST}`])
    expect(refused).toHaveLength(2)
    expect(refused[0]).toMatchObject({ by: 'toolchains', code: 'unused-unknown' })
    expect(refused[0]!.reason).toContain('no default toolchain is configured')
  })

  test('with no targets nothing is proposed and rustup is not asked', async () => {
    const fx = fixture({ rust: [`1.75.0-${HOST}`, `stable-${HOST}`], targets: () => [] })
    const s = await survey([fx.plugin], fx.ctx)
    expect(s.plugins.map((p) => p.name)).toEqual(['toolchains'])
    expect(s.candidates).toEqual([])
    expect(fx.calls).toEqual([])
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

  test('a package.json that is not JSON refuses every Node version', async () => {
    const fx = fixture({ nvm: ['v18.17.0'] })
    repo(join(fx.dev, 'a'), { 'package.json': '{ not json' })
    const { refused } = await proposed(fx)
    expect(refused.map((o) => o.reason)).toEqual([
      expect.stringMatching(/package\.json is not JSON$/),
    ])
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

  test('a pin keeps the same name, or one that goes on after a - or a .', () => {
    expect(keeps('1.80', `1.80-${HOST}`)).toBe(true)
    expect(keeps('1.80', `1.80.1-${HOST}`)).toBe(true)
    expect(keeps('1.8', `1.80.0-${HOST}`)).toBe(false)
    expect(keeps('18', '18.17.0')).toBe(true)
    expect(keeps('18.1', '18.17.0')).toBe(false)
  })
})
