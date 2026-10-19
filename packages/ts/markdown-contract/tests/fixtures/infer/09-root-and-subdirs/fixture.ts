import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

import type { InferenceFixture } from '../../../harness.js'

const dir = fileURLToPath(new URL('./vault', import.meta.url))

/** Find one inferred contract by its directory-slug name. */
function byName(contracts: { name: string; include: string[] }[], name: string) {
  return contracts.find((c) => c.name === name)
}

/**
 * 09 · root-and-subdirs (infer-meta). `--meta` at the default depth 1 over a tree with
 * markdown directly in the run root AND in subdirectories. The root files form their own
 * root contract with a DIRECT-ONLY glob `*.md` (not `**\/*.md`), so it never overlaps the
 * recursive subdir globs. The
 * accept-by-construction auto-test proves the non-overlap end to end.
 */
const fixture: InferenceFixture = {
  id: 'infer09',
  title: 'Meta config with root files → a root contract plus subdir contracts',
  component: 'infer-meta',
  opts: { meta: true },
  dir,
  assert: (result) => {
    expect(result.mode).toBe('meta')

    // Subdir contracts plus a root contract.
    expect(byName(result.contracts, 'guides')!.include).toEqual(['guides/**/*.md'])
    expect(byName(result.contracts, 'reference')!.include).toEqual(['reference/**/*.md'])

    // Exactly one contract scopes the root files with a direct-only `*.md` glob.
    const rootContract = result.contracts.find((c) => c.include.includes('*.md'))
    expect(rootContract, "a root contract with include ['*.md']").toBeDefined()
    expect(rootContract!.include).toEqual(['*.md'])
  },
}

export default fixture
