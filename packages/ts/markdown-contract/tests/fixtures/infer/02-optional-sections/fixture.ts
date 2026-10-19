import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

import type { InferenceFixture } from '../../../harness.js'
import { isOptional, isRequired, sectionNames } from '../_assert.js'

const dir = fileURLToPath(new URL('./vault', import.meta.url))

/**
 * 02 · optional-sections (infer-core). Four files: Summary and Decision appear in EVERY
 * file (→ required); Context and Notes appear in only some (→ `optional: true`). The
 * contract lists the group's complete observed vocabulary.
 */
const fixture: InferenceFixture = {
  id: 'infer02',
  title: 'Partial sections → universal required, the rest optional',
  component: 'infer-core',
  dir,
  assert: (result) => {
    const def = result.contracts[0]!.def
    expect(sectionNames(def)).toEqual(['Context', 'Decision', 'Notes', 'Summary'])

    // Universal core → required.
    expect(isRequired(def, 'Summary')).toBe(true)
    expect(isRequired(def, 'Decision')).toBe(true)

    // Present in only some files → optional.
    expect(isOptional(def, 'Context')).toBe(true)
    expect(isOptional(def, 'Notes')).toBe(true)
  },
}

export default fixture
