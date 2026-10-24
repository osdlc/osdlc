import { readFileSync } from 'node:fs'
import { join, normalize } from 'node:path'

import { describe, expect, test } from 'vitest'

import {
  HOMES,
  TIER_KINDS,
  TieredDirs,
  TieredDirsError,
  envVars,
  overrideVars,
  parseConvention,
  rootedBaseDirs,
  systemBaseDirs,
  xdgBaseDirs,
} from '../src/index.ts'
import type { BaseDirs, Convention, Dir, Home, TierKind } from '../src/index.ts'

/**
 * The TypeScript side of the shared parity fixture.
 *
 * `packages/rust/tiered-dirs/tests/fixtures/parity.json` is the contract
 * between this package and the Rust `tiered-dirs` crate: same input, same
 * `relative`, byte for byte. Base directories are stubbed so the comparison is
 * about path shape. `env_cases` fix the absolute base directories the override
 * variables resolve to, and `convention_cases` fix the XDG layout under one
 * home. `tests/parity.rs` in the crate runs the same file with the same
 * assertions. A new case goes in the fixture, never in one package's own
 * suite.
 */

interface Narrowing {
  scope_kind: string | null
  scope_key: string | null
  app: string | null
  relative: string
}

interface Case extends Narrowing {
  name: string
  tier: string
  key: string | null
  home: string
}

/** `TieredDirs.scratch()` is untiered and has no home, so its cases carry neither. */
interface ScratchCase extends Narrowing {
  name: string
}

/**
 * Base directories resolved from the environment. `expected` gives absolute
 * paths. A base directory it omits is expected to resolve as it would under
 * the default convention with no override variable set.
 */
interface EnvCase {
  name: string
  /** The constructor's convention. Omitted means the default. */
  convention?: Convention
  env: Record<string, string>
  expected: Partial<BaseDirs>
  /** `expected` holds XDG paths, which a Windows host does not use. */
  windows_native?: boolean
}

/** The XDG layout under `home`, from `XDG_*` variables only. */
interface ConventionCase {
  name: string
  home: string
  env: Record<string, string>
  expected: Omit<BaseDirs, 'scratch'>
}

/** The parity file's top level, as the cases below read it. */
interface Fixture {
  vendor: string
  env_prefix: string
  cases: Case[]
  scratch_cases: ScratchCase[]
  env_cases: EnvCase[]
  convention_cases: ConventionCase[]
  rejected: { name: string; value: string }[]
  rejected_conventions: { name: string; value: string }[]
}

/**
 * The one parity fixture lives in the Rust crate. This suite reads it by its
 * path in the repository, as the crate's own test does.
 */
const FIXTURE_PATH = join(
  import.meta.dirname,
  '../../../rust/tiered-dirs/tests/fixtures/parity.json',
)
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8')) as Fixture

const VENDOR = fixture.vendor
const ENV = envVars(fixture.env_prefix)

/** The Rust twin stubs with `BaseDirs::rooted("/stub")`. Same layout here. */
const BASES = rootedBaseDirs('/stub')

const dirs = new TieredDirs(VENDOR, BASES)
const cases = fixture.cases
const scratchCases = fixture.scratch_cases
const envCases = fixture.env_cases
const conventionCases = fixture.convention_cases

/** Every top-level key the fixture may carry, so a stray one fails. */
const FIXTURE_KEYS = [
  '_comment',
  'vendor',
  'env_prefix',
  'cases',
  'scratch_cases',
  'env_cases',
  'convention_cases',
  'rejected',
  'rejected_conventions',
]
const ENV_CASE_KEYS = ['name', 'convention', 'env', 'expected', 'windows_native']
const NARROWING_KEYS = ['name', 'scope_kind', 'scope_key', 'app', 'relative']
const CASE_KEYS = [...NARROWING_KEYS, 'tier', 'key', 'home']
const CONVENTION_CASE_KEYS = ['name', 'home', 'env', 'expected']
const REJECTED_KEYS = ['name', 'value']

