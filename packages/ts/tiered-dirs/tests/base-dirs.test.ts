import { join, normalize } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  HOMES,
  TieredDirs,
  TieredDirsError,
  envVars,
  isOverridden,
  overrideVars,
  parseConvention,
  rootedBaseDirs,
  systemBaseDirs,
  xdgBaseDirs,
} from '../src/index.ts'

const VENDOR = 'com.example'
const ENV = envVars('EXAMPLE')

describe('macOS', () => {
  const bases = systemBaseDirs(ENV, {
    platform: 'darwin',
    home: '/Users/x',
    env: { HOME: '/Users/x' },
  })

  test('durable and config share Application Support', () => {
    expect(normalize(bases.durable)).toBe(normalize('/Users/x/Library/Application Support'))
    expect(normalize(bases.config)).toBe(normalize('/Users/x/Library/Application Support'))
  })

  test('cache is Library/Caches', () => {
    expect(normalize(bases.cache)).toBe(normalize('/Users/x/Library/Caches'))
  })

  test('state shares Application Support', () => {
    expect(normalize(bases.state)).toBe(normalize('/Users/x/Library/Application Support'))
  })

  test('logs get Library/Logs, not cache', () => {
    expect(normalize(bases.logs)).toBe(normalize('/Users/x/Library/Logs'))
    expect(bases.logs).not.toBe(bases.cache)
  })

  test('runtime lands under durable, never under cache', () => {
    expect(normalize(bases.runtime)).toBe(normalize('/Users/x/Library/Application Support/run'))
    expect(bases.runtime.startsWith(bases.cache)).toBe(false)
  })

  test('scratch reads TMPDIR, and falls back to /tmp', () => {
    expect(normalize(bases.scratch)).toBe(normalize('/tmp'))
    const withTmp = systemBaseDirs(ENV, {
      platform: 'darwin',
      env: { HOME: '/Users/x', TMPDIR: '/var/folders/ab/T' },
    })
    expect(normalize(withTmp.scratch)).toBe(normalize('/var/folders/ab/T'))
    // Scratch is swept; runtime describes a live process. Never the same root.
    expect(withTmp.scratch).not.toBe(withTmp.runtime)
  })

  test('XDG variables are ignored under native', () => {
    const withXdg = systemBaseDirs(ENV, {
      platform: 'darwin',
      env: { HOME: '/Users/x', XDG_CACHE_HOME: '/xdg/cache', XDG_RUNTIME_DIR: '/run/user/501' },
    })
    expect(normalize(withXdg.cache)).toBe(normalize('/Users/x/Library/Caches'))
    expect(normalize(withXdg.runtime)).toBe(normalize('/Users/x/Library/Application Support/run'))
  })
})

describe('Linux', () => {
  test('the XDG defaults', () => {
    const bases = systemBaseDirs(ENV, { platform: 'linux', env: { HOME: '/home/x' } })
    expect(normalize(bases.durable)).toBe(normalize('/home/x/.local/share'))
    expect(normalize(bases.config)).toBe(normalize('/home/x/.config'))
    expect(normalize(bases.cache)).toBe(normalize('/home/x/.cache'))
    expect(normalize(bases.state)).toBe(normalize('/home/x/.local/state'))
    expect(normalize(bases.logs)).toBe(normalize('/home/x/.local/state'))
    expect(normalize(bases.runtime)).toBe(normalize('/home/x/.local/share/run'))
    expect(normalize(bases.scratch)).toBe(normalize('/tmp'))
  })

  test('XDG_RUNTIME_DIR is the one platform where runtime is real', () => {
    const bases = systemBaseDirs(ENV, {
      platform: 'linux',
      env: { HOME: '/home/x', XDG_RUNTIME_DIR: '/run/user/1000' },
    })
    expect(normalize(bases.runtime)).toBe(normalize('/run/user/1000'))
  })

  test('every XDG override is honoured', () => {
    const bases = systemBaseDirs(ENV, {
      platform: 'linux',
      env: {
        HOME: '/home/x',
        XDG_DATA_HOME: '/d',
        XDG_CONFIG_HOME: '/c',
        XDG_CACHE_HOME: '/k',
        XDG_STATE_HOME: '/s',
      },
    })
    expect([bases.durable, bases.config, bases.cache, bases.logs].map(normalize)).toEqual(
      ['/d', '/c', '/k', '/s'].map(normalize),
    )
  })

  test('a relative XDG value is invalid and ignored', () => {
    const bases = systemBaseDirs(ENV, {
      platform: 'linux',
      env: { HOME: '/home/x', XDG_CACHE_HOME: 'relative/cache' },
    })
    expect(normalize(bases.cache)).toBe(normalize('/home/x/.cache'))
  })
})

