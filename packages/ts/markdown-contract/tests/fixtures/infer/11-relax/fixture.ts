import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

import type { InferenceFixture } from '../../../harness.js'
import { asDef, field, isOptional } from '../_assert.js'

const dir = fileURLToPath(new URL('./vault', import.meta.url))

/**
 * 11 · relax (infer-cli). The same shape as the value/order fixtures, but with `--relax`,
 * which inverts generation to the permissive floor:
 *   - `order: none`               — never enforce an order
 *   - `additionalSections: true`  — admit unseen sections
 *   - categorical → `type: string` (rung 6 dropped — `severity` does NOT become an enum)
 *   - non-universal sections stay counted optional (`minContains: 0`)
 * Gated on `infer-cli` because `--relax` is the loosening dial the CLI exposes.
 */
const fixture: InferenceFixture = {
  id: 'infer11',
  title: '--relax → order none, additionalSections, no enums, non-universal still optional',
  component: 'infer-cli',
  opts: { relax: true },
  dir,
  assert: (result) => {
    const def = result.contracts[0]!.def

    // The loosened floor.
    expect(asDef(def).body?.order).toBe('none')
    expect(asDef(def).body?.additionalSections).toBe(true)

    // The categorical field stays a plain string (enum rung dropped under --relax).
    expect(field(def, 'severity')).toMatchObject({ type: 'string' })
    expect(field(def, 'severity')).not.toHaveProperty('enum')

    // Non-universal sections are still optional.
    expect(isOptional(def, 'Context')).toBe(true)
    expect(isOptional(def, 'Notes')).toBe(true)
  },
}

export default fixture
