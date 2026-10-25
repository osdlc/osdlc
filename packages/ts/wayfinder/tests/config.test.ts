import { afterAll, describe, expect, test } from 'vitest'
import { spawnSync } from 'node:child_process'
import { lstat, mkdir, readFile, symlink } from 'node:fs/promises'
import { userInfo } from 'node:os'
import { join } from 'node:path'

import { expandTrustPath, resolveTrustRoot } from '@osdlc/trust-repo'

import {
  CONFIG_ENV_VAR,
  CONFIG_SCHEMA_URL,
  ConfigError,
  DEFAULT_CONFIG,
  collectOptionsFromConfig,
  configLocations,
  getConfigValue,
  loadConfig,
  mergeConfig,
  movedUserConfigWarning,
  orderRunners,
  parseConfigValue,
  readConfigFile,
  readRawConfigFile,
  removeSetting,
  setConfigValue,
  trustPolicyFromConfig,
  unsetConfigValue,
  validateConfig,
  writeConfigFile,
  writeSetting,
} from '../src/config.ts'
import { CONFIG_HOME, USER_CONFIG, fixtureRoot, removeRoot } from './support.ts'

const WINDOWS = process.platform === 'win32'

const roots: string[] = []
afterAll(async () => {
  await Promise.all(roots.map(removeRoot))
})

async function root(files: Record<string, string> = {}): Promise<string> {
  const dir = await fixtureRoot(files)
  roots.push(dir)
  return dir
}

/** Every test injects its environment: none of them may see the real one. */
function env(vars: Record<string, string | undefined> = {}): Record<string, string | undefined> {
  return vars
}

