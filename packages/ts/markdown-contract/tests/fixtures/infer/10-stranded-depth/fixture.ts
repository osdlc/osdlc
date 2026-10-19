import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

import type { InferenceFixture } from '../../../harness.js'

const dir = fileURLToPath(new URL('./vault', import.meta.url))

/**
 * 10 · stranded-depth (infer-meta). `--meta --depth 2` over a tree where `api/overview.md`
 * sits at depth 1 — between the root and the depth-2 cut. Uniform-depth grouping refuses to
 * wrap it in a nested parent contract (that is exactly the parent/child split uniform depth
 * avoids); instead the tool WARNS and suggests a shallower `--depth`. The
 * stranded file matches no rule, so accept-by-construction still holds (it is simply skipped).
 */
const fixture: InferenceFixture = {
  id: 'infer10',
  title: 'Depth-2 cut with a file stranded at depth 1 → warning, no nested contracts',
  component: 'infer-meta',
  opts: { meta: true, depth: 2 },
  dir,
  assert: (result) => {
    // The stranded file is reported, not silently nested.
    expect(result.warnings.length).toBeGreaterThan(0)

    // No generated contract is an ancestor of another (uniform depth — never nested).
    const globs = result.contracts.flatMap((c) => c.include)
    const prefixes = globs.map((g) => g.replace(/\/?\*\*?\/\*\.md$/, '').replace(/\/?\*\.md$/, ''))
    for (let i = 0; i < prefixes.length; i++) {
      for (let j = 0; j < prefixes.length; j++) {
        if (i === j) continue
        const a = prefixes[i]!
        const b = prefixes[j]!
        // `a` must not be a strict directory-prefix of `b` (which would make a/b nested).
        if (a !== '') {
          expect(b === a || b.startsWith(`${a}/`), `${a} is an ancestor of ${b}`).toBe(false)
        }
      }
    }
  },
}

export default fixture
