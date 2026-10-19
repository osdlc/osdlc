/**
 * Regression pins that the shared corpus cannot express.
 *
 * `fixtures/*.cases.json` is the cross-tier conformance spec — the Rust peer
 * `include_str!`s the same files (packages/rust/intersect/tests/conformance.rs)
 * — and every fixed defect that IS a single input/output case is pinned there,
 * so both tiers go red together. What lands here instead is what a case cannot
 * state: an expectation over a temp directory's absolute paths, and a property
 * swept across a generated pattern space.
 */
import { describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import * as fs from '../fs.ts'
import { matches, witness, type Options } from '../index.ts'

/** Materialize `tree` (empty files) under a fresh temp dir, run `body`, then remove it. */
async function withTree(
  tree: readonly string[],
  body: (root: string) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), 'intersect-regression-'))
  try {
    for (const rel of tree) {
      const abs = join(root, rel)
      await mkdir(dirname(abs), { recursive: true })
      await writeFile(abs, '')
    }
    await body(root)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

describe("fs: onlyFiles:false does not leak the globber's trailing slash", () => {
  // The relative form of this is corpus case "filesInScope: onlyFiles:false
  // returns directories as plain paths"; only the absolute form (whose expected
  // values are the temp dir's own) has to live here — a trailing slash survives
  // `join()`, so it is worth its own assertion.
  test('an absolutized directory entry has no trailing separator', async () => {
    await withTree(['src/api/user.ts'], async (cwd) => {
      expect(await fs.filesInScope(['src/**'], { cwd, onlyFiles: false, absolute: true })).toEqual([
        join(cwd, 'src'),
        join(cwd, 'src/api'),
        join(cwd, 'src/api/user.ts'),
      ])
    })
  })
})

describe('witness: the returned path matches both sides', () => {
  /**
   * The property the primitive exists for: "these overlap at X" is worthless if
   * X matches neither side. Swept across a generated space rather than a case
   * list, because the failures were structural — an empty common segment lands
   * at the end of the path, where `parse` normalizes it away — and any pattern
   * whose segments can be empty reproduces it.
   */
  test('no pair in a metacharacter-dense pattern space yields a lying witness', () => {
    const tokens = ['*', '**', 'a', '.a', '{,a}', '{,.a}', '*.env', '?', '']
    const patterns = [...tokens, ...tokens.flatMap((x) => tokens.map((y) => `${x}/${y}`))]
    const optionSets: Options[] = [
      {},
      { dot: true },
      { caseInsensitive: true },
      { globstarMatchesZero: false },
    ]
    const lies: string[] = []
    for (const opts of optionSets) {
      for (const a of patterns) {
        for (const b of patterns) {
          const w = witness(a, b, opts)
          if (w === null) continue
          if (!matches(w, a, opts) || !matches(w, b, opts)) {
            lies.push(`witness(${a}, ${b}, ${JSON.stringify(opts)}) = ${JSON.stringify(w)}`)
          }
        }
      }
    }
    expect(lies).toEqual([])
  })
})
