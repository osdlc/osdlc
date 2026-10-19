/**
 * Integration harness for the Intersect fs layer (`intersect/fs`).
 *
 * The fs cases in `fixtures/fs.cases.json` are disk-backed: each declares a
 * `tree` of relative file paths. For each case this harness materializes that
 * tree under a FRESH temp dir (system `os.tmpdir()`, never the repo), runs the
 * op with `cwd` pointed at the temp dir, asserts the result equals the case's
 * expected relative paths (order-insensitively), and removes the temp dir in a
 * `finally`. It is the ONLY place fs cases run — the generic harness
 * (`fixtures.test.ts`) skips the `fs.*` namespace, so nothing is double-run.
 */
import { describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

import * as fs from '../fs.ts'
import type { Patterns } from '../index.ts'
import { effectiveOp, loadCaseFiles, type Case } from '../fixtures.ts'
import { importsGlobber, reachableBareImports } from './import-graph.ts'

/** Create every file in `tree` (as empty files) under `root`, making parent dirs. */
async function materialize(root: string, tree: readonly string[]): Promise<void> {
  for (const rel of tree) {
    const abs = join(root, rel)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, '')
  }
}

/** Run the fs op a case targets against a temp `cwd`. */
async function runFsCase(op: string, c: Case, cwd: string): Promise<string[]> {
  const opts: fs.FsOptions = { ...(c.opts as fs.FsOptions | undefined), cwd }
  switch (op) {
    case 'fs.filesInScope':
      return fs.filesInScope(c.patterns as Patterns, opts)
    case 'fs.resolveIntersection':
      return fs.resolveIntersection(c.a as Patterns, c.b as Patterns, opts)
    default:
      throw new Error(`fs.test.ts: unhandled fs op ${op}`)
  }
}

const sorted = (xs: readonly string[]): string[] => [...xs].sort()

for (const cf of loadCaseFiles()) {
  const fsCases = cf.cases.filter((c) => effectiveOp(cf, c).startsWith('fs.'))
  if (fsCases.length === 0) continue

  describe(`${cf.file} [integration]`, () => {
    for (const c of fsCases) {
      const op = effectiveOp(cf, c)
      const tree = c.tree as string[] | undefined
      const body = async (): Promise<void> => {
        if (!Array.isArray(tree)) {
          throw new Error(`fs case "${c.name}" must declare a "tree" of file paths`)
        }
        const root = await mkdtemp(join(tmpdir(), 'intersect-fs-'))
        try {
          await materialize(root, tree)
          const result = await runFsCase(op, c, root)
          expect(sorted(result)).toEqual(sorted(c.expect as string[]))
        } finally {
          await rm(root, { recursive: true, force: true })
        }
      }
      if (c.pending) test.todo(c.name, body)
      else test(c.name, body)
    }
  })
}

/**
 * Dependency-isolation (AC-3). Statically resolve the transitive import graph of
 * each package entry by reading the source files this package owns, and collect
 * every bare (non-relative) module specifier. The core entries must NOT reach
 * `tinyglobby`; the fs entry MUST — that positive assertion proves the walker
 * can detect the globber, so the core's absence is a real result, not a broken
 * detector. Fails the moment any core file adds an import of `tinyglobby`.
 */
describe('dependency isolation (globber reaches fs only)', () => {
  const here = import.meta.dirname // .../intersect/tests
  const pkgDir = resolve(here, '..')
  const entry = (rel: string): string => resolve(pkgDir, rel)

  test('core entries (index, segments) do not reach the globber', () => {
    const core = new Set<string>([
      ...reachableBareImports(entry('index.ts')),
      ...reachableBareImports(entry('segments/index.ts')),
    ])
    expect(importsGlobber(core)).toBe(false)
  })

  test('fs entry does reach the globber (detector is real)', () => {
    expect(importsGlobber(reachableBareImports(entry('fs.ts')))).toBe(true)
  })
})