describe('configLocations', () => {
  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)('puts the user layer under XDG_CONFIG_HOME when it is set', () => {
    const at = configLocations('/repo', env({ XDG_CONFIG_HOME: '/xdg' }), '/home/dev')
    expect(at.user).toBe('/xdg/wayfinder/config.json')
    expect(at.userFromEnv).toBe(false)
  })

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)('falls back to ~/.config on every platform, macOS included', () => {
    // Deliberate, and a choice rather than a universal macOS convention: this
    // follows gh's layout, so a dotfiles repo finds config where the rest of a
    // developer's tool configuration already lives. See `xdgHome` for the cost.
    const at = configLocations('/repo', env(), '/home/dev')
    expect(at.user).toBe('/home/dev/.config/wayfinder/config.json')
  })

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)('treats an empty XDG_CONFIG_HOME as unset', () => {
    // An exported-but-empty variable is a common shell accident, and joining
    // onto "" would point the user layer at /wayfinder/config.json.
    const at = configLocations('/repo', env({ XDG_CONFIG_HOME: '' }), '/home/dev')
    expect(at.user).toBe('/home/dev/.config/wayfinder/config.json')
  })

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)(
    'WAYFINDER_CONFIG replaces the user location and leaves the project one alone',
    () => {
      // The env var moves one layer's file. It is not a way to disable the
      // project layer, and a user who set it in their shell profile must still
      // get the project's settings in every repo they enter.
      const at = configLocations(
        '/repo',
        env({ [CONFIG_ENV_VAR]: '/elsewhere/mine.json', XDG_CONFIG_HOME: '/xdg' }),
        '/home/dev',
      )
      expect(at.user).toBe('/elsewhere/mine.json')
      expect(at.userFromEnv).toBe(true)
      expect(at.project).toBe('/repo/wayfinder.config.json')
    },
  )

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)(
    'expands a leading ~ in WAYFINDER_CONFIG rather than making a literal directory',
    () => {
      // A shell expands ~ before exec, but .env loaders, direnv and CI YAML pass
      // the tilde through literally, and <cwd>/~/cfg.json is a silent wrong answer.
      const at = configLocations('/repo', env({ [CONFIG_ENV_VAR]: '~/cfg.json' }), '/home/dev')
      expect(at.user).toBe('/home/dev/cfg.json')
    },
  )

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)('ignores a relative WAYFINDER_CONFIG and says so', () => {
    for (const value of ['cfg/mine.json', './cfg.json', 'cfg.json']) {
      const at = configLocations('/repo', env({ [CONFIG_ENV_VAR]: value }), '/home/dev')
      expect(at.user).toBe('/home/dev/.config/wayfinder/config.json')
      expect(at.userFromEnv).toBe(false)
      expect(at.userEnvVar).toBeNull()
      expect(at.userEnvIgnored).toEqual({ variable: CONFIG_ENV_VAR, value })
    }
  })

  test('a relative WAYFINDER_CONFIG never names a file in the root, even when the cwd is the root', async () => {
    // The usual way to run `way` is from the repository root. A repository
    // file named this way would be the user layer, which can turn exec on.
    const dir = await root({ 'cfg.json': '{"allowExec": false}' })
    const home = await root()
    const saved = process.cwd()
    process.chdir(dir)
    try {
      const loaded = await loadConfig(dir, env({ [CONFIG_ENV_VAR]: 'cfg.json' }), home)
      expect(loaded.locations.user).toBe(join(home, CONFIG_HOME, 'wayfinder', 'config.json'))
      // The repository file was not read: its false did not reach the merge.
      expect(loaded.effective.allowExec).toBe(true)
      expect(loaded.warnings.some((w) => w.includes(`${CONFIG_ENV_VAR}=cfg.json is ignored`))).toBe(
        true,
      )
    } finally {
      process.chdir(saved)
    }
  })

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)(
    'a relative HOME is treated as unset, so the user file is never under the cwd',
    () => {
      const saved = process.env['HOME']
      process.env['HOME'] = '.'
      try {
        expect(configLocations('/repo', env()).user).toBe(
          join(userInfo().homedir, CONFIG_HOME, 'wayfinder', 'config.json'),
        )
      } finally {
        process.env['HOME'] = saved
      }
    },
  )

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)('ignores a relative XDG_CONFIG_HOME, as the XDG spec says', () => {
    for (const value of ['.config', 'cfg/x', './c']) {
      const at = configLocations('/repo', env({ XDG_CONFIG_HOME: value }), '/home/dev')
      expect(at.user).toBe('/home/dev/.config/wayfinder/config.json')
    }
  })

  test('a relative XDG_CONFIG_HOME cannot make a file in the repository the user layer', async () => {
    const home = await root()
    const project = await root({
      [USER_CONFIG]: JSON.stringify({ tools: ['./x.mjs'] }),
    })
    const loaded = await loadConfig(project, env({ XDG_CONFIG_HOME: '.config' }), home)
    expect(loaded.layers.user).toBeNull()
    expect(loaded.effective.tools ?? []).toEqual([])
  })

  // POSIX only: the expected paths are POSIX paths, which Node's path module on Windows does not produce.
  test.skipIf(WINDOWS)(
    'trims a padded env value instead of resolving the whitespace into the path',
    () => {
      const at = configLocations(
        '/repo',
        env({ [CONFIG_ENV_VAR]: '  /abs/mine.json  ' }),
        '/home/dev',
      )
      expect(at.user).toBe('/abs/mine.json')
    },
  )
})

describe('movedUserConfigWarning', () => {
  test('on Windows, names a pre-0.8 user config when none is at the new path', async () => {
    const home = await root({ '.config/wayfinder/config.json': '{"allowExec": false}' })
    const user = join(home, 'AppData', 'Roaming', 'wayfinder', 'config.json')
    const at = { ...configLocations(home, env(), home), user }
    const warning = movedUserConfigWarning(at, env(), home, 'win32')
    expect(warning).toContain(join(home, '.config', 'wayfinder', 'config.json'))
    expect(warning).toContain(`move it to ${user}`)
    expect(movedUserConfigWarning(at, env(), home, 'linux')).toBeNull()
  })

  test('says nothing once the new file exists, or with no old one', async () => {
    const home = await root({
      '.config/wayfinder/config.json': '{}',
      'AppData/Roaming/wayfinder/config.json': '{}',
    })
    const user = join(home, 'AppData', 'Roaming', 'wayfinder', 'config.json')
    const at = { ...configLocations(home, env(), home), user }
    expect(movedUserConfigWarning(at, env(), home, 'win32')).toBeNull()
    const empty = await root()
    const none = { ...configLocations(empty, env(), empty), user: join(empty, 'x.json') }
    expect(movedUserConfigWarning(none, env(), empty, 'win32')).toBeNull()
  })
})