describe('Windows', () => {
  test('roaming holds durable and config, local holds cache, state sits beside it', () => {
    const bases = systemBaseDirs(ENV, {
      platform: 'win32',
      env: {
        USERPROFILE: 'C:\\Users\\x',
        APPDATA: 'C:\\Users\\x\\AppData\\Roaming',
        LOCALAPPDATA: 'C:\\Users\\x\\AppData\\Local',
      },
    })
    expect(bases.durable).toBe('C:\\Users\\x\\AppData\\Roaming')
    expect(bases.config).toBe('C:\\Users\\x\\AppData\\Roaming')
    expect(bases.cache).toBe('C:\\Users\\x\\AppData\\Local')
    // `join` uses the HOST separator, so build the expected path the same way.
    expect(bases.state).toBe(join('C:\\Users\\x\\AppData\\Local', 'state'))
    expect(bases.state).not.toBe(bases.cache)
  })

  test('scratch reads TEMP, then TMP, then the AppData default', () => {
    const win = (env: Record<string, string>) => systemBaseDirs(ENV, { platform: 'win32', env })
    const base = { USERPROFILE: 'C:\\Users\\x' }
    expect(win({ ...base, TEMP: 'C:\\Temp', TMP: 'C:\\Other' }).scratch).toBe('C:\\Temp')
    expect(win({ ...base, TMP: 'C:\\Other' }).scratch).toBe('C:\\Other')
    // `join` uses the HOST separator, so assert the tail rather than the spelling.
    expect(win(base).scratch.endsWith('Temp')).toBe(true)
  })

  test('with no OS home for either, logs and runtime derive from durable', () => {
    const bases = systemBaseDirs(ENV, { platform: 'win32', env: { USERPROFILE: 'C:/Users/x' } })
    expect(bases.logs.endsWith('logs')).toBe(true)
    expect(bases.runtime.endsWith('run')).toBe(true)
    expect(bases.logs).not.toBe(bases.cache)
  })
})

