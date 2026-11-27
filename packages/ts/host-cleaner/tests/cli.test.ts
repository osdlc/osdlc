/** The `host-cleaner` CLI driven in process: exit codes, refusals, and plan to receipt through fake plugins and the real git plugin. */

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir, userInfo } from 'node:os'
import { dirname, join } from 'node:path'

import { captureContext } from '@osdlc/cli-tool'
import { Git } from '@osdlc/typed-git'
import { IDENTITY, makeGitFixture } from '@osdlc/typed-git/testing'

import { main, type MainDeps } from '../src/cli.ts'
import { configFile, hostDirs, unreadNativeConfig } from '../src/config.ts'
import type { Candidate, Objection, Plugin } from '../src/index.ts'

const cleanups: Array<() => void> = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
  vi.unstubAllEnvs()
})

// These tests run `clean --yes` with the shipped plugins. One that read this process's environment
// in place of the run's would find no one's own home: it is a temporary folder here, not a test's.
beforeEach(() => {
  const nobody = tempDir()
  vi.stubEnv('HOME', nobody)
  vi.stubEnv('VSCODE_APPDATA', nobody)
  vi.stubEnv('XDG_CONFIG_HOME', nobody)
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
  // The shipped plugins would talk to this machine's Orca and sweep every repository it lists,
  // and run its rustup, which on a macOS runner took half a minute a run, filling the decoy home.
  const phase = ['status', 'plan', 'clean'].includes(argv[0] ?? '')
  const skip = ['--skip-plugin', 'orca', '--skip-plugin', 'cargo']
  const args = phase && deps.plugins === undefined ? [...argv, ...skip] : argv
  const code = main(args, ctx, { confirm: () => null, ...deps })
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
      JSON.parse(
        run(['status', '--plugin', 'git', ...argv, '--format', 'json'], dir, env).out,
      ).candidates.map((c: Candidate) => c.kind)
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
    writeFileSync(config, JSON.stringify({ plugins: { cargo: { idleHours: 'soon' } } }))
    const bad = run(['status', '--config', config], cwd, env)
    expect(bad.code).toBe(2)
    expect(bad.err).toContain('plugins.cargo.idleHours')
    writeFileSync(config, JSON.stringify({ plugins: { ghost: {} } }))
    const r = run(['status', '--config', config], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('ghost')
  })

  test('there are no profiles: --profile is an unknown option and a profiles key is refused', () => {
    const { env, home, cwd } = setup()
    const flag = run(['status', '--profile', 'x'], cwd, env)
    expect(flag.code).toBe(2)
    expect(flag.err).toContain("unknown option '--profile'")
    const config = join(home, 'c.json')
    writeFileSync(config, JSON.stringify({ profiles: { deep: { idleHours: 0 } } }))
    const r = run(['status', '--config', config], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('profiles')
  })
})