describe('mergeConfig', () => {
  test("a project scalar replaces the user's", () => {
    const merged = mergeConfig({ allowExec: false }, { allowExec: true })
    expect(merged.allowExec).toBe(true)
  })

  test('an array replaces wholesale rather than concatenating or merging elements', () => {
    // The rule that surprises people, so it is asserted directly: a project
    // saying order: ["just"] means that list, not ["moon", "just"].
    const merged = mergeConfig(
      { runners: { order: ['moon', 'cargo'] } },
      { runners: { order: ['just'] } },
    )
    expect(merged.runners?.order).toEqual(['just'])
  })

  test('an object merges key-wise, so untouched keys survive from below', () => {
    const merged = mergeConfig(
      { runners: { disabled: ['cargo'], order: ['moon'] } },
      { runners: { order: ['just'] } },
    )
    expect(merged.runners).toEqual({ disabled: ['cargo'], order: ['just'] })
  })

  test('does not mutate either input', () => {
    const base = { runners: { order: ['moon'] } }
    const over = { runners: { order: ['just'] } }
    mergeConfig(base, over)
    expect(base.runners.order).toEqual(['moon'])
    expect(over.runners.order).toEqual(['just'])
  })

  test('copies branches the upper layer never mentions', () => {
    // The aliasing that would make DEFAULT_CONFIG corruptible: a nested branch
    // `over` does not touch must not come out as the same reference, or a
    // caller mutating `effective` would rewrite the built-in defaults for every
    // later load in the process.
    const base = { runners: { order: ['moon'] } }
    const merged = mergeConfig(base, {})
    expect(merged.runners).not.toBe(base.runners)
    expect(merged.runners?.order).not.toBe(base.runners.order)
  })

  test('mutating the result never reaches back into DEFAULT_CONFIG', () => {
    const merged = mergeConfig(DEFAULT_CONFIG, {})
    merged.runners?.order?.push('moon')
    expect(DEFAULT_CONFIG.runners?.order).toEqual([])
  })
})

describe('validateConfig', () => {
  test('warns about an unknown key and still returns the rest', () => {
    // Forward compatibility: a file written by a newer version must not break
    // an older one, so an unrecognized key is reported and skipped.
    const { config, warnings } = validateConfig(
      { allowExec: true, futureThing: 1, runners: { order: ['moon'], nested: 2 } },
      '/cfg.json',
    )
    expect(config).toEqual({ allowExec: true, runners: { order: ['moon'] } })
    expect(warnings).toHaveLength(2)
    expect(warnings.join('\n')).toContain('/cfg.json')
    expect(warnings.join('\n')).toContain('futureThing')
    expect(warnings.join('\n')).toContain('runners.nested')
  })

  test('rejects a wrong-typed value rather than ignoring it', () => {
    // Silently dropping "yes" would leave the user believing exec was enabled.
    expect(() => validateConfig({ allowExec: 'yes' }, '/cfg.json')).toThrow(ConfigError)
    try {
      validateConfig({ allowExec: 'yes' }, '/cfg.json')
    } catch (error) {
      expect((error as ConfigError).file).toBe('/cfg.json')
      expect((error as Error).message).toContain('allowExec')
      expect((error as Error).message).toContain('/cfg.json')
    }
  })

  test('rejects a wrong-typed element and names the element, not the container', () => {
    // The shape is right and the contents are not; accepting it would put a
    // number where a runner id is expected and fail somewhere far away. The
    // message has to point at the element: "got an array" would contradict the
    // complaint, since an array is exactly what was asked for.
    expect(() => validateConfig({ runners: { disabled: ['ok', 2] } }, '/cfg.json')).toThrow(
      /runners\.disabled must be an array of strings, got a number at index 1/,
    )
    expect(() => validateConfig({ runners: { order: [1, 2] } }, '/cfg.json')).toThrow(
      /runners\.order must be an array of strings, got a number at index 0/,
    )
    // A non-array still reports the container's type, which is the fault there.
    expect(() => validateConfig({ runners: { order: 'moon' } }, '/cfg.json')).toThrow(
      /runners\.order must be an array of strings, got a string/,
    )
  })

  test('rejects null for an object-valued key', () => {
    // typeof null is "object", so this is the case a naive check waves through.
    expect(() => validateConfig({ runners: null }, '/cfg.json')).toThrow(
      /runners must be an object, got null/,
    )
  })

  test('rejects a discovery mode that is not one of the three', () => {
    expect(() => validateConfig({ discovery: 'sideways' }, '/cfg.json')).toThrow(/git, walk, auto/)
  })
})

