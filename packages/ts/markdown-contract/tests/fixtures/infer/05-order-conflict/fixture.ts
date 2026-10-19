import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

import type { InferenceFixture } from '../../../harness.js'
import { asDef } from '../_assert.js'

const dir = fileURLToPath(new URL('./vault', import.meta.url))

/**
 * 05 · order-conflict (infer-core). The two files carry the same sections in opposite
 * order (Context→Summary vs Summary→Context), so no order is consistent with every
 * file — the inferred order is `none`.
 */
const fixture: InferenceFixture = {
  id: 'infer05',
  title: 'Files disagree on order → none',
  component: 'infer-core',
  dir,
  assert: (result) => {
    const def = result.contracts[0]!.def
    expect(asDef(def).body?.order).toBe('none')
  },
}

export default fixture