describe('plugin settings', () => {
  const withConfig = (config: unknown) => {
    const { env, cwd, home } = setup()
    const file = join(home, 'config.json')
    writeFileSync(file, JSON.stringify(config))
    return { env, cwd, file }
  }

  test('a misspelt key and a wrong type are refused, each naming the plugin and the key', () => {
    const { env, cwd, file } = withConfig({
      plugins: { cargo: { idlehours: 3 }, node: { idleHours: -1, enabled: 'yes' } },
    })
    const r = run(['status', '--config', file], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('plugins.cargo')
    expect(r.err).toContain('idlehours')
    expect(r.err).toContain('plugins.node.idleHours')
    expect(r.err).toContain('plugins.node.enabled')
  })

  test('enabled: false leaves a plugin out, and --plugin runs it anyway', () => {
    const { env, cwd, file } = withConfig({ plugins: { fake: { enabled: false } } })
    const plugins = [fake('fake'), fake('other')]
    const status = (...extra: string[]) =>
      run(['status', '--config', file, ...extra], cwd, env, { plugins }).out
    expect(status()).not.toContain('artifact:fake')
    expect(status()).toContain('artifact:other')
    expect(status('--plugin', 'fake')).toContain('artifact:fake')
  })

  test('config prints each plugin’s settings with defaults and what the file set', () => {
    const { env, cwd, file } = withConfig({
      targets: ['~/dev'],
      plugins: { cargo: { idleHours: 48 }, node: { enabled: false } },
    })
    const text = run(['config', '--config', file], cwd, env)
    expect(text.code).toBe(0)
    expect(text.out).toContain(`file: ${file}\n`)
    expect(text.out).toContain('targets: ~/dev')
    expect(text.out).toMatch(/plugins\.cargo\n {2}enabled = true {2}\(default\)/)
    expect(text.out).toMatch(/idleHours = 48 {2}\(config\)/)
    expect(text.out).toMatch(/plugins\.node\n {2}enabled = false {2}\(config\)/)
    expect(text.out).toMatch(/idleHours = 24 {2}\(default\)/)
    const json = JSON.parse(run(['config', '--config', file, '--format', 'json'], cwd, env).out)
    expect(json.plugins.cargo).toEqual({ enabled: true, idleHours: 48 })
    expect(json.plugins.git).toEqual({ enabled: true })
  })

  test('config refuses a bad config and a plugin nobody has', () => {
    const bad = withConfig({ plugins: { cargo: { nope: 1 } } })
    expect(run(['config', '--config', bad.file], bad.cwd, bad.env).code).toBe(2)
    const ghost = withConfig({ plugins: { ghost: {} } })
    const r = run(['config', '--config', ghost.file], ghost.cwd, ghost.env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('ghost')
  })
})

describe('folders', () => {
  /** `hostDirs` with `/` separators, so the expectations hold on any host. */
  const posixDirs = (...args: Parameters<typeof hostDirs>): Record<string, string> =>
    Object.fromEntries(
      Object.entries(hostDirs(...args)).map(([k, p]) => [k, p.replaceAll('\\', '/')]),
    )

  /** A home, a directory and a `--config` file, on a machine `main` takes for a Mac. */
  const macHome = (): { home: string; cwd: string; file: string } => {
    const real = Object.getOwnPropertyDescriptor(process, 'platform')!
    cleanups.push(() => Object.defineProperty(process, 'platform', real))
    Object.defineProperty(process, 'platform', { ...real, value: 'darwin' })
    const home = tempDir()
    const file = join(home, 'config.json')
    writeFileSync(file, '{}')
    return { home, cwd: tempDir(), file }
  }

  test('macOS uses the xdg folders, as Linux does', () => {
    for (const platform of ['darwin', 'linux']) {
      expect(posixDirs({}, { platform, home: '/home/me' })).toEqual({
        config: '/home/me/.config/host-cleaner',
        state: '/home/me/.local/state/host-cleaner',
        logs: '/home/me/.local/state/host-cleaner',
      })
    }
  })

  test('the XDG and HOST_CLEANER variables move them on macOS too', () => {
    const opts = { platform: 'darwin', home: '/home/me' }
    expect(posixDirs({ XDG_CONFIG_HOME: '/x/cfg', XDG_STATE_HOME: '/x/st' }, opts)).toEqual({
      config: '/x/cfg/host-cleaner',
      state: '/x/st/host-cleaner',
      logs: '/x/st/host-cleaner',
    })
    expect(posixDirs({ HOST_CLEANER_ROOT: '/r' }, opts).config).toBe('/r/config/host-cleaner')
    expect(posixDirs({ HOST_CLEANER_CONFIG_DIR: '/c' }, opts).config).toBe('/c/host-cleaner')
  })

  test('config strips control characters from the file path it prints', () => {
    const { env, cwd } = setup()
    const dir = join(cwd, 'a\u001b]0;x\u0007b')
    const r = run(['config'], cwd, { ...env, HOST_CLEANER_CONFIG_DIR: dir })
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/^file: .*host-cleaner/m)
    expect(r.out).not.toContain('\u001b')
    expect(r.out).not.toContain('\u0007')
  })

  test('config names the default config file and says it is missing', () => {
    const { env, cwd } = setup()
    const file = configFile(hostDirs(env))
    const r = run(['config'], cwd, env)
    expect(r.code).toBe(0)
    expect(r.out).toContain(`file: ${file}  (not found: defaults)\n`)
    const json = JSON.parse(run(['config', '--format', 'json'], cwd, env).out)
    expect(json).toMatchObject({ file, fileExists: false })
  })

  test('HOST_CLEANER_CONVENTION=native gives back the macOS folders', () => {
    const dirs = posixDirs(
      { HOST_CLEANER_CONVENTION: 'native' },
      { platform: 'darwin', home: '/Users/me' },
    )
    expect(dirs).toEqual({
      config: '/Users/me/Library/Application Support/host-cleaner',
      state: '/Users/me/Library/Application Support/host-cleaner',
      logs: '/Users/me/Library/Logs/host-cleaner',
    })
  })

  test('Windows keeps its own folders under xdg', () => {
    const env = { APPDATA: 'C:\\Users\\me\\AppData\\Roaming' }
    const opts = { platform: 'win32', home: 'C:\\Users\\me' }
    expect(hostDirs(env, opts).config).toBe(
      hostDirs({ ...env, HOST_CLEANER_CONVENTION: 'native' }, opts).config,
    )
    expect(posixDirs(env, opts).config).toBe('C:/Users/me/AppData/Roaming/host-cleaner')
  })

  /** `unreadNativeConfig` beside the config file `hostDirs` names. */
  const unread = (
    env: Record<string, string>,
    opts: Parameters<typeof hostDirs>[1],
  ): string | undefined => unreadNativeConfig(env, configFile(hostDirs(env, opts)), opts)

  test('a config left in the macOS folders by 0.3 is named, never read', () => {
    const home = tempDir()
    const mac = { platform: 'darwin', home }
    expect(unread({}, mac)).toBeUndefined()
    const old = join(home, 'Library', 'Application Support', 'host-cleaner', 'config.json')
    mkdirSync(dirname(old), { recursive: true })
    writeFileSync(old, 'not json')
    expect(unread({}, mac)?.replaceAll('\\', '/')).toBe(old.replaceAll('\\', '/'))
    // Where the native and xdg folders are the same, there is nothing left behind.
    expect(unread({ HOST_CLEANER_ROOT: '/r' }, mac)).toBeUndefined()
    expect(unread({ HOST_CLEANER_CONVENTION: 'native' }, mac)).toBeUndefined()
    const linuxOld = join(home, '.config', 'host-cleaner', 'config.json')
    mkdirSync(dirname(linuxOld), { recursive: true })
    writeFileSync(linuxOld, '{}')
    expect(unread({}, { platform: 'linux', home })).toBeUndefined()
  })

  test.skipIf(process.platform === 'win32')(
    'every command warns about a config left in the macOS folders, and does not read it',
    () => {
      const { home, cwd, file: named } = macHome()
      const old = join(home, 'Library', 'Application Support', 'host-cleaner', 'config.json')
      const env = { PATH: process.env.PATH ?? '', HOME: home }
      const commands = [['config'], ['status', cwd], ['plan', cwd], ['clean', '--yes', cwd]]
      for (const args of commands) {
        expect(run(args, cwd, env, { plugins: [fake()] }).err).not.toContain('is not read')
      }
      mkdirSync(dirname(old), { recursive: true })
      writeFileSync(old, 'not json')
      for (const args of commands) {
        const r = run(args, cwd, env, { plugins: [fake()] })
        expect(r.code, args.join(' ')).toBe(0)
        const lines = r.err.split('\n').filter((l) => l.includes('is not read'))
        expect(lines, args.join(' ')).toEqual([
          `host-cleaner ${args[0]}: ${old} is not read; the config is now ${configFile(hostDirs(env))}`,
        ])
        // A config the person named is read whatever the folders hold.
        const given = run([...args, '--config', named], cwd, env, { plugins: [fake()] })
        expect(given.err).not.toContain('is not read')
      }
      // As JSON, status reports it with its other warnings.
      const r = run(['status', '--format', 'json', cwd], cwd, env, { plugins: [fake()] })
      expect(r.err).toBe('')
      expect(JSON.parse(r.out).warnings).toEqual([
        `${old} is not read; the config is now ${configFile(hostDirs(env))}`,
      ])
    },
  )

  test.skipIf(process.platform === 'win32')(
    'folders placed by XDG_CONFIG_HOME and XDG_STATE_HOME alone need no home',
    () => {
      const { home, cwd } = macHome()
      const xdg = { XDG_CONFIG_HOME: join(home, 'cfg'), XDG_STATE_HOME: join(home, 'st') }
      expect(hostDirs(xdg, { platform: 'darwin' }).config).toBe(join(home, 'cfg', 'host-cleaner'))
      expect(unread(xdg, { platform: 'darwin' })).toBeUndefined()
      const env = { PATH: process.env.PATH ?? '', ...xdg }
      for (const args of [['config'], ['status', cwd], ['plan', '-o', '-', cwd]]) {
        const r = run(args, cwd, env, { plugins: [fake()] })
        expect(r.err, args.join(' ')).toBe('')
        expect(r.code, args.join(' ')).toBe(0)
      }
    },
  )

  test('with process.env and no HOME, the folders are still placed', () => {
    for (const name of ['HOME', 'XDG_CONFIG_HOME', 'XDG_STATE_HOME', 'HOST_CLEANER_ROOT']) {
      vi.stubEnv(name, undefined)
    }
    for (const key of ['CONFIG', 'STATE', 'LOGS']) vi.stubEnv(`HOST_CLEANER_${key}_DIR`, undefined)
    // tiered-dirs' own rules apply: in a test process, its temporary test root;
    // elsewhere, the OS account's home.
    expect(hostDirs(process.env).config.startsWith(tmpdir())).toBe(true)
  })

  test('with no home, --config still works and clean exits 1', () => {
    const { cwd, home } = setup()
    const file = join(home, 'config.json')
    writeFileSync(file, '{}')
    const env = { PATH: process.env.PATH ?? '' }
    for (const args of [
      ['config', '--config', file],
      ['status', '--config', file, cwd],
      ['plan', '--config', file, cwd],
      ['clean', '--dry-run', '--config', file, cwd],
    ]) {
      const r = run(args, cwd, env, { plugins: [fake()] })
      expect(r.err, args.join(' ')).toBe('')
      expect(r.code, args.join(' ')).toBe(0)
    }
    const plugin = fake()
    const r = run(['clean', '--yes', '--config', file, cwd], cwd, env, { plugins: [plugin] })
    expect(r.code).toBe(1)
    expect(r.err).toContain('no home directory')
    expect(plugin.removed).toEqual([])
    expect(run(['config'], cwd, env).code).toBe(1)
  })

  test('`~` is the home the folders are built on, and with none a `~` path is refused', () => {
    const { cwd, home } = setup()
    const file = join(home, 'config.json')
    writeFileSync(file, JSON.stringify({ ignore: ['~/keep'] }))
    const candidate = { path: join(home, 'keep', 'cache') }
    const base = { PATH: process.env.PATH ?? '', HOST_CLEANER_ROOT: home }
    const clean = (env: Record<string, string>) => {
      const plugin = fake('fake', { candidate })
      return {
        ...run(['clean', '--yes', '--config', file, cwd], cwd, env, { plugins: [plugin] }),
        removed: plugin.removed,
      }
    }
    const kept = clean({ ...base, HOME: home, USERPROFILE: home })
    expect(kept.err).toContain('left out 1 candidate(s)')
    expect(kept.removed).toEqual([])
    // An empty or relative HOME is no home, as for the folders; `~/keep` is
    // then refused, not read as `/keep` or `<cwd>/rel/keep`, which cover nothing.
    const noHome: Array<Record<string, string>> = [
      { ...base, HOME: '' },
      { ...base, HOME: 'rel' },
      base,
    ]
    for (const env of noHome) {
      const r = clean(env)
      expect(r.code, JSON.stringify(env['HOME'])).toBe(1)
      expect(r.err).toContain('cannot expand `~`')
      expect(r.removed).toEqual([])
    }
    // A `~` target is refused the same way, by a command that deletes nothing too.
    writeFileSync(file, JSON.stringify({ targets: ['~/dev'] }))
    const r = run(['status', '--config', file], cwd, base, { plugins: [fake()] })
    expect(r.code).toBe(1)
    expect(r.err).toContain('cannot expand `~`')
  })

  test('with process.env, an empty or relative HOME gives `~` the OS account home', () => {
    const { cwd, home } = setup()
    const file = join(home, 'config.json')
    writeFileSync(file, JSON.stringify({ ignore: ['~/keep'] }))
    for (const value of ['', 'rel']) {
      vi.stubEnv('HOME', value)
      vi.stubEnv('USERPROFILE', value)
      // Only `status`: it deletes nothing, and the only plugin is a fake.
      const env = process.env as Record<string, string>
      const r = run(['status', '--format', 'json', '--config', file, cwd], cwd, env, {
        plugins: [fake()],
      })
      expect(r.code, JSON.stringify(value)).toBe(0)
      expect(JSON.parse(r.out).ignore).toContain(join(userInfo().homedir, 'keep'))
    }
  })

  test('with process.env, an empty or relative HOME refuses a `~` target', () => {
    const { cwd, home } = setup()
    const file = join(home, 'config.json')
    writeFileSync(file, JSON.stringify({ targets: ['~/dev'] }))
    const empty = join(home, 'empty.json')
    writeFileSync(empty, '{}')
    for (const value of ['', 'rel']) {
      vi.stubEnv('HOME', value)
      vi.stubEnv('USERPROFILE', value)
      // A target is swept: the OS account's real `~/dev` must not stand in for it.
      const env = process.env as Record<string, string>
      for (const argv of [
        ['--config', file],
        ['--config', empty, '~/dev'],
      ]) {
        const r = run(['status', ...argv], cwd, env, { plugins: [fake()] })
        expect(r.code, JSON.stringify([value, argv])).toBe(1)
        expect(r.err).toContain('cannot expand `~` in a target')
        expect(r.out).toBe('')
      }
    }
  })

  test('HOST_CLEANER_CONVENTION is trimmed, and empty counts as unset', () => {
    const opts = { platform: 'darwin', home: '/Users/me' }
    const native = hostDirs({ HOST_CLEANER_CONVENTION: 'native' }, opts)
    expect(hostDirs({ HOST_CLEANER_CONVENTION: ' native ' }, opts)).toEqual(native)
    expect(hostDirs({ HOST_CLEANER_CONVENTION: '' }, opts)).toEqual(hostDirs({}, opts))
  })

  test('a folder variable that is not absolute is a usage error, `~` included', () => {
    const { env, cwd } = setup()
    for (const dir of ['~/cfg', 'cfg']) {
      const r = run(['config'], cwd, { ...env, HOST_CLEANER_CONFIG_DIR: dir })
      expect(r.code, dir).toBe(2)
      expect(r.err).toContain('HOST_CLEANER_CONFIG_DIR must be an absolute path')
    }
  })

  test('a bad HOST_CLEANER_CONVENTION is a usage error for every command', () => {
    const { env, cwd, home } = setup()
    const file = join(home, 'config.json')
    writeFileSync(file, '{}')
    const bad = { ...env, HOST_CLEANER_CONVENTION: 'Native' }
    for (const args of [
      ['clean', '--yes', cwd],
      ['plan', '--config', file, cwd],
      ['config', '--config', file],
      ['status', '--config', file, cwd],
    ]) {
      const r = run(args, cwd, bad)
      expect(r.code, args.join(' ')).toBe(2)
      expect(r.err).toContain('HOST_CLEANER_CONVENTION must be')
    }
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

  test('a plugins.git entry with an unknown key is refused, naming the plugin and the key', () => {
    const { env, cwd, home } = setup()
    const config = join(home, 'config.json')
    writeFileSync(config, JSON.stringify({ plugins: { git: { offline: true } } }))
    const r = run(['status', '--config', config], cwd, env)
    expect(r.code).toBe(2)
    expect(r.err).toContain('plugins.git')
    expect(r.err).toContain('offline')
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
    const held = fake('held', { candidate: { held: true } })
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