describe('readConfigFile', () => {
  test('returns null for a file that does not exist, since absence is normal', async () => {
    const dir = await root()
    expect(await readConfigFile(join(dir, 'wayfinder.config.json'))).toBeNull()
  })

  test.skipIf(WINDOWS)('refuses a link to a device and a FIFO, without reading them', async () => {
    const dir = await root()
    const device = join(dir, 'wayfinder.config.json')
    await symlink('/dev/zero', device)
    await expect(readConfigFile(device)).rejects.toThrow(/not a regular file/)
    const fifo = join(dir, 'fifo.json')
    expect(spawnSync('mkfifo', [fifo]).status).toBe(0)
    await expect(readConfigFile(fifo)).rejects.toThrow(/not a regular file/)
  })

  test('refuses a file larger than 1 MB', async () => {
    const dir = await root({ 'wayfinder.config.json': `{"x": "${'a'.repeat(1024 * 1024)}"}` })
    await expect(readConfigFile(join(dir, 'wayfinder.config.json'))).rejects.toThrow(
      /larger than 1 MB/,
    )
  })

  test('names the file and the parse problem when the JSON is malformed', async () => {
    // A config that quietly did not load is worse than one that refuses to.
    const dir = await root({ 'wayfinder.config.json': '{ nope' })
    const file = join(dir, 'wayfinder.config.json')
    await expect(readConfigFile(file)).rejects.toThrow(ConfigError)
    try {
      await readConfigFile(file)
    } catch (error) {
      expect((error as ConfigError).file).toBe(file)
      expect((error as Error).message).toContain(file)
      expect((error as Error).message).toContain('invalid JSON')
    }
  })
})

