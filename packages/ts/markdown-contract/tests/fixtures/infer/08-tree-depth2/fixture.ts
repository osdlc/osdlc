import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

import type { InferenceFixture } from '../../../harness.js'

const dir = fileURLToPath(new URL('./vault', import.meta.url))

/** Find one inferred contract by its directory-slug name. */
function byName(contracts: { name: string; include: string[] }[], name: string) {
  return contracts.find((c) => c.name === name)
}

/**
 * 08 · tree-depth2 (infer-meta). `--meta --depth 2`: every file lives at depth 2
 * (`api/v1`, `api/v2`, `web/v1`), so each depth-2 directory becomes one contract. The
 * name is the FULL relative-path slug (`api-v1`, `api-v2`, `web-v1`) — inherently
 * collision-free, no de-collision step. The
 * globs are recursive over each subtree (`api/v1/**\/*.md`).
 */
const fixture: InferenceFixture = {
  id: 'infer08',
  title: 'Meta config, depth 2 → full-path-slug names, no collisions',
  component: 'infer-meta',
  opts: { meta: true, depth: 2 },
  dir,
  assert: (result) => {
    expect(result.mode).toBe('meta')

    const names = result.contracts.map((c) => c.name).sort()
    expect(names).toEqual(['api-v1', 'api-v2', 'web-v1'])

    expect(byName(result.contracts, 'api-v1')!.include).toEqual(['api/v1/**/*.md'])
    expect(byName(result.contracts, 'api-v2')!.include).toEqual(['api/v2/**/*.md'])
    expect(byName(result.contracts, 'web-v1')!.include).toEqual(['web/v1/**/*.md'])
  },
}

export default fixture
