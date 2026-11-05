/**
 * Checks on the `./fs` entry that the conformance suite cannot state. The fs
 * cases themselves are in `packages/conformance/intersect/suite.json` and run
 * through `conformance.test.ts`.
 */
import { describe, expect, test } from 'vitest'
import { resolve } from 'node:path'

import { importsGlobber, reachableBareImports } from './import-graph.ts'

/**
 * Dependency isolation. Read each entry's import graph from this package's
 * source files and collect every bare (non-relative) module specifier. The
 * core entries must not reach `tinyglobby`. The fs entry must. That second
 * check shows the walker can find `tinyglobby`, so its absence from the core
 * is a real result. Fails as soon as any core file imports `tinyglobby`.
 */
describe('dependency isolation (globber reaches fs only)', () => {
  const here = import.meta.dirname // .../intersect/tests
  const pkgDir = resolve(here, '..')
  const entry = (rel: string): string => resolve(pkgDir, rel)

  test('core entries (index, segments) do not reach the globber', () => {
    const core = new Set<string>([
      ...reachableBareImports(entry('src/index.ts')),
      ...reachableBareImports(entry('src/segments/index.ts')),
    ])
    expect(importsGlobber(core)).toBe(false)
  })

  test('fs entry does reach the globber (detector is real)', () => {
    expect(importsGlobber(reachableBareImports(entry('src/fs.ts')))).toBe(true)
  })
})