/** The keys of `row` that `allowed` lacks. */
function strayKeys(row: object, allowed: readonly string[]): string[] {
  return Object.keys(row).filter((key) => !allowed.includes(key))
}

function tierOf(c: Case): Dir {
  const key = (): string => {
    if (c.key === null) throw new Error(`${c.name}: tier ${c.tier} needs a key`)
    return c.key
  }
  switch (c.tier) {
    case 'vendor':
      return dirs.vendor().home(c.home as Home)
    case 'suite':
      return dirs.suite(key()).home(c.home as Home)
    case 'standalone':
      return dirs.standalone(key()).home(c.home as Home)
    default:
      throw new Error(`fixture names a tier this twin lacks: ${c.tier}`)
  }
}

/** Narrow a directory by whichever of scope and app the case sets. */
function narrow(dir: Dir, n: Narrowing): Dir {
  let out = dir
  if (n.scope_kind !== null && n.scope_key !== null) {
    out = out.scoped(n.scope_kind, n.scope_key)
  }
  if (n.app !== null) {
    out = out.app(n.app)
  }
  return out
}

/** The four shapes a case can take, derived from which fields are set. */
function shapeOf(n: Narrowing): string {
  const scoped = n.scope_kind !== null
  if (scoped) return n.app === null ? 'scope' : 'scope+app'
  return n.app === null ? 'plain' : 'app'
}

/**
 * `<base>/<relative>`, with an empty `relative` meaning the base itself — the
 * shape `TieredDirs.scratch()` takes before it is narrowed.
 */
function expectedPath(base: string, relative: string): string {
  return relative === '' ? base : join(base, ...relative.split('/'))
}

const SHAPES = ['plain', 'app', 'scope', 'scope+app'] as const

