/**
 * The package used the way a consumer uses it: through its name only. Every
 * export appears here at least once; `tests/exports.test.ts` checks that.
 * Paths are compared after `normalize`, so the examples also hold on Windows.
 */

import { normalize } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  CONVENTIONS,
  HOMES,
  TIER_KINDS,
  TieredDirs,
  TieredDirsError,
  envVars,
  isOverridden,
  isValidSegment,
  isVendorBundleId,
  overrideVars,
  parseConvention,
  rootedBaseDirs,
  systemBaseDirs,
  testRoot,
  xdgBaseDirs,
  type BaseDirs,
  type Convention,
  type Dir,
  type EnvVars,
  type Home,
  type ResolveOptions,
  type Tier,
  type TierKind,
  type TieredDirsErrorCode,
} from '@osdlc/tiered-dirs'

const VENDOR = 'com.example'
const VARS: EnvVars = envVars('EXAMPLE')

/** A Linux user, so the paths do not depend on the machine running the examples. */
const LINUX: ResolveOptions = { platform: 'linux', env: { HOME: '/home/ada' } }

describe('find where a product keeps its state', () => {
  const dirs = TieredDirs.fromEnv(VENDOR, VARS, LINUX)

  test('the vendor tier is shared by every product the vendor ships', () => {
    const config: Dir = dirs.vendor().config()
    expect(normalize(config.path)).toBe(normalize('/home/ada/.config/com.example'))
  })

  test('a suite tier is shared by the products of one suite', () => {
    const tier: Tier = dirs.suite('notes')
    const cache = tier.cache().scoped('vaults', 'v7').app('search')
    expect(normalize(cache.path)).toBe(
      normalize('/home/ada/.cache/com.example.notes/vaults/v7/search'),
    )
    expect(cache.relative).toBe('com.example.notes/vaults/v7/search')
    expect(cache.segments).toEqual(['com.example.notes', 'vaults', 'v7', 'search'])
    expect(normalize(cache.base)).toBe(normalize('/home/ada/.cache'))
    expect(`${cache}`).toBe(cache.path)
  })

  test('a standalone tier is a general tool outside the vendor namespace', () => {
    const tier = dirs.standalone('mytool')
    expect(tier.kind).toBe('standalone')
    expect(tier.segment).toBe('mytool')
    expect(normalize(tier.state().path)).toBe(normalize('/home/ada/.local/state/mytool'))
  })

  test('every home is reachable by name or by value', () => {
    const tier = dirs.vendor()
    const byName: Dir[] = [
      tier.durable(),
      tier.config(),
      tier.cache(),
      tier.state(),
      tier.logs(),
      tier.runtime(),
    ]
    expect(HOMES.map((home: Home) => tier.home(home).path)).toEqual(byName.map((d) => d.path))
  })

  test('the platform temp directory sits outside both axes', () => {
    expect(normalize(dirs.scratch().app('job-1').path)).toBe(normalize('/tmp/job-1'))
  })

  test('the vendor and its bases are readable', () => {
    expect(dirs.vendorName).toBe(VENDOR)
    expect(normalize(dirs.bases.durable)).toBe(normalize('/home/ada/.local/share'))
    expect(dirs.isVendorBundleId('com.example.notes.desktop')).toBe(true)
    expect(dirs.isVendorBundleId('org.other.app')).toBe(false)
  })

  test('a layer with no TieredDirs checks a bundle id against the vendor', () => {
    expect(isVendorBundleId(VENDOR, 'com.example.notes.desktop')).toBe(true)
  })
})

describe('choose the per-OS table', () => {
  test('native is the default; xdg gives XDG paths on macOS too', () => {
    const mac: ResolveOptions = { platform: 'darwin', env: { HOME: '/Users/ada' } }
    expect(CONVENTIONS).toEqual(['native', 'xdg'])
    const native = systemBaseDirs(VARS, mac)
    const xdg = systemBaseDirs(VARS, { ...mac, convention: 'xdg' satisfies Convention })
    expect(normalize(native.config)).toBe(normalize('/Users/ada/Library/Application Support'))
    expect(normalize(xdg.config)).toBe(normalize('/Users/ada/.config'))
  })

  test('xdgBaseDirs builds the XDG table under any home', () => {
    const bases: BaseDirs = xdgBaseDirs('/srv/ada', { XDG_CONFIG_HOME: '/etc/xdg' })
    expect(normalize(bases.config)).toBe(normalize('/etc/xdg'))
    expect(normalize(bases.cache)).toBe(normalize('/srv/ada/.cache'))
  })

  test('the environment can pick the convention', () => {
    const bases = systemBaseDirs(VARS, {
      platform: 'darwin',
      env: { HOME: '/Users/ada', EXAMPLE_CONVENTION: 'xdg' },
    })
    expect(normalize(bases.cache)).toBe(normalize('/Users/ada/.cache'))
  })

  test('a convention from a flag or a config file is parsed exactly', () => {
    const convention: Convention = parseConvention('xdg')
    expect(systemBaseDirs(VARS, { ...LINUX, convention }).config).toBe('/home/ada/.config')
    expect(() => parseConvention(' xdg')).toThrow(TieredDirsError)
  })
})