describe('conventions', () => {
  const env = { HOME: '/Users/x', XDG_CONFIG_HOME: '/xc' }
  const on = (platform: string, opts: { convention?: 'native' | 'xdg' }, extra = {}) =>
    systemBaseDirs(ENV, { platform, env: { ...env, ...extra }, ...opts })

  test('xdg on macOS is the XDG table', () => {
    const bases = on('darwin', { convention: 'xdg' })
    expect(bases).toEqual(xdgBaseDirs('/Users/x', env))
    expect(normalize(bases.config)).toBe(normalize('/xc'))
    expect(normalize(bases.state)).toBe(normalize('/Users/x/.local/state'))
    expect(bases.logs).toBe(bases.state)
  })

  test('native is the default', () => {
    expect(on('darwin', {})).toEqual(on('darwin', { convention: 'native' }))
    expect(normalize(on('darwin', {}).config)).toBe(
      normalize('/Users/x/Library/Application Support'),
    )
  })

  test('Linux is the same under both', () => {
    expect(on('linux', { convention: 'xdg' })).toEqual(on('linux', { convention: 'native' }))
  })

  test('on Windows xdg means native', () => {
    const winEnv = { USERPROFILE: 'C:\\Users\\x', ...env }
    const win = (convention: 'native' | 'xdg') =>
      systemBaseDirs(ENV, { platform: 'win32', env: winEnv, convention })
    expect(win('xdg')).toEqual(win('native'))
  })

  test('EXAMPLE_CONVENTION beats the caller, trimmed', () => {
    expect(on('darwin', {}, { EXAMPLE_CONVENTION: ' xdg ' })).toEqual(
      on('darwin', { convention: 'xdg' }),
    )
    expect(on('darwin', { convention: 'xdg' }, { EXAMPLE_CONVENTION: 'native' })).toEqual(
      on('darwin', {}),
    )
    expect(on('darwin', { convention: 'xdg' }, { EXAMPLE_CONVENTION: '' })).toEqual(
      on('darwin', { convention: 'xdg' }),
    )
  })

  test('an unknown convention throws, even under EXAMPLE_ROOT', () => {
    for (const bad of ['XDG', 'apple', ' ']) {
      expect(() => on('darwin', {}, { EXAMPLE_CONVENTION: bad })).toThrow(TieredDirsError)
    }
    expect(() => on('darwin', {}, { EXAMPLE_CONVENTION: 'apple', EXAMPLE_ROOT: '/r' })).toThrow(
      'EXAMPLE_CONVENTION must be "native" or "xdg", got "apple"',
    )
  })

  test('an override still wins under xdg', () => {
    const bases = on(
      'darwin',
      { convention: 'xdg' },
      { EXAMPLE_CONFIG_DIR: '/c', EXAMPLE_STATE_DIR: '/st' },
    )
    expect(normalize(bases.config)).toBe(normalize('/c'))
    expect(normalize(bases.state)).toBe(normalize('/st'))
    expect(normalize(bases.logs)).toBe(normalize('/Users/x/.local/state'))
  })

  test('TieredDirs.fromEnv takes the convention', () => {
    const dirs = TieredDirs.fromEnv(VENDOR, ENV, { platform: 'darwin', env, convention: 'xdg' })
    expect(normalize(dirs.standalone('tool').config().path)).toBe(normalize('/xc/tool'))
    expect(normalize(dirs.standalone('tool').state().path)).toBe(
      normalize('/Users/x/.local/state/tool'),
    )
  })
})

describe('nothing panics', () => {
  test('an environment with no home throws a catchable error', () => {
    expect(() => systemBaseDirs(ENV, { platform: 'linux', env: {} })).toThrow(TieredDirsError)
    expect(() => systemBaseDirs(ENV, { platform: 'linux', env: {} })).toThrow(/no home directory/)
  })

  test('an empty home is refused rather than rooting everything at ""', () => {
    expect(() => systemBaseDirs(ENV, { platform: 'linux', env: {}, home: '' })).toThrow(
      TieredDirsError,
    )
  })

  test('a full set of overrides rescues a homeless environment', () => {
    const roots = rootedBaseDirs('/o')
    for (const platform of ['darwin', 'linux', 'win32']) {
      expect(systemBaseDirs(ENV, { platform, env: {}, overrides: roots })).toEqual(roots)
    }
  })

  test('a homeless environment that names every root needs no home', () => {
    const bases = systemBaseDirs(ENV, {
      platform: 'linux',
      env: {
        XDG_DATA_HOME: '/d',
        XDG_CONFIG_HOME: '/c',
        XDG_CACHE_HOME: '/k',
        XDG_STATE_HOME: '/s',
        XDG_RUNTIME_DIR: '/run/user/1000',
      },
    })
    expect(normalize(bases.durable)).toBe(normalize('/d'))
    expect(normalize(bases.runtime)).toBe(normalize('/run/user/1000'))
    expect(normalize(bases.scratch)).toBe(normalize('/tmp'))
  })

  test('a partial override still needs the home the table would use', () => {
    expect(() =>
      systemBaseDirs(ENV, { platform: 'linux', env: {}, overrides: { cache: '/o/k' } }),
    ).toThrow(TieredDirsError)
  })

  test('an override replaces one root and leaves the rest on the table', () => {
    const bases = systemBaseDirs(ENV, {
      platform: 'linux',
      env: {},
      home: '/sandbox',
      overrides: { cache: '/scratch/cache' },
    })
    expect(normalize(bases.cache)).toBe(normalize('/scratch/cache'))
    expect(normalize(bases.durable)).toBe(normalize('/sandbox/.local/share'))
  })
})

