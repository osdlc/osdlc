/**
 * Checks on the package surface:
 *
 *   1. `package.json` exposes exactly the three subpaths `.`, `./segments` and
 *      `./fs`. Each has `types` and `default` conditions that point into `dist/`.
 *   2. Dependency isolation: the `.` and `./segments` entries load no external
 *      runtime dependency, while `./fs` loads `tinyglobby`. The check that fs
 *      does reach `tinyglobby` shows the walker can find a dependency, so the
 *      empty result for the other entries is real.
 *   3. Corpus sweep: no `*.cases.json` case is left `pending: true`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, test } from 'vitest'

import { loadCaseFiles } from './fixtures.ts'
import { importsGlobber, reachableBareImports } from './import-graph.ts'

const pkgDir = resolve(import.meta.dirname, '..')
const entry = (rel: string): string => resolve(pkgDir, rel)

/** The three subpaths the package must expose, in canonical order. */
const REQUIRED_SUBPATHS = ['.', './segments', './fs'] as const

interface PackageJson {
  exports: Record<string, Record<string, unknown>>
}

function readPackageJson(): PackageJson {
  return JSON.parse(readFileSync(entry('package.json'), 'utf8')) as PackageJson
}

/** The source file behind a `dist/` target: `./dist/segments/index.js` -> `src/segments/index.ts`. */
function sourceOf(distTarget: unknown): string {
  return String(distTarget)
    .replace(/^\.\/dist\//, 'src/')
    .replace(/\.(d\.ts|js)$/, '.ts')
}

describe('package exports', () => {
  const pkg = readPackageJson()

  test('exports declares exactly the three required subpaths', () => {
    expect(Object.keys(pkg.exports).sort()).toEqual([...REQUIRED_SUBPATHS].sort())
  })

  for (const subpath of REQUIRED_SUBPATHS) {
    test(`subpath "${subpath}" has types and default conditions into dist/ and no others`, () => {
      const condition = pkg.exports[subpath]!
      expect(Object.keys(condition).sort()).toEqual(['default', 'types'])
      const types = String(condition['types'])
      const def = String(condition['default'])
      expect(types.startsWith('./dist/')).toBe(true)
      expect(types.endsWith('.d.ts')).toBe(true)
      expect(def.startsWith('./dist/')).toBe(true)
      expect(def.endsWith('.js')).toBe(true)
    })

    test(`subpath "${subpath}" has a source file behind it`, () => {
      const condition = pkg.exports[subpath]!
      expect(existsSync(entry(sourceOf(condition['default'])))).toBe(true)
      expect(sourceOf(condition['types'])).toBe(sourceOf(condition['default']))
    })
  }
})

describe('dependency isolation', () => {
  const pkg = readPackageJson()
  const sourceFile = (subpath: string): string => entry(sourceOf(pkg.exports[subpath]!['default']))

  test('the `.` and `./segments` entries pull no external runtime dependency', () => {
    const core = new Set<string>([
      ...reachableBareImports(sourceFile('.')),
      ...reachableBareImports(sourceFile('./segments')),
    ])
    expect([...core]).toEqual([])
  })

  test('the `./fs` entry pulls the globber (detector is real)', () => {
    expect(importsGlobber(reachableBareImports(sourceFile('./fs')))).toBe(true)
  })
})

describe('corpus sweep: no case left pending', () => {
  for (const cf of loadCaseFiles()) {
    test(`${cf.file} has no pending cases`, () => {
      const pending = cf.cases.filter((c) => c.pending === true).map((c) => c.name)
      expect(pending).toEqual([])
    })
  }
})