describe('loadConfig', () => {
  test('merges defaults, user and project, and reports which layer won', async () => {
    const home = await root({
      [USER_CONFIG]: JSON.stringify({
        runners: { disabled: ['cargo'], order: ['moon'] },
        allowExec: true,
      }),
    })
    const project = await root({
      'wayfinder.config.json': JSON.stringify({ runners: { order: ['just'] } }),
    })

    const loaded = await loadConfig(project, env(), home)

    expect(loaded.effective).toEqual({
      runners: { disabled: ['cargo'], order: ['just'] },
      allowExec: true,
      discovery: 'auto',
      excludePaths: [],
      trust: { paths: [], owners: [], tools: {} },
      tools: [],
      open: 'tui',
      theme: 'system',
      skills: 'project',
    })
    expect(loaded.sources.get('runners.order')).toBe('project')
    expect(loaded.sources.get('runners.disabled')).toBe('user')
    expect(loaded.sources.get('discovery')).toBe('default')
  })

  test('attributes a key to the highest layer that SET it, not the one that changed it', async () => {
    // Presence, not equality: a project restating a value the user already
    // chose still owns it, because deleting the project line would be a change.
    const home = await root({
      [USER_CONFIG]: JSON.stringify({ discovery: 'git' }),
    })
    const project = await root({ 'wayfinder.config.json': JSON.stringify({ discovery: 'git' }) })

    const loaded = await loadConfig(project, env(), home)
    expect(loaded.sources.get('discovery')).toBe('project')
  })

  test('a project file cannot raise allowExec to true', async () => {
    // wayfinder.config.json lives INSIDE the repository being scanned, so honouring
    // it here would let a repository authorize running its own code.
    const home = await root({
      [USER_CONFIG]: JSON.stringify({ allowExec: false }),
    })
    const project = await root({ 'wayfinder.config.json': JSON.stringify({ allowExec: true }) })

    const loaded = await loadConfig(project, env(), home)

    expect(loaded.effective.allowExec).toBe(false)
    expect(loaded.layers.project?.allowExec).toBeUndefined()
    expect(loaded.warnings.join('\n')).toContain(join(project, 'wayfinder.config.json'))
    expect(loaded.warnings.join('\n')).toContain('cannot grant itself permission')
  })

  test('that warning names the command to run', async () => {
    const home = await root()
    const project = await root({ 'wayfinder.config.json': JSON.stringify({ allowExec: true }) })

    expect((await loadConfig(project, env(), home)).warnings.join('\n')).toContain(
      'run "way trust"',
    )
  })

  test('a project file CAN lower allowExec to false', async () => {
    // Safe in the other direction: a repository asking not to be shelled out
    // for is asking for less, so there is nothing to withhold.
    const home = await root({
      [USER_CONFIG]: JSON.stringify({ allowExec: true }),
    })
    const project = await root({ 'wayfinder.config.json': JSON.stringify({ allowExec: false }) })

    const loaded = await loadConfig(project, env(), home)
    expect(loaded.effective.allowExec).toBe(false)
    expect(loaded.sources.get('allowExec')).toBe('project')
    expect(loaded.warnings).toEqual([])
  })

  test('attributes allowExec to the user layer when the project tried to raise it', async () => {
    // `config list` must name the layer that really supplied the value; naming
    // the ignored file is how a user concludes the project file worked.
    const home = await root({
      [USER_CONFIG]: JSON.stringify({ allowExec: true }),
    })
    const project = await root({ 'wayfinder.config.json': JSON.stringify({ allowExec: true }) })

    const loaded = await loadConfig(project, env(), home)

    expect(loaded.effective.allowExec).toBe(true)
    expect(loaded.sources.get('allowExec')).toBe('user')
    // Warned even though the value came out true anyway: the author's intent —
    // grant exec — was never honoured from that file, and they would otherwise
    // rely on it in a repository where it does nothing.
    expect(loaded.warnings.join('\n')).toContain('cannot grant itself permission')
  })

  test('a project file cannot grant itself trust — trust.paths is rejected', async () => {
    // Stricter than allowExec: trust has no "lower" state a project file could
    // honour, so the whole block is dropped, not one key inside it.
    const home = await root()
    const project = await root({
      'wayfinder.config.json': JSON.stringify({ trust: { paths: ['/tmp/**'] } }),
    })

    const loaded = await loadConfig(project, env(), home)

    expect(loaded.effective.trust).toEqual({ paths: [], owners: [], tools: {} })
    expect(loaded.layers.project?.trust).toBeUndefined()
    expect(loaded.warnings.join('\n')).toContain(join(project, 'wayfinder.config.json'))
    expect(loaded.warnings.join('\n')).toContain('cannot grant itself trust')
  })

  test('a project file cannot grant itself trust — trust.owners is rejected too', async () => {
    const home = await root()
    const project = await root({
      'wayfinder.config.json': JSON.stringify({ trust: { owners: ['some-org'] } }),
    })

    const loaded = await loadConfig(project, env(), home)

    expect(loaded.effective.trust).toEqual({ paths: [], owners: [], tools: {} })
    expect(loaded.warnings.join('\n')).toContain('cannot grant itself trust')
  })

  test('an empty project-layer trust block is silent — nothing was actually granted', async () => {
    const home = await root()
    const project = await root({
      'wayfinder.config.json': JSON.stringify({ trust: {} }),
    })

    const loaded = await loadConfig(project, env(), home)
    expect(loaded.warnings).toEqual([])
  })

  test('an empty project-layer trust.paths does not narrow the user policy', async () => {
    // `paths: []` is present as a key, so a plain deep-merge would overwrite
    // the user's list with nothing — the block is dropped whole instead.
    const home = await root({
      [USER_CONFIG]: JSON.stringify({
        trust: { paths: ['/home/me/work/**'], owners: ['my-org'] },
      }),
    })
    const project = await root({
      'wayfinder.config.json': JSON.stringify({ trust: { paths: [] } }),
    })

    const loaded = await loadConfig(project, env(), home)
    expect(loaded.effective.trust).toEqual({
      paths: ['/home/me/work/**'],
      owners: ['my-org'],
      tools: {},
    })
    expect(loaded.layers.project?.trust).toBeUndefined()
    expect(loaded.warnings).toEqual([])
  })

  test('a USER-layer trust.paths/trust.owners is honoured', async () => {
    // The layer this block is FOR — see the gate integration in cli.test.ts
    // for proof it actually reaches `policyExecGate`.
    const home = await root({
      [USER_CONFIG]: JSON.stringify({
        trust: { paths: ['/home/me/work/**'], owners: ['my-org'] },
      }),
    })
    const project = await root()

    const loaded = await loadConfig(project, env(), home)
    expect(loaded.effective.trust).toEqual({
      paths: ['/home/me/work/**'],
      owners: ['my-org'],
      tools: {},
    })
    expect(loaded.sources.get('trust.paths')).toBe('user')
    expect(loaded.sources.get('trust.owners')).toBe('user')
    expect(loaded.warnings).toEqual([])
  })

  test('still loads when a layer carries an unknown key', async () => {
    const home = await root()
    const project = await root({
      'wayfinder.config.json': JSON.stringify({ discovery: 'walk', madeUp: true }),
    })
    const loaded = await loadConfig(project, env(), home)
    expect(loaded.effective.discovery).toBe('walk')
    expect(loaded.warnings.join('\n')).toContain('madeUp')
  })

  test('WAYFINDER_CONFIG swaps the user file without disabling the project file', async () => {
    const home = await root({
      [USER_CONFIG]: JSON.stringify({ discovery: 'git' }),
    })
    const other = await root({ 'mine.json': JSON.stringify({ discovery: 'walk' }) })
    const project = await root({
      'wayfinder.config.json': JSON.stringify({ runners: { order: ['just'] } }),
    })

    const loaded = await loadConfig(
      project,
      env({ [CONFIG_ENV_VAR]: join(other, 'mine.json') }),
      home,
    )

    // The XDG file was not read; the project file still was.
    expect(loaded.effective.discovery).toBe('walk')
    expect(loaded.effective.runners?.order).toEqual(['just'])
  })

  test('falls back to defaults when no layer exists', async () => {
    const home = await root()
    const project = await root()
    const loaded = await loadConfig(project, env(), home)
    expect(loaded.effective).toEqual(DEFAULT_CONFIG)
    expect(loaded.layers.user).toBeNull()
    expect(loaded.layers.project).toBeNull()
  })
})

