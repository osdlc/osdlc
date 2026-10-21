/** The conflict-resolver ladder: which rung claims which path. */

import { describe, expect, test } from 'vitest'

import type { Generator } from '../src/ports.ts'
import {
  generatorNames,
  isLockfile,
  matchRegenerate,
  planPaths,
  rebuildVerbs,
  unclaimed,
  type RegenerateRule,
} from '../src/update/resolvers.ts'

const DOCS: RegenerateRule = {
  paths: ['docs/index.md', 'docs/glossary.md'],
  run: 'make docs',
}
const CODEGEN: RegenerateRule = { paths: ['**/generated/**'], run: 'moon run :codegen' }
const INSTALL = 'bun install'

describe('isLockfile', () => {
  test('matches by basename, at any depth', () => {
    expect(isLockfile('bun.lock')).toBe(true)
    // A monorepo has one per workspace and they are all equally derived.
    expect(isLockfile('apps/web/package-lock.json')).toBe(true)
    expect(isLockfile('crates/core/Cargo.lock')).toBe(true)
  })

  test('a manifest is not its lockfile', () => {
    // Cargo.toml and package.json carry hand-written intent; only the derived
    // file can be thrown away and rebuilt.
    expect(isLockfile('Cargo.toml')).toBe(false)
    expect(isLockfile('package.json')).toBe(false)
  })

  test('a lookalike name is not one', () => {
    expect(isLockfile('bun.lock.bak')).toBe(false)
    expect(isLockfile('my-bun.lock')).toBe(false)
    expect(isLockfile('docs/Cargo.lock.md')).toBe(false)
  })
})

describe('matchRegenerate', () => {
  test('first rule wins', () => {
    const a: RegenerateRule = { paths: ['docs/**'], run: 'first' }
    expect(matchRegenerate('docs/index.md', [a, DOCS])?.run).toBe('first')
  })

  test('a double star spans directories', () => {
    expect(matchRegenerate('packages/x/generated/api.ts', [CODEGEN])).not.toBeNull()
  })

  test('an unmatched path claims nothing', () => {
    expect(matchRegenerate('src/main.ts', [DOCS, CODEGEN])).toBeNull()
  })
})

describe('planPaths', () => {
  test('the built-in lockfile rung outranks a configured rule', () => {
    // Otherwise a broad `**` glob in a project's config would silently take
    // over a case the product already handles correctly.
    const greedy: RegenerateRule = { paths: ['**'], run: 'do-everything' }
    expect(planPaths(['bun.lock'], [greedy], INSTALL)).toEqual([
      { kind: 'lockfile', path: 'bun.lock', run: INSTALL },
    ])
  })

  test('each path lands on exactly one rung', () => {
    const out = planPaths(['bun.lock', 'docs/index.md', 'src/main.ts'], [DOCS], INSTALL)
    expect(out).toEqual([
      { kind: 'lockfile', path: 'bun.lock', run: INSTALL },
      { kind: 'regenerate', path: 'docs/index.md', run: 'make docs' },
      { kind: 'unclaimed', path: 'src/main.ts', why: 'no resolver claims it' },
    ])
  })

  test('no resolver rules still resolves lockfiles, given an install verb', () => {
    expect(planPaths(['Cargo.lock'], [], 'cargo generate-lockfile')[0]!.kind).toBe('lockfile')
  })

  test('a lockfile with no install verb is unclaimed, not guessed at', () => {
    // Taking a side without re-deriving pushes a lockfile that disagrees with
    // its own manifest. Not updating is the better failure.
    const [plan] = planPaths(['bun.lock'], [], null)
    expect(plan).toEqual({
      kind: 'unclaimed',
      path: 'bun.lock',
      why: 'lockfile, but no lockfile_install configured',
    })
  })
})

describe('rebuildVerbs', () => {
  test('one rule claiming several paths runs once', () => {
    // Running a whole-directory generator once per file it owns would be
    // wasted work, and for a tool that rewrites the directory, misleading.
    const plans = planPaths(['docs/index.md', 'docs/glossary.md'], [DOCS], INSTALL)
    expect(rebuildVerbs(plans)).toEqual(['make docs'])
  })

  test('every lockfile in a workspace is one install', () => {
    const plans = planPaths(['bun.lock', 'apps/web/bun.lock'], [], INSTALL)
    expect(rebuildVerbs(plans)).toEqual([INSTALL])
  })

  test('distinct verbs keep first-seen order', () => {
    const plans = planPaths(['packages/x/generated/a.ts', 'docs/index.md'], [DOCS, CODEGEN], null)
    expect(rebuildVerbs(plans)).toEqual(['moon run :codegen', 'make docs'])
  })

  test('an unclaimed path contributes no verb', () => {
    expect(rebuildVerbs(planPaths(['src/main.ts'], [], INSTALL))).toEqual([])
  })
})

describe('unclaimed', () => {
  test('names exactly the paths needing a human, and why', () => {
    const plans = planPaths(['bun.lock', 'src/a.ts'], [], INSTALL)
    expect(unclaimed(plans)).toEqual([{ path: 'src/a.ts', why: 'no resolver claims it' }])
  })

  test('empty when every path is claimed', () => {
    expect(unclaimed(planPaths(['bun.lock', 'docs/index.md'], [DOCS], INSTALL))).toEqual([])
  })
})

describe('generators', () => {
  const SCHEMA: Generator = {
    name: 'schema',
    claims: (p) => p.endsWith('.schema.json'),
    run: () => ({ exitCode: 0, stdout: '', stderr: '' }),
  }

  test('a generator claims a path no configured rule does', () => {
    expect(planPaths(['api.schema.json', 'src/a.ts'], [], null, [SCHEMA])).toEqual([
      { kind: 'generator', path: 'api.schema.json', generator: 'schema' },
      { kind: 'unclaimed', path: 'src/a.ts', why: 'no resolver claims it' },
    ])
  })

  test('a configured rule outranks a generator', () => {
    const rule: RegenerateRule = { paths: ['*.json'], run: 'json-gen' }
    expect(planPaths(['api.schema.json'], [rule], null, [SCHEMA])[0]!.kind).toBe('regenerate')
  })

  test('a generator claiming several paths runs once, and adds no shell verb', () => {
    const plans = planPaths(['a.schema.json', 'b.schema.json'], [], null, [SCHEMA])
    expect(generatorNames(plans)).toEqual(['schema'])
    expect(rebuildVerbs(plans)).toEqual([])
  })
})
