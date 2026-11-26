/** The `host-cleaner` CLI driven in process: exit codes, refusals, and plan to receipt through fake plugins and the real git plugin. */

import { afterEach, describe, expect, test } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'
import { fakeNeverExited, fakeRunner } from '@osdlc/command-seam/testing'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

import { main, tildeId, untildeId, untildeSpare, type MainDeps } from '../src/cli.ts'
import { hostDirs } from '../src/config.ts'
import { PLAN_VERSION, parsePlan } from '../src/plan.ts'
import {
  descriptorPlugin,
  orcaPlugin,
  parseDescriptor,
  pluginKit,
  type Candidate,
  type Objection,
  type Plugin,
  type RefCandidate,
} from '../src/index.ts'
import { fakeRunner as kitRunner, tempHome } from '../src/testing.ts'

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

async function run(argv: string[], cwd: string, env: Record<string, string>, deps: MainDeps = {}) {
  const ctx = captureContext({ cwd, env })
  // The shipped plugins would talk to this machine's Orca and sweep every repository it lists.
  const phase = ['status', 'plan', 'clean'].includes(argv[0] ?? '')
  const args = phase && deps.plugins === undefined ? [...argv, '--skip-plugin', 'orca'] : argv
  // The shipped descriptors would sweep this machine's caches, since HOME is the real one.
  const shippedDescriptors = deps.shippedDescriptors ?? tempDir()
  const code = await main(args, ctx, { confirm: () => null, ...deps, shippedDescriptors })
  return { code, out: ctx.io.out, err: ctx.io.err }
}

/** A plugin that owns one candidate, `artifact:cache`, and records what it is asked to delete. */
function fake(
  name = 'fake',
  extra: { objections?: Objection[]; candidate?: Partial<RefCandidate> } = {},
): Plugin & { removed: string[] } {
  const removed: string[] = []
  return {
    name,
    detect: () => true,
    discover: () => [
      {
        id: `artifact:${name}`,
        kind: 'artifact',
        ref: name,
        owner: name,
        why: 'idle for a week',
        evidence: { bytes: 10 },
        ...extra.candidate,
      },
    ],
    object: () => extra.objections ?? [],
    delete: (c) => {
      removed.push(c.id)
      return `removed ${c.ref}`
    },
    removed,
  }
}