describe('writeSetting through a link', () => {
  test.skipIf(WINDOWS)(
    'a linked user config is written at its target, and stays a link',
    async () => {
      const home = await root({ 'dotfiles/way.json': '{}' })
      const target = join(home, 'dotfiles', 'way.json')
      const user = join(home, '.config', 'wayfinder', 'config.json')
      await mkdir(join(home, '.config', 'wayfinder'), { recursive: true })
      await symlink(target, user)
      await writeSetting({ layer: 'user', root: home, env: env(), home }, 'theme', 'dark')
      expect((await lstat(user)).isSymbolicLink()).toBe(true)
      expect(JSON.parse(await readFile(target, 'utf8'))).toMatchObject({ theme: 'dark' })
      await removeSetting({ layer: 'user', root: home, env: env(), home }, 'theme')
      expect((await lstat(user)).isSymbolicLink()).toBe(true)
      expect(JSON.parse(await readFile(target, 'utf8'))).not.toHaveProperty('theme')
    },
  )

  test.skipIf(WINDOWS)(
    'a linked project file is replaced, and its target is not written',
    async () => {
      const outside = await root({ 'elsewhere.json': '{}' })
      const repo = await root()
      const project = join(repo, 'wayfinder.config.json')
      await symlink(join(outside, 'elsewhere.json'), project)
      await writeSetting(
        { layer: 'project', root: repo, env: env(), home: repo },
        'discovery',
        'walk',
      )
      expect((await lstat(project)).isSymbolicLink()).toBe(false)
      expect(await readFile(join(outside, 'elsewhere.json'), 'utf8')).toBe('{}')
    },
  )
})

