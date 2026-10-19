import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

import type { InferenceFixture } from '../../../harness.js'
import { asDef } from '../_assert.js'

const dir = fileURLToPath(new URL('./vault', import.meta.url))

/**
 * 03 · order-recognized (infer-core). Every file keeps the relative order
 * Summary < Context < Decision < Notes, but each carries a different subset, so no
 * file is identical and gap-free. The strongest order consistent with every file is
 * therefore `recognized-relative`.
 */
const fixture: InferenceFixture = {
  id: 'infer03',
  title: 'Agreeing relative order, differing subsets → recognized-relative',
  component: 'infer-core',
  dir,
  assert: (result) => {
    const def = result.contracts[0]!.def
    expect(asDef(def).body?.order).toBe('recognized-relative')
  },
}

export default fixture
