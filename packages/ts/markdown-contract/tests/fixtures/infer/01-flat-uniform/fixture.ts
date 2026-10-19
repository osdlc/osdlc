import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

import type { InferenceFixture } from '../../../harness.js'
import { asDef, isRequired, sectionNames } from '../_assert.js'

const dir = fileURLToPath(new URL('./vault', import.meta.url))

/**
 * 01 · flat-uniform (infer-core). Three flat files with identical sections
 * (Summary/Context/Decision/Notes) and identical frontmatter keys (title/status).
 * The tightest accepting contract: every section required, `additionalSections: false`,
 * and both frontmatter keys required.
 */
const fixture: InferenceFixture = {
  id: 'infer01',
  title: 'Flat uniform vault → single contract, all sections required',
  component: 'infer-core',
  dir,
  assert: (result) => {
    expect(result.mode).toBe('single')
    expect(result.contracts).toHaveLength(1)

    const def = result.contracts[0]!.def
    expect(sectionNames(def)).toEqual(['Context', 'Decision', 'Notes', 'Summary'])
    // Every section is universal → required (no `optional`).
    for (const name of ['Summary', 'Context', 'Decision', 'Notes']) {
      expect(isRequired(def, name), name).toBe(true)
    }

    // Nothing unlisted ever appeared → the unknown door is closed.
    expect(asDef(def).body?.additionalSections).toBe(false)

    // Both frontmatter keys appear in every file → both required.
    const properties = asDef(def).frontmatter?.properties ?? {}
    expect(Object.keys(properties).sort()).toEqual(['status', 'title'])
    expect((asDef(def).frontmatter?.required ?? []).sort()).toEqual(['status', 'title'])
  },
}

export default fixture