describe('get / set / unset', () => {
  test('round-trips a nested path through the file', async () => {
    const dir = await root()
    const file = join(dir, 'wayfinder.config.json')

    const written = setConfigValue({}, 'runners.order', ['moon', 'just'])
    await writeConfigFile(file, written)

    const read = await readConfigFile(file)
    expect(getConfigValue(read?.config ?? {}, 'runners.order')).toEqual(['moon', 'just'])

    const cleared = unsetConfigValue(read?.config ?? {}, 'runners.order')
    // The now-empty container goes with it rather than leaving "runners": {}.
    expect(cleared).toEqual({})
  })

  test('a set preserves an unknown key already in the file', async () => {
    // The reason the write path edits the RAW parsed object: round-tripping
    // through the validated shape would drop a key a newer version wrote.
    const dir = await root({
      'wayfinder.config.json': JSON.stringify({ futureThing: { keep: true }, allowExec: false }),
    })
    const file = join(dir, 'wayfinder.config.json')

    const raw = await readRawConfigFile(file)
    await writeConfigFile(file, setConfigValue(raw ?? {}, 'allowExec', true))

    const after = await readRawConfigFile(file)
    expect(after).toEqual({
      $schema: CONFIG_SCHEMA_URL,
      futureThing: { keep: true },
      allowExec: true,
    })
  })

  test('refuses an unknown setting or a wrong-typed value', () => {
    expect(() => setConfigValue({}, 'runners.nope', 1)).toThrow(ConfigError)
    expect(() => setConfigValue({}, 'allowExec', 'yes')).toThrow(ConfigError)
  })

  test('does not mutate the document it is given', () => {
    const before = { allowExec: false }
    setConfigValue(before, 'allowExec', true)
    expect(before.allowExec).toBe(false)
  })

  test('refuses to overwrite an intermediate value that is not an object', () => {
    // A file holding "runners": "oops" is broken. Replacing it with a fresh
    // container would delete whatever the user meant by it, without saying so.
    expect(() => setConfigValue({ runners: 'oops' }, 'runners.disabled', ['cargo'])).toThrow(
      /runners is a string, not an object/,
    )
  })

  test('handles degenerate dotted paths without inventing a value', () => {
    // An empty key, a trailing dot and a path through a scalar all reach the
    // walk; each must read as absent, refuse to be set, and leave unset a no-op.
    const doc = { allowExec: true, runners: { order: ['moon'] } }

    expect(getConfigValue(doc, 'allowExec.foo')).toBeUndefined()
    expect(getConfigValue(doc, '')).toBeUndefined()
    expect(getConfigValue(doc, 'runners.')).toBeUndefined()

    expect(() => setConfigValue(doc, 'allowExec.foo', 1)).toThrow(ConfigError)
    expect(() => setConfigValue(doc, '', 1)).toThrow(ConfigError)
    expect(() => setConfigValue(doc, 'runners.', 1)).toThrow(ConfigError)

    expect(unsetConfigValue(doc, 'allowExec.foo')).toEqual(doc)
    expect(unsetConfigValue(doc, '')).toEqual(doc)
    expect(unsetConfigValue(doc, 'runners.')).toEqual(doc)
  })
})

