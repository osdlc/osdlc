/**
 * Regression tests that the conformance suite cannot express.
 *
 * `packages/conformance/intersect/suite.json` is the conformance suite that
 * this package and the Rust crate `glob-intersect` both run. A fixed bug that
 * fits one input/output case goes there, so both packages fail together. This
 * file holds what a case cannot state: an expectation over a temp directory's
 * absolute paths, and a property checked across a generated set of patterns.
 */
import { describe, expect, test } from 'vitest'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

import * as fs from '../src/fs.ts'
import { intersects, matches, witness, type Options } from '../src/index.ts'

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
  // returns directories as plain paths". Only the absolute form, whose expected
  // values depend on the temp dir, has to live here. A trailing slash survives
  // `join()`, so it gets its own assertion.
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
   * A witness is useless if it matches neither side. This is checked across a
   * generated set of patterns rather than a case list, because the failure is
   * structural: an empty common segment at the end of the path, which `parse`
   * drops. Any pattern whose segments can be empty can cause it.
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

describe('unclosed `{` and `[` finish fast', () => {
  // Without the parse cache, each unclosed `{` re-parses everything after it,
  // so time doubles per brace (about 20 s at 28). Without `lastClose`, each
  // unclosed `[` scans to the end.
  test('28 unclosed `{` against themselves finishes under 1s', () => {
    const p = '{'.repeat(28)
    const t0 = performance.now()
    expect(intersects(p, p)).toBe(true)
    expect(witness(p, p)).toBe(p)
    expect(performance.now() - t0).toBeLessThan(1000)
  })

  test('`{a,` repeated and 20,000 unclosed `[` finish under 1s', () => {
    const t0 = performance.now()
    expect(intersects('{a,'.repeat(28), '{a,'.repeat(28))).toBe(true)
    expect(intersects('['.repeat(20_000), '['.repeat(20_000))).toBe(true)
    expect(performance.now() - t0).toBeLessThan(1000)
  })

  test('unclosed `{` and `[` stay literal', () => {
    expect(matches('{{a', '{{a')).toBe(true)
    expect(matches('[[a', '[[a')).toBe(true)
    expect(matches('{a,b', '{a,b')).toBe(true)
    expect(matches('a', '{a,b')).toBe(false)
  })
})