describe('the injectable seam', () => {
  test('roots handed in wholesale need no environment at all', () => {
    // A server that cannot read the environment takes the roots from its own
    // configuration.
    const dirs = new TieredDirs(VENDOR, {
      durable: '/srv/data',
      config: '/srv/config',
      cache: '/srv/cache',
      state: '/srv/state',
      logs: '/srv/logs',
      runtime: '/srv/run',
      scratch: '/srv/tmp',
    })
    expect(normalize(dirs.suite('notes').cache().app('vault-search').path)).toBe(
      normalize('/srv/cache/com.example.notes/vault-search'),
    )
  })

  test('the CLI arm resolves the same shape from the environment', () => {
    const cli = TieredDirs.fromEnv(VENDOR, ENV, { platform: 'linux', env: { HOME: '/home/x' } })
    expect(normalize(cli.suite('notes').cache().app('vault-search').path)).toBe(
      normalize('/home/x/.cache/com.example.notes/vault-search'),
    )
  })

  test('the environment is read once, at construction', () => {
    const env: Record<string, string | undefined> = { HOME: '/home/x' }
    const dirs = TieredDirs.fromEnv(VENDOR, ENV, { platform: 'linux', env })
    env['XDG_CACHE_HOME'] = '/moved'
    expect(normalize(dirs.bases.cache)).toBe(normalize('/home/x/.cache'))
  })

  test('every root is populated on every platform', () => {
    for (const platform of ['darwin', 'linux', 'win32', 'freebsd']) {
      const bases = systemBaseDirs(ENV, { platform, env: { HOME: '/h', USERPROFILE: '/h' } })
      for (const home of HOMES) {
        expect(bases[home].length).toBeGreaterThan(0)
      }
      expect(bases.scratch.length).toBeGreaterThan(0)
    }
  })

  test('an override reaches scratch, which is not one of the HOMES', () => {
    const bases = systemBaseDirs(ENV, {
      platform: 'linux',
      env: { HOME: '/home/x' },
      overrides: { scratch: '/sandbox/tmp' },
    })
    expect(normalize(bases.scratch)).toBe(normalize('/sandbox/tmp'))
  })
})

describe('override variables', () => {
  const on = (env: Record<string, string>) =>
    systemBaseDirs(ENV, { platform: 'linux', env: { HOME: '/home/x', ...env } })
  const os = on({})

  test('EXAMPLE_ROOT alone moves all seven roots', () => {
    const bases = on({ EXAMPLE_ROOT: '/scratch' })
    expect(bases).toEqual(rootedBaseDirs('/scratch'))
    for (const path of Object.values(bases)) {
      expect(normalize(path).startsWith(normalize('/scratch/'))).toBe(true)
    }
  })

  test('EXAMPLE_ROOT alone needs no home directory', () => {
    expect(systemBaseDirs(ENV, { platform: 'linux', env: { EXAMPLE_ROOT: '/r' } })).toEqual(
      rootedBaseDirs('/r'),
    )
  })

  test('a tier var beats EXAMPLE_ROOT for its own home only', () => {
    const bases = on({ EXAMPLE_ROOT: '/r', EXAMPLE_CACHE_DIR: '/warm' })
    expect(bases).toEqual({ ...rootedBaseDirs('/r'), cache: '/warm' })
  })

  test('a tier var alone moves only its home', () => {
    expect(on({ EXAMPLE_SCRATCH_DIR: '/s' })).toEqual({ ...os, scratch: '/s' })
  })

  test('an overridden durable carries runtime to <durable>/run', () => {
    expect(on({ EXAMPLE_DURABLE_DIR: '/d' })).toEqual({
      ...os,
      durable: '/d',
      runtime: join('/d', 'run'),
    })
    // Over the OS runtime directory too: a pidfile follows the state it describes.
    expect(
      normalize(on({ EXAMPLE_DURABLE_DIR: '/d', XDG_RUNTIME_DIR: '/run/user/1' }).runtime),
    ).toBe(normalize('/d/run'))
    expect(normalize(on({ EXAMPLE_ROOT: '/r', EXAMPLE_DURABLE_DIR: '/d' }).runtime)).toBe(
      normalize('/d/run'),
    )
    expect(normalize(on({ EXAMPLE_DURABLE_DIR: '/d', EXAMPLE_RUNTIME_DIR: '/rt' }).runtime)).toBe(
      normalize('/rt'),
    )
  })

  test('nothing set, or set empty, is the OS default', () => {
    expect(on({ EXAMPLE_ROOT: '' })).toEqual(os)
    expect(normalize(os.durable)).toBe(normalize('/home/x/.local/share'))
  })

  test('a relative override throws', () => {
    expect(() => on({ EXAMPLE_ROOT: 'scratch' })).toThrow(TieredDirsError)
    expect(() => on({ EXAMPLE_LOGS_DIR: 'logs' })).toThrow(TieredDirsError)
  })

  test('opts.overrides beats the environment', () => {
    const bases = systemBaseDirs(ENV, {
      platform: 'linux',
      env: { EXAMPLE_ROOT: '/r' },
      overrides: { cache: '/o' },
    })
    expect(bases).toEqual({ ...rootedBaseDirs('/r'), cache: '/o' })
  })
})