describe('writeConfigFile', () => {
  test('writes known keys in schema order and ends with a newline', async () => {
    // A config file under version control must not churn its diff because a
    // key moved, so the order is fixed rather than insertion-dependent.
    const dir = await root()
    const file = join(dir, 'wayfinder.config.json')
    await writeConfigFile(file, {
      discovery: 'git',
      allowExec: true,
      runners: { order: ['just'], disabled: ['cargo'] },
    })

    const text = await readFile(file, 'utf-8')
    expect(text.endsWith('\n')).toBe(true)
    expect(text).toBe(
      `{
  "$schema": "${CONFIG_SCHEMA_URL}",
  "runners": {
    "disabled": [
      "cargo"
    ],
    "order": [
      "just"
    ]
  },
  "allowExec": true,
  "discovery": "git"
}
`,
    )
  })

  test('rewriting an unchanged document produces identical bytes', async () => {
    // The point of the fixed order: a config under version control must not
    // churn its diff just because it was read and written again.
    const dir = await root()
    const file = join(dir, 'wayfinder.config.json')
    const document = {
      discovery: 'git',
      futureThing: { keep: true },
      runners: { order: ['just'] },
    } as Record<string, unknown>

    await writeConfigFile(file, document)
    const first = await readFile(file, 'utf-8')
    await writeConfigFile(file, (await readRawConfigFile(file)) ?? {})
    expect(await readFile(file, 'utf-8')).toBe(first)
  })

  test('keeps unknown keys after the known ones', async () => {
    const dir = await root()
    const file = join(dir, 'wayfinder.config.json')
    await writeConfigFile(file, { zzz: 1, allowExec: true } as Record<string, unknown>)
    const text = await readFile(file, 'utf-8')
    expect(text.indexOf('"allowExec"')).toBeLessThan(text.indexOf('"zzz"'))
  })
})

describe('parseConfigValue', () => {
  test('reads JSON first and falls back to a bare string', () => {
    // So a user types `discovery walk`, not `discovery '"walk"'`.
    expect(parseConfigValue('true')).toBe(true)
    expect(parseConfigValue('moon')).toBe('moon')
    expect(parseConfigValue('["a","b"]')).toEqual(['a', 'b'])
  })
})

describe('collectOptionsFromConfig', () => {
  test('maps runners.disabled onto exclude', () => {
    const options = collectOptionsFromConfig({
      runners: { disabled: ['cargo'] },
      allowExec: true,
      discovery: 'walk',
    })
    expect(options).toEqual({ exclude: ['cargo'], allowExec: true, discovery: 'walk' })
  })

  test('omits what the config does not set, so spread flags win cleanly', () => {
    expect(collectOptionsFromConfig({})).toEqual({})
  })
})

describe('trustPolicyFromConfig', () => {
  test('defaults to the empty policy when no trust block was set', () => {
    expect(trustPolicyFromConfig({})).toEqual({ paths: [], owners: [] })
  })

  test('carries paths and owners through from the config', () => {
    expect(
      trustPolicyFromConfig({ trust: { paths: ['/home/me/work/**'], owners: ['my-org'] } }),
    ).toEqual({ paths: ['/home/me/work/**'], owners: ['my-org'] })
  })

  test('either half alone defaults the other to empty', () => {
    expect(trustPolicyFromConfig({ trust: { owners: ['my-org'] } })).toEqual({
      paths: [],
      owners: ['my-org'],
    })
  })
})

describe('expandTrustPath', () => {
  test('expands a leading ~ against home before resolving', async () => {
    const home = await root()
    await mkdir(join(home, 'work'), { recursive: true })

    expect(await expandTrustPath('~/work/**', home)).toBe(
      `${await resolveTrustRoot(join(home, 'work'))}/**`,
    )
  })

  test('a pattern with no glob character is resolved outright', async () => {
    const home = await root()
    const target = await root()

    expect(await expandTrustPath(target, home)).toBe(await resolveTrustRoot(target))
  })

  test('resolves only the static prefix before the first glob character', async () => {
    const home = await root()
    const target = await root()

    expect(await expandTrustPath(`${target}/sub/**`, home)).toBe(
      `${await resolveTrustRoot(target)}/sub/**`,
    )
  })
})

describe('orderRunners', () => {
  test('puts named runners first and sorts the rest alphabetically', () => {
    // Alphabetical for the tail because provider registration order is an
    // implementation detail, and a list that reshuffles cannot be learned.
    const items = [{ runner: 'make' }, { runner: 'cargo' }, { runner: 'just' }, { runner: 'moon' }]
    expect(orderRunners(items, ['moon', 'just']).map((i) => i.runner)).toEqual([
      'moon',
      'just',
      'cargo',
      'make',
    ])
  })

  test('sorts everything alphabetically with no order given, without mutating', () => {
    const items = [{ runner: 'moon' }, { runner: 'cargo' }]
    expect(orderRunners(items).map((i) => i.runner)).toEqual(['cargo', 'moon'])
    expect(items[0]?.runner).toBe('moon')
  })
})
