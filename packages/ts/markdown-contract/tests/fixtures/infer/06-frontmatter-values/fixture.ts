import { fileURLToPath } from 'node:url'

import { expect } from 'vitest'

import type { InferenceFixture } from '../../../harness.js'
import { field } from '../_assert.js'

const dir = fileURLToPath(new URL('./vault', import.meta.url))

/**
 * 06 · frontmatter-values (infer-values). Six files whose frontmatter exercises the whole
 * value ladder:
 *   - `kind`     uniform "policy"                       → const
 *   - `version`  all integers                           → number (int)
 *   - `active`   all booleans                           → boolean
 *   - `tags`     all arrays                             → array
 *   - `created`  all ISO dates                          → format: date
 *   - `severity` categorical (2 distinct, < half of 6) → enum
 *   - `title`    all-distinct free-form                 → string
 */
const fixture: InferenceFixture = {
  id: 'infer06',
  title: 'Frontmatter value-type ladder: const/number/boolean/array/format/enum/string',
  component: 'infer-values',
  dir,
  assert: (result) => {
    const def = result.contracts[0]!.def

    // Rung 1 — uniform → const.
    expect(field(def, 'kind')).toEqual({ const: 'policy' })

    // Rung 2 — all integers → integer.
    expect(field(def, 'version')).toMatchObject({ type: 'integer' })

    // Rung 3 — all booleans → boolean.
    expect(field(def, 'active')).toMatchObject({ type: 'boolean' })

    // Rung 4 — all arrays → array.
    expect(field(def, 'tags')).toMatchObject({ type: 'array' })

    // Rung 5 — all ISO dates → format: date.
    expect(field(def, 'created')).toMatchObject({ type: 'string', format: 'date' })

    // Rung 6 — small closed categorical set → enum (observed values, any order).
    const severity = field(def, 'severity') as { enum?: unknown[] }
    expect(severity.enum).toBeDefined()
    expect([...severity.enum!].sort()).toEqual(['high', 'low'])

    // Rung 7 — all-distinct free-form → string (no const/format/enum).
    expect(field(def, 'title')).toMatchObject({ type: 'string' })
    expect(field(def, 'title')).not.toHaveProperty('enum')
    expect(field(def, 'title')).not.toHaveProperty('const')
  },
}

export default fixture
