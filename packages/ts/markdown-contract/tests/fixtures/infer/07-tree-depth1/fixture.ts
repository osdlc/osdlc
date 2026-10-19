import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

import type { InferenceFixture } from '../../../harness.js'

const dir = fileURLToPath(new URL('./vault', import.meta.url))

/** Find one inferred contract by its directory-slug name. */
function byName(contracts: { name: string; include: string[] }[], name: string) {
  return contracts.find((c) => c.name === name)
}

/**
 * 07 · tree-depth1 (infer-meta). `--meta` at the default depth 1 cuts the tree at the
 * top-level subdirectories: `guides/` and `api/` each become one contract recursive over
 * its subtree. Contracts are named after the directory slug; the globs
 * are `<reldir>/**\/*.md`.
 */
const fixture: InferenceFixture = {
  id: 'infer07',
  title: 'Meta config, depth 1 → one contract per top-level subdir',
  component: 'infer-meta',
  opts: { meta: true },
  dir,
  assert: (result) => {
    expect(result.mode).toBe('meta')

    const names = result.contracts.map((c) => c.name).sort()
    expect(names).toEqual(['api', 'guides'])

    expect(byName(result.contracts, 'guides')!.include).toEqual(['guides/**/*.md'])
    expect(byName(result.contracts, 'api')!.include).toEqual(['api/**/*.md'])
  },
}

export default fixture