describe('phases', () => {
  test('the bare command explains the phases and exits 2; nothing runs', async () => {
    const { env, cwd } = setup()
    const plugin = fake()
    const r = await run([], cwd, env, { plugins: [plugin] })
    expect(r.code).toBe(2)
    expect(r.err).toContain('Nothing ran. Name a phase')
    expect(r.out).toBe('')
    expect((await run(['--help'], cwd, env)).code).toBe(0)
  })

  test('a word that is no phase is refused with exit 2', async () => {
    const { env, cwd } = setup()
    const r = await run([cwd], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('is not a phase')
  })

  test('as root every phase is refused with exit 1 and nothing runs; --help still answers', async () => {
    const { env, cwd } = setup()
    const plugin = fake()
    for (const phase of ['status', 'plan', 'clean', 'config', 'plugins']) {
      const r = await run([phase, '--yes'], cwd, env, { plugins: [plugin], uid: 0 })
      expect(r.code).toBe(1)
      expect(r.err).toContain('refusing to run as root')
    }
    expect(plugin.removed).toEqual([])
    expect((await run(['--help'], cwd, env, { uid: 0 })).code).toBe(0)
  })
})

describe('status', () => {
  test('the real git plugin lists the merged branch as delete and the unmerged one as review', async () => {
    const { env } = setup()
    const r = await run(['status'], repo(), env)
    expect(r.code).toBe(0)
    expect(r.out).toContain('plugins: git')
    expect(r.out).toMatch(/delete\s+-\s+branch:.*:merged-a/)
    expect(r.out).toMatch(/review\s+-\s+branch:.*:topic/)
    expect(r.out).toContain('protest abandon-unmerged (git)')
  })

  test('json carries the candidates and objections', async () => {
    const { env, cwd } = setup()
    const r = await run(['status', '--format', 'json'], cwd, env, { plugins: [fake()] })
    const doc = JSON.parse(r.out)
    expect(doc.plugins).toEqual(['fake'])
    expect(doc.candidates.map((c: Candidate) => c.id)).toEqual(['artifact:fake'])
  })

  test("a plugin's detect note is a warning line naming it, and the json carries it under notes", async () => {
    const { env, cwd } = setup()
    const degraded: Plugin = {
      ...fake('orcish'),
      detect: () => ({
        active: true,
        note: 'installed but not running; its worktrees are refused',
      }),
    }
    const asleep: Plugin = {
      ...fake('sleepy'),
      detect: () => ({ active: false, note: 'not set up' }),
    }
    const plugins = [degraded, asleep]
    const text = await run(['status'], cwd, env, { plugins })
    expect(text.err).toContain('orcish: installed but not running; its worktrees are refused')
    expect(text.err).toContain('sleepy: not set up')
    expect(text.out).toContain('plugins: orcish\n')
    const doc = JSON.parse((await run(['status', '--format', 'json'], cwd, env, { plugins })).out)
    expect(doc.notes).toEqual({
      orcish: 'installed but not running; its worktrees are refused',
      sleepy: 'not set up',
    })
  })

  test('targetsGiven: true for targets on the command line or in the config, false for the folder it runs in', async () => {
    const { env, home, cwd } = setup()
    const seen: boolean[] = []
    const plugin: Plugin = {
      ...fake(),
      detect: (c) => {
        seen.push(c.targetsGiven)
        return true
      },
    }
    const config = join(home, 'c.json')
    writeFileSync(config, JSON.stringify({ targets: [cwd] }))
    await run(['status'], cwd, env, { plugins: [plugin] })
    await run(['status', cwd], cwd, env, { plugins: [plugin] })
    await run(['status', '--config', config], cwd, env, { plugins: [plugin] })
    expect(seen).toEqual([false, true, true])

    // A plan keeps it, so clean --plan tells the plugins the same.
    seen.length = 0
    const planFile = join(home, 'plan.json')
    await run(['plan', '-o', planFile], cwd, env, { plugins: [plugin] })
    expect(JSON.parse(readFileSync(planFile, 'utf8')).targetsGiven).toBe(false)
    await run(['clean', '--plan', planFile, '--dry-run'], cwd, env, { plugins: [plugin] })
    await run(['plan', cwd, '-o', planFile], cwd, env, { plugins: [plugin] })
    await run(['clean', '--plan', planFile, '--dry-run'], cwd, env, { plugins: [plugin] })
    expect(seen).toEqual([false, false, true, true])
  })

  test('a refused candidate is hidden unless --all-rows', async () => {
    const { env, cwd } = setup()
    const objections: Objection[] = [
      { by: 'fake', candidate: 'artifact:fake', level: 'refuse', code: 'busy', reason: 'in use' },
    ]
    const plugins = [fake('fake', { objections })]
    expect((await run(['status'], cwd, env, { plugins })).out).not.toContain('artifact:fake')
    expect((await run(['status', '--all-rows'], cwd, env, { plugins })).out).toMatch(
      /refused\s+-\s+artifact:fake/,
    )
  })

  test('with nothing found it exits 10', async () => {
    const { env, cwd } = setup()
    expect(
      (await run(['status'], cwd, env, { plugins: [{ name: 'empty', detect: () => true }] })).code,
    ).toBe(10)
  })

  test('--plugin and --skip-plugin choose among plugins', async () => {
    const { env, cwd } = setup()
    const plugins = [fake('a'), fake('b')]
    const ids = async (argv: string[]) =>
      JSON.parse((await run(['status', ...argv, '--format', 'json'], cwd, env, { plugins })).out)
        .plugins
    expect(await ids(['--plugin', 'a'])).toEqual(['a'])
    expect(await ids(['--skip-plugin', 'a'])).toEqual(['b'])
  })

  test('--adapter, the old name of --plugin, is an unknown option', async () => {
    const { env, cwd } = setup()
    for (const phase of ['status', 'plan', 'clean']) {
      const r = await run([phase, '--adapter', 'a'], cwd, env, { plugins: [fake('a')] })
      expect(r.code).toBe(2)
      expect(r.err).toContain("unknown option '--adapter'")
    }
  })

  test('--worktrees and --branches narrow the git candidates, as in repo-cleaner', async () => {
    const { env } = setup()
    const dir = repo()
    const ids = async (argv: string[]) =>
      JSON.parse(
        (await run(['status', '--plugin', 'git', ...argv, '--format', 'json'], dir, env)).out,
      ).candidates.map((c: Candidate) => c.kind)
    expect(new Set(await ids([]))).toEqual(new Set(['branch']))
    expect(await ids(['--worktrees'])).toEqual([])
    expect(new Set(await ids(['--branches']))).toEqual(new Set(['branch']))
  })

  test('targets come from the config file when none is named', async () => {
    const { env, home } = setup()
    const config = join(home, 'c.json')
    writeFileSync(config, JSON.stringify({ targets: [repo()] }))
    const r = await run(['status', '--config', config], tempDir(), env)
    expect(r.out).toContain('merged-a')
  })

  test('a bad config and an unknown plugin are refused with exit 2', async () => {
    const { env, home, cwd } = setup()
    const config = join(home, 'c.json')
    writeFileSync(config, '{"targets": 3}')
    expect((await run(['status', '--config', config], cwd, env)).code).toBe(2)
    expect((await run(['status', '--plugin', 'nope'], cwd, env)).code).toBe(2)
    expect((await run(['status', '--skip-plugin', 'nope'], cwd, env)).code).toBe(2)
    writeFileSync(config, JSON.stringify({ plugins: { cargo: { idleHours: 'soon' } } }))
    const bad = await run(['status', '--config', config], cwd, env)
    expect(bad.code).toBe(2)
    expect(bad.err).toContain('plugins.cargo.idleHours')
    // A name no plugin has may be a descriptor this run does not load: status warns, clean stops.
    writeFileSync(config, JSON.stringify({ plugins: { ghost: {} } }))
    const r = await run(['status', '--config', config], cwd, env)
    expect(r.code).not.toBe(2)
    expect(r.err).toContain('config names no plugin ghost')
    const clean = await run(['clean', '--config', config, '--yes'], cwd, env)
    expect(clean.code).toBe(2)
    expect(clean.err).toContain('config names no plugin ghost')
  })

  test('there are no profiles: --profile is an unknown option and a profiles key is refused', async () => {
    const { env, home, cwd } = setup()
    const flag = await run(['status', '--profile', 'x'], cwd, env)
    expect(flag.code).toBe(2)
    expect(flag.err).toContain("unknown option '--profile'")
    const config = join(home, 'c.json')
    writeFileSync(config, JSON.stringify({ profiles: { deep: { idleHours: 0 } } }))
    const r = await run(['status', '--config', config], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('profiles')
  })
})

describe('plugins', () => {
  /** The real orca plugin over a fake `orca` CLI whose `status` says the app is not reachable. */
  const orcaDown = () => {
    const ok = (result: unknown) => ({ stdout: JSON.stringify({ id: 'x', ok: true, result }) })
    const cli = fakeRunner((argv) =>
      argv[0] === 'status' ? ok({ runtime: { reachable: false } }) : undefined,
    )
    return orcaPlugin({ orca: cli.runner })
  }

  const plugins = (): Plugin[] => [
    { ...fake('git'), roots: () => ['/cache/git'] },
    fake('cargo'),
    { ...fake('node'), detect: () => false },
    orcaDown(),
  ]

  test('Orca not running shows as detected with its note, beside each plugin’s source (given, as main was handed them), detection and roots', async () => {
    const { env, cwd } = setup()
    const r = await run(['plugins'], cwd, env, { plugins: plugins() })
    expect(r.code).toBe(0)
    expect(r.err).toBe('')
    expect(r.out).toBe(
      [
        `targets: ${cwd}`,
        '  git    given  detected; roots: /cache/git',
        '  cargo  given  detected; roots: none, the targets alone',
        '  node   given  not detected',
        '  orca   given  detected; roots: none, the targets alone; note: Orca is installed but not running',
        '',
      ].join('\n'),
    )
  })

  test('json carries every plugin, and one the config disables is listed without running detect', async () => {
    const { env, cwd, home } = setup()
    const file = join(home, 'c.json')
    writeFileSync(file, JSON.stringify({ plugins: { cargo: { enabled: false } } }))
    const all = plugins()
    let asked = false
    all[1] = { ...all[1]!, detect: () => (asked = true) }
    const r = await run(['plugins', '--config', file, '--format', 'json'], cwd, env, {
      plugins: all,
    })
    expect(r.code).toBe(0)
    expect(asked).toBe(false)
    expect(JSON.parse(r.out)).toEqual({
      targets: [cwd],
      warnings: [],
      plugins: [
        {
          name: 'git',
          source: 'given',
          enabled: true,
          detected: true,
          reason: null,
          roots: ['/cache/git'],
          selfRoots: [],
          note: null,
          vars: [],
        },
        {
          name: 'cargo',
          source: 'given',
          enabled: false,
          detected: false,
          reason: "plugins.cargo.enabled is false; a sweep's --plugin cargo runs it anyway",
          roots: [],
          selfRoots: [],
          note: null,
          vars: [],
        },
        {
          name: 'node',
          source: 'given',
          enabled: true,
          detected: false,
          reason: null,
          roots: [],
          selfRoots: [],
          note: null,
          vars: [],
        },
        {
          name: 'orca',
          source: 'given',
          enabled: true,
          detected: true,
          reason: null,
          roots: [],
          selfRoots: [],
          note: 'Orca is installed but not running',
          vars: [],
        },
      ],
    })
  })

  /** Go's module cache: GOMODCACHE, then `go env`, then under GOPATH; a build cache under XDG_CACHE_HOME; and a folder with no value. */
  const GO = `descriptor: 1
detect:
  any: [{ onPath: go }]
vars:
  GOPATH:
    - env: GOPATH
    - value: ~/go
  GOMODCACHE:
    - env: GOMODCACHE
    - command: [go, env, GOMODCACHE]
    - value: '\${GOPATH}/pkg/mod'
  TOOLDIR:
    - env: GO_TOOL_DIR
paths:
  modcache: { all: '\${GOMODCACHE}' }
  buildcache: { all: '\${XDG_CACHE_HOME}/go-build' }
  tools: { all: '\${TOOLDIR}' }
candidates:
  - { path: modcache, costDescription: re-download }
  - { path: buildcache, costDescription: rebuild }
  - { path: tools, costDescription: rebuild }
`

  /**
   * The go descriptor, shipped, and a plugin built from it over a fixture home
   * whose `go env GOMODCACHE` never answers, for a program to pass to `main`.
   */
  function goHungEnv() {
    const h = tempHome()
    cleanups.push(h.cleanup)
    const shipped = tempDir()
    writeFileSync(join(shipped, 'go.yaml'), GO)
    const fake = kitRunner({ go: { 'env GOMODCACHE': fakeNeverExited('timeout') } })
    const go = descriptorPlugin('go', parseDescriptor(GO, 'go.yaml'), { ownDirs: [] }).create({
      settings: { idleHours: 0 },
      only: [],
      env: h.env,
      kit: pluginKit('go', { env: h.env, ...fake }),
    })
    return { home: h.home, shipped, go }
  }

  test('a timed-out command shows as such, with the source used after it: one line per variable', async () => {
    const { env, cwd } = setup()
    const { home, shipped, go } = goHungEnv()
    // A given plugin is `given`, though a shipped descriptor has its name.
    const r = await run(['plugins'], cwd, { ...env, HOME: home }, {
      plugins: [fake('git'), go],
      shippedDescriptors: shipped,
    })
    expect(r.code).toBe(0)
    expect(r.err).toBe('')
    expect(r.out).toBe(
      [
        `targets: ${cwd}`,
        '  git  given  detected; roots: none, the targets alone',
        `  go   given  detected; roots: ${join(home, 'go/pkg/mod')} (itself too), ${join(home, '.cache/go-build')} (itself too); note: tools is left out: \${TOOLDIR} has no value (env GO_TOOL_DIR: not set)`,
        `    \${XDG_CACHE_HOME}  = ${join(home, '.cache')}  from default (tried env XDG_CACHE_HOME: not set)`,
        `    \${GOPATH}          = ${join(home, 'go')}  from value (tried env GOPATH: not set)`,
        `    \${GOMODCACHE}      = ${join(home, 'go/pkg/mod')}  from value (tried env GOMODCACHE: not set; command go env GOMODCACHE: timed out after 5 s)`,
        '    ${TOOLDIR}         has no value (tried env GO_TOOL_DIR: not set)',
        '',
      ].join('\n'),
    )
  })

  test('json gives each variable its value, the source that gave it and every source that failed', async () => {
    const { env, cwd } = setup()
    const { home, shipped, go } = goHungEnv()
    const r = await run(['plugins', '--format', 'json'], cwd, { ...env, HOME: home }, {
      plugins: [go],
      shippedDescriptors: shipped,
    })
    expect(r.code).toBe(0)
    const [row] = JSON.parse(r.out).plugins
    expect(row.source).toBe('given')
    expect(row.replaces).toBeUndefined()
    expect(row.vars).toEqual([
      {
        name: 'XDG_CACHE_HOME',
        value: join(home, '.cache'),
        from: 'default',
        trusted: false,
        tried: [{ source: 'env XDG_CACHE_HOME', failed: 'not set' }],
      },
      {
        name: 'GOPATH',
        value: join(home, 'go'),
        from: 'value',
        trusted: false,
        tried: [{ source: 'env GOPATH', failed: 'not set' }],
      },
      {
        name: 'GOMODCACHE',
        value: join(home, 'go/pkg/mod'),
        from: 'value',
        trusted: false,
        tried: [
          { source: 'env GOMODCACHE', failed: 'not set' },
          { source: 'command go env GOMODCACHE', failed: 'timed out after 5 s' },
        ],
      },
      {
        name: 'TOOLDIR',
        value: null,
        from: null,
        trusted: false,
        tried: [{ source: 'env GO_TOOL_DIR', failed: 'not set' }],
      },
    ])
  })

  test('it proposes and deletes nothing, and a config naming no plugin is a warning', async () => {
    const { env, cwd, home } = setup()
    let discovered = false
    const plugin = { ...fake(), discover: () => ((discovered = true), []) }
    expect((await run(['plugins'], cwd, env, { plugins: [plugin] })).code).toBe(0)
    expect(discovered).toBe(false)
    expect(plugin.removed).toEqual([])
    const file = join(home, 'c.json')
    writeFileSync(file, JSON.stringify({ plugins: { ghost: {} } }))
    const r = await run(['plugins', '--config', file], cwd, env, { plugins: [plugin] })
    expect(r.code).toBe(0)
    expect(r.err).toContain('config names no plugin ghost')
  })

  test('a second plugin of one name gets no row of its own, and the warning says it was left out', async () => {
    const { env, cwd } = setup()
    const twice = [
      { ...fake('x'), roots: () => ['/cache/first'] },
      { ...fake('x'), roots: () => ['/cache/second'] },
    ]
    const r = await run(['plugins'], cwd, env, { plugins: twice })
    expect(r.code).toBe(0)
    expect(r.out).toBe(
      [`targets: ${cwd}`, '  x  given  detected; roots: /cache/first', ''].join('\n'),
    )
    expect(r.err).toContain('x: a second plugin of that name was left out')
  })

  test('a degraded plugin shows as detected with its note, in text and json, and a self root is marked', async () => {
    const { env, cwd } = setup()
    const cache = tempDir()
    const noted = (): Plugin[] => [
      {
        ...fake('git'),
        detect: () => ({ active: true, note: 'one note' }),
        roots: () => [{ path: cache, self: true }],
      },
      { ...fake('cargo'), detect: () => ({ active: false, note: 'no cargo' }) },
    ]
    const r = await run(['plugins'], cwd, env, { plugins: noted() })
    expect(r.code).toBe(0)
    expect(r.out).toBe(
      [
        `targets: ${cwd}`,
        `  git    given  detected; roots: ${cache} (itself too); note: one note`,
        '  cargo  given  not detected; note: no cargo',
        '',
      ].join('\n'),
    )
    const json = await run(['plugins', '--format', 'json'], cwd, env, { plugins: noted() })
    expect(json.code).toBe(0)
    expect(JSON.parse(json.out).plugins).toEqual([
      {
        name: 'git',
        source: 'given',
        enabled: true,
        detected: true,
        reason: null,
        roots: [cache],
        selfRoots: [cache],
        note: 'one note',
        vars: [],
      },
      {
        name: 'cargo',
        source: 'given',
        enabled: true,
        detected: false,
        reason: null,
        roots: [],
        selfRoots: [],
        note: 'no cargo',
        vars: [],
      },
    ])
  })

  test('a second plugin of a name is one row with a warning, and a multi-line detect error stays on its row', async () => {
    const { env, cwd } = setup()
    const r = await run(['plugins'], cwd, env, {
      plugins: [
        {
          ...fake('a'),
          detect: () => {
            throw new Error('stderr line one\nstderr line two')
          },
        },
        { ...fake('a'), detect: () => true },
      ],
    })
    expect(r.code).toBe(0)
    expect(r.err).toContain('a: a second plugin of that name was left out')
    expect(r.out).toBe(
      [`targets: ${cwd}`, '  a  given  not detected: stderr line one stderr line two', ''].join(
        '\n',
      ),
    )
  })
})

describe('plugin settings', () => {
  const withConfig = (config: unknown) => {
    const { env, cwd, home } = setup()
    const file = join(home, 'config.json')
    writeFileSync(file, JSON.stringify(config))
    return { env, cwd, file }
  }

  test('a misspelt key and a wrong type are refused, each naming the plugin and the key', async () => {
    const { env, cwd, file } = withConfig({
      plugins: { cargo: { idlehours: 3 }, node: { idleHours: -1, enabled: 'yes' } },
    })
    const r = await run(['status', '--config', file], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('plugins.cargo')
    expect(r.err).toContain('idlehours')
    expect(r.err).toContain('plugins.node.idleHours')
    expect(r.err).toContain('plugins.node.enabled')
  })

  test('enabled: false leaves a plugin out, and --plugin runs it anyway', async () => {
    const { env, cwd, file } = withConfig({ plugins: { fake: { enabled: false } } })
    const plugins = [fake('fake'), fake('other')]
    const status = async (...extra: string[]) =>
      (await run(['status', '--config', file, ...extra], cwd, env, { plugins })).out
    expect(await status()).not.toContain('artifact:fake')
    expect(await status()).toContain('artifact:other')
    expect(await status('--plugin', 'fake')).toContain('artifact:fake')
  })

  test('config prints each plugin’s settings with defaults and what the file set', async () => {
    const { env, cwd, file } = withConfig({
      targets: ['~/dev'],
      plugins: { cargo: { idleHours: 48 }, node: { enabled: false } },
    })
    const text = await run(['config', '--config', file], cwd, env)
    expect(text.code).toBe(0)
    expect(text.out).toContain('targets: ~/dev')
    expect(text.out).toMatch(/plugins\.cargo\n {2}enabled = true {2}\(default\)/)
    expect(text.out).toMatch(/idleHours = 48 {2}\(config\)/)
    expect(text.out).toMatch(/plugins\.node\n {2}enabled = false {2}\(config\)/)
    expect(text.out).toMatch(/idleHours = 24 {2}\(default\)/)
    const json = JSON.parse(
      (await run(['config', '--config', file, '--format', 'json'], cwd, env)).out,
    )
    expect(json.plugins.cargo).toEqual({ enabled: true, idleHours: 48 })
    expect(json.plugins.git).toEqual({ enabled: true })
  })

  test('config refuses a bad config and warns of a plugin nobody has', async () => {
    const bad = withConfig({ plugins: { cargo: { nope: 1 } } })
    expect((await run(['config', '--config', bad.file], bad.cwd, bad.env)).code).toBe(2)
    const ghost = withConfig({ plugins: { ghost: {} } })
    const r = await run(['config', '--config', ghost.file], ghost.cwd, ghost.env)
    expect(r.code).toBe(0)
    expect(r.err).toContain('config names no plugin ghost')
  })
})

describe('descriptors', () => {
  /** A descriptor whose one folder is `~/<folder>`. */
  const store = (folder: string, extra = ''): string => `descriptor: 1
paths:
  store: { all: ~/${folder} }
candidates:
  - { path: store, costDescription: re-download }
${extra}`

  /**
   * A fixture home, its `.cache/<name>` folders made with a file in each, an
   * empty shipped folder by default, and the user's descriptor folder.
   */
  function withHome(made: string[] = []) {
    const { env, cwd, home } = setup()
    for (const name of made) {
      mkdirSync(join(home, '.cache', name), { recursive: true })
      writeFileSync(join(home, '.cache', name, 'blob'), 'x')
    }
    const user = join(hostDirs(env).config, 'descriptors')
    mkdirSync(user, { recursive: true })
    const shipped = join(tempDir(), 'shipped')
    mkdirSync(shipped)
    return { env: { ...env, HOME: home }, cwd, home, user, shipped }
  }

  test('status --descriptor <file> --plugin <name> shows what that one descriptor would propose', async () => {
    const h = withHome(['mine'])
    const file = join(h.cwd, 'mine.yaml')
    writeFileSync(file, store('.cache/mine'))
    const r = await run(['status', '--descriptor', file, '--plugin', 'mine'], h.cwd, h.env, {
      shippedDescriptors: h.shipped,
    })
    expect(r.code).toBe(0)
    expect(r.out).toContain('plugins: mine\n')
    expect(r.out).toMatch(/review\s+re-download mine:~\/\.cache\/mine\n/)
    expect(r.out).toContain('(threshold 24)')
  })

  test('a descriptor named git is an error, from the user folder or --descriptor', async () => {
    const h = withHome()
    writeFileSync(join(h.user, 'git.yaml'), store('.cache/git'))
    const r = await run(['status'], h.cwd, h.env, { shippedDescriptors: h.shipped })
    expect(r.code).toBe(2)
    expect(r.err).toContain(`descriptor ${join(h.user, 'git.yaml')} is named git`)
    rmSync(join(h.user, 'git.yaml'))
    const file = join(h.cwd, 'git.yaml')
    writeFileSync(file, store('.cache/git'))
    const flag = await run(['status', '--descriptor', file], h.cwd, h.env, {
      shippedDescriptors: h.shipped,
    })
    expect(flag.code).toBe(2)
    expect(flag.err).toContain('is named git, as the built-in plugin')
  })

  test('a user pnpm.yaml replaces the shipped one; --descriptor replaces both for one run', async () => {
    const h = withHome(['shipped-pnpm', 'user-pnpm', 'flag-pnpm'])
    writeFileSync(join(h.shipped, 'pnpm.yaml'), store('.cache/shipped-pnpm'))
    const status = async (...extra: string[]) =>
      (
        await run(['status', '--plugin', 'pnpm', ...extra], h.cwd, h.env, {
          shippedDescriptors: h.shipped,
        })
      ).out
    expect(await status()).toContain('pnpm:~/.cache/shipped-pnpm')
    writeFileSync(join(h.user, 'pnpm.yaml'), store('.cache/user-pnpm'))
    const replaced = await status()
    expect(replaced).toContain('pnpm:~/.cache/user-pnpm')
    expect(replaced).not.toContain('shipped-pnpm')
    const file = join(h.cwd, 'pnpm.yaml')
    writeFileSync(file, store('.cache/flag-pnpm'))
    const once = await status('--descriptor', file)
    expect(once).toContain('pnpm:~/.cache/flag-pnpm')
    expect(once).not.toContain('user-pnpm')
    const listed = async (...extra: string[]) =>
      (
        await run(['plugins', '--format', 'json', ...extra], h.cwd, h.env, {
          shippedDescriptors: h.shipped,
        })
      ).out
    const pnpm = (out: string) =>
      JSON.parse(out).plugins.find((p: { name: string }) => p.name === 'pnpm')
    expect(pnpm(await listed())).toMatchObject({
      source: 'user',
      replaces: { source: 'shipped', path: join(h.shipped, 'pnpm.yaml') },
    })
    expect(pnpm(await listed('--descriptor', file))).toMatchObject({
      source: 'flag',
      replaces: { source: 'user', path: join(h.user, 'pnpm.yaml') },
    })
    const text = (await run(['plugins'], h.cwd, h.env, { shippedDescriptors: h.shipped })).out
    expect(text.split('\n').find((l) => l.startsWith('  pnpm '))).toMatch(
      `; replaces the shipped ${join(h.shipped, 'pnpm.yaml')}`,
    )
  })

  test('descriptors run after the built-ins, by name', async () => {
    const h = withHome(['b', 'a'])
    writeFileSync(join(h.user, 'zeta.yaml'), store('.cache/b'))
    writeFileSync(join(h.shipped, 'alpha.yaml'), store('.cache/a'))
    const r = await run(['status', '--skip-plugin', 'cargo,node'], h.cwd, h.env, {
      shippedDescriptors: h.shipped,
    })
    expect(r.out).toContain('plugins: git, alpha, zeta\n')
  })

  test('plugins.<name>.enabled and idleHours apply to a descriptor', async () => {
    const h = withHome(['mine'])
    writeFileSync(join(h.user, 'mine.yaml'), store('.cache/mine'))
    const file = join(h.home, 'config.json')
    const status = async (config: unknown, ...extra: string[]) => {
      writeFileSync(file, JSON.stringify(config))
      return run(
        ['status', '--config', file, '--skip-plugin', 'cargo,node', ...extra],
        h.cwd,
        h.env,
        {
          shippedDescriptors: h.shipped,
        },
      )
    }
    const off = { plugins: { mine: { enabled: false } } }
    expect((await status(off)).out).not.toContain('mine:')
    expect((await status(off, '--plugin', 'mine')).out).toContain('mine:~/.cache/mine')
    expect((await status({ idleHours: 5 })).out).toContain('(threshold 5)')
    const own = (await status({ idleHours: 5, plugins: { mine: { idleHours: 0 } } })).out
    expect(own).toContain('(threshold 0)')
    expect(own).toMatch(/delete\s+re-download mine:~\/\.cache\/mine/)
    const bad = await status({ plugins: { mine: { idleHours: -1, nope: 1 } } })
    expect(bad.code).toBe(2)
    expect(bad.err).toContain('plugins.mine.idleHours')
    expect(bad.err).toContain('nope')
  })

  test("an entry's own idleHours: plugins.<name>.idleHours wins, the top-level one raises it, and config says what the run uses", async () => {
    const h = withHome(['mine'])
    writeFileSync(
      join(h.shipped, 'mine.yaml'),
      store('.cache/mine').replace('re-download }', 're-download, idleHours: 720 }') +
        "project:\n  - { dir: out, marker: '*.x', costDescription: rebuild, idleHours: 168 }\n",
    )
    const file = join(h.home, 'config.json')
    const deps = { shippedDescriptors: h.shipped }
    for (const [config, setting, own, project] of [
      [{}, 24, 720, 168],
      [{ idleHours: 0 }, 0, 720, 168],
      [{ idleHours: 200 }, 200, 720, 200],
      [{ idleHours: 4000 }, 4000, 4000, 4000],
      [{ plugins: { mine: { idleHours: 4000 } } }, 4000, 4000, 4000],
      [{ plugins: { mine: { idleHours: 1 } } }, 1, 1, 1],
      [{ idleHours: 4000, plugins: { mine: { idleHours: 1 } } }, 1, 1, 1],
    ] as const) {
      writeFileSync(file, JSON.stringify(config))
      const what = JSON.stringify(config)
      const common = ['--config', file]
      const status = await run(['status', '--plugin', 'mine', ...common], h.cwd, h.env, deps)
      expect(status.out, what).toContain(`(threshold ${own})`)
      const text = await run(['config', ...common], h.cwd, h.env, deps)
      expect(text.out, what).toMatch(
        new RegExp(
          `plugins\\.mine\\n.*\\n {2}idleHours = ${setting} .*\\n {4}store: idleHours = ${own}\\n {4}out beside \\*\\.x: idleHours = ${project}\\n`,
        ),
      )
      const json = await run(['config', '--format', 'json', ...common], h.cwd, h.env, deps)
      expect(JSON.parse(json.out), what).toMatchObject({
        plugins: { mine: { idleHours: setting } },
        partIdleHours: {
          mine: [
            { part: 'store', idleHours: own },
            { part: 'out beside *.x', idleHours: project },
          ],
        },
      })
    }
  })

  test('config prints a descriptor’s settings; --descriptor adds one for that run', async () => {
    const h = withHome()
    writeFileSync(join(h.user, 'mine.yaml'), store('.cache/mine'))
    const file = join(h.home, 'config.json')
    writeFileSync(file, JSON.stringify({ plugins: { mine: { idleHours: 48 } } }))
    const deps = { shippedDescriptors: h.shipped }
    const r = await run(['config', '--config', file], h.cwd, h.env, deps)
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/plugins\.mine\n {2}enabled = true {2}\(default\)/)
    expect(r.out).toMatch(/idleHours = 48 {2}\(config\)/)
    const extra = join(h.cwd, 'extra.yaml')
    writeFileSync(extra, store('.cache/extra'))
    const json = JSON.parse(
      (await run(['config', '--descriptor', extra, '--format', 'json'], h.cwd, h.env, deps)).out,
    )
    expect(json.plugins.extra).toEqual({ enabled: true, idleHours: 24 })
  })

  test('plugins says where each descriptor came from and shows its variables, even when it is not detected', async () => {
    const h = withHome()
    writeFileSync(
      join(h.user, 'mine.yaml'),
      `descriptor: 1
vars:
  DIR:
    - env: MINE_DIR
    - value: ~/.cache/mine
paths:
  store: { all: '\${DIR}' }
candidates:
  - { path: store, costDescription: re-download }
`,
    )
    const extra = join(h.cwd, 'extra.yaml')
    writeFileSync(extra, store('.cache/extra'))
    const file = join(h.home, 'config.json')
    const config = { orca: { enabled: false }, mine: { vars: { DIR: '~/elsewhere' } } }
    writeFileSync(file, JSON.stringify({ plugins: config }))
    const r = await run(
      ['plugins', '--config', file, '--descriptor', extra, '--format', 'json'],
      h.cwd,
      h.env,
      { shippedDescriptors: h.shipped },
    )
    expect(r.code).toBe(0)
    const rows = Object.fromEntries(
      JSON.parse(r.out).plugins.map((p: { name: string }) => [p.name, p]),
    )
    expect(rows.git).toMatchObject({ source: 'built-in', vars: [] })
    expect(rows.orca).toMatchObject({ enabled: false, vars: [] })
    expect(rows.mine).toMatchObject({
      source: 'user',
      detected: false,
      vars: [
        { name: 'DIR', value: join(h.home, 'elsewhere'), from: 'config', trusted: true, tried: [] },
      ],
    })
    expect(rows.extra).toMatchObject({ source: 'flag', vars: [] })
  })

  test('a descriptor file that is not valid is refused with exit 2, naming the file and the line', async () => {
    const h = withHome()
    writeFileSync(join(h.user, 'mine.yaml'), 'descriptor: 1\npaths: {}\ncandidates: []\n')
    const r = await run(['status'], h.cwd, h.env, { shippedDescriptors: h.shipped })
    expect(r.code).toBe(2)
    expect(r.err).toContain(`bad descriptor ${join(h.user, 'mine.yaml')}: line 2: paths`)
  })

  test('a bad descriptor stops only a run that uses it; config reports it and goes on', async () => {
    const h = withHome()
    writeFileSync(join(h.user, 'mine.yaml'), 'descriptor: 1\npaths: {}\ncandidates: []\n')
    writeFileSync(join(h.user, 'My_tool.yaml'), store('.cache/x'))
    const deps = { shippedDescriptors: h.shipped }
    const bad = `bad descriptor ${join(h.user, 'mine.yaml')}`
    for (const argv of [
      ['status', '--plugin', 'git'],
      ['status', '--skip-plugin', 'mine,My_tool'],
      ['plan', '--plugin', 'git', '-o', '-'],
    ]) {
      const r = await run(argv, h.cwd, h.env, deps)
      expect(r.code, argv.join(' ')).not.toBe(2)
      expect(r.err).toContain(bad)
    }
    expect((await run(['status', '--skip-plugin', 'mine'], h.cwd, h.env, deps)).code).toBe(2)
    const file = join(h.home, 'config.json')
    writeFileSync(file, JSON.stringify({ plugins: { mine: { enabled: false } } }))
    const off = await run(
      ['status', '--config', file, '--skip-plugin', 'My_tool'],
      h.cwd,
      h.env,
      deps,
    )
    expect(off.code).not.toBe(2)
    for (const argv of [
      ['status'],
      ['plan', '-o', '-'],
      ['clean', '--yes'],
      ['clean', '--plugin', 'mine', '--yes'],
    ]) {
      const r = await run(argv, h.cwd, h.env, deps)
      expect(r.code, argv.join(' ')).toBe(2)
    }
    const named = await run(['status', '--config', file, '--plugin', 'mine'], h.cwd, h.env, deps)
    expect(named.code).toBe(2)
    expect(named.err).toContain(bad)
    const config = await run(['config'], h.cwd, h.env, deps)
    expect(config.code).toBe(0)
    expect(config.err).toContain(bad)
    expect(config.err).toContain('"My_tool" is not a plugin name')
  })

  test('--skip-plugin of a built-in leaves it out although a descriptor has its name', async () => {
    const h = withHome()
    writeFileSync(join(h.user, 'git.yaml'), store('.cache/git'))
    const deps = { shippedDescriptors: h.shipped }
    const r = await run(['status', '--skip-plugin', 'git,cargo,node'], h.cwd, h.env, deps)
    expect(r.out).toContain('plugins: (none)\n')
    expect(r.err).toContain('is named git, as the built-in plugin')
    const ghost = await run(['status', '--skip-plugin', 'git,ghost'], h.cwd, h.env, deps)
    expect(ghost.code).toBe(2)
    expect(ghost.err).toContain('no plugin named ghost')
  })

  test('a config entry for a descriptor given by --descriptor: a warning without it, and clean stops', async () => {
    const h = withHome(['mine'])
    const desc = join(h.cwd, 'mine.yaml')
    writeFileSync(desc, store('.cache/mine'))
    const file = join(h.home, 'config.json')
    writeFileSync(file, JSON.stringify({ plugins: { mine: { idleHours: 0 } } }))
    const deps = { shippedDescriptors: h.shipped }
    const common = ['--config', file]
    const warning = 'config names no plugin mine; a descriptor of that name is not loaded'
    for (const argv of [['status', '--plugin', 'git'], ['plan', '-o', '-'], ['config']]) {
      const r = await run([...argv, ...common], h.cwd, h.env, deps)
      expect(r.code, argv.join(' ')).not.toBe(2)
      expect(r.err).toContain(warning)
    }
    const json = await run(['status', '--format', 'json', ...common], h.cwd, h.env, deps)
    expect(JSON.parse(json.out).warnings).toContain(warning)
    for (const argv of [['--yes'], ['--dry-run']]) {
      const r = await run(['clean', ...argv, ...common], h.cwd, h.env, deps)
      expect(r.code).toBe(2)
      expect(r.err).toContain(warning)
    }
    expect(existsSync(join(h.home, '.cache', 'mine'))).toBe(true)
    const given = await run(['status', '--descriptor', desc, ...common], h.cwd, h.env, deps)
    expect(given.err).not.toContain('names no plugin')
  })

  test('--config goes on without a config directory, with no user descriptors and a warning', async () => {
    const h = withHome(['mine'])
    writeFileSync(join(h.shipped, 'mine.yaml'), store('.cache/mine'))
    const file = join(h.home, 'config.json')
    writeFileSync(file, JSON.stringify({}))
    const env = { ...h.env, HOST_CLEANER_ROOT: 'relative' }
    const deps = { shippedDescriptors: h.shipped }
    for (const argv of [['status', '--plugin', 'git'], ['config']]) {
      const r = await run([...argv, '--config', file], h.cwd, env, deps)
      expect(r.code, argv.join(' ')).not.toBe(1)
      expect(r.err).toContain('no user descriptors: ')
      expect((await run(argv, h.cwd, env, deps)).code).toBe(1)
    }
  })

  test('with deps.plugins no descriptor is loaded, so a bad one does not matter', async () => {
    const h = withHome()
    writeFileSync(join(h.user, 'mine.yaml'), 'not: a descriptor\n')
    const r = await run(['status'], h.cwd, h.env, {
      shippedDescriptors: h.shipped,
      plugins: [fake('only')],
    })
    expect(r.code).not.toBe(2)
    expect(r.err).not.toContain('mine.yaml')
  })

  test('a plan records its --descriptor files, and clean --plan stops without them', async () => {
    const h = withHome(['mine'])
    const desc = join(h.cwd, 'mine.yaml')
    writeFileSync(desc, store('.cache/mine'))
    const deps = { shippedDescriptors: h.shipped }
    const planFile = join(h.cwd, 'p.json')
    const made = await run(
      ['plan', '--descriptor', desc, '--plugin', 'mine', '-o', planFile],
      h.cwd,
      h.env,
      deps,
    )
    expect(made.code).toBe(0)
    expect(parsePlan(readFileSync(planFile, 'utf8'), planFile).descriptors).toEqual([desc])
    const without = await run(['clean', '--plan', planFile, '--yes'], h.cwd, h.env, deps)
    expect(without.code).toBe(2)
    expect(without.err).toContain(`add --descriptor ${desc}`)
    const other = join(tempDir(), 'mine.yaml')
    writeFileSync(other, store('.cache/mine'))
    const wrong = ['clean', '--plan', planFile, '--descriptor', other, '--yes']
    expect((await run(wrong, h.cwd, h.env, deps)).code).toBe(2)
    // The plan's descriptors are named even where the config's entry for one would stop it too.
    const file = join(h.home, 'config.json')
    writeFileSync(file, JSON.stringify({ plugins: { mine: { idleHours: 0 } } }))
    const configured = ['clean', '--plan', planFile, '--config', file, '--yes']
    const both = await run(configured, h.cwd, h.env, deps)
    expect(both.code).toBe(2)
    expect(both.err).toContain(`add --descriptor ${desc}`)
    expect(existsSync(join(h.home, '.cache', 'mine'))).toBe(true)
    const dry = await run(
      ['clean', '--plan', planFile, '--descriptor', desc, '--dry-run'],
      h.cwd,
      h.env,
      deps,
    )
    expect(dry.code).not.toBe(2)
    expect(dry.err).not.toContain('add --descriptor')
  })

  test('supersededBy: left out while that plugin runs, used when it is skipped', async () => {
    const h = withHome(['mine'])
    writeFileSync(join(h.user, 'mine.yaml'), store('.cache/mine', 'supersededBy: git\n'))
    const deps = { shippedDescriptors: h.shipped }
    const on = await run(['status', '--skip-plugin', 'cargo,node'], h.cwd, h.env, deps)
    expect(on.out).toContain('plugins: git\n')
    const off = await run(['status', '--skip-plugin', 'git,cargo,node'], h.cwd, h.env, deps)
    expect(off.out).toContain('plugins: mine\n')
  })

  test('plugins says why a superseded or system: true descriptor does not apply', async () => {
    const h = withHome(['mine', 'root'])
    writeFileSync(join(h.user, 'mine.yaml'), store('.cache/mine', 'supersededBy: git\n'))
    writeFileSync(join(h.user, 'root.yaml'), store('.cache/root', 'system: true\n'))
    const r = await run(['plugins', '--format', 'json'], h.cwd, h.env, {
      shippedDescriptors: h.shipped,
    })
    expect(r.code).toBe(0)
    const rows = Object.fromEntries(
      JSON.parse(r.out).plugins.map((p: { name: string }) => [p.name, p]),
    )
    expect(rows.mine).toMatchObject({
      detected: false,
      reason: null,
      note: 'skipped: the plugin git runs instead',
      vars: [],
    })
    expect(rows.root).toMatchObject({ detected: false, reason: null, vars: [] })
    expect(rows.root.note).toMatch(/^skipped: .*system: true/)
    const text = (await run(['plugins'], h.cwd, h.env, { shippedDescriptors: h.shipped })).out
    expect(text).toMatch(
      / {2}mine +user +not detected; note: skipped: the plugin git runs instead\n/,
    )
  })

  test('clean deletes a descriptor’s folder through the kit', async () => {
    const h = withHome(['mine'])
    writeFileSync(join(h.user, 'mine.yaml'), store('.cache/mine'))
    const file = join(h.home, 'config.json')
    writeFileSync(file, JSON.stringify({ plugins: { mine: { idleHours: 0 } } }))
    const r = await run(
      ['clean', '--config', file, '--plugin', 'mine', '--yes', '--receipt', join(h.cwd, 'r.json')],
      h.cwd,
      h.env,
      { shippedDescriptors: h.shipped },
    )
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/done\s+mine:~\/\.cache\/mine/)
    expect(existsSync(join(h.home, '.cache', 'mine'))).toBe(false)
  })
})

describe('plan and clean', () => {
  /** A plugin that runs degraded, with a note, and one that does not run, with a note. */
  const noted = (): Plugin[] => [
    {
      ...fake('orcish'),
      detect: () => ({
        active: true,
        note: 'installed but not running; its worktrees are refused',
      }),
    },
    { ...fake('sleepy'), detect: () => ({ active: false, note: 'not set up' }) },
  ]
  const NOTES = {
    orcish: 'installed but not running; its worktrees are refused',
    sleepy: 'not set up',
  }
  const noteLines = (err: string) => {
    expect(err).toContain('orcish: installed but not running; its worktrees are refused')
    expect(err).toContain('sleepy: not set up')
  }

  test("plan prints each plugin's detect note as a warning line naming it", async () => {
    const { env, home, cwd } = setup()
    const planFile = join(home, 'plan.json')
    const toFile = await run(['plan', '-o', planFile], cwd, env, { plugins: noted() })
    expect(toFile.code).toBe(0)
    noteLines(toFile.err)
    const toStdout = await run(['plan'], cwd, env, { plugins: noted() })
    noteLines(toStdout.err)
    expect(JSON.parse(toStdout.out).candidates).toHaveLength(1)
  })

  test("clean prints each plugin's detect note as a warning line, and its json carries them under notes", async () => {
    const { env, home, cwd } = setup()
    const swept = await run(['clean', '--dry-run'], cwd, env, { plugins: noted() })
    expect(swept.code).toBe(0)
    noteLines(swept.err)
    const dry = await run(['clean', '--dry-run', '--format', 'json'], cwd, env, {
      plugins: noted(),
    })
    noteLines(dry.err)
    expect(JSON.parse(dry.out)).toMatchObject({
      dryRun: true,
      notes: NOTES,
      run: ['artifact:orcish'],
    })

    // With a saved plan, the notes are the re-check's.
    const planFile = join(home, 'plan.json')
    await run(['plan', '-o', planFile], cwd, env, { plugins: noted() })
    const later = await run(['clean', '--plan', planFile, '--dry-run'], cwd, env, {
      plugins: noted(),
    })
    noteLines(later.err)
    const plugins = noted()
    const done = await run(['clean', '--plan', planFile, '--yes', '--format', 'json'], cwd, env, {
      plugins,
    })
    expect(done.code).toBe(0)
    noteLines(done.err)
    expect(JSON.parse(done.out)).toMatchObject({ notes: NOTES, receipt: { status: 'complete' } })
  })

  test('plan writes one file, and clean --plan runs it into a receipt and a log line', async () => {
    const { env, home, cwd } = setup()
    const plugin = fake()
    const planFile = join(home, 'plan.json')
    expect((await run(['plan', '-o', planFile], cwd, env, { plugins: [plugin] })).code).toBe(0)
    expect(JSON.parse(readFileSync(planFile, 'utf8')).candidates).toHaveLength(1)
    const r = await run(['clean', '--plan', planFile, '--yes'], cwd, env, { plugins: [plugin] })
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

  test('clean --plan checks the targets the plan was made over, whatever the directory', async () => {
    const { env } = setup()
    const dir = repo()
    const elsewhere = tempDir()
    const planFile = join(tempDir(), 'plan.json')
    expect((await run(['plan', dir, '-o', planFile], elsewhere, env)).code).toBe(0)
    expect(JSON.parse(readFileSync(planFile, 'utf8')).targets).toEqual([dir])
    const r = await run(['clean', '--plan', planFile, '--yes'], elsewhere, env)
    expect(r.code).toBe(0)
    expect(new Git(dir).rawChecked(['branch', '--format=%(refname:short)']).stdout).not.toContain(
      'merged-a',
    )
  })

  test('a plugins.git entry with an unknown key is refused, naming the plugin and the key', async () => {
    const { env, cwd, home } = setup()
    const config = join(home, 'config.json')
    writeFileSync(config, JSON.stringify({ plugins: { git: { offline: true } } }))
    const r = await run(['status', '--config', config], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('plugins.git')
    expect(r.err).toContain('offline')
  })

  test('clean with the real git plugin deletes the merged branch and spares the unmerged one', async () => {
    const { env } = setup()
    const dir = repo()
    const r = await run(['clean', '--yes'], dir, env)
    expect(r.code).toBe(0)
    const branches = new Git(dir).rawChecked(['branch', '--format=%(refname:short)']).stdout
    expect(branches).not.toContain('merged-a')
    expect(branches).toContain('topic')
    expect(r.out).not.toContain(':topic')
  })

  test('a protest is skipped until its code is allowed by name', async () => {
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
    const skipped = await run(['clean', '--yes'], cwd, env, { plugins: [plugin] })
    expect(plugin.removed).toEqual([])
    expect(skipped.out).toContain('would delete: 0')
    const done = await run(['clean', '--yes', '--allow', 'lossy'], cwd, env, { plugins: [plugin] })
    expect(done.code).toBe(0)
    expect(plugin.removed).toEqual(['artifact:fake'])
  })

  test('--dry-run shows the steps and deletes nothing', async () => {
    const { env, cwd } = setup()
    const plugin = fake()
    const r = await run(['clean', '--dry-run'], cwd, env, { plugins: [plugin] })
    expect(r.code).toBe(0)
    expect(r.out).toContain('delete  artifact:fake')
    expect(plugin.removed).toEqual([])
    expect(existsSync(join(hostDirs(env).state, 'receipts'))).toBe(false)
  })

  test('without --yes it asks; no terminal refuses with 2, a no deletes nothing', async () => {
    const { env, cwd } = setup()
    const plugin = fake()
    expect((await run(['clean'], cwd, env, { plugins: [plugin] })).code).toBe(2)
    const no = await run(['clean'], cwd, env, { plugins: [plugin], confirm: () => false })
    expect(no.code).toBe(0)
    expect(no.err).toContain('nothing deleted')
    expect(plugin.removed).toEqual([])
    const yes = await run(['clean'], cwd, env, { plugins: [plugin], confirm: () => true })
    expect(yes.code).toBe(0)
    expect(plugin.removed).toEqual(['artifact:fake'])
  })

  test('a failed delete exits 11 and the receipt says which', async () => {
    const { env, cwd } = setup()
    const broken: Plugin = {
      ...fake(),
      delete: () => {
        throw new Error('disk on fire')
      },
    }
    const r = await run(['clean', '--yes', '--format', 'json'], cwd, env, { plugins: [broken] })
    expect(r.code).toBe(11)
    expect(JSON.parse(r.out).receipt.steps[0]).toMatchObject({
      result: 'failed',
      error: 'disk on fire',
    })
  })

  test('--plan - reads stdin, and needs --yes or --dry-run', async () => {
    const { env, cwd } = setup()
    const plugin = fake()
    const planned = (await run(['plan'], cwd, env, { plugins: [plugin] })).out
    expect((await run(['clean', '--plan', '-'], cwd, env, { plugins: [plugin] })).code).toBe(2)
    const r = await run(['clean', '--plan', '-', '--yes'], cwd, env, {
      plugins: [plugin],
      readStdin: () => planned,
    })
    expect(r.code).toBe(0)
    expect(plugin.removed).toEqual(['artifact:fake'])
  })

  test('options that contradict each other are refused', async () => {
    const { env, cwd, home } = setup()
    const f = join(home, 'p.json')
    expect((await run(['clean', '--yes', '--dry-run'], cwd, env)).code).toBe(2)
    expect((await run(['clean', '--dry-run', '--receipt', f], cwd, env)).code).toBe(2)
    expect((await run(['clean', '--plan', f, '--pick', 'x'], cwd, env)).code).toBe(2)
    expect((await run(['clean', '--plan', f, '--spare', 'x'], cwd, env)).code).toBe(2)
    expect((await run(['clean', '--plan', f, '--worktrees'], cwd, env)).code).toBe(2)
    expect((await run(['clean', '-i', '--pick', 'x'], cwd, env)).code).toBe(2)
    expect((await run(['clean', '-i', '--plan', '-'], cwd, env)).code).toBe(2)
    const both = await run(['clean', '--pick', 'a:x', '--spare', 'a:x', '--dry-run'], cwd, env, {
      plugins: [fake()],
    })
    expect(both.code).toBe(2)
    expect(both.err).toContain('a:x is both picked and spared')
  })

  test('--pick adds a candidate held for review to the default; --spare takes one away', async () => {
    const { env, cwd } = setup()
    const held = fake('held', { candidate: { held: true } })
    const plain = fake('plain')
    const plugins = [held, plain]
    const ran = async (argv: string[]) =>
      JSON.parse(
        (await run(['clean', '--dry-run', '--format', 'json', ...argv], cwd, env, { plugins })).out,
      ).run
    expect(await ran([])).toEqual(['artifact:plain'])
    expect(await ran(['--pick', 'artifact:held'])).toEqual(['artifact:plain', 'artifact:held'])
    expect(await ran(['--spare', 'artifact:plain'])).toEqual([])
    expect(await ran(['--spare', 'artifact:*', '--pick', 'artifact:held'])).toEqual([])
  })

  test('a lost candidate is never in the default: it runs only when picked and discard-user-data is allowed', async () => {
    const { env, cwd } = setup()
    const plugins = [fake('lost', { candidate: { costDescription: 'lost' } }), fake('plain')]
    const preview = async (argv: string[]) =>
      JSON.parse(
        (await run(['clean', '--dry-run', '--format', 'json', ...argv], cwd, env, { plugins })).out,
      )
    expect((await preview([])).run).toEqual(['artifact:plain'])
    expect((await preview(['--allow', 'discard-user-data'])).run).toEqual(['artifact:plain'])
    const picked = await preview(['--pick', 'artifact:lost'])
    expect(picked.run).toEqual(['artifact:plain'])
    expect(picked.dropped).toEqual([
      { id: 'artifact:lost', reason: 'not-allowed', detail: 'needs --allow discard-user-data' },
    ])
    expect(
      (await preview(['--pick', 'artifact:lost', '--allow', 'discard-user-data'])).run,
    ).toEqual(['artifact:plain', 'artifact:lost'])
  })

  test('status shows what deleting each candidate costs, and the protest a lost one carries', async () => {
    const { env, cwd } = setup()
    const plugins = [
      fake('lost', { candidate: { costDescription: 'lost' } }),
      fake('built', { candidate: { costDescription: 'rebuild' } }),
      fake('plain'),
    ]
    const out = (await run(['status'], cwd, env, { plugins })).out
    expect(out).toContain('  review  lost        artifact:lost')
    expect(out).toContain('protest discard-user-data (host-cleaner)')
    expect(out).toContain('  delete  rebuild     artifact:built')
    expect(out).toContain('  delete  -           artifact:plain')
  })

  test('status shows an id under the home folder with ~, and --pick and --spare take that form', async () => {
    const { env: base, cwd } = setup()
    const home = tempDir()
    const env = { ...base, HOME: home }
    const dir = join(home, 'dev', 'cache')
    const plugins = [fake('cache', { candidate: { id: `artifact:${dir}`, held: true } })]
    const status = await run(['status'], cwd, env, { plugins })
    expect(status.out).toMatch(/review\s+-\s+artifact:~\/dev\/cache/)
    expect(status.out).not.toContain(home)
    const ran = async (argv: string[]) =>
      JSON.parse(
        (await run(['clean', '--dry-run', '--format', 'json', ...argv], cwd, env, { plugins })).out,
      ).run
    expect(await ran(['--pick', 'artifact:~/dev/cache'])).toEqual([`artifact:${dir}`])
    expect(await ran(['--pick', 'artifact:~/dev/cache', '--spare', 'artifact:~/dev/*'])).toEqual([])
  })

  test('~ stands for the home folder right after the kind, a branch id included', () => {
    expect(tildeId('branch:/h/me/repo:main', '/h/me')).toBe('branch:~/repo:main')
    expect(tildeId('branch:/h/me:main', '/h/me')).toBe('branch:~:main')
    expect(tildeId('worktree:/h/meow/x', '/h/me')).toBe('worktree:/h/meow/x')
    expect(untildeId('branch:~/repo:main', '/h/me')).toBe('branch:/h/me/repo:main')
    expect(untildeId('~/x', '/h/me')).toBe('/h/me/x')
    expect(untildeId('feat/~x', '/h/me')).toBe('feat/~x')
  })

  test('a --pick with ~ matches when HOME goes through a symlink, whichever spelling the id has, and status shows ~', async () => {
    const { env: base, cwd } = setup()
    const real = tempDir()
    const link = join(tempDir(), 'home')
    symlinkSync(real, link)
    const env = { ...base, HOME: link }
    expect(tildeId(`worktree:${real}/wt`, link)).toBe('worktree:~/wt')
    expect(tildeId(`worktree:${link}/wt`, link)).toBe('worktree:~/wt')
    for (const home of [real, link]) {
      const id = `artifact:${join(home, 'dev', 'cache')}`
      const plugins = [fake('cache', { candidate: { id, held: true } })]
      expect((await run(['status'], cwd, env, { plugins })).out).toContain('artifact:~/dev/cache')
      const clean = ['clean', '--dry-run', '--format', 'json', '--pick', 'artifact:~/dev/cache']
      const picked = JSON.parse((await run(clean, cwd, env, { plugins })).out)
      expect(picked).toMatchObject({ run: [id], dropped: [] })
      const planned = await run(['plan', '-o', '-', '--pick', 'artifact:~/dev/cache'], cwd, env, {
        plugins,
      })
      expect(JSON.parse(planned.out).pick).toEqual([id])
    }
    // One that names nothing is dropped once, under HOME as given.
    const plugins = [fake('cache')]
    const none = ['clean', '--dry-run', '--format', 'json', '--pick', 'artifact:~/none']
    expect(JSON.parse((await run(none, cwd, env, { plugins })).out).dropped).toEqual([
      expect.objectContaining({ id: `artifact:${link}/none`, reason: 'gone' }),
    ])
  })

  test('a --spare with ~ matches whether HOME ends in a slash or is a symlink', async () => {
    const { env: base, cwd } = setup()
    const real = tempDir()
    const link = join(tempDir(), 'home')
    symlinkSync(real, link)
    expect(untildeSpare('worktree:~/wt', link)).toEqual([
      `worktree:${link}/wt`,
      `worktree:${real}/wt`,
    ])
    expect(untildeSpare('worktree:~/wt', real)).toEqual([`worktree:${real}/wt`])
    const dir = join(real, 'dev', 'cache')
    const plugins = [fake('cache', { candidate: { id: `artifact:${dir}` } })]
    const ran = async (HOME: string, spare: string[] = ['--spare', 'artifact:~/dev/cache']) => {
      const argv = ['clean', '--dry-run', '--format', 'json', ...spare]
      return JSON.parse((await run(argv, cwd, { ...base, HOME }, { plugins })).out).run
    }
    expect(await ran(`${real}/`, [])).toEqual([`artifact:${dir}`])
    expect(await ran(`${real}/`)).toEqual([])
    expect(await ran(link)).toEqual([])
  })

  test('a plan of another version is refused: sweep again', async () => {
    const { env, home, cwd } = setup()
    const v1 = {
      version: 1,
      createdAt: '2026-01-01T00:00:00.000Z',
      targets: [cwd],
      select: null,
      pick: [],
      spare: [],
      allow: [],
      ignore: [],
      warnings: [],
      candidates: [],
      objections: [],
    }
    const refusal = `v1.json: a version 1 plan; this host-cleaner reads version ${PLAN_VERSION}: sweep again`
    expect(() => parsePlan(JSON.stringify(v1), 'v1.json')).toThrow(refusal)
    const planFile = join(home, 'v1.json')
    writeFileSync(planFile, JSON.stringify(v1))
    const r = await run(['clean', '--plan', planFile, '--dry-run'], cwd, env, {
      plugins: [fake()],
    })
    expect(r.code).not.toBe(0)
    expect(r.err).toContain('a version 1 plan; this host-cleaner reads version 2: sweep again')
  })

  test('a version 2 plan without targetsGiven is refused: sweep again', async () => {
    const { env, home, cwd } = setup()
    const old = {
      version: PLAN_VERSION,
      createdAt: '2026-01-01T00:00:00.000Z',
      targets: [cwd],
      select: null,
      pick: [],
      spare: [],
      allow: [],
      ignore: [],
      warnings: [],
      candidates: [],
      objections: [],
    }
    const refusal =
      /^old\.json: a version 2 plan this host-cleaner cannot read \(targetsGiven: .*\): sweep again$/
    expect(() => parsePlan(JSON.stringify(old), 'old.json')).toThrow(refusal)
    expect(
      parsePlan(JSON.stringify({ ...old, targetsGiven: false }), 'new.json').targetsGiven,
    ).toBe(false)
    const planFile = join(home, 'old.json')
    writeFileSync(planFile, JSON.stringify(old))
    const r = await run(['clean', '--plan', planFile, '--dry-run'], cwd, env, {
      plugins: [fake()],
    })
    expect(r.code).toBe(1)
    expect(r.err).toContain('a version 2 plan this host-cleaner cannot read (targetsGiven: ')
    expect(r.err).toContain('): sweep again')
  })

  test('-i runs exactly the ticked candidates and asks for their protests by code', async () => {
    const { env, cwd } = setup()
    const objections: Objection[] = [
      { by: 'b', candidate: 'artifact:b', level: 'protest', code: 'lossy', reason: 'loses data' },
    ]
    const a = fake('a')
    const b = fake('b', { objections })
    const shown: string[] = []
    const asked: string[] = []
    const r = await run(['clean', '-i', '--yes'], cwd, env, {
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

  test('a candidate blocked by one it requires names it and what it needs, in the preview and the checklist', async () => {
    const { env, cwd } = setup()
    const plugins = () => [
      fake('outer', { candidate: { requires: ['artifact:inner'] } }),
      fake('inner', { candidate: { unmeasured: true } }),
    ]
    const why = 'requires artifact:inner, which needs --allow unmeasured'
    const r = await run(['clean', '--dry-run'], cwd, env, { plugins: plugins() })
    expect(r.out).toContain(`  skip    artifact:outer\n          blocked: ${why}\n`)
    const shown: string[] = []
    await run(['clean', '-i', '--dry-run'], cwd, env, {
      plugins: plugins(),
      checklist: (_q, items) => {
        shown.push(...items.map((i) => i.label))
        return []
      },
    })
    expect(shown).toEqual([
      `artifact:outer  delete: idle for a week (blocked: ${why})`,
      'artifact:inner  review: idle for a week',
    ])
  })

  test('-i with no terminal is refused with exit 2', async () => {
    const { env, cwd } = setup()
    expect((await run(['clean', '-i'], cwd, env, { plugins: [fake()] })).code).toBe(2)
  })

  test('a plan that moved since is dropped as changed', async () => {
    const { env, cwd, home } = setup()
    let bytes = 10
    const plugin: Plugin = {
      ...fake(),
      discover: async (x) => [{ ...(await fake().discover!(x))[0]!, evidence: { bytes } }],
    }
    const planFile = join(home, 'plan.json')
    await run(['plan', '-o', planFile], cwd, env, { plugins: [plugin] })
    bytes = 99
    const r = await run(['clean', '--plan', planFile, '--yes'], cwd, env, { plugins: [plugin] })
    expect(r.out).toContain('skip    artifact:fake')
    expect(r.out).toContain('changed')
  })

  test('--help and a missing plan file', async () => {
    const { env, cwd } = setup()
    expect((await run(['clean', '--help'], cwd, env)).code).toBe(0)
    expect((await run(['clean', '--plan', join(cwd, 'nope.json'), '--yes'], cwd, env)).code).toBe(1)
  })
})
