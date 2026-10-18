import { join, normalize, sep } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  HOMES,
  TIER_KINDS,
  TieredDirs,
  TieredDirsError,
  isVendorBundleId,
  rootedBaseDirs,
} from '../index.ts'
import type { BaseDirs, Tier } from '../index.ts'

const VENDOR = 'com.example'

/**
 * Stub roots, so every assertion below is an exact string with no real home.
 * `rootedBaseDirs` is the same layout the Rust twin's `BaseDirs::rooted` uses.
 */
const BASES = rootedBaseDirs('/b')

const dirs = new TieredDirs(VENDOR, BASES)

describe('composition', () => {
  test('the suite segment is composed from the vendor', () => {
    expect(VENDOR).toBe('com.example')
    expect(dirs.suite('notes').segment).toBe('com.example.notes')
    expect(dirs.suite('tasks').segment).toBe('com.example.tasks')
  })

  test('each home puts the tier segment under its own root', () => {
    expect(normalize(dirs.suite('notes').durable().path)).toBe(
      normalize('/b/durable/com.example.notes'),
    )
    expect(normalize(dirs.suite('notes').config().path)).toBe(
      normalize('/b/config/com.example.notes'),
    )
    expect(normalize(dirs.suite('notes').cache().path)).toBe(
      normalize('/b/cache/com.example.notes'),
    )
    expect(normalize(dirs.suite('notes').logs().path)).toBe(normalize('/b/logs/com.example.notes'))
    expect(normalize(dirs.suite('notes').runtime().path)).toBe(
      normalize('/b/durable/run/com.example.notes'),
    )
  })

  test('the vendor tier is the bare vendor segment', () => {
    expect(normalize(dirs.vendor().durable().path)).toBe(normalize('/b/durable/com.example'))
    expect(dirs.vendor().segment).toBe('com.example')
  })

  test('a standalone tool gets its own root and no vendor segment', () => {
    // The whole point: a general tool installed in someone else's repository
    // must not write under the vendor's namespace.
    const tier = dirs.standalone('devtool')
    expect(tier.segment).toBe('devtool')
    expect(tier.segment).not.toContain(VENDOR)
    expect(normalize(tier.config().path)).toBe(normalize('/b/config/devtool'))
    expect(normalize(tier.durable().path)).toBe(normalize('/b/durable/devtool'))
    expect(normalize(tier.runtime().path)).toBe(normalize('/b/durable/run/devtool'))
  })

  test('kind names the constructor that produced the tier', () => {
    expect(dirs.vendor().kind).toBe('vendor')
    expect(dirs.suite('notes').kind).toBe('suite')
    expect(dirs.standalone('devtool').kind).toBe('standalone')
    expect(TIER_KINDS).toEqual(['vendor', 'suite', 'standalone'])
  })

  test('a suite path scoped by content root, then app', () => {
    const dir = dirs.suite('notes').cache().scoped('vaults', 'vault-7kq2p').app('vault-search')
    expect(normalize(dir.path)).toBe(
      normalize('/b/cache/com.example.notes/vaults/vault-7kq2p/vault-search'),
    )
    expect(dir.relative).toBe('com.example.notes/vaults/vault-7kq2p/vault-search')
  })

  test('home() names the same six homes dynamically', () => {
    const tier = dirs.suite('notes')
    expect(tier.home('cache').path).toBe(tier.cache().path)
    expect(tier.home('runtime').path).toBe(tier.runtime().path)
  })

  test('toString is the absolute path', () => {
    expect(normalize(`${dirs.vendor().logs()}`)).toBe(normalize('/b/logs/com.example'))
  })
})

describe('scratch', () => {
  test('scratch is the bare platform temp root, untiered', () => {
    expect(normalize(dirs.scratch().path)).toBe(normalize('/b/scratch'))
    expect(dirs.scratch().relative).toBe('')
    expect(dirs.scratch().path).not.toContain(VENDOR)
  })

  test('it narrows like any other directory', () => {
    expect(normalize(dirs.scratch().app('vault-sync').path)).toBe(
      normalize('/b/scratch/vault-sync'),
    )
    expect(dirs.scratch().scoped('vaults', 'v7').app('vault-sync').relative).toBe(
      'vaults/v7/vault-sync',
    )
  })

  test('scratch is not the runtime home — different lifetimes', () => {
    // A pidfile outlives the call and describes a live process; a scratch
    // file does not outlive the call at all.
    expect(dirs.scratch().path).not.toBe(dirs.vendor().runtime().path)
    expect(BASES.scratch).not.toBe(BASES.runtime)
  })
})

describe('tiers do not merge', () => {
  test('vendor and suite are different addresses in the same home', () => {
    expect(dirs.vendor().durable().path).not.toBe(dirs.suite('notes').durable().path)
  })

  test('a suite key and the same standalone name are different addresses', () => {
    expect(dirs.suite('devtool').durable().path).not.toBe(dirs.standalone('devtool').durable().path)
  })

  test('there is no API that reads two tiers at once', () => {
    // The absence is the contract. A reader that wants both looks up both
    // deliberately, per file, at its own call site.
    const tier = dirs.suite('notes') as unknown as Record<string, unknown>
    expect(tier['merge']).toBeUndefined()
    expect(tier['resolve']).toBeUndefined()
    expect((dirs as unknown as Record<string, unknown>)['lookup']).toBeUndefined()
  })
})