describe('parseConvention', () => {
  test('takes exactly native or xdg', () => {
    expect(parseConvention('native')).toBe('native')
    expect(parseConvention('xdg')).toBe('xdg')
  })

  test('does not trim and does not fold case, unlike EXAMPLE_CONVENTION', () => {
    for (const bad of [' xdg ', 'xdg\n', 'XDG', 'Native', '', 'apple']) {
      expect(() => parseConvention(bad)).toThrow(TieredDirsError)
    }
    expect(() => parseConvention(' xdg')).toThrow(
      'convention must be "native" or "xdg", got " xdg"',
    )
  })
})

describe('isOverridden', () => {
  test('is false when no override variable is set, or each is empty', () => {
    expect(isOverridden(ENV, {})).toBe(false)
    expect(isOverridden(ENV, Object.fromEntries(overrideVars(ENV).map((n) => [n, ''])))).toBe(false)
  })

  test('is true for any one override variable set non-empty', () => {
    for (const name of overrideVars(ENV)) {
      expect(isOverridden(ENV, { [name]: '/x' })).toBe(true)
    }
  })

  test('ignores the variables that move nothing', () => {
    expect(isOverridden(ENV, { [ENV.requireOverride]: '1', [ENV.convention]: 'xdg' })).toBe(false)
  })

  test('reads process.env by default', () => {
    const saved = process.env[ENV.dirs.cache]
    try {
      process.env[ENV.dirs.cache] = '/k'
      expect(isOverridden(ENV)).toBe(true)
    } finally {
      if (saved === undefined) delete process.env[ENV.dirs.cache]
      else process.env[ENV.dirs.cache] = saved
    }
  })
})

describe('home on Windows', () => {
  test('USERPROFILE is read, and HOME is ignored, as Rust dirs does', () => {
    const bases = systemBaseDirs(ENV, {
      platform: 'win32',
      env: { HOME: '/c/Users/x', USERPROFILE: 'C:\\Users\\x' },
    })
    expect(bases.durable.startsWith('C:\\Users\\x') || bases.durable.startsWith('C:/Users/x')).toBe(
      true,
    )
  })
})

describe('the README example with an injected HOME', () => {
  test('xdg config on darwin sits under ~/.config', () => {
    const cli = TieredDirs.fromEnv('com.example', envVars('TOOL'), {
      convention: 'xdg',
      platform: 'darwin',
      env: { HOME: '/Users/ada' },
    })
    expect(cli.standalone('tool').config().path).toBe('/Users/ada/.config/tool')
  })
})
