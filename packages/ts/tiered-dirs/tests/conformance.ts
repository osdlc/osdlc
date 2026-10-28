/**
 * Runs the tiered-dirs conformance suite's cases against this package.
 *
 * `packages/conformance/tiered-dirs/suite.json` is the family's suite, and this
 * package is its reference implementation. `conformance-write.ts` calls
 * {@link run} to write each case's `expect` or `error`, and
 * `conformance.test.ts` calls it to check them, so the two cannot drift.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  HOMES,
  TieredDirs,
  TieredDirsError,
  envVars,
  overrideVars,
  parseConvention,
  rootedBaseDirs,
  systemBaseDirs,
  xdgBaseDirs,
} from '../src/index.ts'
import type { BaseDirs, Convention, Dir, EnvVars, Home } from '../src/index.ts'

/** The suite file, by its path in the repository. */
export const SUITE_PATH = join(import.meta.dirname, '../../../conformance/tiered-dirs/suite.json')

export interface Case {
  name: string
  input: Record<string, unknown>
  expect?: Record<string, unknown>
  error?: { kind: string; message?: string }
  platforms?: string[]
  skip?: Record<string, string>
}

export interface Suite {
  family: string
  reference: string
  referenceVersion: string
  sections: Record<string, { description: string; cases: Case[] }>
}

/** What a case resolves to: the shape of its `expect`, or its `error`. */
export type Outcome = { expect: Record<string, unknown> } | { error: { kind: string } }

export function readSuite(): Suite {
  return JSON.parse(readFileSync(SUITE_PATH, 'utf8')) as Suite
}

/** The base directories every `resolve` and `scratch` case is stubbed with. */
export const STUB_BASES = rootedBaseDirs('/stub')

/** The home every `env` case resolves under. */
export const ENV_HOME = '/h'

interface Narrowing {
  scope_kind: string | null
  scope_key: string | null
  app: string | null
}

function narrow(dir: Dir, n: Narrowing): Dir {
  let out = dir
  if (n.scope_kind !== null && n.scope_key !== null) out = out.scoped(n.scope_kind, n.scope_key)
  if (n.app !== null) out = out.app(n.app)
  return out
}

interface ResolveInput extends Narrowing {
  vendor: string
  tier: string
  key: string | null
  home: string
}

/** The directory a `resolve` case names. */
export function resolveDir(input: ResolveInput): Dir {
  const dirs = new TieredDirs(input.vendor, STUB_BASES)
  const key = (): string => {
    if (input.key === null) throw new Error(`tier ${input.tier} needs a key`)
    return input.key
  }
  const home = input.home as Home
  switch (input.tier) {
    case 'vendor':
      return narrow(dirs.vendor().home(home), input)
    case 'suite':
      return narrow(dirs.suite(key()).home(home), input)
    case 'standalone':
      return narrow(dirs.standalone(key()).home(home), input)
    default:
      throw new Error(`the suite names a tier this implementation lacks: ${input.tier}`)
  }
}

/** The scratch directory a `scratch` case names. */
export function scratchDir(input: Narrowing & { vendor: string }): Dir {
  return narrow(new TieredDirs(input.vendor, STUB_BASES).scratch(), input)
}

export interface EnvInput {
  env_prefix: string
  convention?: Convention
  env: Record<string, string>
}

/** `env` with only the keys `keep` accepts. */
export function only(
  env: Record<string, string>,
  keep: (key: string) => boolean,
): Record<string, string> {
  return Object.fromEntries(Object.entries(env).filter(([key]) => keep(key)))
}

/**
 * Whether `key` leaves the base directories where a bare system puts them: it
 * is not an override variable, the convention variable, or an `XDG_*` one.
 */
export function bare(vars: EnvVars): (key: string) => boolean {
  return (key) =>
    !overrideVars(vars).includes(key) && key !== vars.convention && !key.startsWith('XDG_')
}

/**
 * The base directories an `env` case resolves to, and a bare system's: the
 * native convention with none of the variables {@link bare} drops.
 */
export function envResolve(input: EnvInput): { bases: BaseDirs; bare: BaseDirs } {
  const vars = envVars(input.env_prefix)
  return {
    bases: systemBaseDirs(vars, {
      env: input.env,
      home: ENV_HOME,
      ...(input.convention === undefined ? {} : { convention: input.convention }),
    }),
    bare: systemBaseDirs(vars, { env: only(input.env, bare(vars)), home: ENV_HOME }),
  }
}

/** The base directories the case's variables move away from a bare system's. */
function envBases(input: EnvInput): Partial<BaseDirs> {
  const { bases, bare: os } = envResolve(input)
  return Object.fromEntries(
    (Object.keys(bases) as (keyof BaseDirs)[])
      .filter((k) => bases[k] !== os[k])
      .map((k) => [k, bases[k]]),
  )
}

/** The `kind` a suite writes for this package's error code. */
function kindOf(err: unknown): string {
  if (!(err instanceof TieredDirsError)) throw err
  return err.code.toLowerCase()
}

/** Every position that validates a segment, so a rejected one fails in each. */
function rejectSegment(value: string): string {
  const dirs = new TieredDirs('com.example', STUB_BASES)
  const cache = dirs.suite('notes').cache()
  const positions: (() => unknown)[] = [
    () => new TieredDirs(value, STUB_BASES),
    () => dirs.suite(value),
    () => dirs.standalone(value),
    () => cache.app(value),
    () => cache.scoped(value, 'v7'),
    () => cache.scoped('vaults', value),
  ]
  const kinds = new Set<string>()
  for (const position of positions) {
    try {
      position()
      kinds.add('accepted')
    } catch (err) {
      kinds.add(kindOf(err))
    }
  }
  if (kinds.size !== 1 || kinds.has('accepted')) {
    throw new Error(
      `${JSON.stringify(value)} is not refused in every position: ${[...kinds].join(', ')}`,
    )
  }
  return [...kinds][0]!
}

function rejectConvention(input: { env_prefix: string; value: string }): string {
  const vars: EnvVars = envVars(input.env_prefix)
  const kinds = new Set<string>()
  for (const position of [
    () => systemBaseDirs(vars, { env: { [vars.convention]: input.value }, home: ENV_HOME }),
    () => parseConvention(input.value),
  ]) {
    try {
      position()
      kinds.add('accepted')
    } catch (err) {
      kinds.add(kindOf(err))
    }
  }
  if (kinds.size !== 1 || kinds.has('accepted')) {
    throw new Error(
      `${JSON.stringify(input.value)} is not refused everywhere: ${[...kinds].join(', ')}`,
    )
  }
  return [...kinds][0]!
}

/** The outcome this package gives for one case of a section. */
export function run(section: string, input: Record<string, unknown>): Outcome {
  switch (section) {
    case 'resolve':
      return { expect: { relative: resolveDir(input as unknown as ResolveInput).relative } }
    case 'scratch':
      return {
        expect: {
          relative: scratchDir(input as unknown as Narrowing & { vendor: string }).relative,
        },
      }
    case 'env':
      return { expect: { bases: envBases(input as unknown as EnvInput) } }
    case 'convention': {
      const { home, env } = input as { home: string; env: Record<string, string> }
      const bases = xdgBaseDirs(home, env)
      return { expect: { bases: Object.fromEntries(HOMES.map((h) => [h, bases[h]])) } }
    }
    case 'rejected_segment':
      return { error: { kind: rejectSegment((input as { value: string }).value) } }
    case 'rejected_convention':
      return { error: { kind: rejectConvention(input as { env_prefix: string; value: string }) } }
    default:
      throw new Error(`the suite has a section this implementation does not know: ${section}`)
  }
}