describe('segment validation', () => {
  const rejected = [
    '',
    'a/b',
    'a\\b',
    '..',
    'a..b',
    '.hidden',
    '-lead',
    'two words',
    'a:b',
    '~root',
  ]

  test('suite key, standalone name, scope kind, scope key and app share one rule', () => {
    for (const bad of rejected) {
      expect(() => dirs.suite(bad)).toThrow(TieredDirsError)
      expect(() => dirs.standalone(bad)).toThrow(TieredDirsError)
      expect(() => dirs.suite('notes').cache().app(bad)).toThrow(TieredDirsError)
      expect(() => dirs.suite('notes').cache().scoped(bad, 'ok')).toThrow(TieredDirsError)
      expect(() => dirs.suite('notes').cache().scoped('ok', bad)).toThrow(TieredDirsError)
    }
  })

  test('the message names the argument that failed', () => {
    expect(() => dirs.suite('notes').cache().scoped('vaults', '../etc')).toThrow(
      /invalid scope key "\.\.\/etc"/,
    )
    expect(() => dirs.suite('notes').cache().scoped('../etc', 'ok')).toThrow(
      /invalid scope kind key/,
    )
    expect(() => dirs.suite('notes').cache().app('')).toThrow(/invalid app key ""/)
    expect(() => dirs.suite('')).toThrow(/invalid suite key ""/)
    expect(() => dirs.standalone('')).toThrow(/invalid standalone key ""/)
  })

  test('ordinary slugs pass', () => {
    for (const ok of ['notes', 'vault-search', 'repo_2.1-beta', 'Vault-7KQ2P', 'a']) {
      expect(() => dirs.suite('notes').cache().app(ok)).not.toThrow()
    }
    for (const near of ['states', 'log', 'runs', 'run-1', 'state.d']) {
      expect(() => dirs.standalone(near)).not.toThrow()
    }
  })
})

describe('reserved names', () => {
  const RESERVED = ['state', 'logs', 'run', 'State', 'LOGS', 'Run']

  test('state, logs and run are refused in any case, the vendor included', () => {
    for (const name of RESERVED) {
      expect(() => new TieredDirs(name, BASES)).toThrow(TieredDirsError)
      expect(() => dirs.standalone(name)).toThrow(/and not state, logs or run/)
      expect(() => dirs.vendor().cache().app(name)).toThrow(TieredDirsError)
    }
  })

  /** The Windows layout: state under the cache base, logs and runtime under durable. */
  const windows: BaseDirs = {
    durable: join('/roaming'),
    config: join('/roaming'),
    cache: join('/local'),
    state: join('/local', 'state'),
    logs: join('/roaming', 'logs'),
    runtime: join('/roaming', 'run'),
    scratch: join('/tmp'),
  }

  test("no tier lands on or above another home's root", () => {
    for (const bases of [windows, rootedBaseDirs('/b')]) {
      const owner = new TieredDirs(VENDOR, bases)
      for (const name of [...RESERVED, 'notes', 'states']) {
        const tiers: Tier[] = []
        const keep = (make: () => Tier): void => {
          try {
            tiers.push(make())
          } catch (err) {
            if (!(err instanceof TieredDirsError)) throw err
          }
        }
        keep(() => new TieredDirs(name, bases).vendor())
        keep(() => owner.suite(name))
        keep(() => owner.standalone(name))
        for (const tier of tiers) {
          for (const home of HOMES) {
            const dir = tier.home(home).path
            for (const other of HOMES) {
              const root = bases[other]
              if (root === bases[home]) continue
              const holds = root === dir || root.startsWith(dir + sep)
              expect(holds, `${name}: ${tier.kind} ${home} holds the ${other} root`).toBe(false)
            }
          }
        }
      }
    }
  })
})

describe('immutability', () => {
  test('builders return new values and never mutate the receiver', () => {
    const root = dirs.suite('notes').cache()
    const a = root.app('vault-search')
    const b = root.app('vault-graph')
    expect(normalize(root.path)).toBe(normalize('/b/cache/com.example.notes'))
    expect(normalize(a.path)).toBe(normalize('/b/cache/com.example.notes/vault-search'))
    expect(normalize(b.path)).toBe(normalize('/b/cache/com.example.notes/vault-graph'))
  })

  test('bases are frozen against a caller mutating them after construction', () => {
    const mutable: { -readonly [K in keyof BaseDirs]: string } = { ...rootedBaseDirs('/b') }
    const own = new TieredDirs(VENDOR, mutable)
    mutable.cache = '/hijacked'
    expect(normalize(own.suite('notes').cache().path)).toBe(normalize('/b/cache/com.example.notes'))
  })
})

describe('vendor bundle assertion', () => {
  test('conformant identifiers pass', () => {
    expect(dirs.isVendorBundleId('com.example')).toBe(true)
    expect(dirs.isVendorBundleId('com.example.family.notes')).toBe(true)
    expect(dirs.isVendorBundleId('com.example.tasks.desktop')).toBe(true)
  })

  test('the legacy prefixes fail, and there is no allowlist for them', () => {
    expect(dirs.isVendorBundleId('com.legacy.notes')).toBe(false)
    expect(dirs.isVendorBundleId('org.other.app')).toBe(false)
  })

  test('the check is a bare prefix test, matching the Rust twin', () => {
    // The Rust side is `debug_assert!(bundle_id.starts_with(VENDOR))`. A
    // tighter dot-boundary rule here would make the two twins disagree about
    // which apps are conformant, which is the drift this package exists to
    // stop.
    expect(dirs.isVendorBundleId('com.exampleorp.app')).toBe(true)
  })

  test('the free function answers as the method does, with no TieredDirs', () => {
    for (const id of ['com.example', 'com.example.notes', 'com.exampleorp.app', 'org.other']) {
      expect(isVendorBundleId(VENDOR, id)).toBe(dirs.isVendorBundleId(id))
    }
    expect(isVendorBundleId('org.other', 'org.other.app')).toBe(true)
  })
})
