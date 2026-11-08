/**
 * `inlineTags` on a synthetic note, in each dialect, with and without link
 * syntax. Run with `pnpm run bench`.
 */
import { describe, test } from 'vitest'

import { TAG_DIALECTS, inlineTags } from '../src/index.ts'
import { noteBody } from './corpus.ts'

const BODIES = { 'no links': noteBody(8, false), 'with links': noteBody(8, true) }

for (const [shape, body] of Object.entries(BODIES)) {
  describe(`inlineTags, 8 KB note, ${shape}`, () => {
    for (const dialect of TAG_DIALECTS) {
      test(dialect, async ({ bench }) => {
        await bench(dialect, () => {
          inlineTags(body, dialect)
        }).run()
      })
    }
  })
}