describe('parity fixture', () => {
  test('the fixture env prefix names the variables this suite reads', () => {
    expect(ENV.root).toBe(`${fixture.env_prefix}_ROOT`)
  })

  test('the fixture carries no key this suite does not read', () => {
    expect(strayKeys(fixture, FIXTURE_KEYS)).toEqual([])
    const rows: [readonly object[], readonly string[]][] = [
      [cases, CASE_KEYS],
      [scratchCases, NARROWING_KEYS],
      [envCases, ENV_CASE_KEYS],
      [conventionCases, CONVENTION_CASE_KEYS],
      [fixture.rejected, REJECTED_KEYS],
      [fixture.rejected_conventions, REJECTED_KEYS],
    ]
    for (const [list, allowed] of rows) {
      for (const row of list) expect(strayKeys(row, allowed)).toEqual([])
    }
  })

  test.each(cases.map((c) => [c.name, c] as const))('%s', (_name, c) => {
    const dir = narrow(tierOf(c), c)
    expect(dir.relative).toBe(c.relative)
    expect(dir.path).toBe(expectedPath(BASES[c.home as Home], c.relative))
  })

  test.each(scratchCases.map((c) => [c.name, c] as const))('scratch: %s', (_name, c) => {
    const dir = narrow(dirs.scratch(), c)
    expect(dir.relative).toBe(c.relative)
    expect(dir.path).toBe(expectedPath(BASES.scratch, c.relative))
  })

  // An invariant, not just a shape. A standalone tool installed in a third
  // party's repository must not write under the vendor's directory, and
  // scratch belongs to no vendor at all.
  test('nothing outside the suite carries the vendor segment', () => {
    for (const c of cases.filter((x) => x.tier === 'standalone')) {
      expect(c.relative).not.toContain(VENDOR)
    }
    for (const c of scratchCases) {
      expect(c.relative).not.toContain(VENDOR)
    }
    expect(dirs.standalone('devtool').segment).not.toContain(VENDOR)
  })

  // Coverage, so a new axis value with no case fails here rather than going
  // untested. The Rust crate checks the same combinations over the same file.
  test('every tier x home pair has a case', () => {
    const covered = new Set(cases.map((c) => `${c.tier}/${c.home}`))
    for (const tier of TIER_KINDS) {
      for (const home of HOMES) {
        expect(covered.has(`${tier}/${home}`)).toBe(true)
      }
    }
  })

  test('every tier x shape pair has a case', () => {
    const covered = new Set(cases.map((c) => `${c.tier}/${shapeOf(c)}`))
    for (const tier of TIER_KINDS) {
      for (const shape of SHAPES) {
        expect(covered.has(`${tier}/${shape}`)).toBe(true)
      }
    }
  })

  // Scratch has no tier and no home, so shape is the only axis left to cover.
  test('every scratch shape has a case', () => {
    const covered = new Set(scratchCases.map(shapeOf))
    for (const shape of SHAPES) {
      expect(covered.has(shape)).toBe(true)
    }
  })

  test('the fixture names every tier this twin builds', () => {
    const named = new Set<string>(cases.map((c) => c.tier))
    expect([...named].sort()).toEqual([...TIER_KINDS].sort() as TierKind[])
  })

  // A row that omits a base directory compares it against the resolution
  // under the default convention with every override variable cleared. On
  // Windows a `windows_native` row also clears the convention and `XDG_*`, so
  // the row proves `xdg` is `native` there and `XDG_*` is ignored.
  type Env = Record<string, string | undefined>
  const only = (env: Env, keep: (key: string) => boolean): Env =>
    Object.fromEntries(Object.entries(env).filter(([key]) => keep(key)))
  const unmoved = (key: string): boolean => !overrideVars(ENV).includes(key)
  const noConvention = (key: string): boolean =>
    unmoved(key) && key !== ENV.convention && !key.startsWith('XDG_')
  const hostEnv = only(process.env, unmoved)

  test.each(envCases.map((c) => [c.name, c] as const))('env: %s', (_name, c) => {
    const windowsNative = process.platform === 'win32' && c.windows_native === true
    const bases = systemBaseDirs(ENV, {
      env: { ...hostEnv, ...c.env },
      ...(c.convention === undefined ? {} : { convention: c.convention }),
    })
    const keep = windowsNative ? noConvention : unmoved
    const osDefault = systemBaseDirs(ENV, { env: only({ ...hostEnv, ...c.env }, keep) })
    expect(bases).toEqual({ ...osDefault, ...(windowsNative ? {} : c.expected) })
  })

  test('every override variable has an env case', () => {
    const covered = new Set(envCases.flatMap((c) => Object.keys(c.env)))
    for (const name of [...overrideVars(ENV), ENV.convention]) {
      expect(covered.has(name)).toBe(true)
    }
  })

  test.each(conventionCases.map((c) => [c.name, c] as const))('xdg: %s', (_name, c) => {
    const bases = xdgBaseDirs(c.home, c.env)
    for (const home of HOMES) {
      expect(normalize(bases[home])).toBe(normalize(c.expected[home]))
    }
  })

  test.each(fixture.rejected_conventions.map((r) => [r.name, r.value] as const))(
    'rejected convention: %s',
    (_name, value) => {
      const run = (): BaseDirs =>
        systemBaseDirs(ENV, { env: { [ENV.convention]: value }, home: '/h' })
      expect(run).toThrow(TieredDirsError)
      expect(run).toThrow(`${ENV.convention} must be "native" or "xdg"`)
      expect(run).toThrow(JSON.stringify(value))
      expect(() => parseConvention(value)).toThrow(TieredDirsError)
    },
  )

  // Every rejected segment, in every position that validates one.
  test.each(fixture.rejected.map((r) => [r.name, r.value] as const))(
    'rejected: %s',
    (_name, value) => {
      const cache = dirs.suite('notes').cache()
      expect(() => new TieredDirs(value, BASES)).toThrow(TieredDirsError)
      expect(() => dirs.suite(value)).toThrow(TieredDirsError)
      expect(() => dirs.standalone(value)).toThrow(TieredDirsError)
      expect(() => cache.app(value)).toThrow(TieredDirsError)
      expect(() => cache.scoped(value, 'v7')).toThrow(TieredDirsError)
      expect(() => cache.scoped('vaults', value)).toThrow(TieredDirsError)
    },
  )
})