describe('move directories for a test or a harness', () => {
  test('one root variable moves every directory', () => {
    const dirs = TieredDirs.fromEnv(VENDOR, VARS, {
      platform: 'linux',
      env: { HOME: '/home/ada', EXAMPLE_ROOT: '/scratch/run1' },
    })
    expect(normalize(dirs.vendor().cache().path)).toBe(normalize('/scratch/run1/cache/com.example'))
  })

  test('one variable per directory beats the root', () => {
    const bases = systemBaseDirs(VARS, {
      platform: 'linux',
      env: { EXAMPLE_ROOT: '/scratch/run1', EXAMPLE_CACHE_DIR: '/warm' },
    })
    expect(bases.cache).toBe('/warm')
    expect(normalize(bases.config)).toBe(normalize('/scratch/run1/config'))
  })

  test('the variable names derive from one prefix', () => {
    expect(VARS.root).toBe('EXAMPLE_ROOT')
    expect(VARS.dirs.durable).toBe('EXAMPLE_DURABLE_DIR')
    expect(VARS.requireOverride).toBe('EXAMPLE_REQUIRE_OVERRIDE')
    expect(VARS.convention).toBe('EXAMPLE_CONVENTION')
    expect(overrideVars(VARS)).toContain('EXAMPLE_SCRATCH_DIR')
  })

  test('isOverridden tells whether the environment moves any directory', () => {
    expect(isOverridden(VARS, { EXAMPLE_CACHE_DIR: '/warm' })).toBe(true)
    expect(isOverridden(VARS, { EXAMPLE_CONVENTION: 'xdg' })).toBe(false)
  })

  test('a test run reads a per-process scratch root', () => {
    // Under Vitest this process is a test runner process.
    const root = testRoot()
    expect(root).toContain('tiered-dirs-test-')
    // A product-tier layer that reads its own variables applies the same default.
    expect(normalize(systemBaseDirs(VARS).durable)).toBe(normalize(`${root}/durable`))
  })

  test('testRoot: false resolves as outside a test runner', () => {
    const bases = systemBaseDirs(VARS, {
      testRoot: false,
      overrides: rootedBaseDirs('/srv/app'),
    })
    expect(normalize(bases.cache)).toBe(normalize('/srv/app/cache'))
  })

  test('rootedBaseDirs lays every directory out under one root', () => {
    const dirs = new TieredDirs(VENDOR, rootedBaseDirs('/stub'))
    expect(normalize(dirs.suite('notes').logs().path)).toBe(
      normalize('/stub/logs/com.example.notes'),
    )
  })

  test('roots can be handed in without reading the environment', () => {
    const bases: BaseDirs = {
      durable: '/srv/data',
      config: '/srv/config',
      cache: '/srv/cache',
      state: '/srv/state',
      logs: '/srv/logs',
      runtime: '/srv/run',
      scratch: '/srv/tmp',
    }
    expect(normalize(new TieredDirs(VENDOR, bases).vendor().state().path)).toBe(
      normalize('/srv/state/com.example'),
    )
  })
})

describe('check names before they become paths', () => {
  test('a segment is one safe path segment', () => {
    expect(isValidSegment('notes')).toBe(true)
    expect(isValidSegment('../etc')).toBe(false)
    expect(isValidSegment('logs')).toBe(false) // reserved
  })

  test('a bad name throws TieredDirsError', () => {
    const dirs = new TieredDirs(VENDOR, rootedBaseDirs('/stub'))
    expect(() => dirs.suite('../etc')).toThrow(TieredDirsError)
    expect(() => dirs.standalone('state')).toThrow(/invalid standalone key/)
  })

  test('an unknown convention in the environment throws TieredDirsError', () => {
    const env = { HOME: '/home/ada', EXAMPLE_CONVENTION: 'apple' }
    expect(() => systemBaseDirs(VARS, { platform: 'linux', env })).toThrow(TieredDirsError)
  })

  test('the error code says which failure it is', () => {
    const explain = (code: TieredDirsErrorCode): string => {
      switch (code) {
        case 'INVALID_KEY':
          return 'fix the name'
        case 'RELATIVE_OVERRIDE':
          return 'use an absolute path'
        default:
          // A minor release may add a code.
          return 'see the message'
      }
    }
    try {
      new TieredDirs(VENDOR, rootedBaseDirs('/stub')).suite('../etc')
    } catch (error) {
      if (!(error instanceof TieredDirsError)) throw error
      expect(error.code).toBe('INVALID_KEY')
      expect(explain(error.code)).toBe('fix the name')
    }
    expect.assertions(2)
  })
})

describe('the tier kinds', () => {
  test('there are three', () => {
    const kinds: readonly TierKind[] = TIER_KINDS
    expect(kinds).toEqual(['vendor', 'suite', 'standalone'])
  })

  test('a switch over a kind keeps a default arm, as a minor release may add one', () => {
    const shared = (kind: TierKind): boolean => {
      switch (kind) {
        case 'vendor':
        case 'suite':
          return true
        default:
          return false
      }
    }
    expect(TIER_KINDS.filter(shared)).toEqual(['vendor', 'suite'])
  })
})
